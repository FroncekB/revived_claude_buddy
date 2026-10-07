import { expect, test } from 'claude-code/testing'

import type { Mood, MoodEvent } from '../types'
import {
  MAX_QUEUED_MOOD, MOOD_GAP_MS, MOOD_STEP_MS, applyMood, decayMood, mergeMood, moodLine, moodOf, neutralMood,
  queueMood, sulkFor, turnMood, withSulk,
} from './mood'

const T0 = Date.UTC(2026, 9, 7, 12)
const iso = (ms: number) => new Date(ms).toISOString()
const mood = (meter: number, sulk = 0, since = T0): Mood => ({ meter, sulk, at: iso(since) })

test('each event moves the meter or the sulk by one', () => {
  expect(applyMood(mood(0), ['fail'], T0).meter).toBe(-1)
  expect(applyMood(mood(-2), ['clean'], T0).meter).toBe(-1)
  expect(applyMood(mood(0), ['clean'], T0).meter).toBe(0)
  expect(applyMood(mood(2), ['clean'], T0).meter).toBe(2)
  expect(applyMood(mood(0), ['longClean'], T0).meter).toBe(1)
  expect(applyMood(mood(-3), ['longClean'], T0).meter).toBe(-2)
  expect(applyMood(mood(0, 2), ['soothe'], T0).sulk).toBe(1)
  expect(applyMood(mood(0, 0), ['soothe'], T0).sulk).toBe(0)
})

test('the meter stays within -6 and 6, and the sulk within 0 and 3', () => {
  const fails: MoodEvent[] = Array.from({ length: 10 }, () => 'fail')
  const wins: MoodEvent[] = Array.from({ length: 10 }, () => 'longClean')
  expect(applyMood(mood(0), fails, T0).meter).toBe(-6)
  expect(applyMood(mood(0), wins, T0).meter).toBe(6)
  expect(withSulk(mood(0), 9, T0).sulk).toBe(3)
})

test('a missing mood is neutral', () => {
  expect(decayMood(undefined, T0)).toEqual(neutralMood(T0))
  expect(moodOf(undefined, T0)).toBe('neutral')
  expect(applyMood(undefined, ['fail'], T0)).toEqual({ meter: -1, sulk: 0, at: iso(T0) })
})

test('mood fades one step per 30 minutes, moving its clock by whole steps', () => {
  const m = mood(-4, 2)
  expect(decayMood(m, T0 + MOOD_STEP_MS - 1)).toEqual(m)
  expect(decayMood(m, T0 + MOOD_STEP_MS + 5_000)).toEqual({ meter: -3, sulk: 1, at: iso(T0 + MOOD_STEP_MS) })
  // Read every 29 minutes, it still fades: three steps by 116 minutes.
  let seen = m
  for (let t = T0; t <= T0 + 4 * MOOD_STEP_MS; t += 29 * 60_000) seen = decayMood(seen, t)
  expect(seen.meter).toBe(-1)
})

test('one gap counts for at most two hours', () => {
  const nextMorning = T0 + 8 * 60 * 60_000
  expect(decayMood(mood(-6), nextMorning)).toEqual({ meter: -2, sulk: 0, at: iso(nextMorning) })
  expect(moodOf(mood(-6), nextMorning)).toBe('anxious')
  expect(decayMood(mood(3), T0 + MOOD_GAP_MS)).toEqual({ meter: 0, sulk: 0, at: iso(T0 + MOOD_GAP_MS) })
})

test("a neutral mood's clock starts over at the event that moves it", () => {
  const moved = applyMood(mood(0, 0, T0 - 25 * 60_000), ['fail'], T0)
  expect(moved).toEqual({ meter: -1, sulk: 0, at: iso(T0) })
  // So the failure lasts a full step, not the 5 minutes left on the old clock.
  expect(decayMood(moved, T0 + 10 * 60_000).meter).toBe(-1)
  expect(withSulk(mood(0, 0, T0 - 25 * 60_000), 2, T0)).toEqual({ meter: 0, sulk: 2, at: iso(T0) })
})

test('mood reads sulky first, then anxious at -2 or below, smug at 2 or above', () => {
  expect(moodOf(mood(-1), T0)).toBe('neutral')
  expect(moodOf(mood(-2), T0)).toBe('anxious')
  expect(moodOf(mood(1), T0)).toBe('neutral')
  expect(moodOf(mood(2), T0)).toBe('smug')
  expect(moodOf(mood(-6, 1), T0)).toBe('sulky')
  expect(moodOf(mood(6, 1), T0)).toBe('sulky')
})

test('events replay in order', () => {
  expect(applyMood(mood(0), ['fail', 'clean'], T0).meter).toBe(0)
  expect(applyMood(mood(0), ['clean', 'fail'], T0).meter).toBe(-1)
})

test('days away leave a sulk on the first visit of a new day', () => {
  expect(sulkFor(null, '2026-10-07')).toBe(0)
  expect(sulkFor('2026-10-06', '2026-10-07')).toBe(0)
  expect(sulkFor('2026-10-05', '2026-10-07')).toBe(0)
  // Friday to Monday misses two days.
  expect(sulkFor('2026-10-09', '2026-10-12')).toBe(1)
  expect(sulkFor('2026-10-05', '2026-10-12')).toBe(3)
  expect(sulkFor('2026-09-01', '2026-10-12')).toBe(3)
})

test('a sulk is kept when it is already deeper', () => {
  expect(withSulk(mood(0, 3), 1, T0).sulk).toBe(3)
  expect(withSulk(mood(-3, 1), 2, T0)).toEqual({ meter: -3, sulk: 2, at: iso(T0) })
})

test('a finished turn becomes a fail, a clean turn, a long clean turn, or nothing', () => {
  expect(turnMood('error', 1_000, 0)).toBe('fail')
  expect(turnMood('aborted', 1_000, 0)).toBe('fail')
  expect(turnMood('answer', 1_000, 0)).toBe('clean')
  expect(turnMood('answer', 120_000, 0)).toBe('clean')
  expect(turnMood('answer', 120_001, 0)).toBe('longClean')
  expect(turnMood('answer', 200_000, 1)).toBeNull()
  expect(turnMood('refusal', 200_000, 0)).toBeNull()
})

test('the queue keeps the newest 20 events, and a failed save puts its events back in front', () => {
  const many: MoodEvent[] = Array.from({ length: 25 }, (_, i) => (i < 5 ? 'soothe' : 'fail'))
  expect(queueMood(undefined, many)).toEqual(Array.from({ length: MAX_QUEUED_MOOD }, () => 'fail'))
  expect(mergeMood({ a: ['fail'] }, { a: ['clean'], b: ['soothe'] })).toEqual({ a: ['fail', 'clean'], b: ['soothe'] })
})

test('the persona hears the mood only when there is one', () => {
  expect(moodLine('neutral')).toBeNull()
  expect(moodLine('anxious')).toBe('Mood: anxious, after a run of failures. Let it color the line.')
  expect(moodLine('smug')).toBe('Mood: smug, after some long clean turns. Let it color the line.')
  expect(moodLine('sulky')).toBe('Mood: sulky, the developer stayed away for days. Let it color the line.')
})
