// The journal (Memory spec): notable moments in a buddy's life, how a session's turns become
// them, and how they read. Pure: no $.
import type { Bests, Buddy, Counts, Moment, MomentKind, ToolGroup, TurnFacts, TurnReason } from '../types'
import { daysBetween, localDay, totalCalls, withCommas } from './ledger'
import type { Stats } from './roll'
import { LONG_TURN_MS } from './voice'

export const MAX_MOMENTS = 20
export const MAX_QUEUED_TURNS = 20

// The floors (Memory spec section 2). A record must also beat the buddy's best.
export const FAIL_RUN_FLOOR = 5
export const LONG_TURN_FLOOR_MS = 10 * 60_000
export const BUSY_TURN_FLOOR = 50
export const ROUGH_FLOOR = 3
// Days between two visits: three missed days.
export const AWAY_FLOOR_DAYS = 4
export const TURN_MARKS: readonly number[] = [100, 1_000, 10_000]
export const CALL_MARKS: readonly number[] = [1_000, 10_000, 100_000]

// A quip only remembers a moment this old, so a record its own turn just set isn't "remembered".
export const RECALL_AGE_MS = 60 * 60_000
// A turn with this many calls echoes a busyTurn memory.
export const BUSY_RECALL = 25
export const TALK_MEMORIES = 3
// A memory recalled in this session is not recalled again for this long.
export const RECALL_REPEAT_MS = 60 * 60_000

// A moment's identity for the repeat rule: a kind, a number and a time.
export function momentKey(m: Moment): string {
  return `${m.kind}:${m.n}:${m.at}`
}

// The kinds this build can read. `satisfies` makes the compiler flag a kind added to MomentKind
// and left out here.
const KINDS = {
  failRun: true,
  longTurn: true,
  busyTurn: true,
  turns: true,
  calls: true,
  comeback: true,
  away: true,
  grew: true,
} satisfies Record<MomentKind, true>

const NOUN: Record<ToolGroup, string> = {
  shell: 'shell commands',
  edit: 'edits',
  read: 'file reads',
  web: 'web fetches',
  agent: 'agent calls',
  mcp: 'MCP calls',
  other: 'tool calls',
}

const iso = (ms: number) => new Date(ms).toISOString()
const minutes = (ms: number) => Math.floor(ms / 60_000)

// A run of consecutive failed calls: its length, and its group while every call in it shares one.
export type Run = { n: number; group: ToolGroup | null }
// The current main turn's calls that ran, the run going now, and the longest run so far.
export type TurnCalls = { calls: number; run: Run; longest: Run }

export function noCalls(): TurnCalls {
  return { calls: 0, run: { n: 0, group: null }, longest: { n: 0, group: null } }
}

// One main-conversation call that ran: a failure extends the run, anything else ends it. Of two
// runs the same length, the longest stays the first.
export function addCall(t: TurnCalls, group: ToolGroup, failed: boolean): TurnCalls {
  if (!failed) return { ...t, calls: t.calls + 1, run: { n: 0, group: null } }
  const run: Run = { n: t.run.n + 1, group: t.run.n === 0 || t.run.group === group ? group : null }
  return { calls: t.calls + 1, run, longest: run.n > t.longest.n ? run : t.longest }
}

// A turn is rough when it errored, was aborted, or had a failed call; clean when it answered
// with none.
export function isRough(f: Pick<TurnFacts, 'reason' | 'failRun'>): boolean {
  return f.reason === 'error' || f.reason === 'aborted' || f.failRun > 0
}

export function isClean(f: Pick<TurnFacts, 'reason' | 'failRun'>): boolean {
  return f.reason === 'answer' && f.failRun === 0
}

export function turnFacts(reason: TurnReason, durationMs: number, t: TurnCalls, afterRough: number): TurnFacts {
  return {
    reason,
    durationMs,
    calls: t.calls,
    failRun: t.longest.n,
    failRunGroup: t.longest.n > 0 ? t.longest.group : null,
    afterRough,
  }
}

// A buddy's bests; missing ones read as zero.
export function bestsOf(b: Pick<Buddy, 'bests'>): Bests {
  return { failRun: b.bests?.failRun ?? 0, calls: b.bests?.calls ?? 0, rough: b.bests?.rough ?? 0 }
}

// Walks one buddy's finished turns in order. Each record is judged against bests that rise as
// the walk goes, so two queued turns can't both take one. `longestTurnMs` is the stored counts'
// own longest turn, from before these turns were added.
export function noticeTurns(
  facts: readonly TurnFacts[],
  bests: Bests,
  longestTurnMs: number,
  now: number,
): { moments: Moment[]; bests: Bests } {
  const at = iso(now)
  const moments: Moment[] = []
  let { failRun, calls, rough } = bests
  let longest = longestTurnMs
  for (const f of facts) {
    if (f.failRun > failRun && f.failRun >= FAIL_RUN_FLOOR) {
      moments.push({ at, kind: 'failRun', n: f.failRun, ...(f.failRunGroup ? { group: f.failRunGroup } : {}) })
    }
    // Judged in the whole minutes it shows, so two longest turns never read the same.
    if (minutes(f.durationMs) > minutes(longest) && f.durationMs >= LONG_TURN_FLOOR_MS) {
      moments.push({ at, kind: 'longTurn', n: minutes(f.durationMs) })
    }
    if (f.calls > calls && f.calls >= BUSY_TURN_FLOOR) moments.push({ at, kind: 'busyTurn', n: f.calls })
    // A comeback is a record like the rest: only a clean turn ends a run of rough ones.
    if (isClean(f)) {
      if (f.afterRough > rough && f.afterRough >= ROUGH_FLOOR) moments.push({ at, kind: 'comeback', n: f.afterRough })
      rough = Math.max(rough, f.afterRough)
    }
    failRun = Math.max(failRun, f.failRun)
    calls = Math.max(calls, f.calls)
    longest = Math.max(longest, f.durationMs)
  }
  return { moments, bests: { failRun, calls, rough } }
}

function crossed(marks: readonly number[], before: number, after: number, kind: MomentKind, at: string): Moment[] {
  return marks.filter(mark => before < mark && mark <= after).map(n => ({ at, kind, n }))
}

// The lifetime marks one save's counts crossed, turns before calls.
export function milestones(before: Counts, after: Counts, now: number): Moment[] {
  const at = iso(now)
  return [
    ...crossed(TURN_MARKS, before.turns, after.turns, 'turns', at),
    ...crossed(CALL_MARKS, totalCalls(before), totalCalls(after), 'calls', at),
  ]
}

// A new day's visit after three or more missed days; null for a shorter gap or a first visit.
export function awayMoment(lastDay: string | null, today: string, now: number): Moment | null {
  if (lastDay === null) return null
  const days = daysBetween(lastDay, today)
  return days >= AWAY_FLOOR_DAYS ? { at: iso(now), kind: 'away', n: days } : null
}

// A stored journal as an array. Anything else, a damaged field, reads as empty.
function stored(journal: readonly Moment[] | undefined): readonly Moment[] {
  return Array.isArray(journal) ? journal : []
}

// Appends `moments`, keeping the newest MAX_MOMENTS. A missing or damaged journal is empty, so the
// next save replaces a damaged one.
export function addMoments(journal: readonly Moment[] | undefined, moments: readonly Moment[]): Moment[] {
  return [...stored(journal), ...moments].slice(-MAX_MOMENTS)
}

// The moments this build can read, oldest first. Only the newest MAX_MOMENTS are read, so a
// journal over the cap grows no pane or prompt. A newer build's kind, or a damaged entry, is
// skipped: kept in the journal, never shown or recalled. A journal that isn't an array is empty.
export function readable(journal: readonly Moment[] | undefined): Moment[] {
  return stored(journal).slice(-MAX_MOMENTS).filter(
    m =>
      typeof m === 'object' &&
      m !== null &&
      Object.hasOwn(KINDS, m.kind) &&
      Number.isFinite(m.n) &&
      Number.isFinite(Date.parse(m.at)),
  )
}

// A moment's words, with no date: "Claude failed 18 shell commands in a row".
export function momentText(m: Moment): string {
  const n = withCommas(m.n)
  switch (m.kind) {
    case 'failRun':
      return `Claude failed ${n} ${NOUN[m.group ?? 'other'] ?? NOUN.other} in a row`
    case 'longTurn':
      return `a ${n}-minute turn, the longest yet`
    case 'busyTurn':
      return `${n} tool calls in one turn`
    case 'turns':
      return `${n} turns together`
    case 'calls':
      return `${n} tool calls together`
    case 'comeback':
      return `a clean turn after ${n} rough ones`
    case 'away':
      return `back after ${n} days away`
    case 'grew':
      return m.n >= 2 ? 'grew into an elder' : 'grew into an adult'
  }
}

// How long ago `at` was, in calendar days between the local dates, so daylight saving can't move it.
export function ageText(at: string, now: number): string {
  const then = Date.parse(at)
  const days = Number.isFinite(then) ? Math.max(0, daysBetween(localDay(then), localDay(now))) : 0
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 730) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// WISDOM 1 to 100 gives a chance from 0.0525 to 0.30 that a quip with nothing to echo remembers anyway.
export function recallChance(stats: Stats): number {
  return 0.05 + (0.25 * stats.WISDOM) / 100
}

// The kinds of memory a finished turn echoes, the most telling first.
function echoes(f: TurnFacts): MomentKind[] {
  const kinds: MomentKind[] = []
  if (f.failRun > 0) kinds.push('failRun')
  if (f.durationMs > LONG_TURN_MS) kinds.push('longTurn')
  if (f.calls >= BUSY_RECALL) kinds.push('busyTurn')
  if (isClean(f) && f.afterRough >= 1) kinds.push('comeback')
  return kinds
}

// The one memory a quip carries, or null (Memory spec section 4). Only memories an hour old or
// more count, and not one `recalled` took in the last RECALL_REPEAT_MS: `recalled` maps a
// moment's key to the time it was last recalled. One the turn echoes comes first: the largest of
// its kind, the newest on a tie. Otherwise, when `roll` comes in under WISDOM's chance, `pick`
// chooses one.
export function recall(o: {
  journal: readonly Moment[] | undefined
  facts: TurnFacts
  now: number
  stats: Stats
  roll: number
  pick: number
  recalled?: Readonly<Record<string, number>>
}): Moment | null {
  const recalled = o.recalled ?? {}
  const eligible = readable(o.journal).filter(m => {
    if (o.now - Date.parse(m.at) < RECALL_AGE_MS) return false
    const last = recalled[momentKey(m)]
    return last === undefined || o.now - last >= RECALL_REPEAT_MS
  })
  for (const kind of echoes(o.facts)) {
    let best: Moment | null = null
    for (const m of eligible) if (m.kind === kind && (!best || m.n >= best.n)) best = m
    if (best) return best
  }
  if (eligible.length === 0 || o.roll >= recallChance(o.stats)) return null
  return eligible[Math.min(eligible.length - 1, Math.floor(o.pick * eligible.length))] ?? null
}

// The quip prompt's line for a recalled memory.
export function memoryLine(m: Moment, now: number): string {
  return `A memory (${ageText(m.at, now)}): ${momentText(m)}. Bring it up if it fits, as "remember when...", without a date.`
}

// The talk prompt's lines: the newest TALK_MEMORIES memories, newest first; none for an empty journal.
export function talkMemories(journal: readonly Moment[] | undefined, now: number): string[] {
  const newest = readable(journal).slice(-TALK_MEMORIES).reverse()
  if (newest.length === 0) return []
  return [
    'Your memories, newest first:',
    ...newest.map(m => `- ${ageText(m.at, now)}: ${momentText(m)}`),
    'Mention one only if it fits what they said.',
  ]
}
