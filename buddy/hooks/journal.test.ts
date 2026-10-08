import { expect, test } from 'claude-code/testing'

import type { Moment, TurnFacts } from '../types'
import {
  addCall, addMoments, awayMoment, bestsOf, isClean, isRough, mergeTurns, milestones, noCalls, noticeTurns, queueTurns,
  turnFacts,
} from './journal'
import { zeroCounts } from './ledger'

// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const FACTS: TurnFacts = { reason: 'answer', durationMs: 4_000, calls: 3, failRun: 0, failRunGroup: null, afterRough: 0 }
const NO_BESTS = { failRun: 0, calls: 0 }
const notice = (f: Partial<TurnFacts>) => noticeTurns([{ ...FACTS, ...f }], NO_BESTS, 0, NOON).moments

test('failed calls build a run; a success ends it, and a run across groups has none', () => {
  let t = noCalls()
  for (let i = 0; i < 3; i++) t = addCall(t, 'shell', true)
  t = addCall(t, 'read', false)
  t = addCall(t, 'shell', true)
  t = addCall(t, 'edit', true)
  expect(t.calls).toBe(6)
  expect(t.longest).toEqual({ n: 3, group: 'shell' })
  expect(t.run).toEqual({ n: 2, group: null })
  // A run as long as the longest leaves the first in place; a longer one takes over.
  t = addCall(t, 'edit', true)
  expect(t.longest).toEqual({ n: 3, group: 'shell' })
  t = addCall(t, 'edit', true)
  expect(t.longest).toEqual({ n: 4, group: null })
})

test("a turn's facts carry its longest run, and say whether it was rough or clean", () => {
  let t = noCalls()
  for (let i = 0; i < 5; i++) t = addCall(t, 'web', true)
  expect(turnFacts('answer', 9_000, t, 2)).toEqual({
    reason: 'answer',
    durationMs: 9_000,
    calls: 5,
    failRun: 5,
    failRunGroup: 'web',
    afterRough: 2,
  })
  expect(turnFacts('answer', 9_000, noCalls(), 0)).toMatchObject({ failRun: 0, failRunGroup: null })
  expect(isRough({ ...FACTS, failRun: 1 })).toBe(true)
  expect(isRough({ ...FACTS, reason: 'error' })).toBe(true)
  expect(isRough({ ...FACTS, reason: 'aborted' })).toBe(true)
  expect(isRough(FACTS)).toBe(false)
  expect(isRough({ ...FACTS, reason: 'refusal' })).toBe(false)
  expect(isClean(FACTS)).toBe(true)
  expect(isClean({ ...FACTS, reason: 'refusal' })).toBe(false)
  expect(isClean({ ...FACTS, failRun: 1 })).toBe(false)
})

test('each kind of turn moment is logged at its floor and not one under', () => {
  expect(notice({ failRun: 5, failRunGroup: 'shell' })).toEqual([{ at: AT, kind: 'failRun', n: 5, group: 'shell' }])
  expect(notice({ failRun: 4, failRunGroup: 'shell' })).toEqual([])
  expect(notice({ failRun: 6, failRunGroup: null })).toEqual([{ at: AT, kind: 'failRun', n: 6 }])
  expect(notice({ durationMs: 600_000 })).toEqual([{ at: AT, kind: 'longTurn', n: 10 }])
  expect(notice({ durationMs: 599_999 })).toEqual([])
  expect(notice({ calls: 50 })).toEqual([{ at: AT, kind: 'busyTurn', n: 50 }])
  expect(notice({ calls: 49 })).toEqual([])
  expect(notice({ afterRough: 3 })).toEqual([{ at: AT, kind: 'comeback', n: 3 }])
  expect(notice({ afterRough: 2 })).toEqual([])
  // A comeback must be clean itself.
  expect(notice({ afterRough: 3, reason: 'refusal' })).toEqual([])
  expect(notice({ afterRough: 3, failRun: 1 })).toEqual([])
  // One turn can set several, in this order.
  expect(notice({ failRun: 5, durationMs: 600_000, calls: 50 }).map(m => m.kind)).toEqual(['failRun', 'longTurn', 'busyTurn'])
})

test("a record must beat the buddy's best; the longest turn is the stored counts' own", () => {
  expect(noticeTurns([{ ...FACTS, failRun: 7 }], { failRun: 7, calls: 0 }, 0, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, calls: 80 }], { failRun: 0, calls: 80 }, 0, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, durationMs: 900_000 }], NO_BESTS, 900_000, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, durationMs: 900_001 }], NO_BESTS, 900_000, NOON).moments).toEqual([
    { at: AT, kind: 'longTurn', n: 15 },
  ])
  expect(bestsOf({})).toEqual(NO_BESTS)
  expect(bestsOf({ bests: { failRun: 3, calls: 40 } })).toEqual({ failRun: 3, calls: 40 })
})

test('two queued turns cannot both take one record, and bests rise below the floors too', () => {
  const twice = noticeTurns([{ ...FACTS, failRun: 6 }, { ...FACTS, failRun: 6 }], NO_BESTS, 0, NOON)
  expect(twice.moments).toHaveLength(1)
  expect(twice.bests).toEqual({ failRun: 6, calls: 3 })
  const longer = noticeTurns([{ ...FACTS, durationMs: 700_000 }, { ...FACTS, durationMs: 650_000 }], NO_BESTS, 0, NOON)
  expect(longer.moments).toHaveLength(1)
  expect(noticeTurns([{ ...FACTS, failRun: 2, calls: 9 }], NO_BESTS, 0, NOON)).toEqual({
    moments: [],
    bests: { failRun: 2, calls: 9 },
  })
})

test('milestones are the marks a save crosses, turns before calls', () => {
  const counts = (turns: number, shell: number) => ({ ...zeroCounts(), turns, calls: { ...zeroCounts().calls, shell } })
  expect(milestones(counts(99, 0), counts(100, 0), NOON)).toEqual([{ at: AT, kind: 'turns', n: 100 }])
  expect(milestones(counts(100, 0), counts(101, 0), NOON)).toEqual([])
  expect(milestones(counts(5, 999), counts(6, 1_000), NOON)).toEqual([{ at: AT, kind: 'calls', n: 1_000 }])
  expect(milestones(counts(99, 999), counts(1_000, 1_000), NOON)).toEqual([
    { at: AT, kind: 'turns', n: 100 },
    { at: AT, kind: 'turns', n: 1_000 },
    { at: AT, kind: 'calls', n: 1_000 },
  ])
})

test('a visit after three or more missed days is a moment; a weekend away is not', () => {
  expect(awayMoment(null, '2026-10-07', NOON)).toBeNull()
  expect(awayMoment('2026-10-04', '2026-10-07', NOON)).toBeNull()
  expect(awayMoment('2026-10-03', '2026-10-07', NOON)).toEqual({ at: AT, kind: 'away', n: 4 })
})

test('the journal keeps its newest 20, and the turn queue its newest 20 per seed', () => {
  const many: Moment[] = Array.from({ length: 19 }, (_, i) => ({ at: AT, kind: 'turns' as const, n: i }))
  const kept = addMoments(many, [
    { at: AT, kind: 'away', n: 9 },
    { at: AT, kind: 'away', n: 10 },
  ])
  expect(kept).toHaveLength(20)
  expect(kept[0]?.n).toBe(1)
  expect(kept.at(-1)).toEqual({ at: AT, kind: 'away', n: 10 })
  expect(addMoments(undefined, [])).toEqual([])
  const queued = queueTurns(undefined, Array.from({ length: 25 }, (_, i) => ({ ...FACTS, calls: i })))
  expect(queued).toHaveLength(20)
  expect(queued[0]?.calls).toBe(5)
  const one = { ...FACTS, calls: 1 }
  const two = { ...FACTS, calls: 2 }
  expect(mergeTurns({ s: [one] }, { s: [two], t: [FACTS] })).toEqual({ s: [one, two], t: [FACTS] })
})
