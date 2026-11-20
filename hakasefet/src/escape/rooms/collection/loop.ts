import type { Interaction, RoomDef } from '../../types'

const announce = (min: number, text: string, notebook: string): Interaction => ({
  type: 'note',
  when: [`min:${min}`],
  note: { title: `רמקול המעבדה · דקה ${min}`, style: 'screen', notebook, text, voice: { effect: 'computer', pitch: 0.8, lines: [text] } },
})

/** "שבע דקות לאחור" — a 7-minute time loop: objects reset, the evidence notebook stays. */
export const loop: RoomDef = {
  id: 'loop',
  version: 1,
  title: 'שבע דקות לאחור',
  emoji: '⏳',
  category: 'חדרי בריחה',
  length: '25–35 דקות',
  difficultyLabel: 'קשה',
  players: 1,
  blurb: 'כל שבע דקות הכול מתחיל מחדש. כמעט הכול.',
  story: 'התעוררתם במעבדת ״כרונו״. על הקיר שעון שמראה 0:00, ואז מתחיל לרוץ. בדקה השביעית האור מהבהב — וחוזרים לאותו רגע בדיוק. החפצים חוזרים למקומם, אבל מה שלמדתם נשאר איתכם, במחברת.',
  goal: 'ללמוד מה קורה בכל דקה בלולאה, ולבצע בלולאה אחת את הצעדים הנכונים — בזמנים הנכונים — כדי לפתוח את דלת המעבדה.',
  loop: { minutes: 7, persist: ['schedule', 'terminal'] },
  illustration: { art: 'clock', theme: 'lab' },
  scenes: [
    { id: 'room', name: 'חדר הניסוי', theme: 'lab' },
    { id: 'servers', name: 'חדר השרתים', theme: 'lab' },
  ],
  items: [
    { id: 'fuse', name: 'נתיך', icon: '🔌', note: { title: 'נתיך', text: 'נתיך זכוכית קטן. נראה שהוא מתאים ללוח של הדלת.' } },
  ],
  notebookEntries: [
    { id: 'clock', text: 'על לוח השעון חרוט: ◆ = המגירה.' },
    { id: 'm0', text: 'דקה 0–1: ״הניסוי מתחיל. בדקה 2 ישתחרר המגנט של המגירה.״' },
    { id: 'm2', text: 'דקה 2–3: ״המגירה פתוחה. בדקה 4 ייפתח קו B.״' },
    { id: 'm4', text: 'דקה 4: ״קו B פתוח — הנתב מקבל קוד. בדקה 5 — הפסקת חשמל.״' },
    { id: 'm5', text: 'דקה 5: ״הפסקת חשמל. לוח הדלת עובר לסוללה.״' },
    { id: 'm6', text: 'דקה 6: ״אזהרה: איפוס בעוד פחות מדקה.״' },
    { id: 'glow', text: 'בחושך (דקה 5) זוהר על הקיר: ״...ואחריהן 1, 5״ ו״● = הדלת״.' },
    { id: 'router', text: 'על הנתב מדבקה: ▲. הוא מבקש קוד של 5 ספרות.' },
    { id: 'sched', text: 'סדר הלולאה: מגירה (2) ← קו B (4) ← הפסקת חשמל (5) ← איפוס (6–7).' },
    { id: 'drawer', text: 'במגירה: פתק ״3, 1, 4...״ ונתיך.' },
    { id: 'plan', text: 'המסוף: ◆ ▲ ● — מגירה, נתב, דלת. הכול בלולאה אחת.' },
  ],
  hotspots: [
    // ── חדר הניסוי ──
    { id: 'clock', scene: 'room', name: 'שעון הניסוי', art: 'clock', x: 340, y: 40, w: 130, h: 130, interactions: [{ type: 'note', note: { title: 'שעון הניסוי', notebook: 'clock', text: 'השעון סופר מ־0:00 עד 7:00 — ואז חוזר. על הלוח חרוט: ״◆ = המגירה״.' } }] },
    {
      id: 'intercom', scene: 'room', name: 'רמקול המעבדה', art: 'radio', x: 60, y: 70, w: 140, h: 120,
      interactions: [
        announce(0, 'הניסוי מתחיל. בדקה 2 ישתחרר המגנט של המגירה.', 'm0'),
        announce(1, 'הניסוי מתחיל. בדקה 2 ישתחרר המגנט של המגירה.', 'm0'),
        announce(2, 'המגירה פתוחה. בדקה 4 ייפתח קו B.', 'm2'),
        announce(3, 'המגירה פתוחה. בדקה 4 ייפתח קו B.', 'm2'),
        announce(4, 'קו B פתוח — הנתב מקבל קוד. בדקה 5 — הפסקת חשמל.', 'm4'),
        announce(5, 'הפסקת חשמל. לוח הדלת עובר לסוללה.', 'm5'),
        { type: 'note', note: { title: 'רמקול המעבדה · דקה 6', style: 'screen', notebook: 'm6', text: 'אזהרה: איפוס בעוד פחות מדקה.', voice: { effect: 'computer', pitch: 0.8, lines: ['אזהרה. איפוס בעוד פחות מדקה.'] } } },
      ],
    },
    {
      id: 'drawer', scene: 'room', name: 'מגירה מגנטית', art: 'drawer', x: 560, y: 380, w: 180, h: 110, activeWhen: ['acted:drawer'],
      interactions: [
        { type: 'note', when: ['acted:drawer'], note: { title: 'מגירה מגנטית', text: 'המגירה פתוחה וריקה.' } },
        { type: 'action', when: ['min:2'], label: 'לפתוח את המגירה', note: { title: 'מגירה מגנטית', text: 'נשמע קליק — המגנט השתחרר.' }, onAct: { giveItems: ['fuse'], setFlags: ['k:drawer'], notebook: ['drawer'], message: 'במגירה: פתק ״3, 1, 4...״ ונתיך.' } },
        { type: 'blocked', note: { title: 'מגירה מגנטית', text: 'המגירה נעולה במגנט. היא לא זזה.' } },
      ],
    },
    {
      id: 'schedule', scene: 'room', name: 'לוח מחיק', art: 'whiteboard', x: 230, y: 230, w: 260, h: 170, activeWhen: ['solved:schedule'],
      interactions: [
        { type: 'note', when: ['solved:schedule'], note: { title: 'לוח מחיק', notebook: 'sched', text: 'סדר הלולאה: מגירה (2) ← קו B (4) ← הפסקת חשמל (5) ← איפוס (6–7).' } },
        { type: 'lock', when: ['k:looped'], title: 'לוח מחיק', prompt: 'רשמו על הלוח מה קורה בלולאה — לפי הסדר.', lock: { kind: 'sequence', options: [{ id: 'reset', label: 'איפוס' }, { id: 'blackout', label: 'הפסקת חשמל' }, { id: 'drawer', label: 'המגירה נפתחת' }, { id: 'lineB', label: 'קו B נפתח' }], answer: ['drawer', 'lineB', 'blackout', 'reset'] }, onSolve: { message: 'הסדר נרשם על הלוח — והוא יישאר שם גם אחרי האיפוס.', notebook: ['sched'] } },
        { type: 'blocked', note: { title: 'לוח מחיק', text: 'לוח ריק. עוד לא ברור מה כדאי לרשום עליו.' } },
      ],
    },
    {
      id: 'wall', scene: 'room', name: 'הקיר הלבן', art: 'poster', x: 600, y: 60, w: 160, h: 220,
      interactions: [
        { type: 'note', when: ['min:5'], note: { title: 'הקיר הלבן — בחושך', notebook: 'glow', text: 'בחושך זוהרות על הקיר ספרות: ״...ואחריהן 1, 5״. ולידן סמל: ״● = הדלת״.' } },
        { type: 'note', note: { title: 'הקיר הלבן', text: 'קיר לבן. נראה שמשהו מצויר עליו בצבע שקשה לראות באור.' } },
      ],
    },
    {
      id: 'terminal', scene: 'room', name: 'מסוף הניסוי', art: 'terminal', x: 40, y: 300, w: 200, h: 170, activeWhen: ['solved:terminal'],
      interactions: [
        { type: 'note', when: ['solved:terminal'], note: { title: 'מסוף הניסוי', style: 'screen', notebook: 'plan', text: '״הסדר נשמר: ◆ ▲ ● — מגירה, נתב, דלת. הכול בלולאה אחת.״' } },
        { type: 'lock', when: ['k:routed'], title: 'מסוף הניסוי', prompt: 'המסך מציג שלושה סמלים: ◆ ▲ ●. מה מסמל כל אחד — לפי הסדר?', lock: { kind: 'sequence', options: [{ id: 'clock', label: 'השעון' }, { id: 'door', label: 'הדלת' }, { id: 'drawer', label: 'המגירה' }, { id: 'router', label: 'הנתב' }], answer: ['drawer', 'router', 'door'] }, onSolve: { setFlags: ['k:decoded'], notebook: ['plan'], message: 'המסוף פוענח: מגירה, נתב, דלת — בלולאה אחת.' } },
        { type: 'blocked', note: { title: 'מסוף הניסוי', style: 'screen', text: '״ממתין לחיבור רשת...״' } },
      ],
    },
    {
      id: 'door', scene: 'room', name: 'דלת המעבדה', art: 'door', x: 500, y: 150, w: 90, h: 330,
      interactions: [
        { type: 'needItem', when: ['min:5', 'solved:router', 'k:decoded'], item: 'fuse', note: { title: 'לוח הדלת', text: 'הלוח עבר לסוללה ונדלק. יש בו שקע ריק לנתיך.' }, onUse: { message: 'הנתיך נכנס, הרשת מחוברת — הדלת נפתחה לפני האיפוס! יצאתם מהלולאה.', escape: true } },
        { type: 'blocked', note: { title: 'דלת המעבדה', text: 'לוח הדלת כבוי. יש בו שקע ריק לנתיך.' } },
      ],
    },
    // ── חדר השרתים ──
    {
      id: 'router', scene: 'servers', name: 'הנתב', art: 'machine', x: 300, y: 160, w: 200, h: 220, activeWhen: ['solved:router'],
      interactions: [
        { type: 'note', when: ['solved:router'], note: { title: 'הנתב', style: 'screen', text: 'הנתב מחובר. נורה ירוקה דולקת.' } },
        { type: 'lock', when: ['min:4'], title: 'הנתב ▲', prompt: 'קו B פתוח. הקלידו קוד בן 5 ספרות.', lock: { kind: 'digits', length: 5, answer: '31415' }, onSolve: { setFlags: ['k:routed'], message: 'הנתב חובר לרשת — במסוף הניסוי מופיעים סמלים.' } },
        { type: 'blocked', note: { title: 'הנתב', notebook: 'router', text: 'על הנתב מדבקה: ▲. המסך: ״קו B סגור — אין קליטת קוד.״' } },
      ],
    },
    { id: 'rack', scene: 'servers', name: 'ארון השרתים', art: 'cabinet', x: 560, y: 120, w: 160, h: 330, interactions: [{ type: 'note', note: { title: 'ארון השרתים', text: 'מאווררים מזמזמים. על הדלת: ״הנתב עובד רק כשקו B פתוח.״' } }] },
    { id: 'logbook', scene: 'servers', name: 'יומן החוקרת', art: 'book', x: 60, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'יומן החוקרת', style: 'book', text: '״ניסיתי כבר שש פעמים. החפצים חוזרים, אבל אני זוכרת. צריך לעשות הכול בלולאה אחת, בדקות הנכונות.״' } }] },
  ],
  hints: [],
  puzzles: [
    { id: 'loop-1', name: 'מה חוזר על עצמו', sees: 'מעבדה, שעון שרץ מ־0:00 ורמקול שמכריז הודעות.', doneWhen: 'k:looped', solution: 'לחכות לאיפוס הראשון (או לעבור את דקה 7)', explanation: 'החדר בנוי על לולאה. אחרי שעוברים איפוס אחד מבינים שהחפצים חוזרים אבל המחברת נשארת.', hints: ['השעון סופר עד 7.', 'מה קורה אחרי דקה 7? אפשר גם ללחוץ ״המתנה״.', 'חכו לאיפוס — המחברת לא תימחק.'], after: 'הלוח המחיק נעשה שימושי.', wrong: '—' },
    { id: 'loop-2', name: 'סדר הלולאה', sees: 'לוח מחיק, והודעות רמקול שמשתנות לפי הדקה.', availableWhen: ['k:looped'], doneWhen: 'solved:schedule', solution: 'מגירה ← קו B ← הפסקת חשמל ← איפוס', explanation: 'הרמקול מכריז: דקה 2 — מגירה, דקה 4 — קו B, דקה 5 — הפסקת חשמל, דקה 6 — אזהרת איפוס.', hints: ['הקשיבו לרמקול בדקות שונות.', 'רשמו כל אירוע ואת הדקה שלו.', 'מגירה, קו B, חושך, איפוס.'], after: 'הסדר נשמר על הלוח גם אחרי האיפוס.', wrong: 'הלוח נמחק — אפשר לנסות שוב.' },
    { id: 'loop-3', name: 'המגירה', sees: 'מגירה נעולה במגנט.', availableWhen: ['solved:schedule'], doneWhen: 'k:drawer', solution: 'לפתוח את המגירה בדקה 2', explanation: 'המגנט משתחרר רק בדקה 2. במגירה — פתק ״3, 1, 4...״ ונתיך.', hints: ['המגירה לא תמיד נעולה.', 'מתי הרמקול אומר שהמגנט משתחרר?', 'דקה 2 — פתחו את המגירה.'], after: 'יש לכם את תחילת הקוד ונתיך (הנתיך ייעלם באיפוס).', wrong: 'המגירה פשוט לא זזה.' },
    { id: 'loop-4', name: 'הנתב', sees: 'נתב שמבקש 5 ספרות רק כשקו B פתוח.', availableWhen: ['k:drawer'], doneWhen: 'k:routed', solution: '31415 בדקה 4', explanation: 'הפתק במגירה: ״3, 1, 4...״. הקיר בחושך (דקה 5): ״...ואחריהן 1, 5״. יחד: 31415. הנתב מקבל קוד רק בדקה 4.', hints: ['הקוד מחולק בין שני מקומות.', 'מה רואים על הקיר הלבן בזמן הפסקת החשמל?', '3,1,4 ואחריהן 1,5 — בדקה 4.'], after: 'במסוף הניסוי מופיעים שלושה סמלים.', wrong: '״קוד שגוי״ (נספר).' },
    { id: 'loop-5', name: 'שלושת הסמלים', sees: 'מסוף שמציג ◆ ▲ ●.', availableWhen: ['k:routed'], doneWhen: 'k:decoded', solution: 'מגירה, נתב, דלת', explanation: '◆ חרוט על לוח השעון (המגירה), ▲ מודבק על הנתב, ● זוהר על הקיר בחושך ליד ״הדלת״.', hints: ['כל סמל מופיע גם במקום אחר בחדר.', 'השעון, הנתב, הקיר בחושך.', 'מגירה, נתב, דלת.'], after: 'המסוף זוכר את התוכנית גם אחרי האיפוס.', wrong: '״לא תואם״ (נספר).' },
    { id: 'loop-6', name: 'לולאה אחת מושלמת', sees: 'דלת עם שקע לנתיך שנדלקת רק בהפסקת החשמל.', availableWhen: ['k:decoded'], doneWhen: 'escaped', solution: 'באותה לולאה: מגירה בדקה 2, נתב בדקה 4, נתיך בדלת בדקה 5', explanation: 'הנתיך והחיבור לנתב נמחקים באיפוס, ולוח הדלת עובד רק על סוללה (דקה 5) — לכן צריך את שלושתם בלולאה אחת.', hints: ['מה מהדברים נמחק באיפוס?', 'סדר הסמלים הוא גם סדר הפעולות.', 'דקה 2 מגירה, דקה 4 נתב, דקה 5 נתיך בדלת.'], after: 'הדלת נפתחת. סוף החדר.', wrong: 'הלוח כבוי — כנראה לא הזמן או שחסר משהו.' },
  ],
  walkthrough: [
    { read: 'clock' },
    { read: 'intercom' },
    { waitUntil: 5 },
    { read: 'wall' },
    { waitUntil: 0 },
    { solve: 'schedule', input: 'drawer,lineB,blackout,reset' },
    { waitUntil: 2 },
    { act: 'drawer' },
    { waitUntil: 4 },
    { solve: 'router', input: '31415' },
    { solve: 'terminal', input: 'drawer,router,door' },
    { waitUntil: 5 },
    { use: 'door', item: 'fuse' },
  ],
}
