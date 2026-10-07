// Bones: everything about a buddy derived from its seed. Recomputed on every
// load and never saved, as in the original.

export const SALT = 'friend-2026-401'

export const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle',
  'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk',
] as const
export type Species = (typeof SPECIES)[number]

export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const
export type Eye = (typeof EYES)[number]

export const STATS = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STATS)[number]

export const HATS = ['crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'] as const
export type Hat = (typeof HATS)[number]

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export type RarityInfo = {
  weight: number
  stars: number
  floor: number
  hats: readonly (Hat | 'none')[]
  color: string | undefined
}

export const RARITY: Record<Rarity, RarityInfo> = {
  common: { weight: 60, stars: 1, floor: 5, hats: ['none'], color: undefined },
  uncommon: { weight: 25, stars: 2, floor: 15, hats: ['none', 'crown', 'tophat', 'propeller'], color: 'green' },
  rare: { weight: 10, stars: 3, floor: 25, hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard'], color: 'blue' },
  epic: { weight: 4, stars: 4, floor: 35, hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie'], color: 'magenta' },
  legendary: {
    weight: 1, stars: 5, floor: 50,
    hats: ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'],
    color: 'yellow',
  },
}

export type Bones = {
  rarity: Rarity
  species: Species
  eye: Eye
  hat: Hat | 'none'
  shiny: boolean
  stats: Record<StatName, number>
  peak: StatName
  low: StatName
}

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngFor(seed: string): () => number {
  return mulberry32(fnv1a32(seed + SALT))
}

function int(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[int(rng, list.length)]!
}

function pickRarity(rng: () => number): Rarity {
  let roll = rng() * 100
  for (const rarity of RARITIES) {
    roll -= RARITY[rarity].weight
    if (roll < 0) return rarity
  }
  return 'common'
}

// Draw order is fixed (spec section 2) so a seed always yields the same buddy.
export function rollBones(seed: string): Bones {
  const rng = rngFor(seed)
  const rarity = pickRarity(rng)
  const species = pick(rng, SPECIES)
  const eye = pick(rng, EYES)
  const hat = pick(rng, RARITY[rarity].hats)
  const shiny = rng() < 0.01
  const peakIndex = int(rng, STATS.length)
  let lowIndex = int(rng, STATS.length)
  while (lowIndex === peakIndex) lowIndex = int(rng, STATS.length)
  const floor = RARITY[rarity].floor
  const stats = {} as Record<StatName, number>
  STATS.forEach((name, i) => {
    if (i === peakIndex) stats[name] = Math.min(100, floor + 50 + int(rng, 30))
    else if (i === lowIndex) stats[name] = Math.max(1, floor - 10 + int(rng, 15))
    else stats[name] = floor + int(rng, 40)
  })
  return { rarity, species, eye, hat, shiny, stats, peak: STATS[peakIndex]!, low: STATS[lowIndex]! }
}
