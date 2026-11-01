"""נתוני הדגמה בדויים. כל השמות, התיקים והמכשירים פיקטיביים לחלוטין.

הפעלה:  python -m app.seed            (אידמפוטנטי – לא ידרוס נתונים קיימים)
         python -m app.seed --no-media (ללא יצירת מדיה סינתטית)
         python -m app.seed --no-jobs  (ללא הוספת משימות הדגמה לתור)
"""
from __future__ import annotations

import argparse
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select

from . import audit
from .config import PROJECT_DIR, get_settings
from .db import SessionLocal, utcnow
from .models import (
    Agent, AgentKind, AuthorizedRoot, Camera, CameraAdapter, CameraStatus, Case, CaseStatus, Channel, CustodyEvent,
    CustodyType, EvidenceSource, Exhibit, ExhibitType, Notification, NotificationLevel, Priority, Role, RoleName,
    RootKind, SourceKind, SystemSetting, User,
)
from .security import hash_password, normalize

DEMO_USERS = [
    ("admin", "חוקר זירה", RoleName.admin, "Admin!2025"),
    ("noa", "נועה ברק (בדוי)", RoleName.investigator, "Invest!2025"),
    ("yoav", "יואב שטרן (בדוי)", RoleName.investigator, "Invest!2025"),
    ("viewer", "צופה הדגמה", RoleName.viewer, "Viewer!2025"),
]

SAMPLE_EVIDENCE = PROJECT_DIR / "sample_data" / "evidence"


def _d(days: float) -> datetime:
    return utcnow() - timedelta(days=days)


def seed(with_media: bool = True, with_jobs: bool = True) -> None:
    from .worker import queue  # noqa: PLC0415
    from .worker.steps import sim_export_root  # noqa: PLC0415
    from .worker.workflows import AGENT_ALLOWED  # noqa: PLC0415

    s = get_settings()
    s.storage_root.mkdir(parents=True, exist_ok=True)
    SAMPLE_EVIDENCE.mkdir(parents=True, exist_ok=True)
    sim_export_root().mkdir(parents=True, exist_ok=True)

    if with_media:
        from .services.media import ffmpeg_available  # noqa: PLC0415
        if ffmpeg_available():
            from .services.samplegen import generate_demo_evidence  # noqa: PLC0415
            made = generate_demo_evidence(SAMPLE_EVIDENCE)
            print(f"מדיית הדגמה סינתטית: נוצרו {len(made)} קבצים ב-{SAMPLE_EVIDENCE}")
        else:
            print("אזהרה: FFmpeg לא נמצא – לא נוצרה מדיית הדגמה. התקינו FFmpeg והריצו שוב.")

    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            print("המסד כבר מאותחל – דילוג על נתוני הדגמה.")
            return
        roles = {}
        for name, label, desc in [(RoleName.admin, "מנהל מערכת", "ניהול מלא, אישורים והגדרות"),
                                  (RoleName.investigator, "חוקר", "ניהול תיקים, מוצגים ועיבוד מדיה"),
                                  (RoleName.viewer, "צופה", "צפייה בלבד")]:
            roles[name] = Role(name=name, label=label, description=desc)
            db.add(roles[name])
        db.flush()
        users = {}
        for username, full, role, pw in DEMO_USERS:
            users[username] = User(username=username, full_name=full, role_id=roles[role].id,
                                   password_hash=hash_password(pw), is_demo=True)
            db.add(users[username])
        db.flush()
        admin, noa, yoav = users["admin"], users["noa"], users["yoav"]

        for key, val, desc in [
            ("gap_threshold_seconds", 5, "סף בשניות לסימון פער הקלטה אפשרי"),
            ("motion_sensitivity", 0.003, "רגישות זיהוי תנועה (יחס פיקסלים משתנים)"),
            ("organization_name", "יחידת חקירות דיגיטליות (הדגמה)", "שם הארגון בדוחות"),
            ("require_remote_approval", True, "משימות מרחוק דורשות אישור מנהל"),
            ("remote_mode", "disabled", "מצב שליטה מרחוק"),
        ]:
            db.add(SystemSetting(key=key, value=val, description=desc))

        for raw in [*s.initial_source_roots.split(";"), str(sim_export_root())]:
            if raw.strip():
                db.add(AuthorizedRoot(path=str(normalize(raw.strip())), kind=RootKind.source,
                                      label="תיקיית הדגמה" if "sample" in raw else "ייצואים מדומים", created_by_id=admin.id))
        db.add(AuthorizedRoot(path=str(normalize(s.storage_root)), kind=RootKind.destination,
                              label="אחסון עותקי עבודה", created_by_id=admin.id))

        cases_data = [
            ("4581/25", "פריצה לחניון מגורים – רחוב הדקל (בדוי)", "איסוף ועיבוד הקלטות ממערכת DVR של בניין מגורים.",
             CaseStatus.in_progress, Priority.high, noa, 2),
            ("4579/25", "גניבת רכב מחניון ציבורי (בדוי)", "ייצוא הקלטות ממצלמות 3–6 בחניון.", CaseStatus.in_progress,
             Priority.medium, yoav, 4),
            ("4577/25", "נזק לרכוש בבית עסק (בדוי)", "ניתוח תנועה בווידאו ממצלמת כניסה.", CaseStatus.open,
             Priority.medium, noa, 6),
            ("4570/25", "התפרצות למחסן – אזור תעשייה (בדוי)", "שני כוננים נשלפים מהמקום.", CaseStatus.open,
             Priority.critical, yoav, 9),
            ("4566/25", "תאונת פגע וברח – צומת (בדוי)", "בקשת הקלטות ממצלמות עירוניות (בהמתנה לאישור).",
             CaseStatus.pending_review, Priority.high, noa, 12),
            ("4561/25", "אירוע ונדליזם בגן ציבורי (בדוי)", "תיק סגור – לבדיקת ארכיון.", CaseStatus.closed,
             Priority.low, yoav, 30),
            ("4555/25", "חשד לזיוף חותמות זמן (בדוי)", "בדיקת שלמות ועקביות זמנים בהקלטות.", CaseStatus.open,
             Priority.medium, admin, 15),
        ]
        cases = {}
        for ref, title, desc, st, pr, inv, ago in cases_data:
            c = Case(reference=ref, title=title, description=desc, status=st, priority=pr, assigned_to_id=inv.id,
                     opened_at=_d(ago), incident_date=_d(ago + 1), created_by_id=admin.id, is_demo=True,
                     notes="נתוני הדגמה בדויים.", closed_at=_d(ago - 5) if st == CaseStatus.closed else None)
            db.add(c)
            cases[ref] = c
        db.flush()

        exhibits_data = [
            ("4581/25", "001", "ייצוא DVR-03 – מצלמות חניון", ExhibitType.dvr, "DVR-03 (8 ערוצים)",
             "חדר תקשורת, קומת קרקע", "ייצוא קבצים מקומי מה-DVR לכונן ייעודי"),
            ("4581/25", "002", "כונן USB עם קבצי וידאו", ExhibitType.removable, "כונן USB 64GB",
             "משרד ועד הבית", "מסירה על ידי נציג ועד הבית"),
            ("4579/25", "001", "DVR חניון ציבורי – מצלמות 3–6", ExhibitType.dvr, "NVR-07 (16 ערוצים)",
             "עמדת שמירה בחניון", "ייצוא מדומה (הדגמה)"),
            ("4577/25", "004", "קבצי וידאו ממצלמת כניסה", ExhibitType.folder, "מחשב בית העסק",
             "חנות – קומת רחוב", "העתקת תיקייה"),
            ("4570/25", "001", "כונן נשלף A", ExhibitType.storage_drive, "HDD 1TB", "מחסן 12", "תפיסה"),
            ("4555/25", "001", "תיקיית הקלטות לבדיקת זמנים", ExhibitType.folder, "DVR-03 (עותק)",
             "מעבדה", "העתקה מאומתת"),
        ]
        exhibits = {}
        for ref, ident, label, typ, dev, loc, method in exhibits_data:
            e = Exhibit(case_id=cases[ref].id, identifier=ident, label=label, exhibit_type=typ, source_device=dev,
                        location=loc, acquisition_method=method, acquired_at=cases[ref].opened_at + timedelta(hours=3),
                        acquired_by_id=cases[ref].assigned_to_id, storage_reference=f"כספת מוצגים – מדף {ident}")
            db.add(e)
            exhibits[(ref, ident)] = e
        db.flush()
        for (ref, ident), e in exhibits.items():
            db.add(CustodyEvent(exhibit_id=e.id, event_type=CustodyType.received, description="המוצג התקבל ונרשם",
                                from_party="יחידת שטח (בדוי)", to_party="מעבדת מדיה", occurred_at=e.acquired_at,
                                recorded_by_id=e.acquired_by_id, location=e.location))
            db.add(CustodyEvent(exhibit_id=e.id, event_type=CustodyType.stored, description="אוחסן בכספת מוצגים",
                                to_party="אחראי מוצגים", occurred_at=e.acquired_at + timedelta(hours=1),
                                recorded_by_id=e.acquired_by_id, location=e.storage_reference))

        demo_src = None
        dvr_dir = SAMPLE_EVIDENCE / "DVR-03_export_4581-25"
        if dvr_dir.is_dir():
            demo_src = EvidenceSource(exhibit_id=exhibits[("4581/25", "001")].id, kind=SourceKind.dvr_export,
                                      path=str(normalize(dvr_dir)), label="ייצוא DVR-03 (מדיה סינתטית)",
                                      authorized_by_id=noa.id, authorization_note="צו הדגמה מס' 0000 (בדוי)")
            db.add(demo_src)

        cams_data = [
            ("DVR-01", "Hikvision", "DS-7208HQHI", "DVR", "192.168.10.21", "כניסה ראשית", 8, 0),
            ("DVR-02", "Dahua", "XVR5108HS", "DVR", "192.168.10.22", "חניון תת-קרקעי", 8, 312),
            ("DVR-03", "Hikvision", "DS-7216HUHI", "DVR", "192.168.10.23", "חניון מגורים – הדקל", 8, -45),
            ("NVR-07", "Uniview", "NVR302-16S", "NVR", "10.0.5.7", "חניון ציבורי", 16, 0),
            ("NVR-09", "Axis", "S3008", "NVR", "10.0.5.9", "מרכז מסחרי", 8, 0),
            ("IPC-14", "Hanwha", "XNO-6080R", "IPC", "10.0.6.14", "צומת – מצלמה עירונית", 1, 0),
        ]
        for name, vendor, model, typ, ip, loc, nch, offset in cams_data:
            authorized = name in ("DVR-01", "DVR-02", "DVR-03", "NVR-07")
            cam = Camera(name=name, vendor=vendor, model=model, device_type=typ, endpoint=ip, location=loc,
                         clock_offset_seconds=offset, clock_offset_recorded_at=_d(2) if offset else None,
                         adapter=CameraAdapter.simulated if name != "NVR-09" else CameraAdapter.onvif_profile_g,
                         status=CameraStatus.online if authorized else CameraStatus.unknown,
                         authorization_ref="הרשאת בעל המערכת – טופס 12 (בדוי)" if authorized else "",
                         authorized_by_id=noa.id if authorized else None, authorized_at=_d(3) if authorized else None,
                         credential_ref="כספת סיסמאות ארגונית – לא נשמר במערכת" if authorized else "",
                         case_id=cases["4581/25"].id if name == "DVR-03" else (cases["4579/25"].id if name == "NVR-07" else None),
                         last_test_at=_d(1) if authorized else None,
                         last_test_result="[סימולציה] המכשיר הגיב" if authorized else "",
                         notes="מכשיר הדגמה בדוי. כתובות IP פרטיות לדוגמה בלבד.")
            for i in range(1, nch + 1):
                cam.channels.append(Channel(number=i, name=f"מצלמה {i:02d}", resolution="1920x1080" if i % 2 else "1280x720"))
            db.add(cam)

        demo_secret = secrets.token_urlsafe(32)
        from .agent.protocol import derive_key  # noqa: PLC0415
        db.add(Agent(name="סוכן הדגמה מקומי", kind=AgentKind.remote_agent, agent_key="agt_demo_local",
                     secret_hash=derive_key(demo_secret), allowed_job_types=sorted(AGENT_ALLOWED),
                     allowed_roots=[str(normalize(SAMPLE_EVIDENCE)), str(sim_export_root())],
                     registered_by_id=admin.id))
        s.data_dir.mkdir(parents=True, exist_ok=True)
        (s.data_dir / "demo_agent.secret").write_text(demo_secret, encoding="utf-8")

        for u in users.values():
            db.add(Notification(user_id=u.id, level=NotificationLevel.info, title="ברוכים הבאים ל-SceneOps AI",
                                body="המערכת פועלת במצב הדגמה עם נתונים בדויים.", link="/"))
        audit.record(db, "system.seed", "אתחול נתוני הדגמה בדויים", actor="seed")
        db.flush()

        if with_jobs and demo_src:
            db.flush()
            queue.enqueue(db, "full_media", user=noa, title="טיפול מלא במדיה – תיק 4581/25",
                          case_id=cases["4581/25"].id, exhibit_id=exhibits[("4581/25", "001")].id,
                          params={"source_id": demo_src.id})
        db.commit()
        print("נתוני הדגמה נוצרו. משתמשים: " + ", ".join(f"{u[0]} / {u[3]}" for u in DEMO_USERS))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-media", action="store_true")
    ap.add_argument("--no-jobs", action="store_true")
    a = ap.parse_args()
    seed(with_media=not a.no_media, with_jobs=not a.no_jobs)


if __name__ == "__main__":
    main()
