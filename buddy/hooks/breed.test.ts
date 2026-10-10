import { expect, test } from 'claude-code/testing'

import type { Buddy } from '../types'
import { breedBones, bornBones, eggBones, parentsOf, statRange } from './breed'
import { zeroCounts } from './ledger'
import { RARITIES, STATS, rollBones } from './roll'
import type { Bones } from './roll'

// 'tint-11' rolls a plain rare penguin and 'hat-10' an uncommon capybara in a crown: two species,
// two eyes and two rarities, so every draw can be told apart.
const A = rollBones('tint-11')
const B = rollBones('hat-10')

const entry = (seed: string, parents?: unknown): Buddy => ({
  seed,
  soul: { name: seed, personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' },
  retiredAt: null,
  counts: zeroCounts(),
  ...(parents === undefined ? {} : { parents: parents as [string, string] }),
})

test('the parents are as their seeds say', () => {
  expect([A.rarity, A.species, B.rarity, B.species]).toEqual(['rare', 'penguin', 'uncommon', 'capybara'])
  expect(A.eye).not.toBe(B.eye)
})

test("a stat's range at each rarity runs from the lowest low to the highest peak", () => {
  expect(RARITIES.map(statRange)).toEqual([
    [1, 84],
    [5, 94],
    [15, 100],
    [25, 100],
    [40, 100],
  ])
})

// A compatibility contract, as rollBones' golden vectors are: a bred buddy keeps only its seed and
// its parents' seeds, so changing breedBones changes every bred buddy.
test('the same seed and parents always give the same child, pinned', () => {
  expect(breedBones('child-1', A, B)).toEqual(breedBones('child-1', A, B))
  expect(breedBones('golden-child', A, B)).toEqual({
    rarity: 'rare',
    species: 'penguin',
    eye: '·',
    hat: 'tophat',
    shiny: false,
    stats: { DEBUGGING: 54, PATIENCE: 60, CHAOS: 43, WISDOM: 55, SNARK: 83 },
    peak: 'SNARK',
    low: 'CHAOS',
  })
})

test('species and eye come from either parent half the time, and rarity never drops below the lower parent', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  let speciesA = 0
  let eyeA = 0
  for (let i = 0; i < N; i++) {
    const c = breedBones(`breed-${i}`, A, B)
    expect([A.species, B.species]).toContain(c.species)
    expect([A.eye, B.eye]).toContain(c.eye)
    expect(RARITIES.indexOf(c.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('uncommon'))
    if (c.species === A.species) speciesA++
    if (c.eye === A.eye) eyeA++
  }
  expect(Math.abs((speciesA / N) * 100 - 50)).toBeLessThanOrEqual(1)
  expect(Math.abs((eyeA / N) * 100 - 50)).toBeLessThanOrEqual(1)
})

test('a child is shiny 1 time in 100, or 4 with a shiny parent', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  let plain = 0
  let parented = 0
  const shinyA = { ...A, shiny: true }
  for (let i = 0; i < N; i++) {
    if (breedBones(`shine-${i}`, A, B).shiny) plain++
    if (breedBones(`shine-${i}`, B, shinyA).shiny) parented++
  }
  expect(Math.abs((plain / N) * 100 - 1)).toBeLessThanOrEqual(0.3)
  expect(Math.abs((parented / N) * 100 - 4)).toBeLessThanOrEqual(0.3)
})

test("every stat is inside the child's range, and at least 3 are a parent's, clamped into it", { timeoutMs: 30_000 }, () => {
  // A legendary parent's stats run past what an uncommon child may have.
  const big = rollBones('golden-legend')
  const legend: Bones = { ...big, rarity: 'legendary', stats: { DEBUGGING: 100, PATIENCE: 99, CHAOS: 98, WISDOM: 97, SNARK: 96 } }
  for (let i = 0; i < 20_000; i++) {
    const c = breedBones(`stat-${i}`, legend, B)
    const [lo, hi] = statRange(c.rarity)
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v))
    let fromParent = 0
    for (const s of STATS) {
      expect(c.stats[s]).toBeGreaterThanOrEqual(lo)
      expect(c.stats[s]).toBeLessThanOrEqual(hi)
      if (c.stats[s] === clamp(legend.stats[s]) || c.stats[s] === clamp(B.stats[s])) fromParent++
    }
    expect(fromParent).toBeGreaterThanOrEqual(3)
  }
})

test('the peak is the first highest stat and the low the first lowest of the rest', { timeoutMs: 30_000 }, () => {
  // Parents with every stat alike make ties common.
  const even: Bones = { ...A, stats: { DEBUGGING: 40, PATIENCE: 40, CHAOS: 40, WISDOM: 40, SNARK: 40 } }
  let tied = 0
  for (let i = 0; i < 5_000; i++) {
    const c = breedBones(`tie-${i}`, even, even)
    const values = STATS.map(s => c.stats[s])
    const top = Math.max(...values)
    expect(c.peak).toBe(STATS[values.indexOf(top)])
    const rest = STATS.filter(s => s !== c.peak)
    const bottom = Math.min(...rest.map(s => c.stats[s]))
    expect(c.low).toBe(rest.find(s => c.stats[s] === bottom))
    if (values.filter(v => v === top).length > 1) tied++
  }
  expect(tied).toBeGreaterThan(0)
})

test('a parents field reads as two seeds in the record, or as none', () => {
  const buddies = [entry('a'), entry('b')]
  expect(parentsOf(buddies, ['a', 'b'])).toEqual(['a', 'b'])
  for (const raw of [undefined, 'a', ['a'], ['a', 'b', 'a'], ['a', 7], ['a', 'gone'], { 0: 'a', 1: 'b' }]) {
    expect([raw, parentsOf(buddies, raw)]).toEqual([raw, null])
  }
})

test("a buddy's born bones are rolled, bred from its parents', or bred down the generations", () => {
  const buddies = [entry('a'), entry('b'), entry('c', ['a', 'b']), entry('g', ['c', 'a'])]
  expect(bornBones(buddies, 'a')).toEqual(rollBones('a'))
  expect(bornBones(buddies, 'c')).toEqual(breedBones('c', rollBones('a'), rollBones('b')))
  expect(bornBones(buddies, 'g')).toEqual(breedBones('g', breedBones('c', rollBones('a'), rollBones('b')), rollBones('a')))
  // A seed with no entry at all, as a buddy just hatched has, is rolled.
  expect(bornBones(buddies, 'new')).toEqual(rollBones('new'))
})

test("an egg's bones are rolled, or bred from its parents', as the hatchling's entry will be", () => {
  const buddies = [entry('a'), entry('b')]
  expect(eggBones(buddies, { seed: 'e' })).toEqual(rollBones('e'))
  const bred = eggBones(buddies, { seed: 'e', parents: ['a', 'b'] })
  expect(bred).toEqual(breedBones('e', rollBones('a'), rollBones('b')))
  expect(bornBones([...buddies, entry('e', ['a', 'b'])], 'e')).toEqual(bred)
  // Parents not in the record read as none.
  expect(eggBones(buddies, { seed: 'e', parents: ['a', 'gone'] })).toEqual(rollBones('e'))
})

test('damaged parents, a missing parent or a loop read as a plain roll and never throw', () => {
  for (const raw of ['a', ['a'], ['a', 7], ['a', 'gone']]) {
    expect(bornBones([entry('a'), entry('x', raw)], 'x')).toEqual(rollBones('x'))
  }
  // Its own parent.
  expect(bornBones([entry('a'), entry('x', ['x', 'a'])], 'x')).toEqual(rollBones('x'))
  // Each the other's parent: each reads the other as a plain roll.
  const loop = [entry('p', ['q', 'r']), entry('q', ['p', 'r']), entry('r')]
  expect(bornBones(loop, 'p')).toEqual(breedBones('p', rollBones('q'), rollBones('r')))
  expect(bornBones(loop, 'q')).toEqual(breedBones('q', rollBones('p'), rollBones('r')))
})
