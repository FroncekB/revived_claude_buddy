import { expect, test } from 'claude-code/testing'

import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { TOUR_STEPS, TOUR_STEP_TICKS, tourAt } from './tour'

test('each species gets one animation cycle, plain for the first half and shiny for the second', () => {
  expect(TOUR_STEPS).toBe(SPECIES.length)
  expect(TOUR_STEP_TICKS).toBe(16)
  SPECIES.forEach((species, step) => {
    for (let tick = 0; tick < TOUR_STEP_TICKS; tick++) {
      const at = tourAt(step * TOUR_STEP_TICKS + tick)
      expect(at).toMatchObject({ step, tick, look: { species, shiny: tick >= TOUR_STEP_TICKS / 2 } })
    }
  })
})

test('the tour is over before it starts and after the last species', () => {
  expect(tourAt(-1)).toBeNull()
  expect(tourAt(TOUR_STEPS * TOUR_STEP_TICKS)).toBeNull()
})

test('plain halves wear no hat; shiny halves show every hat and no hat', () => {
  const plainHats = new Set<string>()
  const shinyHats = new Set<string>()
  for (let step = 0; step < TOUR_STEPS; step++) {
    plainHats.add(tourAt(step * TOUR_STEP_TICKS)!.look.hat)
    shinyHats.add(tourAt(step * TOUR_STEP_TICKS + TOUR_STEP_TICKS / 2)!.look.hat)
  }
  expect([...plainHats]).toEqual(['none'])
  expect([...shinyHats].sort()).toEqual(['none', ...HATS].sort())
})

test('every rarity and eye shows up, including a shiny legendary', () => {
  const steps = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS)!.look)
  expect(new Set(steps.map(l => l.rarity)).size).toBe(RARITIES.length)
  expect(new Set(steps.map(l => l.eye)).size).toBe(EYES.length)
  const shinyLegendary = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS + 8)!.look)
    .filter(l => l.shiny && l.rarity === 'legendary')
  expect(shinyLegendary.length).toBeGreaterThan(0)
})
