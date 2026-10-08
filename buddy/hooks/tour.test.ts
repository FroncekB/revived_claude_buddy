import { expect, test } from 'claude-code/testing'

import { HOLIDAYS } from './calendar'
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { EARNED_HATS } from './sprites'
import { DECOR_TICKS, MOOD_TICKS, TOUR_DECORATIONS, TOUR_STEPS, TOUR_STEP_TICKS, TOUR_TICKS, tourAt } from './tour'

const SPECIES_TICKS = TOUR_STEPS * TOUR_STEP_TICKS

test('each species gets a step: plain, shiny, then flinch, celebrate and sleep', () => {
  expect(TOUR_STEPS).toBe(SPECIES.length)
  expect(TOUR_STEP_TICKS).toBe(28)
  SPECIES.forEach((species, step) => {
    const at = (tick: number) => tourAt(step * TOUR_STEP_TICKS + tick)!
    expect(at(0)).toMatchObject({ name: `tour ${step + 1}/18`, tick: 0, look: { species, shiny: false }, pose: null })
    expect(at(8)).toMatchObject({ look: { species, shiny: true }, pose: null })
    expect(at(16)).toMatchObject({ look: { species, shiny: false }, pose: 'flinch' })
    expect(at(19).pose).toBe('flinch')
    expect(at(20).pose).toBe('celebrate')
    expect(at(24).pose).toBe('sleep')
    expect(at(27).pose).toBe('sleep')
  })
})

test('then the real buddy wears each holiday, hatch day last, then each mood', () => {
  expect(TOUR_DECORATIONS.map(h => h.id)).toEqual([...HOLIDAYS.map(h => h.id), 'hatchday'])
  TOUR_DECORATIONS.forEach((holiday, i) => {
    const at = tourAt(SPECIES_TICKS + i * DECOR_TICKS)!
    expect(at).toMatchObject({ name: `tour: ${holiday.name}`, pose: null, holiday, mood: 'neutral' })
    expect(at.look).toEqual({})
  })
  const moodsFrom = SPECIES_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS
  const moods = [0, 1, 2].map(i => tourAt(moodsFrom + i * MOOD_TICKS)!)
  expect(moods.map(m => [m.name, m.mood, m.holiday])).toEqual([
    ['tour: anxious', 'anxious', null],
    ['tour: smug', 'smug', null],
    ['tour: sulky', 'sulky', null],
  ])
})

test('the tour runs 636 ticks, and is over before it starts and after its last mood', () => {
  expect(TOUR_TICKS).toBe(636)
  expect(tourAt(-1)).toBeNull()
  expect(tourAt(TOUR_TICKS - 1)?.mood).toBe('sulky')
  expect(tourAt(TOUR_TICKS)).toBeNull()
})

test('plain ticks wear no hat; shiny ticks show every hat, earned ones too, and no hat', () => {
  const plainHats = new Set<string | undefined>()
  const shinyHats = new Set<string | undefined>()
  for (let step = 0; step < TOUR_STEPS; step++) {
    plainHats.add(tourAt(step * TOUR_STEP_TICKS)!.look.hat)
    plainHats.add(tourAt(step * TOUR_STEP_TICKS + 16)!.look.hat)
    shinyHats.add(tourAt(step * TOUR_STEP_TICKS + 8)!.look.hat)
  }
  expect([...plainHats]).toEqual(['none'])
  expect([...shinyHats].sort()).toEqual(['none', ...HATS, ...EARNED_HATS].sort())
})

test('every rarity and eye shows up, including a shiny legendary', () => {
  const steps = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS)!.look)
  expect(new Set(steps.map(l => l.rarity)).size).toBe(RARITIES.length)
  expect(new Set(steps.map(l => l.eye)).size).toBe(EYES.length)
  const shinyLegendary = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS + 8)!.look)
    .filter(l => l.shiny && l.rarity === 'legendary')
  expect(shinyLegendary.length).toBeGreaterThan(0)
})

test('the tour draws every phase at the stage it was asked for, adults when not asked', () => {
  for (const elapsed of [0, SPECIES_TICKS, SPECIES_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS]) {
    expect(tourAt(elapsed)?.stage).toBe('adult')
    expect(tourAt(elapsed, 'hatchling')?.stage).toBe('hatchling')
    expect(tourAt(elapsed, 'elder')?.stage).toBe('elder')
  }
})
