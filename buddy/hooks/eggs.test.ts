import { expect, test } from 'claude-code/testing'

import type { Buddy, Counts, Saved } from '../types'
import {
  EGG_XP, HATCH_TURNS, MULLIGAN_NOTE, closedLine, dueEgg, earnedEggs, eggProgress, eggStatus, eggXpSoFar, eggsOf,
  lifetimeTurns, lifetimeXp, mulliganOpen, neverActive, owedEggs, readEgg, startEgg, withEggCount,
} from './eggs'
import { zeroCounts } from './ledger'

const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()

// `turns` turns and `shell` shell calls: 10 XP a turn, 1 a call.
const counts = (turns: number, shell = 0): Counts => ({ ...zeroCounts(), turns, calls: { ...zeroCounts().calls, shell } })
const entry = (seed: string, c: Counts = zeroCounts()): Buddy => ({
  seed,
  soul: { name: seed, personality: 'x', hatchedAt: AT },
  retiredAt: null,
  counts: c,
})
// A record with these buddies, the first active, and `eggs` started so far unless it is undefined.
function record(buddies: Buddy[], eggs?: unknown, extra: Partial<Saved> = {}): Saved {
  const you = { lastDay: null, streak: 0, bestStreak: 0, days: 0, ...(eggs === undefined ? {} : { eggs }) }
  return { schema: 2, mode: 'on', rerolls: 0, active: buddies[0]!.seed, buddies, you: you as Saved['you'], ...extra }
}

test('XP and turns are summed over every buddy, and an egg is earned every 8,100 XP', () => {
  expect([EGG_XP, HATCH_TURNS]).toEqual([8_100, 150])
  const short = record([entry('a', counts(400)), entry('b', counts(400, 99))])
  expect([lifetimeXp(short), lifetimeTurns(short), earnedEggs(short)]).toEqual([8_099, 800, 0])
  const there = record([entry('a', counts(400)), entry('b', counts(400, 100))])
  expect([lifetimeXp(there), earnedEggs(there)]).toEqual([8_100, 1])
  expect(earnedEggs(record([entry('a', counts(1_620))]))).toBe(2)
})

test('the eggs started are as saved; missing or damaged, as many as the XP has earned', () => {
  const buddies = [entry('a', counts(2_000))]
  expect(eggsOf(record(buddies, 1))).toBe(1)
  expect(eggsOf(record(buddies, 0))).toBe(0)
  for (const bad of [undefined, Number.NaN, 'two', null]) expect([bad, eggsOf(record(buddies, bad))]).toEqual([bad, 2])
  expect(owedEggs(record(buddies, 1))).toBe(1)
  expect(owedEggs(record(buddies))).toBe(0)
  // More started than earned owes none.
  expect(owedEggs(record(buddies, 5))).toBe(0)
})

test('the egg count is written from the counts as they stand, only when it is missing or damaged', () => {
  const missing = record([entry('a', counts(2_000))])
  expect(withEggCount(missing).you.eggs).toBe(2)
  expect(withEggCount(record([entry('a', counts(2_000))], 'x')).you.eggs).toBe(2)
  const kept = record([entry('a', counts(2_000))], 0)
  expect(withEggCount(kept)).toBe(kept)
})

test('an egg reads with its parents, or as none when it is damaged', () => {
  const buddies = [entry('a'), entry('b')]
  const egg = { seed: 'e', startedAt: AT, fromTurns: 3 }
  expect(readEgg({ buddies, egg })).toEqual(egg)
  expect(readEgg({ buddies, egg: { ...egg, parents: ['a', 'b'] } })).toEqual({ ...egg, parents: ['a', 'b'] })
  expect(readEgg({ buddies })).toBeNull()
  const damaged: unknown[] = [
    'egg',
    { ...egg, seed: '' },
    { ...egg, seed: 7 },
    { ...egg, startedAt: undefined },
    { ...egg, fromTurns: Number.NaN },
    { ...egg, fromTurns: '3' },
    { ...egg, parents: ['a'] },
    { ...egg, parents: ['a', 'gone'] },
  ]
  for (const bad of damaged) expect([bad, readEgg({ buddies, egg: bad as Saved['egg'] })]).toEqual([bad, null])
})

test('an egg is carried by the turns summed since it started, across a swap, and is due at 150', () => {
  const at = (a: number, b: number) => record([entry('a', counts(a)), entry('b', counts(b))])
  const egg = { seed: 'e', startedAt: AT, fromTurns: 100 }
  expect(eggProgress(at(100, 0), egg)).toBe(0)
  expect(eggProgress(at(60, 40), egg)).toBe(0)
  // Carried by one buddy, then the other.
  expect(eggProgress(at(149, 100), egg)).toBe(149)
  expect(eggProgress(at(150, 100), egg)).toBe(150)
  expect(eggProgress(at(900, 100), egg)).toBe(150)
  // A count edited lower reads as no progress.
  expect(eggProgress(at(10, 0), egg)).toBe(0)
  expect(dueEgg({ ...at(149, 100), egg })).toBeNull()
  expect(dueEgg({ ...at(150, 100), egg })).toEqual(egg)
  expect(dueEgg(at(900, 0))).toBeNull()
})

test('an owed egg starts from the seed it is given, only when none incubates', () => {
  const owing = record([entry('a', counts(810))], 0)
  const started = startEgg(owing, 'egg-1', NOON)
  expect(started.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 810 })
  expect(started.you.eggs).toBe(1)
  // Already incubating, no seed, or nothing owed: nothing starts.
  expect(startEgg(started, 'egg-2', NOON)).toBe(started)
  expect(startEgg(owing, undefined, NOON)).toBe(owing)
  const square = record([entry('a', counts(810))], 1)
  expect(startEgg(square, 'egg-2', NOON)).toBe(square)
  // A damaged egg is replaced by an owed one.
  const damaged = { ...owing, egg: { seed: '' } as Saved['egg'] }
  expect(startEgg(damaged, 'egg-3', NOON).egg?.seed).toBe('egg-3')
})

test('the XP toward the next egg runs from 0 to 8,100', () => {
  expect(eggXpSoFar(record([entry('a', counts(1_130))], 1))).toBe(3_200)
  expect(eggXpSoFar(record([entry('a', counts(0))], 0))).toBe(0)
  expect(eggXpSoFar(record([entry('a', counts(2_000))], 0))).toBe(8_100)
  expect(eggXpSoFar(record([entry('a', counts(10))], 3))).toBe(0)
})

test('the mulligan is open only while the one buddy is under level 2 and nothing was rerolled', () => {
  expect(mulliganOpen(record([entry('a', counts(9, 9))]))).toBe(true)
  expect(mulliganOpen(record([entry('a', counts(10))]))).toBe(false)
  expect(mulliganOpen(record([entry('a'), entry('b')]))).toBe(false)
  expect(mulliganOpen(record([entry('a')], 0, { rerolls: 1 }))).toBe(false)
})

test('the egg status says where the next egg stands', () => {
  const carrying = record([entry('a', counts(850))], 1, { egg: { seed: 'e', startedAt: AT, fromTurns: 810 } })
  expect(eggStatus(carrying)).toBe('An egg is on the way: 40 of 150 turns.')
  expect(eggStatus(record([entry('a', counts(810))], 0))).toBe('Your next egg starts after the next turn.')
  expect(eggStatus(record([entry('a', counts(1_130))], 1))).toBe('Your next egg comes in 4,900 xp.')
  expect(eggStatus(record([entry('a')], 0))).toBe('Your next egg comes in 8,100 xp.')
  expect(closedLine(record([entry('a')], 0))).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(MULLIGAN_NOTE).toBe('Not the one? /buddy reroll works once, before level 2.')
})

test('a buddy never yet active is one retired the day it hatched, and no other', () => {
  expect(neverActive(entry('a'))).toBe(false)
  expect(neverActive({ ...entry('b'), retiredAt: AT })).toBe(true)
  expect(neverActive({ ...entry('c'), retiredAt: new Date(2026, 9, 8, 12).toISOString() })).toBe(false)
})
