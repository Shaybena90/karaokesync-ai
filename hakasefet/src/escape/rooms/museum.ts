import type { RoomDef } from '../types'

export const museum: RoomDef = {
  id: 'museum',
  version: 1,
  title: 'המוזיאון בלילה',
  emoji: '🏛️',
  category: 'מדע ודמיון',
  length: '20–30 דקות',
  story: 'נשארתם במוזיאון אחרי הסגירה, ומערכת האבטחה נעלה את כל הדלתות. היציאה היחידה עוברת דרך כספת המוזיאון — ורק מי שיפצח אותה ייצא לפני שהשומרים יחזרו.',
  scenes: [
    { id: 'hall', name: 'אולם הציורים', theme: 'museum' },
    { id: 'office', name: 'משרד השומר', theme: 'museum' },
  ],
  items: [
    { id: 'magnifier', name: 'זכוכית מגדלת', icon: '🔍', note: { title: 'זכוכית מגדלת', text: 'זכוכית מגדלת עתיקה עם ידית עץ.' } },
    { id: 'bronzekey', name: 'מפתח ארד', icon: '🗝️', note: { title: 'מפתח ארד', text: 'מפתח ארד קטן עם תווית: ״שולחן השומר״.' } },
    { id: 'curatornote', name: 'פתק האוצרת', icon: '📜', note: { title: 'פתק מהאוצרת', text: '״תיבת התכשיטים נפתחת במילה: האות הראשונה בשם של כל אחד משלושת הפסלים הגדולים באולם, משמאל לימין.״', style: 'paper' } },
    { id: 'letter', name: 'מכתב חתום', icon: '✉️', note: { title: 'מכתב חתום', text: '״קוד כספת המוזיאון: שתי הספרות האחרונות בשנה של הציור הישן ביותר, ואחריהן שתי הספרות האחרונות בשנה של הציור החדש ביותר.״', style: 'paper' } },
  ],
  hotspots: [
    // ── hall ──
    {
      id: 'painting1', scene: 'hall', name: 'ציור במסגרת אדומה', art: 'painting', variant: 'red', x: 40, y: 60, w: 170, h: 140,
      interactions: [{ type: 'note', note: { title: 'שקיעה', text: 'ציור של שקיעה במסגרת אדומה. בשלט: ״שקיעה, 1889״.', style: 'plaque' } }],
    },
    {
      id: 'painting2', scene: 'hall', name: 'ציור במסגרת ירוקה', art: 'painting', variant: 'green', x: 240, y: 60, w: 170, h: 140,
      interactions: [{ type: 'note', note: { title: 'גל', text: 'ציור של ים סוער במסגרת ירוקה. בשלט: ״גל, 1831״.', style: 'plaque' } }],
    },
    {
      id: 'painting3', scene: 'hall', name: 'ציור במסגרת כחולה', art: 'painting', variant: 'blue', x: 440, y: 60, w: 170, h: 140,
      interactions: [{ type: 'note', note: { title: 'נשף', text: 'ציור של נשף במסגרת כחולה. בשלט: ״נשף, 1876״.', style: 'plaque' } }],
    },
    {
      id: 'statues', scene: 'hall', name: 'שלושת הפסלים', art: 'statues', x: 30, y: 300, w: 270, h: 240,
      interactions: [{ type: 'note', note: { title: 'שלושת הפסלים הגדולים', text: 'משמאל לימין: פסל של אריה, פסל של ורד, ופסל של רקדנית.', style: 'plaque' } }],
    },
    {
      id: 'showcase', scene: 'hall', name: 'תיבת התצוגה', art: 'showcase', x: 620, y: 230, w: 160, h: 230, activeWhen: ['solved:terminal'],
      interactions: [
        { type: 'blocked', when: ['!solved:terminal'], note: { title: 'תיבת התצוגה', text: 'קרני לייזר אדומות מגינות על התיבה. צריך לכבות את מערכת האבטחה.' } },
        { type: 'lock', when: ['!solved:showcase'], title: 'תיבת התצוגה', prompt: 'מנעול של שלושה צבעים.', lock: { kind: 'colors', options: ['red', 'green', 'blue', 'yellow'], answer: ['red', 'blue', 'green'] }, onSolve: { giveItems: ['magnifier'], message: 'תיבת התצוגה נפתחה — בפנים זכוכית מגדלת!' } },
        { type: 'note', note: { title: 'תיבת התצוגה', text: 'התיבה פתוחה וריקה.' } },
      ],
    },
    {
      id: 'vault', scene: 'hall', name: 'כספת המוזיאון', art: 'safe', x: 340, y: 320, w: 200, h: 200,
      interactions: [
        { type: 'lock', title: 'כספת המוזיאון', prompt: 'כספת עם מנעול של 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '3189' }, onSolve: { message: 'כספת המוזיאון נפתחה — ברחתם!', escape: true } },
      ],
    },
    // ── office ──
    {
      id: 'terminal', scene: 'office', name: 'מחשב האבטחה', art: 'terminal', x: 40, y: 130, w: 230, h: 190, activeWhen: ['solved:terminal'],
      interactions: [
        { type: 'lock', when: ['!solved:terminal'], title: 'מערכת האבטחה', prompt: 'מערכת האבטחה: ״הזינו את השנה של הציור העתיק ביותר באולם.״', lock: { kind: 'terminal', numeric: true, answers: ['1831'] }, onSolve: { message: 'הלייזרים כבו!' } },
        { type: 'note', note: { title: 'מערכת האבטחה', text: '״הלייזרים כבויים.״', style: 'screen' } },
      ],
    },
    {
      id: 'notebook', scene: 'office', name: 'מחברת השומר', art: 'book', x: 300, y: 430, w: 170, h: 110,
      interactions: [{ type: 'note', note: { title: 'מחברת השומר', text: '״הקוד של תיבת התצוגה: צבעי המסגרות, מהציור החדש ביותר אל הישן ביותר.״', style: 'book' } }],
    },
    {
      id: 'owl', scene: 'office', name: 'פסלון הינשוף', art: 'owl', x: 520, y: 330, w: 110, h: 170, activeWhen: ['used:owl'],
      interactions: [
        { type: 'needItem', when: ['!used:owl'], item: 'magnifier', note: { title: 'פסלון ינשוף', text: 'פסלון ינשוף על השולחן. בבסיס שלו יש חריטה זעירה מדי לקריאה.' }, onUse: { message: 'החריטה בבסיס הינשוף נחשפה!' } },
        { type: 'note', note: { title: 'החריטה בבסיס', text: 'בזכוכית המגדלת רואים חיצים: שמאלה, למעלה, שמאלה, למטה.', style: 'plaque' } },
      ],
    },
    {
      id: 'cabinet', scene: 'office', name: 'ארון התיקים', art: 'cabinet', x: 650, y: 90, w: 130, h: 280, activeWhen: ['solved:cabinet'],
      interactions: [
        { type: 'lock', when: ['!solved:cabinet'], title: 'ארון התיקים', prompt: 'מנעול חיצים. ארבעה צעדים.', lock: { kind: 'arrows', answer: ['left', 'up', 'left', 'down'] }, onSolve: { giveItems: ['bronzekey'], message: 'ארון התיקים נפתח — בפנים מפתח ארד!' } },
        { type: 'note', note: { title: 'ארון התיקים', text: 'הארון פתוח וריק.' } },
      ],
    },
    {
      id: 'desk', scene: 'office', name: 'שולחן השומר', art: 'drawer', x: 300, y: 300, w: 190, h: 90, activeWhen: ['used:desk'],
      interactions: [
        { type: 'needItem', when: ['!used:desk'], item: 'bronzekey', note: { title: 'שולחן השומר', text: 'למגירת השולחן יש מנעול ארד קטן.' }, onUse: { removeItems: ['bronzekey'], giveItems: ['curatornote'], message: 'מגירת השומר נפתחה — בפנים פתק מהאוצרת!' } },
        { type: 'note', note: { title: 'שולחן השומר', text: 'המגירה ריקה.' } },
      ],
    },
    {
      id: 'jewelbox', scene: 'office', name: 'תיבת התכשיטים', art: 'jewelbox', x: 640, y: 450, w: 140, h: 90, activeWhen: ['solved:jewelbox'],
      interactions: [
        { type: 'lock', when: ['!solved:jewelbox'], title: 'תיבת התכשיטים', prompt: 'מנעול אותיות. שלוש אותיות.', lock: { kind: 'letters', length: 3, answer: 'אור' }, onSolve: { giveItems: ['letter'], message: 'תיבת התכשיטים נפתחה — בפנים מכתב חתום!' } },
        { type: 'note', note: { title: 'תיבת התכשיטים', text: 'התיבה ריקה.' } },
      ],
    },
  ],
  hints: [
    { until: 'solved:terminal', text: 'קראו את השלטים של שלושת הציורים ומצאו את השנה הקטנה ביותר.' },
    { until: 'solved:showcase', after: ['solved:terminal'], text: 'מחברת השומר: מסדרים את המסגרות לפי השנים — 1889, 1876, 1831.' },
    { until: 'used:owl', after: ['took:magnifier'], text: 'בבסיס פסלון הינשוף יש חריטה. השתמשו בזכוכית המגדלת.' },
    { until: 'solved:cabinet', after: ['used:owl'], text: 'החיצים מהינשוף פותחים את ארון התיקים.' },
    { until: 'used:desk', after: ['took:bronzekey'], text: 'מפתח הארד פותח את מגירת השומר.' },
    { until: 'solved:jewelbox', after: ['took:curatornote'], text: 'אריה, ורד, רקדנית — קחו את האות הראשונה של כל אחד.' },
    { until: 'escaped', after: ['took:letter'], text: 'הציור הישן ביותר מ־1831 והחדש ביותר מ־1889.' },
  ],
  walkthrough: [
    { solve: 'terminal', input: '1831' },
    { solve: 'showcase', input: 'red,blue,green' },
    { use: 'owl', item: 'magnifier' },
    { solve: 'cabinet', input: 'left,up,left,down' },
    { use: 'desk', item: 'bronzekey' },
    { solve: 'jewelbox', input: 'אור' },
    { solve: 'vault', input: '3189' },
  ],
}
