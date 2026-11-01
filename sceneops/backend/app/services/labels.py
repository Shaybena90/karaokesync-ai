"""תוויות עבריות לערכי enum – משמשות בדוחות ובממשק."""
CASE_STATUS = {"open": "פתוח", "in_progress": "בטיפול", "pending_review": "ממתין לבדיקה", "closed": "סגור",
               "archived": "בארכיון"}
PRIORITY = {"low": "נמוכה", "medium": "בינונית", "high": "גבוהה", "critical": "דחופה"}
EXHIBIT_TYPE = {"dvr": "מכשיר DVR/NVR", "storage_drive": "כונן אחסון", "folder": "תיקיית קבצים",
                "removable": "התקן נשלף", "mobile": "מכשיר נייד", "other": "אחר"}
EXHIBIT_STATUS = {"registered": "נרשם", "processing": "בעיבוד", "processed": "עובד", "released": "שוחרר"}
SOURCE_KIND = {"folder": "תיקייה מקומית", "removable_drive": "כונן נשלף", "dvr_export": "ייצוא DVR",
               "simulated_export": "ייצוא מדומה (סימולציה)"}
CUSTODY_TYPE = {"received": "התקבל", "acquired": "נרכש", "transferred": "הועבר", "hashed": "חושב Hash",
                "copied": "הועתק", "verified": "אומת", "exported": "יוצא", "stored": "אוחסן", "returned": "הוחזר"}
JOB_STATUS = {"awaiting_approval": "ממתין לאישור", "queued": "בתור", "running": "בתהליך",
              "cancel_requested": "בביטול", "cancelled": "בוטל", "succeeded": "הושלם", "failed": "נכשל"}
STEP_STATUS = {"pending": "ממתין", "running": "רץ", "succeeded": "הושלם", "failed": "נכשל", "skipped": "דולג",
               "cancelled": "בוטל"}
FINDING_KIND = {"motion": "תנועה", "gap": "פער הקלטה אפשרי", "time_inconsistency": "אי-התאמת זמן אפשרית",
                "integrity": "חריגת שלמות"}
REVIEW_STATUS = {"candidate": "מועמד לבדיקה", "confirmed": "אושר בבדיקה", "rejected": "נדחה בבדיקה"}
REPORT_STATUS = {"draft": "טיוטה", "in_review": "בבדיקה", "approved": "מאושר", "rejected": "נדחה"}
