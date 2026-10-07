// The hidden /buddy debug tour: every species for one animation cycle, plain
// for the first half and shiny for the second, so both fidgets and the blink
// show across the pair. Hats, rarities and eyes rotate; some combinations
// (a common in a crown) can never roll. Pure: no $.
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import type { Bones } from './roll'

export const TOUR_STEP_TICKS = 16
export const TOUR_STEPS = SPECIES.length

const SHINY_HATS = ['none', ...HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'hat' | 'shiny'>

// `elapsed` is ticks since the tour started; null once it is over.
export function tourAt(elapsed: number): { step: number; tick: number; look: TourLook } | null {
  if (elapsed < 0 || elapsed >= TOUR_STEPS * TOUR_STEP_TICKS) return null
  const step = Math.floor(elapsed / TOUR_STEP_TICKS)
  const tick = elapsed % TOUR_STEP_TICKS
  const shiny = tick >= TOUR_STEP_TICKS / 2
  return {
    step,
    tick,
    look: {
      rarity: RARITIES[step % RARITIES.length]!,
      species: SPECIES[step]!,
      eye: EYES[step % EYES.length]!,
      hat: shiny ? SHINY_HATS[step % SHINY_HATS.length]! : 'none',
      shiny,
    },
  }
}
