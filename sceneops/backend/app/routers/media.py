from __future__ import annotations

import os
import string
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db, utcnow
from ..models import (
    Finding, FindingKind, HashTarget, MediaFile, MediaType, RootKind, User,
)
from ..schemas import FindingOut, FindingReview, FrameIn, MediaOut, WorkingCopyOut
from ..security import (
    PathNotAuthorized, authorized_roots, client_ip, ensure_source_path, is_within, normalize, require_investigator,
    require_viewer, safe_component, storage_path, storage_relative,
)
from ..services import media as M
from .common import get_or_404

router = APIRouter(prefix="/api/media", tags=["media"])


def media_out(m: MediaFile) -> MediaOut:
    out = MediaOut.model_validate(m)
    src = next((h for h in reversed(m.hashes) if h.target == HashTarget.source), None)
    out.source_sha256 = src.value if src else None
    if m.working_copy:
        wc = WorkingCopyOut.model_validate(m.working_copy)
        wc.has_thumbnail, wc.has_proxy = bool(m.working_copy.thumbnail_path), bool(m.working_copy.proxy_path)
        out.working_copy = wc
    else:
        out.working_copy = None
    return out


@router.get("/roots")
def roots(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return [{"path": str(p), "exists": p.is_dir()} for p in authorized_roots(db, RootKind.source)]


@router.get("/browse")
def browse(path: str = Query(..., max_length=1024), db: Session = Depends(get_db),
           _: User = Depends(require_investigator)):
    """עיון בתיקיות בתוך מקורות מורשים בלבד (רשימת תיקיות וספירת קבצים, ללא קריאת תוכן)."""
    try:
        p = ensure_source_path(db, path)
    except PathNotAuthorized as e:
        raise HTTPException(403, str(e)) from None
    if not p.is_dir():
        raise HTTPException(404, "התיקייה לא נמצאה")
    dirs, files, total = [], 0, 0
    try:
        with os.scandir(p) as it:
            for entry in sorted(it, key=lambda e: e.name.lower()):
                if entry.is_symlink():
                    continue
                if entry.is_dir():
                    dirs.append({"name": entry.name, "path": str(Path(entry.path))})
                elif entry.is_file():
                    files += 1
                    total += entry.stat().st_size
    except PermissionError:
        raise HTTPException(403, "אין הרשאת קריאה לתיקייה") from None
    roots_ = authorized_roots(db, RootKind.source)
    parent = str(p.parent) if any(is_within(p.parent, r) for r in roots_) and p not in roots_ else None
    return {"path": str(p), "parent": parent, "dirs": dirs[:500], "file_count": files, "total_bytes": total}


@router.get("/drives")
def drives(db: Session = Depends(get_db), _: User = Depends(require_investigator)):
    """רשימת כוננים מקומיים (Windows) ומצב ההרשאה שלהם. אין גישה לכונן שאינו מורשה."""
    roots_ = authorized_roots(db, RootKind.source)
    out = []
    if sys.platform == "win32":
        import ctypes  # noqa: PLC0415
        kinds = {2: "נשלף", 3: "קבוע", 4: "רשת", 5: "תקליטור"}
        for letter in string.ascii_uppercase:
            root = f"{letter}:\\"
            if os.path.exists(root):
                t = ctypes.windll.kernel32.GetDriveTypeW(root)
                out.append({"path": root, "type": kinds.get(t, "אחר"), "removable": t == 2,
                            "authorized": any(is_within(normalize(root), r) or is_within(r, normalize(root))
                                              for r in roots_)})
    else:
        for base in ("/media", "/mnt"):
            if os.path.isdir(base):
                for d in sorted(os.listdir(base)):
                    full = normalize(os.path.join(base, d))
                    out.append({"path": str(full), "type": "נשלף", "removable": True,
                                "authorized": any(is_within(full, r) for r in roots_)})
    return out


@router.get("", response_model=list[MediaOut])
def list_media(case_id: Optional[int] = None, exhibit_id: Optional[int] = None, source_id: Optional[int] = None,
               q: Optional[str] = Query(None, max_length=200), camera: Optional[str] = None,
               media_type: Optional[MediaType] = None, start: Optional[datetime] = None,
               end: Optional[datetime] = None, has_warnings: bool = False, limit: int = Query(500, le=2000),
               db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(MediaFile)
    if case_id:
        stmt = stmt.where(MediaFile.case_id == case_id)
    if exhibit_id:
        stmt = stmt.where(MediaFile.exhibit_id == exhibit_id)
    if source_id:
        stmt = stmt.where(MediaFile.source_id == source_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(MediaFile.relative_path.ilike(like), MediaFile.codec.ilike(like),
                              MediaFile.camera_label.ilike(like)))
    if camera:
        stmt = stmt.where(MediaFile.camera_label == camera)
    if media_type:
        stmt = stmt.where(MediaFile.media_type == media_type)
    if start:
        stmt = stmt.where(or_(MediaFile.recorded_end.is_(None), MediaFile.recorded_end >= start))
    if end:
        stmt = stmt.where(or_(MediaFile.recorded_start.is_(None), MediaFile.recorded_start <= end))
    rows = list(db.scalars(stmt.order_by(MediaFile.camera_label, MediaFile.recorded_start, MediaFile.relative_path)
                           .limit(limit)).unique())
    if has_warnings:
        rows = [r for r in rows if r.warnings]
    return [media_out(m) for m in rows]


@router.get("/cameras")
def camera_labels(case_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(MediaFile.camera_label, func.count(MediaFile.id)).group_by(MediaFile.camera_label)
    if case_id:
        stmt = stmt.where(MediaFile.case_id == case_id)
    return [{"label": l or "", "count": c} for l, c in db.execute(stmt)]


@router.get("/{media_id}", response_model=MediaOut)
def get_media(media_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return media_out(get_or_404(db, MediaFile, media_id, "קובץ המדיה"))


@router.get("/{media_id}/detail")
def media_detail(media_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    from ..schemas import HashOut  # noqa: PLC0415
    m = get_or_404(db, MediaFile, media_id, "קובץ המדיה")
    findings = db.scalars(select(Finding).where(Finding.media_file_id == m.id).order_by(Finding.media_offset_start))
    return {"media": media_out(m), "hashes": [HashOut.model_validate(h) for h in m.hashes],
            "findings": [FindingOut.model_validate(f) for f in findings], "probe": m.probe,
            "source_path": m.source.path, "frames": _list_frames(m)}


def _frames_dir(m: MediaFile) -> Path | None:
    if not m.working_copy:
        return None
    return storage_path(m.working_copy.path).parent.parent / "frames" / safe_component(Path(m.file_name).stem)


def _list_frames(m: MediaFile) -> list[dict]:
    d = _frames_dir(m)
    if not d or not d.is_dir():
        return []
    return [{"name": f.name, "path": storage_relative(f)} for f in sorted(d.glob("*.jpg"))]


@router.get("/{media_id}/file/{kind}")
def media_file(media_id: int, kind: str, name: Optional[str] = None, db: Session = Depends(get_db),
               _: User = Depends(require_viewer)):
    """הגשת נגזרות מעותק העבודה בלבד (לעולם לא את קובץ המקור)."""
    m = get_or_404(db, MediaFile, media_id, "קובץ המדיה")
    wc = m.working_copy
    if not wc:
        raise HTTPException(404, "אין עותק עבודה לקובץ זה")
    if kind == "thumbnail" and wc.thumbnail_path:
        p, mt = storage_path(wc.thumbnail_path), "image/jpeg"
    elif kind == "proxy" and wc.proxy_path:
        p, mt = storage_path(wc.proxy_path), "video/mp4"
    elif kind == "frame" and name:
        d = _frames_dir(m)
        p, mt = (d / safe_component(name)) if d else Path(""), "image/jpeg"
        if d and not is_within(normalize(p), normalize(d)):
            raise HTTPException(403, "נתיב לא חוקי")
    else:
        raise HTTPException(404, "הקובץ המבוקש אינו זמין")
    if not p.is_file():
        raise HTTPException(404, "הקובץ אינו קיים באחסון")
    return FileResponse(p, media_type=mt)


@router.post("/{media_id}/frames")
def extract_frame(media_id: int, body: FrameIn, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_investigator)):
    m = get_or_404(db, MediaFile, media_id, "קובץ המדיה")
    if not m.working_copy or not m.working_copy.verified:
        raise HTTPException(409, "חילוץ פריים אפשרי רק מעותק עבודה מאומת")
    if m.duration_seconds and body.at_seconds > m.duration_seconds:
        raise HTTPException(422, "הזמן המבוקש חורג מאורך הסרטון")
    d = _frames_dir(m)
    dst = d / f"frame_{body.at_seconds:010.3f}.jpg".replace(".", "_", 1)
    try:
        M.extract_frame(storage_path(m.working_copy.path), dst, body.at_seconds)
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from None
    digest, _ = M.sha256_file(dst)
    audit.record(db, "media.extract_frame", f"חולץ פריים מ-{m.file_name} בזמן {body.at_seconds:.2f} שניות",
                 user=user, entity_type="media", entity_id=m.id,
                 details={"frame": storage_relative(dst), "sha256": digest}, ip=client_ip(request), commit=True)
    return {"name": dst.name, "path": storage_relative(dst), "sha256": digest}


# ---------------------------------------------------------------- timeline & findings
@router.get("/timeline/case/{case_id}")
def timeline(case_id: int, exhibit_id: Optional[int] = None, db: Session = Depends(get_db),
             _: User = Depends(require_viewer)):
    stmt = select(MediaFile).where(MediaFile.case_id == case_id, MediaFile.media_type == MediaType.video)
    if exhibit_id:
        stmt = stmt.where(MediaFile.exhibit_id == exhibit_id)
    lanes: dict[str, list] = {}
    for m in db.scalars(stmt.order_by(MediaFile.recorded_start)).unique():
        lanes.setdefault(m.camera_label or "ללא מצלמה", []).append({
            "media_id": m.id, "file_name": m.file_name,
            "start": m.recorded_start.isoformat() if m.recorded_start else None,
            "end": m.recorded_end.isoformat() if m.recorded_end else None,
            "warnings": len(m.warnings or []),
        })
    fstmt = select(Finding).where(Finding.case_id == case_id)
    if exhibit_id:
        fstmt = fstmt.where(Finding.exhibit_id == exhibit_id)
    findings = [FindingOut.model_validate(f) for f in db.scalars(fstmt.order_by(Finding.start_time))]
    return {"lanes": [{"camera": k, "segments": v} for k, v in sorted(lanes.items())], "findings": findings}


@router.get("/findings/list", response_model=list[FindingOut])
def list_findings(case_id: Optional[int] = None, kind: Optional[FindingKind] = None,
                  media_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(Finding)
    if case_id:
        stmt = stmt.where(Finding.case_id == case_id)
    if kind:
        stmt = stmt.where(Finding.kind == kind)
    if media_id:
        stmt = stmt.where(Finding.media_file_id == media_id)
    return list(db.scalars(stmt.order_by(Finding.start_time, Finding.id).limit(2000)))


@router.patch("/findings/{finding_id}", response_model=FindingOut)
def review_finding(finding_id: int, body: FindingReview, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(require_investigator)):
    f = get_or_404(db, Finding, finding_id, "הממצא")
    f.review_status, f.reviewed_by_id, f.reviewed_at = body.review_status, user.id, utcnow()
    audit.record(db, "finding.review", f"סטטוס בדיקת ממצא #{f.id}: {body.review_status.value}", user=user,
                 entity_type="finding", entity_id=f.id, ip=client_ip(request), commit=True)
    return f
