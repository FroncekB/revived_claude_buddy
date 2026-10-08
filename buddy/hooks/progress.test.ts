import { expect, test } from 'claude-code/testing'

import type { Counts } from '../types'
import { zeroCounts } from './ledger'
import {
  ADULT_LEVEL, ELDER_LEVEL, MAX_LEVEL, bonesFor, floorAt, grow, levelOf, safeCounts, stageOf, xpForLevel, xpOf,
} from './progress'
import { RARITIES, RARITY, rollBones } from './roll'
import type { Bones } from './roll'

const counts = (o: Partial<Counts>): Counts => ({ ...zeroCounts(), ...o })
// Counts worth exactly `xp`: a turn for each 10, a shell call for each 1 left over.
const worth = (xp: number) => counts({ turns: Math.floor(xp / 10), calls: { ...zeroCounts().calls, shell: xp % 10 } })

test('XP is 10 a turn, 1 a tool call, 15 more a rough turn, and 5 a pet or a talk', () => {
  expect(xpOf(zeroCounts())).toBe(0)
  expect(xpOf(counts({ turns: 3 }))).toBe(30)
  expect(xpOf(counts({ calls: { ...zeroCounts().calls, shell: 4, mcp: 2 } }))).toBe(6)
  expect(xpOf(counts({ turns: 1, failedTurns: 1 }))).toBe(25)
  expect(xpOf(counts({ pets: 2, talks: 1 }))).toBe(15)
  // A failed call already counts as a call, and the longest turn is a record, not work.
  expect(xpOf(counts({ failedCalls: 9, longestTurnMs: 600_000 }))).toBe(0)
})

test('missing or damaged counts read as zero, so XP and level never throw', () => {
  expect(xpOf(undefined)).toBe(0)
  expect(xpOf(null)).toBe(0)
  expect(xpOf('lots')).toBe(0)
  expect(xpOf({ turns: 'many', pets: Infinity, talks: Number.NaN })).toBe(0)
  expect(xpOf({ turns: 2 })).toBe(20)
  expect(safeCounts({ calls: { shell: 3, web: 'x' } }).calls).toEqual({ ...zeroCounts().calls, shell: 3 })
  expect(levelOf(undefined)).toBe(1)
})

test('level L takes 100 x (L - 1) squared XP, and stops at 99', () => {
  expect([1, 2, 10, 30, 50, 99].map(xpForLevel)).toEqual([0, 100, 8_100, 84_100, 240_100, 960_400])
  expect(levelOf(worth(0))).toBe(1)
  expect(levelOf(worth(99))).toBe(1)
  expect(levelOf(worth(100))).toBe(2)
  expect(levelOf(worth(8_099))).toBe(9)
  expect(levelOf(worth(8_100))).toBe(10)
  expect(levelOf(worth(960_399))).toBe(98)
  expect(levelOf(worth(960_400))).toBe(MAX_LEVEL)
  expect(levelOf(worth(5_000_000))).toBe(MAX_LEVEL)
})

test('a hatchling until level 10, an adult until 30, then an elder', () => {
  expect([ADULT_LEVEL, ELDER_LEVEL]).toEqual([10, 30])
  expect([1, 9, 10, 29, 30, 99].map(stageOf)).toEqual(['hatchling', 'hatchling', 'adult', 'adult', 'elder', 'elder'])
})

test('at level 1 every stat stays as rolled, at every rarity', () => {
  for (const rarity of RARITIES) {
    const f = RARITY[rarity].floor
    // The lowest stats a roll gives: the low at max(1, F - 10), the others at F, the peak at F + 50.
    const lowest: Bones = {
      rarity,
      species: 'blob',
      eye: '·',
      hat: 'none',
      shiny: false,
      stats: { DEBUGGING: f, PATIENCE: f, CHAOS: f, WISDOM: f + 50, SNARK: Math.max(1, f - 10) },
      peak: 'WISDOM',
      low: 'SNARK',
    }
    expect([rarity, grow(lowest, 1)]).toEqual([rarity, lowest])
  }
})

// A common whose peak rolled as low as a common's can: 55.
const LOW_PEAK: Bones = {
  rarity: 'common',
  species: 'blob',
  eye: '·',
  hat: 'none',
  shiny: false,
  stats: { DEBUGGING: 5, PATIENCE: 12, CHAOS: 44, WISDOM: 55, SNARK: 1 },
  peak: 'WISDOM',
  low: 'SNARK',
}

test('each level lifts the floor a point, to 60 at most, and never to the peak', () => {
  expect([20, 40, 66, 99].map(level => floorAt('common', level))).toEqual([14, 34, 60, 60])
  expect(floorAt('legendary', 21)).toBe(60)
  expect(grow(LOW_PEAK, 20).stats).toEqual({ DEBUGGING: 14, PATIENCE: 14, CHAOS: 44, WISDOM: 55, SNARK: 14 })
  expect(grow(LOW_PEAK, 40).stats).toEqual({ DEBUGGING: 34, PATIENCE: 34, CHAOS: 44, WISDOM: 55, SNARK: 34 })
  // The floor is 60 by now, but the peak rolled 55: the others stop at 54.
  expect(grow(LOW_PEAK, 99).stats).toEqual({ DEBUGGING: 54, PATIENCE: 54, CHAOS: 54, WISDOM: 55, SNARK: 54 })
  // The names of the peak and the low stay as rolled.
  expect([grow(LOW_PEAK, 99).peak, grow(LOW_PEAK, 99).low]).toEqual(['WISDOM', 'SNARK'])
})

test("a buddy's bones are its seed's, grown by its saved counts", () => {
  expect(bonesFor({ seed: 'test-seed' })).toEqual(rollBones('test-seed'))
  // 'test-seed' rolls a common ghost: DEBUGGING 7, PATIENCE 30, CHAOS 31, WISDOM 59 (its peak)
  // and SNARK 9. Level 40 lifts all but the peak to 34.
  expect(bonesFor({ seed: 'test-seed', counts: worth(152_100) }).stats).toEqual({
    DEBUGGING: 34,
    PATIENCE: 34,
    CHAOS: 34,
    WISDOM: 59,
    SNARK: 34,
  })
})
