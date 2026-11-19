import type { RoomDef } from '../types'

export const lab: RoomDef = {
  id: 'lab',
  version: 1,
  title: 'המעבדה של ד״ר נוי',
  emoji: '🧪',
  category: 'מדע ודמיון',
  length: '15–25 דקות',
  darkUntil: 'power',
  story: 'ד״ר נוי נעלמה, ומחשב המעבדה ״נוי־בוט״ נעל אתכם בפנים. בעוד 30 דקות המעבדה תיאטם לגמרי. מצאו את קוד הכספת — בתוכה כרטיס היציאה.',
  scenes: [
    { id: 'desk', name: 'שולחן העבודה', theme: 'lab' },
    { id: 'shelves', name: 'מדפי הדגימות', theme: 'lab' },
  ],
  items: [
    { id: 'uv', name: 'פנס UV', icon: '🔦', note: { title: 'פנס אולטרה־סגול', text: 'פנס קטן שמאיר באור סגול. חושף כתב סמוי.' } },
    { id: 'screwdriver', name: 'מברג', icon: '🪛', note: { title: 'מברג', text: 'מברג פיליפס רגיל.' } },
    { id: 'fuse', name: 'נתיך', icon: '🔌', note: { title: 'נתיך', text: 'נתיך חשמלי תקין.' } },
    { id: 'keycard', name: 'כרטיס יציאה', icon: '💳', note: { title: 'כרטיס היציאה', text: 'כרטיס מגנטי עם הכיתוב ״יציאה — ד״ר נוי״.' } },
  ],
  hotspots: [
    // ── desk ──
    {
      id: 'clock', scene: 'desk', name: 'שעון הקיר', art: 'clock', variant: '7:45', x: 70, y: 50, w: 140, h: 140,
      interactions: [{ type: 'note', note: { title: 'שעון הקיר', text: 'השעון עומד. המחוגים מראים בדיוק 7:45.' } }],
    },
    {
      id: 'trash', scene: 'desk', name: 'פח האשפה', art: 'trash', x: 620, y: 440, w: 90, h: 120,
      interactions: [{ type: 'note', note: { title: 'פתק מקומט מהפח', text: '״את המגירה נעלתי בשעה שבה התחיל הניסוי — השעה שבה השעון נעצר. בלי נקודתיים.״ — ד״ר נוי', style: 'paper' } }],
    },
    {
      id: 'terminal', scene: 'desk', name: 'המחשב', art: 'terminal', x: 290, y: 150, w: 230, h: 190, activeWhen: ['power'],
      interactions: [
        { type: 'blocked', when: ['!power'], note: { title: 'המחשב כבוי', text: 'המסך שחור. נראה שאין חשמל במעבדה.', style: 'screen' } },
        { type: 'lock', when: ['!solved:terminal'], title: 'נוי־בוט', prompt: 'נוי־בוט: ״הזינו את שם הפרויקט הסודי.״', lock: { kind: 'terminal', answers: ['אורה', 'פרויקט אורה'] }, onSolve: { message: 'המחשב נפרץ!' } },
        { type: 'note', note: { title: 'נוי־בוט', text: '״גישה אושרה. קוד הכספת מתחיל ב־19. את שתי הספרות האחרונות הדבקתי מתחת לשולחן.״', style: 'screen' } },
      ],
    },
    {
      id: 'under', scene: 'desk', name: 'מתחת לשולחן', art: 'desk-under', x: 250, y: 470, w: 300, h: 80,
      interactions: [{ type: 'note', note: { title: 'מתחת לשולחן', text: 'מדבקה צהובה דבוקה מתחת למשטח. כתוב עליה: 42', style: 'paper' } }],
    },
    {
      id: 'drawer', scene: 'desk', name: 'המגירה', art: 'drawer', x: 300, y: 370, w: 200, h: 80, activeWhen: ['solved:drawer'],
      interactions: [
        { type: 'lock', when: ['!solved:drawer'], title: 'מגירה נעולה', prompt: 'מנעול של 3 ספרות.', lock: { kind: 'digits', length: 3, answer: '745' }, onSolve: { message: 'המגירה נפתחה!' } },
        { type: 'take', when: ['!took:uv'], item: 'uv', note: { title: 'המגירה פתוחה', text: 'בתוך המגירה מונח פנס אולטרה־סגול.' } },
        { type: 'note', note: { title: 'המגירה', text: 'המגירה ריקה.' } },
      ],
    },
    {
      id: 'door', scene: 'desk', name: 'דלת היציאה', art: 'door', x: 640, y: 90, w: 130, h: 330,
      interactions: [
        { type: 'needItem', item: 'keycard', note: { title: 'דלת היציאה', text: 'דלת פלדה עם קורא כרטיסים. נפתחת רק עם כרטיס היציאה.' }, onUse: { message: 'דלת היציאה נפתחה — ברחתם!', escape: true } },
      ],
    },
    // ── shelves ──
    {
      id: 'whiteboard', scene: 'shelves', name: 'הלוח הלבן', art: 'whiteboard', x: 40, y: 50, w: 280, h: 180,
      interactions: [{ type: 'note', note: { title: 'הלוח הלבן', text: '״נוסחת הערבוב הבטוחה: צהוב 4, אדום 1, כחול 3, ירוק 2. מערבבים מהמספר הקטן לגדול.״' } }],
    },
    {
      id: 'mixer', scene: 'shelves', name: 'מכונת הערבוב', art: 'mixer', x: 330, y: 260, w: 240, h: 190, activeWhen: ['solved:mixer'],
      interactions: [
        { type: 'lock', when: ['!solved:mixer'], title: 'מכונת הערבוב', prompt: 'ארבע מבחנות צבעוניות. לוחצים עליהן בסדר הנכון.', lock: { kind: 'colors', options: ['red', 'green', 'blue', 'yellow'], answer: ['red', 'green', 'blue', 'yellow'] }, onSolve: { giveItems: ['screwdriver'], message: 'מכונת הערבוב פעלה — נפלט ממנה מברג!' } },
        { type: 'note', note: { title: 'מכונת הערבוב', text: 'המכונה סיימה את הערבוב.' } },
      ],
    },
    {
      id: 'vent', scene: 'shelves', name: 'פתח האוורור', art: 'vent', x: 620, y: 400, w: 140, h: 100, activeWhen: ['used:vent'],
      interactions: [
        { type: 'needItem', when: ['!used:vent'], item: 'screwdriver', note: { title: 'פתח אוורור', text: 'רשת אוורור סגורה בארבעה ברגים. משהו מבריק מאחוריה.' }, onUse: { removeItems: ['screwdriver'], giveItems: ['fuse'], message: 'פתח האוורור פורק — מאחוריו נתיך!' } },
        { type: 'note', note: { title: 'פתח האוורור', text: 'הרשת פתוחה. אין כאן עוד כלום.' } },
      ],
    },
    {
      id: 'fusebox', scene: 'shelves', name: 'ארון החשמל', art: 'fusebox', x: 630, y: 70, w: 130, h: 170, activeWhen: ['power'],
      interactions: [
        { type: 'needItem', when: ['!power'], item: 'fuse', note: { title: 'ארון החשמל', text: 'בארון חסר נתיך אחד. בלי הנתיך אין חשמל במעבדה.' }, onUse: { removeItems: ['fuse'], setFlags: ['power'], message: 'החשמל חזר — המחשב נדלק!' } },
        { type: 'note', note: { title: 'ארון החשמל', text: 'כל הנתיכים במקום. החשמל פועל.' } },
      ],
    },
    {
      id: 'poster', scene: 'shelves', name: 'הפוסטר', art: 'poster', x: 360, y: 40, w: 200, h: 170, activeWhen: ['used:poster'],
      interactions: [
        { type: 'needItem', when: ['!used:poster'], item: 'uv', note: { title: 'פוסטר הטבלה המחזורית', text: 'פוסטר רגיל של הטבלה המחזורית. נראה שמישהו נגע בו הרבה.' }, onUse: { message: 'אור UV על הפוסטר — הופיע כתב סמוי!' } },
        { type: 'note', note: { title: 'כתב סמוי', text: 'באור UV מופיע כתב יד: ״פרויקט אורה״.', style: 'paper' } },
      ],
    },
    {
      id: 'vault', scene: 'shelves', name: 'כספת הקיר', art: 'safe', x: 70, y: 300, w: 190, h: 180, activeWhen: ['solved:vault'],
      interactions: [
        { type: 'lock', when: ['!solved:vault'], title: 'כספת הקיר', prompt: 'כספת עם מנעול של 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '1942' }, onSolve: { giveItems: ['keycard'], message: 'הכספת נפתחה — בפנים כרטיס היציאה!' } },
        { type: 'note', note: { title: 'כספת הקיר', text: 'הכספת פתוחה וריקה.' } },
      ],
    },
  ],
  hints: [
    { until: 'solved:drawer', text: 'השעון והפתק שבפח מספרים יחד מה הקוד של המגירה.' },
    { until: 'solved:mixer', text: 'הלוח הלבן במדפים אומר באיזה סדר ללחוץ על הצבעים: מ־1 עד 4.' },
    { until: 'used:vent', after: ['took:screwdriver'], text: 'יש לכם מברג. חפשו משהו שסגור בברגים.' },
    { until: 'power', after: ['took:fuse'], text: 'הנתיך שייך לארון החשמל.' },
    { until: 'used:poster', after: ['took:uv'], text: 'פנס UV חושף כתב סמוי. נסו אותו על הפוסטר.' },
    { until: 'solved:terminal', after: ['power'], text: 'שם הפרויקט הסודי כתוב על הפוסטר באור UV.' },
    { until: 'solved:vault', after: ['solved:terminal'], text: 'המחשב נתן את תחילת הקוד (19). את הסוף תמצאו מתחת לשולחן.' },
    { until: 'escaped', after: ['took:keycard'], text: 'כרטיס היציאה פותח את הדלת בשולחן העבודה.' },
  ],
  walkthrough: [
    { solve: 'drawer', input: '745' },
    { take: 'drawer' },
    { solve: 'mixer', input: 'red,green,blue,yellow' },
    { use: 'vent', item: 'screwdriver' },
    { use: 'fusebox', item: 'fuse' },
    { use: 'poster', item: 'uv' },
    { solve: 'terminal', input: 'אורה' },
    { solve: 'vault', input: '1942' },
    { use: 'door', item: 'keycard' },
  ],
}
