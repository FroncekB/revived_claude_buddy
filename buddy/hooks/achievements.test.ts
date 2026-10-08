import { expect, test } from 'claude-code/testing'

import type { Buddy, Counts, Saved, You } from '../types'
import { ACHIEVEMENTS, earn, earnedHats, earnedOf, knownEarned, lifetime, newsOf } from './achievements'
import { zeroCounts } from './ledger'

const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-01T12:00:00.000Z' }
const NOBODY: You = { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }

const buddy = (seed: string, counts: Partial<Counts> = {}, more: Partial<Buddy> = {}): Buddy => ({
  seed,
  soul: SOUL,
  retiredAt: null,
  counts: { ...zeroCounts(), ...counts },
  ...more,
})
const record = (buddies: Buddy[], you: Partial<You> = {}): Saved => ({
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: buddies.at(-1)!.seed,
  buddies,
  you: { ...NOBODY, ...you },
})
const calls = (o: Partial<Counts['calls']>) => ({ ...zeroCounts().calls, ...o })
// The ids `earn` gives a record that has earned nothing yet, in the order it earned them.
const earned = (saved: Saved) => Object.keys(earnedOf(earn(saved, NOON).you))

test('seventeen achievements with ids never repeated, six of them with a hat', () => {
  expect(ACHIEVEMENTS).toHaveLength(17)
  expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(17)
  expect(ACHIEVEMENTS.flatMap(a => (a.hat ? [[a.id, a.hat]] : []))).toEqual([
    ['shell', 'hardhat'],
    ['ultramarathon', 'nightcap'],
    ['goodFriend', 'flowercrown'],
    ['chatterbox', 'headphones'],
    ['devoted', 'mortarboard'],
    ['elder', 'laurel'],
  ])
})

// For each achievement, in table order: a record that meets it, and one a step under.
const rough = (n: number) => ({ bests: { failRun: 0, calls: 0, rough: n } })
const EDGES: [string, Saved, Saved][] = [
  ['shell', record([buddy('a', { calls: calls({ shell: 500 }) })]), record([buddy('a', { calls: calls({ shell: 499 }) })])],
  ['editor', record([buddy('a', { calls: calls({ edit: 1_000 }) })]), record([buddy('a', { calls: calls({ edit: 999 }) })])],
  ['bookworm', record([buddy('a', { calls: calls({ read: 5_000 }) })]), record([buddy('a', { calls: calls({ read: 4_999 }) })])],
  ['researcher', record([buddy('a', { calls: calls({ web: 100 }) })]), record([buddy('a', { calls: calls({ web: 99 }) })])],
  ['manager', record([buddy('a', { calls: calls({ agent: 100 }) })]), record([buddy('a', { calls: calls({ agent: 99 }) })])],
  ['thousandTurns', record([buddy('a', { turns: 1_000 })]), record([buddy('a', { turns: 999 })])],
  ['marathon', record([buddy('a', { longestTurnMs: 600_000 })]), record([buddy('a', { longestTurnMs: 599_999 })])],
  ['ultramarathon', record([buddy('a', { longestTurnMs: 1_800_000 })]), record([buddy('a', { longestTurnMs: 1_799_999 })])],
  ['survivor', record([buddy('a', { failedTurns: 100 })]), record([buddy('a', { failedTurns: 99 })])],
  ['comeback', record([buddy('a', {}, rough(5))]), record([buddy('a', {}, rough(4))])],
  ['goodFriend', record([buddy('a', { pets: 100 })]), record([buddy('a', { pets: 99 })])],
  ['chatterbox', record([buddy('a', { talks: 50 })]), record([buddy('a', { talks: 49 })])],
  ['regular', record([buddy('a')], { bestStreak: 7 }), record([buddy('a')], { bestStreak: 6 })],
  ['devoted', record([buddy('a')], { bestStreak: 30 }), record([buddy('a')], { bestStreak: 29 })],
  // 8,100 XP is level 10; 84,100 is level 30.
  ['grownUp', record([buddy('a', { turns: 810 })]), record([buddy('a', { turns: 809 })])],
  ['elder', record([buddy('a', { turns: 8_410 })]), record([buddy('a', { turns: 8_409 })])],
  ['collector', record(['a', 'b', 'c', 'd', 'e'].map(s => buddy(s))), record(['a', 'b', 'c', 'd'].map(s => buddy(s)))],
]

test('each achievement is earned at its threshold and not a step under', () => {
  expect(EDGES.map(([id]) => id)).toEqual(ACHIEVEMENTS.map(a => a.id))
  for (const [id, met, under] of EDGES) {
    expect([id, earned(met).includes(id)]).toEqual([id, true])
    expect([id, earned(under).includes(id)]).toEqual([id, false])
  }
})

test('your lifetime sums every buddy, retired ones too, and keeps the largest records', () => {
  const saved = record(
    [
      buddy('a', { turns: 600, longestTurnMs: 700_000, calls: calls({ shell: 300 }) }, { retiredAt: AT, ...rough(6) }),
      buddy('b', { turns: 500, longestTurnMs: 90_000, calls: calls({ shell: 250 }) }),
    ],
    { bestStreak: 12 },
  )
  expect(lifetime(saved)).toMatchObject({
    counts: { turns: 1_100, longestTurnMs: 700_000, calls: { shell: 550 } },
    rough: 6,
    // 6,300 XP and 5,250 XP: both level 8.
    topLevel: 8,
    bestStreak: 12,
    buddies: 2,
  })
  // Neither buddy alone has 500 shell commands or 1,000 turns; together they do.
  expect(earned(saved)).toEqual(['shell', 'thousandTurns', 'marathon', 'comeback', 'regular'])
})

test('earning keeps the dates already there, dates new ones now, and with nothing new changes nothing', () => {
  const saved = record([buddy('a', { pets: 100, talks: 50 })], { earned: { goodFriend: '2026-09-01T00:00:00.000Z' } })
  const done = earn(saved, NOON)
  expect(done.you.earned).toEqual({ goodFriend: '2026-09-01T00:00:00.000Z', chatterbox: AT })
  expect(earn(done, NOON + 1)).toBe(done)
})

test("a damaged earned field reads as none; a newer build's id is kept but not counted", () => {
  for (const damaged of [null, 'all', 7, ['shell']]) {
    expect(earnedOf({ ...NOBODY, earned: damaged as unknown as Record<string, string> })).toEqual({})
  }
  const you: You = { ...NOBODY, earned: { party: AT, devoted: AT, shell: AT } }
  expect(knownEarned(you).map(a => a.id)).toEqual(['shell', 'devoted'])
  expect(earnedHats(you)).toEqual(['hardhat', 'mortarboard'])
  expect(earn(record([buddy('a')], you), NOON).you.earned).toEqual({ party: AT, devoted: AT, shell: AT })
})

test('news: the level that rose, the stage with it, and what was newly earned, in table order', () => {
  const at = (turns: number, done: Record<string, string> = {}) => record([buddy('a', { turns })], { earned: done })
  // 810 turns are 8,100 XP, level 10; 1,210 are 12,100 XP, level 12.
  expect(newsOf(at(809), at(810, { grownUp: AT }))).toEqual({ level: 10, stage: 'adult', earned: ['grownUp'] })
  expect(newsOf(at(810), at(1_210))).toEqual({ level: 12, stage: null, earned: [] })
  expect(newsOf(at(810), at(811))).toBeNull()
  expect(newsOf(null, at(810))).toBeNull()
  // A different active buddy: a reroll or a swap is no level-up.
  const other = record([buddy('a', { turns: 1_210 }), buddy('b')])
  expect(newsOf(at(810), other)).toBeNull()
  // Only achievements this build knows, in table order, and only new ones.
  expect(newsOf(at(0, { shell: AT }), at(0, { shell: AT, party: AT, devoted: AT, marathon: AT }))).toEqual({
    level: null,
    stage: null,
    earned: ['marathon', 'devoted'],
  })
})
