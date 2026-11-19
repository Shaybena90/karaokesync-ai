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
}

export type LockDef =
  | { kind: 'digits'; length: number; answer: string }
  | { kind: 'letters'; length: number; answer: string }
  | { kind: 'colors'; options: Color[]; answer: Color[] }
  | { kind: 'arrows'; answer: Dir[] }
  | { kind: 'switches'; count: number; answer: boolean[] }
  | { kind: 'terminal'; numeric?: boolean; answers: string[] }

export interface Effect {
  setFlags?: string[]
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

export type ArtKey =
  | 'door' | 'clock' | 'trash' | 'drawer' | 'terminal' | 'desk-under' | 'whiteboard' | 'mixer' | 'vent' | 'fusebox'
  | 'poster' | 'safe' | 'book' | 'starmap' | 'locker' | 'console' | 'hatch' | 'crate' | 'slot' | 'switches'
  | 'manual' | 'tanks' | 'painting' | 'statues' | 'showcase' | 'owl' | 'cabinet' | 'jewelbox'
  | 'radio' | 'typewriter' | 'map' | 'machine' | 'phone' | 'lamp' | 'ladder' | 'calendar' | 'enigma'

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

export type Theme = 'lab' | 'station' | 'museum' | 'bunker' | 'hq' | 'hut'

export interface SceneDef {
  id: string
  name: string
  theme: Theme
}

export type Category = 'מדע ודמיון' | 'מחתרות' | 'מלחמות ישראל' | 'מלחמת העולם השנייה'

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
