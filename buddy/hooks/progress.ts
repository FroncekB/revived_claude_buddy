// Growing up (Progression spec section 2): XP, levels, stages and the stat floors, worked out
// from a buddy's saved counts whenever they are needed and never saved. Pure: no $.
import type { Buddy, Counts, Moment, Stage } from '../types'
import { bornBones } from './breed'
import { TOOL_GROUPS, totalCalls } from './ledger'
import { RARITY, STATS } from './roll'
import type { Bones, Rarity } from './roll'

export const MAX_LEVEL = 99
export const ADULT_LEVEL = 10
export const ELDER_LEVEL = 30
// No floor rises past this.
export const MAX_FLOOR = 60
export const STAGES: readonly Stage[] = ['hatchling', 'adult', 'elder']

// A stored value as a number: anything that isn't a finite number reads as 0.
export const asNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Counts as numbers, whatever was stored: a missing or damaged field reads as 0.
export function safeCounts(stored: unknown): Counts {
  const c = isObject(stored) ? stored : {}
  const calls = isObject(c.calls) ? c.calls : {}
  return {
    turns: asNumber(c.turns),
    failedTurns: asNumber(c.failedTurns),
    longestTurnMs: asNumber(c.longestTurnMs),
    calls: Object.fromEntries(TOOL_GROUPS.map(g => [g, asNumber(calls[g])])) as Counts['calls'],
    failedCalls: asNumber(c.failedCalls),
    pets: asNumber(c.pets),
    talks: asNumber(c.talks),
  }
}

// 10 a turn, 1 a tool call, 15 more for a rough turn sat through, 5 a pet or a talk.
export function xpOf(counts: unknown): number {
  const c = safeCounts(counts)
  return 10 * c.turns + totalCalls(c) + 15 * c.failedTurns + 5 * c.pets + 5 * c.talks
}

// The XP that reaches `level`: 0 for level 1, 100 for 2, 8,100 for 10.
export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2
}

// The XP that reaches the level after `level`; null at the top level, where there is none.
export function nextLevelXp(level: number): number | null {
  return level < MAX_LEVEL ? xpForLevel(level + 1) : null
}

// The largest level from 1 to 99 whose XP is reached, counted up in whole numbers so no float
// square root can land a hair under a boundary.
export function levelOf(counts: unknown): number {
  const xp = xpOf(counts)
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}

export function stageOf(level: number): Stage {
  if (level >= ELDER_LEVEL) return 'elder'
  return level >= ADULT_LEVEL ? 'adult' : 'hatchling'
}

// The floor under a buddy's stats at `level`: at or under every stat a roll gives at level 1,
// then a point a level, up to 60.
export function floorAt(rarity: Rarity, level: number): number {
  return Math.min(MAX_FLOOR, RARITY[rarity].floor - 10 + (level - 1))
}

// The bones with every stat but the peak lifted to the level's floor, and never to the peak, so
// the peak stays the one highest stat. `peak` and `low` keep their rolled names.
export function grow(bones: Bones, level: number): Bones {
  const lift = Math.min(floorAt(bones.rarity, level), bones.stats[bones.peak] - 1)
  const stats = { ...bones.stats }
  for (const s of STATS) if (s !== bones.peak) stats[s] = Math.max(stats[s], lift)
  return { ...bones, stats }
}

// A buddy's bones as they are now: born from its seed, and its parents' when it was bred (Breeding
// spec section 4), then grown by its saved counts. `buddies` is the record's list, where its
// parents are found; a buddy not in it yet, as one just hatched, is its seed's roll.
export function bonesFor(b: { seed: string; counts?: unknown }, buddies: readonly Buddy[]): Bones {
  return grow(bornBones(buddies, b.seed), levelOf(b.counts))
}

// A `grew` moment for each stage a save's counts carry a buddy into: 1 for adult, 2 for elder.
export function grewMoments(before: unknown, after: unknown, now: number): Moment[] {
  const from = STAGES.indexOf(stageOf(levelOf(before)))
  const to = STAGES.indexOf(stageOf(levelOf(after)))
  const at = new Date(now).toISOString()
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => ({ at, kind: 'grew' as const, n: from + 1 + i }))
}
