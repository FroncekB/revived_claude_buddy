import { expect, test } from 'claude-code/testing'

import { BREAK_LINES, breakDue, breakLine, nextStretch, spanText } from './breaks'

const MIN = 60_000
const T0 = 1_000_000_000

test('a first turn starts a stretch; a gap of 10 minutes keeps it, and one of more starts a new one', () => {
  const first = nextStretch(null, T0, T0 + 4 * MIN)
  expect(first).toEqual({ start: T0, lastEnd: T0 + 4 * MIN, nudgedAt: null })
  expect(nextStretch(first, T0 + 14 * MIN, T0 + 15 * MIN)).toEqual({ start: T0, lastEnd: T0 + 15 * MIN, nudgedAt: null })
  expect(nextStretch(first, T0 + 14 * MIN + 1, T0 + 15 * MIN)).toEqual({
    start: T0 + 14 * MIN + 1,
    lastEnd: T0 + 15 * MIN,
    nudgedAt: null,
  })
  // A turn that started before the last one ended carries the stretch on.
  expect(nextStretch(first, T0 + MIN, T0 + 5 * MIN).start).toBe(T0)
  const nudged = { start: T0, lastEnd: T0 + 90 * MIN, nudgedAt: T0 + 90 * MIN }
  expect(nextStretch(nudged, T0 + 95 * MIN, T0 + 96 * MIN).nudgedAt).toBe(T0 + 90 * MIN)
})

test('a break is due 90 minutes into a stretch, then 90 minutes after each nudge', () => {
  expect(breakDue(null, T0)).toBe(false)
  const run = { start: T0, lastEnd: T0, nudgedAt: null }
  expect(breakDue(run, T0 + 90 * MIN - 1)).toBe(false)
  expect(breakDue(run, T0 + 90 * MIN)).toBe(true)
  const nudged = { ...run, nudgedAt: T0 + 90 * MIN }
  expect(breakDue(nudged, T0 + 179 * MIN)).toBe(false)
  expect(breakDue(nudged, T0 + 180 * MIN)).toBe(true)
  // One turn longer than 90 minutes is due at its end.
  expect(breakDue(nextStretch(null, T0, T0 + 95 * MIN), T0 + 95 * MIN)).toBe(true)
})

test('the span reads in minutes under 2 hours, then by the half hour', () => {
  expect(spanText(90 * MIN)).toBe('90 minutes')
  expect(spanText(99 * MIN)).toBe('95 minutes')
  expect(spanText(120 * MIN)).toBe('2 hours')
  expect(spanText(165 * MIN)).toBe('2 and a half hours')
  expect(spanText(180 * MIN)).toBe('3 hours')
})

test('the break lines take turns, each saying how long the stretch has run', () => {
  expect([0, 1, 2, 3, 4].map(n => breakLine(n, 120 * MIN))).toEqual([
    "*yawn* That's 2 hours straight. Stretch your legs?",
    '*yawn* 2 hours without a break. Water, maybe?',
    '*yawn* Even I need a break after 2 hours.',
    '*yawn* 2 hours in. Go look at something far away.',
    "*yawn* That's 2 hours straight. Stretch your legs?",
  ])
  expect(BREAK_LINES).toHaveLength(4)
})
