import { expect, test } from 'claude-code/testing'

import type { Bests, Saved, TurnFacts } from '../types'
import { countEvent, zeroCounts } from './ledger'
import { USAGE, activeBuddy, applyChange, classify, findBuddy, migrate, parseSub, shownBuddy, targetOf } from './record'
import type { Change } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
const V1 = { schema: 1 as const, seed: 's', soul: SOUL, mode: 'muted' as const, rerolls: 3 }
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const FACTS: TurnFacts = { reason: 'answer', durationMs: 4_000, calls: 3, failRun: 0, failRunGroup: null, afterRough: 0 }

const sub = (args: string) => parseSub(args).sub

test('subcommands', () => {
  expect(parseSub('')).toEqual({ sub: 'show' })
  expect(sub('  pet ')).toBe('pet')
  expect(sub('CARD')).toBe('card')
  expect(sub('journal')).toBe('journal')
  expect(sub('dex')).toBe('dex')
  expect(sub('dex all')).toBe('usage')
  expect(parseSub('card #2')).toEqual({ sub: 'card', target: '#2' })
  expect(parseSub('Journal Pip')).toEqual({ sub: 'journal', target: 'Pip' })
  expect(sub('card Pip twice')).toBe('usage')
  expect(parseSub('swap #2')).toEqual({ sub: 'swap', target: '#2' })
  expect(sub('swap')).toBe('usage')
  expect(sub('swap Pip now')).toBe('usage')
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]',
  )
  expect(sub('mute')).toBe('mute')
  expect(sub('unmute')).toBe('unmute')
  expect(sub('off')).toBe('off')
  expect(sub('reroll')).toBe('reroll')
  expect(sub('reroll confirm')).toBe('reroll-confirm')
  expect(sub('reroll now')).toBe('usage')
  expect(sub('pet twice')).toBe('usage')
  expect(sub('dance')).toBe('usage')
})

test('debug is a subcommand the usage line never mentions, and can tour one stage', () => {
  expect(parseSub('debug')).toEqual({ sub: 'debug' })
  expect(parseSub(' DEBUG off ')).toEqual({ sub: 'debug-off' })
  expect(parseSub('debug Hatchling')).toEqual({ sub: 'debug', stage: 'hatchling' })
  expect(parseSub('debug adult')).toEqual({ sub: 'debug', stage: 'adult' })
  expect(parseSub('debug elder')).toEqual({ sub: 'debug', stage: 'elder' })
  expect(parseSub('debug now')).toEqual({ sub: 'usage' })
  expect(parseSub('debug elder off')).toEqual({ sub: 'usage' })
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
  expect(activeBuddy(saved).bests).toEqual({ failRun: 6, calls: 3, rough: 0 })
  // The same turn again sets no new record.
  const again = applyChange(saved, { kind: 'flush', pending: {}, turns: { s: [run] } }, NOON)!
  expect(activeBuddy(again).journal).toHaveLength(1)
})

test('a comeback is judged against the stored rough best, across flushes', () => {
  const clean = (afterRough: number): TurnFacts => ({ ...FACTS, afterRough })
  const flush = (saved: Saved, afterRough: number) =>
    applyChange(saved, { kind: 'flush', pending: {}, turns: { s: [clean(afterRough)] } }, NOON)!
  const first = flush(migrate(V1), 4)
  expect(activeBuddy(first).journal).toEqual([{ at: AT, kind: 'comeback', n: 4 }])
  expect(activeBuddy(first).bests).toEqual({ failRun: 0, calls: 3, rough: 4 })
  // The same number again is no record; a longer run is.
  expect(activeBuddy(flush(first, 4)).journal).toHaveLength(1)
  expect(activeBuddy(flush(first, 5)).journal?.map(m => m.n)).toEqual([4, 5])
})

test('bests fields a newer build wrote survive a flush', () => {
  const base = migrate(V1)
  const future = {
    ...base,
    buddies: base.buddies.map(b => ({ ...b, bests: { failRun: 1, calls: 1, rough: 1, slowest: 2 } })),
  } as Saved
  const saved = applyChange(future, { kind: 'flush', pending: {}, turns: { s: [FACTS] } }, NOON)!
  expect(activeBuddy(saved).bests).toEqual({ failRun: 1, calls: 3, rough: 1, slowest: 2 } as Bests)
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

// V1's buddy one turn short of level 10.
function nearly(): Saved {
  const base = migrate(V1)
  return { ...base, buddies: [{ ...base.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }] }
}
const ONE_TURN = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 1_000 })

test('a flush that carries a buddy to level 10 logs that it grew and earns Grown up, once', () => {
  const saved = applyChange(nearly(), { kind: 'flush', pending: { s: ONE_TURN } }, NOON)!
  expect(activeBuddy(saved).journal).toEqual([{ at: AT, kind: 'grew', n: 1 }])
  expect(saved.you.earned).toEqual({ grownUp: AT })
  const again = applyChange(saved, { kind: 'flush', pending: { s: ONE_TURN } }, NOON + 1_000)!
  expect(activeBuddy(again).journal).toHaveLength(1)
  expect(again.you.earned).toEqual({ grownUp: AT })
})

test('a visit earns the streak achievements and keeps what was earned before', () => {
  const base = migrate(V1)
  const six = { ...base, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6, earned: { marathon: 'before' } } }
  const saved = applyChange(six, { kind: 'visit' }, NOON)!
  expect(saved.you.earned).toEqual({ marathon: 'before', regular: AT })
  expect(applyChange(saved, { kind: 'visit' }, NOON)).toBeNull()
})

test('an earned field that is not an object is replaced when something is earned, and none is added for nothing', () => {
  const base = migrate(V1)
  const damaged = { ...base, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6, earned: 'lots' } } as unknown as Saved
  expect(applyChange(damaged, { kind: 'visit' }, NOON)?.you.earned).toEqual({ regular: AT })
  expect('earned' in applyChange(base, { kind: 'visit' }, NOON)!.you).toBe(false)
})

// Pip, a common dragon ('swap-1'); Bix, a common ghost ('test-seed'); and pip, a common axolotl
// ('swap-2'), who is here now.
const THREE: Saved = {
  ...migrate(V1),
  active: 'swap-2',
  buddies: [
    { seed: 'swap-1', soul: SOUL, retiredAt: AT, counts: zeroCounts() },
    { seed: 'test-seed', soul: { ...SOUL, name: 'Bix' }, retiredAt: AT, counts: zeroCounts() },
    { seed: 'swap-2', soul: { ...SOUL, name: 'pip' }, retiredAt: null, counts: zeroCounts() },
  ],
}

test('a buddy is found by name in any case, or by its dex number', () => {
  expect(findBuddy(THREE, 'BIX')).toEqual({ kind: 'one', seed: 'test-seed' })
  expect(findBuddy(THREE, '#1')).toEqual({ kind: 'one', seed: 'swap-1' })
  expect(findBuddy(THREE, '3')).toEqual({ kind: 'one', seed: 'swap-2' })
  expect(findBuddy(THREE, 'Pip')).toEqual({ kind: 'many', numbers: [1, 3] })
  for (const nobody of ['Rex', '#4', '0', '#']) expect([nobody, findBuddy(THREE, nobody)]).toEqual([nobody, { kind: 'none' }])
})

test('a card or journal target is one buddy, the active one as null, or the reason there is none', () => {
  expect(targetOf(THREE, undefined, 'card')).toEqual({ seed: null })
  expect(targetOf(THREE, 'bix', 'card')).toEqual({ seed: 'test-seed' })
  expect(targetOf(THREE, '#3', 'card')).toEqual({ seed: null })
  expect(targetOf(THREE, 'PIP', 'journal')).toEqual({
    reply: '2 buddies are named Pip: #1 dragon, #3 axolotl. Run /buddy journal #3.',
  })
  expect(targetOf(THREE, 'Rex', 'card')).toEqual({ reply: 'No buddy named Rex in the dex.' })
  expect(targetOf(THREE, '#09', 'card')).toEqual({ reply: 'No buddy #9 in the dex.' })
  expect(shownBuddy(THREE, 'test-seed').soul.name).toBe('Bix')
  expect(shownBuddy(THREE, null).seed).toBe('swap-2')
  expect(shownBuddy(THREE, 'gone').seed).toBe('swap-2')
})

// Two buddies: a, retired at `retiredAt`, and b, here now, last visited on `lastDay`.
const pair = (retiredAt: string, lastDay = '2026-10-06'): Saved => ({
  ...migrate(V1),
  rerolls: 1,
  active: 'b',
  buddies: [
    { seed: 'a', soul: SOUL, retiredAt, counts: zeroCounts() },
    { seed: 'b', soul: { ...SOUL, name: 'Bix' }, retiredAt: null, counts: zeroCounts() },
  ],
  you: { lastDay, streak: 1, bestStreak: 1, days: 1 },
})
const YESTERDAY = new Date(2026, 9, 6, 12).toISOString()

test('a swap retires the active buddy, brings the other back on, and leaves the reroll count alone', () => {
  const saved = applyChange({ ...pair(YESTERDAY), mode: 'off' }, { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved).toMatchObject({ active: 'a', mode: 'on', rerolls: 1 })
  expect(saved.buddies.map(b => [b.seed, b.retiredAt])).toEqual([
    ['a', null],
    ['b', AT],
  ])
  // A day in retirement is no reason to sulk.
  expect(saved.buddies[0]?.mood).toBeUndefined()
  expect(saved.buddies[0]?.journal).toBeUndefined()
  expect(applyChange(pair(YESTERDAY), { kind: 'swap', seed: 'b' }, NOON)).toBeNull()
  expect(applyChange(pair(YESTERDAY), { kind: 'swap', seed: 'gone' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'swap', seed: 'a' }, NOON)).toBeNull()
})

test('a buddy back after five days retired sulks and remembers being away; the one left keeps the visit sulk', () => {
  const saved = applyChange(pair(new Date(2026, 9, 2, 12).toISOString(), '2026-10-04'), { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved.buddies[0]?.mood).toEqual({ meter: 0, sulk: 3, at: AT })
  expect(saved.buddies[0]?.journal).toEqual([{ at: AT, kind: 'away', n: 5 }])
  // 2026-10-04 to 2026-10-07 misses two days: the buddy left alone sulks 1.
  expect(saved.buddies[1]?.mood?.sulk).toBe(1)
  // A damaged retirement time leaves no sulk.
  expect(applyChange(pair('never'), { kind: 'swap', seed: 'a' }, NOON)?.buddies[0]?.mood).toBeUndefined()
})
