import type { RoomDef } from '../../types'
import { doc, placeOnPhoto } from './kit'

const PEOPLE = [
  { id: 'smadar', label: 'סמדר', icon: '👩‍💼' },
  { id: 'yoav', label: 'יואב', icon: '👨‍💻' },
  { id: 'adi', label: 'עדי', icon: '🧹' },
  { id: 'nadav', label: 'נדב', icon: '✈️' },
]

/** "מישהו שינה את הראיות" — an investigation board: open, zoom, compare and link evidence. */
export const evidence: RoomDef = {
  id: 'evidence',
  version: 1,
  title: 'מישהו שינה את הראיות',
  emoji: '🕵️',
  category: 'חדרי בריחה',
  length: '25–30 דקות',
  difficultyLabel: 'בינונית',
  players: 1,
  presentation: 'board',
  blurb: 'התיק נגד סמדר נראה סגור. קצת יותר מדי סגור.',
  story: 'בלילה שבין רביעי לחמישי נמחק מסמך רגיש משרת החברה. כל הראיות מצביעות על סמדר, מנהלת הפרויקט. נעלתם את עצמכם בחדר החקירות עם לוח הראיות, ואתם לא יוצאים עד שהתמונה ברורה.',
  goal: 'לבדוק כל ראיה, לגלות מה זויף ומי זייף, להצמיד לחשוד את הראיות שמוכיחות זאת — ולפתוח את דלת חדר החקירות.',
  photo: { src: 'rooms/evidence.webp', size: [1672, 941], views: { docs: [0, 0, 1672, 941], photos: [0, 300, 760, 520], testimony: [600, 300, 560, 330], logs: [900, 150, 772, 620], conclusions: [0, 0, 1672, 941] } },
  illustration: { art: 'board', theme: 'office' },
  scenes: [
    { id: 'docs', name: 'מסמכים', theme: 'office', icon: '📄' },
    { id: 'photos', name: 'תמונות', theme: 'office', icon: '📷' },
    { id: 'testimony', name: 'עדויות', theme: 'office', icon: '🗣️' },
    { id: 'logs', name: 'יומנים', theme: 'office', icon: '🗂️' },
    { id: 'conclusions', name: 'מסקנות', theme: 'office', icon: '📌' },
  ],
  items: [],
  notebookEntries: [
    { id: 'case', text: 'המקרה: מסמך נמחק מהשרת. החשודה הרשמית: סמדר.' },
    { id: 'badge', text: 'יומן הכרטיסים: סמדר יוצאת 19:42 · עדי נכנסת 20:55 · יואב נכנס 21:05 · יואב בחדר השרתים 21:12 · יואב יוצא 21:58.' },
    { id: 'timeline', text: 'ציר הזמן: סמדר יצאה לפני כולם (19:42). יואב היה בבניין 21:05–21:58.' },
    { id: 'photo', text: 'תמונת האבטחה: ״סמדר בחדר השרתים, 20:15״. הדמות בתמונה מטושטשת.' },
    { id: 'clock', text: 'בהגדלה: שעון הקיר בתמונה מראה 21:12 — לא 20:15.' },
    { id: 'photofake', text: 'חותמת הזמן בתמונה זויפה. השעה האמיתית: 21:12 — אז יואב נכנס לחדר השרתים.' },
    { id: 'report1', text: 'דוח האבטחה, גרסה 1 (21:30): ״ב־21:12 נכנס לחדר השרתים: יואב.״' },
    { id: 'report2', text: 'דוח האבטחה, גרסה 2 (21:52): ״ב־21:12 נכנסה לחדר השרתים: סמדר.״' },
    { id: 'reportchange', text: 'ההבדל בין הגרסאות: רק שם מי שנכנס לחדר השרתים.' },
    { id: 'rights', text: 'הרשאות עריכה לדוח: יואב, נדב.' },
    { id: 'activity', text: 'יומן הפעילות: 21:50 — הדוח נערך מהחשבון של יואב, ממחשב בתוך הבניין.' },
    { id: 'boarding', text: 'כרטיס עלייה: נדב, טיסה לברלין ב־18:30.' },
    { id: 'editor', text: 'מי ששינה את הדוח: יואב.' },
    { id: 'tadi', text: 'עדי (המנקה): ״רק יואב עבר במסדרון בין 21:00 ל־21:30.״' },
    { id: 'tyoav', text: 'יואב: ״יצאתי ב־21:00 ולא חזרתי.״' },
    { id: 'liar', text: 'העדות של יואב שקרית — יומן הכרטיסים ועדות עדי סותרים אותה.' },
  ],
  hotspots: [
    // ── מסמכים ──
    doc('brief', 'docs', 'תיק החקירה', '📁', 'פתחו קודם', [{ type: 'note', note: { title: 'תיק החקירה', style: 'paper', notebook: 'case', text: '״בליל רביעי נמחק מסמך רגיש משרת החברה. ראיות: תמונת אבטחה, דוח אבטחה ויומני מערכת. החשודה: סמדר, מנהלת הפרויקט.\nהמשימה: לוודא שהראיות אמינות.״' } }]),
    doc('report1', 'docs', 'דוח אבטחה — גרסה 1', '📝', 'נשמר 21:30', [{ type: 'note', note: { title: 'דוח אבטחה — גרסה 1 (21:30)', style: 'paper', zoom: true, notebook: 'report1', text: '״סיור שגרתי. 21:12 — נכנס לחדר השרתים: יואב. לא נרשמו חריגות.\nחתום: מוקד האבטחה.״' } }], { visibleWhen: ['solved:phototime'] }),
    doc('report2', 'docs', 'דוח אבטחה — גרסה 2', '📝', 'נשמר 21:52', [{ type: 'note', note: { title: 'דוח אבטחה — גרסה 2 (21:52)', style: 'paper', zoom: true, notebook: 'report2', text: '״סיור שגרתי. 21:12 — נכנסה לחדר השרתים: סמדר. לא נרשמו חריגות.\nחתום: מוקד האבטחה.״' } }], { visibleWhen: ['solved:phototime'] }),
    doc('rights', 'docs', 'הרשאות עריכה', '🔑', 'מי יכול לשנות את הדוח', [{ type: 'note', note: { title: 'הרשאות עריכה — דוחות אבטחה', style: 'paper', notebook: 'rights', text: 'הרשאת עריכה: יואב (אבטחת מידע), נדב (מנהל מערכות).\nלסמדר ולעדי — הרשאת צפייה בלבד.' } }], { visibleWhen: ['solved:reportdiff'] }),
    doc('boarding', 'docs', 'כרטיס עלייה למטוס', '🎫', 'נמצא במגירה של נדב', [{ type: 'note', note: { title: 'כרטיס עלייה למטוס', style: 'paper', zoom: true, notebook: 'boarding', text: 'נוסע: נדב · טיסה לברלין · יום רביעי 18:30 · השער נסגר 18:10.' } }], { visibleWhen: ['solved:reportdiff'] }),
    // ── תמונות ──
    doc('photo', 'photos', 'תמונת אבטחה', '📷', '״סמדר בחדר השרתים״', [
      { type: 'reveal', tool: 'magnifier', at: { x: 72, y: 24 }, note: { title: 'תמונת אבטחה', zoom: true, notebook: 'photo', text: 'כיתוב: ״סמדר בחדר השרתים — 20:15״. הדמות מטושטשת. ברקע, על הקיר, שעון קטן מדי לקריאה.' }, hidden: 'השעון על הקיר: 21:12', onReveal: { message: 'בהגדלה: השעון בתמונה מראה 21:12!', notebook: ['clock'] } },
      { type: 'note', note: { title: 'תמונת אבטחה', zoom: true, notebook: 'clock', text: 'כיתוב: ״סמדר בחדר השרתים — 20:15״. אבל השעון על הקיר בתמונה מראה 21:12.' } },
    ]),
    doc('lobbycam', 'photos', 'מצלמת הלובי', '🎥', 'יציאה מהבניין', [{ type: 'note', note: { title: 'מצלמת הלובי', zoom: true, text: 'סמדר יוצאת מהבניין עם תיק ומטריה. שעון הלובי: 19:42.' } }]),
    // ── עדויות ──
    doc('tsmadar', 'testimony', 'עדות סמדר', '👩‍💼', 'מנהלת הפרויקט', [{ type: 'note', note: { title: 'עדות סמדר', style: 'paper', text: '״יצאתי קצת לפני שמונה. לא הייתי בחדר השרתים כבר שבוע.״' } }]),
    doc('tyoav', 'testimony', 'עדות יואב', '👨‍💻', 'אבטחת מידע', [{ type: 'note', note: { title: 'עדות יואב', style: 'paper', notebook: 'tyoav', text: '״יצאתי בדיוק ב־21:00 ולא חזרתי. ראיתי את סמדר נכנסת לחדר השרתים.״' } }]),
    doc('tadi', 'testimony', 'עדות עדי', '🧹', 'צוות הניקיון', [{ type: 'note', note: { title: 'עדות עדי', style: 'paper', notebook: 'tadi', text: '״ניקיתי את הקומה מ־21:00. בין 21:00 ל־21:30 רק יואב עבר במסדרון. סמדר כבר לא הייתה.״' } }]),
    doc('tnadav', 'testimony', 'עדות נדב', '✈️', 'מנהל מערכות', [{ type: 'note', note: { title: 'עדות נדב', style: 'paper', text: '״הייתי בדרך לברלין. נחתתי רק בבוקר.״' } }]),
    // ── יומנים ──
    doc('badgelog', 'logs', 'יומן כרטיסי הכניסה', '🪪', 'לילה של רביעי', [{ type: 'note', note: { title: 'יומן כרטיסי הכניסה', style: 'screen', zoom: true, notebook: 'badge', text: '21:12 — יואב — חדר השרתים\n19:42 — סמדר — יציאה\n21:58 — יואב — יציאה\n20:55 — עדי — כניסה\n21:05 — יואב — כניסה' } }]),
    doc('activity', 'logs', 'יומן פעילות המערכת', '🖥️', 'שינויים בקבצים', [{ type: 'note', note: { title: 'יומן פעילות המערכת', style: 'screen', zoom: true, notebook: 'activity', text: '21:30 — ״דוח אבטחה״ נשמר (מוקד)\n21:47 — ״מסמך פרויקט״ נמחק (חשבון: smadar — סיסמה אופסה ב־21:44 מחשבון yoav)\n21:50 — ״דוח אבטחה״ נערך (חשבון: yoav, מחשב פנימי)\n21:51 — ״תמונת אבטחה״ — חותמת זמן שונתה (חשבון: yoav)' } }], { visibleWhen: ['solved:reportdiff'] }),
    // ── מסקנות ──
    doc('timeline', 'conclusions', 'ציר הזמן', '🕒', 'סדרו את האירועים', [
      { type: 'note', when: ['solved:timeline'], note: { title: 'ציר הזמן', notebook: 'timeline', text: '19:42 סמדר יוצאת ← 20:55 עדי נכנסת ← 21:05 יואב נכנס ← 21:12 יואב בחדר השרתים ← 21:58 יואב יוצא.' } },
      { type: 'lock', title: 'ציר הזמן', prompt: 'סדרו את האירועים מהמוקדם למאוחר.', lock: { kind: 'sequence', options: [{ id: 'yoav_srv', label: 'יואב נכנס לחדר השרתים' }, { id: 'smadar_out', label: 'סמדר יוצאת מהבניין' }, { id: 'yoav_out', label: 'יואב יוצא מהבניין' }, { id: 'adi_in', label: 'עדי נכנסת לבניין' }, { id: 'yoav_in', label: 'יואב נכנס לבניין' }], answer: ['smadar_out', 'adi_in', 'yoav_in', 'yoav_srv', 'yoav_out'] }, onSolve: { message: 'ציר הזמן מוצמד ללוח: סמדר יצאה הרבה לפני שמשהו קרה.', notebook: ['timeline'] } },
    ]),
    doc('phototime', 'conclusions', 'השעה האמיתית בתמונה', '⏱️', 'מתי באמת צולמה?', [
      { type: 'note', when: ['solved:phototime'], note: { title: 'השעה האמיתית בתמונה', notebook: 'photofake', text: 'התמונה צולמה ב־21:12 — בדיוק כשיואב נכנס לחדר השרתים. חותמת הזמן זויפה.' } },
      { type: 'lock', title: 'השעה האמיתית בתמונה', prompt: 'מה השעה האמיתית שבה צולמה התמונה? (4 ספרות)', lock: { kind: 'digits', length: 4, answer: '2112' }, onSolve: { message: 'חותמת הזמן זויפה! בתיקייה הופיעו שתי גרסאות של דוח האבטחה.', notebook: ['photofake'] } },
    ], { visibleWhen: ['solved:timeline'] }),
    doc('reportdiff', 'conclusions', 'השוואת הדוחות', '🔍', 'מה שונה?', [
      { type: 'note', when: ['solved:reportdiff'], note: { title: 'השוואת הדוחות', notebook: 'reportchange', text: 'בין 21:30 ל־21:52 שונה רק שם מי שנכנס לחדר השרתים: מ״יואב״ ל״סמדר״.' } },
      { type: 'lock', title: 'השוואת הדוחות', prompt: 'מה השתנה בין גרסה 1 לגרסה 2?', lock: { kind: 'choice', options: [{ id: 'time', label: 'שעת הכניסה' }, { id: 'name', label: 'שם מי שנכנס לחדר השרתים' }, { id: 'room', label: 'החדר' }, { id: 'sign', label: 'החתימה' }], answer: 'name', feedback: { time: 'בשתי הגרסאות כתוב 21:12.', room: 'בשתי הגרסאות מדובר בחדר השרתים.', sign: 'שתיהן חתומות בידי מוקד האבטחה.' } }, onSolve: { message: 'מישהו החליף שם בדוח! נוספו ללוח: הרשאות, יומן פעילות וכרטיס עלייה.', notebook: ['reportchange'] } },
    ], { visibleWhen: ['solved:phototime'] }),
    doc('editor', 'conclusions', 'מי שינה את הדוח?', '✍️', 'מי יכול, ומי עשה', [
      { type: 'note', when: ['solved:editor'], note: { title: 'מי שינה את הדוח?', notebook: 'editor', text: 'יואב: יש לו הרשאה, היה בבניין, והיומן מראה עריכה מהחשבון שלו ב־21:50.' } },
      { type: 'lock', title: 'מי שינה את הדוח?', prompt: 'מי ערך את דוח האבטחה?', lock: { kind: 'choice', options: PEOPLE, answer: 'yoav', feedback: { smadar: 'לסמדר יש הרשאת צפייה בלבד.', adi: 'לעדי יש הרשאת צפייה בלבד.', nadav: 'לנדב יש הרשאה — אבל באותה שעה הוא היה בטיסה.' } }, onSolve: { message: 'הדוח שונה מהחשבון של יואב, מתוך הבניין.', notebook: ['editor'] } },
    ], { visibleWhen: ['solved:reportdiff'] }),
    doc('liar', 'conclusions', 'עדות שקרית', '🤥', 'עדות + ראיות שסותרות', [
      { type: 'note', when: ['solved:liar'], note: { title: 'עדות שקרית', notebook: 'liar', text: 'יואב טען שיצא ב־21:00 — אבל יומן הכרטיסים ועדי מראים שהיה בבניין עד 21:58.' } },
      { type: 'lock', title: 'עדות שקרית', prompt: 'איזו עדות שקרית? בחרו אותה והצמידו את הראיות שסותרות אותה.', lock: { kind: 'accuse', suspects: [{ id: 'tsmadar', label: 'עדות סמדר' }, { id: 'tyoav', label: 'עדות יואב' }, { id: 'tadi', label: 'עדות עדי' }, { id: 'tnadav', label: 'עדות נדב' }], evidence: [{ id: 'badgelog', label: 'יומן הכרטיסים', icon: '🪪' }, { id: 'tadi', label: 'עדות עדי', icon: '🧹' }, { id: 'lobbycam', label: 'מצלמת הלובי', icon: '🎥' }, { id: 'boarding', label: 'כרטיס העלייה', icon: '🎫' }], answer: 'tyoav', required: ['badgelog', 'tadi'] }, onSolve: { message: 'העדות של יואב הופרכה.', notebook: ['liar'] } },
    ], { visibleWhen: ['solved:editor'] }),
    doc('accuse', 'conclusions', 'האשמה', '⚖️', 'חשוד + שלוש ראיות', [
      { type: 'note', when: ['solved:accuse'], note: { title: 'האשמה', text: 'יואב זייף את חותמת הזמן בתמונה, שינה את השם בדוח ומחק את המסמך מהחשבון של סמדר. התיק נגדה מבוטל.' } },
      { type: 'lock', title: 'האשמה', prompt: 'מי שינה את הראיות? בחרו חשוד והצמידו את שלוש הראיות שמוכיחות את השינוי.', lock: { kind: 'accuse', suspects: PEOPLE, evidence: [{ id: 'photo', label: 'התמונה עם השעה המזויפת', icon: '📷' }, { id: 'reportchange', label: 'השינוי בדוח', icon: '📝' }, { id: 'activity', label: 'יומן הפעילות', icon: '🖥️' }, { id: 'lobbycam', label: 'מצלמת הלובי', icon: '🎥' }, { id: 'boarding', label: 'כרטיס העלייה', icon: '🎫' }], answer: 'yoav', required: ['photo', 'reportchange', 'activity'] }, onSolve: { message: 'ההאשמה הוכחה. על הדלת נדלקה מקלדת.' } },
    ], { visibleWhen: ['solved:liar'] }),
    doc('exit', 'conclusions', 'דלת חדר החקירות', '🚪', 'קוד: שעת שינוי הדוח', [
      { type: 'lock', title: 'דלת חדר החקירות', prompt: '״קוד היציאה: השעה שבה שונה דוח האבטחה (4 ספרות).״', lock: { kind: 'digits', length: 4, answer: '2150' }, onSolve: { message: 'הדלת נפתחה. סמדר מנוקה מכל חשד — פתרתם את התיק!', escape: true } },
    ], { visibleWhen: ['solved:accuse'] }),
  ],
  hints: [],
  puzzles: [
    { id: 'evidence-1', name: 'ציר הזמן', sees: 'יומן כרטיסים מבולגן וכרטיס ״ציר הזמן״ בלוח המסקנות.', doneWhen: 'solved:timeline', solution: 'סמדר יוצאת ← עדי נכנסת ← יואב נכנס ← יואב בחדר השרתים ← יואב יוצא', explanation: 'מסדרים את שורות יומן הכרטיסים לפי השעה: 19:42, 20:55, 21:05, 21:12, 21:58.', hints: ['ביומנים — יומן כרטיסי הכניסה.', 'השורות לא לפי הסדר; סדרו לפי השעה.', 'סמדר, עדי, יואב נכנס, יואב בשרתים, יואב יוצא.'], after: 'נפתח כרטיס ״השעה האמיתית בתמונה״.', wrong: '״הסדר לא תואם ליומן״ (נספר).' },
    { id: 'evidence-2', name: 'התמונה', sees: 'תמונת אבטחה עם הכיתוב ״20:15״ ושעון קטן ברקע.', availableWhen: ['solved:timeline'], doneWhen: 'solved:phototime', solution: '2112', explanation: 'בעזרת זכוכית המגדלת רואים ששעון הקיר בתמונה מראה 21:12 — חותמת הזמן 20:15 שקרית.', hints: ['יש בתמונה פרט קטן מדי לקריאה.', 'השתמשו בזכוכית המגדלת על השעון שבפינה.', '21:12.'], after: 'מופיעות שתי גרסאות של דוח האבטחה.', wrong: '״השעה לא תואמת״ (נספר).' },
    { id: 'evidence-3', name: 'שתי גרסאות', sees: 'שתי גרסאות של דוח האבטחה שנשמרו בהפרש של 22 דקות.', availableWhen: ['solved:phototime'], doneWhen: 'solved:reportdiff', solution: 'שם מי שנכנס לחדר השרתים', explanation: 'בהשוואה, הכול זהה — חוץ מהשם: ״יואב״ הפך ל״סמדר״.', hints: ['השוו את שתי הגרסאות זו לצד זו.', 'השעה, החדר והחתימה זהים.', 'השם.'], after: 'נוספים: הרשאות עריכה, יומן פעילות וכרטיס עלייה.', wrong: 'הסבר קצר למה זה לא ההבדל (נספר).' },
    { id: 'evidence-4', name: 'מי ערך', sees: 'הרשאות, יומן פעילות וכרטיס עלייה.', availableWhen: ['solved:reportdiff'], doneWhen: 'solved:editor', solution: 'יואב', explanation: 'רק ליואב ולנדב יש הרשאת עריכה. נדב היה בטיסה ב־18:30, והיומן מראה עריכה מהחשבון של יואב ב־21:50 מתוך הבניין.', hints: ['מי בכלל יכול לערוך?', 'מבין השניים — מי לא היה בארץ?', 'יואב.'], after: 'נפתח כרטיס ״עדות שקרית״.', wrong: 'הסבר למה האדם הזה לא יכול היה לערוך (נספר).' },
    { id: 'evidence-5', name: 'העדות השקרית', sees: 'ארבע עדויות, וחלקן סותרות את היומנים.', availableWhen: ['solved:editor'], doneWhen: 'solved:liar', solution: 'עדות יואב · ראיות: יומן הכרטיסים + עדות עדי', explanation: 'יואב טוען שיצא ב־21:00. יומן הכרטיסים מראה שיצא ב־21:58, ועדי ראתה אותו במסדרון בין 21:00 ל־21:30.', hints: ['איזו עדות לא מסתדרת עם ציר הזמן?', 'צריך שתי ראיות שסותרות אותה.', 'עדות יואב + יומן הכרטיסים + עדות עדי.'], after: 'נפתח כרטיס ״האשמה״.', wrong: '״הראיות לא סותרות את העדות״ או ״חסרה ראיה״ (נספר).' },
    { id: 'evidence-6', name: 'האשמה ויציאה', sees: 'כרטיס האשמה: חשוד ושלוש ראיות, ואחריו דלת עם קוד.', availableWhen: ['solved:liar'], doneWhen: 'escaped', solution: 'יואב + התמונה + השינוי בדוח + יומן הפעילות; קוד 2150', explanation: 'שלוש הראיות מראות את השינויים עצמם (חותמת זמן, שם בדוח, עריכה מהחשבון שלו). הקוד הוא שעת עריכת הדוח: 21:50.', hints: ['אילו ראיות מראות שהראיות שונו?', 'תמונה, דוח, יומן פעילות. ואז — מתי נערך הדוח?', 'יואב; 2150.'], after: 'התיק נסגר. סוף החדר.', wrong: '״ההאשמה לא מוכחת״ (נספר).' },
  ],
  walkthrough: [
    { read: 'brief' },
    { read: 'badgelog' },
    { solve: 'timeline', input: 'smadar_out,adi_in,yoav_in,yoav_srv,yoav_out' },
    { reveal: 'photo' },
    { solve: 'phototime', input: '2112' },
    { read: 'report1' },
    { read: 'report2' },
    { solve: 'reportdiff', input: 'name' },
    { read: 'rights' },
    { read: 'activity' },
    { read: 'boarding' },
    { solve: 'editor', input: 'yoav' },
    { read: 'tyoav' },
    { read: 'tadi' },
    { solve: 'liar', input: 'tyoav|badgelog,tadi' },
    { solve: 'accuse', input: 'yoav|photo,reportchange,activity' },
    { solve: 'exit', input: '2150' },
  ],
}

// where each object is in the room's image (pixels of the 1672×941 image)
placeOnPhoto(evidence.hotspots, {
  brief: [460, 600, 285, 56], report1: [185, 665, 225, 175], report2: [415, 660, 225, 128], rights: [1195, 185, 130, 420], boarding: [1420, 700, 252, 140],
  photo: [65, 365, 275, 260], lobbycam: [345, 365, 310, 255],
  tsmadar: [668, 378, 85, 108], tyoav: [752, 378, 85, 108], tadi: [836, 378, 85, 108], tnadav: [918, 378, 88, 108],
  badgelog: [970, 250, 135, 100], activity: [1525, 540, 147, 150],
  timeline: [780, 118, 305, 100], phototime: [755, 245, 212, 90], reportdiff: [430, 795, 175, 135], editor: [1020, 362, 135, 105], liar: [1100, 128, 90, 112], accuse: [1330, 505, 190, 150], exit: [1395, 110, 277, 390],
})
