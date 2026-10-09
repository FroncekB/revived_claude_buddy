// What the band shows at one moment (Alive spec section 6): the body frame, the eyes, the hat
// row, the compact face and a prop, each by its own order of what wins. Pure: no $.
import type { Snack, Stage } from '../types'
import type { Holiday } from './calendar'
import { MOOD_EYE } from './mood'
import type { MoodName } from './mood'
import type { Bones } from './roll'
import { CRUMBS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Pose, Prop, Wearable } from './sprites'

export const FLINCH_TICKS = 4
export const CELEBRATE_TICKS = 6
// A yawn before a break nudge (Interaction spec section 5).
export const YAWN_TICKS = 4
// A snack is on the hat row for 5 ticks, the last 2 of them as crumbs (Interaction spec section 2).
export const SNACK_TICKS = 5
export const CRUMB_TICKS = 2
// Idle ticks before sleep: 10 minutes by day, 1 at night.
export const DAY_SLEEP_TICKS = 1_200
export const NIGHT_SLEEP_TICKS = 120

export type Scene = {
  // The hat may be an earned one: the debug tour shows them.
  bones: Pick<Bones, 'species' | 'eye' | 'shiny'> & { hat: Wearable | 'none' }
  // The stage the body is drawn at (Progression spec section 5).
  stage: Stage
  tick: number
  mood: MoodName
  // A flinch, celebrate or yawn still running. Only the debug tour poses 'sleep'; otherwise sleep
  // comes from idle time.
  pose: Pose | 'yawn' | null
  idleTicks: number
  night: boolean
  holiday: Holiday | null
  heartsFrame: number | null
  saying: boolean
  // A snack being eaten and the tick it's gone by. Missing reads as none.
  snack?: { kind: Snack; untilTick: number } | null
}

export type Drawn = { sprite: string[]; face: string; prop: Prop | null; asleep: boolean }

// Asleep when posed so, or idle long enough with no pose, bubble or hearts to keep it awake.
export function isAsleep(s: Pick<Scene, 'pose' | 'idleTicks' | 'night' | 'heartsFrame' | 'saying'>): boolean {
  if (s.pose !== null) return s.pose === 'sleep'
  if (s.saying || s.heartsFrame !== null) return false
  return s.idleTicks >= (s.night ? NIGHT_SLEEP_TICKS : DAY_SLEEP_TICKS)
}

// The hat row's snack at `tick`: the snack, then crumbs for its last CRUMB_TICKS; null once eaten.
function snackRow(snack: Scene['snack'], tick: number): string | null {
  if (!snack || tick >= snack.untilTick) return null
  return snack.untilTick - tick > CRUMB_TICKS ? SNACK_ART[snack.kind] : CRUMBS
}

export function draw(s: Scene): Drawn {
  const asleep = isAsleep(s)
  // A yawn is the sleep frame with its closed eyes, awake: no zZ.
  const pose: Pose | null = asleep || s.pose === 'yawn' ? 'sleep' : s.pose
  const { frame, blink } = frameAt(s.tick)
  const eye = pose ? POSE_EYE[pose] : blink ? '-' : s.mood === 'neutral' ? s.bones.eye : MOOD_EYE[s.mood]
  const top = topRow({
    hat: s.bones.hat,
    heartsFrame: s.heartsFrame,
    snack: snackRow(s.snack, s.tick),
    sparkle: s.bones.shiny ? s.tick : null,
    confetti: pose === 'celebrate' ? s.tick : null,
    zzz: asleep ? s.tick : null,
    holidayHat: s.holiday ? (HOLIDAY_HATS[s.holiday.id] ?? null) : null,
  })
  return {
    sprite: spriteRows({ species: s.bones.species, stage: s.stage, eye, frame: pose ?? frame, top }),
    face: faceFor(s.bones.species, eye) + (asleep ? ' zZ' : ''),
    prop: s.holiday && !s.saying ? (PROPS[s.holiday.id] ?? null) : null,
    asleep,
  }
}

// The card's portrait: who the buddy is, with its fidgets and blink but none of the moment's
// pose, sleep, mood, hearts or holiday.
export function portrait(bones: Scene['bones'], stage: Stage, tick: number): string[] {
  return draw({
    bones,
    stage,
    tick,
    mood: 'neutral',
    pose: null,
    idleTicks: 0,
    night: false,
    holiday: null,
    heartsFrame: null,
    saying: false,
  }).sprite
}
