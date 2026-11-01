"""הפקת דוחות PDF ו-DOCX בעברית (RTL) מנתוני תיק שמורים בלבד.

הדוח הוא טיוטה עד לאישור חוקר מורשה. התוכן נלקח מהמסד כפי שהוא – ללא המצאת ממצאים.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from bidi.algorithm import get_display
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import utcnow
from ..models import (
    Approval, Case, CustodyEvent, EvidenceSource, Exhibit, Finding, HashTarget, Job, MediaFile, Report,
    ReportRevision, ReportStatus, User,
)
from ..security import safe_component, storage_path, storage_relative
from . import media as M
from .labels import (
    CASE_STATUS, CUSTODY_TYPE, EXHIBIT_TYPE, FINDING_KIND, JOB_STATUS, PRIORITY, REVIEW_STATUS, SOURCE_KIND,
    STEP_STATUS,
)

DISCLAIMER = ("מסמך זה הופק אוטומטית על ידי SceneOps AI מנתונים השמורים במערכת. ממצאים אלגוריתמיים "
              "(תנועה, פערי הקלטה, אי-התאמות זמן) הם מועמדים לבדיקה בלבד ואינם קביעה עובדתית. "
              "המערכת לא עברה הסמכה פורנזית ואין בדוח כדי להעיד על קבילות ראייתית.")


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().display_timezone)


def fmt_sys(dt: datetime | None) -> str:
    """זמן מערכת (נשמר ב-UTC) לתצוגה באזור הזמן המוגדר."""
    if not dt:
        return "—"
    local = dt.replace(tzinfo=timezone.utc).astimezone(tz())
    return local.strftime("%d/%m/%Y %H:%M:%S") + f" ({local.tzname()})"


def fmt_dev(dt: datetime | None) -> str:
    """זמן הקלטה לפי שעון המכשיר – מוצג כפי שנרשם, ללא תיקון."""
    return dt.strftime("%d/%m/%Y %H:%M:%S") if dt else "—"


def fmt_size(n: int | None) -> str:
    if not n:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return str(n)


# ---------------------------------------------------------------- snapshot
def build_content(db: Session, case_id: int) -> dict[str, Any]:
    case = db.get(Case, case_id)
    if not case:
        raise ValueError("התיק לא נמצא")
    exhibits = list(db.scalars(select(Exhibit).where(Exhibit.case_id == case_id).order_by(Exhibit.identifier)))
    ex_by_id = {e.id: e for e in exhibits}
    media = list(db.scalars(select(MediaFile).where(MediaFile.case_id == case_id).order_by(
        MediaFile.exhibit_id, MediaFile.relative_path)))
    jobs = list(db.scalars(select(Job).where(Job.case_id == case_id).order_by(Job.created_at)))
    findings = list(db.scalars(select(Finding).where(Finding.case_id == case_id).order_by(Finding.kind, Finding.start_time)))
    errors: list[str] = []
    for j in jobs:
        if j.error:
            errors.append(f"משימה #{j.id} ({j.title}): {j.error}")
    for m in media:
        for w in m.warnings or []:
            errors.append(f"{m.relative_path}: {w}")

    def user_name(uid: int | None) -> str:
        u = db.get(User, uid) if uid else None
        return u.full_name if u else "—"

    ex_list = []
    for e in exhibits:
        sources = db.scalars(select(EvidenceSource).where(EvidenceSource.exhibit_id == e.id))
        custody = db.scalars(select(CustodyEvent).where(CustodyEvent.exhibit_id == e.id).order_by(CustodyEvent.occurred_at))
        ex_list.append({
            "identifier": e.identifier, "label": e.label, "type": EXHIBIT_TYPE[e.exhibit_type.value],
            "description": e.description, "source_device": e.source_device, "location": e.location,
            "acquisition_method": e.acquisition_method, "acquired_at": fmt_sys(e.acquired_at),
            "acquired_by": user_name(e.acquired_by_id), "storage_reference": e.storage_reference,
            "sources": [{"kind": SOURCE_KIND[s.kind.value], "label": s.label, "path": s.path,
                         "file_count": s.file_count, "total": fmt_size(s.total_bytes),
                         "scanned": fmt_sys(s.last_scanned_at)} for s in sources],
            "custody": [{"time": fmt_sys(c.occurred_at), "type": CUSTODY_TYPE[c.event_type.value],
                         "description": c.description, "from": c.from_party, "to": c.to_party,
                         "by": c.recorded_by.full_name if c.recorded_by else "—"} for c in custody],
        })
    media_list = []
    for m in media:
        src_h = next((h for h in reversed(m.hashes) if h.target == HashTarget.source), None)
        wc_h = next((h for h in reversed(m.hashes) if h.target == HashTarget.working_copy), None)
        media_list.append({
            "exhibit": ex_by_id[m.exhibit_id].identifier if m.exhibit_id in ex_by_id else "",
            "path": m.relative_path, "size": fmt_size(m.size_bytes), "type": m.media_type.value,
            "duration": M.fmt_offset(m.duration_seconds) if m.duration_seconds else "—",
            "resolution": f"{m.width}x{m.height}" if m.width else "—", "codec": m.codec or "—",
            "camera": m.camera_label or "—", "recorded_start": fmt_dev(m.recorded_start),
            "time_source": m.time_source or "—",
            "source_sha256": src_h.value if src_h else "לא חושב",
            "source_hashed_at": fmt_sys(src_h.computed_at) if src_h else "—",
            "wc_sha256": wc_h.value if wc_h else "—",
            "verified": bool(m.working_copy and m.working_copy.verified),
            "warnings": list(m.warnings or []),
        })
    proc = []
    for j in jobs:
        proc.append({
            "id": j.id, "title": j.title, "status": JOB_STATUS[j.status.value], "simulation": j.is_simulation,
            "created_by": j.created_by.full_name if j.created_by else "—", "started": fmt_sys(j.started_at),
            "finished": fmt_sys(j.finished_at), "error": j.error,
            "steps": [{"name": s.name, "status": STEP_STATUS[s.status.value], "error": s.error,
                       "tools": s.tool_versions or {}} for s in j.steps],
        })
    return {
        "generated_at": fmt_sys(utcnow()), "timezone": get_settings().display_timezone,
        "case": {"reference": case.reference, "title": case.title, "description": case.description,
                 "status": CASE_STATUS[case.status.value], "priority": PRIORITY[case.priority.value],
                 "investigator": case.assigned_to.full_name if case.assigned_to else "—",
                 "opened_at": fmt_sys(case.opened_at), "incident_date": fmt_sys(case.incident_date),
                 "is_demo": case.is_demo},
        "exhibits": ex_list, "media": media_list, "processing": proc,
        "findings": [{"kind": FINDING_KIND[f.kind.value], "camera": f.camera_label or "—",
                      "start": fmt_dev(f.start_time), "end": fmt_dev(f.end_time), "description": f.description,
                      "review": REVIEW_STATUS[f.review_status.value],
                      "score": f.score} for f in findings],
        "errors": errors, "tools": M.tool_versions(), "disclaimer": DISCLAIMER,
        "summary": {"exhibits": len(exhibits), "media": len(media),
                    "hashed": sum(1 for m in media_list if m["source_sha256"] != "לא חושב"),
                    "verified": sum(1 for m in media_list if m["verified"]), "findings": len(findings),
                    "jobs": len(jobs)},
    }


# ---------------------------------------------------------------- PDF
class _RtlPdf:
    def __init__(self, path: Path, title: str, status_line: str, watermark: str | None):
        from reportlab.lib.pagesizes import A4  # noqa: PLC0415
        from reportlab.pdfbase import pdfmetrics  # noqa: PLC0415
        from reportlab.pdfbase.ttfonts import TTFont  # noqa: PLC0415
        from reportlab.pdfgen import canvas  # noqa: PLC0415

        fd = get_settings().fonts_dir
        for name, file in (("He", "DejaVuSans.ttf"), ("HeB", "DejaVuSans-Bold.ttf"), ("Mono", "DejaVuSansMono.ttf")):
            try:
                pdfmetrics.getFont(name)
            except KeyError:
                pdfmetrics.registerFont(TTFont(name, str(fd / file)))
        self.pm = pdfmetrics
        self.W, self.H = A4
        self.m = 40
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.c.setTitle(title)
        self.c.setAuthor("SceneOps AI")
        self.title, self.status_line, self.watermark = title, status_line, watermark
        self.page = 0
        self._new_page()

    def _new_page(self):
        if self.page:
            self.c.showPage()
        self.page += 1
        c = self.c
        if self.watermark:
            c.saveState()
            c.setFillColorRGB(0.85, 0.85, 0.85)
            c.setFont("HeB", 60)
            c.translate(self.W / 2, self.H / 2)
            c.rotate(35)
            c.drawCentredString(0, 0, get_display(self.watermark))
            c.restoreState()
        c.setFillColorRGB(0.03, 0.08, 0.15)
        c.rect(0, self.H - 46, self.W, 46, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("HeB", 13)
        c.drawRightString(self.W - self.m, self.H - 28, get_display(self.title))
        c.setFont("He", 9)
        c.drawString(self.m, self.H - 28, "SceneOps AI")
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.setFont("He", 8)
        c.drawRightString(self.W - self.m, 22, get_display(self.status_line))
        c.drawString(self.m, 22, get_display(f"עמוד {self.page}"))
        c.setFillColorRGB(0, 0, 0)
        self.y = self.H - 70

    def _ensure(self, h: float):
        if self.y - h < 45:
            self._new_page()

    def _wrap(self, text: str, font: str, size: float, width: float) -> list[str]:
        lines: list[str] = []
        for para in str(text).split("\n"):
            words, cur = para.split(" "), ""
            for w in words:
                cand = f"{cur} {w}".strip()
                if self.pm.stringWidth(cand, font, size) <= width:
                    cur = cand
                else:
                    if cur:
                        lines.append(cur)
                    while self.pm.stringWidth(w, font, size) > width and len(w) > 1:
                        cut = len(w)
                        while cut > 1 and self.pm.stringWidth(w[:cut], font, size) > width:
                            cut -= 1
                        lines.append(w[:cut])
                        w = w[cut:]
                    cur = w
            lines.append(cur)
        return lines

    def heading(self, text: str):
        self._ensure(34)
        self.y -= 8
        self.c.setFillColorRGB(0.19, 0.61, 1)
        self.c.rect(self.W - self.m - 4, self.y - 3, 4, 16, fill=1, stroke=0)
        self.c.setFillColorRGB(0.03, 0.08, 0.15)
        self.c.setFont("HeB", 12)
        self.c.drawRightString(self.W - self.m - 10, self.y, get_display(text))
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= 20

    def para(self, text: str, size: float = 9.5, font: str = "He", color=(0, 0, 0)):
        width = self.W - 2 * self.m
        self.c.setFillColorRGB(*color)
        for line in self._wrap(text, font, size, width):
            self._ensure(size + 4)
            self.c.setFont(font, size)
            self.c.drawRightString(self.W - self.m, self.y, get_display(line))
            self.y -= size + 4
        self.c.setFillColorRGB(0, 0, 0)

    def kv(self, rows: list[tuple[str, str]]):
        for k, v in rows:
            label_w = 130
            lines = self._wrap(str(v or "—"), "He", 9.5, self.W - 2 * self.m - label_w)
            self._ensure(14 * len(lines))
            self.c.setFont("HeB", 9.5)
            self.c.drawRightString(self.W - self.m, self.y, get_display(k + ":"))
            self.c.setFont("He", 9.5)
            for ln in lines:
                self.c.drawRightString(self.W - self.m - label_w, self.y, get_display(ln))
                self.y -= 13
            self.y -= 1

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], mono: set[int] | None = None,
              size: float = 7.5):
        mono = mono or set()
        total = self.W - 2 * self.m
        ws = [w * total / sum(widths) for w in widths]

        def draw_row(cells: list[str], bold: bool = False):
            wrapped = [self._wrap(str(c if c not in (None, "") else "—"), "Mono" if (i in mono and not bold) else
                                  ("HeB" if bold else "He"), size, ws[i] - 6) for i, c in enumerate(cells)]
            h = max(len(w) for w in wrapped) * (size + 3) + 6
            self._ensure(h)
            x = self.W - self.m
            if bold:
                self.c.setFillColorRGB(0.9, 0.93, 0.97)
                self.c.rect(self.m, self.y - h + size + 3, total, h, fill=1, stroke=0)
                self.c.setFillColorRGB(0, 0, 0)
            for i, lines in enumerate(wrapped):
                font = "HeB" if bold else ("Mono" if i in mono else "He")
                yy = self.y
                for ln in lines:
                    self.c.setFont(font, size)
                    self.c.drawRightString(x - 3, yy, get_display(ln))
                    yy -= size + 3
                x -= ws[i]
            self.c.setStrokeColorRGB(0.8, 0.83, 0.87)
            self.c.line(self.m, self.y - h + size + 3, self.W - self.m, self.y - h + size + 3)
            self.y -= h

        draw_row(headers, bold=True)
        for r in rows:
            draw_row(r)
        self.y -= 6

    def save(self):
        self.c.save()


def render_pdf(content: dict, path: Path, *, title: str, revision: int, approval: dict | None) -> None:
    status_line = (f"גרסה {revision} | מאושר על ידי {approval['by']} ב-{approval['at']}" if approval
                   else f"גרסה {revision} | טיוטה – ממתינה לבדיקה ואישור חוקר מורשה")
    pdf = _RtlPdf(path, title, status_line, None if approval else "טיוטה")
    c = content["case"]
    if c.get("is_demo"):
        pdf.para("נתוני הדגמה בדויים – אינם מתייחסים לאירוע או לאדם אמיתי.", 9, "HeB", (0.75, 0.1, 0.2))
    pdf.heading("פרטי התיק")
    pdf.kv([("מספר תיק", c["reference"]), ("כותרת", c["title"]), ("תיאור", c["description"]),
            ("סטטוס", c["status"]), ("עדיפות", c["priority"]), ("חוקר אחראי", c["investigator"]),
            ("נפתח", c["opened_at"]), ("מועד אירוע", c["incident_date"]),
            ("הדוח הופק", content["generated_at"]), ("אזור זמן לתצוגה", content["timezone"])])
    s = content["summary"]
    pdf.heading("תקציר עיבוד")
    pdf.kv([("מוצגים", str(s["exhibits"])), ("קבצי מדיה", str(s["media"])), ("חושב Hash", str(s["hashed"])),
            ("עותקי עבודה מאומתים", str(s["verified"])), ("ממצאים לבדיקה", str(s["findings"])),
            ("משימות עיבוד", str(s["jobs"]))])
    for e in content["exhibits"]:
        pdf.heading(f"מוצג {e['identifier']} – {e['label']}")
        pdf.kv([("סוג", e["type"]), ("תיאור", e["description"]), ("התקן מקור", e["source_device"]),
                ("מיקום", e["location"]), ("שיטת רכישה", e["acquisition_method"]), ("נרכש", e["acquired_at"]),
                ("נרכש על ידי", e["acquired_by"]), ("אסמכתת אחסון", e["storage_reference"])])
        if e["sources"]:
            pdf.table(["סוג מקור", "תיאור", "נתיב", "קבצים", "נפח", "נסרק"],
                      [[x["kind"], x["label"], x["path"], str(x["file_count"]), x["total"], x["scanned"]]
                       for x in e["sources"]], [1, 1.4, 2.6, 0.6, 0.7, 1.5], mono={2})
        if e["custody"]:
            pdf.para("שרשרת משמורת:", 9.5, "HeB")
            pdf.table(["זמן", "אירוע", "תיאור", "נרשם על ידי"],
                      [[x["time"], x["type"], x["description"], x["by"]] for x in e["custody"]], [1.4, 0.8, 3.2, 1])
    if content["media"]:
        pdf.heading("מלאי מדיה וערכי SHA-256")
        pdf.para("זמני הקלטה מוצגים לפי שעון המכשיר כפי שנרשמו, ללא תיקון היסט.", 8, color=(0.35, 0.35, 0.35))
        pdf.table(["מוצג", "קובץ", "מצלמה", "תחילת הקלטה", "משך", "רזולוציה", "קודק", "גודל"],
                  [[m["exhibit"], m["path"], m["camera"], m["recorded_start"], m["duration"], m["resolution"],
                    m["codec"], m["size"]] for m in content["media"]], [0.6, 2.4, 0.7, 1.3, 0.6, 0.8, 0.6, 0.7])
        pdf.table(["קובץ", "SHA-256 מקור", "SHA-256 עותק עבודה", "אומת"],
                  [[m["path"], m["source_sha256"], m["wc_sha256"], "כן" if m["verified"] else "לא"]
                   for m in content["media"]], [1.5, 2.5, 2.5, 0.4], mono={1, 2}, size=6.5)
    pdf.heading("שלבי עיבוד")
    if not content["processing"]:
        pdf.para("לא בוצעו משימות עיבוד בתיק זה.")
    for j in content["processing"]:
        pdf.para(f"משימה #{j['id']} – {j['title']}{' [סימולציה]' if j['simulation'] else ''} | {j['status']} | "
                 f"הופעלה על ידי {j['created_by']} | התחלה {j['started']} | סיום {j['finished']}", 9, "HeB")
        pdf.table(["שלב", "סטטוס", "כלים", "שגיאה"],
                  [[st["name"], st["status"], ", ".join(f"{k} {v}" for k, v in st["tools"].items()), st["error"]]
                   for st in j["steps"]], [2, 0.8, 2, 2])
    pdf.heading("ממצאים הדורשים בדיקה")
    pdf.para("הממצאים להלן הופקו אלגוריתמית ואינם קביעה עובדתית. יש לבחון כל ממצא ידנית.", 8.5,
             color=(0.6, 0.35, 0))
    if content["findings"]:
        pdf.table(["סוג", "מצלמה", "התחלה", "סיום", "תיאור", "סטטוס בדיקה"],
                  [[f["kind"], f["camera"], f["start"], f["end"], f["description"], f["review"]]
                   for f in content["findings"][:400]], [0.9, 0.7, 1.2, 1.2, 3, 0.9])
    else:
        pdf.para("לא נרשמו ממצאים.")
    pdf.heading("שגיאות ואזהרות")
    if content["errors"]:
        for e in content["errors"][:200]:
            pdf.para("• " + e, 8.5)
    else:
        pdf.para("לא נרשמו שגיאות.")
    pdf.heading("כלים וגרסאות")
    pdf.kv(list(content["tools"].items()))
    pdf.heading("הבהרה")
    pdf.para(content["disclaimer"], 8.5)
    if approval:
        pdf.heading("אישור")
        pdf.kv([("אושר על ידי", approval["by"]), ("מועד אישור", approval["at"]), ("הערה", approval.get("comment", ""))])
    pdf.save()


# ---------------------------------------------------------------- DOCX
def render_docx(content: dict, path: Path, *, title: str, revision: int, approval: dict | None) -> None:
    from docx import Document  # noqa: PLC0415
    from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: PLC0415
    from docx.oxml import OxmlElement  # noqa: PLC0415
    from docx.oxml.ns import qn  # noqa: PLC0415
    from docx.shared import Pt, RGBColor  # noqa: PLC0415

    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Arial"
    st.font.size = Pt(10)
    rpr = st.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.append(fonts)
    fonts.set(qn("w:cs"), "Arial")
    for sec in doc.sections:
        sp = sec._sectPr
        bidi = OxmlElement("w:bidi")
        sp.append(bidi)

    def rtl_par(p):
        ppr = p._p.get_or_add_pPr()
        b = OxmlElement("w:bidi")
        b.set(qn("w:val"), "1")
        ppr.insert(0, b)
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for r in p.runs:
            rtl_run(r)
        return p

    def rtl_run(r):
        rp = r._r.get_or_add_rPr()
        e = OxmlElement("w:rtl")
        e.set(qn("w:val"), "1")
        rp.append(e)

    def para(text: str, bold: bool = False, size: int | None = None, color: tuple | None = None):
        p = doc.add_paragraph()
        r = p.add_run(text)
        r.bold = bold
        if size:
            r.font.size = Pt(size)
            r.font.cs_size = Pt(size) if hasattr(r.font, "cs_size") else None
        if color:
            r.font.color.rgb = RGBColor(*color)
        rtl_par(p)
        return p

    def heading(text: str, level: int = 1):
        h = doc.add_heading(text, level=level)
        rtl_par(h)

    def table(headers: list[str], rows: list[list[str]]):
        t = doc.add_table(rows=1, cols=len(headers))
        t.style = "Table Grid"
        tblpr = t._tbl.tblPr
        bv = OxmlElement("w:bidiVisual")
        tblpr.append(bv)
        for i, h in enumerate(headers):
            cell = t.rows[0].cells[i]
            cell.text = ""
            r = cell.paragraphs[0].add_run(h)
            r.bold = True
            rtl_par(cell.paragraphs[0])
        for row in rows:
            cells = t.add_row().cells
            for i, v in enumerate(row):
                cells[i].text = ""
                r = cells[i].paragraphs[0].add_run(str(v if v not in (None, "") else "—"))
                r.font.size = Pt(8)
                rtl_par(cells[i].paragraphs[0])
        doc.add_paragraph()

    def kv(rows: list[tuple[str, str]]):
        for k, v in rows:
            p = doc.add_paragraph()
            r1 = p.add_run(f"{k}: ")
            r1.bold = True
            p.add_run(str(v or "—"))
            rtl_par(p)

    heading(title, 0)
    para(f"SceneOps AI | גרסה {revision} | " + (f"מאושר על ידי {approval['by']} ב-{approval['at']}" if approval
                                                else "טיוטה – ממתינה לבדיקה ואישור חוקר מורשה"),
         bold=True, color=(0x20, 0x8A, 0x5A) if approval else (0xC0, 0x7A, 0x00))
    c = content["case"]
    if c.get("is_demo"):
        para("נתוני הדגמה בדויים – אינם מתייחסים לאירוע או לאדם אמיתי.", bold=True, color=(0xC0, 0x20, 0x30))
    heading("פרטי התיק")
    kv([("מספר תיק", c["reference"]), ("כותרת", c["title"]), ("תיאור", c["description"]), ("סטטוס", c["status"]),
        ("עדיפות", c["priority"]), ("חוקר אחראי", c["investigator"]), ("נפתח", c["opened_at"]),
        ("מועד אירוע", c["incident_date"]), ("הדוח הופק", content["generated_at"]),
        ("אזור זמן לתצוגה", content["timezone"])])
    s = content["summary"]
    heading("תקציר עיבוד")
    kv([("מוצגים", s["exhibits"]), ("קבצי מדיה", s["media"]), ("חושב Hash", s["hashed"]),
        ("עותקי עבודה מאומתים", s["verified"]), ("ממצאים לבדיקה", s["findings"]), ("משימות עיבוד", s["jobs"])])
    for e in content["exhibits"]:
        heading(f"מוצג {e['identifier']} – {e['label']}", 2)
        kv([("סוג", e["type"]), ("תיאור", e["description"]), ("התקן מקור", e["source_device"]),
            ("מיקום", e["location"]), ("שיטת רכישה", e["acquisition_method"]), ("נרכש", e["acquired_at"]),
            ("נרכש על ידי", e["acquired_by"]), ("אסמכתת אחסון", e["storage_reference"])])
        if e["sources"]:
            table(["סוג מקור", "תיאור", "נתיב", "קבצים", "נפח", "נסרק"],
                  [[x["kind"], x["label"], x["path"], x["file_count"], x["total"], x["scanned"]] for x in e["sources"]])
        if e["custody"]:
            para("שרשרת משמורת", bold=True)
            table(["זמן", "אירוע", "תיאור", "נרשם על ידי"],
                  [[x["time"], x["type"], x["description"], x["by"]] for x in e["custody"]])
    if content["media"]:
        heading("מלאי מדיה וערכי SHA-256")
        para("זמני הקלטה מוצגים לפי שעון המכשיר כפי שנרשמו, ללא תיקון היסט.", size=8)
        table(["מוצג", "קובץ", "מצלמה", "תחילת הקלטה", "משך", "רזולוציה", "קודק", "גודל"],
              [[m["exhibit"], m["path"], m["camera"], m["recorded_start"], m["duration"], m["resolution"], m["codec"],
                m["size"]] for m in content["media"]])
        table(["קובץ", "SHA-256 מקור", "SHA-256 עותק עבודה", "אומת"],
              [[m["path"], m["source_sha256"], m["wc_sha256"], "כן" if m["verified"] else "לא"] for m in content["media"]])
    heading("שלבי עיבוד")
    for j in content["processing"]:
        para(f"משימה #{j['id']} – {j['title']}{' [סימולציה]' if j['simulation'] else ''} | {j['status']} | "
             f"{j['created_by']} | {j['started']} – {j['finished']}", bold=True)
        table(["שלב", "סטטוס", "כלים", "שגיאה"],
              [[x["name"], x["status"], ", ".join(f"{k} {v}" for k, v in x["tools"].items()), x["error"]]
               for x in j["steps"]])
    heading("ממצאים הדורשים בדיקה")
    para("הממצאים להלן הופקו אלגוריתמית ואינם קביעה עובדתית. יש לבחון כל ממצא ידנית.", color=(0xA0, 0x60, 0))
    if content["findings"]:
        table(["סוג", "מצלמה", "התחלה", "סיום", "תיאור", "סטטוס בדיקה"],
              [[f["kind"], f["camera"], f["start"], f["end"], f["description"], f["review"]]
               for f in content["findings"][:400]])
    else:
        para("לא נרשמו ממצאים.")
    heading("שגיאות ואזהרות")
    for e in content["errors"][:200] or ["לא נרשמו שגיאות."]:
        para("• " + e if content["errors"] else e)
    heading("כלים וגרסאות")
    kv(list(content["tools"].items()))
    heading("הבהרה")
    para(content["disclaimer"], size=8)
    if approval:
        heading("אישור")
        kv([("אושר על ידי", approval["by"]), ("מועד אישור", approval["at"]), ("הערה", approval.get("comment", ""))])
    doc.core_properties.title = title
    doc.core_properties.author = "SceneOps AI"
    doc.save(str(path))


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def render_files(db: Session, rev: ReportRevision, approval: Approval | None = None) -> None:
    report = rev.report
    case = db.get(Case, report.case_id)
    base = storage_path(f"reports/{safe_component(case.reference)}/report{report.id}")
    base.mkdir(parents=True, exist_ok=True)
    suffix = "_approved" if approval else ""
    pdf, docx = base / f"r{rev.revision}{suffix}.pdf", base / f"r{rev.revision}{suffix}.docx"
    appr = ({"by": approval.user.full_name, "at": fmt_sys(approval.created_at), "comment": approval.comment}
            if approval else None)
    title = f"{report.title} – תיק {case.reference}"
    render_pdf(rev.content, pdf, title=title, revision=rev.revision, approval=appr)
    render_docx(rev.content, docx, title=title, revision=rev.revision, approval=appr)
    rev.pdf_path, rev.docx_path = storage_relative(pdf), storage_relative(docx)
    rev.pdf_sha256, rev.docx_sha256 = _sha(pdf), _sha(docx)


def generate_report_revision(db: Session, case_id: int, *, user_id: int | None, job_id: int | None = None,
                             report_id: int | None = None, title: str | None = None,
                             note: str = "") -> ReportRevision:
    if report_id:
        report = db.get(Report, report_id)
        if not report or report.case_id != case_id:
            raise ValueError("הדוח לא נמצא בתיק")
    else:
        report = Report(case_id=case_id, title=title or "דוח עיבוד מדיה", created_by_id=user_id)
        db.add(report)
        db.flush()
    report.current_revision += 1
    report.status = ReportStatus.draft
    report.approved_by_id, report.approved_at = None, None
    rev = ReportRevision(report=report, revision=report.current_revision, content=build_content(db, case_id),
                         change_note=note[:500], job_id=job_id, created_by_id=user_id)
    db.add(rev)
    db.flush()
    render_files(db, rev)
    db.commit()
    return rev
