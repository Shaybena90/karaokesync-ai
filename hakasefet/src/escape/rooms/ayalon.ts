import type { RoomDef } from '../types'

/**
 * Inspired by the Ayalon Institute (Rehovot, 1945–1948): a Haganah ammunition
 * factory hidden under a kibbutz laundry and bakery. Plot and puzzles are fictional.
 */
export const ayalon: RoomDef = {
  id: 'ayalon',
  version: 1,
  title: 'המפעל הסודי — 1946',
  emoji: '🏭',
  category: 'מחתרות',
  length: '30–45 דקות',
  story: 'רחובות, 1946. מתחת למכבסה של קיבוץ קטן פועל בסוד מפעל תחמושת של ההגנה. נורת האזהרה מהבהבת: ביקורת בריטית בדרך. הסתירו את המכונה, חלצו את מסמכי המפעל וצאו דרך הפתח שמתחת למכונת הכביסה — לפני שיגיעו.',
  history: 'בהשראת ״מכון איילון״ ברחובות — מפעל תחמושת מחתרתי של ההגנה, שפעל בשנים 1945–1948 מתחת למכבסה ולמאפייה של קיבוץ, בלי שהבריטים גילו אותו. העלילה, הדמויות והחידות בחדר בדויות.',
  scenes: [
    { id: 'hall', name: 'אולם הייצור', theme: 'bunker' },
    { id: 'rest', name: 'חדר המנוחה', theme: 'bunker' },
    { id: 'office', name: 'משרד המפעל', theme: 'bunker' },
    { id: 'shaft', name: 'פיר היציאה', theme: 'bunker' },
  ],
  items: [
    { id: 'tarp', name: 'ברזנט', icon: '🟫', note: { title: 'יריעת ברזנט', text: 'יריעת ברזנט גדולה וכבדה. מספיקה כדי לכסות מכונה שלמה.' } },
    { id: 'prodlog', name: 'יומן הייצור', icon: '📒', note: { title: 'יומן הייצור', text: 'ייצור השבוע: יום א׳ — 300 כדורים · יום ב׳ — 450 · יום ג׳ — 600. בכל יום מייצרים 150 כדורים יותר מהיום הקודם.', easy: 'ייצור השבוע: יום א׳ — 300 כדורים · יום ב׳ — 450 · יום ג׳ — 600. בכל יום מייצרים 150 כדורים יותר מהיום הקודם. (בדקו בלוח השנה איזה יום היום.)', hard: 'יום א׳ — 300 · יום ב׳ — 450 · יום ג׳ — 600 · …', style: 'book' } },
    { id: 'bulb', name: 'נורה', icon: '💡', note: { title: 'נורה רזרבית', text: 'נורה חזקה במיוחד, עטופה בנייר.' } },
    { id: 'telegram', name: 'מברק מוצפן', icon: '📨', note: { title: 'מברק מהמפקדה', text: '״הסיסמה לכספת המשרד: נ י ס״. המברק מוצפן — כמו כל המברקים שלנו.', easy: '״הסיסמה לכספת המשרד: נ י ס״. המברק מוצפן בגלגל הצופן — כדי לפענח מזיזים כל אות אחורה בא״ב.', hard: '״נ י ס״', style: 'paper' } },
    { id: 'wrench', name: 'מפתח ברגים', icon: '🔧', note: { title: 'מפתח ברגים', text: 'מפתח ברגים כבד ומתכוונן.' } },
    { id: 'key', name: 'מפתח קטן', icon: '🗝️', note: { title: 'מפתח קטן', text: 'מפתח פליז קטן. על התווית: ״משרד״.' } },
    { id: 'cipher', name: 'גלגל צופן', icon: '⚙️', note: { title: 'גלגל צופן', text: 'שני גלגלי קרטון עם האלף־בית. כל אות במברק הוזזה שתי אותיות קדימה (א←ג, ב←ד, ג←ה…). כדי לפענח — מזיזים כל אות שתי אותיות אחורה.', hard: 'שני גלגלי קרטון עם האלף־בית. בגלגל החיצוני: א מול ג, ב מול ד, ג מול ה…' } },
    { id: 'documents', name: 'מסמכי המפעל', icon: '📁', note: { title: 'תיק מסמכי המפעל', text: 'על הכריכה בכתב יד: ״קוד הפתח למעלה: מספר הכדורים שמייצרים היום, ואחריו מספר הנורות על מכונת הייצור.״', hard: '״קוד הפתח: הכדורים של היום — ואז הנורות של המכונה.״', style: 'paper' } },
  ],
  hotspots: [
    // ── אולם הייצור ──
    {
      id: 'machine', scene: 'hall', name: 'מכונת הייצור', art: 'machine', x: 60, y: 200, w: 320, h: 320, activeWhen: ['used:machine'],
      interactions: [
        { type: 'needItem', when: ['!used:machine'], item: 'tarp', note: { title: 'מכונת הייצור', text: 'מכונה כבדה לייצור כדורים. על לוח הבקרה שלוש נורות קטנות, ומתחתן חרוטים חיצים: למעלה, למעלה, ימינה, למטה — ״סדר הפתיחה של שולחן העבודה״. אם הבריטים יראו אותה — המפעל נגמר. צריך לכסות אותה.', easy: 'מכונה כבדה לייצור כדורים. על לוח הבקרה שלוש נורות קטנות, ומתחתן חרוטים חיצים: למעלה, למעלה, ימינה, למטה — ״סדר הפתיחה של שולחן העבודה״. צריך לכסות אותה במשהו גדול לפני שהבריטים יגיעו.', hard: 'מכונה כבדה. על הלוח שלוש נורות ומתחתן חיצים: למעלה, למעלה, ימינה, למטה.' }, onUse: { removeItems: ['tarp'], message: 'מכונת הייצור כוסתה בברזנט!' } },
        { type: 'note', note: { title: 'מכונת הייצור', text: 'המכונה מכוסה בברזנט. רק שלוש הנורות של הלוח מבצבצות. החיצים מתחתן: למעלה, למעלה, ימינה, למטה.' } },
      ],
    },
    {
      id: 'workbench', scene: 'hall', name: 'שולחן העבודה', art: 'drawer', x: 430, y: 330, w: 200, h: 90, activeWhen: ['solved:workbench'],
      interactions: [
        { type: 'lock', when: ['!solved:workbench'], title: 'מגירת שולחן העבודה', prompt: 'מנעול חיצים. ארבעה צעדים.', lock: { kind: 'arrows', answer: ['up', 'up', 'right', 'down'] }, onSolve: { giveItems: ['wrench'], message: 'מגירת שולחן העבודה נפתחה — בפנים מפתח ברגים!' } },
        { type: 'note', note: { title: 'שולחן העבודה', text: 'המגירה ריקה. על השולחן נשארו תרמילים ריקים של כדורים.' } },
      ],
    },
    {
      id: 'signal', scene: 'hall', name: 'נורת האזהרה', art: 'lamp', variant: 'signal', x: 660, y: 60, w: 100, h: 170, activeWhen: ['solved:alarm'],
      interactions: [
        { type: 'note', when: ['!solved:alarm'], note: { title: 'נורת האזהרה', text: 'הנורה מהבהבת באדום: ביקורת בדרך! כל עוד היא אדומה — אסור לעלות למעלה. המתגים שמשנים אותה נמצאים בפיר.' } },
        { type: 'note', note: { title: 'נורת האזהרה', text: 'הנורה ירוקה. אפשר לעלות.' } },
      ],
    },
    {
      id: 'boxes', scene: 'hall', name: 'ארגזי הכדורים', art: 'crate', x: 640, y: 400, w: 140, h: 120,
      interactions: [{ type: 'note', note: { title: 'ארגזי הכדורים', text: 'ארגזים מלאים בכדורים מוכנים. על כל ארגז תווית מוסווית: ״ירקות — לשוק״.' } }],
    },
    {
      id: 'hallposter', scene: 'hall', name: 'כרזת שתיקה', art: 'poster', x: 430, y: 60, w: 180, h: 200,
      interactions: [{ type: 'note', note: { title: 'כרזה', text: '״שתיקה — ביטחון!״. מתחת, בעיפרון: ״הנורה הרזרבית — בארגז הציוד שבפיר.״', style: 'paper' } }],
    },
    // ── חדר המנוחה ──
    {
      id: 'board', scene: 'rest', name: 'לוח התורנויות', art: 'whiteboard', x: 40, y: 60, w: 300, h: 190,
      interactions: [{ type: 'note', note: { title: 'לוח התורנויות', text: 'שמירה בכניסה: א׳ — שולה · ב׳ — דוד · ג׳ — מרים · ד׳ — עמוס · ה׳ — רחל · ו׳ — יוסף.' } }],
    },
    {
      id: 'calendar', scene: 'rest', name: 'לוח השנה', art: 'calendar', x: 380, y: 70, w: 140, h: 170,
      interactions: [{ type: 'note', note: { title: 'לוח השנה', text: 'יוני 1946. יום רביעי מוקף בעיגול אדום — זה היום.', hard: 'יוני 1946. אחד הימים מוקף בעיגול אדום: יום ד׳.' } }],
    },
    {
      id: 'rlocker', scene: 'rest', name: 'ארונית העובדים', art: 'locker', x: 600, y: 150, w: 140, h: 300, activeWhen: ['solved:rlocker'],
      interactions: [
        { type: 'lock', when: ['!solved:rlocker'], title: 'ארונית העובדים', prompt: 'מנעול אותיות, 4 אותיות. מדבקה: ״הסיסמה — שם השומר של היום״.', lock: { kind: 'letters', length: 4, answer: 'עמוס' }, onSolve: { giveItems: ['tarp'], message: 'ארונית העובדים נפתחה — בפנים יריעת ברזנט!' } },
        { type: 'note', note: { title: 'ארונית העובדים', text: 'בארונית נשארו רק סרבלים מקופלים.' } },
      ],
    },
    {
      id: 'sunlamp', scene: 'rest', name: 'מנורת השיזוף', art: 'lamp', x: 390, y: 280, w: 120, h: 260, activeWhen: ['used:sunlamp'],
      interactions: [
        { type: 'needItem', when: ['!used:sunlamp'], item: 'bulb', note: { title: 'מנורת השיזוף', text: 'מנורה גבוהה עם נורה חזקה. העובדים ישבו תחתיה כדי להישאר שזופים, שהבריטים לא יחשדו שהם עובדים מתחת לאדמה. הנורה שרופה.' }, onUse: { removeItems: ['bulb'], message: 'מנורת השיזוף נדלקה!' } },
        { type: 'note', note: { title: 'מנורת השיזוף', text: 'המנורה דולקת ומאירה חזק את הקיר שמולה.' } },
      ],
    },
    {
      id: 'oldposter', scene: 'rest', name: 'כרזה דהויה', art: 'poster', x: 40, y: 300, w: 180, h: 200, activeWhen: ['used:sunlamp'],
      interactions: [
        { type: 'note', when: ['!used:sunlamp'], note: { title: 'כרזה דהויה', text: 'כרזה ישנה של פרדסים. בפינה שרבוט דק שכמעט אי אפשר לראות באור הזה.' } },
        { type: 'note', note: { title: 'כרזה דהויה', text: 'באור החזק של המנורה רואים ספרות בעיפרון דק: ״רדיו — 385״.', hard: 'באור החזק מופיעות ספרות בעיפרון דק: 385.', style: 'paper' } },
      ],
    },
    {
      id: 'radio', scene: 'rest', name: 'הרדיו', art: 'radio', x: 230, y: 420, w: 140, h: 110, activeWhen: ['solved:radio'],
      interactions: [
        { type: 'lock', when: ['!solved:radio'], title: 'הרדיו', prompt: 'מכוונים את חוגת התדר — 3 ספרות.', lock: { kind: 'digits', length: 3, answer: '385' }, onSolve: { giveItems: ['telegram'], message: 'הרדיו קלט מברק מוצפן מהמפקדה!' } },
        { type: 'note', note: { title: 'הרדיו', text: 'הרדיו מרשרש בשקט על תדר 385.' } },
      ],
    },
    // ── משרד המפעל ──
    {
      id: 'typewriter', scene: 'office', name: 'מכונת הכתיבה', art: 'typewriter', x: 60, y: 330, w: 200, h: 140,
      interactions: [{ type: 'note', note: { title: 'מכונת הכתיבה', text: 'בגליל — דף שלא נשלח: ״התיקים בארון מסודרים לפי צבעים: אדום, צהוב, כחול, ירוק.״', easy: 'בגליל — דף שלא נשלח: ״ארון התיקים נפתח בצבעים לפי הסדר: אדום, צהוב, כחול, ירוק.״', hard: 'בגליל — שורה אחת: ״אדום, צהוב, כחול, ירוק.״', style: 'paper' } }],
    },
    {
      id: 'cabinet', scene: 'office', name: 'ארון התיקים', art: 'cabinet', x: 620, y: 90, w: 150, h: 330, activeWhen: ['solved:cabinet'],
      interactions: [
        { type: 'lock', when: ['!solved:cabinet'], title: 'ארון התיקים', prompt: 'מנעול של ארבעה צבעים.', lock: { kind: 'colors', options: ['red', 'yellow', 'blue', 'green'], answer: ['red', 'yellow', 'blue', 'green'] }, onSolve: { giveItems: ['prodlog'], message: 'ארון התיקים נפתח — בפנים יומן הייצור!' } },
        { type: 'note', note: { title: 'ארון התיקים', text: 'תיקי הנהלת חשבונות של ״מכבסה״. שום דבר מעניין.' } },
      ],
    },
    {
      id: 'desk', scene: 'office', name: 'שולחן המשרד', art: 'drawer', x: 300, y: 380, w: 220, h: 90, activeWhen: ['used:desk'],
      interactions: [
        { type: 'needItem', when: ['!used:desk'], item: 'key', note: { title: 'שולחן המשרד', text: 'מגירה נעולה במנעול קטן.' }, onUse: { removeItems: ['key'], giveItems: ['cipher'], message: 'מגירת המשרד נפתחה — בפנים גלגל צופן!' } },
        { type: 'note', note: { title: 'שולחן המשרד', text: 'המגירה ריקה.' } },
      ],
    },
    {
      id: 'safe', scene: 'office', name: 'כספת המשרד', art: 'safe', x: 330, y: 90, w: 190, h: 200, activeWhen: ['solved:safe'],
      interactions: [
        { type: 'lock', when: ['!solved:safe'], title: 'כספת המשרד', prompt: 'מנעול אותיות — 3 אותיות.', lock: { kind: 'letters', length: 3, answer: 'לחם' }, onSolve: { giveItems: ['documents'], message: 'כספת המשרד נפתחה — מסמכי המפעל אצלכם!' } },
        { type: 'note', note: { title: 'כספת המשרד', text: 'הכספת ריקה.' } },
      ],
    },
    {
      id: 'phone', scene: 'office', name: 'הטלפון', art: 'phone', x: 80, y: 150, w: 120, h: 110,
      interactions: [{ type: 'note', note: { title: 'הטלפון', text: 'טלפון שחור. הקו מת — מישהו ניתק אותו מבחוץ. עכשיו אפשר לסמוך רק על הרדיו.' } }],
    },
    // ── פיר היציאה ──
    {
      id: 'crate', scene: 'shaft', name: 'ארגז הציוד', art: 'crate', x: 50, y: 400, w: 200, h: 140, activeWhen: ['solved:crate'],
      interactions: [
        { type: 'lock', when: ['!solved:crate'], title: 'ארגז הציוד', prompt: 'מנעול של 3 ספרות. על המכסה: ״קוד: מספר הכדורים שמייצרים היום״.', lock: { kind: 'digits', length: 3, answer: '750' }, onSolve: { giveItems: ['bulb'], message: 'ארגז הציוד נפתח — בפנים נורה רזרבית!' } },
        { type: 'note', note: { title: 'ארגז הציוד', text: 'בארגז נשארו רק חבלים.' } },
      ],
    },
    {
      id: 'pipes', scene: 'shaft', name: 'צינור המים', art: 'vent', x: 300, y: 70, w: 170, h: 120, activeWhen: ['used:pipes'],
      interactions: [
        { type: 'needItem', when: ['!used:pipes'], item: 'wrench', note: { title: 'צינור המים', text: 'צינור עם מכסה ניקוז חלוד. מאחוריו משהו מנצנץ, אבל הברגים תפוסים.' }, onUse: { removeItems: ['wrench'], giveItems: ['key'], message: 'מכסה הניקוז נפתח — מאחוריו מפתח קטן!' } },
        { type: 'note', note: { title: 'צינור המים', text: 'מכסה הניקוז פתוח.' } },
      ],
    },
    {
      id: 'alarm', scene: 'shaft', name: 'מתגי האזעקה', art: 'switches', x: 500, y: 60, w: 270, h: 160, activeWhen: ['solved:alarm'],
      interactions: [
        { type: 'lock', when: ['!solved:alarm'], title: 'מתגי האזעקה', prompt: 'שישה מתגים, ממוספרים 1–6 כמו ימי השבוע (א׳–ו׳).', lock: { kind: 'switches', count: 6, answer: [false, true, false, false, true, false] }, onSolve: { message: 'נורת האזהרה הפכה לירוקה!' } },
        { type: 'note', note: { title: 'מתגי האזעקה', text: 'מתגים 2 ו־5 דולקים. הנורה באולם ירוקה.' } },
      ],
    },
    {
      id: 'instructions', scene: 'shaft', name: 'דף ההוראות', art: 'manual', x: 520, y: 270, w: 230, h: 110,
      interactions: [{ type: 'note', note: { title: 'הוראות', text: '״כדי להעביר את נורת האזהרה לירוק — מדליקים רק את המתגים של הימים שבהם שומרים דוד ורחל.״', easy: '״כדי להעביר את נורת האזהרה לירוק — מדליקים רק את המתגים של הימים שבהם שומרים דוד ורחל (לפי לוח התורנויות).״', hard: '״לירוק: הימים של דוד ורחל.״', style: 'book' } }],
    },
    {
      id: 'ladder', scene: 'shaft', name: 'הסולם לפתח', art: 'ladder', x: 300, y: 230, w: 170, h: 320,
      interactions: [
        { type: 'blocked', when: ['!used:machine'], note: { title: 'הסולם לפתח', text: 'אי אפשר לעלות כשמכונת הייצור גלויה — אם הבריטים ירדו לכאן, יגלו הכול. קודם מכסים אותה.' } },
        { type: 'blocked', when: ['!took:documents'], note: { title: 'הסולם לפתח', text: 'אסור לצאת בלי מסמכי המפעל — הם בכספת המשרד.' } },
        { type: 'blocked', when: ['!solved:alarm'], note: { title: 'הסולם לפתח', text: 'הנורה עדיין אדומה. אם נעלה עכשיו — ניתפס.' } },
        { type: 'lock', title: 'הפתח שמתחת למכונת הכביסה', prompt: 'מנעול של 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '7503' }, onSolve: { message: 'הפתח נפתח — עליתם דרך המכבסה וברחתם!', escape: true } },
      ],
    },
  ],
  hints: [
    { until: 'solved:rlocker', text: 'לוח התורנויות ולוח השנה בחדר המנוחה נותנים יחד את סיסמת הארונית: מי שומר ביום רביעי?' },
    { until: 'used:machine', after: ['took:tarp'], text: 'הברזנט נועד לכסות את מכונת הייצור באולם.' },
    { until: 'solved:cabinet', text: 'מכונת הכתיבה במשרד אומרת באיזה סדר צבעים פותחים את ארון התיקים.' },
    { until: 'solved:crate', after: ['took:prodlog'], text: 'ביומן הייצור: כל יום 150 כדורים יותר. היום יום רביעי — 750.' },
    { until: 'used:sunlamp', after: ['took:bulb'], text: 'הנורה מתאימה למנורת השיזוף בחדר המנוחה.' },
    { until: 'solved:radio', after: ['used:sunlamp'], text: 'באור המנורה מופיע מספר על הכרזה הדהויה — זה התדר של הרדיו.' },
    { until: 'solved:workbench', text: 'החיצים שחרוטים על מכונת הייצור פותחים את שולחן העבודה.' },
    { until: 'used:pipes', after: ['took:wrench'], text: 'בפיר יש צינור עם ברגים תפוסים.' },
    { until: 'used:desk', after: ['took:key'], text: 'המפתח הקטן פותח את המגירה בשולחן המשרד.' },
    { until: 'solved:safe', after: ['took:cipher', 'took:telegram'], text: 'הזיזו כל אות במברק שתי אותיות אחורה: נ←ל, י←ח, ס←ם.' },
    { until: 'solved:alarm', text: 'דוד שומר ביום ב׳ ורחל ביום ה׳ — מדליקים את מתגים 2 ו־5.' },
    { until: 'escaped', after: ['took:documents'], text: 'הכדורים של היום — 750, ועל המכונה שלוש נורות: 7503.' },
  ],
  walkthrough: [
    { solve: 'rlocker', input: 'עמוס' },
    { use: 'machine', item: 'tarp' },
    { solve: 'cabinet', input: 'red,yellow,blue,green' },
    { solve: 'crate', input: '750' },
    { use: 'sunlamp', item: 'bulb' },
    { solve: 'radio', input: '385' },
    { solve: 'workbench', input: 'up,up,right,down' },
    { use: 'pipes', item: 'wrench' },
    { use: 'desk', item: 'key' },
    { solve: 'safe', input: 'לחם' },
    { solve: 'alarm', input: '010010' },
    { solve: 'ladder', input: '7503' },
  ],
}
