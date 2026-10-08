import { expect, test } from 'claude-code/testing'

import type { Bests, Saved, TurnFacts } from '../types'
import { countEvent, zeroCounts } from './ledger'
import { USAGE, activeBuddy, applyChange, classify, migrate, parseSub } from './record'
import type { Change } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
const V1 = { schema: 1 as const, seed: 's', soul: SOUL, mode: 'muted' as const, rerolls: 3 }
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const FACTS: TurnFacts = { reason: 'answer', durationMs: 4_000, calls: 3, failRun: 0, failRunGroup: null, afterRough: 0 }

test('subcommands', () => {
  expect(parseSub('')).toBe('show')
  expect(parseSub('  pet ')).toBe('pet')
  expect(parseSub('CARD')).toBe('card')
  expect(parseSub('journal')).toBe('journal')
  expect(parseSub('journal all')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]')
  expect(parseSub('mute')).toBe('mute')
  expect(parseSub('unmute')).toBe('unmute')
  expect(parseSub('off')).toBe('off')
  expect(parseSub('reroll')).toBe('reroll')
  expect(parseSub('reroll confirm')).toBe('reroll-confirm')
  expect(parseSub('reroll now')).toBe('usage')
  expect(parseSub('pet twice')).toBe('usage')
  expect(parseSub('dance')).toBe('usage')
})

test('debug is a subcommand the usage line never mentions', () => {
  expect(parseSub('debug')).toBe('debug')
  expect(parseSub(' DEBUG off ')).toBe('debug-off')
  expect(parseSub('debug now')).toBe('usage')
  expect(USAGE).not.toMatch(/debug/)
})

test('schemas 1 and 2 are ours; a schema 2 record without its active buddy is damaged', () => {
  expect(classify(undefined)).toEqual({ kind: 'none' })
  expect(classify(null)).toEqual({ kind: 'none' })
  expect(classify(V1)).toEqual({ kind: 'ok', saved: migrate(V1) })
  const saved = migrate(V1)
  expect(classify(saved)).toEqual({ kind: 'ok', saved })
  expect(classify({ ...saved, active: 'gone' })).toEqual({ kind: 'damaged' })
  expect(classify({ schema: 2 })).toEqual({ kind: 'damaged' })
  expect(classify({ schema: 3, seed: 'x' })).toEqual({ kind: 'foreign', schema: '3' })
  expect(classify('junk')).toEqual({ kind: 'foreign', schema: 'unknown' })
})

test('migration keeps the buddy and starts its counts and the streak at zero', () => {
  expect(migrate(V1)).toEqual({
    schema: 2,
    mode: 'muted',
    rerolls: 3,
    active: 's',
    buddies: [{ seed: 's', soul: SOUL, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
  })
})

test('a first hatch starts a record on, with today as its first visit', () => {
  expect(applyChange(null, { kind: 'hatch', seed: 'h', soul: SOUL }, NOON)).toMatchObject({
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'h',
    buddies: [{ seed: 'h', retiredAt: null }],
    you: { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 },
  })
})

test('a reroll retires the active buddy and appends the new one', () => {
  const saved = applyChange(migrate(V1), { kind: 'reroll', seed: 'n', soul: { ...SOUL, name: 'Bix' } }, NOON)!
  expect(saved.buddies.map(b => b.seed)).toEqual(['s', 'n'])
  expect(saved.buddies[0]?.retiredAt).toBe(new Date(NOON).toISOString())
  expect(saved.buddies[1]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: 'n', rerolls: 4, mode: 'on' })
  expect(activeBuddy(saved).soul.name).toBe('Bix')
})

test('a hatch onto a stored record keeps the buddy already there without counting a reroll', () => {
  const saved = applyChange(migrate(V1), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)!
  expect(saved.buddies.map(b => b.seed)).toEqual(['s', 'n'])
  expect(saved).toMatchObject({ active: 'n', rerolls: 3 })
})

test('a flush adds counts by seed, drops unknown seeds, and records the visit', () => {
  const one = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 1_000 })
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: { s: one, gone: one } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).counts.turns).toBe(1)
  expect(saved.you).toMatchObject({ lastDay: '2026-10-07', streak: 1 })
})

test('mode changes; a flush or visit with nothing new writes nothing', () => {
  const visited = applyChange(migrate(V1), { kind: 'visit' }, NOON)!
  expect(visited.you.lastDay).toBe('2026-10-07')
  expect(applyChange(visited, { kind: 'mode', mode: 'off' }, NOON)?.mode).toBe('off')
  expect(applyChange(visited, { kind: 'visit' }, NOON)).toBeNull()
  expect(applyChange(visited, { kind: 'flush', pending: {} }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'flush', pending: {} }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'visit' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'mode', mode: 'off' }, NOON)).toBeNull()
})

test('fields this build does not know survive every change', () => {
  const base = migrate(V1)
  const future = {
    ...base,
    journal: ['x'],
    you: { ...base.you, hats: ['crown'] },
    buddies: base.buddies.map(b => ({ ...b, xp: 7 })),
  } as Saved
  const changes: Change[] = [
    { kind: 'mode', mode: 'off' },
    { kind: 'flush', pending: { s: countEvent(zeroCounts(), { kind: 'pet' }) } },
    { kind: 'flush', pending: {}, mood: { s: ['fail'] } },
    { kind: 'flush', pending: {}, turns: { s: [{ ...FACTS, failRun: 6 }] } },
    { kind: 'visit' },
    { kind: 'reroll', seed: 'n', soul: SOUL },
  ]
  for (const change of changes) {
    const after = applyChange(future, change, NOON) as unknown as { buddies: unknown[] }
    expect(after).toMatchObject({ journal: ['x'], you: { hats: ['crown'] } })
    expect(after.buddies[0]).toMatchObject({ xp: 7 })
  }
})

test('a flush applies mood events to the right buddy and drops an unknown seed', () => {
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: {}, mood: { s: ['fail', 'fail'], gone: ['fail'] } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).mood).toEqual({ meter: -2, sulk: 0, at: new Date(NOON).toISOString() })
  expect(activeBuddy(saved).counts).toEqual(zeroCounts())
})

test("a flush builds on the stored mood, another session's included", () => {
  const base = migrate(V1)
  const theirs: Saved = {
    ...base,
    buddies: base.buddies.map(b => ({ ...b, mood: { meter: -3, sulk: 0, at: new Date(NOON).toISOString() } })),
  }
  const saved = applyChange(theirs, { kind: 'flush', pending: {}, mood: { s: ['clean'] } }, NOON)!
  expect(activeBuddy(saved).mood?.meter).toBe(-2)
})

test('a new day after two or more missed ones leaves the active buddy sulking', () => {
  // 2026-10-02 to 2026-10-07 misses four days: sulk 3.
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const visited = applyChange(away, { kind: 'visit' }, NOON)!
  expect(activeBuddy(visited).mood).toMatchObject({ sulk: 3 })
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).mood).toMatchObject({ sulk: 3 })
  // Yesterday leaves no sulk, and a second visit the same day changes nothing.
  const yesterday: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-06' } }
  expect(activeBuddy(applyChange(yesterday, { kind: 'visit' }, NOON)!).mood).toBeUndefined()
  expect(applyChange(visited, { kind: 'visit' }, NOON)).toBeNull()
})

test("a reroll after days away leaves the sulk with the buddy left alone, and the new one starts neutral", () => {
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  // The first save after it finds the visit already made, so it moves no mood.
  const flushed = applyChange(rerolled, { kind: 'flush', pending: {}, mood: { n: ['longClean'] } }, NOON)!
  expect(flushed.buddies[0]?.mood).toMatchObject({ sulk: 3 })
  expect(activeBuddy(flushed).mood).toMatchObject({ meter: 1, sulk: 0 })
  expect(flushed.you.lastDay).toBe('2026-10-07')
})

test('a pet in the flush that sets the sulk still eases it by one step', () => {
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const saved = applyChange(away, { kind: 'flush', pending: {}, mood: { s: ['soothe'] } }, NOON)!
  expect(activeBuddy(saved).mood).toMatchObject({ sulk: 2 })
})

test('a flush notices turns against the stored bests, saves the bests, and drops an unknown seed', () => {
  const run: TurnFacts = { ...FACTS, failRun: 6, failRunGroup: 'shell' }
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: {}, turns: { s: [run], gone: [run] } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).journal).toEqual([{ at: AT, kind: 'failRun', n: 6, group: 'shell' }])
  expect(activeBuddy(saved).bests).toEqual({ failRun: 6, calls: 3 })
  // The same turn again sets no new record.
  const again = applyChange(saved, { kind: 'flush', pending: {}, turns: { s: [run] } }, NOON)!
  expect(activeBuddy(again).journal).toHaveLength(1)
})

test('bests fields a newer build wrote survive a flush', () => {
  const base = migrate(V1)
  const future = {
    ...base,
    buddies: base.buddies.map(b => ({ ...b, bests: { failRun: 1, calls: 1, slowest: 2 } })),
  } as Saved
  const saved = applyChange(future, { kind: 'flush', pending: {}, turns: { s: [FACTS] } }, NOON)!
  expect(activeBuddy(saved).bests).toEqual({ failRun: 1, calls: 3, slowest: 2 } as Bests)
})

test('a flush that reaches turn 100 logs the milestone after the turn moments', () => {
  const base = migrate(V1)
  const near: Saved = { ...base, buddies: base.buddies.map(b => ({ ...b, counts: { ...b.counts, turns: 99 } })) }
  const long = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 700_000 })
  const change: Change = { kind: 'flush', pending: { s: long }, turns: { s: [{ ...FACTS, durationMs: 700_000 }] } }
  expect(activeBuddy(applyChange(near, change, NOON)!).journal).toEqual([
    { at: AT, kind: 'longTurn', n: 11 },
    { at: AT, kind: 'turns', n: 100 },
  ])
})

test('a new day after three or more missed days writes "away" on the buddy left alone', () => {
  // 2026-10-02 to 2026-10-07 is 5 days.
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const moment = [{ at: AT, kind: 'away', n: 5 }]
  expect(activeBuddy(applyChange(away, { kind: 'visit' }, NOON)!).journal).toEqual(moment)
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).journal).toEqual(moment)
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  expect(rerolled.buddies[0]?.journal).toEqual(moment)
  expect(activeBuddy(rerolled).journal).toBeUndefined()
  // Two missed days leave a sulk but no moment.
  const weekend: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-04' } }
  expect(activeBuddy(applyChange(weekend, { kind: 'visit' }, NOON)!).journal).toBeUndefined()
})
