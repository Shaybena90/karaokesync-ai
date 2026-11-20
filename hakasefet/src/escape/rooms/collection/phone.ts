import type { RoomDef } from '../../types'
import { doc } from './kit'

/** "הטלפון הנטוש" — explore a fictional phone. All people and places are fictional; no real numbers. */
export const phone: RoomDef = {
  id: 'phone',
  version: 1,
  title: 'הטלפון הנטוש',
  emoji: '📱',
  category: 'חדרי בריחה',
  length: '20–25 דקות',
  difficultyLabel: 'בינונית',
  players: 1,
  presentation: 'phone',
  blurb: 'מצאתם טלפון של מישהי שנעלמה. ההודעה האחרונה בו מבקשת שמישהו יבין לאן הלכה.',
  story: 'על ספסל בטיילת מצאתם טלפון. על המסך הודעה: ״מי שמוצא את הטלפון — תבין לאן הלכתי ומה ניסיתי להסתיר. ־נ.״ הטלפון נעול, והסוללה עוד מחזיקה.',
  goal: 'לפתוח את הטלפון, לחבר בין ההודעות, התמונות וההקלטות — ולפתוח את קובץ הסיום שמסביר את ההיעלמות.',
  photo: { src: 'rooms/phone.webp', size: [1672, 941], enter: { label: '📱 הטלפון של נועה', rect: [1040, 355, 175, 310] } },
  illustration: { art: 'phone', theme: 'office' },
  scenes: [
    { id: 'lock', name: 'מסך נעילה', theme: 'office', icon: '🔒', visibleWhen: ['!solved:lockpad'] },
    { id: 'messages', name: 'הודעות', theme: 'office', icon: '💬', visibleWhen: ['solved:lockpad'] },
    { id: 'backup', name: 'גיבוי', theme: 'office', icon: '☁️', visibleWhen: ['solved:lockpad'] },
    { id: 'photos', name: 'תמונות', theme: 'office', icon: '🖼️', visibleWhen: ['solved:lockpad'] },
    { id: 'calendar', name: 'יומן', theme: 'office', icon: '📅', visibleWhen: ['solved:lockpad'] },
    { id: 'maps', name: 'מפות', theme: 'office', icon: '🗺️', visibleWhen: ['solved:lockpad'] },
    { id: 'recorder', name: 'הקלטות', theme: 'office', icon: '🎙️', visibleWhen: ['solved:lockpad'] },
    { id: 'notes', name: 'פתקים', theme: 'office', icon: '📝', visibleWhen: ['solved:lockpad'] },
    { id: 'calls', name: 'שיחות', theme: 'office', icon: '📞', visibleWhen: ['solved:lockpad'] },
    { id: 'files', name: 'קבצים', theme: 'office', icon: '📁', visibleWhen: ['solved:lockpad'] },
  ],
  items: [],
  notebookEntries: [
    { id: 'pilpel', text: 'על מסך הנעילה: יום ההולדת של הכלב פלפל — 14 במרץ.' },
    { id: 'medical', text: 'כרטיס חירום: קוד הנעילה = יום ההולדת של מי שנועה הכי אוהבת, יום ואז חודש.' },
    { id: 'dani-chat', text: 'בשיחה עם דני (יום ד׳): ״מחר נפגשים״ — המקום נמחק.' },
    { id: 'backup', text: 'בגיבוי: ״בשקיעה ליד ה███״, ו״אל תספר לאף אחד על המגדלור הישן״.' },
    { id: 'meeting-place', text: 'השיחה שוחזרה: נפגשים בשקיעה ליד המגדלור הישן.' },
    { id: 'photo', text: 'תמונת המגדלור: צולמה ביום ה׳ ב־18:24. דלת מספר 7, שלט ״112 מדרגות עד הפסגה״.' },
    { id: 'sunset', text: 'ביומן: שקיעה ביום ה׳ ב־18:31.' },
    { id: 'meeting', text: 'נקודת המפגש: המגדלור הישן, יום ה׳ ב־18:31.' },
    { id: 'memo', text: 'הקלטה: קוד הפתק הנעול = מספר המדרגות ואחריו מספר הדלת.' },
    { id: 'three-names', text: 'בפתק: דני, מאיה ועומר ידעו על המפגש. אחד מהם שיקר — ״יומן השיחות יראה מי״.' },
    { id: 'calls', text: 'יומן שיחות: יום ה׳ 18:12 — עומר, נענתה, 4 דקות. 18:10 — מאיה, לא נענתה.' },
    { id: 'maya', text: 'מאיה: התקשרה ב־18:10 ולא נענתה.' },
    { id: 'omer', text: 'עומר: טוען שלא דיבר עם נועה מאז יום שלישי.' },
    { id: 'dani2', text: 'דני: חיכה במגדלור ונועה לא הגיעה.' },
    { id: 'liar', text: 'עומר שיקר: יומן השיחות מראה שיחה איתו ביום ה׳ ב־18:12.' },
    { id: 'locker', text: 'בתיקייה הסודית: מפתח עם תג ״ארונית 24 — החוף״.' },
    { id: 'final-rule', text: 'סיסמת קובץ הסיום: שם המקום שבו נפגשו, ואחריו מספר הארונית, בלי רווח.' },
  ],
  hotspots: [
    // ── מסך נעילה ──
    doc('wallpaper', 'lock', 'תמונת הרקע', '🐶', 'פלפל', [{ type: 'note', note: { title: 'תמונת הרקע', text: 'על מסך הנעילה כלב מחייך, ומתחתיו הכיתוב ״פלפל 🐶״. תזכורת קבועה: ״🎂 יום הולדת לפלפל — 14 במרץ״.', notebook: 'pilpel' } }]),
    doc('medical', 'lock', 'כרטיס חירום', '🩺', 'מידע רפואי', [{ type: 'note', note: { title: 'כרטיס חירום', text: 'נועה ברק · סוג דם A+ · אלרגיה לאגוזים.\nהערה אישית: ״שוכחת קודים? הקוד שלי הוא יום ההולדת של מי שאני הכי אוהבת — יום ואז חודש.״', notebook: 'medical' } }]),
    doc('lockpad', 'lock', 'לוח הקוד', '🔢', 'הקלידו קוד בן 4 ספרות', [
      { type: 'lock', title: 'קוד הנעילה', prompt: 'קוד בן 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '1403' }, onSolve: { message: 'הטלפון נפתח!' } },
    ]),
    // ── הודעות ──
    doc('thread-dani', 'messages', 'דני', '👤', 'מחר נפגשים?', [{ type: 'note', note: { title: 'שיחה עם דני', style: 'paper', notebook: 'dani-chat', text: 'דני (יום ד׳): מחר נפגשים? יש לי את מה שביקשת.\nנועה: כן. ב[ההודעה נמחקה] ליד ה[ההודעה נמחקה].\nדני: מושלם. תביאי את התיקייה.\nנועה: [ההודעה נמחקה]' } }]),
    doc('thread-maya', 'messages', 'מאיה', '👤', 'נועה?? תעני לי', [{ type: 'note', note: { title: 'שיחה עם מאיה', style: 'paper', notebook: 'maya', text: 'מאיה (יום ה׳, 18:14): התקשרתי אלייך ב־18:10 ולא ענית. הכול בסדר?\nמאיה (יום ו׳): נועה?? תעני לי.' } }], { visibleWhen: ['solved:lockedNote'] }),
    doc('thread-omer', 'messages', 'עומר', '👤', 'רק שתדעי…', [{ type: 'note', note: { title: 'שיחה עם עומר', style: 'paper', notebook: 'omer', text: 'עומר (יום ו׳, 09:02): שמעתי שאת לא עונה. רק שתדעי — לא דיברתי איתך מאז יום שלישי. ביום חמישי הייתי בעבודה עד הלילה.' } }], { visibleWhen: ['solved:lockedNote'] }),
    doc('thread-dani2', 'messages', 'דני (חדש)', '👤', 'חיכיתי לך…', [{ type: 'note', note: { title: 'הודעה חדשה מדני', style: 'paper', notebook: 'dani2', text: 'דני (יום ה׳, 19:20): חיכיתי לך במגדלור ולא באת. איפה את?' } }], { visibleWhen: ['solved:lockedNote'] }),
    // ── גיבוי ──
    doc('backup-file', 'backup', 'גיבוי: שיחה עם דני', '🗂️', 'קובץ פגום · 03:00', [{ type: 'note', note: { title: 'גיבוי אוטומטי (חלקי)', style: 'screen', notebook: 'backup', text: 'הקובץ פגום. מה ששרד:\nנועה: כן. בשקיעה ליד ה███.\n…\nנועה: אל תספר לאף אחד על המגדלור הישן.' } }]),
    doc('restore', 'backup', 'שחזור השיחה', '🔄', 'השלימו את המילה החסרה', [
      { type: 'lock', when: ['!solved:restore'], title: 'שחזור השיחה', prompt: 'כדי לשחזר, השלימו את ההודעה של נועה: ״כן. בשקיעה ליד ה…״', lock: { kind: 'terminal', answers: ['מגדלור', 'המגדלור', 'המגדלור הישן', 'מגדלור ישן', 'מגדלור הישן'] }, onSolve: { message: 'השיחה שוחזרה: ״נפגשים בשקיעה ליד המגדלור הישן.״', notebook: ['meeting-place'] } },
      { type: 'note', note: { title: 'השיחה המשוחזרת', style: 'screen', text: 'נועה: כן. בשקיעה ליד המגדלור הישן.' } },
    ]),
    // ── תמונות ──
    doc('photo-lighthouse', 'photos', 'IMG_0412', '🗼', 'יום ה׳ · 18:24', [{ type: 'note', note: { title: 'IMG_0412', zoom: true, notebook: 'photo', text: 'מגדלור לבן על החוף, בשעת אחר צהריים. פרטי התמונה: יום ה׳, 18:24.\nעל דלת המגדלור מספר 7, ולידה שלט: ״112 מדרגות עד הפסגה״.' } }]),
    doc('photo-dog', 'photos', 'IMG_0398', '🐶', 'יום ב׳', [{ type: 'note', note: { title: 'IMG_0398', text: 'פלפל ישן על הספה.' } }]),
    // ── יומן ──
    doc('cal-thu', 'calendar', 'יום חמישי', '📅', 'פגישה עם ד׳', [{ type: 'note', note: { title: 'יום חמישי', notebook: 'sunset', text: '״פגישה עם ד׳ — לא לאחר!״\nמזג האוויר: בהיר · שקיעה ב־18:31.' } }]),
    doc('cal-fri', 'calendar', 'יום שישי', '📅', 'רופאת שיניים', [{ type: 'note', note: { title: 'יום שישי', text: '09:00 — רופאת שיניים (בוטל).' } }]),
    // ── מפות ──
    doc('pinmap', 'maps', 'נקודת מפגש', '📍', 'סימון שלא אושר', [
      { type: 'blocked', when: ['!solved:restore'], note: { title: 'נקודת מפגש', text: 'נועה סימנה ״נקודת מפגש״ — אבל המקום עצמו נמחק יחד עם השיחה. אולי אפשר לשחזר אותה.' } },
      { type: 'lock', when: ['!solved:pinmap'], title: 'נקודת מפגש', prompt: 'כדי לאשר את הסימון: איפה ומתי נקבעה הפגישה?', lock: { kind: 'choice', options: [{ id: 'a', label: 'המגדלור הישן · 18:24' }, { id: 'b', label: 'המגדלור הישן · 18:31' }, { id: 'c', label: 'נמל הדייגים · 18:31' }, { id: 'd', label: 'המגדלור הישן · 19:05' }], answer: 'b', feedback: { a: 'זו השעה שבה צולמה התמונה — לא השעה שנקבעה.', c: 'בשום ראיה לא מוזכר נמל.', d: 'השעה הזאת לא מופיעה באף ראיה.' } }, onSolve: { message: 'נקודת המפגש אושרה — באפליקציית ההקלטות הופיעה הקלטה!', notebook: ['meeting'] } },
      { type: 'note', note: { title: 'נקודת מפגש', text: 'המגדלור הישן · יום ה׳ · 18:31.' } },
    ]),
    // ── הקלטות ──
    doc('memo', 'recorder', 'הקלטה: ״אם משהו קורה״', '🎙️', '0:24', [
      { type: 'blocked', when: ['!solved:pinmap'], note: { title: 'הקלטות', text: 'אין הקלטות. (נראה שחלק מהקבצים מסתנכרנים רק אחרי שמאשרים את נקודת המפגש.)' } },
      { type: 'note', note: { title: 'הקלטה: ״אם משהו קורה״', notebook: 'memo', text: '״אם את שומעת את זה, משהו השתבש. השארתי פתק נעול באפליקציית הפתקים. הקוד: מספר המדרגות של המגדלור, ואחריו מספר הדלת. ואל תסמכי על מי שמשקר לגבי השיחות.״', voice: { effect: 'phone', pitch: 1.05, lines: ['אם את שומעת את זה, משהו השתבש.', 'השארתי פתק נעול באפליקציית הפתקים.', 'הקוד: מספר המדרגות של המגדלור, ואחריו מספר הדלת.', 'ואל תסמכי על מי שמשקר לגבי השיחות.'] } } },
    ]),
    // ── פתקים ──
    doc('shopping', 'notes', 'קניות', '🛒', 'חלב, אוכל לפלפל…', [{ type: 'note', note: { title: 'קניות', style: 'paper', text: 'חלב · אוכל לפלפל · סוללות · מטען.' } }]),
    doc('lockedNote', 'notes', 'פתק נעול', '🔒', 'קוד בן 4 ספרות', [
      { type: 'lock', when: ['!solved:lockedNote'], title: 'פתק נעול', prompt: 'קוד בן 4 ספרות.', lock: { kind: 'digits', length: 4, answer: '1127' }, onSolve: { message: 'הפתק נפתח — ובהודעות הגיעו הודעות חדשות!', notebook: ['three-names'] } },
      { type: 'note', note: { title: 'הפתק', style: 'paper', text: '״ידעו על המפגש ביום חמישי: דני, מאיה ועומר. אחד מהם שיקר לי. יומן השיחות יראה מי.״' } },
    ]),
    // ── שיחות ──
    doc('calllog', 'calls', 'יומן שיחות', '📞', 'אחרונות', [{ type: 'note', note: { title: 'יומן שיחות', notebook: 'calls', text: 'יום ה׳ 18:12 · עומר · נכנסת · נענתה · 4 דקות\nיום ה׳ 18:10 · מאיה · נכנסת · לא נענתה\nיום ג׳ 20:05 · דני · יוצאת · 12 דקות\nיום ג׳ 19:30 · עומר · יוצאת · 2 דקות' } }]),
    // ── קבצים ──
    doc('secretfolder', 'files', 'תיקייה סודית', '🗄️', 'מוגנת בשאלה', [
      { type: 'blocked', when: ['!solved:lockedNote'], note: { title: 'תיקייה סודית', text: 'התיקייה מוגנת בשאלה: ״מי שיקר לי?״ — אבל עוד לא ידוע על מי מדובר.' } },
      { type: 'lock', when: ['!solved:secretfolder'], title: 'תיקייה סודית', prompt: '״מי שיקר לי?״', lock: { kind: 'choice', options: [{ id: 'dani', label: 'דני' }, { id: 'maya', label: 'מאיה' }, { id: 'omer', label: 'עומר' }], answer: 'omer', feedback: { dani: 'דני כתב שחיכה במגדלור — שום דבר ביומן השיחות לא סותר את זה.', maya: 'מאיה כתבה שהתקשרה ב־18:10 ולא נענתה — בדיוק כמו ביומן השיחות.' } }, onSolve: { message: 'התיקייה הסודית נפתחה!', notebook: ['liar'] } },
      { type: 'note', note: { title: 'תיקייה סודית', text: 'בתיקייה: צילום של מפתח, קובץ הוראות, וקובץ נעול ״אם אני נעלמת״.' } },
    ]),
    doc('keytag', 'files', 'צילום: מפתח', '🗝️', 'מתוך התיקייה הסודית', [{ type: 'note', note: { title: 'צילום של מפתח', zoom: true, notebook: 'locker', text: 'מפתח קטן עם תג פלסטיק: ״ארונית 24 — החוף״.' } }], { visibleWhen: ['solved:secretfolder'] }),
    doc('readme', 'files', 'הוראות.txt', '📄', 'מתוך התיקייה הסודית', [{ type: 'note', note: { title: 'הוראות.txt', style: 'paper', notebook: 'final-rule', text: '״את הראיות שמתי בארונית, ליד המקום שבו נפגשנו. הסיסמה לקובץ הסיום: שם המקום ואחריו מספר הארונית, בלי רווח.״' } }], { visibleWhen: ['solved:secretfolder'] }),
    doc('finalfile', 'files', 'אם אני נעלמת.txt', '🔐', 'נעול בסיסמה', [
      { type: 'lock', title: 'אם אני נעלמת.txt', prompt: 'סיסמה:', lock: { kind: 'terminal', answers: ['מגדלור24', 'המגדלור24', 'מגדלור 24', 'המגדלור 24'] }, onSolve: { message: 'הקובץ נפתח: נועה בסדר! היא הסתתרה עם הראיות על המשלוח של עומר, וביקשה שמי שימצא את הטלפון יעביר את הראיות שבארונית 24 למשטרה.', escape: true } },
    ], { visibleWhen: ['solved:secretfolder'] }),
  ],
  hints: [],
  puzzles: [
    { id: 'phone-1', name: 'קוד הנעילה', sees: 'מסך נעילה עם תמונת הכלב פלפל, תזכורת ליום ההולדת שלו וכרטיס חירום.', doneWhen: 'solved:lockpad', solution: '1403', explanation: 'כרטיס החירום אומר שהקוד הוא יום ההולדת של מי שנועה הכי אוהבת, יום ואז חודש. על מסך הנעילה: יום ההולדת של פלפל — 14 במרץ → 14, 03.', hints: ['מי מופיע בכל מקום במסך הנעילה?', 'כרטיס החירום מסביר את מבנה הקוד: יום ואז חודש.', 'פלפל נולד ב־14 במרץ: 1403.'], after: 'הטלפון נפתח וכל האפליקציות זמינות.', wrong: '״קוד שגוי״, ואפשר לנסות שוב.' },
    { id: 'phone-2', name: 'השיחה שנמחקה', sees: 'שיחה עם דני שחלק מההודעות בה נמחקו, וקובץ גיבוי פגום.', availableWhen: ['solved:lockpad'], doneWhen: 'solved:restore', solution: 'מגדלור', explanation: 'בשיחה המקום נמחק. בגיבוי שרד ״בשקיעה ליד ה███״, ובהמשך ״אל תספר לאף אחד על המגדלור הישן״ — המילה החסרה היא ״מגדלור״.', hints: ['לשיחה עם דני יש גיבוי.', 'בגיבוי מופיע מקום אחד בשמו — בשורה האחרונה.', 'המילה החסרה: מגדלור.'], after: 'השיחה משוחזרת, ונקודת המפגש במפות מוכנה לאישור.', wrong: '״השחזור נכשל״ — אפשר לנסות שוב.' },
    { id: 'phone-3', name: 'מקום ושעה', sees: 'תמונה של המגדלור עם שעה, יום חמישי ביומן עם שעת שקיעה, ונקודת מפגש לא מאושרת.', availableWhen: ['solved:restore'], doneWhen: 'solved:pinmap', solution: 'המגדלור הישן · 18:31', explanation: 'הפגישה נקבעה ״בשקיעה ליד המגדלור״. ביומן: שקיעה ב־18:31. התמונה צולמה ב־18:24 — כשנועה כבר חיכתה שם.', hints: ['״בשקיעה״ היא שעה — איפה היא כתובה?', 'ביומן של יום חמישי יש שעת שקיעה. שעת התמונה היא מלכודת.', 'המגדלור הישן · 18:31.'], after: 'מופיעה הקלטה חדשה באפליקציית ההקלטות.', wrong: 'הסבר קצר למה האפשרות לא מתאימה; אפשר לבחור שוב.' },
    { id: 'phone-4', name: 'ההקלטה', sees: 'הקלטה קולית (עם תמליל מלא) שמסבירה איך לפתוח את הפתק הנעול.', availableWhen: ['solved:pinmap'], doneWhen: 'solved:lockedNote', solution: '1127', explanation: 'בהקלטה: ״מספר המדרגות של המגדלור, ואחריו מספר הדלת״. בתמונה: 112 מדרגות, דלת מספר 7 → 1127.', hints: ['ההקלטה מפנה לפרט בתמונה.', 'בתמונת המגדלור יש שלט עם מספר מדרגות ומספר על הדלת.', '112 ואחריו 7: 1127.'], after: 'הפתק נפתח, ומגיעות הודעות חדשות ממאיה, מעומר ומדני.', wrong: '״קוד שגוי״.' },
    { id: 'phone-5', name: 'מי משקר', sees: 'פתק שאומר ששלושה ידעו על המפגש ואחד שיקר, הודעות משלושתם ויומן שיחות.', availableWhen: ['solved:lockedNote'], doneWhen: 'solved:secretfolder', solution: 'עומר', explanation: 'עומר כתב שלא דיבר עם נועה מאז יום שלישי — אבל ביומן: יום ה׳ 18:12, שיחה נכנסת מעומר שנענתה, 4 דקות. מאיה (לא נענתה 18:10) ודני (חיכה במגדלור) לא נסתרים.', hints: ['השוו כל הודעה למה שכתוב ביומן השיחות.', 'מה מישהו טוען על יום חמישי — ומה היומן מראה באותו יום?', 'עומר: טוען שלא דיברו, אבל ביום ה׳ ב־18:12 הייתה שיחה איתו.'], after: 'התיקייה הסודית נפתחת: צילום מפתח, הוראות וקובץ נעול.', wrong: 'הסבר למה מה שהאדם כתב תואם ליומן; אפשר לבחור שוב.' },
    { id: 'phone-6', name: 'קובץ הסיום', sees: 'קובץ ״אם אני נעלמת״ נעול, הוראות לסיסמה וצילום מפתח.', availableWhen: ['solved:secretfolder'], doneWhen: 'escaped', solution: 'מגדלור24', explanation: 'ההוראות: שם המקום שבו נפגשו (המגדלור — מהשיחה המשוחזרת) ואחריו מספר הארונית (24 — מתג המפתח), בלי רווח.', hints: ['הסיסמה מורכבת משני חלקים שכבר גיליתם.', 'המקום — מהשיחה המשוחזרת. המספר — מתג המפתח.', 'מגדלור24.'], after: 'הקובץ נפתח ומסביר את ההיעלמות. סוף החדר.', wrong: '״סיסמה שגויה״.' },
  ],
  walkthrough: [
    { read: 'medical' },
    { solve: 'lockpad', input: '1403' },
    { solve: 'restore', input: 'מגדלור' },
    { solve: 'pinmap', input: 'b' },
    { solve: 'lockedNote', input: '1127' },
    { read: 'calllog' },
    { solve: 'secretfolder', input: 'omer' },
    { solve: 'finalfile', input: 'מגדלור24' },
  ],
}
