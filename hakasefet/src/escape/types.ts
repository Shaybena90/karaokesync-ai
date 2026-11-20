/**
 * Escape-room content model. Rooms are pure data (src/escape/rooms/*):
 * scenes, objects (hotspots), items and locks. The engine never contains
 * room-specific logic, so new rooms need no engine changes.
 *
 * Flags drive everything. The engine sets these automatically:
 *   solved:<hotspotId>   a lock on that object was opened
 *   used:<hotspotId>     an item was used on that object
 *   took:<itemId>        an item was picked up / received
 *   escaped              the room is finished
 * A condition is a flag name; prefix it with "!" to require that it is NOT set.
 */
export type Cond = string

export type Color = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'white'
export type Dir = 'up' | 'down' | 'left' | 'right'

export interface Note {
  title: string
  text: string
  /** Clearer wording on the easy level. */
  easy?: string
  /** Vaguer wording on the hard level. */
  hard?: string
  style?: 'paper' | 'screen' | 'plaque' | 'book'
  /** Spoken aloud when the note opens (radio / phone / computer voice); the text is the transcript. */
  voice?: Voice
  /** Reading this note adds the entry to the evidence notebook (it stays there, even across loops). */
  notebook?: string
  /** The text is shown as a mirror reflection (with an accessible straight view). */
  mirror?: boolean
  /** Can be enlarged (evidence photos, small print). */
  zoom?: boolean
}

export interface Voice {
  lines: string[]
  effect: 'radio' | 'phone' | 'computer'
  /** Lower / higher voice. */
  pitch?: number
}

/** A tool that reveals hidden writing when moved over a document. */
export type RevealTool = 'uv' | 'magnifier' | 'light'

export type LockDef =
  | { kind: 'digits'; length: number; answer: string }
  | { kind: 'letters'; length: number; answer: string }
  | { kind: 'colors'; options: Color[]; answer: Color[] }
  | { kind: 'arrows'; answer: Dir[] }
  | { kind: 'switches'; count: number; answer: boolean[] }
  | { kind: 'terminal'; numeric?: boolean; answers: string[] }
  /** A radio dial: static fades as you approach the answer. */
  | { kind: 'tuner'; min: number; max: number; answer: number }
  /** Pick one option. `feedback` explains why a wrong option is wrong (without giving the answer). */
  | { kind: 'choice'; options: Opt[]; answer: string; feedback?: Record<string, string> }
  /** Put options in order / build a sequence (options may repeat when `repeat`). */
  | { kind: 'sequence'; options: Opt[]; answer: string[]; repeat?: boolean }
  /** Select exactly the right set. */
  | { kind: 'multi'; options: Opt[]; answer: string[] }
  /** Name a claim / suspect and attach the evidence that proves it. */
  | { kind: 'accuse'; suspects: Opt[]; evidence: Opt[]; answer: string; required: string[]; forbidden?: string[] }

export interface Opt {
  id: string
  label: string
  icon?: string
}

export interface Effect {
  setFlags?: string[]
  /** Flags to remove (e.g. switching a room version). */
  clearFlags?: string[]
  /** Evidence-notebook entries this adds. */
  notebook?: string[]
  giveItems?: string[]
  removeItems?: string[]
  /** Shown to everyone when it happens. */
  message: string
  escape?: boolean
}

export type Interaction =
  | { type: 'note'; when?: Cond[]; note: Note }
  | { type: 'blocked'; when?: Cond[]; note: Note }
  | { type: 'take'; when?: Cond[]; item: string; note: Note }
  | { type: 'lock'; when?: Cond[]; title: string; prompt: string; lock: LockDef; onSolve: Effect }
  | { type: 'needItem'; when?: Cond[]; item: string; note: Note; onUse: Effect }
  /**
   * Hidden writing on a document. With the tool (an item in the bag, or none
   * when `item` is omitted) the player sweeps a lens over the page; finding the
   * spot sets `revealed:<hotspotId>` and applies onReveal.
   */
  | { type: 'reveal'; when?: Cond[]; item?: string; tool: RevealTool; note: Note; hidden: string; at?: { x: number; y: number }; onReveal: Effect }
  /** A plain action button (enter a door, pull a lever, open a drawer). Sets acted:<hotspotId> once; repeatable ones may run again. */
  | { type: 'action'; when?: Cond[]; label: string; note: Note; onAct: Effect; repeatable?: boolean }

export type ArtKey =
  | 'door' | 'clock' | 'trash' | 'drawer' | 'terminal' | 'desk-under' | 'whiteboard' | 'mixer' | 'vent' | 'fusebox'
  | 'poster' | 'safe' | 'book' | 'starmap' | 'locker' | 'console' | 'hatch' | 'crate' | 'slot' | 'switches'
  | 'manual' | 'tanks' | 'painting' | 'statues' | 'showcase' | 'owl' | 'cabinet' | 'jewelbox'
  | 'radio' | 'typewriter' | 'map' | 'machine' | 'phone' | 'lamp' | 'ladder' | 'calendar' | 'enigma'
  | 'card' | 'photo' | 'mirror' | 'bed' | 'elevator' | 'gauges' | 'camera' | 'board' | 'pod'

export interface Hotspot {
  id: string
  scene: string
  name: string
  art: ArtKey
  /** Position in the 800×600 scene. */
  x: number
  y: number
  w: number
  h: number
  /** Extra art detail (e.g. frame colour). */
  variant?: string
  /** Art shows "open/on" when all these hold. */
  activeWhen?: Cond[]
  /** Hidden until these hold (new messages, a room that appears…). */
  visibleWhen?: Cond[]
  /** Icon and one-line subtitle in list views (phone apps, evidence board). */
  icon?: string
  subtitle?: string
  /** First interaction whose `when` holds is the current one. */
  interactions: Interaction[]
}

export interface ItemDef {
  id: string
  name: string
  icon: string
  note: Note
}

export interface Hint {
  /** The hint is relevant until this flag is set… */
  until: Cond
  /** …and only once these hold. */
  after?: Cond[]
  text: string
}

export type Theme = 'lab' | 'station' | 'museum' | 'bunker' | 'hq' | 'hut' | 'bank' | 'hotel' | 'office'

export interface SceneDef {
  id: string
  name: string
  theme: Theme
  /** Phone apps / board sections: emoji icon. */
  icon?: string
  visibleWhen?: Cond[]
}

export type Category = 'מדע ודמיון' | 'מחתרות' | 'מלחמות ישראל' | 'מלחמת העולם השנייה' | 'חדרי בריחה'

/**
 * One of a room's six connected puzzles — the design record behind the
 * hotspots (shown progressively as hints, and in the developer solutions doc).
 */
export interface PuzzleDef {
  id: string
  name: string
  /** What the player sees at this stage. */
  sees: string
  /** Available once these hold (puzzles unlock in order). */
  availableWhen?: Cond[]
  /** Solved when this holds. */
  doneWhen: Cond
  /** Exact solution and the reasoning (developer doc / end screen). */
  solution: string
  explanation: string
  /** Gentle nudge → practical step → almost the answer. */
  hints: [string, string, string]
  /** What changes / opens after solving. */
  after: string
  /** What happens on a wrong answer. */
  wrong: string
}

export interface NotebookEntry {
  id: string
  text: string
}

export interface Combo {
  a: string
  b: string
  result: string
  message: string
}

export interface RoomDef {
  id: string
  version: number
  title: string
  emoji: string
  category: Category
  /** Rough playing time on the medium level, e.g. "15–20 דקות". */
  length: string
  story: string
  /** Historical background, shown before playing (plot and puzzles are fictional). */
  history?: string
  /** The room is in emergency lighting until this flag is set. */
  darkUntil?: string
  /** — Escape-room collection fields — */
  /** Spoiler-free blurb for the catalog. */
  blurb?: string
  /** What the player has to achieve. */
  goal?: string
  difficultyLabel?: string
  players?: 1 | 2
  /** How the room is shown: 3D/2D scene (default), a fictional phone, or an evidence board. */
  presentation?: 'scene' | 'phone' | 'board'
  /** The six puzzles (scoring: 1000 − 25×wrong − 50×hint tiers). */
  puzzles?: PuzzleDef[]
  notebookEntries?: NotebookEntry[]
  combos?: Combo[]
  /** A timed challenge (with an untimed practice mode). */
  timer?: { minutes: number }
  /** Time loop: everything except knowledge resets every N minutes. */
  loop?: { minutes: number; persist: string[] }
  /** Catalog illustration. */
  illustration?: { art: ArtKey; theme: Theme; variant?: string }
  scenes: SceneDef[]
  hotspots: Hotspot[]
  items: ItemDef[]
  hints: Hint[]
  /** The solution, as engine actions — checked by tests so every room is solvable. */
  walkthrough: WalkStep[]
}

export type WalkStep =
  | { take: string }
  | { solve: string; input: string }
  | { use: string; item: string }
  | { reveal: string }
  | { read: string }
  | { act: string }
  | { combine: [string, string] }
  /** Loop rooms: wait until this minute of the loop (next loop if already past). */
  | { waitUntil: number }
