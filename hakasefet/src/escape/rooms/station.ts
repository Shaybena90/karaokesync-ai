import type { RoomDef } from '../types'

export const station: RoomDef = {
  id: 'station',
  version: 1,
  title: 'תחנת החלל השקטה',
  emoji: '🚀',
  category: 'מדע ודמיון',
  length: '15–25 דקות',
  darkUntil: 'used:slot',
  story: 'התחנה איבדה קשר עם כדור הארץ, והמחשב הראשי נעל את כל הדלתות. החמצן יספיק ל־30 דקות. החזירו את המתח למנועים, פצחו את המחשב והגיעו לתא המילוט.',
  scenes: [
    { id: 'bridge', name: 'גשר הפיקוד', theme: 'station' },
    { id: 'engine', name: 'חדר המנועים', theme: 'station' },
  ],
  items: [
    { id: 'navcard', name: 'כרטיס ניווט', icon: '🧭', note: { title: 'כרטיס ניווט', text: 'על הכרטיס מודפס מסלול, צעד אחר צעד:\n1. למעלה\n2. למעלה\n3. שמאלה\n4. למטה\n5. ימינה', style: 'paper' } },
    { id: 'battery', name: 'סוללה', icon: '🔋', note: { title: 'סוללה', text: 'סוללת על־מוליך טעונה במלואה.' } },
  ],
  hotspots: [
    // ── bridge ──
    {
      id: 'log', scene: 'bridge', name: 'יומן הקברניט', art: 'book', x: 50, y: 420, w: 170, h: 110,
      interactions: [{ type: 'note', note: { title: 'יומן הקברניט', text: '״הסיסמה לארונית שלי היא שם כוכב הלכת שאנחנו מקיפים. תמצאו אותו במפת הכוכבים.״', style: 'book' } }],
    },
    {
      id: 'starmap', scene: 'bridge', name: 'מפת הכוכבים', art: 'starmap', x: 40, y: 50, w: 320, h: 220,
      interactions: [{ type: 'note', note: { title: 'מפת הכוכבים', text: 'על המפה שלושה כוכבי לכת: צדק, שבתאי ומאדים. ליד מאדים מהבהב חץ: ״התחנה שלנו כאן״.', style: 'screen' } }],
    },
    {
      id: 'locker', scene: 'bridge', name: 'הארונית', art: 'locker', x: 400, y: 70, w: 120, h: 280, activeWhen: ['solved:locker'],
      interactions: [
        { type: 'lock', when: ['!solved:locker'], title: 'ארונית הקברניט', prompt: 'מנעול אותיות. חמש אותיות.', lock: { kind: 'letters', length: 5, answer: 'מאדים' }, onSolve: { giveItems: ['navcard'], message: 'ארונית הקברניט נפתחה — בפנים כרטיס ניווט!' } },
        { type: 'note', note: { title: 'הארונית', text: 'הארונית ריקה.' } },
      ],
    },
    {
      id: 'console', scene: 'bridge', name: 'מחשב התחנה', art: 'console', x: 260, y: 360, w: 300, h: 170, activeWhen: ['solved:switches'],
      interactions: [
        { type: 'blocked', when: ['!solved:switches'], note: { title: 'מחשב התחנה', text: 'על המסך מהבהב: ״אין מתח מהמנועים. כוונו את לוח המתגים בחדר המנועים.״', style: 'screen' } },
        { type: 'lock', when: ['!solved:console'], title: 'מחשב התחנה', prompt: 'מחשב התחנה: ״שאלת אבטחה — מהו סכום הלחצים בשלושת מכלי החמצן?״', lock: { kind: 'terminal', numeric: true, answers: ['42'] }, onSolve: { message: 'מחשב התחנה נפרץ!' } },
        { type: 'note', note: { title: 'מחשב התחנה', text: '״קוד תא המילוט: מספר האותיות בשם כוכב הלכת, אחריו התשובה שהזנתם כאן, ובסוף מספר המתגים הדולקים בחדר המנועים.״', style: 'screen', voice: { effect: 'computer', pitch: 0.6, lines: ['קוד תא המילוט:', 'מספר האותיות בשם כוכב הלכת,', 'אחריו התשובה שהזנתם כאן,', 'ובסוף — מספר המתגים הדולקים בחדר המנועים.'] } } },
      ],
    },
    {
      id: 'hatch', scene: 'bridge', name: 'תא המילוט', art: 'hatch', x: 580, y: 120, w: 190, h: 300,
      interactions: [
        { type: 'lock', title: 'תא המילוט', prompt: 'לוח מקשים של 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '5423' }, onSolve: { message: 'תא המילוט נפתח — ברחתם!', escape: true } },
      ],
    },
    // ── engine ──
    {
      id: 'crate', scene: 'engine', name: 'ארגז הכלים', art: 'crate', x: 50, y: 380, w: 210, h: 150, activeWhen: ['solved:crate'],
      interactions: [
        { type: 'lock', when: ['!solved:crate'], title: 'ארגז הכלים', prompt: 'מנעול חיצים. חמישה צעדים.', lock: { kind: 'arrows', answer: ['up', 'up', 'left', 'down', 'right'] }, onSolve: { giveItems: ['battery'], message: 'ארגז הכלים נפתח — בפנים סוללה!' } },
        { type: 'note', note: { title: 'ארגז הכלים', text: 'הארגז ריק.' } },
      ],
    },
    {
      id: 'slot', scene: 'engine', name: 'שקע הסוללה', art: 'slot', x: 320, y: 80, w: 130, h: 130, activeWhen: ['used:slot'],
      interactions: [
        { type: 'needItem', when: ['!used:slot'], item: 'battery', note: { title: 'שקע הסוללה', text: 'שקע ריק. בלי סוללה לוח המתגים לא מקבל מתח.' }, onUse: { removeItems: ['battery'], message: 'הסוללה במקום — לוח המתגים התעורר!' } },
        { type: 'note', note: { title: 'שקע הסוללה', text: 'הסוללה במקום ומאירה בירוק.' } },
      ],
    },
    {
      id: 'switches', scene: 'engine', name: 'לוח המתגים', art: 'switches', x: 490, y: 70, w: 270, h: 160, activeWhen: ['solved:switches'],
      interactions: [
        { type: 'blocked', when: ['!used:slot'], note: { title: 'לוח המתגים', text: 'הלוח מת. אין לו מתח.' } },
        { type: 'lock', when: ['!solved:switches'], title: 'לוח המתגים', prompt: 'שישה מתגים, ממוספרים מ־1 עד 6.', lock: { kind: 'switches', count: 6, answer: [false, true, false, true, false, true] }, onSolve: { message: 'המתגים כוונו — המנועים פועלים!' } },
        { type: 'note', note: { title: 'לוח המתגים', text: 'המתגים 2, 4 ו־6 דולקים. המנועים מזמזמים.' } },
      ],
    },
    {
      id: 'manual', scene: 'engine', name: 'מדריך המנוע', art: 'manual', x: 520, y: 280, w: 230, h: 120,
      interactions: [{ type: 'note', note: { title: 'מדריך המנוע', text: '״מצב בטוח: מדליקים רק את המתגים שמספרם זוגי. כל השאר כבויים.״', style: 'book' } }],
    },
    {
      id: 'tanks', scene: 'engine', name: 'מכלי החמצן', art: 'tanks', x: 300, y: 300, w: 200, h: 240,
      interactions: [{ type: 'note', note: { title: 'מכלי החמצן', text: 'שלושה מכלי חמצן. על מדי הלחץ שלהם כתוב: 12, 7 ו־23.' } }],
    },
  ],
  hints: [
    { until: 'solved:locker', text: 'יומן הקברניט ומפת הכוכבים נותנים יחד את סיסמת הארונית.' },
    { until: 'solved:crate', after: ['took:navcard'], text: 'פתחו את כרטיס הניווט שבתיק — החיצים שלו פותחים את ארגז הכלים.' },
    { until: 'used:slot', after: ['took:battery'], text: 'הסוללה נכנסת לשקע בחדר המנועים.' },
    { until: 'solved:switches', after: ['used:slot'], text: 'מדריך המנוע אומר אילו מתגים להדליק: 2, 4 ו־6.' },
    { until: 'solved:console', after: ['solved:switches'], text: 'חברו את שלושת המספרים על מכלי החמצן.' },
    { until: 'escaped', after: ['solved:console'], text: 'במאדים 5 אותיות, התשובה למחשב היא 42, ויש 3 מתגים דולקים.' },
  ],
  walkthrough: [
    { solve: 'locker', input: 'מאדים' },
    { solve: 'crate', input: 'up,up,left,down,right' },
    { use: 'slot', item: 'battery' },
    { solve: 'switches', input: '010101' },
    { solve: 'console', input: '42' },
    { solve: 'hatch', input: '5423' },
  ],
}
