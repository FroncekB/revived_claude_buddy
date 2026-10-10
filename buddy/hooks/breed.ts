// Breeding (Breeding spec section 4): a bred buddy's bones, drawn from its own seed and its
// parents' bones, and the lookup that finds any buddy's bones through the record. Bones are
// never saved, so a bred buddy is worked out afresh from its parents every time. Pure: no $.
import type { Buddy, Egg } from '../types'
import { RARITIES, RARITY, STATS, int, pick, pickRarity, rngFor, rollBones } from './roll'
import type { Bones, Rarity, StatName } from './roll'

export const COPIED_STATS = 3
export const SHINY_CHANCE = 0.01
// The chance when either parent is shiny.
export const SHINY_PARENT_CHANCE = 0.04

// What a roll at `rarity` can give any stat: the lowest low to the highest peak (base spec
// section 2). A copied stat is clamped into it.
export function statRange(rarity: Rarity): [number, number] {
  const floor = RARITY[rarity].floor
  return [Math.max(1, floor - 10), Math.min(100, floor + 79)]
}

// The child of `a` and `b`, drawn from its own seed in a fixed order so a seed and its parents
// always give the same buddy: rarity, species, eye, hat, shiny, which stats are copied, each
// copied stat's parent, then each fresh stat.
export function breedBones(seed: string, a: Bones, b: Bones): Bones {
  const rng = rngFor(seed)
  const lower = Math.min(RARITIES.indexOf(a.rarity), RARITIES.indexOf(b.rarity))
  const rarity = RARITIES[Math.max(RARITIES.indexOf(pickRarity(rng)), lower)]!
  const species = (rng() < 0.5 ? a : b).species
  const eye = (rng() < 0.5 ? a : b).eye
  const hat = pick(rng, RARITY[rarity].hats)
  const shiny = rng() < (a.shiny || b.shiny ? SHINY_PARENT_CHANCE : SHINY_CHANCE)
  const copied: number[] = []
  while (copied.length < COPIED_STATS) {
    const i = int(rng, STATS.length)
    if (!copied.includes(i)) copied.push(i)
  }
  const [lo, hi] = statRange(rarity)
  const values: number[] = []
  STATS.forEach((name, i) => {
    if (copied.includes(i)) values[i] = Math.min(hi, Math.max(lo, (rng() < 0.5 ? a : b).stats[name]))
  })
  STATS.forEach((_, i) => {
    if (!copied.includes(i)) values[i] = RARITY[rarity].floor + int(rng, 40)
  })
  const stats = Object.fromEntries(STATS.map((name, i) => [name, values[i]!])) as Record<StatName, number>
  // The first highest is the peak, and the first lowest of the rest the low.
  const peak = STATS.reduce((best, s) => (stats[s] > stats[best] ? s : best))
  const low = STATS.filter(s => s !== peak).reduce((worst, s) => (stats[s] < stats[worst] ? s : worst))
  return { rarity, species, eye, hat, shiny, stats, peak, low }
}

// A `parents` field as two seeds of buddies in `buddies`, or null when it is anything else.
export function parentsOf(buddies: readonly Pick<Buddy, 'seed'>[], raw: unknown): [string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [p0, p1] = raw as unknown[]
  if (typeof p0 !== 'string' || typeof p1 !== 'string') return null
  return [p0, p1].every(p => buddies.some(b => b.seed === p)) ? [p0, p1] : null
}

// The bones `seed` was born with: bred from its parents' when it has two in the record, else
// rolled. `seen` holds the buddies already on this walk, so a hand-made loop reads as a roll.
function born(buddies: readonly Buddy[], seed: string, seen: ReadonlySet<string>): Bones {
  const parents = parentsOf(buddies, buddies.find(b => b.seed === seed)?.parents)
  const walked = new Set(seen).add(seed)
  if (!parents || seen.has(seed) || parents.some(p => walked.has(p))) return rollBones(seed)
  return breedBones(seed, born(buddies, parents[0], walked), born(buddies, parents[1], walked))
}

// A buddy's bones before any growth, looked up through the record. Never throws: a damaged
// `parents`, a parent missing from the record or a loop reads as a plain roll.
export function bornBones(buddies: readonly Buddy[], seed: string): Bones {
  return born(buddies, seed, new Set())
}

// The bones an egg will hatch into: bred when it has two parents in the record, else rolled, as
// the hatchling's own entry will give once it joins the dex.
export function eggBones(buddies: readonly Buddy[], egg: Pick<Egg, 'seed' | 'parents'>): Bones {
  const parents = parentsOf(buddies, egg.parents)
  if (!parents) return rollBones(egg.seed)
  return breedBones(egg.seed, bornBones(buddies, parents[0]), bornBones(buddies, parents[1]))
}
