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
  return pairOf(raw, seed => buddies.some(b => b.seed === seed))
}

function pairOf(raw: unknown, inDex: (seed: string) => boolean): [string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [p0, p1] = raw as unknown[]
  if (typeof p0 !== 'string' || typeof p1 !== 'string') return null
  return inDex(p0) && inDex(p1) ? [p0, p1] : null
}

// The buddy with `seed` and its dex number, or undefined when the dex has none.
export function dexEntry(buddies: readonly Buddy[], seed: string): { number: number; buddy: Buddy } | undefined {
  const i = buddies.findIndex(b => b.seed === seed)
  const buddy = buddies[i]
  return buddy ? { number: i + 1, buddy } : undefined
}

// A buddy's born bones, and whether the walk to them met a loop.
type Born = { bones: Bones; looped: boolean }

// One lookup's walk: the record by seed, the buddies on the path down to here, the bones of each
// buddy whose lineage met no loop, and the steps it has left.
type Walk = { bySeed: ReadonlyMap<string, Buddy>; path: Set<string>; memo: Map<string, Bones>; steps: number }

// A record with no loop takes at most one step per buddy; a hand-made loop gets this many times
// that before the rest of its walk reads as rolls, so it can't stall the band (section 9).
const LOOP_STEPS = 4
// The deepest a walk goes: far past any lineage eggs can breed, at one generation a week, and
// shallow enough that a hand-made chain can't run out the stack.
const MAX_DEPTH = 1_000

// The bones `seed` was born with: bred from its parents' when it has two in the record, else
// rolled. `path` holds the buddies on this walk, so a hand-made loop reads as a roll where it
// closes. `memo` keeps the bones of each buddy whose lineage met no loop: those can't depend on
// the path, and a lineage bred from itself would otherwise be walked once per path through it.
function born(walk: Walk, seed: string): Born {
  const known = walk.memo.get(seed)
  if (known) return { bones: known, looped: false }
  const parents = pairOf(walk.bySeed.get(seed)?.parents, p => walk.bySeed.has(p))
  let result: Born
  if (!parents) {
    result = { bones: rollBones(seed), looped: false }
  } else if (parents.some(p => p === seed || walk.path.has(p)) || walk.steps <= 0 || walk.path.size >= MAX_DEPTH) {
    // Out of steps or depth reads as a loop, so it isn't kept either.
    result = { bones: rollBones(seed), looped: true }
  } else {
    walk.steps--
    walk.path.add(seed)
    const a = born(walk, parents[0])
    const b = born(walk, parents[1])
    walk.path.delete(seed)
    result = { bones: breedBones(seed, a.bones, b.bones), looped: a.looped || b.looped }
  }
  if (!result.looped) walk.memo.set(seed, result.bones)
  return result
}

// A buddy's bones before any growth, looked up through the record. Never throws: a damaged
// `parents`, a parent missing from the record or a loop reads as a plain roll.
export function bornBones(buddies: readonly Buddy[], seed: string): Bones {
  // The first entry for a seed, as a find would give.
  const bySeed = new Map<string, Buddy>()
  for (const b of buddies) if (!bySeed.has(b.seed)) bySeed.set(b.seed, b)
  return born({ bySeed, path: new Set(), memo: new Map(), steps: LOOP_STEPS * (bySeed.size + 1) }, seed).bones
}

// The bones an egg will hatch into: bred when it has two parents in the record, else rolled, as
// the hatchling's own entry will give once it joins the dex.
export function eggBones(buddies: readonly Buddy[], egg: Pick<Egg, 'seed' | 'parents'>): Bones {
  const parents = parentsOf(buddies, egg.parents)
  if (!parents) return rollBones(egg.seed)
  return breedBones(egg.seed, bornBones(buddies, parents[0]), bornBones(buddies, parents[1]))
}
