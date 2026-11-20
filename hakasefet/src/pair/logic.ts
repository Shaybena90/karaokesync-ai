/**
 * "שני צדדים של הדלת" — the two-player room. Pure logic with no imports, so the
 * same file runs in the pair server (Node) and in the browser (same-device practice).
 *
 * The server is the authority: it keeps the state, checks every answer and
 * sends each player ONLY the view for their role.
 */
export type Role = 'A' | 'B'
export type PairOutcome = 'ok' | 'wrong' | 'invalid'

export interface PairState {
  v: 1
  stage: number // 0..5 = puzzle index; 6 = finished
  wrong: number
  hintTiers: number[] // per stage, shared
  codes: { A: boolean; B: boolean } // stage 6: each side entered its code
  exit: { A: boolean; B: boolean } // both confirm the exit
  startedAt?: number
  finishedAt?: number
  log: { at: number; role: Role | null; text: string; kind: 'good' | 'wrong' | 'info' }[]
  results: Record<string, PairOutcome>
}

export type PairAction =
  | { id: string; role: Role; type: 'answer'; stage: number; value: string }
  | { id: string; role: Role; type: 'hint'; stage: number }
  | { id: string; role: Role; type: 'exit'; stage: number }

export type InputDef =
  | { kind: 'choice'; options: { id: string; label: string }[] }
  | { kind: 'digits'; length: number }
  | { kind: 'switches'; count: number }
  | { kind: 'text' }

export interface RoleView {
  /** What this player sees: short documents (never the other side's). */
  docs: { title: string; text: string }[]
  /** The input this player controls at this stage, if any. */
  input?: InputDef
  /** One line telling this player what to do. */
  task: string
}

interface PuzzleDef {
  id: string
  name: string
  actor: Role | 'both'
  check: (value: string, role: Role) => boolean
  view: (role: Role) => RoleView
  hints: [string, string, string]
  solution: string
  explanation: string
}

const CELLS = ['א', 'ב', 'ג'].flatMap((col) => ['1', '2', '3'].map((row) => ({ id: `${col}${row}`, label: `${col}${row}` })))
const norm = (s: string) => s.trim().replace(/[ךםןףץ]/g, (c) => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c]!).replace(/\s+/g, '')

/** The codes the server hands out after stage 5 (each side gets the OTHER side's code). */
export const DOOR_CODES = { A: '6194', B: '2538' } as const

export const PAIR_PUZZLES: PuzzleDef[] = [
  {
    id: 'pair-1', name: 'המפה והמקרא', actor: 'B',
    check: (v) => v === 'ג3',
    view: (r) => r === 'A'
      ? { task: 'תארו לשותף מה יש בכל תא במפה.', docs: [{ title: 'מפה ישנה (3×3)', text: 'א1: 🌲 עץ · א2: 🏠 בית · א3: ⚓ עוגן\nב1: 🌊 גלים · ב2: ⛺ אוהל · ב3: 🌲 עץ\nג1: 🏠 בית · ג2: ⚓ עוגן · ג3: 🗼 מגדלור' }] }
      : { task: 'בחרו את התא הנכון במפה — את המפה רואה השותף.', input: { kind: 'choice', options: CELLS }, docs: [{ title: 'מקרא', text: '״המפתח הראשון קבור ליד הסמל היחיד במפה שמופיע רק פעם אחת ושמאיר בלילה.״' }] },
    hints: ['אחד מכם רואה מפה, השני — מקרא. דברו.', 'איזה סמל מופיע במפה רק פעם אחת?', 'המגדלור, בתא ג3.'],
    solution: 'ג3', explanation: 'המקרא מחפש סמל שמופיע פעם אחת ומאיר בלילה — המגדלור. במפה של צד א׳ הוא בתא ג3.',
  },
  {
    id: 'pair-2', name: 'קלפים בצבעים', actor: 'A',
    check: (v) => v === '9742',
    view: (r) => r === 'A'
      ? { task: 'הקלידו את הקוד. את המספרים רואה השותף.', input: { kind: 'digits', length: 4 }, docs: [{ title: 'פתק על הקיר', text: '״סדר הצבעים: ירוק, אדום, צהוב, כחול.״' }] }
      : { task: 'תארו לשותף את הקלפים.', docs: [{ title: 'ארבעה קלפים', text: '🟥 אדום — 7\n🟦 כחול — 2\n🟩 ירוק — 9\n🟨 צהוב — 4' }] },
    hints: ['לכל צבע יש מספר, ולצבעים יש סדר.', 'צד ב׳ רואה את המספרים; צד א׳ רואה את הסדר.', 'ירוק 9, אדום 7, צהוב 4, כחול 2: 9742.'],
    solution: '9742', explanation: 'הסדר בצד א׳ (ירוק, אדום, צהוב, כחול) עם המספרים בצד ב׳ (9, 7, 4, 2).',
  },
  {
    id: 'pair-3', name: 'מדים ומתגים', actor: 'B',
    check: (v) => v === '10010',
    view: (r) => r === 'A'
      ? { task: 'הסבירו לשותף אילו מתגים להפעיל.', docs: [{ title: 'מדים', text: 'מד הלחץ: 🔴 אדום\nמד החום: 🟢 ירוק\nמד הזרם: 🟢 ירוק' }, { title: 'מדריך', text: 'לחץ אדום → מתגים 1 ו־4.\nחום אדום → מתג 2.\nזרם אדום → מתג 5.\nמד ירוק → לא נוגעים במתג שלו.' }] }
      : { task: 'הפעילו את המתגים הנכונים — את המדים רואה השותף.', input: { kind: 'switches', count: 5 }, docs: [{ title: 'לוח מתגים', text: 'חמישה מתגים, 1 עד 5. כולם כבויים.' }] },
    hints: ['רק מד אחד אדום.', 'מה אומר המדריך על לחץ אדום?', 'מתגים 1 ו־4 בלבד.'],
    solution: 'מתגים 1 ו־4', explanation: 'רק מד הלחץ אדום, והמדריך אומר: לחץ אדום → מתגים 1 ו־4.',
  },
  {
    id: 'pair-4', name: 'צלילים ואותיות', actor: 'A',
    check: (v) => norm(v) === norm('שלום'),
    view: (r) => r === 'A'
      ? { task: 'הקלידו את המילה. את הצלילים שומע השותף.', input: { kind: 'text' }, docs: [{ title: 'טבלת צלילים', text: '▲ גבוה = ש\n▼ נמוך = ל\n● בינוני = ו\n━ ארוך = ם\n◆ קצר = ת' }] }
      : { task: 'תארו לשותף את הצלילים לפי הסדר.', docs: [{ title: 'רצף צלילים (גם בסימנים)', text: '1. ▲ גבוה\n2. ▼ נמוך\n3. ● בינוני\n4. ━ ארוך' }] },
    hints: ['כל צליל הוא אות.', 'צד ב׳ מתאר את הצלילים לפי הסדר, צד א׳ מתרגם בטבלה.', 'ש־ל־ו־ם.'],
    solution: 'שלום', explanation: 'גבוה=ש, נמוך=ל, בינוני=ו, ארוך=ם.',
  },
  {
    id: 'pair-5', name: 'שני חצאים', actor: 'both',
    check: (v) => norm(v) === norm('חירות'),
    view: (r) => ({ task: 'השלימו יחד את המילה — כל אחד יכול להקליד.', input: { kind: 'text' }, docs: [{ title: 'חצי פתק', text: r === 'A' ? 'ח _ ר _ ת' : '_ י _ ו _' }] }),
    hints: ['לכל אחד חצי מהאותיות.', 'הניחו את שני החצאים זה על זה.', 'חירות.'],
    solution: 'חירות', explanation: 'צד א׳: ח_ר_ת, צד ב׳: _י_ו_ — יחד: חירות.',
  },
  {
    id: 'pair-6', name: 'הדלת', actor: 'both',
    check: (v, role) => v === (role === 'A' ? DOOR_CODES.A : DOOR_CODES.B),
    view: (r) => ({
      task: 'הקלידו את הקוד של הצד שלכם — אותו יודע רק השותף.',
      input: { kind: 'digits', length: 4 },
      docs: [{ title: 'הודעה מהדלת', text: r === 'A' ? `״הקוד לצד ב׳: ${DOOR_CODES.B}״` : `״הקוד לצד א׳: ${DOOR_CODES.A}״` }],
    }),
    hints: ['הקוד שאתם רואים שייך לשותף.', 'הקריאו זה לזה את הקודים.', 'כל אחד מקליד את הקוד שהשותף רואה.'],
    solution: `צד א׳ מקליד ${DOOR_CODES.A}, צד ב׳ מקליד ${DOOR_CODES.B}`, explanation: 'הדלת נותנת לכל צד את הקוד של הצד השני — רק שיחה פותחת אותה.',
  },
]

export function newPairState(): PairState {
  return { v: 1, stage: 0, wrong: 0, hintTiers: PAIR_PUZZLES.map(() => 0), codes: { A: false, B: false }, exit: { A: false, B: false }, log: [], results: {} }
}

export function pairPoints(s: PairState): number {
  return Math.max(0, 1000 - 25 * s.wrong - 50 * s.hintTiers.reduce((a, b) => a + b, 0))
}

export const roleName = (r: Role) => (r === 'A' ? 'צד א׳' : 'צד ב׳')

function done(s: PairState, id: string, outcome: PairOutcome, patch: Partial<PairState> = {}, log?: PairState['log'][number]): { state: PairState; outcome: PairOutcome } {
  const keys = Object.keys(s.results)
  const results = { ...s.results, [id]: outcome }
  if (keys.length >= 60) delete results[keys[0]]
  return { state: { ...s, ...patch, results, log: log ? [...s.log, log].slice(-30) : s.log }, outcome }
}

/** Apply one action. The same action id is applied once, however often it arrives. */
export function pairReduce(s: PairState, a: PairAction, now: number): { state: PairState; outcome: PairOutcome } {
  if (a.id in s.results) return { state: s, outcome: s.results[a.id] }
  if (s.startedAt === undefined || s.finishedAt !== undefined || a.stage !== s.stage) return done(s, a.id, 'invalid')
  const p = PAIR_PUZZLES[s.stage]

  if (a.type === 'hint') {
    if (s.stage > 5 || s.hintTiers[s.stage] >= 3) return done(s, a.id, 'invalid')
    const hintTiers = s.hintTiers.map((t, i) => (i === s.stage ? t + 1 : t))
    return done(s, a.id, 'ok', { hintTiers }, { at: now, role: a.role, text: `${roleName(a.role)} פתח רמז ${hintTiers[s.stage]} (−50)`, kind: 'info' })
  }

  if (a.type === 'exit') {
    if (s.stage !== 6) return done(s, a.id, 'invalid')
    const exit = { ...s.exit, [a.role]: true }
    const fin = exit.A && exit.B
    return done(s, a.id, 'ok', { exit, finishedAt: fin ? now : undefined, stage: fin ? 7 : 6 }, { at: now, role: a.role, text: fin ? 'הדלת נפתחה — יצאתם ביחד!' : `${roleName(a.role)} מוכן לצאת`, kind: 'good' })
  }

  // answer
  if (!p || (p.actor !== 'both' && p.actor !== a.role)) return done(s, a.id, 'invalid')
  if (s.stage === 5 && s.codes[a.role]) return done(s, a.id, 'invalid')
  if (!p.check(a.value, a.role)) return done(s, a.id, 'wrong', { wrong: s.wrong + 1 }, { at: now, role: a.role, text: `${roleName(a.role)}: תשובה שגויה (−25)`, kind: 'wrong' })
  if (s.stage === 5) {
    const codes = { ...s.codes, [a.role]: true }
    const both = codes.A && codes.B
    return done(s, a.id, 'ok', { codes, stage: both ? 6 : 5 }, { at: now, role: a.role, text: both ? 'שני הקודים נכונים — אשרו יחד את היציאה' : `${roleName(a.role)} הקליד קוד נכון. מחכים לצד השני.`, kind: 'good' })
  }
  return done(s, a.id, 'ok', { stage: s.stage + 1 }, { at: now, role: a.role, text: `נפתר: ${p.name}`, kind: 'good' })
}

/** Everything one player may see — never the other side's documents. */
export function viewFor(s: PairState, role: Role) {
  const stage = Math.min(s.stage, 6)
  const p = PAIR_PUZZLES[Math.min(stage, 5)]
  const v = stage === 6 || s.finishedAt !== undefined ? { task: 'שני הקודים נכונים. לחצו ״יוצאים״ — הדלת תיפתח כששניכם תאשרו.', docs: [] } : p.view(role)
  const waitingForOther = stage === 5 && s.codes[role]
  return {
    stage,
    finished: s.finishedAt !== undefined,
    name: stage === 6 ? 'יציאה' : p.name,
    task: waitingForOther ? 'הקוד שלכם נכון. מחכים שהשותף יקליד את שלו.' : v.task,
    docs: v.docs,
    input: waitingForOther || stage === 6 ? undefined : v.input,
    hints: stage < 6 ? p.hints.slice(0, s.hintTiers[stage]) : [],
    hintTier: stage < 6 ? s.hintTiers[stage] : 3,
    exitConfirmed: s.exit[role],
    points: pairPoints(s),
    wrong: s.wrong,
    hintsUsed: s.hintTiers.reduce((a, b) => a + b, 0),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    log: s.log.slice(-8),
  }
}
export type PairView = ReturnType<typeof viewFor>
