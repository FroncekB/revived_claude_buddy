// The hidden /buddy debug tour (Alive spec section 7). First a step for every species: plain,
// then shiny, then its flinch, celebrate and sleep. Then the real buddy wears each holiday's
// hat and prop, hatch day last, then each mood, then carries an egg at each stage of its wobble
// and hatching (Breeding spec section 6). Hats, rarities and eyes rotate; some combinations (a
// common in a crown) can never roll. Pure: no $.
import { HOLIDAYS, hatchDay } from './calendar'
import type { Holiday } from './calendar'
import type { MoodName } from './mood'
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import type { Bones } from './roll'
import type { Stage } from '../types'
import { EARNED_HATS } from './sprites'
import type { Pose, Worn } from './sprites'

export const TOUR_STEP_TICKS = 28
export const TOUR_STEPS = SPECIES.length
export const DECOR_TICKS = 8
export const MOOD_TICKS = 4
export const TOUR_DECORATIONS: readonly Holiday[] = [
  ...HOLIDAYS.map(({ id, name, line }) => ({ id, name, line })),
  hatchDay(1),
]
export const TOUR_MOODS: readonly MoodName[] = ['anxious', 'smug', 'sulky']
// The egg phase: a 16-tick cycle each at a quarter, three quarters and 95% along, then hatching.
export const EGG_TICKS = 16
export const TOUR_EGGS: readonly TourEgg[] = [
  { f: 0.25, hatching: false },
  { f: 0.75, hatching: false },
  { f: 0.95, hatching: false },
  { f: 1, hatching: true },
]
export const TOUR_TICKS =
  TOUR_STEPS * TOUR_STEP_TICKS +
  TOUR_DECORATIONS.length * DECOR_TICKS +
  TOUR_MOODS.length * MOOD_TICKS +
  TOUR_EGGS.length * EGG_TICKS

// Within a species step: plain until tick 8, shiny until 16, then 4 ticks of each pose.
const SHINY_FROM = 8
const POSES_FROM = 16
const POSE_TICKS = 4
const STEP_POSES: readonly Pose[] = ['flinch', 'celebrate', 'sleep']

// The shiny pass rotates every hat a buddy can wear, earned ones too (Progression spec section 5).
const SHINY_HATS = ['none', ...HATS, ...EARNED_HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'shiny'> & { hat: Worn }
// An egg as the egg phase carries it: how far along, and whether it is hatching.
export type TourEgg = { f: number; hatching: boolean }

export type TourAt = {
  name: string
  // Ticks into this step, for the animation.
  tick: number
  // The species phase's dressing; empty in the later phases, which show the real buddy.
  look: Partial<TourLook>
  pose: Pose | null
  holiday: Holiday | null
  mood: MoodName
  // The stage every phase is drawn at.
  stage: Stage
  // The egg the egg phase carries; null in every other phase.
  egg: TourEgg | null
}

// `elapsed` is ticks since the tour started; null once it is over.
export function tourAt(elapsed: number, stage: Stage = 'adult'): TourAt | null {
  if (elapsed < 0 || elapsed >= TOUR_TICKS) return null
  const speciesTicks = TOUR_STEPS * TOUR_STEP_TICKS
  if (elapsed < speciesTicks) {
    const step = Math.floor(elapsed / TOUR_STEP_TICKS)
    const tick = elapsed % TOUR_STEP_TICKS
    const shiny = tick >= SHINY_FROM && tick < POSES_FROM
    return {
      name: `tour ${step + 1}/${TOUR_STEPS}`,
      tick,
      look: {
        rarity: RARITIES[step % RARITIES.length]!,
        species: SPECIES[step]!,
        eye: EYES[step % EYES.length]!,
        hat: shiny ? SHINY_HATS[step % SHINY_HATS.length]! : 'none',
        shiny,
      },
      pose: tick >= POSES_FROM ? STEP_POSES[Math.floor((tick - POSES_FROM) / POSE_TICKS)]! : null,
      holiday: null,
      mood: 'neutral',
      stage,
      egg: null,
    }
  }
  const into = elapsed - speciesTicks
  const decorTicks = TOUR_DECORATIONS.length * DECOR_TICKS
  if (into < decorTicks) {
    const holiday = TOUR_DECORATIONS[Math.floor(into / DECOR_TICKS)]!
    const tick = into % DECOR_TICKS
    return { name: `tour: ${holiday.name}`, tick, look: {}, pose: null, holiday, mood: 'neutral', stage, egg: null }
  }
  const moodTicks = TOUR_MOODS.length * MOOD_TICKS
  if (into - decorTicks < moodTicks) {
    const mood = TOUR_MOODS[Math.floor((into - decorTicks) / MOOD_TICKS)]!
    const tick = (into - decorTicks) % MOOD_TICKS
    return { name: `tour: ${mood}`, tick, look: {}, pose: null, holiday: null, mood, stage, egg: null }
  }
  const eggInto = into - decorTicks - moodTicks
  const egg = TOUR_EGGS[Math.floor(eggInto / EGG_TICKS)]!
  const name = egg.hatching ? 'tour: egg hatching' : `tour: egg ${Math.round(egg.f * 100)}%`
  return { name, tick: eggInto % EGG_TICKS, look: {}, pose: null, holiday: null, mood: 'neutral', stage, egg }
}
