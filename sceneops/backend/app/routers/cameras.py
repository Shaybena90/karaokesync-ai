from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db, utcnow
from ..models import Camera, CameraStatus, Channel, Exhibit, User
from ..schemas import CameraIn, CameraOut, CameraUpdate, ExportIn
from ..security import client_ip, require_admin, require_investigator, require_viewer
from ..services.cameras import adapter_for
from ..worker import queue
from .cases import assert_can_edit
from .common import get_or_404
from .jobs import job_out

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("", response_model=list[CameraOut])
def list_cameras(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return list(db.scalars(select(Camera).order_by(Camera.name)).unique())


@router.post("", response_model=CameraOut, status_code=201)
def create_camera(body: CameraIn, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_investigator)):
    data = body.model_dump(exclude={"channels"})
    cam = Camera(**data)
    if body.authorization_ref:
        cam.authorized_by_id, cam.authorized_at = user.id, utcnow()
    if body.clock_offset_seconds:
        cam.clock_offset_recorded_at = utcnow()
    nums = set()
    for ch in body.channels:
        if ch.number in nums:
            raise HTTPException(422, f"ערוץ {ch.number} מופיע יותר מפעם אחת")
        nums.add(ch.number)
        cam.channels.append(Channel(**ch.model_dump()))
    db.add(cam)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "מכשיר בשם זה כבר רשום") from None
    audit.record(db, "camera.create", f"נרשם מכשיר {cam.name}", user=user, entity_type="camera", entity_id=cam.id,
                 details={"endpoint": cam.endpoint, "authorization_ref": cam.authorization_ref}, ip=client_ip(request))
    db.commit()
    return cam


@router.get("/{camera_id}", response_model=CameraOut)
def get_camera(camera_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return get_or_404(db, Camera, camera_id, "המכשיר")


@router.patch("/{camera_id}", response_model=CameraOut)
def update_camera(camera_id: int, body: CameraUpdate, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_investigator)):
    cam = get_or_404(db, Camera, camera_id, "המכשיר")
    changes = body.model_dump(exclude_unset=True, exclude={"channels"})
    for k, v in changes.items():
        setattr(cam, k, v)
    if "authorization_ref" in changes:
        cam.authorized_by_id, cam.authorized_at = (user.id, utcnow()) if changes["authorization_ref"] else (None, None)
    if "clock_offset_seconds" in changes:
        cam.clock_offset_recorded_at = utcnow()
    if body.channels is not None:
        cam.channels.clear()
        db.flush()
        for ch in body.channels:
            cam.channels.append(Channel(**ch.model_dump()))
    audit.record(db, "camera.update", f"עודכן מכשיר {cam.name}", user=user, entity_type="camera", entity_id=cam.id,
                 details={k: str(v) for k, v in changes.items()}, ip=client_ip(request))
    db.commit()
    return cam


@router.delete("/{camera_id}")
def delete_camera(camera_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    cam = get_or_404(db, Camera, camera_id, "המכשיר")
    audit.record(db, "camera.delete", f"נמחק מכשיר {cam.name}", user=user, entity_type="camera", entity_id=cam.id,
                 ip=client_ip(request))
    db.delete(cam)
    db.commit()
    return {"ok": True}


@router.post("/{camera_id}/test", response_model=CameraOut)
def test_camera(camera_id: int, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_investigator)):
    cam = get_or_404(db, Camera, camera_id, "המכשיר")
    res = adapter_for(cam).test_connection(cam)
    cam.last_test_at = utcnow()
    cam.last_test_result = res.message
    cam.status = CameraStatus.online if res.ok else (CameraStatus.error if not res.simulated else CameraStatus.offline)
    if res.ok and res.device_time_offset_seconds is not None:
        cam.clock_offset_seconds = res.device_time_offset_seconds
        cam.clock_offset_recorded_at = utcnow()
    audit.record(db, "camera.test", f"בדיקת חיבור למכשיר {cam.name}: {'הצלחה' if res.ok else 'כשל'}", user=user,
                 entity_type="camera", entity_id=cam.id, details={"simulated": res.simulated, "message": res.message},
                 ip=client_ip(request))
    db.commit()
    return cam


@router.post("/{camera_id}/export")
def export_recordings(camera_id: int, body: ExportIn, request: Request, db: Session = Depends(get_db),
                      user: User = Depends(require_investigator)):
    cam = get_or_404(db, Camera, camera_id, "המכשיר")
    ex = get_or_404(db, Exhibit, body.exhibit_id, "המוצג")
    assert_can_edit(ex.case, user)
    if not cam.authorization_ref:
        raise HTTPException(403, "למכשיר אין אסמכתת הרשאה רשומה – לא ניתן לייצא")
    if body.end <= body.start:
        raise HTTPException(422, "זמן הסיום חייב להיות אחרי זמן ההתחלה")
    if (body.end - body.start).total_seconds() > 6 * 3600:
        raise HTTPException(422, "טווח ייצוא מקסימלי בהדגמה: 6 שעות")
    valid = {c.number for c in cam.channels if c.enabled}
    bad = [c for c in body.channels if c not in valid]
    if bad:
        raise HTTPException(422, f"ערוצים לא קיימים או מושבתים: {bad}")
    if cam.adapter.value != "simulated":
        raise HTTPException(501, "ייצוא אמיתי אינו זמין – נדרשת אינטגרציה מאושרת של מתאם המכשיר")
    job = queue.enqueue(
        db, "camera_export_sim", user=user, title=f"ייצוא הקלטות (סימולציה) – {cam.name}", case_id=ex.case_id,
        exhibit_id=ex.id, camera_id=cam.id, is_simulation=True, ip=client_ip(request),
        params={"channels": sorted(body.channels), "start": body.start.replace(tzinfo=None).isoformat(),
                "end": body.end.replace(tzinfo=None).isoformat(), "authorization_ref": body.authorization_ref,
                "destination": body.destination_note})
    audit.record(db, "camera.export_request", f"בקשת ייצוא (סימולציה) מ-{cam.name}", user=user, entity_type="camera",
                 entity_id=cam.id, details={"channels": body.channels, "start": str(body.start), "end": str(body.end),
                                            "authorization_ref": body.authorization_ref, "job": job.id},
                 ip=client_ip(request))
    db.commit()
    return job_out(db, job)
