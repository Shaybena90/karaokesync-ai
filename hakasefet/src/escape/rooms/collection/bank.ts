import { placeOnPhoto } from './kit'
import type { RoomDef } from '../../types'

/** "הכספת האחרונה" — a timed bank-vault room (20 minutes), with an untimed practice mode. */
const PHOTO = { src: 'rooms/bank.webp', size: [1672, 941] as [number, number] }

export const bank: RoomDef = {
  id: 'bank',
  version: 1,
  title: 'הכספת האחרונה',
  emoji: '🏦',
  category: 'חדרי בריחה',
  length: '20 דקות (מתוזמן)',
  difficultyLabel: 'בינונית',
  players: 1,
  blurb: 'דלת חדר הכספות נטרקה מאחוריכם. למערכת האבטחה יש תוכניות אחרות.',
  story: 'נכנסתם לחדר הכספות של הבנק, והדלת ננעלה מאחוריכם. על הצג מהבהב: ״נעילה מלאה בעוד 20:00״. כדי לצאת צריך להחזיר שליטה למערכת האבטחה ולפתוח את הכספת המרכזית — שממנה יוצא מסלול החירום.',
  goal: 'להיכנס למסוף, לשחזר מה קרה, להחזיר מתח, למצוא את המסמך האמיתי ולפתוח את הכספת — לפני שהשעון מגיע לאפס.',
  timer: { minutes: 20 },
  darkUntil: 'solved:breakers',
  illustration: { art: 'safe', theme: 'bank' },
  scenes: [
    { id: 'guard', name: 'עמדת השומר', theme: 'bank', photo: { ...PHOTO, crop: [900, 40, 772, 760] } },
    { id: 'security', name: 'מסוף האבטחה', theme: 'bank', photo: { ...PHOTO, crop: [0, 330, 760, 611] } },
    { id: 'power', name: 'חדר החשמל', theme: 'bank', photo: { ...PHOTO, crop: [1000, 60, 672, 560] } },
    { id: 'vault', name: 'חדר הכספות', theme: 'bank', photo: { ...PHOTO, crop: [0, 0, 1672, 941] } },
  ],
  items: [
    { id: 'badge', name: 'כרטיס עובד', icon: '🪪', note: { title: 'כרטיס עובד', text: 'כרטיס מגנטי של הבנק. אין עליו שם או מספר — רק פס מגנטי.' } },
    { id: 'keys', name: 'צרור מפתחות', icon: '🗝️', note: { title: 'צרור מפתחות', text: 'שלושה מפתחות: מפתח זהב, מפתח כסף ומפתח ארד.' } },
    { id: 'docs', name: 'מסמכי ההעברה', icon: '📑', note: { title: 'שלוש גרסאות של מסמך העברה', style: 'paper', zoom: true, text: 'גרסה א׳ — תאריך 31.04.2021 · חתימה: ר׳ כהן, מנהלת הסניף · ״קוד הכספת — חלק ראשון: 41״\nגרסה ב׳ — תאריך 12.05.2021 · חתימה: ד׳ לוי, מנהל הסניף · ״קוד הכספת — חלק ראשון: 73״\nגרסה ג׳ — תאריך 12.05.2021 · חתימה: ר׳ כהן, מנהלת הסניף · ״קוד הכספת — חלק ראשון: 58״' } },
  ],
  notebookEntries: [
    { id: 'guardlog', text: 'יומן המשמרת: עובדת מס׳ 4471 (רונית). כניסה למסוף: כרטיס + מספר עובד.' },
    { id: 'vaultrule', text: 'קוד הכספת המרכזית: חלק ראשון — במסמך ההעברה המקורי; חלק שני — הדקה שבה כבה המסוף, לפי המצלמות.' },
    { id: 'cams', text: 'מצלמות: 1 — כוס ריקה, מסוף כבוי, 21:39 · 2 — כניסה עם כוס מלאה, 21:04 · 3 — מסדרון חשוך, כוס חצי מלאה, בלי שעון · 4 — מניח כוס מלאה, 21:11.' },
    { id: 'termoff', text: 'המסוף כבה ב־21:39 (מצלמה 1).' },
    { id: 'diagram', text: 'מפסקים: 1 תאורת חירום (סוללה) · 2 מסוף · 3 אזעקה · 4 מעלית · 5 דלת הכספות · 6 בקרת הכספות.' },
    { id: 'boxes', text: 'תאים: 12 — כסף · 31 — זהב · 7 — ארד. התא של המנהלת: לא כסף ולא ארד.' },
    { id: 'staff', text: 'מנהלת הסניף: רינה כהן, מאז 2019. לפניה: דוד לוי, עד 2019.' },
    { id: 'code1', text: 'המסמך המקורי (גרסה ג׳): חלק ראשון של הקוד — 58.' },
  ],
  hotspots: [
    // ── עמדת השומר ──
    {
      id: 'locker', scene: 'guard', name: 'ארונית השומר', art: 'locker', x: 620, y: 150, w: 140, h: 300, activeWhen: ['took:badge'],
      interactions: [
        { type: 'take', when: ['!took:badge'], item: 'badge', note: { title: 'ארונית השומר', text: 'מעיל תלוי בארונית. בכיס הפנימי — כרטיס עובד.' } },
        { type: 'note', note: { title: 'ארונית השומר', text: 'רק המעיל נשאר.' } },
      ],
    },
    { id: 'guardlog', scene: 'guard', name: 'יומן המשמרת', art: 'book', x: 260, y: 430, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'יומן המשמרת', style: 'book', notebook: 'guardlog', text: '״משמרת לילה — עובדת מס׳ 4471 (רונית).\nלתשומת לב: הכניסה למסוף האבטחה — כרטיס עובד ואז מספר עובד.״' } }] },
    { id: 'rules', scene: 'guard', name: 'כרזת נהלים', art: 'poster', x: 60, y: 80, w: 170, h: 200, interactions: [{ type: 'note', note: { title: 'נהלי חירום', text: '״בנעילה מלאה כל הדלתות נסגרות ל־24 שעות. מסלול החירום עובר דרך הכספת המרכזית.״' } }] },
    // ── מסוף האבטחה ──
    {
      id: 'secterm', scene: 'security', name: 'מסוף האבטחה', art: 'terminal', x: 250, y: 120, w: 300, h: 230, activeWhen: ['solved:secterm'],
      interactions: [
        { type: 'blocked', when: ['!took:badge'], note: { title: 'מסוף האבטחה', style: 'screen', text: '״העבירו כרטיס עובד.״' } },
        { type: 'lock', when: ['!solved:secterm'], title: 'מסוף האבטחה', prompt: 'הכרטיס התקבל. הקלידו מספר עובד (4 ספרות).', lock: { kind: 'digits', length: 4, answer: '4471' }, onSolve: { message: 'נכנסתם למסוף — הקלטות המצלמות זמינות.' } },
        { type: 'note', note: { title: 'מסוף האבטחה', style: 'screen', notebook: 'vaultrule', text: '״קוד הכספת המרכזית: החלק הראשון — במסמך ההעברה המקורי. החלק השני — הדקה שבה כבה המסוף, לפי המצלמות.״', voice: { effect: 'computer', pitch: 0.7, lines: ['קוד הכספת המרכזית.', 'החלק הראשון — במסמך ההעברה המקורי.', 'החלק השני — הדקה שבה כבה המסוף, לפי המצלמות.'] } } },
      ],
    },
    { id: 'cam1', scene: 'security', name: 'מצלמה 1', art: 'camera', x: 40, y: 400, w: 160, h: 120, visibleWhen: ['solved:secterm'], interactions: [{ type: 'note', note: { title: 'מצלמה 1', zoom: true, notebook: 'cams', text: 'כוס הקפה על השולחן ריקה. המסוף כבוי. השעון על הקיר: 21:39.' } }] },
    { id: 'cam2', scene: 'security', name: 'מצלמה 2', art: 'camera', x: 220, y: 400, w: 160, h: 120, visibleWhen: ['solved:secterm'], interactions: [{ type: 'note', note: { title: 'מצלמה 2', zoom: true, notebook: 'cams', text: 'השומר נכנס למשמרת עם כוס קפה מלאה. השעון: 21:04.' } }] },
    { id: 'cam3', scene: 'security', name: 'מצלמה 3', art: 'camera', x: 400, y: 400, w: 160, h: 120, visibleWhen: ['solved:secterm'], interactions: [{ type: 'note', note: { title: 'מצלמה 3', zoom: true, notebook: 'cams', text: 'המסדרון חשוך; אין שעון בתמונה. השומר הולך לכיוון השולחן, ועל השולחן הכוס חצי מלאה.' } }] },
    { id: 'cam4', scene: 'security', name: 'מצלמה 4', art: 'camera', x: 580, y: 400, w: 160, h: 120, visibleWhen: ['solved:secterm'], interactions: [{ type: 'note', note: { title: 'מצלמה 4', zoom: true, notebook: 'cams', text: 'השומר מניח את הכוס המלאה ליד המסוף. השעון: 21:11.' } }] },
    {
      id: 'timeline', scene: 'security', name: 'שחזור רצף האירועים', art: 'board', x: 580, y: 60, w: 190, h: 150, visibleWhen: ['solved:secterm'], activeWhen: ['solved:timeline'],
      interactions: [
        { type: 'lock', when: ['!solved:timeline'], title: 'שחזור רצף האירועים', prompt: 'סדרו את הקלטות המצלמות לפי סדר האירועים — מהראשון לאחרון.', lock: { kind: 'sequence', options: [{ id: 'cam1', label: 'מצלמה 1' }, { id: 'cam2', label: 'מצלמה 2' }, { id: 'cam3', label: 'מצלמה 3' }, { id: 'cam4', label: 'מצלמה 4' }], answer: ['cam2', 'cam4', 'cam3', 'cam1'] }, onSolve: { message: 'הרצף שוחזר — במסוף נפתחו תרשים החשמל, רשימת התאים ורשימת העובדים.', notebook: ['termoff'] } },
        { type: 'note', note: { title: 'רצף האירועים', text: 'מצלמה 2 (21:04) ← מצלמה 4 (21:11) ← מצלמה 3 (כוס חצי מלאה) ← מצלמה 1 (21:39, המסוף כבה).' } },
      ],
    },
    { id: 'diagram', scene: 'security', name: 'תרשים לוח החשמל', art: 'manual', x: 40, y: 60, w: 190, h: 120, visibleWhen: ['solved:timeline'], interactions: [{ type: 'note', note: { title: 'תרשים לוח החשמל', style: 'book', notebook: 'diagram', text: 'מפסק 1 — תאורת חירום (פועלת מסוללה; לא לגעת)\nמפסק 2 — מסוף האבטחה\nמפסק 3 — אזעקה (הפעלה = נעילה מלאה מיידית!)\nמפסק 4 — מעלית\nמפסק 5 — דלת חדר הכספות\nמפסק 6 — בקרת הכספות (הדלת לא תיפתח בלעדיה)' } }] },
    { id: 'boxlist', scene: 'security', name: 'רשימת תאי האחסון', art: 'manual', x: 40, y: 220, w: 190, h: 120, visibleWhen: ['solved:timeline'], interactions: [{ type: 'note', note: { title: 'רשימת תאי האחסון', style: 'book', notebook: 'boxes', text: 'תא 12 — מפתח כסף\nתא 31 — מפתח זהב\nתא 7 — מפתח ארד\n״את התא של מנהלת הסניף פותח המפתח שאינו כסף ואינו ארד.״' } }] },
    { id: 'staff', scene: 'security', name: 'רשימת העובדים', art: 'manual', x: 580, y: 230, w: 190, h: 120, visibleWhen: ['solved:timeline'], interactions: [{ type: 'note', note: { title: 'רשימת העובדים', style: 'book', notebook: 'staff', text: 'מנהלת הסניף: רינה כהן — מאז 2019.\nמנהל קודם: דוד לוי — עד 2019.' } }] },
    // ── חדר החשמל ──
    {
      id: 'breakers', scene: 'power', name: 'לוח המפסקים', art: 'switches', x: 260, y: 90, w: 300, h: 170, activeWhen: ['solved:breakers'],
      interactions: [
        { type: 'lock', when: ['!solved:breakers'], title: 'לוח המפסקים', prompt: 'שישה מפסקים, 1–6. מדליקים רק את מה שצריך כדי שדלת הכספות תיפתח מהמסוף — ושום דבר אחר.', lock: { kind: 'switches', count: 6, answer: [false, true, false, false, true, true] }, onSolve: { message: 'המתח עבר — חדר הכספות מואר ודלתו נפתחה!' } },
        { type: 'note', note: { title: 'לוח המפסקים', text: 'מפסקים 2, 5 ו־6 דולקים.' } },
      ],
    },
    { id: 'warning', scene: 'power', name: 'שלט אזהרה', art: 'poster', x: 600, y: 90, w: 160, h: 190, interactions: [{ type: 'note', note: { title: 'שלט אזהרה', text: '״אסור להפעיל את מפסק האזעקה בזמן נעילה. כל הפעלה מיותרת מקצרת את זמן הנעילה.״' } }] },
    // ── חדר הכספות ──
    {
      id: 'keycab', scene: 'vault', name: 'ארון המפתחות', art: 'cabinet', x: 40, y: 120, w: 150, h: 320, activeWhen: ['took:keys'],
      interactions: [
        { type: 'blocked', when: ['!solved:breakers'], note: { title: 'ארון המפתחות', text: 'חשוך כאן, והארון נעול חשמלית. צריך להחזיר מתח.' } },
        { type: 'take', when: ['!took:keys'], item: 'keys', note: { title: 'ארון המפתחות', text: 'הארון נפתח. בפנים צרור של שלושה מפתחות: זהב, כסף וארד.' } },
        { type: 'note', note: { title: 'ארון המפתחות', text: 'הארון ריק.' } },
      ],
    },
    {
      id: 'boxes', scene: 'vault', name: 'קיר תאי האחסון', art: 'locker', variant: 'boxes', x: 230, y: 90, w: 230, h: 300, activeWhen: ['solved:boxes'],
      interactions: [
        { type: 'blocked', when: ['!took:keys'], note: { title: 'קיר תאי האחסון', text: 'עשרות תאים ממוספרים. צריך מפתחות.' } },
        { type: 'lock', when: ['!solved:boxes'], title: 'קיר תאי האחסון', prompt: 'איזה תא פותחים, ובאיזה מפתח?', lock: { kind: 'choice', options: [{ id: 'b12s', label: 'תא 12 · מפתח כסף' }, { id: 'b31g', label: 'תא 31 · מפתח זהב' }, { id: 'b7b', label: 'תא 7 · מפתח ארד' }, { id: 'b31s', label: 'תא 31 · מפתח כסף' }], answer: 'b31g', feedback: { b12s: 'התא של המנהלת לא נפתח במפתח כסף.', b7b: 'התא של המנהלת לא נפתח במפתח ארד.', b31s: 'לפי הרשימה, תא 31 לא נפתח במפתח כסף.' } }, onSolve: { giveItems: ['docs'], message: 'תא 31 נפתח — בפנים שלוש גרסאות של מסמך העברה!' } },
        { type: 'note', note: { title: 'תא 31', text: 'התא ריק עכשיו.' } },
      ],
    },
    {
      id: 'verify', scene: 'vault', name: 'מכונת אימות המסמכים', art: 'console', x: 480, y: 360, w: 280, h: 170, activeWhen: ['solved:verify'],
      interactions: [
        { type: 'blocked', when: ['!took:docs'], note: { title: 'מכונת אימות המסמכים', style: 'screen', text: '״הניחו את המסמך לאימות.״' } },
        { type: 'lock', when: ['!solved:verify'], title: 'מכונת אימות המסמכים', prompt: 'איזו גרסה היא המסמך המקורי?', lock: { kind: 'choice', options: [{ id: 'a', label: 'גרסה א׳' }, { id: 'b', label: 'גרסה ב׳' }, { id: 'c', label: 'גרסה ג׳' }], answer: 'c', feedback: { a: 'המכונה דוחה: התאריך בגרסה הזאת לא קיים בלוח השנה.', b: 'המכונה דוחה: מי שחתום כמנהל לא היה המנהל בשנה הזאת.' } }, onSolve: { message: 'גרסה ג׳ אומתה כמסמך המקורי.', notebook: ['code1'] } },
        { type: 'note', note: { title: 'מכונת האימות', style: 'screen', text: '״גרסה ג׳ — מקורית. קוד הכספת, חלק ראשון: 58.״' } },
      ],
    },
    {
      id: 'mainvault', scene: 'vault', name: 'הכספת המרכזית', art: 'safe', x: 500, y: 90, w: 230, h: 240,
      interactions: [
        { type: 'blocked', when: ['!solved:verify'], note: { title: 'הכספת המרכזית', style: 'screen', text: '״המקלדת נעולה. המערכת דורשת מסמך מקור מאומת.״' } },
        { type: 'lock', title: 'הכספת המרכזית', prompt: 'קוד בן 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '5839' }, onSolve: { message: 'הכספת המרכזית נפתחה ומסלול החירום הופעל — יצאתם!', escape: true } },
      ],
    },
  ],
  hints: [],
  puzzles: [
    { id: 'bank-1', name: 'כרטיס ומספר עובד', sees: 'עמדת שומר עם ארונית, יומן משמרת ומסוף שמבקש כרטיס.', doneWhen: 'solved:secterm', solution: 'הכרטיס מהארונית + 4471', explanation: 'בכיס המעיל שבארונית — כרטיס עובד. ביומן המשמרת: עובדת מס׳ 4471. המסוף מבקש קודם כרטיס ואז מספר עובד.', hints: ['המסוף מבקש שני דברים.', 'הכרטיס בארונית השומר; המספר ביומן המשמרת.', 'קחו את הכרטיס והקלידו 4471.'], after: 'נפתחות הקלטות המצלמות והמסוף מסביר ממה בנוי קוד הכספת.', wrong: '״מספר עובד שגוי״.' },
    { id: 'bank-2', name: 'רצף המצלמות', sees: 'ארבע תמונות ממצלמות האבטחה, שלוש עם שעון ואחת בלי.', availableWhen: ['solved:secterm'], doneWhen: 'solved:timeline', solution: 'מצלמה 2 → 4 → 3 → 1', explanation: 'לפי השעונים: 21:04 (מצלמה 2), 21:11 (מצלמה 4), 21:39 (מצלמה 1). במצלמה 3 אין שעון, אבל הכוס חצי מלאה — אחרי שהונחה מלאה (4) ולפני שהתרוקנה (1).', hints: ['שלוש תמונות אפשר לסדר לפי השעון.', 'בתמונה בלי שעון — מה מצב כוס הקפה?', '2, 4, 3, 1.'], after: 'במסוף נפתחים תרשים החשמל, רשימת התאים ורשימת העובדים.', wrong: '״הרצף לא תואם להקלטות״.' },
    { id: 'bank-3', name: 'לוח החשמל', sees: 'לוח של שישה מפסקים ותרשים שמסביר כל אחד.', availableWhen: ['solved:timeline'], doneWhen: 'solved:breakers', solution: 'מפסקים 2, 5, 6 דולקים; השאר כבויים', explanation: 'הדלת נפתחת מהמסוף (2), צריכה את מפסק הדלת (5) ואת הבקרה (6). אזעקה (3) אסור; תאורת חירום (1) על סוללה; מעלית (4) לא נחוצה.', hints: ['התרשים במסוף אומר מה עושה כל מפסק.', 'הדלת צריכה גם מסוף וגם בקרה.', '2, 5 ו־6.'], after: 'חדר הכספות מואר וארון המפתחות נפתח.', wrong: '״המתח לא הגיע לדלת״.' },
    { id: 'bank-4', name: 'מפתחות ותאים', sees: 'צרור של שלושה מפתחות, קיר תאים ורשימת תאים.', availableWhen: ['solved:breakers'], doneWhen: 'solved:boxes', solution: 'תא 31 · מפתח זהב', explanation: 'הרשימה: התא של המנהלת נפתח במפתח שאינו כסף ואינו ארד — כלומר זהב. מפתח הזהב פותח את תא 31.', hints: ['רשימת התאים במסוף.', 'פסלו את שני המפתחות שהרשימה פוסלת.', 'זהב → תא 31.'], after: 'בתא שלוש גרסאות של מסמך העברה.', wrong: 'הסבר קצר למה הצירוף לא מתאים.' },
    { id: 'bank-5', name: 'המסמך המקורי', sees: 'שלוש גרסאות של אותו מסמך, ורשימת עובדים.', availableWhen: ['solved:boxes'], doneWhen: 'solved:verify', solution: 'גרסה ג׳', explanation: 'גרסה א׳ מתוארכת ל־31 באפריל — תאריך שלא קיים. גרסה ב׳ חתומה בידי ד׳ לוי כמנהל ב־2021, אבל לפי רשימת העובדים הוא סיים ב־2019. גרסה ג׳ עקבית.', hints: ['בדקו כל פרט בכל גרסה: תאריך וחתימה.', 'כמה ימים יש באפריל? מי ניהל את הסניף ב־2021?', 'גרסה ג׳.'], after: 'המכונה מאמתת: קוד הכספת, חלק ראשון — 58.', wrong: 'המכונה דוחה ומרמזת על סוג הסתירה.' },
    { id: 'bank-6', name: 'קוד הכספת', sees: 'כספת מרכזית עם מקלדת ארבע ספרות.', availableWhen: ['solved:verify'], doneWhen: 'escaped', solution: '5839', explanation: 'המסוף: חלק ראשון מהמסמך המקורי (58), חלק שני — הדקה שבה כבה המסוף לפי המצלמות (21:39 → 39).', hints: ['המסוף אמר ממה בנוי הקוד.', 'החלק השני — ממצלמה 1.', '58 ו־39: 5839.'], after: 'מסלול החירום נפתח. סוף החדר.', wrong: '״קוד שגוי״ (נספר כניסיון שגוי).' },
  ],
  walkthrough: [
    { take: 'locker' },
    { solve: 'secterm', input: '4471' },
    { solve: 'timeline', input: 'cam2,cam4,cam3,cam1' },
    { solve: 'breakers', input: '010011' },
    { take: 'keycab' },
    { solve: 'boxes', input: 'b31g' },
    { solve: 'verify', input: 'c' },
    { solve: 'mainvault', input: '5839' },
  ],
}

// where each object is in the room's image (pixels of the 1672×941 image)
placeOnPhoto(bank.hotspots, {
  locker: [1465, 290, 207, 280], guardlog: [1395, 580, 235, 105], rules: [1000, 300, 110, 150],
  secterm: [150, 400, 245, 215], cam1: [168, 418, 108, 92], cam2: [278, 418, 108, 92], cam3: [168, 512, 108, 92], cam4: [278, 512, 108, 92],
  timeline: [385, 530, 125, 135], diagram: [0, 700, 320, 241], boxlist: [312, 355, 135, 62], staff: [270, 685, 210, 60],
  breakers: [1262, 318, 190, 110], warning: [1030, 140, 70, 75],
  keycab: [1465, 115, 207, 170], boxes: [15, 20, 290, 365], verify: [1065, 515, 390, 140], mainvault: [560, 110, 430, 450],
}, ['rules'])
