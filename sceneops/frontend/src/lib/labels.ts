export const CASE_STATUS: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", pending_review: "ממתין לבדיקה", closed: "סגור", archived: "בארכיון",
};
export const PRIORITY: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה", critical: "דחופה" };
export const EXHIBIT_TYPE: Record<string, string> = {
  dvr: "מכשיר DVR/NVR", storage_drive: "כונן אחסון", folder: "תיקיית קבצים", removable: "התקן נשלף",
  mobile: "מכשיר נייד", other: "אחר",
};
export const EXHIBIT_STATUS: Record<string, string> = {
  registered: "נרשם", processing: "בעיבוד", processed: "עובד", released: "שוחרר",
};
export const SOURCE_KIND: Record<string, string> = {
  folder: "תיקייה מקומית", removable_drive: "כונן נשלף", dvr_export: "ייצוא DVR", simulated_export: "ייצוא מדומה",
};
export const CUSTODY_TYPE: Record<string, string> = {
  received: "התקבל", acquired: "נרכש", transferred: "הועבר", hashed: "חושב Hash", copied: "הועתק",
  verified: "אומת", exported: "יוצא", stored: "אוחסן", returned: "הוחזר",
};
export const JOB_STATUS: Record<string, string> = {
  awaiting_approval: "ממתין לאישור", queued: "בתור", running: "בתהליך", cancel_requested: "בביטול",
  cancelled: "בוטל", succeeded: "הושלם", failed: "נכשל",
};
export const STEP_STATUS: Record<string, string> = {
  pending: "ממתין", running: "רץ", succeeded: "הושלם", failed: "נכשל", skipped: "דולג", cancelled: "בוטל",
};
export const MEDIA_TYPE: Record<string, string> = { video: "וידאו", image: "תמונה", audio: "שמע", other: "אחר" };
export const MEDIA_STATUS: Record<string, string> = {
  inventoried: "במלאי", hashed: "חושב Hash", copied: "הועתק", verified: "אומת", indexed: "באינדקס", error: "שגיאה",
};
export const FINDING_KIND: Record<string, string> = {
  motion: "תנועה", gap: "פער הקלטה אפשרי", time_inconsistency: "אי-התאמת זמן", integrity: "חריגת שלמות",
};
export const REVIEW_STATUS: Record<string, string> = {
  candidate: "מועמד לבדיקה", confirmed: "אושר בבדיקה", rejected: "נדחה בבדיקה",
};
export const REPORT_STATUS: Record<string, string> = {
  draft: "טיוטה", in_review: "בבדיקה", approved: "מאושר", rejected: "נדחה",
};
export const CAMERA_STATUS: Record<string, string> = {
  unknown: "לא נבדק", online: "מגיב (סימולציה)", offline: "לא מגיב", error: "שגיאה",
};
export const ADAPTER: Record<string, string> = {
  simulated: "סימולציה", onvif_profile_g: "ONVIF Profile G (עתידי)", vendor_sdk: "SDK יצרן (עתידי)",
};
export const AUDIT_ENTITY: Record<string, string> = {
  case: "תיק", exhibit: "מוצג", job: "משימה", camera: "מכשיר", report: "דוח", source: "מקור", media: "מדיה",
  user: "משתמש", setting: "הגדרה", root: "נתיב", agent: "סוכן", finding: "ממצא",
};
