import { expect, test } from 'claude-code/testing'

import type { Bests, Saved, TurnFacts } from '../types'
import { newsOf } from './achievements'
import { countEvent, zeroCounts } from './ledger'
import {
  USAGE, activeBuddy, applyChange, breedChoice, classify, findBuddy, migrate, parseSub, shownBuddy, targetOf,
} from './record'
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
  expect(sub('Feed')).toBe('feed')
  expect(sub('feed twice')).toBe('usage')
  expect(parseSub('play')).toEqual({ sub: 'play' })
  expect(parseSub('play Dice')).toEqual({ sub: 'play', game: 'dice' })
  expect(parseSub('play coin')).toEqual({ sub: 'play', game: 'coin' })
  expect(parseSub('play rps')).toEqual({ sub: 'play', game: 'rps' })
  expect(parseSub('play ROCK')).toEqual({ sub: 'play', game: 'rps', pick: 'rock' })
  expect(parseSub('play tails')).toEqual({ sub: 'play', game: 'coin', pick: 'tails' })
  expect(parseSub('play rps scissors')).toEqual({ sub: 'play', game: 'rps', pick: 'scissors' })
  expect(parseSub('play coin Heads')).toEqual({ sub: 'play', game: 'coin', pick: 'heads' })
  for (const bad of ['play chess', 'play dice 4', 'play coin rock', 'play rps heads', 'play rps rock now']) {
    expect([bad, sub(bad)]).toEqual([bad, 'usage'])
  }
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
  expect(parseSub('breed Mochi')).toEqual({ sub: 'breed', target: 'Mochi' })
  expect(parseSub('BREED #3')).toEqual({ sub: 'breed', target: '#3' })
  expect(sub('breed')).toBe('usage')
  expect(sub('breed Pip Mochi')).toBe('usage')
  expect(parseSub('rename Mochi')).toEqual({ sub: 'rename', name: 'Mochi' })
  expect(parseSub('RENAME  Sir   Pip')).toEqual({ sub: 'rename', name: 'Sir Pip' })
  expect(sub('rename')).toBe('usage')
  expect(parseSub('hat')).toEqual({ sub: 'hat' })
  expect(parseSub('HAT Flower  Crown')).toEqual({ sub: 'hat', hat: 'Flower Crown' })
  expect(USAGE).toBe(
    'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
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

test('a name or personality edited to carry control characters is read without them', () => {
  const soulOf = (raw: unknown) => {
    const stored = classify(raw)
    return stored.kind === 'ok' ? activeBuddy(stored.saved).soul : null
  }
  const saved = migrate(V1)
  const clean = classify(saved)
  expect(clean.kind === 'ok' && clean.saved).toBe(saved)
  const edited = (soul: object): Saved => ({ ...saved, buddies: [{ ...saved.buddies[0]!, soul: { ...SOUL, ...soul } }] })
  expect(soulOf(edited({ name: 'P\u001b[2Jip\u009b', personality: 'Bold\u001b]52;c;aGk=\u0007 one.' }))).toEqual({
    ...SOUL,
    name: 'P[2Jip',
    personality: 'Bold]52;c;aGk= one.',
  })
  // A name of nothing but control characters reads as "Buddy", in either schema.
  expect(soulOf(edited({ name: '\u001b\u0007' }))?.name).toBe('Buddy')
  expect(soulOf({ ...V1, soul: { ...SOUL, name: '\u009b' } })?.name).toBe('Buddy')
})

test('migration keeps the buddy and starts its counts and the streak at zero', () => {
  expect(migrate(V1)).toEqual({
    schema: 2,
    mode: 'muted',
    rerolls: 3,
    active: 's',
    buddies: [{ seed: 's', soul: SOUL, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, eggs: 0 },
  })
})

test('a first hatch starts a record on, with today as its first visit', () => {
  expect(applyChange(null, { kind: 'hatch', seed: 'h', soul: SOUL }, NOON)).toMatchObject({
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'h',
    buddies: [{ seed: 'h', retiredAt: null }],
    you: { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1, eggs: 0 },
  })
})

// A first hatch, as a new person has it: one buddy, level 1, nothing rerolled.
const firstHatch = () => applyChange(null, { kind: 'hatch', seed: 's', soul: SOUL }, NOON)!

test('the mulligan replaces buddy #1 in place and counts the reroll', () => {
  const muted = { ...firstHatch(), mode: 'muted' as const }
  const saved = applyChange(muted, { kind: 'reroll', seed: 'n', soul: { ...SOUL, name: 'Bix' } }, NOON)!
  expect(saved.buddies).toEqual([{ seed: 'n', soul: { ...SOUL, name: 'Bix' }, retiredAt: null, counts: zeroCounts() }])
  expect(saved).toMatchObject({ active: 'n', rerolls: 1, mode: 'on' })
})

test('the mulligan writes nothing once its window has shut', () => {
  const reroll: Change = { kind: 'reroll', seed: 'n', soul: SOUL }
  // Rerolled already.
  expect(applyChange(migrate(V1), reroll, NOON)).toBeNull()
  const first = firstHatch()
  // Level 2.
  const grown = { ...first, buddies: [{ ...first.buddies[0]!, counts: { ...zeroCounts(), turns: 10 } }] }
  expect(applyChange(grown, reroll, NOON)).toBeNull()
  // A second buddy in the dex.
  const two = { ...first, buddies: [...first.buddies, { ...first.buddies[0]!, seed: 't', retiredAt: AT }] }
  expect(applyChange(two, reroll, NOON)).toBeNull()
})

test('a hatch only makes the first record: onto a stored one it writes nothing', () => {
  expect(applyChange(migrate(V1), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)).toBeNull()
  expect(applyChange(firstHatch(), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)).toBeNull()
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
    { kind: 'rename', seed: 's', name: 'Rex' },
  ]
  for (const change of changes) {
    const after = applyChange(future, change, NOON) as unknown as { buddies: unknown[] }
    expect(after).toMatchObject({ journal: ['x'], you: { hats: ['crown'] } })
    expect(after.buddies[0]).toMatchObject({ xp: 7 })
  }
  // The mulligan replaces the buddy itself, but the rest of the record survives it.
  const rerolled = applyChange({ ...future, rerolls: 0 }, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)
  expect(rerolled).toMatchObject({ journal: ['x'], you: { hats: ['crown'] } })
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

test('the mulligan makes the visit, and the buddy it brings starts neutral', () => {
  const away: Saved = { ...firstHatch(), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  expect(rerolled.you.lastDay).toBe('2026-10-07')
  // The first save after it finds the visit already made, so it moves no mood.
  const flushed = applyChange(rerolled, { kind: 'flush', pending: {}, mood: { n: ['longClean'] } }, NOON)!
  expect(activeBuddy(flushed).mood).toMatchObject({ meter: 1, sulk: 0 })
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
  // Two missed days leave a sulk but no moment.
  const weekend: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-04' } }
  expect(activeBuddy(applyChange(weekend, { kind: 'visit' }, NOON)!).journal).toBeUndefined()
})

// One turn's counts for buddy 's', and a flush of them carrying an egg seed.
const turnOf = (n = 1) => ({ ...zeroCounts(), turns: n })
const eggFlush = (n = 1, eggSeed = 'egg-1'): Change => ({ kind: 'flush', pending: { s: turnOf(n) }, eggSeed })

test("the first flush after the upgrade writes the egg count from the XP before its own counts", () => {
  const base = migrate(V1)
  // 2,000 turns stored is 20,000 XP: two eggs' worth, none owed.
  const old: Saved = { ...base, you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 }, buddies: [{ ...base.buddies[0]!, counts: turnOf(2_000) }] }
  const saved = applyChange(old, eggFlush(), NOON)!
  expect(saved.you.eggs).toBe(2)
  expect(saved.egg).toBeUndefined()
  // Crossing 24,300 XP earns the third.
  const crossed = applyChange({ ...saved, buddies: [{ ...saved.buddies[0]!, counts: turnOf(2_429) }] }, eggFlush(), NOON)!
  expect(crossed.you.eggs).toBe(3)
  expect(crossed.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 2_430 })
})

test("the upgrade flush that crosses 8,100 XP counts the stored XP first, so its own turns earn the egg", () => {
  const base = migrate(V1)
  // 809 turns stored is 8,090 XP: no egg's worth, and no count yet.
  const old: Saved = { ...base, you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 }, buddies: [{ ...base.buddies[0]!, counts: turnOf(809) }] }
  expect(old.you.eggs).toBeUndefined()
  // Counted from the stored XP the count is 0, and the flush's turn earns the first egg. Counted
  // after the flush it would read 1 already, and no egg would start.
  const saved = applyChange(old, eggFlush(), NOON)!
  expect(saved.you.eggs).toBe(1)
  expect(saved.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 810 })
})

test('a flush that crosses 8,100 XP starts an egg from its seed; one with an egg out starts none', () => {
  const first = firstHatch()
  const near: Saved = { ...first, buddies: [{ ...first.buddies[0]!, counts: turnOf(809) }] }
  const saved = applyChange(near, eggFlush(), NOON)!
  expect(saved.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 810 })
  expect(saved.you.eggs).toBe(1)
  // 8,100 XP more is owed while the first incubates: it waits.
  const more = applyChange(saved, eggFlush(810, 'egg-2'), NOON)!
  expect(more.egg?.seed).toBe('egg-1')
  expect(more.you.eggs).toBe(1)
  // A flush with no seed starts nothing, and the egg stays owed.
  const seedless = applyChange(near, { kind: 'flush', pending: { s: turnOf(1) } }, NOON)!
  expect(seedless.egg).toBeUndefined()
  expect(seedless.you.eggs).toBe(0)
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

test('a swap on a new day keeps the streak but earns nothing; the next flush earns it, and so announces it', () => {
  const six: Saved = { ...pair(YESTERDAY), you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6 } }
  const swapped = applyChange(six, { kind: 'swap', seed: 'a' }, NOON)!
  expect(swapped.you).toEqual({ lastDay: '2026-10-07', streak: 7, bestStreak: 7, days: 7 })
  const flushed = applyChange(swapped, { kind: 'flush', pending: { a: ONE_TURN } }, NOON + 1_000)!
  expect(flushed.you.earned).toEqual({ regular: new Date(NOON + 1_000).toISOString() })
  expect(newsOf(swapped, flushed)?.earned).toEqual(['regular'])
})

test('a hatchling never yet active comes in from the dex with no sulk and no away', () => {
  // It joined the dex retired the moment it hatched, five days ago.
  const hatchedAt = new Date(2026, 9, 2, 12).toISOString()
  const waiting = pair(hatchedAt, '2026-10-04')
  const fresh: Saved = { ...waiting, buddies: [{ ...waiting.buddies[0]!, soul: { ...SOUL, hatchedAt } }, waiting.buddies[1]!] }
  const saved = applyChange(fresh, { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved.active).toBe('a')
  expect(saved.buddies[0]?.retiredAt).toBeNull()
  expect(saved.buddies[0]?.mood).toBeUndefined()
  expect(saved.buddies[0]?.journal).toBeUndefined()
})

// Bix ('b', active, 960 turns) carrying an egg started at 810: 150 turns in, so due. `parents`,
// when given, are the egg's.
function carrying(parents?: [string, string]): Saved {
  const base = pair(YESTERDAY)
  return {
    ...base,
    buddies: [base.buddies[0]!, { ...base.buddies[1]!, counts: { ...zeroCounts(), turns: 960 } }],
    you: { ...base.you, eggs: 1 },
    egg: { seed: 'e', startedAt: AT, fromTurns: 810, ...(parents ? { parents } : {}) },
  }
}
const HATCHED_AT = new Date(NOON - 5_000).toISOString()
const hatchEgg = (o: Partial<Extract<Change, { kind: 'hatchEgg' }>> = {}): Change => ({
  kind: 'hatchEgg',
  seed: 'e',
  parents: null,
  soul: { ...SOUL, name: 'Sprout', hatchedAt: HATCHED_AT },
  eggSeed: 'next-egg',
  ...o,
})

test('a due egg hatches into the dex, retired as it hatched, and the active buddy stays', () => {
  const before = carrying()
  const saved = applyChange(before, hatchEgg(), NOON)!
  expect(saved.active).toBe('b')
  expect(saved.mode).toBe(before.mode)
  expect(saved.egg).toBeUndefined()
  expect(saved.buddies.map(b => b.seed)).toEqual(['a', 'b', 'e'])
  expect(saved.buddies[2]).toEqual({
    seed: 'e',
    soul: { ...SOUL, name: 'Sprout', hatchedAt: HATCHED_AT },
    retiredAt: HATCHED_AT,
    counts: zeroCounts(),
    journal: [{ at: AT, kind: 'hatched', n: 150 }],
  })
  expect(saved.you.eggs).toBe(1)
  // A brooded egg's parents go with it.
  const bred = applyChange(carrying(['b', 'a']), hatchEgg({ parents: ['b', 'a'] }), NOON)!
  expect(bred.buddies[2]?.parents).toEqual(['b', 'a'])
})

test('a hatch starts the next owed egg, and the fifth buddy earns Collector', () => {
  const base = carrying()
  // 1,620 turns is 16,200 XP: a second egg is owed and waiting.
  const owing: Saved = { ...base, buddies: [base.buddies[0]!, { ...base.buddies[1]!, counts: { ...zeroCounts(), turns: 1_620 } }], egg: { ...base.egg!, fromTurns: 1_470 } }
  const saved = applyChange(owing, hatchEgg(), NOON)!
  expect(saved.egg).toEqual({ seed: 'next-egg', startedAt: AT, fromTurns: 1_620 })
  expect(saved.you.eggs).toBe(2)
  const four: Saved = { ...base, buddies: [...base.buddies, { ...base.buddies[0]!, seed: 'c' }, { ...base.buddies[0]!, seed: 'd' }] }
  expect(applyChange(four, hatchEgg(), NOON)?.you.earned).toMatchObject({ collector: AT })
})

test('a hatch writes nothing for another egg, an egg not yet due, or parents its soul was not made for', () => {
  expect(applyChange(carrying(), hatchEgg({ seed: 'other' }), NOON)).toBeNull()
  const early = carrying()
  expect(applyChange({ ...early, egg: { ...early.egg!, fromTurns: 811 } }, hatchEgg(), NOON)).toBeNull()
  expect(applyChange(carrying(['b', 'a']), hatchEgg(), NOON)).toBeNull()
  expect(applyChange(carrying(), hatchEgg({ parents: ['b', 'a'] }), NOON)).toBeNull()
  expect(applyChange(carrying(['b', 'a']), hatchEgg({ parents: ['a', 'b'] }), NOON)).toBeNull()
  const { egg: _, ...none } = carrying()
  expect(applyChange(none, hatchEgg(), NOON)).toBeNull()
  expect(applyChange(null, hatchEgg(), NOON)).toBeNull()
})

// Five in the dex: Pip ('a', retired) and Bix ('b', here), adults at 810 turns each, then three
// hatchlings, Nib, Dot and Moss. An egg 40 turns in, with no parents yet, unless `egg` says
// otherwise; `egg: null` leaves none.
function brood(egg?: Saved['egg'] | null): Saved {
  const base = pair(YESTERDAY)
  const adult = { ...zeroCounts(), turns: 810 }
  const young = (seed: string, name: string) => ({ seed, soul: { ...SOUL, name }, retiredAt: AT, counts: zeroCounts() })
  return {
    ...base,
    buddies: [
      { ...base.buddies[0]!, counts: adult },
      { ...base.buddies[1]!, counts: adult },
      young('c', 'Nib'),
      young('d', 'Dot'),
      young('e', 'Moss'),
    ],
    you: { ...base.you, eggs: 2 },
    ...(egg === null ? {} : { egg: egg ?? { seed: 'egg', startedAt: AT, fromTurns: 1_580 } }),
  }
}

test('breeding is refused, in order, until five are in the dex, an egg waits for parents, and both are adults', () => {
  const reply = (saved: Saved, who: string) => {
    const choice = breedChoice(saved, who)
    return choice.kind === 'no' ? choice.reply : choice.partner
  }
  const four: Saved = { ...brood(), buddies: brood().buddies.slice(0, 4) }
  expect(reply(four, 'Pip')).toBe('Breeding unlocks at 5 buddies in the dex: 1 to go.')
  expect(reply(pair(YESTERDAY), 'Pip')).toBe('Breeding unlocks at 5 buddies in the dex: 3 to go.')
  expect(reply(brood(null), 'Pip')).toBe('No egg to brood. Your next egg comes in 8,100 xp.')
  const brooding = brood({ seed: 'egg', startedAt: AT, fromTurns: 1_580, parents: ['b', 'a'] })
  expect(reply(brooding, 'Pip')).toBe('Bix and Pip are already brooding this egg.')
  expect(reply(brood(), 'Rex')).toBe('No buddy named Rex in the dex.')
  expect(reply(brood(), 'bix')).toBe("Bix can't breed with itself. Pick one from /buddy dex.")
  expect(reply(brood(), 'Nib')).toBe('Nib is level 1. Buddies breed from level 10.')
  const youngHere: Saved = { ...brood(), active: 'c' }
  expect(reply(youngHere, 'Pip')).toBe('Nib is level 1. Buddies breed from level 10.')
  expect(reply(brood(), 'pip')).toBe('a')
  expect(reply(brood(), '#1')).toBe('a')
})

test('breeding sets the egg parents, active first, and logs it on both, with no visit', () => {
  const before = brood()
  const saved = applyChange(before, { kind: 'breed', partner: 'a' }, NOON)!
  expect(saved.egg).toEqual({ seed: 'egg', startedAt: AT, fromTurns: 1_580, parents: ['b', 'a'] })
  expect(saved.buddies[0]?.journal).toEqual([{ at: AT, kind: 'brooded', n: 2 }])
  expect(saved.buddies[1]?.journal).toEqual([{ at: AT, kind: 'brooded', n: 1 }])
  expect(saved.buddies.slice(2).every(b => b.journal === undefined)).toBe(true)
  expect(saved.you).toEqual(before.you)
  // Parents can't change once set, and the refusals write nothing.
  expect(applyChange(saved, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(brood(null), { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'b' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'c' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'gone' }, NOON)).toBeNull()
  expect(applyChange({ ...before, buddies: before.buddies.slice(0, 4) }, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
  const saved = applyChange(before, { kind: 'rename', seed: 'b', name: 'Mochi' }, NOON)!
  expect(saved.buddies.map(b => b.soul)).toEqual([SOUL, { ...SOUL, name: 'Mochi' }])
  expect(saved.you).toEqual(before.you)
  expect(saved.active).toBe('b')
  expect(applyChange(before, { kind: 'rename', seed: 'a', name: 'Rex' }, NOON)?.buddies[0]?.soul.name).toBe('Rex')
  expect(applyChange(before, { kind: 'rename', seed: 'b', name: 'bix' }, NOON)?.buddies[1]?.soul.name).toBe('bix')
  expect(applyChange(before, { kind: 'rename', seed: 'b', name: 'Bix' }, NOON)).toBeNull()
  expect(applyChange(before, { kind: 'rename', seed: 'gone', name: 'Rex' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'rename', seed: 'b', name: 'Rex' }, NOON)).toBeNull()
})

// 'hat-10' rolls an uncommon capybara in a crown. You've earned Good friend's flower crown.
const hatted = (hat?: string): Saved => ({
  ...migrate(V1),
  active: 'hat-10',
  buddies: [{ seed: 'hat-10', soul: SOUL, retiredAt: null, counts: zeroCounts(), ...(hat === undefined ? {} : { hat }) }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { goodFriend: AT } },
})

test('a hat change saves a hat it can wear, saves its rolled hat as no choice, and refuses the rest', () => {
  const crown = applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat: 'flowercrown' }, NOON)!
  expect(crown.buddies[0]?.hat).toBe('flowercrown')
  expect(crown.you).toEqual(hatted().you)
  expect(applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)?.buddies[0]?.hat).toBe('none')
  const back = applyChange(hatted('flowercrown'), { kind: 'hat', seed: 'hat-10', hat: 'crown' }, NOON)!
  expect('hat' in back.buddies[0]!).toBe(false)
  // Already worn, not earned, and another buddy's rolled hat.
  for (const hat of ['crown', 'laurel', 'halo'] as const) {
    expect([hat, applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat }, NOON)]).toEqual([hat, null])
  }
  expect(applyChange(hatted(), { kind: 'hat', seed: 'gone', hat: 'none' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)).toBeNull()
  // A field a newer build wrote survives.
  const future = { ...hatted(), buddies: [{ ...hatted().buddies[0]!, xp: 7 }] } as unknown as Saved
  expect(applyChange(future, { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)?.buddies[0]).toMatchObject({ xp: 7 })
})
