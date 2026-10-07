import { expect, test } from 'claude-code/testing'

import { EYES, RARITIES, RARITY, SPECIES, STATS, fnv1a32, mulberry32, rollBones } from './roll'

test('fnv1a32 matches the published FNV-1a test vectors', () => {
  expect(fnv1a32('')).toBe(0x811c9dc5)
  expect(fnv1a32('a')).toBe(0xe40c292c)
  expect(fnv1a32('foobar')).toBe(0xbf9cf968)
})

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  for (let i = 0; i < 1000; i++) {
    const x = a()
    expect(x).toBe(b())
    expect(x >= 0 && x < 1).toBe(true)
  }
})

test('the same seed always gives the same bones', () => {
  expect(rollBones('3f1c2b9e-seed')).toEqual(rollBones('3f1c2b9e-seed'))
  const b = rollBones('any-seed')
  expect(SPECIES).toContain(b.species)
  expect(EYES).toContain(b.eye)
})

test('rarity and shiny odds match the weights over 100,000 fixed seeds', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  const counts: Record<string, number> = {}
  let shiny = 0
  for (let i = 0; i < N; i++) {
    const b = rollBones(`test-${i}`)
    counts[b.rarity] = (counts[b.rarity] ?? 0) + 1
    if (b.shiny) shiny++
  }
  for (const r of RARITIES) {
    expect(Math.abs(((counts[r] ?? 0) / N) * 100 - RARITY[r].weight)).toBeLessThanOrEqual(1)
  }
  expect(Math.abs((shiny / N) * 100 - 1)).toBeLessThanOrEqual(0.3)
})

test('stats respect each rarity floor, with one peak and one low', { timeoutMs: 30_000 }, () => {
  for (let i = 0; i < 20_000; i++) {
    const b = rollBones(`stat-${i}`)
    const F = RARITY[b.rarity].floor
    expect(b.peak).not.toBe(b.low)
    for (const s of STATS) {
      const v = b.stats[s]
      if (s === b.peak) {
        expect(v).toBeGreaterThanOrEqual(F + 50)
        expect(v).toBeLessThanOrEqual(100)
      } else if (s === b.low) {
        expect(v).toBeGreaterThanOrEqual(Math.max(1, F - 10))
        expect(v).toBeLessThanOrEqual(F + 4)
      } else {
        expect(v).toBeGreaterThanOrEqual(F)
        expect(v).toBeLessThanOrEqual(F + 39)
      }
    }
  }
})

test('hats only appear at rarities allowed to wear them', { timeoutMs: 30_000 }, () => {
  for (let i = 0; i < 20_000; i++) {
    const b = rollBones(`hat-${i}`)
    expect(RARITY[b.rarity].hats).toContain(b.hat)
  }
})
