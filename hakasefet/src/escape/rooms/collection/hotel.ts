import { placeOnPhoto } from './kit'
import type { RoomDef } from '../../types'

/** "חדר 404" — a hotel room that changes every time you walk back in. */
const PHOTO = { src: 'rooms/hotel.webp', size: [1672, 941] as [number, number] }

export const hotel: RoomDef = {
  id: 'hotel',
  version: 1,
  title: 'חדר 404',
  emoji: '🏨',
  category: 'חדרי בריחה',
  length: '25–30 דקות',
  difficultyLabel: 'בינונית',
  players: 1,
  blurb: 'במלון הזה אין חדר 404. אז למה המפתח שלכם פותח אותו?',
  story: 'הגעתם למלון ״אורנים״ באמצע הלילה. הדלפק ריק, ועל הדלפק מחכה לכם ספר אורחים פתוח. בכל פעם שנכנסים מחדש לאחד החדרים — משהו בו כבר לא אותו דבר.',
  goal: 'לגלות מה משתנה בחדר, לפענח את הסימנים ולהגיע לחדר 404 — שם נמצאת היציאה.',
  illustration: { art: 'door', theme: 'hotel', variant: '404' },
  scenes: [
    { id: 'lobby', name: 'הלובי', theme: 'hotel', photo: { ...PHOTO, crop: [0, 200, 900, 741] } },
    { id: 'corridor', name: 'מסדרון קומה 3', theme: 'hotel', photo: { ...PHOTO, crop: [0, 100, 900, 800] }, visibleWhen: ['solved:elevator'] },
    { id: 'room401', name: 'חדר 401', theme: 'hotel', photo: { ...PHOTO, crop: [0, 0, 1000, 700] }, visibleWhen: ['solved:elevator'] },
    { id: 'room402', name: 'חדר 402', theme: 'hotel', photo: { ...PHOTO, crop: [1000, 0, 672, 760] }, visibleWhen: ['solved:doors'] },
    { id: 'room404', name: 'חדר 404', theme: 'hotel', photo: { ...PHOTO, crop: [880, 120, 560, 620] }, visibleWhen: ['solved:servicepanel'] },
  ],
  items: [
    { id: 'keys', name: 'צרור מפתחות', icon: '🗝️', note: { title: 'צרור מפתחות', text: 'שלושה מפתחות עם סמלים: ירח, כוכב ושמש. על התג: ״המפתח של הציור״.' } },
  ],
  notebookEntries: [
    { id: 'guest', text: 'ספר האורחים: האות הראשונה של כל שורה — ש, ל, י, ש, י.' },
    { id: 'paintA', text: 'גרסה א׳ של חדר 401: הסירה בציור פונה שמאלה.' },
    { id: 'clockA', text: 'גרסה א׳ של חדר 401: השעון מראה 2:00.' },
    { id: 'verB', text: 'יצאתם ונכנסתם שוב לחדר 401 — החדר השתנה (גרסה ב׳).' },
    { id: 'verA', text: 'יצאתם ונכנסתם שוב — החדר חזר לגרסה א׳.' },
    { id: 'paintB', text: 'גרסה ב׳: הסירה פונה ימינה, ובפינת הציור כוכב קטן ליד המספר 402.' },
    { id: 'clockB', text: 'גרסה ב׳: השעון מראה 1:00.' },
    { id: 'diff', text: 'מה שמשתנה בין הגרסאות: הציור והשעון.' },
    { id: 'mirror', text: 'במראה (כתב הפוך): ״הסיסמה למעלית השירות: לילה״.' },
    { id: 'panel', text: 'לוח מעלית השירות: ״כיוון הסירה — כפול השעה. קודם מה שראיתם ראשון.״' },
    { id: 'exitrule', text: 'דלת היציאה: ״הקומה, ואחריה השעות — לפי הסדר.״' },
  ],
  hotspots: [
    // ── הלובי ──
    { id: 'guestbook', scene: 'lobby', name: 'ספר האורחים', art: 'book', x: 300, y: 380, w: 200, h: 110, interactions: [{ type: 'note', note: { title: 'ספר האורחים', style: 'book', notebook: 'guest', text: 'שבנו מאוחר, והמעלית חרקה כל הדרך.\nלא מצאנו את החדר שהבטיחו לנו.\nיש כאן מסדרון שלא נגמר.\nשאלנו בדלפק — אף אחד לא ענה.\nימים אחר כך עוד שמענו את השעונים מתקתקים.' } }] },
    { id: 'desk', scene: 'lobby', name: 'דלפק הקבלה', art: 'desk-under', x: 80, y: 300, w: 200, h: 170, interactions: [{ type: 'note', note: { title: 'דלפק הקבלה', text: 'פעמון, ומתחתיו פתק: ״המעלית יודעת לאן אתם הולכים — אם תקראו נכון את האורחים.״' } }] },
    {
      id: 'elevator', scene: 'lobby', name: 'המעלית', art: 'elevator', x: 560, y: 110, w: 180, h: 360, activeWhen: ['solved:elevator'],
      interactions: [
        { type: 'lock', when: ['!solved:elevator'], title: 'המעלית', prompt: 'לאיזו קומה עולים?', lock: { kind: 'choice', options: [{ id: '1', label: 'קומה 1' }, { id: '2', label: 'קומה 2' }, { id: '3', label: 'קומה 3' }, { id: '4', label: 'קומה 4' }], answer: '3', feedback: { '1': 'הדלתות נפתחות למסדרון חשוך ונסגרות מיד.', '2': 'המעלית נעצרת, מצפצפת וחוזרת ללובי.', '4': 'הכפתור לא נדלק.' } }, onSolve: { message: 'המעלית עלתה לקומה 3.' } },
        { type: 'note', note: { title: 'המעלית', text: 'המעלית עומדת בקומה 3.' } },
      ],
    },
    // ── מסדרון קומה 3 ──
    { id: 'corridorsign', scene: 'corridor', name: 'שלט המסדרון', art: 'poster', x: 60, y: 80, w: 160, h: 180, interactions: [{ type: 'note', note: { title: 'שלט המסדרון', text: '״חדרים 401–403 ←\nחדר 404 — אין חדר כזה.״' } }] },
    {
      id: 'doors', scene: 'corridor', name: 'דלתות המסדרון', art: 'door', x: 300, y: 120, w: 160, h: 350, activeWhen: ['solved:doors'],
      interactions: [
        { type: 'blocked', when: ['!took:keys'], note: { title: 'דלתות המסדרון', text: 'דלתות 402 ו־403 נעולות. צריך מפתחות.' } },
        { type: 'lock', when: ['!solved:doors'], title: 'דלתות המסדרון', prompt: 'איזו דלת פותחים, ובאיזה מפתח?', lock: { kind: 'choice', options: [{ id: 'd402moon', label: '402 · מפתח הירח' }, { id: 'd402star', label: '402 · מפתח הכוכב' }, { id: 'd403star', label: '403 · מפתח הכוכב' }, { id: 'd403sun', label: '403 · מפתח השמש' }], answer: 'd402star', feedback: { d402moon: 'המפתח נכנס, אבל לא מסתובב.', d403star: 'המפתח לא נכנס לחור המנעול.', d403sun: 'המפתח לא נכנס לחור המנעול.' } }, onSolve: { message: 'דלת 402 נפתחה.' } },
        { type: 'note', note: { title: 'דלתות המסדרון', text: 'דלת 402 פתוחה.' } },
      ],
    },
    {
      id: 'exitdoor', scene: 'corridor', name: 'דלת חדר 401', art: 'door', x: 560, y: 120, w: 160, h: 350, variant: '401',
      interactions: [
        { type: 'action', when: ['v:B'], repeatable: true, label: 'לצאת ולהיכנס שוב לחדר 401', note: { title: 'דלת חדר 401', text: 'הדלת נסגרת מאחוריכם. כשאתם פותחים אותה שוב — משהו בחדר שונה.' }, onAct: { clearFlags: ['v:B'], setFlags: ['k:sawA'], notebook: ['verA'], message: 'נכנסתם שוב לחדר 401. משהו השתנה.' } },
        { type: 'action', repeatable: true, label: 'לצאת ולהיכנס שוב לחדר 401', note: { title: 'דלת חדר 401', text: 'הדלת נסגרת מאחוריכם. כשאתם פותחים אותה שוב — משהו בחדר שונה.' }, onAct: { setFlags: ['v:B', 'k:sawB'], notebook: ['verB'], message: 'נכנסתם שוב לחדר 401. משהו השתנה.' } },
      ],
    },
    // ── חדר 401 ──
    {
      id: 'painting', scene: 'room401', name: 'הציור', art: 'painting', x: 280, y: 60, w: 240, h: 160,
      interactions: [
        { type: 'note', when: ['v:B'], note: { title: 'הציור', zoom: true, notebook: 'paintB', text: 'ציור של סירה בים. הסירה פונה ימינה. בפינה כוכב קטן, ולידו המספר 402.' } },
        { type: 'note', note: { title: 'הציור', zoom: true, notebook: 'paintA', text: 'ציור של סירה בים. הסירה פונה שמאלה.' } },
      ],
    },
    {
      id: 'clock', scene: 'room401', name: 'השעון', art: 'clock', x: 590, y: 60, w: 120, h: 120,
      interactions: [
        { type: 'note', when: ['v:B'], note: { title: 'השעון', notebook: 'clockB', text: 'השעון עומד על 1:00.' } },
        { type: 'note', note: { title: 'השעון', notebook: 'clockA', text: 'השעון עומד על 2:00.' } },
      ],
    },
    { id: 'lamp', scene: 'room401', name: 'מנורת לילה', art: 'lamp', x: 80, y: 250, w: 100, h: 180, interactions: [{ type: 'note', note: { title: 'מנורת לילה', text: 'מנורה עם אהיל ירוק. דולקת.' } }] },
    { id: 'bed', scene: 'room401', name: 'המיטה', art: 'bed', x: 220, y: 330, w: 340, h: 170, interactions: [{ type: 'note', note: { title: 'המיטה', text: 'מיטה מוצעת, כרית לבנה אחת. על הכרית פתק: ״השוו את החדר לעצמו.״' } }] },
    { id: 'curtain', scene: 'room401', name: 'הווילון', art: 'poster', variant: 'curtain', x: 600, y: 220, w: 140, h: 250, interactions: [{ type: 'note', note: { title: 'הווילון', text: 'וילון אדום כבד. מאחוריו קיר — אין חלון.' } }] },
    {
      id: 'diffs', scene: 'room401', name: 'טופס משק הבית', art: 'manual', x: 40, y: 450, w: 160, h: 100, activeWhen: ['solved:diffs'],
      interactions: [
        { type: 'note', when: ['solved:diffs'], note: { title: 'טופס משק הבית', notebook: 'diff', text: '״הציור והשעון משתנים. מפתח הציור נמצא במגירת השידה.״' } },
        { type: 'lock', when: ['k:sawB'], title: 'טופס משק הבית', prompt: '״סמנו אילו פריטים בחדר השתנו.״', lock: { kind: 'multi', options: [{ id: 'painting', label: 'הציור' }, { id: 'clock', label: 'השעון' }, { id: 'lamp', label: 'המנורה' }, { id: 'pillow', label: 'הכרית' }, { id: 'curtain', label: 'הווילון' }], answer: ['painting', 'clock'] }, onSolve: { message: 'נשמע קליק משידת הלילה — המגירה נפתחה.', notebook: ['diff'] } },
        { type: 'blocked', note: { title: 'טופס משק הבית', text: '״סמנו אילו פריטים בחדר השתנו מאז הביקור הקודם.״ — אבל עוד לא היה ביקור קודם.' } },
      ],
    },
    {
      id: 'nightstand', scene: 'room401', name: 'שידת הלילה', art: 'drawer', x: 580, y: 470, w: 160, h: 90, visibleWhen: ['solved:diffs'], activeWhen: ['took:keys'],
      interactions: [
        { type: 'take', when: ['!took:keys'], item: 'keys', note: { title: 'שידת הלילה', text: 'במגירה צרור של שלושה מפתחות עם סמלים.' } },
        { type: 'note', note: { title: 'שידת הלילה', text: 'המגירה ריקה.' } },
      ],
    },
    // ── חדר 402 ──
    { id: 'mirror', scene: 'room402', name: 'המראה', art: 'mirror', x: 300, y: 60, w: 200, h: 260, interactions: [{ type: 'note', note: { title: 'המראה', mirror: true, notebook: 'mirror', text: 'הסיסמה למעלית השירות: לילה' } }] },
    {
      id: 'service', scene: 'room402', name: 'מעלית השירות', art: 'elevator', x: 560, y: 110, w: 180, h: 360, activeWhen: ['solved:service'],
      interactions: [
        { type: 'lock', when: ['!solved:service'], title: 'מעלית השירות', prompt: 'הקלידו את סיסמת השירות.', lock: { kind: 'terminal', answers: ['לילה', 'ליילה'] }, onSolve: { message: 'דלתות מעלית השירות נפתחו. בפנים לוח חצים.' } },
        { type: 'note', note: { title: 'מעלית השירות', text: 'הדלתות פתוחות.' } },
      ],
    },
    {
      id: 'servicepanel', scene: 'room402', name: 'לוח החצים', art: 'console', x: 60, y: 300, w: 200, h: 170, visibleWhen: ['solved:service'], activeWhen: ['solved:servicepanel'],
      interactions: [
        { type: 'note', when: ['solved:servicepanel'], note: { title: 'לוח החצים', text: 'הלוח נדלק בירוק. מאחורי הקיר נפתח מעבר.' } },
        { type: 'lock', title: 'לוח החצים', prompt: '״כיוון הסירה — כפול השעה. קודם מה שראיתם ראשון.״', lock: { kind: 'arrows', answer: ['left', 'left', 'right'] }, onSolve: { message: 'נפתח מעבר נסתר — לחדר 404!', notebook: ['panel'] } },
      ],
    },
    // ── חדר 404 ──
    { id: 'room404note', scene: 'room404', name: 'פתק על השולחן', art: 'manual', x: 100, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'פתק על השולחן', notebook: 'exitrule', text: '״הגעתם לחדר שלא קיים. קוד היציאה: הקומה, ואחריה השעות — לפי הסדר שבו ראיתם.״' } }] },
    {
      id: 'exit', scene: 'room404', name: 'דלת היציאה', art: 'door', x: 520, y: 120, w: 180, h: 360, variant: '404',
      interactions: [
        { type: 'lock', title: 'דלת היציאה', prompt: 'קוד בן 3 ספרות.', lock: { kind: 'digits', length: 3, answer: '321' }, onSolve: { message: 'הדלת נפתחה ישר אל רחוב שקט. יצאתם מחדר 404!', escape: true } },
      ],
    },
  ],
  hints: [],
  puzzles: [
    { id: 'hotel-1', name: 'ספר האורחים', sees: 'לובי ריק, ספר אורחים ומעלית עם ארבע קומות.', doneWhen: 'solved:elevator', solution: 'קומה 3', explanation: 'האות הראשונה בכל שורה בספר האורחים יוצרת את המילה ״שלישי״ — הקומה השלישית.', hints: ['הפתק בדלפק: ״קראו נכון את האורחים״.', 'הסתכלו על תחילת כל שורה.', 'ש־ל־י־ש־י: קומה 3.'], after: 'נפתחים המסדרון וחדר 401.', wrong: 'המעלית מתנהגת מוזר וחוזרת.' },
    { id: 'hotel-2', name: 'החדר שמשתנה', sees: 'חדר 401 ודלת שאפשר לצאת ממנה ולהיכנס שוב.', availableWhen: ['solved:elevator'], doneWhen: 'solved:diffs', solution: 'הציור והשעון', explanation: 'ביציאה וכניסה החדר עובר בין שתי גרסאות. בגרסה ב׳ הסירה פונה לצד השני והשעון מראה שעה אחרת; המנורה, הכרית והווילון לא משתנים.', hints: ['״השוו את החדר לעצמו״.', 'צאו מהחדר והיכנסו שוב — ובדקו כל פריט.', 'הציור והשעון.'], after: 'מגירת השידה נפתחת — יש בה צרור מפתחות.', wrong: '״הסימון לא נכון״ (נספר).' },
    { id: 'hotel-3', name: 'המפתח של הציור', sees: 'צרור מפתחות עם סמלים ושתי דלתות נעולות.', availableWhen: ['solved:diffs'], doneWhen: 'solved:doors', solution: 'דלת 402 · מפתח הכוכב', explanation: 'התג אומר ״המפתח של הציור״. בגרסה ב׳ של הציור יש כוכב ליד המספר 402.', hints: ['על תג המפתחות כתוב משהו.', 'מה מופיע בציור רק בגרסה ב׳?', 'כוכב, 402.'], after: 'נפתח חדר 402.', wrong: 'המפתח לא נכנס או לא מסתובב.' },
    { id: 'hotel-4', name: 'המראה', sees: 'מראה עם כתב הפוך ומעלית שירות עם מקלדת.', availableWhen: ['solved:doors'], doneWhen: 'solved:service', solution: 'לילה', explanation: 'הכתב במראה הפוך; קריאה ישרה (או המצב ״קריאה ישרה״) נותנת: ״הסיסמה למעלית השירות: לילה״.', hints: ['הכתב במראה הפוך.', 'אפשר להפוך את התצוגה לקריאה ישרה.', 'לילה.'], after: 'במעלית השירות לוח חצים.', wrong: '״סיסמה שגויה״ (נספר).' },
    { id: 'hotel-5', name: 'לוח החצים', sees: 'לוח חצים: ״כיוון הסירה — כפול השעה. קודם מה שראיתם ראשון.״', availableWhen: ['solved:service'], doneWhen: 'solved:servicepanel', solution: 'שמאלה, שמאלה, ימינה', explanation: 'גרסה א׳: סירה שמאלה, שעה 2 → שמאלה פעמיים. גרסה ב׳: סירה ימינה, שעה 1 → ימינה פעם אחת.', hints: ['המחברת זוכרת את שתי הגרסאות.', 'כל גרסה: כיוון הסירה, חוזר כמספר השעה.', '← ← →'], after: 'נפתח מעבר לחדר 404.', wrong: 'הלוח מהבהב באדום (נספר).' },
    { id: 'hotel-6', name: 'היציאה מחדר 404', sees: 'חדר שלא אמור להתקיים ודלת עם קוד בן 3 ספרות.', availableWhen: ['solved:servicepanel'], doneWhen: 'escaped', solution: '321', explanation: 'הקומה — 3. השעות לפי הסדר שבו ראיתם: 2 (גרסה א׳) ואז 1 (גרסה ב׳).', hints: ['הפתק אומר ממה בנוי הקוד.', 'באיזו קומה אתם? אילו שעות ראיתם?', '3, 2, 1.'], after: 'יוצאים מהמלון. סוף החדר.', wrong: '״קוד שגוי״ (נספר).' },
  ],
  walkthrough: [
    { read: 'guestbook' },
    { solve: 'elevator', input: '3' },
    { read: 'painting' },
    { read: 'clock' },
    { act: 'exitdoor' },
    { read: 'painting' },
    { read: 'clock' },
    { solve: 'diffs', input: 'painting,clock' },
    { take: 'nightstand' },
    { solve: 'doors', input: 'd402star' },
    { read: 'mirror' },
    { solve: 'service', input: 'לילה' },
    { solve: 'servicepanel', input: 'left,left,right' },
    { read: 'room404note' },
    { solve: 'exit', input: '321' },
  ],
}

// where each object is in the room's image (pixels of the 1672×941 image)
placeOnPhoto(hotel.hotspots, {
  guestbook: [255, 525, 450, 185], desk: [705, 555, 140, 95],
  corridorsign: [0, 712, 400, 175], doors: [300, 160, 300, 330], exitdoor: [645, 225, 105, 270],
  painting: [775, 185, 120, 255], clock: [295, 0, 130, 125], lamp: [55, 330, 235, 190],
  mirror: [1385, 30, 287, 555], servicepanel: [1405, 585, 225, 95], exit: [1060, 230, 180, 395],
})
