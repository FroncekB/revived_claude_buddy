import { expect, test } from 'claude-code/testing'

import type { Moment, TurnFacts } from '../types'
import {
  addCall, addMoments, ageText, awayMoment, bestsOf, isClean, isRough, memoryLine, mergeTurns, milestones, momentText,
  noCalls, noticeTurns, queueTurns, readable, recall, recallChance, talkMemories, turnFacts,
} from './journal'
import { zeroCounts } from './ledger'

// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const FACTS: TurnFacts = { reason: 'answer', durationMs: 4_000, calls: 3, failRun: 0, failRunGroup: null, afterRough: 0 }
const NO_BESTS = { failRun: 0, calls: 0 }
const notice = (f: Partial<TurnFacts>) => noticeTurns([{ ...FACTS, ...f }], NO_BESTS, 0, NOON).moments

test('failed calls build a run; a success ends it, and a run across groups has none', () => {
  let t = noCalls()
  for (let i = 0; i < 3; i++) t = addCall(t, 'shell', true)
  t = addCall(t, 'read', false)
  t = addCall(t, 'shell', true)
  t = addCall(t, 'edit', true)
  expect(t.calls).toBe(6)
  expect(t.longest).toEqual({ n: 3, group: 'shell' })
  expect(t.run).toEqual({ n: 2, group: null })
  // A run as long as the longest leaves the first in place; a longer one takes over.
  t = addCall(t, 'edit', true)
  expect(t.longest).toEqual({ n: 3, group: 'shell' })
  t = addCall(t, 'edit', true)
  expect(t.longest).toEqual({ n: 4, group: null })
})

test("a turn's facts carry its longest run, and say whether it was rough or clean", () => {
  let t = noCalls()
  for (let i = 0; i < 5; i++) t = addCall(t, 'web', true)
  expect(turnFacts('answer', 9_000, t, 2)).toEqual({
    reason: 'answer',
    durationMs: 9_000,
    calls: 5,
    failRun: 5,
    failRunGroup: 'web',
    afterRough: 2,
  })
  expect(turnFacts('answer', 9_000, noCalls(), 0)).toMatchObject({ failRun: 0, failRunGroup: null })
  expect(isRough({ ...FACTS, failRun: 1 })).toBe(true)
  expect(isRough({ ...FACTS, reason: 'error' })).toBe(true)
  expect(isRough({ ...FACTS, reason: 'aborted' })).toBe(true)
  expect(isRough(FACTS)).toBe(false)
  expect(isRough({ ...FACTS, reason: 'refusal' })).toBe(false)
  expect(isClean(FACTS)).toBe(true)
  expect(isClean({ ...FACTS, reason: 'refusal' })).toBe(false)
  expect(isClean({ ...FACTS, failRun: 1 })).toBe(false)
})

test('each kind of turn moment is logged at its floor and not one under', () => {
  expect(notice({ failRun: 5, failRunGroup: 'shell' })).toEqual([{ at: AT, kind: 'failRun', n: 5, group: 'shell' }])
  expect(notice({ failRun: 4, failRunGroup: 'shell' })).toEqual([])
  expect(notice({ failRun: 6, failRunGroup: null })).toEqual([{ at: AT, kind: 'failRun', n: 6 }])
  expect(notice({ durationMs: 600_000 })).toEqual([{ at: AT, kind: 'longTurn', n: 10 }])
  expect(notice({ durationMs: 599_999 })).toEqual([])
  expect(notice({ calls: 50 })).toEqual([{ at: AT, kind: 'busyTurn', n: 50 }])
  expect(notice({ calls: 49 })).toEqual([])
  expect(notice({ afterRough: 3 })).toEqual([{ at: AT, kind: 'comeback', n: 3 }])
  expect(notice({ afterRough: 2 })).toEqual([])
  // A comeback must be clean itself.
  expect(notice({ afterRough: 3, reason: 'refusal' })).toEqual([])
  expect(notice({ afterRough: 3, failRun: 1 })).toEqual([])
  // One turn can set several, in this order.
  expect(notice({ failRun: 5, durationMs: 600_000, calls: 50 }).map(m => m.kind)).toEqual(['failRun', 'longTurn', 'busyTurn'])
})

test("a record must beat the buddy's best; the longest turn is the stored counts' own", () => {
  expect(noticeTurns([{ ...FACTS, failRun: 7 }], { failRun: 7, calls: 0 }, 0, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, calls: 80 }], { failRun: 0, calls: 80 }, 0, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, durationMs: 900_000 }], NO_BESTS, 900_000, NOON).moments).toEqual([])
  expect(noticeTurns([{ ...FACTS, durationMs: 900_001 }], NO_BESTS, 900_000, NOON).moments).toEqual([
    { at: AT, kind: 'longTurn', n: 15 },
  ])
  expect(bestsOf({})).toEqual(NO_BESTS)
  expect(bestsOf({ bests: { failRun: 3, calls: 40 } })).toEqual({ failRun: 3, calls: 40 })
})

test('two queued turns cannot both take one record, and bests rise below the floors too', () => {
  const twice = noticeTurns([{ ...FACTS, failRun: 6 }, { ...FACTS, failRun: 6 }], NO_BESTS, 0, NOON)
  expect(twice.moments).toHaveLength(1)
  expect(twice.bests).toEqual({ failRun: 6, calls: 3 })
  const longer = noticeTurns([{ ...FACTS, durationMs: 700_000 }, { ...FACTS, durationMs: 650_000 }], NO_BESTS, 0, NOON)
  expect(longer.moments).toHaveLength(1)
  expect(noticeTurns([{ ...FACTS, failRun: 2, calls: 9 }], NO_BESTS, 0, NOON)).toEqual({
    moments: [],
    bests: { failRun: 2, calls: 9 },
  })
})

test('milestones are the marks a save crosses, turns before calls', () => {
  const counts = (turns: number, shell: number) => ({ ...zeroCounts(), turns, calls: { ...zeroCounts().calls, shell } })
  expect(milestones(counts(99, 0), counts(100, 0), NOON)).toEqual([{ at: AT, kind: 'turns', n: 100 }])
  expect(milestones(counts(100, 0), counts(101, 0), NOON)).toEqual([])
  expect(milestones(counts(5, 999), counts(6, 1_000), NOON)).toEqual([{ at: AT, kind: 'calls', n: 1_000 }])
  expect(milestones(counts(99, 999), counts(1_000, 1_000), NOON)).toEqual([
    { at: AT, kind: 'turns', n: 100 },
    { at: AT, kind: 'turns', n: 1_000 },
    { at: AT, kind: 'calls', n: 1_000 },
  ])
})

test('a visit after three or more missed days is a moment; a weekend away is not', () => {
  expect(awayMoment(null, '2026-10-07', NOON)).toBeNull()
  expect(awayMoment('2026-10-04', '2026-10-07', NOON)).toBeNull()
  expect(awayMoment('2026-10-03', '2026-10-07', NOON)).toEqual({ at: AT, kind: 'away', n: 4 })
})

test('the journal keeps its newest 20, and the turn queue its newest 20 per seed', () => {
  const many: Moment[] = Array.from({ length: 19 }, (_, i) => ({ at: AT, kind: 'turns' as const, n: i }))
  const kept = addMoments(many, [
    { at: AT, kind: 'away', n: 9 },
    { at: AT, kind: 'away', n: 10 },
  ])
  expect(kept).toHaveLength(20)
  expect(kept[0]?.n).toBe(1)
  expect(kept.at(-1)).toEqual({ at: AT, kind: 'away', n: 10 })
  expect(addMoments(undefined, [])).toEqual([])
  const queued = queueTurns(undefined, Array.from({ length: 25 }, (_, i) => ({ ...FACTS, calls: i })))
  expect(queued).toHaveLength(20)
  expect(queued[0]?.calls).toBe(5)
  const one = { ...FACTS, calls: 1 }
  const two = { ...FACTS, calls: 2 }
  expect(mergeTurns({ s: [one] }, { s: [two], t: [FACTS] })).toEqual({ s: [one, two], t: [FACTS] })
})

test('each moment reads as words with no date, numbers with commas', () => {
  const words = (m: Omit<Moment, 'at'>) => momentText({ at: AT, ...m })
  expect(words({ kind: 'failRun', n: 18, group: 'shell' })).toBe('Claude failed 18 shell commands in a row')
  expect(words({ kind: 'failRun', n: 7 })).toBe('Claude failed 7 tool calls in a row')
  expect(words({ kind: 'longTurn', n: 34 })).toBe('a 34-minute turn, the longest yet')
  expect(words({ kind: 'busyTurn', n: 73 })).toBe('73 tool calls in one turn')
  expect(words({ kind: 'turns', n: 1_000 })).toBe('1,000 turns together')
  expect(words({ kind: 'calls', n: 10_000 })).toBe('10,000 tool calls together')
  expect(words({ kind: 'comeback', n: 4 })).toBe('a clean turn after 4 rough ones')
  expect(words({ kind: 'away', n: 9 })).toBe('back after 9 days away')
  const nouns = (['shell', 'edit', 'read', 'web', 'agent', 'mcp', 'other'] as const).map(group =>
    words({ kind: 'failRun', n: 5, group }).replace('Claude failed 5 ', '').replace(' in a row', ''),
  )
  expect(nouns).toEqual(['shell commands', 'edits', 'file reads', 'web fetches', 'agent calls', 'MCP calls', 'tool calls'])
  // Under 100,000, no moment's words outgrow the journal pane's 45 columns.
  expect(words({ kind: 'failRun', n: 99_999, group: 'shell' }).length).toBeLessThanOrEqual(45)
})

test("a newer build's kind and a damaged entry are skipped", () => {
  const odd = [
    { at: AT, kind: 'party', n: 1 },
    { at: 'never', kind: 'away', n: 9 },
    { at: AT, kind: 'away', n: 9 },
  ] as unknown as Moment[]
  expect(readable(odd)).toEqual([{ at: AT, kind: 'away', n: 9 }])
  expect(readable(undefined)).toEqual([])
})

test('ages count calendar days between local dates', () => {
  const daysAgo = (d: number) => new Date(2026, 9, 7 - d, 12).toISOString()
  const ages: [number, string][] = [
    [0, 'today'],
    [1, 'yesterday'],
    [2, '2 days ago'],
    [6, '6 days ago'],
    [7, 'last week'],
    [13, 'last week'],
    [14, '2 weeks ago'],
    [59, '8 weeks ago'],
    [60, '2 months ago'],
    [729, '24 months ago'],
    [730, '2 years ago'],
  ]
  for (const [d, text] of ages) expect(ageText(daysAgo(d), NOON)).toBe(text)
  // Late on the night daylight saving ends in the US is yesterday the next morning.
  expect(ageText(new Date(2026, 10, 1, 23, 30).toISOString(), new Date(2026, 10, 2, 0, 30).getTime())).toBe('yesterday')
  // A moment stamped a minute ahead, by another machine's clock, is today.
  expect(ageText(new Date(NOON + 60_000).toISOString(), NOON)).toBe('today')
})

// Six days before NOON, and half an hour before it.
const OLD = new Date(2026, 9, 1, 12).toISOString()
const FRESH = new Date(NOON - 30 * 60_000).toISOString()
const STATS = { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }
const JOURNAL: Moment[] = [
  { at: OLD, kind: 'failRun', n: 9, group: 'shell' },
  { at: OLD, kind: 'failRun', n: 18, group: 'shell' },
  { at: OLD, kind: 'busyTurn', n: 60 },
  { at: OLD, kind: 'failRun', n: 18, group: 'edit' },
  { at: OLD, kind: 'comeback', n: 4 },
  { at: FRESH, kind: 'longTurn', n: 40 },
]
const remember = (f: Partial<TurnFacts>, roll = 0.99, pick = 0) =>
  recall({ journal: JOURNAL, facts: { ...FACTS, ...f }, now: NOON, stats: STATS, roll, pick })

test('a quip remembers what its turn echoes first: the largest of that kind, the newest on a tie', () => {
  expect(remember({ failRun: 2 })).toEqual(JOURNAL[3])
  expect(remember({ calls: 30 })).toEqual(JOURNAL[2])
  expect(remember({ afterRough: 1 })).toEqual(JOURNAL[4])
  // Failures come before a long turn.
  expect(remember({ failRun: 2, durationMs: 200_000 })).toEqual(JOURNAL[3])
})

test('a memory under an hour old is never recalled, and with nothing to echo WISDOM decides', () => {
  // The only longTurn memory is half an hour old, so a long turn falls to the roll.
  expect(remember({ durationMs: 200_000 })).toBeNull()
  expect(remember({ durationMs: 200_000 }, 0.1, 0)).toEqual(JOURNAL[0])
  // `pick` chooses among the five old enough.
  expect(remember({}, 0.1, 0.99)).toEqual(JOURNAL[4])
  // WISDOM 50 gives 0.175.
  expect(remember({}, 0.17)).not.toBeNull()
  expect(remember({}, 0.18)).toBeNull()
  expect(Math.abs(recallChance({ ...STATS, WISDOM: 1 }) - 0.0525)).toBeLessThanOrEqual(1e-9)
  expect(recallChance(STATS)).toBe(0.175)
  expect(recallChance({ ...STATS, WISDOM: 100 })).toBe(0.3)
  expect(recall({ journal: undefined, facts: { ...FACTS, failRun: 3 }, now: NOON, stats: STATS, roll: 0, pick: 0 })).toBeNull()
})

test('a memory reads as one prompt line, and a talk carries the three newest', () => {
  expect(memoryLine(JOURNAL[1]!, NOON)).toBe(
    'A memory (6 days ago): Claude failed 18 shell commands in a row. Bring it up if it fits, as "remember when...", without a date.',
  )
  expect(talkMemories(undefined, NOON)).toEqual([])
  expect(talkMemories(JOURNAL, NOON)).toEqual([
    'Your memories, newest first:',
    '- today: a 40-minute turn, the longest yet',
    '- 6 days ago: a clean turn after 4 rough ones',
    '- 6 days ago: Claude failed 18 edits in a row',
    'Mention one only if it fits what they said.',
  ])
  expect(talkMemories(JOURNAL.slice(0, 1), NOON)).toHaveLength(3)
})
