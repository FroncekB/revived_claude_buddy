# `buddy` Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each buddy a journal of up to 20 notable moments (records, milestones, comebacks, returns) that quips and talk replies call back to, and that `/buddy journal` lists in a pane, with no new model calls.

**Architecture:** A new pure module, `journal.ts`, carries every rule:
- how a turn's calls become a run of failures
- which turns, saves and visits make moments
- the cap
- how a moment reads, and how old it is
- which memory a quip recalls

`record.ts` applies it inside the flush and the visit, against the freshly read store, so records and milestones are judged on the latest totals from every session. `voice.ts` takes finished memory lines into its prompts, `layout.ts` and `card.ts` draw the journal as text and as SVG, and `register.tsx` stays wiring only:
- it tracks the turn's calls and the rough-turn count in module variables
- it queues each finished turn's facts in `$.state` beside the counts and mood events
- it rolls for recall
- it opens the journal pane

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.293 when this was written) for `claude plugin test` and `claude plugin validate`, and TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md), Foundation [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) and Alive [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md).

**Starting point:** branch `claude/issue-10-2c0b17` at the spec commit `2466dd2`, on top of `main` at `80b711e`. 204 tests pass.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block that runs Claude Code starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text, as it stands after the earlier tasks. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit.
- **Line endings:** LF. Write files with the editor tools, not a Python `write_text` on Windows, which writes CRLF.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared at the top level of the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`, and every key is declared in `PluginState` in `buddy/types/index.d.ts`.
- **Tests find elements by text or type, never by `key`.** In the band, only sprite rows may set `bold`. The panes may.
- **No Node or DOM.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Every hook catches its own errors** and lets the event continue (`next(e)`, or returns `next`'s result unchanged). Work started from a hook goes through `later`, so a tool result or a turn never waits on a state write.
- **No new model calls.** Haiku calls keep model `haiku`, `timeoutMs: 8000`, `maxTokens: 80` for speech and 200 for hatch. `shouldQuip` is unchanged.
- **Privacy:** a moment holds only a kind, a number, a tool group and a time. Never a tool name, a command, a prompt, an answer or a file.
- **Forward compatibility:** every change starts from the stored object and spreads it at every level (top, `you`, each `buddies` entry, each `mood`, each `bests`), so fields a newer build wrote survive. A moment of a kind this build doesn't know is kept in the journal but never shown or recalled.
- **Time zones:** tests build local times with `new Date(y, monthIndex, d, h, min)`, never from a `Z` string, so they pass in any zone.
- **Numbers** (spec sections 2 to 5):

  | What | Value |
  |-|-|
  | Journal cap | the newest 20 moments per buddy |
  | Queued turn facts | the newest 20 per seed |
  | failRun floor | a run of 5 consecutive failed calls |
  | longTurn floor | 10 min (600,000 ms); `n` is whole minutes |
  | busyTurn floor | 50 tool calls in one turn |
  | comeback floor | 3 rough turns in a row before a clean one |
  | away floor | `daysBetween(lastDay, today) >= 4` |
  | Milestones | turns 100, 1,000, 10,000; tool calls 1,000, 10,000, 100,000 |
  | Recall age | a memory at least 1 hour old |
  | Recall echo | failed call → failRun; over 2 min → longTurn; 25+ calls → busyTurn; clean after a rough turn → comeback |
  | Recall chance | `0.05 + 0.25 * WISDOM / 100` |
  | Talk memories | the 3 newest |
  | Text fallback | the header and the newest 10 |
  | Journal SVG | 420 px wide; header at y 44; rows from y 76, 22 px apart, 12 px text; age at x 24, words at x 124; height `100 + (max(1, rows) - 1) * 22` |

- **Exact text:**

  | Where | Text |
  |-|-|
  | failRun | `Claude failed 18 shell commands in a row` |
  | longTurn | `a 34-minute turn, the longest yet` |
  | busyTurn | `73 tool calls in one turn` |
  | turns / calls | `1,000 turns together` / `10,000 tool calls together` |
  | comeback | `a clean turn after 4 rough ones` |
  | away | `back after 9 days away` |
  | Group nouns | shell commands, edits, file reads, web fetches, agent calls, MCP calls, tool calls (other, mixed or unknown) |
  | Ages | `today`, `yesterday`, `N days ago` (2–6), `last week` (7–13), `N weeks ago` (14–59), `N months ago` (60–729), `N years ago` |
  | Quip line | `A memory (6 days ago): <text>. Bring it up if it fits, as "remember when...", without a date.` |
  | Talk lines | `Your memories, newest first:`, then `- <age>: <text>` per memory, then `Mention one only if it fits what they said.` |
  | Journal | `Pip's journal`; empty: `Nothing in Pip's journal yet.` |
  | Usage | `Usage: /buddy [pet \| card \| journal \| mute \| unmute \| off \| reroll [confirm]]` |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. `reactionPrompt` and `talkPrompt` take finished lines (`memory: string | null`, `memories: readonly string[]`), so `voice.ts` doesn't import `journal.ts`. `journal.ts` imports `LONG_TURN_MS` from `voice.ts`, as `mood.ts` does.
2. The run of failed calls, the turn's call count and the facts built from them are pure helpers in `journal.ts` (`noCalls`, `addCall`, `turnFacts`, `isRough`, `isClean`), so `register.tsx` only stores them.
3. `readable(journal)` skips moments this build can't read (a newer build's kind, or a damaged entry) wherever moments are shown or recalled. The spec doesn't say what happens to them.
4. The journal SVG's rows are 12 px text with the words 100 px in, not 110. That keeps a 44-character line inside the frame.
5. The WISDOM gate is tested in `journal.test.ts` only. The mod-level tests don't stub `Math.random`, so they check the relevant-memory path, which needs no roll.
6. `parseSub` and `USAGE` change in Task 6, with the command, rather than with the record in Task 3, so no build between them answers `/buddy journal` with nothing.

---

### Task 1: Noticing moments

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/ledger.ts`
- Modify: `buddy/hooks/layout.ts`
- Create: `buddy/hooks/journal.ts`
- Test: `buddy/hooks/journal.test.ts`

**Interfaces:**
- Consumes: `daysBetween`, `totalCalls` from `ledger.ts`.
- Produces:
  - types `Moment`, `MomentKind`, `Bests`, `TurnFacts`; `journal?: Moment[]` and `bests?: Bests` on `Buddy`
  - `withCommas(n: number): string` exported from `ledger.ts`
  - from `journal.ts`:
    - constants `MAX_MOMENTS`, `MAX_QUEUED_TURNS`, `FAIL_RUN_FLOOR`, `LONG_TURN_FLOOR_MS`, `BUSY_TURN_FLOOR`, `ROUGH_FLOOR`, `AWAY_FLOOR_DAYS`, `TURN_MARKS`, `CALL_MARKS`
    - types `Run = { n: number; group: ToolGroup | null }` and `TurnCalls = { calls: number; run: Run; longest: Run }`
    - `noCalls(): TurnCalls`
    - `addCall(t: TurnCalls, group: ToolGroup, failed: boolean): TurnCalls`
    - `isRough(f: Pick<TurnFacts, 'reason' | 'failRun'>): boolean` and `isClean(...)`, same shape
    - `turnFacts(reason, durationMs, t: TurnCalls, afterRough): TurnFacts`
    - `bestsOf(b: Pick<Buddy, 'bests'>): Bests`
    - `noticeTurns(facts, bests, longestTurnMs, now): { moments: Moment[]; bests: Bests }`
    - `milestones(before: Counts, after: Counts, now): Moment[]`
    - `awayMoment(lastDay: string | null, today: string, now): Moment | null`
    - `addMoments(journal: readonly Moment[] | undefined, moments: readonly Moment[]): Moment[]`
    - `queueTurns(queue: readonly TurnFacts[] | undefined, facts: readonly TurnFacts[]): TurnFacts[]`
    - `mergeTurns(older, newer): Record<string, TurnFacts[]>`

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/journal.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Moment, TurnFacts } from '../types'
import {
  addCall, addMoments, awayMoment, bestsOf, isClean, isRough, mergeTurns, milestones, noCalls, noticeTurns, queueTurns,
  turnFacts,
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
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `journal.test.ts` fails to load, because there is no `./journal`. The other 204 pass.

- [ ] **Step 3: Add the types**

In `buddy/types/index.d.ts`, replace
```ts
export type MoodEvent = 'fail' | 'clean' | 'longClean' | 'soothe'

export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  // Missing reads as neutral.
  mood?: Mood
}
```
with:
```ts
export type MoodEvent = 'fail' | 'clean' | 'longClean' | 'soothe'

// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away'

export type Moment = {
  // When the save or visit that wrote it happened.
  at: string
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days.
  n: number
  // failRun only, when the whole run was in one group.
  group?: ToolGroup
}

// Records past the ones `counts` keeps: the longest run of failed calls in one turn and the most
// calls in one turn. They track the largest seen, whether or not it was logged.
export type Bests = {
  failRun: number
  calls: number
}

// One finished main turn, as the journal reads it (Memory spec section 3).
export type TurnFacts = {
  reason: 'answer' | 'aborted' | 'refusal' | 'error'
  durationMs: number
  // Tool calls that ran: a denied call never did.
  calls: number
  // The turn's longest run of consecutive failed calls, and its group; null when it spanned groups.
  failRun: number
  failRunGroup: ToolGroup | null
  // Rough turns in a row just before this one, in this session.
  afterRough: number
}

export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  // Missing reads as neutral.
  mood?: Mood
  // Oldest first, at most 20. Missing reads as empty.
  journal?: Moment[]
  // Missing reads as zeros.
  bests?: Bests
}
```

- [ ] **Step 4: Share `withCommas`**

In `buddy/hooks/ledger.ts`, replace
```ts
export function totalCalls(c: Counts): number {
  return TOOL_GROUPS.reduce((sum, g) => sum + c.calls[g], 0)
}
```
with:
```ts
export function totalCalls(c: Counts): number {
  return TOOL_GROUPS.reduce((sum, g) => sum + c.calls[g], 0)
}

// 1234567 as "1,234,567".
export function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
```
In `buddy/hooks/layout.ts`, replace
```ts
import { totalCalls } from './ledger'
```
with:
```ts
import { totalCalls, withCommas } from './ledger'
```
and replace
```ts
const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const howMany = (n: number, noun: string) => `${withCommas(n)} ${noun}${n === 1 ? '' : 's'}`
```
with:
```ts
const howMany = (n: number, noun: string) => `${withCommas(n)} ${noun}${n === 1 ? '' : 's'}`
```

- [ ] **Step 5: Write `journal.ts`**

Create `buddy/hooks/journal.ts`:
```ts
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
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 212 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/ledger.ts buddy/hooks/layout.ts buddy/hooks/journal.ts buddy/hooks/journal.test.ts
git commit -F - <<'EOF'
feat: the journal's rules for runs, records, milestones and returns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: How moments read, and the prompts that carry them

**Files:**
- Modify: `buddy/hooks/journal.ts`
- Modify: `buddy/hooks/voice.ts`
- Test: `buddy/hooks/journal.test.ts`, `buddy/hooks/voice.test.ts`

**Interfaces:**
- Consumes: Task 1's `journal.ts`; `localDay`, `withCommas` from `ledger.ts`; `LONG_TURN_MS` from `voice.ts`; `StatName` from `roll.ts`.
- Produces:
  - from `journal.ts`:
    - constants `RECALL_AGE_MS`, `BUSY_RECALL`, `TALK_MEMORIES`
    - `readable(journal: readonly Moment[] | undefined): Moment[]`
    - `momentText(m: Moment): string`
    - `ageText(at: string, now: number): string`
    - `recallChance(stats): number`
    - `recall(o: { journal; facts: TurnFacts; now; stats; roll; pick }): Moment | null`
    - `memoryLine(m: Moment, now: number): string`
    - `talkMemories(journal, now): string[]`
  - from `voice.ts`: `reactionPrompt(s: TurnSummary, memory: string | null = null)` and `talkPrompt(message: string, memories: readonly string[] = [])`.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/journal.test.ts`, replace
```ts
import {
  addCall, addMoments, awayMoment, bestsOf, isClean, isRough, mergeTurns, milestones, noCalls, noticeTurns, queueTurns,
  turnFacts,
} from './journal'
```
with:
```ts
import {
  addCall, addMoments, ageText, awayMoment, bestsOf, isClean, isRough, memoryLine, mergeTurns, milestones, momentText,
  noCalls, noticeTurns, queueTurns, readable, recall, recallChance, talkMemories, turnFacts,
} from './journal'
```
and add at the end of the file:
```ts
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
```
In `buddy/hooks/voice.test.ts`, replace
```ts
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, withArticle,
```
with:
```ts
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, talkPrompt, withArticle,
```
and add at the end of the file:
```ts
test('a quip prompt carries its memory just before the ask, and a talk prompt its memories', () => {
  const line = 'A memory (yesterday): back after 9 days away. Bring it up if it fits, as "remember when...", without a date.'
  expect(reactionPrompt(ROUGH)).not.toContain('A memory')
  expect(reactionPrompt(ROUGH, line).split('\n').slice(-2)).toEqual([line, 'React in one line.'])
  expect(talkPrompt('hi')).toBe('The developer says to you: hi\nReply in one line.')
  expect(talkPrompt('hi', ['Your memories, newest first:', '- today: x', 'Mention one only if it fits what they said.'])).toBe(
    'The developer says to you: hi\nYour memories, newest first:\n- today: x\nMention one only if it fits what they said.\nReply in one line.',
  )
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected:
- `journal.test.ts` fails to load: `ageText` and the other new names aren't exported yet.
- The new voice test fails: neither prompt takes memories yet.
- Every test outside `journal.test.ts` passes except that one.

- [ ] **Step 3: Teach the journal to read, age and recall**

In `buddy/hooks/journal.ts`, replace
```ts
import type { Bests, Buddy, Counts, Moment, MomentKind, ToolGroup, TurnFacts } from '../types'
import { daysBetween, totalCalls } from './ledger'
```
with:
```ts
import type { Bests, Buddy, Counts, Moment, MomentKind, ToolGroup, TurnFacts } from '../types'
import { daysBetween, localDay, totalCalls, withCommas } from './ledger'
import type { StatName } from './roll'
import { LONG_TURN_MS } from './voice'
```
Replace
```ts
const iso = (ms: number) => new Date(ms).toISOString()
```
with:
```ts
// A quip only remembers a moment this old, so a record its own turn just set isn't "remembered".
export const RECALL_AGE_MS = 60 * 60_000
// A turn with this many calls echoes a busyTurn memory.
export const BUSY_RECALL = 25
export const TALK_MEMORIES = 3

const KINDS: readonly string[] = ['failRun', 'longTurn', 'busyTurn', 'turns', 'calls', 'comeback', 'away']

const NOUN: Record<ToolGroup, string> = {
  shell: 'shell commands',
  edit: 'edits',
  read: 'file reads',
  web: 'web fetches',
  agent: 'agent calls',
  mcp: 'MCP calls',
  other: 'tool calls',
}

type Stats = Readonly<Record<StatName, number>>

const iso = (ms: number) => new Date(ms).toISOString()
```
Add at the end of the file:
```ts
// The moments this build can read, oldest first. A newer build's kind, or a damaged entry, is
// skipped: kept in the journal, never shown or recalled.
export function readable(journal: readonly Moment[] | undefined): Moment[] {
  return (journal ?? []).filter(
    m => KINDS.includes(m.kind) && Number.isFinite(m.n) && Number.isFinite(Date.parse(m.at)),
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
// more count. One the turn echoes comes first: the largest of its kind, the newest on a tie.
// Otherwise, when `roll` comes in under WISDOM's chance, `pick` chooses one.
export function recall(o: {
  journal: readonly Moment[] | undefined
  facts: TurnFacts
  now: number
  stats: Stats
  roll: number
  pick: number
}): Moment | null {
  const old = readable(o.journal).filter(m => o.now - Date.parse(m.at) >= RECALL_AGE_MS)
  for (const kind of echoes(o.facts)) {
    let best: Moment | null = null
    for (const m of old) if (m.kind === kind && (!best || m.n >= best.n)) best = m
    if (best) return best
  }
  if (old.length === 0 || o.roll >= recallChance(o.stats)) return null
  return old[Math.min(old.length - 1, Math.floor(o.pick * old.length))] ?? null
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
```

- [ ] **Step 4: Let the prompts carry memories**

In `buddy/hooks/voice.ts`, replace
```ts
export function reactionPrompt(s: TurnSummary): string {
  const tools = Object.entries(s.tools).map(([tool, n]) => `${tool} x${n}`).join(', ') || 'none'
  return [
    'Claude just finished a turn for the developer.',
    `Outcome: ${s.reason}. Took ${Math.round(s.durationMs / 1000)}s.`,
    `Tools used: ${tools}.`,
    `Failed tools: ${s.failed.length ? s.failed.join(', ') : 'none'}.`,
    'React in one line.',
  ].join('\n')
}

export function talkPrompt(message: string): string {
  return `The developer says to you: ${message.slice(0, 500)}\nReply in one line.`
}
```
with:
```ts
// `memory` is a journal line the quip may call back to (Memory spec section 4).
export function reactionPrompt(s: TurnSummary, memory: string | null = null): string {
  const tools = Object.entries(s.tools).map(([tool, n]) => `${tool} x${n}`).join(', ') || 'none'
  return [
    'Claude just finished a turn for the developer.',
    `Outcome: ${s.reason}. Took ${Math.round(s.durationMs / 1000)}s.`,
    `Tools used: ${tools}.`,
    `Failed tools: ${s.failed.length ? s.failed.join(', ') : 'none'}.`,
    ...(memory ? [memory] : []),
    'React in one line.',
  ].join('\n')
}

// `memories` are the journal lines a talk may draw on (Memory spec section 4).
export function talkPrompt(message: string, memories: readonly string[] = []): string {
  return [`The developer says to you: ${message.slice(0, 500)}`, ...memories, 'Reply in one line.'].join('\n')
}
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 219 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/journal.ts buddy/hooks/journal.test.ts buddy/hooks/voice.ts buddy/hooks/voice.test.ts
git commit -F - <<'EOF'
feat: moments as words and ages, and which one a quip remembers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Moments in the saved record

**Files:**
- Modify: `buddy/hooks/record.ts`
- Test: `buddy/hooks/record.test.ts`

**Interfaces:**
- Consumes: `addMoments`, `awayMoment`, `bestsOf`, `milestones`, `noticeTurns` from Task 1.
- Produces: the `flush` change gains `turns?: Readonly<Record<string, readonly TurnFacts[]>>`. `applyChange`:
  - writes each entry's new `bests` and appends its moments (turn moments, then milestones), trimmed to 20
  - drops facts for an unknown seed
  - in `arrive` (the visit inside `visit`, `flush`, `hatch` and `reroll`), appends an `away` moment to the active buddy

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
import type { Saved } from '../types'
```
with:
```ts
import type { Bests, Saved, TurnFacts } from '../types'
```
Replace
```ts
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
```
with:
```ts
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const FACTS: TurnFacts = { reason: 'answer', durationMs: 4_000, calls: 3, failRun: 0, failRunGroup: null, afterRough: 0 }
```
Replace
```ts
    { kind: 'flush', pending: {}, mood: { s: ['fail'] } },
    { kind: 'visit' },
```
with:
```ts
    { kind: 'flush', pending: {}, mood: { s: ['fail'] } },
    { kind: 'flush', pending: {}, turns: { s: [{ ...FACTS, failRun: 6 }] } },
    { kind: 'visit' },
```
and add at the end of the file:
```ts
test('a flush notices turns against the stored bests, saves the bests, and drops an unknown seed', () => {
  const run: TurnFacts = { ...FACTS, failRun: 6, failRunGroup: 'shell' }
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: {}, turns: { s: [run], gone: [run] } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).journal).toEqual([{ at: AT, kind: 'failRun', n: 6, group: 'shell' }])
  expect(activeBuddy(saved).bests).toEqual({ failRun: 6, calls: 3 })
  // The same turn again sets no new record.
  const again = applyChange(saved, { kind: 'flush', pending: {}, turns: { s: [run] } }, NOON)!
  expect(activeBuddy(again).journal).toHaveLength(1)
})

test('bests fields a newer build wrote survive a flush', () => {
  const base = migrate(V1)
  const future = {
    ...base,
    buddies: base.buddies.map(b => ({ ...b, bests: { failRun: 1, calls: 1, slowest: 2 } })),
  } as Saved
  const saved = applyChange(future, { kind: 'flush', pending: {}, turns: { s: [FACTS] } }, NOON)!
  expect(activeBuddy(saved).bests).toEqual({ failRun: 1, calls: 3, slowest: 2 } as Bests)
})

test('a flush that reaches turn 100 logs the milestone after the turn moments', () => {
  const base = migrate(V1)
  const near: Saved = { ...base, buddies: base.buddies.map(b => ({ ...b, counts: { ...b.counts, turns: 99 } })) }
  const long = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 700_000 })
  const change: Change = { kind: 'flush', pending: { s: long }, turns: { s: [{ ...FACTS, durationMs: 700_000 }] } }
  expect(activeBuddy(applyChange(near, change, NOON)!).journal).toEqual([
    { at: AT, kind: 'longTurn', n: 11 },
    { at: AT, kind: 'turns', n: 100 },
  ])
})

test('a new day after three or more missed days writes "away" on the buddy left alone', () => {
  // 2026-10-02 to 2026-10-07 is 5 days.
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const moment = [{ at: AT, kind: 'away', n: 5 }]
  expect(activeBuddy(applyChange(away, { kind: 'visit' }, NOON)!).journal).toEqual(moment)
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).journal).toEqual(moment)
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  expect(rerolled.buddies[0]?.journal).toEqual(moment)
  expect(activeBuddy(rerolled).journal).toBeUndefined()
  // Two missed days leave a sulk but no moment.
  const weekend: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-04' } }
  expect(activeBuddy(applyChange(weekend, { kind: 'visit' }, NOON)!).journal).toBeUndefined()
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: the four new tests fail, because no `journal` or `bests` is written. `fields this build does not know survive every change` still passes. 219 pass.

- [ ] **Step 3: Notice moments in the flush and the visit**

In `buddy/hooks/record.ts`, replace
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul } from '../types'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, TurnFacts } from '../types'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
Replace
```ts
      // Mood events by seed, replayed in order (Alive spec section 2).
      mood?: Readonly<Record<string, readonly MoodEvent[]>>
    }
```
with:
```ts
      // Mood events by seed, replayed in order (Alive spec section 2).
      mood?: Readonly<Record<string, readonly MoodEvent[]>>
      // Finished main turns by seed, for the journal (Memory spec section 3).
      turns?: Readonly<Record<string, readonly TurnFacts[]>>
    }
```
Replace
```ts
// Today's visit (Foundation spec section 3). A new day after two or more missed ones leaves the
// active buddy sulking (Alive spec section 2). Returns `saved` itself when the day is not new.
function arrive(saved: Saved, now: number): Saved {
  const today = localDay(now)
  const you = visit(saved.you, today)
  if (you === saved.you) return saved
  const sulk = sulkFor(saved.you.lastDay, today)
  const buddies =
    sulk > 0
      ? saved.buddies.map(b => (b.seed === saved.active ? { ...b, mood: withSulk(b.mood, sulk, now) } : b))
      : saved.buddies
  return { ...saved, you, buddies }
}
```
with:
```ts
// Today's visit (Foundation spec section 3). A new day after two or more missed ones leaves the
// active buddy sulking (Alive spec section 2), and after three or more it goes in that buddy's
// journal (Memory spec section 3). Returns `saved` itself when the day is not new.
function arrive(saved: Saved, now: number): Saved {
  const today = localDay(now)
  const you = visit(saved.you, today)
  if (you === saved.you) return saved
  const sulk = sulkFor(saved.you.lastDay, today)
  const away = awayMoment(saved.you.lastDay, today, now)
  const buddies =
    sulk > 0 || away
      ? saved.buddies.map(b =>
          b.seed === saved.active
            ? {
                ...b,
                ...(sulk > 0 ? { mood: withSulk(b.mood, sulk, now) } : {}),
                ...(away ? { journal: addMoments(b.journal, [away]) } : {}),
              }
            : b,
        )
      : saved.buddies
  return { ...saved, you, buddies }
}
```
Replace
```ts
      let added = false
      const buddies = arrived.buddies.map(b => {
        const more = change.pending[b.seed]
        const felt = change.mood?.[b.seed] ?? []
        if (!more && felt.length === 0) return b
        added = true
        return {
          ...b,
          ...(more ? { counts: addCounts(b.counts, more) } : {}),
          ...(felt.length > 0 ? { mood: applyMood(b.mood, felt, now) } : {}),
        }
      })
```
with:
```ts
      let added = false
      const buddies = arrived.buddies.map(b => {
        const more = change.pending[b.seed]
        const felt = change.mood?.[b.seed] ?? []
        const facts = change.turns?.[b.seed] ?? []
        if (!more && felt.length === 0 && facts.length === 0) return b
        added = true
        // Records are judged against what is stored, before this save's counts are added.
        const counts = more ? addCounts(b.counts, more) : b.counts
        const noticed = noticeTurns(facts, bestsOf(b), b.counts.longestTurnMs, now)
        const moments = [...noticed.moments, ...milestones(b.counts, counts, now)]
        return {
          ...b,
          ...(more ? { counts } : {}),
          ...(felt.length > 0 ? { mood: applyMood(b.mood, felt, now) } : {}),
          ...(facts.length > 0 ? { bests: { ...b.bests, ...noticed.bests } } : {}),
          ...(moments.length > 0 ? { journal: addMoments(b.journal, moments) } : {}),
        }
      })
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 223 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/record.ts buddy/hooks/record.test.ts
git commit -F - <<'EOF'
feat: save journal moments and bests with the counts, and "away" at the visit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The journal as text and as SVG

**Files:**
- Modify: `buddy/hooks/layout.ts`
- Modify: `buddy/hooks/card.ts`
- Test: `buddy/hooks/layout.test.ts`, `buddy/hooks/card.test.ts`

**Interfaces:**
- Consumes: `readable`, `momentText`, `ageText` from Task 2.
- Produces:
  - from `layout.ts`:
    - type `JournalRow = { age: string; text: string }`
    - `journalHeader(name): string` and `emptyJournal(name): string`
    - `journalRows(journal: readonly Moment[] | undefined, now: number): JournalRow[]`, newest first, ages padded
    - `journalLines(name, journal, now, limit = 10): string[]`
  - from `card.ts`: `journalSvg(name: string, bones: Bones, rows: readonly JournalRow[]): string` and `journalAlt(name: string, rows: readonly JournalRow[]): string`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/layout.test.ts`, replace
```ts
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, bandRows, bubbleRows, bubbleWidth, cardLines, compactLine, isCompact, nameLine,
  pageAt, paintRuns, rightRuns, spriteTint, streakLine, wrap,
} from './layout'
```
with:
```ts
import type { Moment } from '../types'
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, bandRows, bubbleRows, bubbleWidth, cardLines, compactLine, isCompact,
  journalLines, journalRows, nameLine, pageAt, paintRuns, rightRuns, spriteTint, streakLine, wrap,
} from './layout'
```
and add at the end of the file:
```ts
test('the journal reads newest first with ages padded, and its text form keeps to 11 lines', () => {
  const noon = new Date(2026, 9, 7, 12).getTime()
  const daysAgo = (d: number) => new Date(2026, 9, 7 - d, 12).toISOString()
  const journal: Moment[] = [
    { at: daysAgo(120), kind: 'away', n: 9 },
    { at: daysAgo(15), kind: 'failRun', n: 18, group: 'shell' },
    { at: daysAgo(1), kind: 'comeback', n: 4 },
  ]
  expect(journalRows(journal, noon)).toEqual([
    { age: 'yesterday   ', text: 'a clean turn after 4 rough ones' },
    { age: '2 weeks ago ', text: 'Claude failed 18 shell commands in a row' },
    { age: '4 months ago', text: 'back after 9 days away' },
  ])
  expect(journalLines('Pip', journal, noon)).toEqual([
    "Pip's journal",
    'yesterday      a clean turn after 4 rough ones',
    '2 weeks ago    Claude failed 18 shell commands in a row',
    '4 months ago   back after 9 days away',
  ])
  expect(journalLines('Pip', undefined, noon)).toEqual(["Pip's journal", "Nothing in Pip's journal yet."])
  const full: Moment[] = Array.from({ length: 20 }, (_, i) => ({ at: daysAgo(1), kind: 'turns' as const, n: i }))
  const text = journalLines('Pip', full, noon)
  expect(text).toHaveLength(11)
  expect(text[1]).toBe('yesterday   19 turns together')
})
```
In `buddy/hooks/card.test.ts`, replace
```ts
import { cardAlt, cardSvg, meter, radarPoint, statAlt } from './card'
```
with:
```ts
import { cardAlt, cardSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
```
and add at the end of the file:
```ts
test("the journal is drawn in the card's frame, a row per moment, growing with them; its alt reads them out", () => {
  const rows = [
    { age: 'yesterday  ', text: 'a clean turn after 4 rough ones' },
    { age: '2 weeks ago', text: 'Claude failed <18> shell commands in a row' },
  ]
  const svg = journalSvg('Nib', BONES, rows)
  expect(svg).toContain('>Nib&#39;s journal</text>')
  expect(svg).toContain('>yesterday</text>')
  expect(svg).toContain('>Claude failed &lt;18&gt; shell commands in a row</text>')
  expect(svg).toContain('width="420" height="122"')
  expect(journalSvg('Nib', BONES, Array.from({ length: 20 }, () => rows[0]!))).toContain('width="420" height="518"')
  const empty = journalSvg('Nib', BONES, [])
  expect(empty).toContain('width="420" height="100"')
  expect(empty).toContain('>Nothing in Nib&#39;s journal yet.</text>')
  expect(journalAlt('Nib', rows)).toBe(
    "Nib's journal. Yesterday: a clean turn after 4 rough ones. 2 weeks ago: Claude failed <18> shell commands in a row.",
  )
  expect(journalAlt('Nib', [])).toBe("Nothing in Nib's journal yet.")
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `layout.test.ts` and `card.test.ts` fail to load, because their new imports aren't exported yet. Every other file passes.

- [ ] **Step 3: The journal as text**

In `buddy/hooks/layout.ts`, replace
```ts
import type { Counts, Soul, You } from '../types'
import { RARITY, STATS } from './roll'
```
with:
```ts
import type { Counts, Moment, Soul, You } from '../types'
import { ageText, momentText, readable } from './journal'
import { RARITY, STATS } from './roll'
```
and add at the end of the file:
```ts
// One journal row: how long ago, padded to the widest, and what happened.
export type JournalRow = { age: string; text: string }

export const journalHeader = (name: string) => `${name}'s journal`
export const emptyJournal = (name: string) => `Nothing in ${name}'s journal yet.`

// A journal's moments newest first, with their ages padded to the widest (Memory spec section 5).
export function journalRows(journal: readonly Moment[] | undefined, now: number): JournalRow[] {
  const rows = readable(journal)
    .reverse()
    .map(m => ({ age: ageText(m.at, now), text: momentText(m) }))
  const width = Math.max(0, ...rows.map(r => r.age.length))
  return rows.map(r => ({ ...r, age: r.age.padEnd(width) }))
}

// The journal as text, where no pane is placed: the header and the newest `limit` moments, inside
// the 12 lines the card's text keeps to.
export function journalLines(name: string, journal: readonly Moment[] | undefined, now: number, limit = 10): string[] {
  const rows = journalRows(journal, now).slice(0, limit)
  if (rows.length === 0) return [journalHeader(name), emptyJournal(name)]
  return [journalHeader(name), ...rows.map(r => `${r.age}   ${r.text}`)]
}
```

- [ ] **Step 4: The journal as SVG, in the card's frame**

In `buddy/hooks/card.ts`, replace
```ts
import { countsText, streakLine, streakText, wrap } from './layout'
```
with:
```ts
import { countsText, emptyJournal, journalHeader, streakLine, streakText, wrap } from './layout'
import type { JournalRow } from './layout'
```
Replace
```ts
const QUOTE_WIDTH = 44
```
with:
```ts
const QUOTE_WIDTH = 44
// The journal's rows: the age at the left pad, the words 100 px in, 22 px apart.
const JOURNAL_TOP = 76
const JOURNAL_ROW = 22
const JOURNAL_WORDS_X = PAD + 100
```
Replace
```ts
  const h = foot + (history ? 58 : 38)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" ` +
    `font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="14" fill="${color}" fill-opacity="0.04" stroke="${color}" stroke-width="2"/>` +
    marks.join('') +
    `</svg>`
  )
}
```
with:
```ts
  return framed(color, foot + (history ? 58 : 38), marks)
}

// The card's frame around `marks`: a rounded border in the rarity color, `h` px tall.
function framed(color: string, h: number, marks: readonly string[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" ` +
    `font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="14" fill="${color}" fill-opacity="0.04" stroke="${color}" stroke-width="2"/>` +
    marks.join('') +
    `</svg>`
  )
}

// The journal pane as one SVG in the card's frame (Memory spec section 5): the header in the
// rarity color, then a row per moment, newest first.
export function journalSvg(name: string, bones: Bones, rows: readonly JournalRow[]): string {
  const color = FILL[bones.rarity]
  const marks = [
    `<text x="${PAD}" y="44" font-size="22" font-weight="700" fill="${color}">${esc(journalHeader(name))}</text>`,
  ]
  if (rows.length === 0) {
    marks.push(`<text x="${PAD}" y="${JOURNAL_TOP}" font-size="12" fill="${INK}">${esc(emptyJournal(name))}</text>`)
  }
  rows.forEach((row, i) => {
    const y = JOURNAL_TOP + i * JOURNAL_ROW
    marks.push(
      `<text x="${PAD}" y="${y}" font-size="12" fill="${INK}" fill-opacity="0.7">${esc(row.age.trim())}</text>`,
      `<text x="${JOURNAL_WORDS_X}" y="${y}" font-size="12" fill="${INK}">${esc(row.text)}</text>`,
    )
  })
  return framed(color, JOURNAL_TOP + (Math.max(1, rows.length) - 1) * JOURNAL_ROW + 24, marks)
}

export function journalAlt(name: string, rows: readonly JournalRow[]): string {
  if (rows.length === 0) return emptyJournal(name)
  return `${journalHeader(name)}. ${rows.map(r => `${capital(r.age.trim())}: ${r.text}.`).join(' ')}`
}
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 225 pass, 0 fail. The card's existing tests pass unchanged through `framed`.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/card.ts buddy/hooks/card.test.ts
git commit -F - <<'EOF'
feat: the journal as text rows and as an SVG in the card's frame

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Turns, saves, quips and talks remember

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/register.tsx`
- Test: `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes:
  - from `journal.ts`: `noCalls`, `addCall`, `turnFacts`, `isRough`, `queueTurns`, `mergeTurns`, `recall`, `memoryLine`, `talkMemories`
  - `toolGroup` from `ledger.ts`
  - the `flush` change's `turns` from Task 3
  - `reactionPrompt(summary, memory)` and `talkPrompt(message, memories)` from Task 2
- Produces:
  - the `$.state` key `pendingTurns: Record<string, TurnFacts[]>`
  - every main turn's facts queued and saved with its counts
  - a quip's prompt carrying at most one memory, and a talk's prompt the newest three

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/buddy.test.tsx`, replace
```ts
import type { Saved } from '../types'
```
with:
```ts
import type { Moment, Saved } from '../types'
```
and add at the end of the file:
```ts
// Six days before the test clock's noon.
const LAST_WEEK = new Date(2026, 9, 1, 12).toISOString()

// SAVED, with a journal on its buddy.
const remembering = (journal: Moment[]): Saved => ({ ...SAVED, buddies: [{ ...SAVED.buddies[0]!, journal }] })

// Beneath the plugin: Read succeeds, a `deny` command is refused, and every other call fails.
function mixedEngine(on: On) {
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny'
      ? { deny: 'not here' }
      : e.tool === 'Read'
        ? { result: 'ok' }
        : { isError: true as const, result: 'boom' },
  )
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
}

test('five failed shell calls in a row go in the journal once, on a record from before the journal', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (const turnId of ['t1', 't2']) {
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId })
    await clock.settle()
  }
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
  expect(activeOf(shared.row)?.bests).toEqual({ failRun: 5, calls: 5 })
})

test('a denied call leaves a run of failures going, a success ends it, and a subagent is no part of it', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  mixedEngine(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const fail = () => $.tool.call({ tool: 'Bash', command: 'false' })
  // ToolCallReserved omits agentId, so a fresh literal fails the excess-property check; a hoisted const does not.
  const fromSubagent = { tool: 'Bash', command: 'false', agentId: 'a1' } as const
  // Three failures, a success, then three more with a subagent's failure among them: no run of five.
  for (let i = 0; i < 3; i++) await fail()
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await fail()
  await $.tool.call(fromSubagent)
  await fail()
  await fail()
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  // Three failures, a denied call, two more: a run of five.
  for (let i = 0; i < 3; i++) await fail()
  await $.tool.call({ tool: 'Bash', command: 'deny' })
  await fail()
  await fail()
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
})

test('three rough turns, then a clean one, go in the journal as a comeback, even muted', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, mode: 'muted' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (const turnId of ['t1', 't2', 't3']) {
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId })
  }
  await $.turn.complete({ ...TURN, turnId: 't4' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'comeback', n: 3 }])
})

test('turn 100 goes in the journal once, even when another session got there first', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 99 } }] })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // Mid-turn, another session saves turn 100 and its milestone.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.counts.turns = 100
  theirs.buddies[0]!.journal = [{ at: new Date(NOON).toISOString(), kind: 'turns', n: 100 }]
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(101)
  expect(activeOf(shared.row)?.journal).toHaveLength(1)
})

test('a quip after a failed call remembers the worst run, and calls the model no more than before', async ($, on) => {
  const clock = world(on, { buddy: remembering([{ at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' }]) })
  engineBelow(on)
  const prompts = model(on, null, 'Not again.')
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('\nA memory (6 days ago): Claude failed 18 shell commands in a row. ')
  expect(prompts[0]?.endsWith('\nReact in one line.')).toBe(true)
})

test("a talk's prompt carries the three newest memories", async ($, on) => {
  const clock = world(on, {
    buddy: remembering([
      { at: LAST_WEEK, kind: 'away', n: 9 },
      { at: LAST_WEEK, kind: 'turns', n: 100 },
      { at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' },
      { at: LAST_WEEK, kind: 'comeback', n: 4 },
    ]),
  })
  engineBelow(on)
  const prompts = model(on, null, 'I remember.')
  await $.session.start(START)
  await clock.settle()
  await $.prompt.submit({ text: 'Pip, remember anything?', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(prompts).toEqual([
    [
      'The developer says to you: remember anything?',
      'Your memories, newest first:',
      '- 6 days ago: a clean turn after 4 rough ones',
      '- 6 days ago: Claude failed 18 shell commands in a row',
      '- 6 days ago: 100 turns together',
      'Mention one only if it fits what they said.',
      'Reply in one line.',
    ].join('\n'),
  ])
})

test('a buddy that is off keeps no journal, even once it is back', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, mode: 'off' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  await runner($)('')
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(1)
  expect(activeOf(shared.row)?.journal).toBeUndefined()
})

test('a failed write keeps a new moment for the next save', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  shared.refuse = false
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -30
```
Expected: the new tests that look for a journal moment or a memory line fail. `a buddy that is off keeps no journal, even once it is back` and the `toBeUndefined` halves may pass already. The 225 earlier tests pass.

- [ ] **Step 3: Declare the state key**

In `buddy/types/index.d.ts`, replace
```ts
      // Mood events not yet saved, by buddy seed (Alive spec section 2).
      pendingMood: Record<string, MoodEvent[]>
```
with:
```ts
      // Mood events not yet saved, by buddy seed (Alive spec section 2).
      pendingMood: Record<string, MoodEvent[]>
      // Finished main turns not yet saved, by buddy seed (Memory spec section 3).
      pendingTurns: Record<string, TurnFacts[]>
```

- [ ] **Step 4: Wire the journal into the session**

In `buddy/hooks/register.tsx`, make these replacements in order.

Replace
```ts
import type { Buddy, Counts, MoodEvent, Saved } from '../types'
import { dayInfo } from './calendar'
import { cardAlt, cardSvg, meter } from './card'
```
with:
```ts
import type { Buddy, Counts, Moment, MoodEvent, Saved, TurnFacts } from '../types'
import { dayInfo } from './calendar'
import { cardAlt, cardSvg, meter } from './card'
import { addCall, isRough, memoryLine, mergeTurns, noCalls, queueTurns, recall, talkMemories, turnFacts } from './journal'
```
Replace
```ts
import { addCounts, countEvent, mergePending, zeroCounts } from './ledger'
```
with:
```ts
import { addCounts, countEvent, mergePending, toolGroup, zeroCounts } from './ledger'
```
Replace
```ts
const pendingMood = atom({ plugin: 'buddy', key: 'pendingMood' } as const, {})
```
with:
```ts
const pendingMood = atom({ plugin: 'buddy', key: 'pendingMood' } as const, {})
const pendingTurns = atom({ plugin: 'buddy', key: 'pendingTurns' } as const, {})
```
Replace
```ts
let tally: Record<string, number> = {}
let failedTools: string[] = []
```
with:
```ts
let tally: Record<string, number> = {}
let failedTools: string[] = []
// The current main turn's calls for the journal, and the rough turns in a row before it (Memory
// spec section 3).
let turnCalls = noCalls()
let roughTurns = 0
```
Replace
```ts
// Saves the unsaved counts and mood events with today's visit. A failed store write has already
// taken them into this session's copy (commit adopts before it writes), so they go back only
// when the commit failed before that.
async function flush($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  // Each taken and cleared in one update, so an event landing in between is never erased.
  let taken: Record<string, Counts> = {}
  let felt: Record<string, MoodEvent[]> = {}
  await update($, pending, p => {
    taken = p
    return {}
  })
  await update($, pendingMood, p => {
    felt = p
    return {}
  })
  try {
    await commit($, { kind: 'flush', pending: taken, mood: felt })
  } catch {
    await update($, pending, p => mergePending(taken, p))
    await update($, pendingMood, p => mergeMood(felt, p))
  }
}
```
with:
```ts
// Queues a finished main turn for the journal, under the rules for counting (Memory spec section 3).
async function remember($: EngineInterface, facts: TurnFacts) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off' || (await read($, hatching))) return
  const seed = saved.active
  await update($, pendingTurns, p => ({ ...p, [seed]: queueTurns(p[seed], [facts]) }))
}

// Saves the unsaved counts, mood events and turns with today's visit. A failed store write has
// already taken them into this session's copy (commit adopts before it writes), so they go back
// only when the commit failed before that.
async function flush($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  // Each taken and cleared in one update, so an event landing in between is never erased.
  let taken: Record<string, Counts> = {}
  let felt: Record<string, MoodEvent[]> = {}
  let turns: Record<string, TurnFacts[]> = {}
  await update($, pending, p => {
    taken = p
    return {}
  })
  await update($, pendingMood, p => {
    felt = p
    return {}
  })
  await update($, pendingTurns, p => {
    turns = p
    return {}
  })
  try {
    await commit($, { kind: 'flush', pending: taken, mood: felt, turns })
  } catch {
    await update($, pending, p => mergePending(taken, p))
    await update($, pendingMood, p => mergeMood(felt, p))
    await update($, pendingTurns, p => mergeTurns(turns, p))
  }
}
```
Replace
```ts
  kind: 'flinch' | 'celebrate' | null = null,
) {
  await count($, event)
  await feel($, events, kind)
  await flush($)
}
```
with:
```ts
  kind: 'flinch' | 'celebrate' | null = null,
  facts: TurnFacts | null = null,
) {
  await count($, event)
  await feel($, events, kind)
  if (facts) await remember($, facts)
  await flush($)
}
```
Replace
```ts
// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is pending.
async function react($: EngineInterface, summary: TurnSummary) {
```
with:
```ts
// The journal line a quip carries, if any (Memory spec section 4). A throw costs the memory,
// never the quip.
function memoryFor(journal: readonly Moment[] | undefined, facts: TurnFacts, now: number, bones: Bones): string | null {
  try {
    const m = recall({ journal, facts, now, stats: bones.stats, roll: Math.random(), pick: Math.random() })
    return m ? memoryLine(m, now) : null
  } catch {
    return null
  }
}

// The journal lines a talk carries (Memory spec section 4). A throw costs the memories, never the reply.
async function memoriesFor($: EngineInterface, journal: readonly Moment[] | undefined): Promise<string[]> {
  try {
    return talkMemories(journal, await $.clock.now())
  } catch {
    return []
  }
}

// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is
// pending. A quip may call back to a journal moment.
async function react($: EngineInterface, summary: TurnSummary, facts: TurnFacts) {
```
Replace
```ts
  const text = await ask($, buddy, bones, reactionPrompt(summary), 'react')
```
with:
```ts
  const memory = memoryFor(buddy.journal, facts, now, bones)
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
```
Replace
```ts
        // A denied call never ran, so it isn't counted.
        if (ran.deny === undefined) later($, () => count($, { kind: 'call', tool: e.tool, failed }))
```
with:
```ts
        // A denied call never ran, so it isn't counted, and it neither extends nor ends a run.
        if (ran.deny === undefined) {
          turnCalls = addCall(turnCalls, toolGroup(e.tool), failed)
          later($, () => count($, { kind: 'call', tool: e.tool, failed }))
        }
```
Replace
```ts
        const summary: TurnSummary = { reason: e.reason, durationMs: e.durationMs, tools: tally, failed: failedTools }
        tally = {}
        failedTools = []
        turnNo++
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        const felt = turnMood(e.reason, e.durationMs, summary.failed.length)
        const kind = e.reason === 'error' ? 'flinch' : felt === 'longClean' ? 'celebrate' : null
        later($, () => countAndFlush($, turn, felt ? [felt] : [], kind))
        later($, () => react($, summary))
```
with:
```ts
        const summary: TurnSummary = { reason: e.reason, durationMs: e.durationMs, tools: tally, failed: failedTools }
        const facts = turnFacts(e.reason, e.durationMs, turnCalls, roughTurns)
        tally = {}
        failedTools = []
        turnCalls = noCalls()
        roughTurns = isRough(facts) ? roughTurns + 1 : 0
        turnNo++
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        const felt = turnMood(e.reason, e.durationMs, summary.failed.length)
        const kind = e.reason === 'error' ? 'flinch' : felt === 'longClean' ? 'celebrate' : null
        later($, () => countAndFlush($, turn, felt ? [felt] : [], kind, facts))
        later($, () => react($, summary, facts))
```
Replace
```ts
        later($, () => soothe($, { kind: 'talk' }, buddy, talkPrompt(message)))
```
with:
```ts
        later($, async () => soothe($, { kind: 'talk' }, buddy, talkPrompt(message, await memoriesFor($, buddy.journal))))
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 233 pass, 0 fail. If `a talk's prompt carries the three newest memories` or a quip test sees an extra prompt, read what the extra prompt is before changing anything: the only model calls allowed are the ones these tests expect.

- [ ] **Step 6: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: turns go in the journal, and quips and talks remember

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: `/buddy journal` and its pane

**Files:**
- Modify: `buddy/hooks/record.ts`
- Modify: `buddy/hooks/register.tsx`
- Test: `buddy/hooks/record.test.ts`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `journalRows`, `journalLines`, `journalHeader`, `emptyJournal` from `layout.ts` and `journalSvg`, `journalAlt` from `card.ts` (Task 4).
- Produces:
  - `'journal'` in `Sub`
  - the new `USAGE`
  - the `journal` subcommand, which opens a pane with id `journal`, or returns `journalLines(...)` text where no pane is placed
  - the pane's render hook

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
  expect(parseSub('CARD')).toBe('card')
```
with:
```ts
  expect(parseSub('CARD')).toBe('card')
  expect(parseSub('journal')).toBe('journal')
  expect(parseSub('journal all')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]')
```
In `buddy/hooks/buddy.test.tsx`, add at the end of the file:
```ts
const journalPane = () => ({ ...pane(), requestId: 'journal', props: { ...pane().props, title: 'Journal' } })

test('journal opens a pane listing the moments newest first, even while the buddy is off, and prints nothing', async ($, on) => {
  const saved = remembering([
    { at: LAST_WEEK, kind: 'away', n: 9 },
    { at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' },
  ])
  const clock = world(on, { buddy: { ...saved, mode: 'off' } })
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('journal')).toBeUndefined()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  const text = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(text).toMatch(/^Pip's journal\|6 days ago *\|Claude failed 18 shell commands in a row\|6 days ago *\|back after 9 days away$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...journalPane() })
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  expect(svgs[0]?.props.alt).toBe(
    "Pip's journal. 6 days ago: Claude failed 18 shell commands in a row. 6 days ago: back after 9 days away.",
  )
  expect(String(svgs[0]?.props.source)).toContain('>back after 9 days away</text>')
})

test('where no pane can be placed, journal prints its header and the newest ten', async ($, on) => {
  const journal: Moment[] = Array.from({ length: 12 }, (_, i) => ({ at: LAST_WEEK, kind: 'turns' as const, n: i + 1 }))
  const clock = world(on, { buddy: remembering(journal) }, false)
  await $.session.start(START)
  await clock.settle()
  const lines = ((await runner($)('journal')) ?? '').split('\n')
  expect(lines).toHaveLength(11)
  expect(lines[0]).toBe("Pip's journal")
  expect(lines[1]).toBe('6 days ago   12 turns together')
  expect(lines[10]).toBe('6 days ago   3 turns together')
})

test('an empty journal says so, as text and on the pane', async ($, on) => {
  const clock = world(on, { buddy: SAVED }, false)
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('journal')).toBe("Pip's journal\nNothing in Pip's journal yet.")
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  expect(await terminal.find({ text: "Nothing in Pip's journal yet." })).toBeDefined()
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `subcommands` and the three new journal tests fail, because `journal` parses as usage. 232 pass.

- [ ] **Step 3: Parse the subcommand**

In `buddy/hooks/record.ts`, replace
```ts
export const USAGE = 'Usage: /buddy [pet | card | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
export const USAGE = 'Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]'
```
Replace
```ts
export type Sub =
  | 'show' | 'pet' | 'card' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug' | 'debug-off' | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'mute', 'unmute', 'off']
```
with:
```ts
export type Sub =
  | 'show' | 'pet' | 'card' | 'journal' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug' | 'debug-off'
  | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'journal', 'mute', 'unmute', 'off']
```

- [ ] **Step 4: Open the pane and draw it**

In `buddy/hooks/register.tsx`, replace
```ts
import { cardAlt, cardSvg, meter } from './card'
```
with:
```ts
import { cardAlt, cardSvg, journalAlt, journalSvg, meter } from './card'
```
Replace
```ts
import { bandRows, cardLines, compactLine, isCompact, nameLine, rightRuns, spriteTint, streakLine } from './layout'
```
with:
```ts
import {
  bandRows, cardLines, compactLine, emptyJournal, isCompact, journalHeader, journalLines, journalRows, nameLine, rightRuns,
  spriteTint, streakLine,
} from './layout'
```
Replace
```ts
const CARD = 'card'
```
with:
```ts
const CARD = 'card'
const JOURNAL = 'journal'
```
Replace
```ts
      return [...cardLines(buddy.soul, bones, saved.rerolls), streakLine(saved.you, await countsOf($, buddy))].join('\n')
    }
```
with:
```ts
      return [...cardLines(buddy.soul, bones, saved.rerolls), streakLine(saved.you, await countsOf($, buddy))].join('\n')
    }
    case 'journal': {
      const opened = await $.ui.open({ id: JOURNAL, title: 'Journal', closeOnEscape: true })
      // A surface that places no panes gets the newest ten as text instead.
      if (opened.isPlaced) return undefined
      return journalLines(name, buddy.journal, await $.clock.now()).join('\n')
    }
```
Replace
```ts
        argumentHint: '[pet | card | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
        argumentHint: '[pet | card | journal | mute | unmute | off | reroll [confirm]]',
```
Replace the end of the file,
```tsx
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```
with:
```tsx
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
        </Box>
      )
    } catch {
      return next(e)
    }
  })

  // The journal pane (Memory spec section 5): the active buddy's saved moments, newest first.
  on('ui.render', { component: 'Pane', requestId: JOURNAL }, async ($, e, next) => {
    try {
      const { Box, Text } = $.ui.resolve(e)
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = activeBuddy(saved)
      const name = buddy.soul.name
      const rows = journalRows(buddy.journal, await $.clock.now())
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={journalSvg(name, rollBones(buddy.seed), rows)} alt={journalAlt(name, rows)} />
      }

      return (
        <Box flexDirection="column">
          <Text bold>{journalHeader(name)}</Text>
          {rows.length === 0
            ? [<Text dimColor>{emptyJournal(name)}</Text>]
            : rows.map(row => (
                <Box>
                  <Text dimColor>{row.age + '   '}</Text>
                  <Text>{row.text}</Text>
                </Box>
              ))}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 236 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy journal opens a pane of the buddy's moments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Type-check, version, README, and record what shipped

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-10-08-buddy-memory-design.md` (status line)

**Interfaces:**
- Consumes: the finished Memory build.
- Produces: a type-checked mod at version 0.4.0, a README that says what it saves and does, and an accurate spec status.

- [ ] **Step 1: Type-check**

The repo copy has no engine-laid types, so check it against the installed copy's types. The first run fetches TypeScript 5.6 from npm.
```bash
MOD="$(cygpath -m "$(pwd)/buddy")"
TYPES="$(cygpath -m "$(ls -d ~/.claude/plugins/cache/buddy-mods/buddy/*/.claude-plugin/types/claude-code/index.d.ts | sort -V | tail -1)")"
TMP="$(mktemp -d)"
printf '{ "extends": "%s/tsconfig.json", "include": ["%s", "%s/hooks", "%s/types"] }\n' "$MOD" "$TYPES" "$MOD" "$MOD" > "$TMP/tsconfig.json"
npx -y -p typescript@5.6 tsc -p "$(cygpath -m "$TMP/tsconfig.json")"
```
Expected: no output (exit 0). Otherwise, fix every error, re-run the tests, and commit the fixes as `fix: type errors`. Likely spots:
- the `{ result: 'ok' }` branch in `mixedEngine`
- the conditional children in the journal pane

- [ ] **Step 2: Bump the version**

In `buddy/.claude-plugin/plugin.json`, replace `"version": "0.3.0"` with `"version": "0.4.0"`.

- [ ] **Step 3: Update the README**

In `README.md`, replace
```
| `/buddy card` | Its card: name, species, rarity, stats, your streak and its lifetime counts |
```
with:
```
| `/buddy card` | Its card: name, species, rarity, stats, your streak and its lifetime counts |
| `/buddy journal` | The moments it remembers, newest first |
```
Replace
```
Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, and SNARK sharpens its canned lines.
```
with:
```
Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, SNARK sharpens its canned lines, and WISDOM makes it bring up old memories.

It keeps a journal of up to 20 moments: its longest turn, its worst run of failed tool calls, its busiest turn, every 100th, 1,000th and 10,000th turn, a clean turn after a rough patch, and you coming back after days away. A comment after a turn like one it remembers calls back to it ("remember when Claude failed 18 shell commands in a row?"), and when you talk to it, it can bring them up.
```
Replace
```
  Moods, reactions, holidays and the line it says when a tool fails need no model call.
- **What a turn comment sees.** Only the turn's outcome, how long it took, which tools ran or failed, the buddy's mood, and whether today is a holiday or its hatch day. It never sees your prompt, Claude's answer, file contents or command arguments.
```
with:
```
  Moods, reactions, holidays, the journal and the line it says when a tool fails need no model call.
- **What a turn comment sees.** Only the turn's outcome, how long it took, which tools ran or failed, the buddy's mood, whether today is a holiday or its hatch day, and now and then one of its journal moments. It never sees your prompt, Claude's answer, file contents or command arguments.
```
Replace
```
failed calls, pets and talks, and its mood (two small numbers and when they last moved).
```
with:
```
failed calls, pets and talks, its mood (two small numbers and when they last moved), its two other bests (the longest run of failed calls and the most calls in one turn), and its journal (up to 20 moments, each a kind, a number, a tool group and a time).
```
Replace
```
These are point-in-time records: each spec's status line lists what changed during its build.
```
with:
```
The journal comes from [`docs/specs/2026-10-08-buddy-memory-design.md`](docs/specs/2026-10-08-buddy-memory-design.md) and its plan, [`docs/specs/2026-10-08-buddy-memory-plan.md`](docs/specs/2026-10-08-buddy-memory-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```

- [ ] **Step 4: Record what shipped**

```bash
sed -i "s|^\*\*Status:\*\* designed 2026-10-08; not built\.$|**Status:** built $(date +%F); live check pending. Plan: [\`2026-10-08-buddy-memory-plan.md\`](2026-10-08-buddy-memory-plan.md); its \"Deliberate deviations\" section lists six small departures from this spec.|" docs/specs/2026-10-08-buddy-memory-design.md
head -3 docs/specs/2026-10-08-buddy-memory-design.md
```
Expected: the third line is the new status line with today's date.

- [ ] **Step 5: Final full run**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 236 pass, 0 fail. Validation passes, and its `state writes:` and `state reads:` lines include `buddy.pendingTurns`.

- [ ] **Step 6: Commit**

```bash
git add buddy/.claude-plugin/plugin.json README.md docs/specs/2026-10-08-buddy-memory-design.md
git commit -F - <<'EOF'
chore: buddy 0.4.0, with Memory recorded as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: See it live**

The installed buddy runs the copy cached from GitHub, so it only picks up the change from `main`. Ask the person before pushing or merging. Once it's on `main`:
```bash
claude plugin update buddy@buddy-mods
```
Then, in a session, in the terminal and in the Desktop Code tab:
1. Run `/reload-plugins`.
2. Run `/buddy journal`: the pane opens with `Nothing in <name>'s journal yet.`, unless the buddy is already past a milestone.
3. In one turn, ask Claude to run `false` through Bash five times in a row.
4. Run `/buddy journal` again: `today   Claude failed 5 shell commands in a row`. On the Desktop Code tab it is one drawn card.
5. Close the pane with Escape.

A callback needs a memory an hour old, so check that one on a later day if it isn't seen in the session. Report what was seen. Once it checks out:
- Change the spec's status line from `live check pending` to `live-checked` with the date, and commit that.
- Close issue #10 with a pointer to the merge.
- Tick #10 in the roadmap issue, #18.
