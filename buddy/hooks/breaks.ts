// Break nudges (Interaction spec section 5): a run of main turns with no gap longer than 10
// minutes, and when it has gone on long enough to suggest a break. Pure: no $.
import { nth } from './voice'

export const BREAK_GAP_MS = 10 * 60_000
export const STRETCH_MS = 90 * 60_000

// A run of main turns, in ms: when its first turn started, when its last one ended, and when it
// last nudged, null before its first nudge.
export type Stretch = { start: number; lastEnd: number; nudgedAt: number | null }

// The stretch once a main turn that ran from `start` to `end` is done: the same one carried on,
// or a new one after a gap of more than 10 minutes.
export function nextStretch(stretch: Stretch | null, start: number, end: number): Stretch {
  if (stretch === null || start - stretch.lastEnd > BREAK_GAP_MS) return { start, lastEnd: end, nudgedAt: null }
  return { ...stretch, lastEnd: end }
}

// Due 90 minutes into a stretch, then every 90 minutes after its last nudge.
export function breakDue(stretch: Stretch | null, now: number): boolean {
  return stretch !== null && now - (stretch.nudgedAt ?? stretch.start) >= STRETCH_MS
}

// How long a stretch has run: "95 minutes" under 2 hours, rounded down to 5; then by the half
// hour, rounded down: "2 hours", "2 and a half hours".
export function spanText(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 120) return `${Math.floor(minutes / 5) * 5} minutes`
  const halves = Math.floor(minutes / 30)
  const hours = Math.floor(halves / 2)
  return halves % 2 === 0 ? `${hours} hours` : `${hours} and a half hours`
}

export const BREAK_LINES: readonly string[] = [
  "*yawn* That's {span} straight. Stretch your legs?",
  '*yawn* {span} without a break. Water, maybe?',
  '*yawn* Even I need a break after {span}.',
  '*yawn* {span} in. Go look at something far away.',
]

// The `n`th break line, for a stretch `ms` long.
export function breakLine(n: number, ms: number): string {
  return nth(BREAK_LINES, n).replace('{span}', spanText(ms))
}
