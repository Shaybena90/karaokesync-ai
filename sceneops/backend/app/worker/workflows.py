"""הגדרות תהליכי עבודה (Workflows): שלבים מסודרים, תלויות ומשקלי התקדמות."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class StepDef:
    key: str
    name: str
    weight: float = 1.0
    depends_on: tuple[str, ...] = ()
    max_retries: int = 2


@dataclass(frozen=True)
class WorkflowDef:
    key: str
    name: str
    description: str
    steps: tuple[StepDef, ...]
    scope: str = "exhibit"  # exhibit | source | case | camera
    agent_allowed: bool = False
    exclusive: bool = True
    tags: tuple[str, ...] = field(default_factory=tuple)


INVENTORY = StepDef("inventory", "סריקת מלאי קבצים (קריאה בלבד)", 1)
METADATA = StepDef("metadata", "חילוץ מטא-דאטה (FFprobe)", 1.5)
HASH = StepDef("hash_sources", "חישוב SHA-256 לקבצי המקור", 3)
COPY = StepDef("working_copy", "יצירת עותק עבודה ואימות Hash", 4, ("hash_sources",), max_retries=1)
DERIV = StepDef("derivatives", "תמונות ממוזערות וקבצי תצוגה", 3, ("working_copy",))
INDEX = StepDef("index", "בניית אינדקס מדיה", 0.5)
TIMELINE = StepDef("timeline", "בניית ציר זמן וזיהוי פערים", 0.5)
MOTION = StepDef("motion", "ניתוח תנועה (OpenCV)", 3)
REPORT = StepDef("report", "הפקת טיוטת דוח", 1)
VERIFY = StepDef("verify_integrity", "אימות שלמות (חישוב Hash חוזר)", 3, max_retries=0)
SIM_EXPORT = StepDef("sim_export", "ייצוא הקלטות מדומה מהמכשיר", 2, max_retries=0)


WORKFLOWS: dict[str, WorkflowDef] = {w.key: w for w in [
    WorkflowDef("drive_scan", "סריקת כונן", "סריקת מקור מורשה לקריאה בלבד ובניית מלאי קבצים עם מטא-דאטה.",
                (INVENTORY, StepDef("metadata", METADATA.name, 1.5, ("inventory",))), scope="source", agent_allowed=True),
    WorkflowDef("full_media", "טיפול מלא במדיה",
                "סריקה, העתקה מאומתת, Hash, אינדקס, ציר זמן, ניתוח תנועה וטיוטת דוח.",
                (INVENTORY, StepDef("hash_sources", HASH.name, 3, ("inventory",)), COPY,
                 StepDef("metadata", METADATA.name, 1.5, ("working_copy",)), DERIV,
                 StepDef("index", INDEX.name, 0.5, ("metadata",)), StepDef("timeline", TIMELINE.name, 0.5, ("index",)),
                 StepDef("motion", MOTION.name, 3, ("working_copy",)), REPORT), scope="source"),
    WorkflowDef("hash", "חישוב Hash", "חישוב SHA-256 בזרימה לכל קבצי המקור שטרם חושבו.", (HASH,),
                scope="exhibit", agent_allowed=True),
    WorkflowDef("working_copy", "יצירת עותק עבודה מאומת",
                "העתקה לאחסון המאושר, אימות התאמת Hash ויצירת נגזרות מהעותק בלבד.",
                (HASH, COPY, DERIV), scope="exhibit", agent_allowed=True),
    WorkflowDef("index", "יצירת אינדקס", "חילוץ מטא-דאטה ועדכון אינדקס המדיה לחיפוש.",
                (METADATA, StepDef("index", INDEX.name, 0.5, ("metadata",))), scope="exhibit", agent_allowed=True),
    WorkflowDef("timeline", "יצירת ציר זמן", "בניית ציר זמן לפי מצלמה וסימון פערים ואי-התאמות זמן לבדיקה.",
                (TIMELINE,), scope="case", exclusive=False),
    WorkflowDef("motion", "ניתוח תנועה", "זיהוי מקטעי תנועה בעותקי העבודה – מועמדים לבדיקה ידנית בלבד.",
                (MOTION,), scope="exhibit"),
    WorkflowDef("report", "הפקת דוח", "הפקת טיוטת דוח PDF ו-DOCX מנתוני התיק השמורים.", (REPORT,),
                scope="case", agent_allowed=True, exclusive=False),
    WorkflowDef("case_integrity", "בדיקת שלמות תיק", "חישוב Hash חוזר לעותקי העבודה ולמקורות והשוואה לרישום.",
                (VERIFY,), scope="case", exclusive=False),
    WorkflowDef("camera_export_sim", "ייצוא הקלטות (סימולציה)",
                "ייצוא מדומה ממכשיר DVR/NVR רשום, עם תיעוד, Hash ועותק עבודה. אין חיבור למכשיר אמיתי.",
                (SIM_EXPORT, StepDef("inventory", INVENTORY.name, 1, ("sim_export",)),
                 StepDef("hash_sources", HASH.name, 3, ("inventory",)), COPY,
                 StepDef("metadata", METADATA.name, 1.5, ("working_copy",)), DERIV), scope="camera"),
]}

AGENT_ALLOWED = {k for k, w in WORKFLOWS.items() if w.agent_allowed}
