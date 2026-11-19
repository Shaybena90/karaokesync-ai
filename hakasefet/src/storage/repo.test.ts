import { beforeEach, describe, expect, it } from 'vitest'
import { packV1 } from '../content/v1'
import { createAttempt, currentQuestion, makeCtx, reduce, type Action, type Attempt } from '../engine/attempt'
import { mysteryForDate } from '../engine/selection'
import { closeDb, DB_NAME, openDb } from './db'
import { buyOrEquip, completeAttempt, createProfile, getActiveAttempt, getProfile, listLedger, listMistakes, recordPractice, resetAll, saveAttempt } from './repo'

const DATE = '2026-11-19'
const mystery = mysteryForDate(packV1, DATE)
const ctx = makeCtx(packV1, mystery.id)
const T0 = Date.parse('2026-11-19T10:00:00Z')

function solved(id: string, mode: Attempt['mode'], level: 'normal' | 'hard', wrongFirst = false): Attempt {
  let a = createAttempt({ id, mode, contentVersion: packV1.version, vaultDate: DATE, mysteryId: mystery.id, now: T0 })
  const run = (x: Action) => (a = reduce(a, x, ctx))
  run({ type: 'SELECT_LEVEL', level, now: T0 })
  let t = T0
  for (const cat of ['sports', 'music', 'general'] as const) {
    run({ type: 'ENTER_ROOM', category: cat, now: ++t })
    for (let i = 0; i < 2; i++) {
      const q = currentQuestion(a)!
      const right = ctx.question(q.questionId).answerId
      const pick = wrongFirst && cat === 'sports' && i === 0 ? q.optionOrder.find((o) => o !== right)! : right
      run({ type: 'ANSWER', optionId: pick, now: (t += 1000) })
      run({ type: 'CONTINUE', now: ++t })
    }
    run({ type: 'CLOSE_CLUE', now: ++t })
  }
  run({ type: 'SUBMIT_CODE', code: mystery.code, now: ++t })
  return a
}

beforeEach(async () => {
  await resetAll()
  await createProfile('בודק', '🦊', T0)
})

describe('storage', () => {
  it('saves and restores an in-progress attempt', async () => {
    let a = createAttempt({ id: 'x', mode: 'daily', contentVersion: packV1.version, vaultDate: DATE, mysteryId: mystery.id, now: T0 })
    a = reduce(a, { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, ctx)
    a = reduce(a, { type: 'ENTER_ROOM', category: 'music', now: T0 }, ctx)
    await saveAttempt(a)
    expect(await getActiveAttempt()).toEqual(a)
    // An older copy (other tab) never overwrites newer progress.
    await saveAttempt({ ...a, phase: 'map', updatedAt: a.updatedAt - 1 })
    expect((await getActiveAttempt())!.phase).toBe('question')
  })

  it('daily reward is granted once, even with two tabs finishing at the same time', async () => {
    const a = solved('tab-a', 'daily', 'normal')
    const b = solved('tab-b', 'daily', 'hard') // other level, same vault date
    const [ra, rb] = await Promise.all([completeAttempt(a), completeAttempt(b)])
    expect(ra.grants.length + rb.grants.length).toBe(1)
    const p = (await getProfile())!
    expect(p.xp).toBe(100)
    expect(p.coins).toBe(20)
    // Refresh → completing the same attempt again changes nothing.
    const again = await completeAttempt(a)
    expect(again.alreadyRecorded).toBe(true)
    expect((await getProfile())!.coins).toBe(20)
    expect((await listLedger()).length).toBe(1)
  })

  it('archive replays give no reward but can set a personal best', async () => {
    const r = await completeAttempt(solved('arc', 'archive', 'normal'))
    expect(r.grants).toEqual([])
    expect(r.isBest).toBe(true)
    expect((await getProfile())!.xp).toBe(0)
  })

  it('records mistakes once per attempt and tracks fixes', async () => {
    const a = solved('m', 'daily', 'normal', true)
    await saveAttempt(a)
    await saveAttempt(a)
    const [m] = await listMistakes()
    expect(m.timesWrong).toBe(1)
    await recordPractice(m.questionId, false)
    expect((await listMistakes())[0].fixedAt).toBeUndefined()
    await recordPractice(m.questionId, true, T0 + 5)
    expect((await listMistakes())[0]).toMatchObject({ practiceTries: 2, fixedAt: T0 + 5 })
  })

  it('buying an item charges once; buying again just equips', async () => {
    await completeAttempt(solved('c', 'daily', 'normal')) // 20 coins
    expect(await buyOrEquip('plant-cactus', 'plant', 30)).toEqual({ ok: false, reason: 'coins' })
    const first = await buyOrEquip('plant-cactus-mini', 'plant', 20)
    expect(first.ok && first.charged).toBe(20)
    const second = await buyOrEquip('plant-cactus-mini', 'plant', 20)
    expect(second.ok && second.charged).toBe(0)
    expect((await getProfile())!.coins).toBe(0)
  })

  it('migrates a v1 database to the current schema without losing data', async () => {
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
    expect([...db.objectStoreNames]).toContain('history')
    expect((await getProfile())!.nickname).toBe('ותיק')
  })
})
