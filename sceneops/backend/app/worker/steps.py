"""מטפלי שלבים של תהליכי העבודה. כל שלב אידמפוטנטי ככל האפשר כדי לאפשר המשך בטוח."""
from __future__ import annotations

import os
import time
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..db import utcnow
from ..models import (
    Camera, Case, CustodyEvent, CustodyType, EvidenceSource, Exhibit, Finding, FindingKind, HashRecord,
    HashTarget, Job, JobStatus, JobStep, MediaFile, MediaStatus, MediaType, SourceKind, WorkingCopy,
)
from ..security import (
    PathNotAuthorized, ensure_source_path, is_within, normalize, safe_component, storage_path, storage_relative,
)
from ..services import media as M
from . import queue


class StepError(Exception):
    def __init__(self, message: str, permanent: bool = True):
        super().__init__(message)
        self.permanent = permanent


class StepContext:
    def __init__(self, db: Session, job: Job, step: JobStep, worker_id: str, step_index: int, weights: list[float]):
        self.db, self.job, self.step, self.worker_id = db, job, step, worker_id
        self._idx, self._weights = step_index, weights
        self._last_commit = 0.0
        self.settings = get_settings()

    def log(self, message: str, level: str = "info") -> None:
        queue.log(self.db, self.job.id, message, level, self.step.key)
        self.db.commit()

    def progress(self, frac: float, message: str | None = None, force: bool = False) -> None:
        frac = max(0.0, min(frac, 1.0))
        self.step.progress = frac
        if message:
            self.step.message = message
        done = sum(self._weights[: self._idx])
        self.job.progress = round(100 * (done + self._weights[self._idx] * frac) / sum(self._weights), 1)
        now = time.monotonic()
        if force or now - self._last_commit > 0.4:
            self.job.lease_until = utcnow() + timedelta(seconds=self.settings.worker_lease_seconds)
            self.db.commit()
            self._last_commit = now

    def check_cancel(self) -> None:
        status = self.db.execute(select(Job.status).where(Job.id == self.job.id)).scalar_one()
        if status == JobStatus.cancel_requested:
            raise M.Cancelled()

    # ---- היקף המדיה של המשימה
    def media_query(self):
        q = select(MediaFile)
        p = self.job.params or {}
        if p.get("source_id"):
            q = q.where(MediaFile.source_id == p["source_id"])
        elif self.job.exhibit_id:
            q = q.where(MediaFile.exhibit_id == self.job.exhibit_id)
        elif self.job.case_id:
            q = q.where(MediaFile.case_id == self.job.case_id)
        else:
            raise StepError("למשימה אין היקף (מקור/מוצג/תיק)")
        return q.order_by(MediaFile.relative_path)

    def media(self) -> list[MediaFile]:
        return list(self.db.scalars(self.media_query()))

    def custody(self, exhibit_id: int, kind: CustodyType, description: str) -> None:
        self.db.add(CustodyEvent(exhibit_id=exhibit_id, event_type=kind, description=description,
                                 to_party="SceneOps AI (תהליך אוטומטי)", recorded_by_id=self.job.created_by_id,
                                 job_id=self.job.id, location="אחסון מקומי מאושר"))


def _source_file(ctx: StepContext, mf: MediaFile) -> Path:
    try:
        root = ensure_source_path(ctx.db, mf.source.path)
    except PathNotAuthorized as e:
        raise StepError(f"מקור לא מורשה: {e}") from e
    p = normalize(root / mf.relative_path)
    if not is_within(p, root):
        raise StepError("נתיב קובץ חורג מתיקיית המקור")
    return p


def _source(ctx: StepContext) -> EvidenceSource:
    sid = (ctx.job.params or {}).get("source_id")
    src = ctx.db.get(EvidenceSource, sid) if sid else None
    if not src:
        raise StepError("לא נבחר מקור ראיות למשימה")
    return src


def _wc_path(ctx: StepContext, mf: MediaFile) -> Path:
    case = ctx.db.get(Case, mf.case_id)
    ex = ctx.db.get(Exhibit, mf.exhibit_id)
    parts = [safe_component(x) for x in Path(mf.relative_path).parts]
    rel = Path("cases", safe_component(case.reference), safe_component(ex.identifier), f"src{mf.source_id}",
               "working", *parts)
    return storage_path(rel.as_posix())


# ---------------------------------------------------------------- inventory
def step_inventory(ctx: StepContext) -> None:
    src = _source(ctx)
    try:
        root = ensure_source_path(ctx.db, src.path)
    except PathNotAuthorized as e:
        raise StepError(str(e)) from e
    if not root.is_dir():
        raise StepError(f"תיקיית המקור אינה קיימת או אינה נגישה: {root}")
    ex = ctx.db.get(Exhibit, src.exhibit_id)
    ctx.log(f"סריקת קריאה בלבד של {root}")
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if not os.path.islink(os.path.join(dirpath, d)))
        for fn in sorted(filenames):
            fp = Path(dirpath) / fn
            if not fp.is_symlink():
                files.append(fp)
        ctx.check_cancel()
    existing = {m.relative_path: m for m in ctx.db.scalars(select(MediaFile).where(MediaFile.source_id == src.id))}
    total_bytes, warns = 0, 0
    for i, fp in enumerate(files):
        rel = fp.relative_to(root).as_posix()
        st = fp.stat()
        ext = fp.suffix.lower()
        mtype = M.classify(ext)
        w: list[str] = []
        if st.st_size == 0:
            w.append("קובץ ריק (0 בתים)")
        if fp.name.startswith("."):
            w.append("קובץ מוסתר")
        if mtype == "other":
            w.append("סוג קובץ שאינו מדיה – נכלל במלאי בלבד")
        mtime = datetime.fromtimestamp(st.st_mtime, timezone.utc).replace(tzinfo=None)
        rec_start = M.parse_filename_time(fp.name)
        mf = existing.get(rel)
        if mf and mf.size_bytes != st.st_size:
            w.append("גודל הקובץ השתנה מאז הסריקה הקודמת – נדרשת בדיקה")
        if not mf:
            mf = MediaFile(case_id=ex.case_id, exhibit_id=ex.id, source_id=src.id, relative_path=rel)
            ctx.db.add(mf)
        mf.file_name, mf.extension, mf.size_bytes = fp.name, ext, st.st_size
        mf.media_type = MediaType(mtype)
        mf.source_mtime = mtime
        mf.camera_label = mf.camera_label or M.parse_camera_label(rel)
        if rec_start and not mf.recorded_start:
            mf.recorded_start, mf.time_source = rec_start, "שם קובץ"
        mf.warnings = w
        total_bytes += st.st_size
        warns += bool(w)
        ctx.progress((i + 1) / max(len(files), 1), f"{i + 1}/{len(files)} קבצים")
        if i % 25 == 0:
            ctx.check_cancel()
    src.file_count, src.total_bytes, src.last_scanned_at = len(files), total_bytes, utcnow()
    ctx.db.commit()
    ctx.log(f"נמצאו {len(files)} קבצים ({total_bytes:,} בתים), {warns} עם אזהרות")
    ctx.job.result = {**(ctx.job.result or {}), "files": len(files), "bytes": total_bytes}


# ---------------------------------------------------------------- hashing
def step_hash_sources(ctx: StepContext) -> None:
    items = ctx.media()
    todo = []
    for mf in items:
        prev = next((h for h in mf.hashes if h.target == HashTarget.source and h.size_bytes == mf.size_bytes), None)
        if not prev:
            todo.append(mf)
    if not todo:
        ctx.log("לכל הקבצים בהיקף כבר קיים Hash מקור – אין צורך בחישוב חוזר")
        return
    total = sum(m.size_bytes for m in todo) or 1
    done = 0

    def on_bytes(n: int) -> None:
        nonlocal done
        done += n
        ctx.progress(done / total, f"{done / 1048576:.1f} / {total / 1048576:.1f} MB")

    exhibits: set[int] = set()
    for mf in todo:
        p = _source_file(ctx, mf)
        if not p.exists():
            raise StepError(f"קובץ מקור חסר: {mf.relative_path}")
        before = p.stat()
        digest, size = M.sha256_file(p, on_bytes=on_bytes, check_cancel=ctx.check_cancel)
        after = p.stat()
        if (before.st_size, before.st_mtime) != (after.st_size, after.st_mtime) or size != mf.size_bytes:
            mf.warnings = [*mf.warnings, "הקובץ השתנה במהלך הקריאה – Hash אינו אמין"]
            raise StepError(f"קובץ המקור השתנה במהלך חישוב Hash: {mf.relative_path}")
        ctx.db.add(HashRecord(media_file_id=mf.id, target=HashTarget.source, target_path=mf.relative_path,
                              value=digest, size_bytes=size, job_id=ctx.job.id))
        if mf.status == MediaStatus.inventoried:
            mf.status = MediaStatus.hashed
        exhibits.add(mf.exhibit_id)
        ctx.db.commit()
    for ex in exhibits:
        ctx.custody(ex, CustodyType.hashed, f"חושב SHA-256 ל-{len(todo)} קבצי מקור (משימה #{ctx.job.id})")
    ctx.db.commit()
    ctx.log(f"חושב SHA-256 ל-{len(todo)} קבצים")


# ---------------------------------------------------------------- working copy
def step_working_copy(ctx: StepContext) -> None:
    items = [m for m in ctx.media() if m.size_bytes > 0]
    total = sum(m.size_bytes for m in items) * 2 or 1
    done = 0
    copied = 0

    def on_bytes(n: int) -> None:
        nonlocal done
        done += n
        ctx.progress(done / total)

    exhibits: set[int] = set()
    for mf in items:
        src_hash = next((h for h in reversed(mf.hashes) if h.target == HashTarget.source), None)
        if not src_hash:
            raise StepError(f"חסר Hash מקור עבור {mf.relative_path} – יש להריץ חישוב Hash תחילה")
        wc = mf.working_copy
        if wc and wc.verified and storage_path(wc.path).exists():
            done += mf.size_bytes * 2
            continue
        dst = _wc_path(ctx, mf)
        src = _source_file(ctx, mf)
        ctx.progress(done / total, f"מעתיק {mf.file_name}", force=True)
        copy_hash = M.copy_with_hash(src, dst, on_bytes=on_bytes, check_cancel=ctx.check_cancel)
        if copy_hash != src_hash.value:
            dst.unlink(missing_ok=True)
            raise StepError(f"אי-התאמה בין Hash המקור ל-Hash ההעתקה: {mf.relative_path}", permanent=False)
        verify_hash, _ = M.sha256_file(dst, on_bytes=on_bytes, check_cancel=ctx.check_cancel)
        ok = verify_hash == src_hash.value
        M.make_read_only(dst)
        if not wc:
            wc = WorkingCopy(media_file_id=mf.id, path="")
            ctx.db.add(wc)
        wc.path, wc.sha256, wc.verified, wc.verified_at, wc.job_id = (
            storage_relative(dst), verify_hash, ok, utcnow() if ok else None, ctx.job.id)
        ctx.db.add(HashRecord(media_file_id=mf.id, target=HashTarget.working_copy, target_path=wc.path,
                              value=verify_hash, size_bytes=mf.size_bytes, matches_source=ok, job_id=ctx.job.id))
        if not ok:
            ctx.db.commit()
            raise StepError(f"אימות עותק העבודה נכשל: {mf.relative_path}", permanent=False)
        mf.status = MediaStatus.verified
        exhibits.add(mf.exhibit_id)
        copied += 1
        ctx.db.commit()
    for ex in exhibits:
        ctx.custody(ex, CustodyType.copied, f"נוצרו {copied} עותקי עבודה באחסון המאושר; Hash אומת מול המקור")
    ctx.db.commit()
    ctx.log(f"נוצרו ואומתו {copied} עותקי עבודה (המקור לא שונה)")


# ---------------------------------------------------------------- metadata
def step_metadata(ctx: StepContext) -> None:
    items = [m for m in ctx.media() if m.media_type in (MediaType.video, MediaType.audio, MediaType.image)]
    if not M.ffmpeg_available():
        ctx.log("FFprobe אינו זמין – חילוץ מטא-דאטה דולג", "warning")
        ctx.step.message = "דולג: FFprobe חסר"
        return
    ctx.step.tool_versions = {k: v for k, v in M.tool_versions().items() if k in ("ffprobe",)}
    for i, mf in enumerate(items):
        # FFprobe קורא את הקובץ בלבד; מעדיפים עותק עבודה מאומת כשקיים
        target = storage_path(mf.working_copy.path) if mf.working_copy and mf.working_copy.verified \
            else _source_file(ctx, mf)
        pr = M.ffprobe(target)
        w = [x for x in (mf.warnings or []) if not x.startswith(("FFprobe", "חותמת", "חוסר"))]
        if pr.error:
            w.append(f"FFprobe: {pr.error[:120]}")
        else:
            mf.duration_seconds, mf.width, mf.height = pr.duration, pr.width, pr.height
            mf.codec, mf.fps, mf.container, mf.probe = pr.codec, pr.fps, pr.container, pr.raw or {}
            if not mf.recorded_start and pr.creation_time:
                mf.recorded_start, mf.time_source = pr.creation_time, "מטא-דאטה"
            if mf.recorded_start and pr.creation_time and mf.time_source == "שם קובץ":
                delta = abs((pr.creation_time - mf.recorded_start).total_seconds())
                if delta > 120:
                    w.append(f"חותמת זמן במטא-דאטה שונה מזמן שם הקובץ ב-{int(delta // 60)} דקות – לבדיקה")
            if mf.recorded_start and mf.duration_seconds:
                mf.recorded_end = mf.recorded_start + timedelta(seconds=mf.duration_seconds)
        mf.warnings = w
        ctx.db.commit()
        ctx.progress((i + 1) / max(len(items), 1), f"{i + 1}/{len(items)}")
        ctx.check_cancel()
    ctx.log(f"חולץ מטא-דאטה ל-{len(items)} קבצים")


# ---------------------------------------------------------------- derivatives
def step_derivatives(ctx: StepContext) -> None:
    items = [m for m in ctx.media() if m.media_type == MediaType.video and m.working_copy and m.working_copy.verified]
    if not M.ffmpeg_available():
        ctx.log("FFmpeg אינו זמין – יצירת נגזרות דולגה", "warning")
        return
    for i, mf in enumerate(items):
        wc = mf.working_copy
        src = storage_path(wc.path)  # נגזרות נוצרות רק מעותק העבודה
        base = src.parent.parent / "derived" / safe_component(src.stem)
        thumb, proxy = base.with_suffix(".thumb.jpg"), base.with_suffix(".proxy.mp4")
        if not (wc.thumbnail_path and storage_path(wc.thumbnail_path).exists()):
            pr = M.ffprobe(src)
            M.make_thumbnail(src, thumb, (pr.duration or 1) * 0.1)
            wc.thumbnail_path = storage_relative(thumb)
        if not (wc.proxy_path and storage_path(wc.proxy_path).exists()):
            M.make_proxy(src, proxy)
            wc.proxy_path = storage_relative(proxy)
        ctx.db.commit()
        ctx.progress((i + 1) / max(len(items), 1), f"{i + 1}/{len(items)} נגזרות")
        ctx.check_cancel()
    ctx.step.tool_versions = {"ffmpeg": M.tool_versions().get("ffmpeg", "")}
    ctx.log(f"נוצרו תמונות ממוזערות וקבצי תצוגה ל-{len(items)} סרטונים (מעותקי עבודה בלבד)")


# ---------------------------------------------------------------- index
def step_index(ctx: StepContext) -> None:
    items = ctx.media()
    cams: dict[str, int] = defaultdict(int)
    for mf in items:
        if mf.status in (MediaStatus.verified, MediaStatus.hashed) and mf.media_type == MediaType.video:
            mf.status = MediaStatus.indexed if mf.working_copy else mf.status
        cams[mf.camera_label or "ללא מצלמה"] += 1
    ctx.db.commit()
    ctx.job.result = {**(ctx.job.result or {}), "index": dict(cams)}
    ctx.log("אינדקס עודכן: " + ", ".join(f"{k}: {v}" for k, v in cams.items()))


# ---------------------------------------------------------------- timeline
def step_timeline(ctx: StepContext) -> None:
    thr = float(_setting(ctx.db, "gap_threshold_seconds", 5))
    items = [m for m in ctx.media() if m.media_type == MediaType.video]
    ids = [m.id for m in items]
    if ids:
        ctx.db.execute(delete(Finding).where(Finding.media_file_id.in_(ids),
                                             Finding.kind.in_([FindingKind.gap, FindingKind.time_inconsistency])))
    by_cam: dict[str, list[MediaFile]] = defaultdict(list)
    n_gap = n_time = 0
    for mf in items:
        by_cam[mf.camera_label or "ללא מצלמה"].append(mf)
        for w in mf.warnings or []:
            if w.startswith("חותמת זמן"):
                ctx.db.add(Finding(case_id=mf.case_id, exhibit_id=mf.exhibit_id, media_file_id=mf.id,
                                   kind=FindingKind.time_inconsistency, camera_label=mf.camera_label,
                                   start_time=mf.recorded_start, description=w + " (אפשרי – אינו ממצא חד-משמעי)",
                                   job_id=ctx.job.id))
                n_time += 1
        if mf.recorded_start and mf.source_mtime and mf.recorded_end:
            if mf.recorded_start > utcnow() + timedelta(days=1) or mf.recorded_start.year < 2000:
                ctx.db.add(Finding(case_id=mf.case_id, exhibit_id=mf.exhibit_id, media_file_id=mf.id,
                                   kind=FindingKind.time_inconsistency, camera_label=mf.camera_label,
                                   start_time=mf.recorded_start,
                                   description="חותמת זמן חריגה (עתידית או לפני שנת 2000) – לבדיקה", job_id=ctx.job.id))
                n_time += 1
    for cam, lst in by_cam.items():
        lst = sorted([m for m in lst if m.recorded_start and m.recorded_end], key=lambda m: m.recorded_start)
        for a, b in zip(lst, lst[1:]):
            gap = (b.recorded_start - a.recorded_end).total_seconds()
            if gap > thr:
                ctx.db.add(Finding(case_id=a.case_id, exhibit_id=a.exhibit_id, media_file_id=b.id,
                                   kind=FindingKind.gap, camera_label=cam, start_time=a.recorded_end,
                                   end_time=b.recorded_start,
                                   description=f"פער הקלטה אפשרי של {int(gap)} שניות בין {a.file_name} ל-{b.file_name}"
                                               " – ייתכן שנובע מהגדרות הקלטה; נדרשת בדיקה",
                                   job_id=ctx.job.id))
                n_gap += 1
            elif gap < -thr:
                ctx.db.add(Finding(case_id=a.case_id, exhibit_id=a.exhibit_id, media_file_id=b.id,
                                   kind=FindingKind.time_inconsistency, camera_label=cam, start_time=b.recorded_start,
                                   end_time=a.recorded_end,
                                   description=f"חפיפת זמנים של {int(-gap)} שניות בין קבצים עוקבים – לבדיקה",
                                   job_id=ctx.job.id))
                n_time += 1
    ctx.db.commit()
    ctx.job.result = {**(ctx.job.result or {}), "gaps": n_gap, "time_inconsistencies": n_time,
                      "cameras": len(by_cam)}
    ctx.log(f"ציר זמן נבנה ל-{len(by_cam)} מצלמות: {n_gap} פערים אפשריים, {n_time} אי-התאמות זמן – כולם לבדיקה")


# ---------------------------------------------------------------- motion
def step_motion(ctx: StepContext) -> None:
    try:
        import cv2  # noqa: F401, PLC0415
    except ImportError:
        ctx.log("OpenCV אינו מותקן – ניתוח תנועה דולג", "warning")
        return
    items = [m for m in ctx.media() if m.media_type == MediaType.video and m.working_copy and m.working_copy.verified]
    if not items:
        ctx.log("אין עותקי עבודה מאומתים לניתוח", "warning")
        return
    ctx.db.execute(delete(Finding).where(Finding.media_file_id.in_([m.id for m in items]),
                                         Finding.kind == FindingKind.motion))
    thr = float(_setting(ctx.db, "motion_sensitivity", 0.003))
    total = 0
    for i, mf in enumerate(items):
        segs = M.detect_motion(storage_path(mf.working_copy.path), check_cancel=ctx.check_cancel, threshold=thr,
                               on_progress=lambda f, i=i: ctx.progress((i + f) / len(items)))
        for s in segs:
            st = mf.recorded_start + timedelta(seconds=s.start) if mf.recorded_start else None
            en = mf.recorded_start + timedelta(seconds=s.end) if mf.recorded_start else None
            ctx.db.add(Finding(case_id=mf.case_id, exhibit_id=mf.exhibit_id, media_file_id=mf.id,
                               kind=FindingKind.motion, camera_label=mf.camera_label, start_time=st, end_time=en,
                               media_offset_start=round(s.start, 2), media_offset_end=round(s.end, 2), score=s.score,
                               description="מקטע תנועה שזוהה אלגוריתמית – מועמד לבדיקה ידנית", job_id=ctx.job.id))
        total += len(segs)
        ctx.db.commit()
    ctx.step.tool_versions = {"OpenCV": M.tool_versions().get("OpenCV", "")}
    ctx.job.result = {**(ctx.job.result or {}), "motion_segments": total}
    ctx.log(f"זוהו {total} מקטעי תנועה מועמדים ב-{len(items)} סרטונים")


# ---------------------------------------------------------------- integrity
def step_verify_integrity(ctx: StepContext) -> None:
    items = [m for m in ctx.media() if m.size_bytes > 0]
    total = len(items) or 1
    problems = 0
    for i, mf in enumerate(items):
        src_hash = next((h for h in reversed(mf.hashes) if h.target == HashTarget.source), None)
        if not src_hash:
            continue
        msgs = []
        if mf.working_copy:
            p = storage_path(mf.working_copy.path)
            if not p.exists():
                msgs.append("עותק העבודה חסר")
            else:
                d, _ = M.sha256_file(p, check_cancel=ctx.check_cancel)
                ok = d == src_hash.value
                ctx.db.add(HashRecord(media_file_id=mf.id, target=HashTarget.working_copy, target_path=mf.working_copy.path,
                                      value=d, size_bytes=mf.size_bytes, matches_source=ok, job_id=ctx.job.id))
                if not ok:
                    msgs.append("Hash עותק העבודה אינו תואם ל-Hash המקור")
        try:
            sp = _source_file(ctx, mf)
            if sp.exists():
                d, _ = M.sha256_file(sp, check_cancel=ctx.check_cancel)
                if d != src_hash.value:
                    msgs.append("Hash המקור הנוכחי שונה מהרישום המקורי")
            else:
                ctx.log(f"המקור אינו מחובר כעת: {mf.relative_path} – נבדק עותק העבודה בלבד", "warning")
        except StepError as e:
            ctx.log(str(e), "warning")
        for msg in msgs:
            problems += 1
            ctx.db.add(Finding(case_id=mf.case_id, exhibit_id=mf.exhibit_id, media_file_id=mf.id,
                               kind=FindingKind.integrity, camera_label=mf.camera_label,
                               description=f"{msg}: {mf.relative_path}", job_id=ctx.job.id))
        ctx.db.commit()
        ctx.progress((i + 1) / total, f"{i + 1}/{len(items)}")
    exs = {m.exhibit_id for m in items}
    for ex in exs:
        ctx.custody(ex, CustodyType.verified, f"בדיקת שלמות: {len(items)} קבצים, {problems} חריגות (משימה #{ctx.job.id})")
    ctx.db.commit()
    ctx.job.result = {**(ctx.job.result or {}), "checked": len(items), "problems": problems}
    if problems:
        ctx.log(f"נמצאו {problems} חריגות שלמות", "error")
        raise StepError(f"בדיקת השלמות מצאה {problems} חריגות – ראה ממצאים")
    ctx.log(f"כל {len(items)} הקבצים אומתו בהצלחה")


# ---------------------------------------------------------------- simulated camera export
def step_sim_export(ctx: StepContext) -> None:
    from ..services.samplegen import generate_simulated_export  # noqa: PLC0415

    p = ctx.job.params or {}
    cam = ctx.db.get(Camera, ctx.job.camera_id)
    ex = ctx.db.get(Exhibit, ctx.job.exhibit_id)
    if not cam or not ex:
        raise StepError("חסרים מכשיר או מוצג לייצוא")
    start, end = datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["end"])
    root = sim_export_root()
    dst = root / f"job{ctx.job.id}_{safe_component(cam.name)}"
    ctx.log(f"[סימולציה] ייצוא מ-{cam.name} ערוצים {p['channels']} לטווח {start:%d/%m/%Y %H:%M}–{end:%H:%M}")
    files = generate_simulated_export(dst, cam.name, p["channels"], start, end)
    (dst / "SIMULATION_NOTICE.txt").write_text(
        "ייצוא מדומה – נוצר סינתטית על ידי SceneOps AI. לא בוצעה התחברות למכשיר אמיתי.\n", encoding="utf-8")
    src = EvidenceSource(exhibit_id=ex.id, kind=SourceKind.simulated_export, path=str(dst),
                         label=f"ייצוא מדומה מ-{cam.name}", authorized_by_id=ctx.job.created_by_id,
                         authorization_note=p.get("authorization_ref", ""))
    ctx.db.add(src)
    ctx.db.flush()
    ctx.job.params = {**p, "source_id": src.id}
    ctx.custody(ex.id, CustodyType.exported, f"[סימולציה] ייצוא {len(files)} קטעים מ-{cam.name}; "
                                          f"אסמכתת הרשאה: {p.get('authorization_ref', '')}")
    audit.record(ctx.db, "camera.export_sim", f"ייצוא מדומה מ-{cam.name}", actor="worker", entity_type="camera",
                 entity_id=cam.id, details={"job": ctx.job.id, "channels": p["channels"], "files": len(files)})
    ctx.db.commit()


def sim_export_root() -> Path:
    return get_settings().data_dir / "simulated_exports"


# ---------------------------------------------------------------- report
def step_report(ctx: StepContext) -> None:
    from ..services.reports import generate_report_revision  # noqa: PLC0415

    case_id = ctx.job.case_id
    if not case_id:
        raise StepError("משימת דוח דורשת תיק")
    p = ctx.job.params or {}
    rev = generate_report_revision(ctx.db, case_id, user_id=ctx.job.created_by_id, job_id=ctx.job.id,
                                   report_id=p.get("report_id"), title=p.get("report_title"),
                                   note=p.get("change_note", "הופק אוטומטית"))
    ctx.job.result = {**(ctx.job.result or {}), "report_id": rev.report_id, "revision": rev.revision}
    ctx.log(f"טיוטת דוח #{rev.report_id} גרסה {rev.revision} הופקה (PDF + DOCX)")


def _setting(db: Session, key: str, default):
    from ..models import SystemSetting  # noqa: PLC0415
    s = db.get(SystemSetting, key)
    return s.value if s is not None else default


HANDLERS: dict[str, Callable[[StepContext], None]] = {
    "inventory": step_inventory, "hash_sources": step_hash_sources, "working_copy": step_working_copy,
    "metadata": step_metadata, "derivatives": step_derivatives, "index": step_index, "timeline": step_timeline,
    "motion": step_motion, "verify_integrity": step_verify_integrity, "sim_export": step_sim_export,
    "report": step_report,
}

