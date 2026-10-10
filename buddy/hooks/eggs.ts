// Eggs (Breeding spec sections 2 and 3): one earned every 8,100 XP, carried 150 turns, and the one
// mulligan at the start. XP and turns are summed over every buddy's saved counts, so two sessions
// can never disagree about them; only the number of eggs started is saved. Pure: no $.
import type { Buddy, Egg, Saved } from '../types'
import { parentsOf } from './breed'
import { withCommas } from './ledger'
import { isObject, levelOf, safeCounts, xpOf } from './progress'

// The XP that reaches level 10: a new person's first egg comes as their first buddy grows up.
export const EGG_XP = 8_100
export const HATCH_TURNS = 150
// The mulligan is open while the only buddy is under this level.
export const MULLIGAN_LEVEL = 2

type Dex = Pick<Saved, 'buddies'>
type Eggs = Pick<Saved, 'you' | 'buddies'>

export function lifetimeXp(saved: Dex): number {
  return saved.buddies.reduce((sum, b) => sum + xpOf(b.counts), 0)
}

export function lifetimeTurns(saved: Dex): number {
  return saved.buddies.reduce((sum, b) => sum + safeCounts(b.counts).turns, 0)
}

// A hatchling that joined the dex from its egg and was never the active buddy: retired as it hatched.
export function neverActive(b: Pick<Buddy, 'retiredAt' | 'soul'>): boolean {
  return b.retiredAt === b.soul.hatchedAt
}

// The eggs your XP has earned.
export function earnedEggs(saved: Dex): number {
  return Math.floor(lifetimeXp(saved) / EGG_XP)
}

// The eggs started so far. Missing or damaged reads as the eggs your XP has earned, so none is owed
// until a flush writes the count (section 2).
export function eggsOf(saved: Eggs): number {
  const n: unknown = saved.you.eggs
  return typeof n === 'number' && Number.isFinite(n) ? n : earnedEggs(saved)
}

// Eggs earned and not yet started: they wait while another incubates.
export function owedEggs(saved: Eggs): number {
  return Math.max(0, earnedEggs(saved) - eggsOf(saved))
}

// The egg incubating, as this build reads it, or null. An egg with no seed, no start, a
// `fromTurns` that isn't a finite number, or `parents` that aren't two seeds in the record reads
// as none (section 9).
export function readEgg(saved: Pick<Saved, 'egg' | 'buddies'>): Egg | null {
  const egg: unknown = saved.egg
  if (!isObject(egg)) return null
  const { seed, startedAt, fromTurns, parents } = egg
  if (typeof seed !== 'string' || seed === '' || typeof startedAt !== 'string') return null
  if (typeof fromTurns !== 'number' || !Number.isFinite(fromTurns)) return null
  if (parents === undefined) return { seed, startedAt, fromTurns }
  const pair = parentsOf(saved.buddies, parents)
  return pair ? { seed, startedAt, fromTurns, parents: pair } : null
}

// The turns an egg has been carried, from 0 to HATCH_TURNS.
export function eggProgress(saved: Dex, egg: Pick<Egg, 'fromTurns'>): number {
  return Math.min(HATCH_TURNS, Math.max(0, lifetimeTurns(saved) - egg.fromTurns))
}

// The egg incubating when it is ready to hatch, or null.
export function dueEgg(saved: Pick<Saved, 'egg' | 'buddies'>): Egg | null {
  const egg = readEgg(saved)
  return egg && eggProgress(saved, egg) >= HATCH_TURNS ? egg : null
}

// Starts an owed egg from `seed` when none is incubating: `you.eggs` goes up by one and the egg
// counts from the turns summed now. Returns `saved` itself when no egg starts, or with no seed.
export function startEgg(saved: Saved, seed: string | undefined, now: number): Saved {
  if (seed === undefined || readEgg(saved) !== null || owedEggs(saved) === 0) return saved
  const egg: Egg = { seed, startedAt: new Date(now).toISOString(), fromTurns: lifetimeTurns(saved) }
  return { ...saved, egg, you: { ...saved.you, eggs: eggsOf(saved) + 1 } }
}

// `saved` with `you.eggs` written, from the counts as they stand, when it is missing or damaged.
export function withEggCount(saved: Saved): Saved {
  const n: unknown = saved.you.eggs
  return typeof n === 'number' && Number.isFinite(n) ? saved : { ...saved, you: { ...saved.you, eggs: earnedEggs(saved) } }
}

// The XP earned toward the next egg, from 0 to EGG_XP.
export function eggXpSoFar(saved: Eggs): number {
  return Math.min(EGG_XP, Math.max(0, lifetimeXp(saved) - eggsOf(saved) * EGG_XP))
}

// Breeding unlocks with this many buddies in the dex, Collector's mark (section 4).
export const BREED_DEX = 5

// "It hatches in 110 turns.": what is left of an egg's 150 turns.
export function hatchesIn(left: number): string {
  return left > 0 ? `It hatches in ${left} turn${left === 1 ? '' : 's'}.` : 'It hatches any moment now.'
}

// The one reroll (section 2): while the dex has one buddy, under level 2, and nothing rerolled.
export function mulliganOpen(saved: Pick<Saved, 'buddies' | 'rerolls'>): boolean {
  const only: Buddy | undefined = saved.buddies[0]
  return saved.buddies.length === 1 && levelOf(only?.counts) < MULLIGAN_LEVEL && saved.rerolls === 0
}

export const MULLIGAN_NOTE = 'Not the one? /buddy reroll works once, before level 2.'

// What /buddy reroll answers once the mulligan is spent, or was never there.
export function closedLine(saved: Saved): string {
  return `No more rerolls. ${eggStatus(saved)}`
}

// Where the next egg stands, for a reply: the egg on the way, one waiting to start, or the XP to go.
export function eggStatus(saved: Saved): string {
  const egg = readEgg(saved)
  if (egg) return `An egg is on the way: ${eggProgress(saved, egg)} of ${HATCH_TURNS} turns.`
  if (owedEggs(saved) > 0) return 'Your next egg starts after the next turn.'
  return `Your next egg comes in ${withCommas(EGG_XP - eggXpSoFar(saved))} xp.`
}
