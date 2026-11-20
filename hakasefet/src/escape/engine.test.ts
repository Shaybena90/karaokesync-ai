import { describe, expect, it } from 'vitest'
import { ROOMS, getRoom } from './rooms'
import { currentInteraction, elapsedMs, hintsLeft, LEVEL_IDS, LEVELS, nextHintIndex, newGame, normalizeText, reduce, remainingMs, stars, type Action, type GameState, type Level } from './engine'
import type { RoomDef, WalkStep } from './types'
import { walkAction } from './walk'

const who = { nick: 'דנה', avatar: '🦊' }
let n = 0
const act = (a: Record<string, unknown>, now = 1000): Action => ({ id: `a${++n}`, by: who, now, ...a }) as Action
const stepToAction = (s: WalkStep, now: number): Action => act(walkAction(s), now)

function started(room: RoomDef, level: Level = 'medium'): GameState {
  const lobby = reduce(room, newGame(room), act({ type: 'SET_LEVEL', level }, 0)).state
  return reduce(room, lobby, act({ type: 'START' }, 0)).state
}

describe.each(ROOMS.map((r) => [r.id, r] as const))('room %s', (_id, room) => {
  it('content is consistent', () => {
    const scenes = new Set(room.scenes.map((s) => s.id))
    const items = new Set(room.items.map((i) => i.id))
    const ids = new Set<string>()
    for (const h of room.hotspots) {
      expect(ids.has(h.id), `duplicate hotspot ${h.id}`).toBe(false)
      ids.add(h.id)
      expect(scenes.has(h.scene), `${h.id} scene`).toBe(true)
      expect(h.x + h.w).toBeLessThanOrEqual(800)
      expect(h.y + h.h).toBeLessThanOrEqual(600)
      expect(h.interactions.length).toBeGreaterThan(0)
      for (const it of h.interactions) {
        if (it.type === 'take' || it.type === 'needItem') expect(items.has(it.item), `${h.id} item ${it.item}`).toBe(true)
        if (it.type === 'reveal') {
          if (it.item) expect(items.has(it.item), `${h.id} reveal tool ${it.item}`).toBe(true)
          expect(it.hidden.trim().length).toBeGreaterThan(1)
        }
        if (it.type === 'lock') {
          const l = it.lock
          if (l.kind === 'digits') expect(l.answer).toMatch(new RegExp(`^\\d{${l.length}}$`))
          if (l.kind === 'letters') expect(normalizeText(l.answer).length).toBe(l.length)
          if (l.kind === 'colors') for (const c of l.answer) expect(l.options).toContain(c)
          if (l.kind === 'switches') expect(l.answer.length).toBe(l.count)
          if (l.kind === 'tuner') expect(l.answer >= l.min && l.answer <= l.max).toBe(true)
          for (const e of [it.onSolve]) for (const i of [...(e.giveItems ?? []), ...(e.removeItems ?? [])]) expect(items.has(i)).toBe(true)
        }
        if (it.type === 'needItem') for (const i of [...(it.onUse.giveItems ?? []), ...(it.onUse.removeItems ?? [])]) expect(items.has(i)).toBe(true)
      }
      // the last interaction must be unconditional, so every object always responds
      expect(h.interactions[h.interactions.length - 1].when ?? [], `${h.id} needs a fallback`).toEqual([])
    }
    expect(room.story.length).toBeGreaterThan(20)
  })

  it.each(LEVEL_IDS)('the walkthrough escapes on the %s level, with every step accepted', (level) => {
    let s = started(room, level)
    let t = 0
    for (const step of room.walkthrough) {
      const r = reduce(room, s, stepToAction(step, (t += 30_000)))
      expect(r.outcome, JSON.stringify(step)).toBe('ok')
      s = r.state
    }
    expect(s.phase).toBe('escaped')
    expect(s.flags).toContain('escaped')
    expect(s.level).toBe(level)
    expect(elapsedMs(s, 999_999_999)).toBe(t)
  })

  it('every note has text, and level variants only where meaningful', () => {
    const notes = [...room.hotspots.flatMap((h) => h.interactions.flatMap((i) => ('note' in i ? [i.note] : []))), ...room.items.map((i) => i.note)]
    for (const n of notes) {
      expect(n.text.trim().length).toBeGreaterThan(3)
      if (n.easy) expect(n.easy).not.toBe(n.text)
      if (n.hard) expect(n.hard).not.toBe(n.text)
    }
  })

  it('every hint becomes relevant and is eventually resolved by the walkthrough', () => {
    let s = started(room)
    const seen = new Set<number>()
    for (const step of room.walkthrough) {
      const i = nextHintIndex(room, s)
      if (i >= 0) seen.add(i)
      s = reduce(room, s, stepToAction(step, 1)).state
    }
    // hints are reachable along the solution
    for (let i = 0; i < room.hints.length; i++) {
      let s2 = started(room)
      let reached = false
      for (const step of room.walkthrough) {
        const h = room.hints[i]
        const flags = new Set(s2.flags)
        if (!flags.has(h.until) && (h.after ?? []).every((f) => flags.has(f))) reached = true
        s2 = reduce(room, s2, stepToAction(step, 1)).state
      }
      expect(reached, `hint ${i} never applies`).toBe(true)
      expect(s2.flags).toContain(room.hints[i].until)
    }
  })

  it('wrong answers are rejected and counted', () => {
    const s = started(room)
    const lockStep = room.walkthrough.find((w) => 'solve' in w && room.hotspots.find((h) => h.id === w.solve)!.interactions[0].when?.length !== 0) as { solve: string; input: string }
    const target = lockStep ?? (room.walkthrough.find((w) => 'solve' in w) as { solve: string; input: string })
    const h = room.hotspots.find((x) => x.id === target.solve)!
    if (currentInteraction(h, s.flags)?.type !== 'lock') return
    const r = reduce(room, s, act({ type: 'SOLVE', hotspot: target.solve, input: 'nope' }))
    expect(r.outcome).toBe('wrong')
    expect(r.state.wrongAttempts).toBe(1)
    expect(r.state.flags).not.toContain(`solved:${target.solve}`)
  })
})

describe('engine rules', () => {
  const lab = getRoom('lab')!

  it('the same action is applied only once (double tap / repeated delivery)', () => {
    const s = started(lab)
    const a = act({ type: 'SOLVE', hotspot: 'drawer', input: '745' })
    const first = reduce(lab, s, a)
    const again = reduce(lab, first.state, a)
    expect(again.state).toBe(first.state)
    expect(again.outcome).toBe('ok')
  })

  it('locked steps need their prerequisites', () => {
    const s = started(lab)
    expect(reduce(lab, s, act({ type: 'SOLVE', hotspot: 'terminal', input: 'אורה' })).outcome).toBe('invalid') // no power yet
    expect(reduce(lab, s, act({ type: 'USE', hotspot: 'door', item: 'keycard' })).outcome).toBe('invalid') // no card in inventory
    expect(reduce(lab, newGame(lab), act({ type: 'SOLVE', hotspot: 'drawer', input: '745' })).outcome).toBe('invalid') // not started
  })

  it('using the wrong item is a harmless miss', () => {
    let s = started(lab)
    s = reduce(lab, s, act({ type: 'SOLVE', hotspot: 'drawer', input: '745' })).state
    s = reduce(lab, s, act({ type: 'TAKE', hotspot: 'drawer' })).state
    const r = reduce(lab, s, act({ type: 'USE', hotspot: 'vent', item: 'uv' }))
    expect(r.outcome).toBe('wrong')
    expect(r.state.inventory).toContain('uv')
  })

  it('items are consumed and given as the room says', () => {
    let s = started(lab)
    s = reduce(lab, s, act({ type: 'SOLVE', hotspot: 'mixer', input: 'red,green,blue,yellow' })).state
    expect(s.inventory).toEqual(['screwdriver'])
    s = reduce(lab, s, act({ type: 'USE', hotspot: 'vent', item: 'screwdriver' })).state
    expect(s.inventory).toEqual(['fuse'])
  })

  it('letters ignore final forms and niqqud; terminals accept listed answers', () => {
    const station = getRoom('station')!
    let s = started(station)
    expect(reduce(station, s, act({ type: 'SOLVE', hotspot: 'locker', input: 'מאדימ' })).outcome).toBe('ok')
    s = started(lab)
    for (const step of lab.walkthrough.slice(0, 6)) s = reduce(lab, s, stepToAction(step, 1)).state
    expect(reduce(lab, s, act({ type: 'SOLVE', hotspot: 'terminal', input: '  פרויקט אורה ' })).outcome).toBe('ok')
  })

  it('hints follow progress and cost time by level', () => {
    let s = started(lab)
    s = reduce(lab, s, act({ type: 'HINT' })).state
    expect(s.hintsShown).toEqual([0])
    expect(s.penaltyMs).toBe(LEVELS.medium.hintPenaltyMs)
    s = reduce(lab, s, act({ type: 'HINT' })).state
    expect(s.hintsShown).toEqual([0, 1])
    // 'after' conditions: the screwdriver hint only appears once you have it
    expect(nextHintIndex(lab, s)).toBe(-1)
  })

  it('stars by time, relative to the level\'s clock', () => {
    expect(stars('medium', 29 * 60_000)).toBe(3) // 50 min clock: 60% = 30 min
    expect(stars('medium', 40 * 60_000)).toBe(2)
    expect(stars('medium', 49 * 60_000)).toBe(1)
    expect(stars('medium', 51 * 60_000)).toBe(0)
    expect(stars('hard', 23 * 60_000)).toBe(3)
  })

  it('levels: the clock, hint price and hint limit follow the chosen level', () => {
    const easy = started(lab, 'easy')
    expect(remainingMs(lab, easy, 0)).toBe(60 * 60_000)
    expect(easy.flags).toContain('level:easy')
    expect(reduce(lab, easy, act({ type: 'HINT' })).state.penaltyMs).toBe(30_000)

    const ayalon = getRoom('ayalon')!
    let hard = started(ayalon, 'hard')
    expect(remainingMs(ayalon, hard, 0)).toBe(40 * 60_000)
    for (let i = 0; i < 3; i++) hard = reduce(ayalon, hard, act({ type: 'HINT' })).state
    expect(hard.hintsShown.length).toBe(3)
    expect(hard.penaltyMs).toBe(3 * 120_000)
    expect(hintsLeft(hard)).toBe(0)
    expect(nextHintIndex(ayalon, hard)).not.toBe(-1) // more hints exist, but the limit is reached
    expect(reduce(ayalon, hard, act({ type: 'HINT' })).outcome).toBe('invalid')
  })

  it('the level can only change in the lobby; old saves default to medium', () => {
    const s = started(lab)
    expect(reduce(lab, s, act({ type: 'SET_LEVEL', level: 'easy' })).outcome).toBe('invalid')
    const old = { ...newGame(lab), level: undefined }
    const st = reduce(lab, old, act({ type: 'START' })).state
    expect(st.level).toBe('medium')
  })
})
