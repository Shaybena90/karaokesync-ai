import type { RoomDef } from '../../types'

const SYM = [
  { id: 'dia', label: '◆' },
  { id: 'circ', label: '●' },
  { id: 'tri', label: '▲' },
  { id: 'sq', label: '■' },
]

/** "תחנת החלל השקטה" — a silent station, a helpful computer, and one instruction you must not follow. */
export const orbit: RoomDef = {
  id: 'orbit',
  version: 1,
  title: 'תחנת החלל השקטה',
  emoji: '🛰️',
  category: 'חדרי בריחה',
  length: '30–35 דקות',
  difficultyLabel: 'קשה',
  players: 1,
  blurb: 'הצוות נעלם. המחשב עדיין מדבר. לא כל מה שהוא אומר נכון.',
  story: 'התעוררתם בתא המגורים של תחנת ״אופק־7״. האורות כבויים, השקט מוחלט, ושאר הצוות איננו. רק מתא, מחשב התחנה, ממשיך לתת הוראות — אחת מהן מסוכנת.',
  goal: 'להחזיר חשמל ואוויר, לזהות את ההוראה השגויה של מתא ולהוכיח אותה, ליצור קשר עם כדור הארץ ולשגר את תא המילוט.',
  darkUntil: 'solved:power',
  illustration: { art: 'pod', theme: 'station' },
  scenes: [
    { id: 'quarters', name: 'תא המגורים', theme: 'station' },
    { id: 'control', name: 'חדר הבקרה', theme: 'station', visibleWhen: ['solved:hatch'] },
    { id: 'life', name: 'מערכות חיים', theme: 'station', visibleWhen: ['solved:hatch'] },
    { id: 'pod', name: 'תא המילוט', theme: 'station', visibleWhen: ['solved:comms'] },
  ],
  items: [
    { id: 'half1', name: 'חצי תג (עליון)', icon: '🪪', note: { title: 'חצי תג', text: 'החצי העליון של תג גישה שבור. בגבו: ◆1 · ●2.' } },
    { id: 'half2', name: 'חצי תג (תחתון)', icon: '🪪', note: { title: 'חצי תג', text: 'החצי התחתון של תג גישה. בגבו: ▲3 · ■4.' } },
    { id: 'badge', name: 'תג גישה', icon: '🪪', note: { title: 'תג גישה', zoom: true, text: 'תג של מפקדת התחנה. בגב התג ארבעה סמלים, כל אחד עם מספר קטן: ■4 · ◆1 · ▲3 · ●2.' } },
  ],
  combos: [{ a: 'half1', b: 'half2', result: 'badge', message: 'חיברתם את שני החצאים — תג גישה שלם!' }],
  notebookEntries: [
    { id: 'manual', text: 'מעגלים: 1 מחשב · 2 ניתוק בידוד (סכנה) · 3 מטבח · 4 תאורה · 5 מערכות חיים · 6 מעבדה. בחירום: מחשב, תאורה ומערכות חיים בלבד.' },
    { id: 'badge', text: 'בגב התג: ■4 · ◆1 · ▲3 · ●2.' },
    { id: 'mata', text: 'הוראות מתא: א. לתקן את האוויר · ב. לנתק את מגן הקרינה · ג. לכוון את האנטנה לגזרה 7 · ד. להכין את תא המילוט.' },
    { id: 'gauges1', text: 'מדי האוויר: חמצן 16% (נמוך) · CO₂ 3% (גבוה) · לחץ תקין.' },
    { id: 'lifemanual', text: 'מדריך מערכות החיים: חמצן נמוך → שסתום A · CO₂ גבוה → מסנן B · לחות גבוהה → מסנן A · לחץ נמוך → שסתום B.' },
    { id: 'gauges2', text: 'אחרי התיקון: חמצן 21% · CO₂ 0.4% · לחץ תקין.' },
    { id: 'crewlog', text: 'יומן הצוות: ״לעולם לא לנתק את מגן הקרינה בזמן סערה סולארית.״' },
    { id: 'radiation', text: 'חיישן הקרינה: ״סערה סולארית פעילה.״' },
    { id: 'wrongorder', text: 'ההוראה השגויה של מתא: לנתק את מגן הקרינה.' },
    { id: 'freq', text: 'כרטיס הבית: תדר הקשר לכדור הארץ — 412.' },
    { id: 'sector', text: 'מפת המסלול: תחנת הקרקע נמצאת בגזרה 7.' },
    { id: 'podmanual', text: 'מדריך תא המילוט: סוגרים דלת ← מאזנים לחץ ← מתנתקים מהתחנה ← הצתה.' },
  ],
  hotspots: [
    // ── תא המגורים ──
    { id: 'manual', scene: 'quarters', name: 'מדריך החירום', art: 'manual', x: 60, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'מדריך החירום', style: 'book', notebook: 'manual', text: 'מעגל 1 — מחשב התחנה\nמעגל 2 — ניתוק בידוד (סכנה!)\nמעגל 3 — מטבח\nמעגל 4 — תאורה\nמעגל 5 — מערכות חיים\nמעגל 6 — מעבדה\n\n״בחירום מפעילים רק: מחשב, תאורה ומערכות חיים.״' } }] },
    {
      id: 'power', scene: 'quarters', name: 'לוח החשמל', art: 'switches', x: 280, y: 100, w: 260, h: 160, activeWhen: ['solved:power'],
      interactions: [
        { type: 'lock', when: ['!solved:power'], title: 'לוח החשמל', prompt: 'שישה מעגלים, 1–6.', lock: { kind: 'switches', count: 6, answer: [true, false, false, true, true, false] }, onSolve: { message: 'האורות נדלקים. מתא מתעורר.' } },
        { type: 'note', note: { title: 'לוח החשמל', text: 'מעגלים 1, 4 ו־5 דולקים.' } },
      ],
    },
    {
      id: 'bunk', scene: 'quarters', name: 'דרגש המפקדת', art: 'bed', x: 560, y: 330, w: 210, h: 160, visibleWhen: ['solved:power'], activeWhen: ['took:badge'],
      interactions: [
        { type: 'take', when: ['!took:half1'], item: 'half1', note: { title: 'דרגש המפקדת', text: 'מתחת לכרית — חצי של תג גישה. הוא נשבר.' } },
        { type: 'note', note: { title: 'דרגש המפקדת', text: 'הדרגש מסודר. אף אחד לא ישן בו הלילה.' } },
      ],
    },
    {
      id: 'toolbox', scene: 'quarters', name: 'ארגז כלים', art: 'crate', x: 40, y: 220, w: 150, h: 120, visibleWhen: ['solved:power'], activeWhen: ['took:half2'],
      interactions: [
        { type: 'take', when: ['!took:half2'], item: 'half2', note: { title: 'ארגז כלים', text: 'בין המברגים — החצי השני של תג הגישה.' } },
        { type: 'note', note: { title: 'ארגז כלים', text: 'מברגים, סרט בידוד ומפתח שוודי.' } },
      ],
    },
    { id: 'homecard', scene: 'quarters', name: 'כרטיס מהבית', art: 'photo', x: 600, y: 90, w: 140, h: 120, interactions: [{ type: 'note', note: { title: 'כרטיס מהבית', notebook: 'freq', text: '״אמא, כשתרצי לדבר — התדר שלנו הוא 412. אוהבת, נועה.״' } }] },
    {
      id: 'hatch', scene: 'quarters', name: 'פתח לחדר הבקרה', art: 'hatch', x: 300, y: 300, w: 200, h: 200, activeWhen: ['solved:hatch'],
      interactions: [
        { type: 'blocked', when: ['!solved:power'], note: { title: 'פתח לחדר הבקרה', text: 'אין חשמל. הפתח לא זז.' } },
        { type: 'blocked', when: ['!took:badge'], note: { title: 'פתח לחדר הבקרה', style: 'screen', text: '״סורק תגים: הציגו תג גישה.״' } },
        { type: 'lock', when: ['!solved:hatch'], title: 'פתח לחדר הבקרה', prompt: 'התג זוהה. הקישו את ארבעת הסמלים בסדר הנכון.', lock: { kind: 'sequence', options: SYM, answer: ['dia', 'circ', 'tri', 'sq'] }, onSolve: { message: 'הפתח נפתח — חדר הבקרה ומערכות החיים פתוחים.', notebook: ['badge'] } },
        { type: 'note', note: { title: 'פתח לחדר הבקרה', text: 'הפתח פתוח.' } },
      ],
    },
    // ── מערכות חיים ──
    {
      id: 'gauges', scene: 'life', name: 'מדי האוויר', art: 'gauges', x: 60, y: 90, w: 220, h: 170,
      interactions: [
        { type: 'note', when: ['solved:air'], note: { title: 'מדי האוויר', style: 'screen', notebook: 'gauges2', text: 'חמצן 21% · CO₂ 0.4% · לחץ תקין. ✔' } },
        { type: 'note', note: { title: 'מדי האוויר', style: 'screen', notebook: 'gauges1', text: 'חמצן 16% ▼ נמוך\nCO₂ 3% ▲ גבוה\nלחץ — תקין\nלחות — תקינה' } },
      ],
    },
    { id: 'lifemanual', scene: 'life', name: 'מדריך מערכות החיים', art: 'manual', x: 60, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'מדריך מערכות החיים', style: 'book', notebook: 'lifemanual', text: 'חמצן נמוך → לפתוח שסתום A\nCO₂ גבוה → להפעיל מסנן B\nלחות גבוהה → להפעיל מסנן A\nלחץ נמוך → לפתוח שסתום B\n״לא מפעילים מה שלא צריך.״' } }] },
    {
      id: 'air', scene: 'life', name: 'לוח האוויר', art: 'tanks', x: 330, y: 120, w: 260, h: 300, activeWhen: ['solved:air'],
      interactions: [
        { type: 'lock', when: ['!solved:air'], title: 'לוח האוויר', prompt: 'בחרו מה להפעיל.', lock: { kind: 'multi', options: [{ id: 'valveA', label: 'שסתום A' }, { id: 'valveB', label: 'שסתום B' }, { id: 'filterA', label: 'מסנן A' }, { id: 'filterB', label: 'מסנן B' }, { id: 'fan', label: 'מאוורר עזר' }], answer: ['valveA', 'filterB'] }, onSolve: { message: 'האוויר חוזר לתקן. המדים משתנים.' } },
        { type: 'note', note: { title: 'לוח האוויר', text: 'שסתום A ומסנן B פועלים.' } },
      ],
    },
    { id: 'radsensor', scene: 'life', name: 'חיישן הקרינה', art: 'gauges', variant: 'radiation', x: 620, y: 90, w: 150, h: 160, interactions: [{ type: 'note', note: { title: 'חיישן הקרינה', style: 'screen', notebook: 'radiation', text: '☢ ״סערה סולארית פעילה. רמת קרינה חיצונית: גבוהה מאוד.״' } }] },
    // ── חדר הבקרה ──
    {
      id: 'mata', scene: 'control', name: 'מתא — מחשב התחנה', art: 'terminal', x: 250, y: 90, w: 300, h: 220, activeWhen: ['solved:mata'],
      interactions: [
        { type: 'note', when: ['solved:mata'], note: { title: 'מתא', style: 'screen', text: '״...שגיאה בהוראה ב׳ אושרה. מגן הקרינה נשאר מחובר. ערוץ התקשורת פתוח.״', voice: { effect: 'computer', pitch: 0.6, lines: ['שגיאה בהוראה ב׳ אושרה.', 'מגן הקרינה נשאר מחובר.', 'ערוץ התקשורת פתוח.'] } } },
        { type: 'lock', when: ['solved:air'], title: 'מתא — דיווח על הוראה שגויה', prompt: 'איזו הוראה של מתא שגויה? בחרו אותה וצרפו את הראיות שמוכיחות זאת.', lock: { kind: 'accuse', suspects: [{ id: 'air', label: 'א. לתקן את האוויר' }, { id: 'shield', label: 'ב. לנתק את מגן הקרינה' }, { id: 'antenna', label: 'ג. לכוון את האנטנה לגזרה 7' }, { id: 'pod', label: 'ד. להכין את תא המילוט' }], evidence: [{ id: 'crewlog', label: 'יומן הצוות', icon: '📓' }, { id: 'radsensor', label: 'חיישן הקרינה', icon: '☢' }, { id: 'gauges', label: 'מדי האוויר', icon: '🎛️' }, { id: 'starmap', label: 'מפת המסלול', icon: '🗺️' }], answer: 'shield', required: ['crewlog', 'radsensor'] }, onSolve: { message: 'מתא מאשר את השגיאה. מגן הקרינה נשאר מחובר.', notebook: ['wrongorder'] } },
        { type: 'note', note: { title: 'מתא', style: 'screen', notebook: 'mata', text: '״אני מתא. כדי להציל את התחנה:\nא. תקנו את האוויר.\nב. נתקו את מגן הקרינה.\nג. כוונו את האנטנה לגזרה 7.\nד. הכינו את תא המילוט.״', voice: { effect: 'computer', pitch: 0.6, lines: ['אני מתא.', 'כדי להציל את התחנה:', 'א. תקנו את האוויר.', 'ב. נתקו את מגן הקרינה.', 'ג. כוונו את האנטנה לגזרה שבע.', 'ד. הכינו את תא המילוט.'] } } },
      ],
    },
    { id: 'crewlog', scene: 'control', name: 'יומן הצוות', art: 'book', x: 60, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'יומן הצוות', style: 'book', notebook: 'crewlog', text: '״יום 212. ההנחיה הכי חשובה בתחנה: לעולם לא מנתקים את מגן הקרינה בזמן סערה סולארית. מתא מתנהג מוזר מאז העדכון.״' } }] },
    { id: 'starmap', scene: 'control', name: 'מפת המסלול', art: 'starmap', x: 590, y: 80, w: 180, h: 180, interactions: [{ type: 'note', note: { title: 'מפת המסלול', zoom: true, notebook: 'sector', text: 'המסלול מחולק לשמונה גזרות. תחנת הקרקע מסומנת בגזרה 7.' } }] },
    {
      id: 'comms', scene: 'control', name: 'מערכת הקשר', art: 'radio', x: 300, y: 360, w: 220, h: 150, activeWhen: ['solved:comms'],
      interactions: [
        { type: 'blocked', when: ['!solved:mata'], note: { title: 'מערכת הקשר', style: 'screen', text: '״הערוץ נעול על ידי מתא.״' } },
        { type: 'lock', when: ['!solved:comms'], title: 'מערכת הקשר', prompt: 'תדר (3 ספרות) ואחריו גזרת האנטנה (ספרה אחת).', lock: { kind: 'digits', length: 4, answer: '4127' }, onSolve: { message: 'קול מכדור הארץ: ״אופק־7, שומעים אתכם. השיגור מאושר — פעלו לפי מדריך התא.״' } },
        { type: 'note', note: { title: 'מערכת הקשר', style: 'screen', text: '״הקשר עם תחנת הקרקע פעיל.״', voice: { effect: 'radio', lines: ['אופק שבע, שומעים אתכם.', 'השיגור מאושר. פעלו לפי מדריך התא.'] } } },
      ],
    },
    // ── תא המילוט ──
    { id: 'podmanual', scene: 'pod', name: 'מדריך התא', art: 'manual', x: 60, y: 380, w: 180, h: 110, interactions: [{ type: 'note', note: { title: 'מדריך התא', style: 'book', notebook: 'podmanual', text: '1. סוגרים את הדלת\n2. מאזנים לחץ\n3. מתנתקים מהתחנה\n4. הצתה\n״חגורות נחגרות אוטומטית. האנטנה מתקפלת לבד.״' } }] },
    {
      id: 'launch', scene: 'pod', name: 'לוח השיגור', art: 'console', x: 280, y: 200, w: 280, h: 200,
      interactions: [
        { type: 'lock', title: 'לוח השיגור', prompt: 'בצעו את רצף השיגור.', lock: { kind: 'sequence', options: [{ id: 'detach', label: 'ניתוק' }, { id: 'ignite', label: 'הצתה' }, { id: 'antenna', label: 'קיפול אנטנה' }, { id: 'door', label: 'סגירת דלת' }, { id: 'pressure', label: 'איזון לחץ' }], answer: ['door', 'pressure', 'detach', 'ignite'] }, onSolve: { message: 'תא המילוט ניתק מהתחנה וצולל בבטחה לעבר כדור הארץ. יצאתם!', escape: true } },
      ],
    },
  ],
  hints: [],
  puzzles: [
    { id: 'orbit-1', name: 'חשמל חירום', sees: 'תא מגורים חשוך, לוח של שישה מעגלים ומדריך.', doneWhen: 'solved:power', solution: 'מעגלים 1, 4, 5', explanation: 'המדריך: בחירום מפעילים רק מחשב (1), תאורה (4) ומערכות חיים (5). מעגל 2 מסוכן.', hints: ['המדריך ליד הדרגש.', 'בחירום — רק שלושה מעגלים.', '1, 4, 5.'], after: 'האור חוזר, מתא מתעורר, ודרגש המפקדת נגלה.', wrong: 'הלוח מזמזם וכבה (נספר).' },
    { id: 'orbit-2', name: 'תג המפקדת', sees: 'פתח עם סורק תגים, ושני חצאים של תג שבור.', availableWhen: ['solved:power'], doneWhen: 'solved:hatch', solution: '◆ ● ▲ ■', explanation: 'חצי תג בדרגש וחצי בארגז הכלים; משלבים אותם בתיק. בגב התג: ◆1, ●2, ▲3, ■4 — מסדרים לפי המספרים.', hints: ['התג שבור — חפשו את שני החלקים.', 'חצי בדרגש, חצי בארגז הכלים. שלבו אותם בתיק, ואז קראו את הגב.', '◆ ● ▲ ■.'], after: 'נפתחים חדר הבקרה ומערכות החיים.', wrong: '״רצף שגוי״ (נספר).' },
    { id: 'orbit-3', name: 'אוויר לנשימה', sees: 'מדי אוויר, מדריך ולוח עם שסתומים ומסננים.', availableWhen: ['solved:hatch'], doneWhen: 'solved:air', solution: 'שסתום A + מסנן B', explanation: 'חמצן נמוך → שסתום A. CO₂ גבוה → מסנן B. הלחץ והלחות תקינים, אז לא מפעילים דבר נוסף.', hints: ['מה המדים מראים?', 'לכל בעיה יש תיקון במדריך — ורק לה.', 'שסתום A ומסנן B.'], after: 'המדים חוזרים לתקן, ומתא מוכן לדיווח.', wrong: '״הרכב האוויר לא תקין״ (נספר).' },
    { id: 'orbit-4', name: 'ההוראה השגויה', sees: 'מתא נותן ארבע הוראות.', availableWhen: ['solved:air'], doneWhen: 'solved:mata', solution: 'ב׳ — לנתק את מגן הקרינה; ראיות: יומן הצוות + חיישן הקרינה', explanation: 'היומן אוסר לנתק את המגן בזמן סערה, והחיישן מראה שיש סערה פעילה. שתי הראיות יחד מוכיחות שההוראה מסוכנת.', hints: ['איזו הוראה עלולה לסכן אתכם?', 'חפשו כלל שמדבר על המגן, ומידע על מצב הקרינה עכשיו.', 'הוראה ב׳ + יומן הצוות + חיישן הקרינה.'], after: 'ערוץ התקשורת נפתח.', wrong: 'מתא מסביר מה חסר בדיווח (נספר).' },
    { id: 'orbit-5', name: 'קשר לכדור הארץ', sees: 'מערכת קשר שמבקשת תדר וגזרה.', availableWhen: ['solved:mata'], doneWhen: 'solved:comms', solution: '4127', explanation: 'התדר מכרטיס הבית: 412. הגזרה ממפת המסלול: 7.', hints: ['תדר — במשהו אישי בתא המגורים.', 'גזרה — במפת המסלול.', '412 ואז 7.'], after: 'כדור הארץ מאשר שיגור; תא המילוט נפתח.', wrong: '״אין קליטה״ (נספר).' },
    { id: 'orbit-6', name: 'שיגור', sees: 'לוח שיגור עם חמש פעולות.', availableWhen: ['solved:comms'], doneWhen: 'escaped', solution: 'סגירת דלת ← איזון לחץ ← ניתוק ← הצתה', explanation: 'לפי מדריך התא. האנטנה מתקפלת לבד, לכן לא כוללים אותה.', hints: ['מדריך התא.', 'יש פעולה אחת שלא צריך.', 'דלת, לחץ, ניתוק, הצתה.'], after: 'התא חוזר הביתה. סוף החדר.', wrong: '״רצף שגוי — השיגור בוטל״ (נספר).' },
  ],
  walkthrough: [
    { read: 'manual' },
    { solve: 'power', input: '100110' },
    { take: 'bunk' },
    { take: 'toolbox' },
    { combine: ['half1', 'half2'] },
    { solve: 'hatch', input: 'dia,circ,tri,sq' },
    { read: 'gauges' },
    { read: 'lifemanual' },
    { solve: 'air', input: 'valveA,filterB' },
    { read: 'crewlog' },
    { read: 'radsensor' },
    { solve: 'mata', input: 'shield|crewlog,radsensor' },
    { read: 'homecard' },
    { read: 'starmap' },
    { solve: 'comms', input: '4127' },
    { read: 'podmanual' },
    { solve: 'launch', input: 'door,pressure,detach,ignite' },
  ],
}
