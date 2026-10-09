import { expect, test } from 'claude-code/testing'

import { holidayOn } from './calendar'
import { DAY_SLEEP_TICKS, NIGHT_SLEEP_TICKS, SNACK_TICKS, draw, isAsleep, portrait } from './look'
import type { Scene } from './look'
import { MOOD_EYE } from './mood'
import {
  CONFETTI, CRUMBS, DUCK_PROP, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, SPRITE_W, ZZZ, bodyRows, fillEyes,
} from './sprites'
import type { Pose } from './sprites'

// A plain duck in a crown, doing nothing in particular.
const BONES = { species: 'duck' as const, eye: '·' as const, hat: 'crown' as const, shiny: false }
const CALM: Scene = {
  bones: BONES,
  stage: 'adult',
  tick: 0,
  mood: 'neutral',
  pose: null,
  idleTicks: 0,
  night: false,
  holiday: null,
  heartsFrame: null,
  saying: false,
}
const HATCHED = new Date(2020, 0, 15, 12).toISOString()
const JULY4 = holidayOn('2026-07-04', HATCHED)
const body = (rows: string[]) => rows.slice(1).map(r => r.trimEnd())
const posed = (pose: Pose) => bodyRows('duck', 'adult', pose).map(r => fillEyes(r, POSE_EYE[pose]).trimEnd())

test('a pose beats sleep and the fidget cycle, and draws its own frame and eye', () => {
  expect(body(draw({ ...CALM, pose: 'flinch', idleTicks: DAY_SLEEP_TICKS }).sprite)).toEqual(posed('flinch'))
  expect(body(draw({ ...CALM, pose: 'celebrate', tick: 5 }).sprite)).toEqual(posed('celebrate'))
  // Tick 14 would blink, and a mood would change the eye; the pose's eye wins over both.
  expect(draw({ ...CALM, pose: 'flinch', tick: 14, mood: 'anxious' }).face).toBe('<(O)')
})

test('eyes: the blink, then the mood eye, then the rolled eye', () => {
  expect(draw({ ...CALM, mood: 'smug' }).face).toBe(`<(${MOOD_EYE.smug})`)
  expect(draw({ ...CALM, mood: 'smug', tick: 14 }).face).toBe('<(-)')
  expect(draw(CALM).face).toBe('<(·)')
})

test('the hat row: hearts, confetti, zZ, a holiday hat, then the rolled hat', () => {
  const top = (s: Partial<Scene>) => draw({ ...CALM, ...s }).sprite[0]
  expect(top({ pose: 'celebrate', heartsFrame: 0 })).toBe(HEARTS[0]!.padEnd(SPRITE_W))
  expect(top({ pose: 'celebrate', holiday: JULY4 })).toBe(CONFETTI[0])
  expect(top({ idleTicks: DAY_SLEEP_TICKS, holiday: JULY4 })).toBe(ZZZ[0])
  expect(top({ holiday: JULY4 })).toBe(HOLIDAY_HATS.july4!.padEnd(SPRITE_W))
  // Memorial Day keeps the buddy's own hat.
  expect(top({ holiday: holidayOn('2026-05-25', HATCHED) })).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(top({})).toBe(HAT_ART.crown.padEnd(SPRITE_W))
})

test('sleep comes after 10 idle minutes by day and 1 at night', () => {
  expect(isAsleep({ ...CALM, idleTicks: DAY_SLEEP_TICKS - 1 })).toBe(false)
  expect(isAsleep({ ...CALM, idleTicks: DAY_SLEEP_TICKS })).toBe(true)
  expect(isAsleep({ ...CALM, night: true, idleTicks: NIGHT_SLEEP_TICKS - 1 })).toBe(false)
  expect(isAsleep({ ...CALM, night: true, idleTicks: NIGHT_SLEEP_TICKS })).toBe(true)
  const asleep = draw({ ...CALM, idleTicks: DAY_SLEEP_TICKS })
  expect(body(asleep.sprite)).toEqual(posed('sleep'))
  expect(asleep.face).toBe('<(-) zZ')
  expect(asleep.asleep).toBe(true)
})

test('a bubble, hearts or a pose keep it awake; the tour can pose it asleep', () => {
  const idle = { ...CALM, idleTicks: DAY_SLEEP_TICKS }
  expect(isAsleep({ ...idle, saying: true })).toBe(false)
  expect(isAsleep({ ...idle, heartsFrame: 0 })).toBe(false)
  expect(isAsleep({ ...idle, pose: 'flinch' })).toBe(false)
  expect(isAsleep({ ...CALM, pose: 'sleep' })).toBe(true)
})

test('a holiday prop shows only while nothing is said', () => {
  expect(draw({ ...CALM, holiday: JULY4 }).prop).toBe(PROPS.july4)
  expect(draw({ ...CALM, holiday: JULY4, saying: true }).prop).toBeNull()
  // Presidents' Day has a hat and no prop.
  expect(draw({ ...CALM, holiday: holidayOn('2026-02-16', HATCHED) }).prop).toBeNull()
  expect(draw(CALM).prop).toBeNull()
})

test("the card's portrait is the rolled buddy: its hat and its eye", () => {
  const rows = portrait(BONES, 'adult', 0)
  expect(rows[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(rows.join('\n')).toContain('<(· )___')
})

test('a snack is on the hat row for 3 ticks, then crumbs for 2, then the hat again', () => {
  const snack = { kind: 'cookie' as const, untilTick: 10 + SNACK_TICKS }
  const top = (tick: number) => draw({ ...CALM, tick, snack }).sprite[0]
  expect([10, 11, 12].map(top)).toEqual(Array(3).fill(SNACK_ART.cookie.padEnd(SPRITE_W)))
  expect([13, 14].map(top)).toEqual(Array(2).fill(CRUMBS.padEnd(SPRITE_W)))
  expect(top(15)).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(draw({ ...CALM, tick: 10 }).sprite[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
})

test('a yawn draws the sleep frame with closed eyes, awake: no zZ, and the hat stays on', () => {
  const yawn = draw({ ...CALM, pose: 'yawn' })
  expect(body(yawn.sprite)).toEqual(posed('sleep'))
  expect(yawn.sprite[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(yawn.asleep).toBe(false)
  expect(yawn.face).not.toContain('zZ')
  expect(yawn.face).toContain(POSE_EYE.sleep)
  expect(isAsleep({ ...CALM, pose: 'yawn', idleTicks: DAY_SLEEP_TICKS })).toBe(false)
})

test('in duck mode the rubber duck stands in for a holiday prop, and hides while something is said', () => {
  expect(draw({ ...CALM, duck: true }).prop).toBe(DUCK_PROP)
  expect(draw({ ...CALM, duck: true, holiday: JULY4 }).prop).toBe(DUCK_PROP)
  expect(draw({ ...CALM, duck: true, saying: true }).prop).toBeNull()
  expect(draw({ ...CALM, duck: false, holiday: JULY4 }).prop).toBe(PROPS.july4)
})
