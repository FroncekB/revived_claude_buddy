// The journal (Memory spec): notable moments in a buddy's life, how a session's turns become
// them, and how they read. Pure: no $.
import type { Bests, Buddy, Counts, Moment, MomentKind, ToolGroup, TurnFacts } from '../types'
import { daysBetween, totalCalls } from './ledger'

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

const iso = (ms: number) => new Date(ms).toISOString()

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

export function turnFacts(reason: TurnFacts['reason'], durationMs: number, t: TurnCalls, afterRough: number): TurnFacts {
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
  return { failRun: b.bests?.failRun ?? 0, calls: b.bests?.calls ?? 0 }
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
  let { failRun, calls } = bests
  let longest = longestTurnMs
  for (const f of facts) {
    if (f.failRun > failRun && f.failRun >= FAIL_RUN_FLOOR) {
      moments.push({ at, kind: 'failRun', n: f.failRun, ...(f.failRunGroup ? { group: f.failRunGroup } : {}) })
    }
    if (f.durationMs > longest && f.durationMs >= LONG_TURN_FLOOR_MS) {
      moments.push({ at, kind: 'longTurn', n: Math.floor(f.durationMs / 60_000) })
    }
    if (f.calls > calls && f.calls >= BUSY_TURN_FLOOR) moments.push({ at, kind: 'busyTurn', n: f.calls })
    if (isClean(f) && f.afterRough >= ROUGH_FLOOR) moments.push({ at, kind: 'comeback', n: f.afterRough })
    failRun = Math.max(failRun, f.failRun)
    calls = Math.max(calls, f.calls)
    longest = Math.max(longest, f.durationMs)
  }
  return { moments, bests: { failRun, calls } }
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

// Appends `moments`, keeping the newest MAX_MOMENTS. A missing journal is empty.
export function addMoments(journal: readonly Moment[] | undefined, moments: readonly Moment[]): Moment[] {
  return [...(journal ?? []), ...moments].slice(-MAX_MOMENTS)
}

// Adds `facts` to a queue, keeping the newest MAX_QUEUED_TURNS.
export function queueTurns(queue: readonly TurnFacts[] | undefined, facts: readonly TurnFacts[]): TurnFacts[] {
  return [...(queue ?? []), ...facts].slice(-MAX_QUEUED_TURNS)
}

// Puts `older` back in front of anything queued since, seed by seed.
export function mergeTurns(
  older: Readonly<Record<string, readonly TurnFacts[]>>,
  newer: Readonly<Record<string, readonly TurnFacts[]>>,
): Record<string, TurnFacts[]> {
  const merged: Record<string, TurnFacts[]> = {}
  for (const seed of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    merged[seed] = queueTurns(older[seed], newer[seed] ?? [])
  }
  return merged
}
