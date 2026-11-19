import type { RoomDef } from '../types'

/**
 * Inspired by the codebreakers of Bletchley Park (England, WWII) who broke the
 * German Enigma cipher. Plot, characters and puzzles are fictional.
 */
export const bletchley: RoomDef = {
  id: 'bletchley',
  version: 1,
  title: 'פיצוח האניגמה — 1941',
  emoji: '📡',
  category: 'מלחמת העולם השנייה',
  length: '30–45 דקות',
  story: 'אנגליה, 1941. בצריף של מפצחי הצפנים נפל החשמל, ובאוקיינוס האטלנטי צוללות מתכוננות לתקוף שיירת ספינות. החזירו את החשמל, הריצו את מכונת הפענוח, פצחו את הגדרות האניגמה של היום — והזהירו את השיירה לפני עלות השחר.',
  history: 'בהשראת מפצחי הצפנים של בלצ׳לי פארק באנגליה, שפענחו את צופן האניגמה הגרמני במלחמת העולם השנייה ועזרו להגן על שיירות באוקיינוס האטלנטי. העלילה, הדמויות והחידות בחדר בדויות.',
  darkUntil: 'used:fusebox',
  scenes: [
    { id: 'hut', name: 'צריף המפענחים', theme: 'hut' },
    { id: 'bombe', name: 'חדר המכונה', theme: 'hut' },
    { id: 'archive', name: 'הארכיון', theme: 'hut' },
    { id: 'office', name: 'משרד המפקד', theme: 'hut' },
  ],
  items: [
    { id: 'intercept', name: 'הודעה מיורטת', icon: '📄', note: { title: 'הודעה מיורטת', text: 'שורות של אותיות בלי שום משמעות. אפשר לפענח אותן רק במכונת האניגמה, עם הגדרות הגלגלים של היום.', style: 'paper' } },
    { id: 'fuse', name: 'נתיך', icon: '🔌', note: { title: 'נתיך', text: 'נתיך חשמלי חדש.' } },
    { id: 'keybook', name: 'ספר המפתחות', icon: '📘', note: { title: 'ספר המפתחות', text: 'ספר מפתחות שנמצא על ספינה גרמנית שנתפסה. הגדרת שלושת הגלגלים לכל יום בחודש: 7 — שקר · 8 — גלי · 9 — דגם · 10 — ברק · 11 — טוב.', easy: 'ספר מפתחות שנמצא על ספינה גרמנית שנתפסה. הגדרת שלושת הגלגלים לכל יום בחודש: 7 — שקר · 8 — גלי · 9 — דגם · 10 — ברק · 11 — טוב. (בדקו בלוח השנה מה התאריך היום)', style: 'book' } },
    { id: 'decoded', name: 'ההודעה המפוענחת', icon: '📜', note: { title: 'ההודעה המפוענחת', text: '״הצוללות יתקפו את השיירה עם שחר — בשורה הרביעית, בטור השביעי.״', easy: '״הצוללות יתקפו את השיירה עם שחר — בשורה הרביעית, בטור השביעי.״ (במפת האוקיינוס כתוב איך הופכים את זה לקוד ריבוע)', style: 'paper' } },
    { id: 'stamp', name: 'חותמת ״סודי ביותר״', icon: '🔏', note: { title: 'חותמת', text: 'חותמת גומי אדומה: ״סודי ביותר״. בלעדיה אף אחד לא יקבל אזהרה רשמית.' } },
  ],
  hotspots: [
    // ── צריף המפענחים ──
    {
      id: 'teleprinter', scene: 'hut', name: 'הטלפרינטר', art: 'typewriter', x: 60, y: 330, w: 220, h: 140, activeWhen: ['took:intercept'],
      interactions: [
        { type: 'take', when: ['!took:intercept'], item: 'intercept', note: { title: 'הטלפרינטר', text: 'הטלפרינטר הדפיס הודעה גרמנית מיורטת — אותיות בלי משמעות.' } },
        { type: 'note', note: { title: 'הטלפרינטר', text: 'הטלפרינטר שקט.' } },
      ],
    },
    {
      id: 'calendar', scene: 'hut', name: 'לוח השנה', art: 'calendar', x: 330, y: 60, w: 140, h: 170,
      interactions: [{ type: 'note', note: { title: 'לוח השנה', text: 'ספטמבר 1941. היום מסומן: ה־9 בחודש.' } }],
    },
    {
      id: 'blackboard', scene: 'hut', name: 'הלוח השחור', art: 'whiteboard', variant: 'dark', x: 500, y: 50, w: 280, h: 190,
      interactions: [{ type: 'note', note: { title: 'הלוח השחור', text: '״כל פענוח מתחיל בהרצת מכונת הבומב: תופים 1, 3 ו־4 דולקים, כל השאר כבויים.״', hard: '״בומב: 1, 3, 4.״' } }],
    },
    {
      id: 'hutdesk', scene: 'hut', name: 'שולחן המפענח', art: 'drawer', x: 320, y: 380, w: 220, h: 90, activeWhen: ['solved:hutdesk'],
      interactions: [
        { type: 'lock', when: ['!solved:hutdesk'], title: 'שולחן המפענח', prompt: 'מנעול של 4 ספרות. חרוט על המגירה: ״השנה שבה הגענו לכאן״.', lock: { kind: 'digits', length: 4, answer: '1939' }, onSolve: { giveItems: ['fuse'], message: 'מגירת המפענח נפתחה — בפנים נתיך!' } },
        { type: 'note', note: { title: 'שולחן המפענח', text: 'במגירה רק עפרונות ודפי טיוטה.' } },
      ],
    },
    {
      id: 'poster', scene: 'hut', name: 'כרזת השתיקה', art: 'poster', x: 620, y: 300, w: 150, h: 200,
      interactions: [{ type: 'note', note: { title: 'כרזה', text: '״השיחה הבטוחה ביותר היא זו שלא מתקיימת.״ בפינה חותמת: ״סיווג: אולטרה — סודי ביותר״.', style: 'paper' } }],
    },
    // ── חדר המכונה ──
    {
      id: 'fusebox', scene: 'bombe', name: 'ארון החשמל', art: 'fusebox', x: 40, y: 70, w: 140, h: 180, activeWhen: ['used:fusebox'],
      interactions: [
        { type: 'needItem', when: ['!used:fusebox'], item: 'fuse', note: { title: 'ארון החשמל', text: 'החשמל בצריף נפל. בארון חסר נתיך אחד.' }, onUse: { removeItems: ['fuse'], message: 'החשמל חזר לצריף!' } },
        { type: 'note', note: { title: 'ארון החשמל', text: 'כל הנתיכים במקום.' } },
      ],
    },
    {
      id: 'bombe', scene: 'bombe', name: 'מכונת הבומב', art: 'machine', x: 220, y: 160, w: 360, h: 360, activeWhen: ['solved:bombe'],
      interactions: [
        { type: 'blocked', when: ['!used:fusebox'], note: { title: 'מכונת הבומב', text: 'מכונה ענקית עם עשרות תופים מסתובבים. היא שקטה — אין חשמל.' } },
        { type: 'lock', when: ['!solved:bombe'], title: 'מכונת הבומב', prompt: 'שישה תופים ראשיים, ממוספרים 1–6. מדליקים את הנכונים ומפעילים.', lock: { kind: 'switches', count: 6, answer: [true, false, true, true, false, false] }, onSolve: { message: 'הבומב רץ — התופים נעצרו על התשובה!' } },
        { type: 'note', note: { title: 'מכונת הבומב', text: 'התופים נעצרו. עכשיו אפשר לכוון את האניגמה.' } },
      ],
    },
    {
      id: 'enigma', scene: 'bombe', name: 'מכונת האניגמה', art: 'enigma', x: 600, y: 380, w: 180, h: 140, activeWhen: ['solved:enigma'],
      interactions: [
        { type: 'blocked', when: ['!solved:bombe'], note: { title: 'מכונת האניגמה', text: 'מכונת אניגמה שנלכדה. לפני שמכוונים אותה צריך להריץ את מכונת הבומב.' } },
        { type: 'blocked', when: ['!took:intercept'], note: { title: 'מכונת האניגמה', text: 'אין מה לפענח — צריך הודעה מיורטת.' } },
        { type: 'lock', when: ['!solved:enigma'], title: 'מכונת האניגמה', prompt: 'שלושה גלגלים — מכוונים כל גלגל לאות של היום.', lock: { kind: 'letters', length: 3, answer: 'דגם' }, onSolve: { giveItems: ['decoded'], message: 'האניגמה פוענחה — ההודעה גלויה!' } },
        { type: 'note', note: { title: 'מכונת האניגמה', text: 'הגלגלים מכוונים: ד־ג־ם.' } },
      ],
    },
    // ── הארכיון ──
    {
      id: 'filing', scene: 'archive', name: 'הוראות התיוק', art: 'manual', x: 60, y: 120, w: 240, h: 130,
      interactions: [{ type: 'note', note: { title: 'הוראות התיוק', text: '״תיקים חסויים נפתחים לפי הצבעים: כחול, אדום, ירוק, צהוב.״', style: 'book' } }],
    },
    {
      id: 'archcab', scene: 'archive', name: 'ארון החסויים', art: 'cabinet', x: 620, y: 80, w: 150, h: 330, activeWhen: ['solved:archcab'],
      interactions: [
        { type: 'lock', when: ['!solved:archcab'], title: 'ארון החסויים', prompt: 'מנעול של ארבעה צבעים.', lock: { kind: 'colors', options: ['blue', 'red', 'green', 'yellow'], answer: ['blue', 'red', 'green', 'yellow'] }, onSolve: { giveItems: ['keybook'], message: 'ארון החסויים נפתח — בפנים ספר המפתחות!' } },
        { type: 'note', note: { title: 'ארון החסויים', text: 'הארון ריק.' } },
      ],
    },
    {
      id: 'boxes', scene: 'archive', name: 'קופסאות הארכיון', art: 'crate', x: 300, y: 400, w: 220, h: 130,
      interactions: [{ type: 'note', note: { title: 'קופסאות הארכיון', text: 'תמלילי שידורים ישנים. על אחת הקופסאות: ״ספרי מפתחות — בארון החסויים בלבד״.' } }],
    },
    {
      id: 'globe', scene: 'archive', name: 'מפת העולם', art: 'map', variant: 'world', x: 330, y: 70, w: 240, h: 180,
      interactions: [{ type: 'note', note: { title: 'מפת העולם', text: 'סיכות אדומות מסמנות שיירות באוקיינוס. ליד אחת מהן כתוב: ״הלילה״.' } }],
    },
    // ── משרד המפקד ──
    {
      id: 'plaque', scene: 'office', name: 'השלט על הקיר', art: 'painting', variant: 'green', x: 300, y: 60, w: 200, h: 160,
      interactions: [{ type: 'note', note: { title: 'שלט', text: 'שלט מתכת: ״מפצחי הצפנים הגיעו לבלצ׳לי פארק בשנת 1939״.', style: 'plaque' } }],
    },
    {
      id: 'officedesk', scene: 'office', name: 'שולחן המפקד', art: 'drawer', x: 40, y: 380, w: 220, h: 90, activeWhen: ['solved:officedesk'],
      interactions: [
        { type: 'lock', when: ['!solved:officedesk'], title: 'שולחן המפקד', prompt: 'מנעול אותיות — 6 אותיות. חרוט: ״הסיווג שלנו״.', lock: { kind: 'letters', length: 6, answer: 'אולטרה' }, onSolve: { giveItems: ['stamp'], message: 'שולחן המפקד נפתח — בפנים חותמת ״סודי ביותר״!' } },
        { type: 'note', note: { title: 'שולחן המפקד', text: 'המגירה ריקה.' } },
      ],
    },
    {
      id: 'seamap', scene: 'office', name: 'מפת האוקיינוס', art: 'map', variant: 'sea', x: 520, y: 60, w: 260, h: 230,
      interactions: [{ type: 'note', note: { title: 'מפת האוקיינוס האטלנטי', text: 'המפה מחולקת לריבועים: שורות א–ה מלמעלה למטה, טורים 1–8 מימין לשמאל. קוד ריבוע נכתב באות ואחריה מספר — למשל ב3.' } }],
    },
    {
      id: 'phone', scene: 'office', name: 'הקו לאדמירליות', art: 'phone', x: 320, y: 400, w: 140, h: 120,
      interactions: [
        { type: 'blocked', when: ['!took:decoded'], note: { title: 'הקו לאדמירליות', text: 'הטלפון הישיר לאדמירליות. עדיין אין מה לדווח.' } },
        { type: 'blocked', when: ['!took:stamp'], note: { title: 'הקו לאדמירליות', text: '״אזהרה בלי אישור ׳סודי ביותר׳ לא תתקבל.״ החותמת בשולחן המפקד.' } },
        { type: 'lock', title: 'הקו לאדמירליות', prompt: 'מוסרים את קוד הריבוע של המתקפה.', lock: { kind: 'terminal', answers: ['ד7', 'ד 7', 'ד-7', '7ד'] }, onSolve: { message: 'האזהרה נמסרה — השיירה שינתה מסלול ברגע האחרון!', escape: true } },
      ],
    },
  ],
  hints: [
    { until: 'took:intercept', text: 'הטלפרינטר בצריף הדפיס הודעה — קחו אותה.' },
    { until: 'solved:hutdesk', text: 'השלט במשרד המפקד מגלה את השנה: 1939.' },
    { until: 'used:fusebox', after: ['took:fuse'], text: 'הנתיך שייך לארון החשמל בחדר המכונה.' },
    { until: 'solved:bombe', after: ['used:fusebox'], text: 'הלוח השחור בצריף: תופים 1, 3 ו־4 דולקים.' },
    { until: 'solved:archcab', text: 'הוראות התיוק בארכיון נותנות את סדר הצבעים.' },
    { until: 'solved:enigma', after: ['took:keybook', 'solved:bombe', 'took:intercept'], text: 'היום ה־9 בחודש — בספר המפתחות כתוב ״דגם״.' },
    { until: 'solved:officedesk', text: 'על הכרזה בצריף: הסיווג הוא ״אולטרה״.' },
    { until: 'escaped', after: ['took:decoded', 'took:stamp'], text: 'שורה 4 היא ד, וטור 7 — הקוד ד7.' },
  ],
  walkthrough: [
    { take: 'teleprinter' },
    { solve: 'hutdesk', input: '1939' },
    { use: 'fusebox', item: 'fuse' },
    { solve: 'bombe', input: '101100' },
    { solve: 'archcab', input: 'blue,red,green,yellow' },
    { solve: 'enigma', input: 'דגם' },
    { solve: 'officedesk', input: 'אולטרה' },
    { solve: 'phone', input: 'ד7' },
  ],
}
