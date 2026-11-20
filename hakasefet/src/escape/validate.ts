import { holds, newGame, reduce, type Action, type GameState } from './engine'
import type { Effect, Interaction, LockDef, RoomDef } from './types'
import { walkAction } from './walk'

/** Bumped when room content changes in a way saved games should know about. */
export const CONTENT_VERSION = 2

/**
 * Checks one room's content and returns every problem found (empty = valid):
 * duplicate ids, references to things that do not exist, puzzles that the
 * solution never reaches or reaches out of order (unreachable steps or a
 * dependency cycle), and solutions that do not match the locks they open.
 */
export function validateRoom(room: RoomDef): string[] {
  const errors: string[] = []
  const err = (m: string) => errors.push(`${room.id}: ${m}`)
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) err(`duplicate ${kind} id "${id}"`)
      seen.add(id)
    }
    return seen
  }
  const scenes = dup('scene', room.scenes.map((s) => s.id))
  const hotspots = dup('hotspot', room.hotspots.map((h) => h.id))
  const items = dup('item', room.items.map((i) => i.id))
  const notes = dup('notebook', (room.notebookEntries ?? []).map((n) => n.id))
  dup('puzzle', (room.puzzles ?? []).map((p) => p.id))

  const needNote = (where: string, id: string | undefined) => id && !notes.has(id) && err(`${where}: notebook entry "${id}" does not exist`)
  const needItem = (where: string, id: string) => !items.has(id) && err(`${where}: item "${id}" does not exist`)
  const effect = (where: string, e: Effect) => {
    for (const i of [...(e.giveItems ?? []), ...(e.removeItems ?? [])]) needItem(where, i)
    for (const n of e.notebook ?? []) needNote(where, n)
  }
  const lockOk = (where: string, l: LockDef) => {
    if ((l.kind === 'choice' || l.kind === 'sequence' || l.kind === 'multi') && l.options.length) {
      const ids = new Set(l.options.map((o) => o.id))
      const answers = l.kind === 'choice' ? [l.answer] : l.answer
      for (const a of answers) if (!ids.has(a)) err(`${where}: answer "${a}" is not an option`)
      if (l.kind === 'choice') for (const k of Object.keys(l.feedback ?? {})) if (!ids.has(k)) err(`${where}: feedback for unknown option "${k}"`)
    }
    if (l.kind === 'accuse') {
      const ev = new Set(l.evidence.map((o) => o.id))
      if (!l.suspects.some((s) => s.id === l.answer)) err(`${where}: answer "${l.answer}" is not a suspect`)
      for (const r of l.required) if (!ev.has(r)) err(`${where}: required evidence "${r}" is not offered`)
    }
  }

  for (const s of room.scenes) if (s.visibleWhen?.some((c) => !c)) err(`scene ${s.id}: empty condition`)
  for (const h of room.hotspots) {
    if (!scenes.has(h.scene)) err(`hotspot ${h.id}: scene "${h.scene}" does not exist`)
    h.interactions.forEach((it: Interaction, i) => {
      const where = `hotspot ${h.id} #${i}`
      if ('note' in it) needNote(where, it.note.notebook)
      if (it.type === 'take' || it.type === 'needItem') needItem(where, it.item)
      if (it.type === 'reveal' && it.item) needItem(where, it.item)
      if (it.type === 'lock') {
        effect(where, it.onSolve)
        lockOk(where, it.lock)
      }
      if (it.type === 'needItem') effect(where, it.onUse)
      if (it.type === 'reveal') effect(where, it.onReveal)
      if (it.type === 'action') effect(where, it.onAct)
    })
  }
  for (const i of room.items) needNote(`item ${i.id}`, i.note.notebook)
  for (const c of room.combos ?? []) for (const id of [c.a, c.b, c.result]) needItem(`combo ${c.a}+${c.b}`, id)
  for (const p of room.loop?.persist ?? []) if (!hotspots.has(p)) err(`loop.persist: hotspot "${p}" does not exist`)
  for (const w of room.walkthrough) {
    const a = walkAction(w) as { hotspot?: string; item?: string; a?: string; b?: string }
    if (a.hotspot && !hotspots.has(a.hotspot)) err(`walkthrough: hotspot "${a.hotspot}" does not exist`)
    for (const i of [a.item, a.a, a.b]) if (i) needItem('walkthrough', i)
  }

  // play the solution: every step accepted, every puzzle reached, in order, never before it is available
  let s: GameState = newGame(room)
  let n = 0
  const act = (body: Record<string, unknown>, now: number) => ({ id: `v${++n}`, by: { nick: 'בדיקה', avatar: '🤖' }, now, ...body }) as Action
  s = reduce(room, s, act({ type: 'START' }, 0)).state
  const puzzles = room.puzzles ?? []
  const doneAt = new Map<string, number>()
  let t = 0
  room.walkthrough.forEach((w, i) => {
    const before = s
    const r = reduce(room, s, act(walkAction(w), (t += 30_000)))
    if (r.outcome !== 'ok') err(`walkthrough step ${i + 1} (${JSON.stringify(w)}) was ${r.outcome}`)
    s = r.state
    for (const p of puzzles) {
      if (doneAt.has(p.id) || !holds(s.flags, [p.doneWhen])) continue
      doneAt.set(p.id, i)
      if (!holds(before.flags, p.availableWhen)) err(`puzzle ${p.id} is solved before it is available (dependency cycle?)`)
    }
  })
  if (s.phase !== 'escaped') err('the walkthrough does not escape')
  let last = -1
  for (const p of puzzles) {
    const at = doneAt.get(p.id)
    if (at === undefined) err(`puzzle ${p.id} is never reached by the solution (unreachable)`)
    else if (at < last) err(`puzzle ${p.id} is reached before the puzzle listed before it`)
    else last = at
  }
  // the developer solution text names the actual answers of digit / word locks
  for (const p of puzzles) {
    const m = /^solved:(.+)$/.exec(p.doneWhen)
    const h = m ? room.hotspots.find((x) => x.id === m[1]) : p.doneWhen === 'escaped' ? room.hotspots.find((x) => x.interactions.some((y) => y.type === 'lock' && y.onSolve.escape)) : undefined
    const lock = h?.interactions.find((x) => x.type === 'lock')
    if (lock?.type === 'lock') {
      const l = lock.lock
      const want = l.kind === 'digits' ? l.answer : l.kind === 'terminal' ? l.answers[0] : null
      if (want && !p.solution.includes(want)) err(`puzzle ${p.id}: solution "${p.solution}" does not match the lock answer "${want}"`)
    }
    if (p.hints.some((x) => !x.trim())) err(`puzzle ${p.id}: empty hint`)
  }
  return errors
}
