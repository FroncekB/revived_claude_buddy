// Achievements (Progression spec section 3): milestones you reach across every buddy you've had,
// six of which unlock a hat no roll gives. Earned ones are saved on `you` with the time each was
// earned; everything else here is worked out from the record. Pure: no $.
import type { Counts, Saved, You } from '../types'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, levelOf, safeCounts } from './progress'
import type { EarnedHat } from './sprites'

export type AchievementId =
  | 'shell' | 'editor' | 'bookworm' | 'researcher' | 'manager' | 'thousandTurns' | 'marathon' | 'ultramarathon'
  | 'survivor' | 'comeback' | 'goodFriend' | 'chatterbox' | 'regular' | 'devoted' | 'grownUp' | 'elder' | 'collector'

// Your lifetime, as the achievements read it.
export type Lifetime = {
  // Every buddy's counts summed, with the longest turn the longest of any.
  counts: Counts
  // The longest run of rough turns a clean turn has ended, on any buddy.
  rough: number
  // The highest level any buddy has reached.
  topLevel: number
  bestStreak: number
  buddies: number
}

export type Achievement = { id: AchievementId; title: string; hat?: EarnedHat; met: (l: Lifetime) => boolean }

const MINUTE = 60_000

// In the order they are listed, announced and counted. The ids are saved, so they never change.
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'shell', title: 'Shell regular', hat: 'hardhat', met: l => l.counts.calls.shell >= 500 },
  { id: 'editor', title: 'Editor', met: l => l.counts.calls.edit >= 1_000 },
  { id: 'bookworm', title: 'Bookworm', met: l => l.counts.calls.read >= 5_000 },
  { id: 'researcher', title: 'Researcher', met: l => l.counts.calls.web >= 100 },
  { id: 'manager', title: 'Manager', met: l => l.counts.calls.agent >= 100 },
  { id: 'thousandTurns', title: 'Thousand turns', met: l => l.counts.turns >= 1_000 },
  { id: 'marathon', title: 'Marathon', met: l => l.counts.longestTurnMs >= 10 * MINUTE },
  { id: 'ultramarathon', title: 'Ultramarathon', hat: 'nightcap', met: l => l.counts.longestTurnMs >= 30 * MINUTE },
  { id: 'survivor', title: 'Survivor', met: l => l.counts.failedTurns >= 100 },
  { id: 'comeback', title: 'Comeback', met: l => l.rough >= 5 },
  { id: 'goodFriend', title: 'Good friend', hat: 'flowercrown', met: l => l.counts.pets >= 100 },
  { id: 'chatterbox', title: 'Chatterbox', hat: 'headphones', met: l => l.counts.talks >= 50 },
  { id: 'regular', title: 'Regular', met: l => l.bestStreak >= 7 },
  { id: 'devoted', title: 'Devoted', hat: 'mortarboard', met: l => l.bestStreak >= 30 },
  { id: 'grownUp', title: 'Grown up', met: l => l.topLevel >= ADULT_LEVEL },
  { id: 'elder', title: 'Elder', hat: 'laurel', met: l => l.topLevel >= ELDER_LEVEL },
  { id: 'collector', title: 'Collector', met: l => l.buddies >= 5 },
]

// What each earned hat is called in a sentence.
export const EARNED_HAT_NAME: Record<EarnedHat, string> = {
  hardhat: 'a hard hat',
  nightcap: 'a nightcap',
  flowercrown: 'a flower crown',
  headphones: 'headphones',
  mortarboard: 'a mortarboard',
  laurel: 'a laurel',
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function lifetime(saved: Saved): Lifetime {
  let counts = zeroCounts()
  let rough = 0
  let topLevel = 1
  for (const b of saved.buddies) {
    counts = addCounts(counts, safeCounts(b.counts))
    rough = Math.max(rough, n(b.bests?.rough))
    topLevel = Math.max(topLevel, levelOf(b.counts))
  }
  return { counts, rough, topLevel, bestStreak: n(saved.you.bestStreak), buddies: saved.buddies.length }
}

// Your earned achievements by id. A field that isn't a plain object reads as none.
export function earnedOf(you: You): Readonly<Record<string, string>> {
  const e: unknown = you.earned
  return typeof e === 'object' && e !== null && !Array.isArray(e) ? (e as Record<string, string>) : {}
}

// Earns every achievement met and not yet earned, dated `now`. Returns `saved` itself when there
// is none, so a caller can tell nothing changed. A damaged `earned` is replaced.
export function earn(saved: Saved, now: number): Saved {
  const had = earnedOf(saved.you)
  const life = lifetime(saved)
  const fresh = ACHIEVEMENTS.filter(a => !Object.hasOwn(had, a.id) && a.met(life))
  if (fresh.length === 0) return saved
  const at = new Date(now).toISOString()
  return { ...saved, you: { ...saved.you, earned: { ...had, ...Object.fromEntries(fresh.map(a => [a.id, at])) } } }
}

// The achievements this build knows that you've earned, in table order. A newer build's id is skipped.
export function knownEarned(you: You): Achievement[] {
  const had = earnedOf(you)
  return ACHIEVEMENTS.filter(a => Object.hasOwn(had, a.id))
}

// The hats you've earned, in table order.
export function earnedHats(you: You): EarnedHat[] {
  return knownEarned(you).flatMap(a => (a.hat ? [a.hat] : []))
}
