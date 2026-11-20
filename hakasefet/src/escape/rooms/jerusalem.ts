import type { RoomDef } from '../types'

/**
 * Inspired by the 1948 "Burma Road", a bypass track built to bring supplies to
 * besieged Jerusalem. Plot, characters and puzzles are fictional.
 */
export const jerusalem: RoomDef = {
  id: 'jerusalem',
  version: 1,
  title: 'הדרך לירושלים — 1948',
  emoji: '🛤️',
  category: 'מלחמות ישראל',
  length: '30–45 דקות',
  story: 'מאי 1948. ירושלים נצורה והשיירות לא עוברות. במפקדה שבהרים מחכה שיירת אספקה לפקודה — אבל הקשר עם ירושלים נותק. החזירו את הקשר, גלו איזו דרך בטוחה, ושדרו את מילת הקוד לפני שהשיירה יוצאת לדרך הלא נכונה.',
  history: 'בהשראת ״דרך בורמה״ — דרך עפר עוקפת שנסללה בהרים ב־1948, כדי להעביר מזון ואספקה לירושלים הנצורה. העלילה, הדמויות והחידות בחדר בדויות.',
  scenes: [
    { id: 'hq', name: 'חדר המפקדה', theme: 'hq' },
    { id: 'comms', name: 'חדר הקשר', theme: 'hq' },
    { id: 'store', name: 'המחסן', theme: 'hq' },
    { id: 'post', name: 'העמדה', theme: 'hq' },
  ],
  items: [
    { id: 'flashlight', name: 'פנס כבוי', icon: '🔦', note: { title: 'פנס', text: 'פנס יד בלי סוללה.' } },
    { id: 'battery', name: 'סוללה', icon: '🔋', note: { title: 'סוללה', text: 'סוללה גדולה לפנס.' } },
    { id: 'litlamp', name: 'פנס דולק', icon: '🔦', note: { title: 'פנס דולק', text: 'הפנס עובד ומאיר חזק.' } },
    { id: 'pliers', name: 'צבת', icon: '🛠️', note: { title: 'צבת', text: 'צבת של חשמלאי.' } },
    { id: 'headphones', name: 'אוזניות', icon: '🎧', note: { title: 'אוזניות', text: 'אוזניות של מכשיר קשר.' } },
    { id: 'codecard', name: 'כרטיס הקודים', icon: '🗂️', note: { title: 'כרטיס הקודים', text: 'מילות קוד לדרכים: דרך 1 — ״אלון״ · דרך 2 — ״ברוש״ · דרך 3 — ״גפן״.', style: 'paper' } },
  ],
  hotspots: [
    // ── חדר המפקדה ──
    {
      id: 'clock', scene: 'hq', name: 'שעון הקיר', art: 'clock', variant: '4:10', x: 60, y: 50, w: 140, h: 140,
      interactions: [{ type: 'note', note: { title: 'שעון הקיר', text: 'השעון עצר. המחוגים מראים 4:10.' } }],
    },
    {
      id: 'logbook', scene: 'hq', name: 'יומן המבצעים', art: 'book', x: 240, y: 430, w: 180, h: 110,
      interactions: [{ type: 'note', note: { title: 'יומן המבצעים', text: '״את מגירת המפקד נועלים בשעה שבה יצאה השיירה האחרונה — השעה שבה נעצר השעון. ארבע ספרות.״', easy: '״את מגירת המפקד נועלים בשעה שבה יצאה השיירה האחרונה — השעה שבה נעצר השעון. ארבע ספרות (למשל 9:05 נכתב 0905).״', hard: '״המגירה — בשעה שבה הכול נעצר.״', style: 'book' } }],
    },
    {
      id: 'desk', scene: 'hq', name: 'מגירת המפקד', art: 'drawer', x: 470, y: 380, w: 200, h: 90, activeWhen: ['solved:desk'],
      interactions: [
        { type: 'lock', when: ['!solved:desk'], title: 'מגירת המפקד', prompt: 'מנעול של 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '0410' }, onSolve: { giveItems: ['flashlight'], message: 'מגירת המפקד נפתחה — בפנים פנס!' } },
        { type: 'note', note: { title: 'מגירת המפקד', text: 'המגירה ריקה.' } },
      ],
    },
    {
      id: 'map', scene: 'hq', name: 'מפת הדרכים', art: 'map', x: 240, y: 60, w: 340, h: 230,
      interactions: [{ type: 'note', note: { title: 'מפת הדרכים לירושלים', text: 'שלוש דרכים ממוספרות: דרך 1 — הכביש הראשי ליד לטרון. דרך 2 — דרך שער הגיא. דרך 3 — שביל חדש בין ההרים, שסוללים אותו בלילות.' } }],
    },
    {
      id: 'bag', scene: 'hq', name: 'תרמיל הקשר', art: 'jewelbox', x: 640, y: 470, w: 130, h: 80, activeWhen: ['took:headphones'],
      interactions: [
        { type: 'take', when: ['!took:headphones'], item: 'headphones', note: { title: 'תרמיל הקשר', text: 'תרמיל של קשר. בתוכו זוג אוזניות.' } },
        { type: 'note', note: { title: 'תרמיל הקשר', text: 'התרמיל ריק.' } },
      ],
    },
    // ── חדר הקשר ──
    {
      id: 'freqboard', scene: 'comms', name: 'לוח התדרים', art: 'whiteboard', x: 40, y: 60, w: 260, h: 180,
      interactions: [{ type: 'note', note: { title: 'לוח התדרים', text: 'מפקדה — 214 · ירושלים — 367 · תל אביב — 152.' } }],
    },
    {
      id: 'radio', scene: 'comms', name: 'מכשיר הקשר', art: 'radio', x: 260, y: 300, w: 260, h: 160, activeWhen: ['solved:radio'],
      interactions: [
        { type: 'blocked', when: ['!used:mast'], note: { title: 'מכשיר הקשר', text: 'מהרמקול נשמע רק רעש. נראה שחוט האנטנה בחוץ קרוע.' } },
        { type: 'lock', when: ['!solved:radio'], title: 'מכשיר הקשר', prompt: 'סובבו את חוגת התדר עד שהרעש נעלם, ולחצו ״קליטה״.', lock: { kind: 'tuner', min: 100, max: 400, answer: 367 }, onSolve: { message: 'יש קשר עם ירושלים!' } },
        { type: 'needItem', when: ['!used:radio'], item: 'headphones', note: { title: 'מכשיר הקשר', text: 'מישהו עונה מירושלים, אבל ברעש של המחולל אי אפשר לשמוע מילה בלי אוזניות.' }, onUse: { message: 'שומעים את ירושלים בבירור!' } },
        { type: 'note', note: { title: 'ירושלים על הקו', text: '״כאן ירושלים. שלחו במכשיר המברקים את מילת הקוד של הדרך הבטוחה. מילות הקוד — בכרטיס הקודים שבארון הקשר.״', style: 'screen', voice: { effect: 'radio', pitch: 0.85, lines: ['כאן ירושלים. שומעים אתכם.', 'שלחו במכשיר המברקים את מילת הקוד של הדרך הבטוחה.', 'מילות הקוד — בכרטיס הקודים שבארון הקשר.', 'עבור.'] } } },
      ],
    },
    {
      id: 'codelocker', scene: 'comms', name: 'ארון הקודים', art: 'locker', x: 600, y: 150, w: 140, h: 300, activeWhen: ['solved:codelocker'],
      interactions: [
        { type: 'lock', when: ['!solved:codelocker'], title: 'ארון הקודים', prompt: 'מנעול אותיות — 5 אותיות. מדבקה: ״שם המבצע״.', lock: { kind: 'letters', length: 5, answer: 'נחשון' }, onSolve: { giveItems: ['codecard'], message: 'ארון הקודים נפתח — כרטיס הקודים אצלכם!' } },
        { type: 'note', note: { title: 'ארון הקודים', text: 'הארון ריק.' } },
      ],
    },
    {
      id: 'morse', scene: 'comms', name: 'מכשיר המברקים', art: 'typewriter', x: 50, y: 360, w: 180, h: 120,
      interactions: [
        { type: 'blocked', when: ['!used:radio'], note: { title: 'מכשיר המברקים', text: 'אין עם מי לדבר — קודם צריך קשר ברור עם ירושלים.' } },
        { type: 'lock', title: 'מכשיר המברקים', prompt: 'מקלידים את מילת הקוד של הדרך הבטוחה.', lock: { kind: 'terminal', answers: ['גפן'] }, onSolve: { message: 'מילת הקוד שודרה — השיירה יוצאת לירושלים בדרך הבטוחה!', escape: true } },
      ],
    },
    // ── המחסן ──
    {
      id: 'supplies', scene: 'store', name: 'ארגזי האספקה', art: 'crate', x: 40, y: 380, w: 220, h: 150,
      interactions: [{ type: 'note', note: { title: 'ארגזי האספקה', text: 'חמישה ארגזים, ועל כל אחד מספר ואות: 3 — ש · 1 — נ · 5 — ן · 2 — ח · 4 — ו.', easy: 'חמישה ארגזים, ועל כל אחד מספר ואות: 3 — ש · 1 — נ · 5 — ן · 2 — ח · 4 — ו. (מסדרים את האותיות לפי המספרים)' } }],
    },
    {
      id: 'sign', scene: 'store', name: 'שלט מסלול הסיור', art: 'poster', x: 300, y: 60, w: 200, h: 200,
      interactions: [{ type: 'note', note: { title: 'שלט', text: '״מסלול הסיור: ימינה, למעלה, למעלה, שמאלה.״', easy: '״מסלול הסיור: ימינה, למעלה, למעלה, שמאלה.״ — אותו מסלול כמו בארגז הכלים.', style: 'paper' } }],
    },
    {
      id: 'toolbox', scene: 'store', name: 'ארגז הכלים', art: 'crate', x: 510, y: 420, w: 120, h: 110, activeWhen: ['solved:toolbox'],
      interactions: [
        { type: 'lock', when: ['!solved:toolbox'], title: 'ארגז הכלים', prompt: 'מנעול חיצים. ארבעה צעדים.', lock: { kind: 'arrows', answer: ['right', 'up', 'up', 'left'] }, onSolve: { giveItems: ['battery'], message: 'ארגז הכלים נפתח — בפנים סוללה!' } },
        { type: 'note', note: { title: 'ארגז הכלים', text: 'הארגז ריק.' } },
      ],
    },
    {
      id: 'workbench', scene: 'store', name: 'שולחן התיקונים', art: 'drawer', x: 300, y: 330, w: 200, h: 90, activeWhen: ['used:workbench'],
      interactions: [
        { type: 'blocked', when: ['!took:battery'], note: { title: 'שולחן התיקונים', text: 'שולחן עם כלים קטנים. כדי לתקן כאן פנס צריך סוללה.' } },
        { type: 'needItem', when: ['!used:workbench'], item: 'flashlight', note: { title: 'שולחן התיקונים', text: 'יש סוללה. עכשיו צריך את הפנס כדי להרכיב אותה בו.' }, onUse: { removeItems: ['flashlight', 'battery'], giveItems: ['litlamp'], message: 'הסוללה הורכבה — הפנס דולק!' } },
        { type: 'note', note: { title: 'שולחן התיקונים', text: 'השולחן מסודר.' } },
      ],
    },
    {
      id: 'shelf', scene: 'store', name: 'המדף החשוך', art: 'cabinet', x: 640, y: 120, w: 130, h: 320, activeWhen: ['used:shelf'],
      interactions: [
        { type: 'needItem', when: ['!used:shelf'], item: 'litlamp', note: { title: 'המדף החשוך', text: 'המדף בפינה חשוך לגמרי. לא רואים מה יש בו.' }, onUse: { giveItems: ['pliers'], message: 'באור הפנס נגלתה צבת על המדף!' } },
        { type: 'note', note: { title: 'המדף', text: 'על המדף רק חבלים ושקים ריקים.' } },
      ],
    },
    // ── העמדה ──
    {
      id: 'report', scene: 'post', name: 'דיווח התצפית', art: 'book', x: 60, y: 420, w: 180, h: 110,
      interactions: [{ type: 'note', note: { title: 'דיווח התצפית', text: '״לטרון בידי האויב. בשער הגיא — מארב. בשביל בין ההרים — שקט.״', style: 'paper' } }],
    },
    {
      id: 'mast', scene: 'post', name: 'תורן האנטנה', art: 'ladder', x: 520, y: 60, w: 140, h: 490, activeWhen: ['used:mast'],
      interactions: [
        { type: 'needItem', when: ['!used:mast'], item: 'pliers', note: { title: 'תורן האנטנה', text: 'חוט האנטנה קרוע ומסובך. צריך כלי כדי לחבר אותו מחדש.' }, onUse: { removeItems: ['pliers'], message: 'חוט האנטנה חובר — יש קליטה!' } },
        { type: 'note', note: { title: 'תורן האנטנה', text: 'החוט מחובר והאנטנה קולטת.' } },
      ],
    },
    {
      id: 'sandbags', scene: 'post', name: 'שקי החול', art: 'crate', x: 260, y: 430, w: 220, h: 110,
      interactions: [{ type: 'note', note: { title: 'שקי החול', text: 'בין השקים — פתק מקומט: ״הסיסמה לארון הקודים: שם המבצע. האותיות על ארגזי האספקה, והמספרים קובעים את הסדר.״', hard: 'פתק מקומט: ״ארון הקודים: ארגזי האספקה.״', style: 'paper' } }],
    },
  ],
  hints: [
    { until: 'solved:desk', text: 'השעון עצר על 4:10 — ויומן המבצעים אומר שזה קוד המגירה: 0410.' },
    { until: 'solved:toolbox', text: 'השלט במחסן מראה את מסלול החיצים של ארגז הכלים.' },
    { until: 'used:workbench', after: ['took:battery', 'took:flashlight'], text: 'בשולחן התיקונים מרכיבים את הסוללה בפנס.' },
    { until: 'used:shelf', after: ['took:litlamp'], text: 'עם פנס דולק אפשר לראות מה יש על המדף החשוך.' },
    { until: 'used:mast', after: ['took:pliers'], text: 'הצבת מתקנת את חוט האנטנה בעמדה.' },
    { until: 'solved:radio', after: ['used:mast'], text: 'לוח התדרים: ירושלים — 367.' },
    { until: 'used:radio', after: ['solved:radio'], text: 'בתרמיל הקשר שבמפקדה יש אוזניות.' },
    { until: 'solved:codelocker', text: 'סדרו את האותיות על ארגזי האספקה לפי המספרים: נחשון.' },
    { until: 'escaped', after: ['solved:codelocker', 'used:radio'], text: 'לטרון בידי האויב ובשער הגיא מארב — הדרך הבטוחה היא 3: ״גפן״.' },
  ],
  walkthrough: [
    { solve: 'desk', input: '0410' },
    { solve: 'toolbox', input: 'right,up,up,left' },
    { use: 'workbench', item: 'flashlight' },
    { use: 'shelf', item: 'litlamp' },
    { use: 'mast', item: 'pliers' },
    { solve: 'radio', input: '367' },
    { take: 'bag' },
    { use: 'radio', item: 'headphones' },
    { solve: 'codelocker', input: 'נחשון' },
    { solve: 'morse', input: 'גפן' },
  ],
}
