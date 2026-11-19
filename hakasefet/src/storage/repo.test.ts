import { beforeEach, describe, expect, it } from 'vitest'
import { getRoom } from '../escape/rooms'
import { newGame, reduce, type Action, type GameState } from '../escape/engine'
import type { WalkStep } from '../escape/types'
import { closeDb, DB_NAME, openDb } from './db'
import { buyOrEquip, completeRun, createProfile, getProfile, listLedger, listRuns, resetAll } from './repo'

const T0 = Date.parse('2026-11-19T10:00:00Z')
let n = 0
function escaped(roomId: string, start = T0, stepMs = 20_000): GameState {
  const room = getRoom(roomId)!
  const a = (x: Record<string, unknown>, now: number) => ({ id: `x${++n}`, by: { nick: 'a', avatar: 'b' }, now, ...x }) as Action
  let s = reduce(room, newGame(room), a({ type: 'START' }, start)).state
  let t = start
  for (const w of room.walkthrough as WalkStep[]) {
    t += stepMs
    const x = 'take' in w ? { type: 'TAKE', hotspot: w.take } : 'solve' in w ? { type: 'SOLVE', hotspot: w.solve, input: w.input } : { type: 'USE', hotspot: w.use, item: w.item }
    s = reduce(room, s, a(x, t)).state
  }
  return s
}

beforeEach(async () => {
  await resetAll()
  await createProfile('בודק', '🦊', T0)
})

describe('runs and rewards', () => {
  it('first escape gives both rewards once, even from two tabs at the same time', async () => {
    const s = escaped('lab')
    const [a, b] = await Promise.all([completeRun({ runId: 'r1', state: s, mode: 'solo', players: 1 }), completeRun({ runId: 'r1', state: s, mode: 'solo', players: 1 })])
    expect(a.grants.length + (b.alreadyRecorded ? 0 : b.grants.length)).toBe(2)
    const p = (await getProfile())!
    expect(p.xp).toBe(170)
    expect(p.coins).toBe(50)
    expect((await listLedger()).length).toBe(2)
    const again = await completeRun({ runId: 'r1', state: s, mode: 'solo', players: 1 })
    expect(again.alreadyRecorded).toBe(true)
    expect((await getProfile())!.coins).toBe(50)
  })

  it('a replay is recorded as a new run without rewards, and can beat the best time', async () => {
    await completeRun({ runId: 'r1', state: escaped('lab', T0, 60_000), mode: 'solo', players: 1 })
    const faster = await completeRun({ runId: 'r2', state: escaped('lab', T0 + 3_600_000, 10_000), mode: 'coop', players: 3 })
    expect(faster.grants).toEqual([])
    expect(faster.isBest).toBe(true)
    expect(faster.run.stars).toBe(3)
    expect(faster.run.level).toBe('medium')
    expect((await listRuns()).length).toBe(2)
  })

  it('buying an item charges once; buying again just equips', async () => {
    await completeRun({ runId: 'r1', state: escaped('lab'), mode: 'solo', players: 1 }) // 30 + 20 = 50 coins
    expect(await buyOrEquip('lamp-chandelier', 'lamp', 70)).toEqual({ ok: false, reason: 'coins' })
    const first = await buyOrEquip('rug-royal', 'rug', 50)
    expect(first.ok && first.charged).toBe(50)
    const second = await buyOrEquip('rug-royal', 'rug', 50)
    expect(second.ok && second.charged).toBe(0)
    expect((await getProfile())!.coins).toBe(0)
  })

  it('migrates an older database (v1) to the current schema without losing the profile', async () => {
    await resetAll()
    const v1 = await openDb(indexedDB, 1)
    await new Promise<void>((res) => {
      const tx = v1.transaction('kv', 'readwrite')
      tx.objectStore('kv').put({ nickname: 'ותיק', avatar: '🦉', xp: 300, coins: 5, owned: [], equipped: {}, createdAt: 1 }, 'profile')
      tx.oncomplete = () => res()
    })
    v1.close()
    closeDb()
    const db = await openDb()
    expect(db.name).toBe(DB_NAME)
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['history', 'runs', 'ledger']))
    expect((await getProfile())!.nickname).toBe('ותיק')
  })
})
