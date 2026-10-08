// The buddy's mood (Alive spec section 2): a meter that failures push toward anxious and long
// clean turns push toward smug, a sulk left by days away, and how both fade. Pure: no $.
import type { Mood, MoodEvent, TurnReason } from '../types'
import { daysBetween } from './ledger'
import { LONG_TURN_MS } from './voice'

export type MoodName = 'neutral' | 'anxious' | 'smug' | 'sulky'

export const MAX_METER = 6
export const MAX_SULK = 3
export const MOOD_STEP_MS = 30 * 60_000
// One gap between reads counts for at most this long, so a mood left overnight is still there.
export const MOOD_GAP_MS = 2 * 60 * 60_000
export const MAX_QUEUED_MOOD = 20

// None of these is a rolled eye, a pose eye or the blink.
export const MOOD_EYE: Record<Exclude<MoodName, 'neutral'>, string> = { anxious: ';', smug: '¬', sulky: '=' }

const iso = (ms: number) => new Date(ms).toISOString()
const toward0 = (n: number, steps: number) => (n > 0 ? Math.max(0, n - steps) : Math.min(0, n + steps))
const clampMeter = (n: number) => Math.min(MAX_METER, Math.max(-MAX_METER, n))
const isNeutral = (m: Mood) => m.meter === 0 && m.sulk === 0

export function neutralMood(now: number): Mood {
  return { meter: 0, sulk: 0, at: iso(now) }
}

// Fades `mood` to `now`: one step toward zero per 30 minutes, at most 4 steps for one gap.
// `at` moves by whole steps, so frequent reads never stop the fade. A missing mood is neutral.
export function decayMood(mood: Mood | undefined, now: number): Mood {
  if (!mood) return neutralMood(now)
  const since = Date.parse(mood.at)
  if (!Number.isFinite(since)) return { ...mood, at: iso(now) }
  const elapsed = Math.max(0, now - since)
  const steps = Math.floor(Math.min(elapsed, MOOD_GAP_MS) / MOOD_STEP_MS)
  if (steps === 0) return mood
  return {
    ...mood,
    meter: toward0(mood.meter, steps),
    sulk: toward0(mood.sulk, steps),
    at: iso(elapsed > MOOD_GAP_MS ? now : since + steps * MOOD_STEP_MS),
  }
}

function step(m: Mood, e: MoodEvent): Mood {
  switch (e) {
    case 'fail':
      return { ...m, meter: clampMeter(m.meter - 1) }
    case 'clean':
      return m.meter < 0 ? { ...m, meter: m.meter + 1 } : m
    case 'longClean':
      return { ...m, meter: clampMeter(m.meter + 1) }
    case 'soothe':
      return { ...m, sulk: Math.max(0, m.sulk - 1) }
    default:
      // An event this build doesn't know (a newer build's) changes nothing.
      return m
  }
}

// A neutral mood's clock starts over when something moves it, so time spent neutral never
// shortens the mood that follows.
function restartIfNeutral(m: Mood, now: number): Mood {
  return isNeutral(m) ? { ...m, at: iso(now) } : m
}

// Fades `mood` to `now`, then replays `events` in order: a clean turn after a failure eases it.
export function applyMood(mood: Mood | undefined, events: readonly MoodEvent[], now: number): Mood {
  let m = decayMood(mood, now)
  for (const e of events) m = step(restartIfNeutral(m, now), e)
  return m
}

// A sulk of `sulk`, kept as is when the buddy already sulks more.
export function withSulk(mood: Mood | undefined, sulk: number, now: number): Mood {
  const m = decayMood(mood, now)
  return sulk > m.sulk ? { ...restartIfNeutral(m, now), sulk: Math.min(MAX_SULK, sulk) } : m
}

// The sulk a new day's visit leaves: none for a first visit or a single missed day, then one
// for each missed day past the first, up to 3. Friday to Monday misses two days and gives 1.
export function sulkFor(lastDay: string | null, today: string): number {
  if (lastDay === null) return 0
  const missed = daysBetween(lastDay, today) - 1
  return missed >= 2 ? Math.min(MAX_SULK, missed - 1) : 0
}

export function moodOf(mood: Mood | undefined, now: number): MoodName {
  const m = decayMood(mood, now)
  if (m.sulk >= 1) return 'sulky'
  if (m.meter <= -2) return 'anxious'
  if (m.meter >= 2) return 'smug'
  return 'neutral'
}

// What a finished main turn does to the mood; null when nothing. Its failed calls were
// already queued one by one as they failed.
export function turnMood(reason: TurnReason, durationMs: number, failedCalls: number): MoodEvent | null {
  if (reason === 'error' || reason === 'aborted') return 'fail'
  if (reason !== 'answer' || failedCalls > 0) return null
  return durationMs > LONG_TURN_MS ? 'longClean' : 'clean'
}

const LINES: Record<Exclude<MoodName, 'neutral'>, string> = {
  anxious: 'Mood: anxious, after a run of failures. Let it color the line.',
  smug: 'Mood: smug, after some long clean turns. Let it color the line.',
  sulky: 'Mood: sulky, the developer stayed away for days. Let it color the line.',
}

// The persona prompt's mood line; null when neutral.
export function moodLine(name: MoodName): string | null {
  return name === 'neutral' ? null : LINES[name]
}
