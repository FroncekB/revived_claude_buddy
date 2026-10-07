# `buddy` Alive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the buddy feel alive with no new model calls: a mood saved on each buddy, stats that change how it acts, drawn flinch, celebrate and sleep frames for every species, and a calendar of holiday hats and props.

**Architecture:** Four new pure modules carry the rules:
- `mood.ts`: the meter, the sulk, decay, replaying events
- `calendar.ts`: holidays, Easter, hatch days, night
- `look.ts`: one `draw(scene)` that decides frame, eyes, hat row, face and prop
- `tour.ts`, rewritten: the debug tour's three phases

`sprites.ts` gains the art, `voice.ts` the stat curves and failure lines, `layout.ts` and `svg.ts` colored runs for props, and `record.ts` mood in the flush and the visit. `register.tsx` stays wiring only. It queues mood events beside the counts, holds the pose and the last activity tick in `$.state`, reads the clock once per band draw, and passes the moment into `draw`.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.293 when this was written) for `claude plugin test` and `claude plugin validate`, and TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) and the Foundation spec [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md).

**Starting point:** branch `claude/roadmap-issue-b-e5d21f` at the spec commit `8dd58d4`, on top of `main` at `ed03d09`. 139 tests pass.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text, as it stands after the earlier tasks. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit.
- **Line endings:** LF. Write files with the editor tools, not a Python `write_text` on Windows, which writes CRLF. Don't paste art through a shell heredoc: Git Bash drops one of each pair of backslashes.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared at the top level of the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`, and every key is declared in `PluginState` in `buddy/types/index.d.ts`.
- **Tests find elements by text or type, never by `key`.** A test that reads sprite rows on the terminal takes the `Text` elements that carry a `bold` prop; nothing else may set `bold`.
- **No Node or DOM.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Every hook catches its own errors** and lets the event continue (`next(e)`, or returns `next`'s result unchanged). Work started from `tool.call` goes through `later`, so a tool result never waits on a state write.
- **No new model calls.** Haiku calls keep model `haiku`, `timeoutMs: 8000`, `maxTokens: 80` for speech and 200 for hatch.
- **Forward compatibility:** every change starts from the stored object and spreads it at every level (top, `you`, each `buddies` entry, each `mood`), so fields a newer build wrote survive.
- **Time zones:** tests build local times with `new Date(y, monthIndex, d, h, min)`, never from a `Z` string, so they pass in any zone.
- **Numbers** (spec sections 2 to 4):

  | What | Value |
  |-|-|
  | Meter | −6 to 6; anxious at −2 or below, smug at 2 or above |
  | Sulk | 0 to 3; sulky at 1 or more, and sulky wins |
  | Decay | one step toward 0 per 30 min; one gap counts for at most 2 h |
  | Queued mood events | the newest 20 per seed |
  | Quip chance | `0.15 + 0.25 * CHAOS / 100` |
  | Quip cooldown | `180_000 + 1_800 * PATIENCE` ms |
  | DEBUGGING line | `roll < DEBUGGING / 100`; SNARK pool when `roll < SNARK / 100` |
  | Flinch / celebrate | 4 / 6 ticks |
  | Sleep | idle 1,200 ticks by day, 120 at night (00:00–05:59 local) |
  | Pose eyes | flinch `O`, celebrate `^`, sleep `-` |
  | Mood eyes | anxious `;`, smug `¬`, sulky `=` |

- **Exact text:**

  | Where | Text |
  |-|-|
  | Mood lines | `Mood: anxious, after a run of failures. Let it color the line.` / `Mood: smug, after some long clean turns. Let it color the line.` / `Mood: sulky, the developer stayed away for days. Let it color the line.` |
  | Hatch-day line | `Today is your hatch day: you are 1 year old.`, plural from 2 |
  | Tour reply | `Touring all 18 species with their reactions, then the holidays and moods. Run /buddy debug off to stop.` |
  | Tour name lines | `tour 3/18`, `tour: Halloween`, `tour: anxious` |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. `bandRows` keeps returning bubble strings. A new `rightRuns(bubble, prop)` turns them, or a prop, into the colored runs both surfaces draw, and `bandSvg` takes those runs as `right` in place of `bubble`.
2. A prop's `paint` rows may be shorter than its art rows, and there may be fewer of them. Anything past the paint's end is the text color, so trailing spaces never matter.
3. The card keeps its fidget cycle and blink, as before; spec section 6's "the rest frame" is read as "no pose". Hearts no longer show on the card.
4. `session.start` counts as activity, so a session never opens on a sleeping buddy. Any tool call counts, a subagent's included: the session is busy either way.
5. The flush change's `mood` field is optional, so callers with no mood events and the existing record tests stand.
6. `personaSystem` takes the mood and holiday lines as an argument, so `voice.ts` imports neither `mood.ts` nor `calendar.ts`. `mood.ts` imports `LONG_TURN_MS` from `voice.ts`.
7. Each holiday carries its own persona line (`Holiday.line`), so there is no `holidayLine`. Single days read `Today is …`; Halloween's week reads `It is Halloween week.` and the winter holidays `It is the winter holidays.`
8. The DEBUGGING line tracks its turn by number (`turnNo`, `flaggedTurn`) instead of a flag reset at turn end, because a failed call's line can run after its turn has ended.
9. `look.ts` exports `draw(scene)` and `portrait(bones, tick)` rather than one `look(...)`.
10. The test world's default clock moves from `1_000_000` (New Year's Eve in US time zones) to local noon on 2026-10-07.

---

### Task 1: Mood rules

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/ledger.ts`, `buddy/hooks/ledger.test.ts`
- Create: `buddy/hooks/mood.ts`, `buddy/hooks/mood.test.ts`

**Interfaces:**
- Consumes: `localDay`/`prevDay` style from `ledger.ts`; `LONG_TURN_MS` and `type TurnReason` from `voice.ts`.
- Produces:
  - types in `buddy/types/index.d.ts`: `Mood = { meter: number; sulk: number; at: string }`, `MoodEvent = 'fail' | 'clean' | 'longClean' | 'soothe'`, `mood?: Mood` on `Buddy`
  - `ledger.ts`: `daysBetween(a: string, b: string): number`
  - `mood.ts`:
    - `type MoodName = 'neutral' | 'anxious' | 'smug' | 'sulky'`
    - `MAX_METER`, `MAX_SULK`, `MOOD_STEP_MS`, `MOOD_GAP_MS`, `MAX_QUEUED_MOOD`
    - `MOOD_EYE: Record<Exclude<MoodName, 'neutral'>, string>`
    - `neutralMood(now: number): Mood`
    - `decayMood(mood: Mood | undefined, now: number): Mood`
    - `applyMood(mood: Mood | undefined, events: readonly MoodEvent[], now: number): Mood`
    - `withSulk(mood: Mood | undefined, sulk: number, now: number): Mood`
    - `sulkFor(lastDay: string | null, today: string): number`
    - `moodOf(mood: Mood | undefined, now: number): MoodName`
    - `turnMood(reason: TurnReason, durationMs: number, failedCalls: number): MoodEvent | null`
    - `queueMood(queue: readonly MoodEvent[] | undefined, events: readonly MoodEvent[]): MoodEvent[]`
    - `mergeMood(older, newer: Readonly<Record<string, readonly MoodEvent[]>>): Record<string, MoodEvent[]>`
    - `moodLine(name: MoodName): string | null`

- [ ] **Step 1: Add mood to the contract**

In `buddy/types/index.d.ts`, replace
```ts
export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
}
```
with:
```ts
// A buddy's mood (Alive spec section 2): failures push the meter toward anxious, long clean
// turns toward smug, and days away leave a sulk. `at` is the time decay is measured from.
export type Mood = {
  meter: number
  sulk: number
  at: string
}

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

- [ ] **Step 2: Write the failing tests**

In `buddy/hooks/ledger.test.ts`, replace
```ts
  addCounts, countEvent, localDay, mergePending, prevDay, toolGroup, totalCalls, visit, zeroCounts,
```
with:
```ts
  addCounts, countEvent, daysBetween, localDay, mergePending, prevDay, toolGroup, totalCalls, visit, zeroCounts,
```
and add at the end of the file:
```ts
test('days between two dates count calendar days, across a month, a year and a clock change', () => {
  expect(daysBetween('2026-10-07', '2026-10-07')).toBe(0)
  expect(daysBetween('2026-10-06', '2026-10-07')).toBe(1)
  expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
})
```

Create `buddy/hooks/mood.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `mood.test.ts` fails to load because `./mood` doesn't exist, and the `daysBetween` test fails. The other 139 tests pass.

- [ ] **Step 4: Add `daysBetween`**

In `buddy/hooks/ledger.ts`, replace
```ts
// A new day extends the streak when it follows lastDay, and starts it over otherwise.
```
with:
```ts
// Calendar days from `a` to `b`, both YYYY-MM-DD. Counted on UTC dates, so daylight saving can't move it.
export function daysBetween(a: string, b: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

// A new day extends the streak when it follows lastDay, and starts it over otherwise.
```

- [ ] **Step 5: Write `mood.ts`**

Create `buddy/hooks/mood.ts`:
```ts
// The buddy's mood (Alive spec section 2): a meter that failures push toward anxious and long
// clean turns push toward smug, a sulk left by days away, and how both fade. Pure: no $.
import type { Mood, MoodEvent } from '../types'
import { daysBetween } from './ledger'
import { LONG_TURN_MS } from './voice'
import type { TurnReason } from './voice'

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

// Adds `events` to a queue, keeping the newest MAX_QUEUED_MOOD.
export function queueMood(queue: readonly MoodEvent[] | undefined, events: readonly MoodEvent[]): MoodEvent[] {
  return [...(queue ?? []), ...events].slice(-MAX_QUEUED_MOOD)
}

// Puts `older` back in front of anything queued since, seed by seed.
export function mergeMood(
  older: Readonly<Record<string, readonly MoodEvent[]>>,
  newer: Readonly<Record<string, readonly MoodEvent[]>>,
): Record<string, MoodEvent[]> {
  const merged: Record<string, MoodEvent[]> = {}
  for (const seed of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    merged[seed] = queueMood(older[seed], newer[seed] ?? [])
  }
  return merged
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
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 153 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/ledger.ts buddy/hooks/ledger.test.ts buddy/hooks/mood.ts buddy/hooks/mood.test.ts
git commit -F - <<'EOF'
feat: the mood meter, its sulk, and how both fade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Mood in the saved record

**Files:**
- Modify: `buddy/hooks/record.ts`
- Test: `buddy/hooks/record.test.ts`

**Interfaces:**
- Consumes: `applyMood`, `sulkFor`, `withSulk` from Task 1.
- Produces: the `flush` change gains `mood?: Readonly<Record<string, readonly MoodEvent[]>>`. `applyChange` applies those events to the entry with each seed, and both `visit` and `flush` leave the active buddy sulking on a new day after two or more missed ones.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
    { kind: 'flush', pending: { s: countEvent(zeroCounts(), { kind: 'pet' }) } },
```
with:
```ts
    { kind: 'flush', pending: { s: countEvent(zeroCounts(), { kind: 'pet' }) } },
    { kind: 'flush', pending: {}, mood: { s: ['fail'] } },
```
and add at the end of the file:
```ts
test('a flush applies mood events to the right buddy and drops an unknown seed', () => {
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: {}, mood: { s: ['fail', 'fail'], gone: ['fail'] } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).mood).toEqual({ meter: -2, sulk: 0, at: new Date(NOON).toISOString() })
  expect(activeBuddy(saved).counts).toEqual(zeroCounts())
})

test("a flush builds on the stored mood, another session's included", () => {
  const base = migrate(V1)
  const theirs: Saved = {
    ...base,
    buddies: base.buddies.map(b => ({ ...b, mood: { meter: -3, sulk: 0, at: new Date(NOON).toISOString() } })),
  }
  const saved = applyChange(theirs, { kind: 'flush', pending: {}, mood: { s: ['clean'] } }, NOON)!
  expect(activeBuddy(saved).mood?.meter).toBe(-2)
})

test('a new day after two or more missed ones leaves the active buddy sulking', () => {
  // 2026-10-02 to 2026-10-07 misses four days: sulk 3.
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const visited = applyChange(away, { kind: 'visit' }, NOON)!
  expect(activeBuddy(visited).mood).toMatchObject({ sulk: 3 })
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).mood).toMatchObject({ sulk: 3 })
  // Yesterday leaves no sulk, and a second visit the same day changes nothing.
  const yesterday: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-06' } }
  expect(activeBuddy(applyChange(yesterday, { kind: 'visit' }, NOON)!).mood).toBeUndefined()
  expect(applyChange(visited, { kind: 'visit' }, NOON)).toBeNull()
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: the three new tests fail (no `mood` is written). `fields this build does not know survive every change` still passes. 153 pass.

- [ ] **Step 3: Apply mood in the flush and leave the sulk at the visit**

In `buddy/hooks/record.ts`, replace
```ts
import type { Buddy, Counts, Mode, Saved, SavedV1, Soul } from '../types'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul } from '../types'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
```
Replace
```ts
  | { kind: 'flush'; pending: Readonly<Record<string, Counts>> }
```
with:
```ts
  | {
      kind: 'flush'
      pending: Readonly<Record<string, Counts>>
      // Mood events by seed, replayed in order (Alive spec section 2).
      mood?: Readonly<Record<string, readonly MoodEvent[]>>
    }
```
Replace
```ts
// One change, made on the stored object itself so fields a newer build wrote are kept.
```
with:
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

// One change, made on the stored object itself so fields a newer build wrote are kept.
```
Replace
```ts
    case 'flush': {
      if (!saved) return null
      let added = false
      const buddies = saved.buddies.map(b => {
        const more = change.pending[b.seed]
        if (!more) return b
        added = true
        return { ...b, counts: addCounts(b.counts, more) }
      })
      const you = visit(saved.you, today)
      return added || you !== saved.you ? { ...saved, buddies, you } : null
    }
    case 'visit': {
      if (!saved) return null
      const you = visit(saved.you, today)
      return you !== saved.you ? { ...saved, you } : null
    }
```
with:
```ts
    case 'flush': {
      if (!saved) return null
      let added = false
      const buddies = saved.buddies.map(b => {
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
      const moved = { ...saved, buddies }
      const arrived = arrive(moved, now)
      return added || arrived !== moved ? arrived : null
    }
    case 'visit': {
      if (!saved) return null
      const arrived = arrive(saved, now)
      return arrived !== saved ? arrived : null
    }
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 156 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/record.ts buddy/hooks/record.test.ts
git commit -F - <<'EOF'
feat: save mood with the counts, and sulk after days away

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The calendar

**Files:**
- Create: `buddy/hooks/calendar.ts`, `buddy/hooks/calendar.test.ts`

**Interfaces:**
- Consumes: `localDay` from `ledger.ts`.
- Produces from `calendar.ts`:
  - `type HolidayId = 'newyear' | 'mlk' | 'presidents' | 'easter' | 'aprilfools' | 'memorial' | 'juneteenth' | 'july4' | 'labor' | 'columbus' | 'halloween' | 'veterans' | 'thanksgiving' | 'winter' | 'hatchday'`
  - `type Holiday = { id: HolidayId; name: string; line: string }`
  - `HOLIDAYS: readonly (Holiday & { on(y, m, d): boolean })[]`, 14 entries in match order
  - `nthWeekday(y, m, weekday, n): number`, `lastWeekday(y, m, weekday): number`, `easter(y): [number, number]`
  - `hatchYears(hatchedAt: string, today: string): number | null`, `hatchDay(years: number): Holiday`
  - `holidayOn(today: string, hatchedAt: string): Holiday | null`
  - `isNight(ms: number): boolean`, `dayInfo(ms: number, hatchedAt: string): { holiday: Holiday | null; night: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/calendar.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { HOLIDAYS, dayInfo, easter, hatchYears, holidayOn, isNight, lastWeekday, nthWeekday } from './calendar'

// Hatched at local noon on 2020-07-15, so no test date below is its anniversary.
const HATCHED = new Date(2020, 6, 15, 12).toISOString()
const on = (day: string) => holidayOn(day, HATCHED)?.id ?? null

test('every holiday lands on its 2026 and 2027 dates', () => {
  const cases: [string, string][] = [
    ['2026-01-01', 'newyear'], ['2026-12-31', 'newyear'],
    ['2026-01-19', 'mlk'], ['2027-01-18', 'mlk'],
    ['2026-02-16', 'presidents'], ['2027-02-15', 'presidents'],
    ['2026-04-05', 'easter'], ['2027-03-28', 'easter'],
    ['2026-04-01', 'aprilfools'],
    ['2026-05-25', 'memorial'], ['2027-05-31', 'memorial'],
    ['2026-06-19', 'juneteenth'],
    ['2026-07-04', 'july4'],
    ['2026-09-07', 'labor'], ['2027-09-06', 'labor'],
    ['2026-10-12', 'columbus'], ['2027-10-11', 'columbus'],
    ['2026-11-11', 'veterans'],
    ['2026-11-26', 'thanksgiving'], ['2027-11-25', 'thanksgiving'],
  ]
  for (const [day, id] of cases) expect([day, on(day)]).toEqual([day, id])
})

test('the days around each one-day holiday are plain days', () => {
  const plain = ['2026-01-18', '2026-01-20', '2026-04-04', '2026-04-06', '2026-07-03', '2026-07-05', '2026-11-25', '2026-11-27', '2026-10-07']
  for (const day of plain) expect([day, on(day)]).toEqual([day, null])
})

test('Halloween and the winter holidays include both ends of their ranges', () => {
  expect(on('2026-10-24')).toBeNull()
  expect(on('2026-10-25')).toBe('halloween')
  expect(on('2026-10-31')).toBe('halloween')
  expect(on('2026-11-01')).toBeNull()
  expect(on('2026-12-19')).toBeNull()
  expect(on('2026-12-20')).toBe('winter')
  expect(on('2026-12-26')).toBe('winter')
  expect(on('2026-12-27')).toBeNull()
  expect(on('2026-12-30')).toBeNull()
  expect(on('2027-01-02')).toBeNull()
})

test('Easter beats April Fools when they share a day', () => {
  expect(easter(2029)).toEqual([4, 1])
  expect(on('2029-04-01')).toBe('easter')
})

test('weekday rules count from the start or the end of the month', () => {
  expect(nthWeekday(2026, 1, 1, 3)).toBe(19)
  expect(nthWeekday(2026, 11, 4, 4)).toBe(26)
  expect(lastWeekday(2027, 5, 1)).toBe(31)
  expect(lastWeekday(2026, 5, 1)).toBe(25)
})

test('a hatch day comes each year after the first, and beats a holiday', () => {
  const july4 = new Date(2025, 6, 4, 12).toISOString()
  expect(hatchYears(july4, '2025-07-04')).toBeNull()
  expect(hatchYears(july4, '2026-07-04')).toBe(1)
  expect(holidayOn('2026-07-04', july4)).toEqual({
    id: 'hatchday',
    name: 'Hatch day',
    line: 'Today is your hatch day: you are 1 year old.',
  })
  expect(holidayOn('2028-07-04', july4)?.line).toBe('Today is your hatch day: you are 3 years old.')
  const leapling = new Date(2024, 1, 29, 12).toISOString()
  expect(hatchYears(leapling, '2025-02-28')).toBe(1)
  expect(hatchYears(leapling, '2025-03-01')).toBeNull()
  expect(hatchYears(leapling, '2028-02-29')).toBe(4)
  expect(hatchYears(leapling, '2028-02-28')).toBeNull()
  expect(hatchYears('not a date', '2026-07-04')).toBeNull()
})

test('night runs from midnight to six in the morning, local time', () => {
  expect(isNight(new Date(2026, 9, 7, 0, 0).getTime())).toBe(true)
  expect(isNight(new Date(2026, 9, 7, 5, 59).getTime())).toBe(true)
  expect(isNight(new Date(2026, 9, 7, 6, 0).getTime())).toBe(false)
  expect(isNight(new Date(2026, 9, 7, 23, 59).getTime())).toBe(false)
  expect(dayInfo(new Date(2026, 6, 4, 0, 30).getTime(), HATCHED)).toEqual({
    holiday: { id: 'july4', name: 'Independence Day', line: 'Today is Independence Day.' },
    night: true,
  })
})

test('every holiday has a name and a persona line', () => {
  expect(HOLIDAYS).toHaveLength(14)
  for (const h of HOLIDAYS) {
    expect(h.name.length).toBeGreaterThan(0)
    expect(h.line).toMatch(/^(Today is|It is) .+\.$/)
  }
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `calendar.test.ts` fails to load because `./calendar` doesn't exist. 156 pass.

- [ ] **Step 3: Write `calendar.ts`**

Create `buddy/hooks/calendar.ts`:
```ts
// Holidays, hatch days and night (Alive spec section 5). Dates are the local calendar's,
// YYYY-MM-DD. Pure: no $.
import { localDay } from './ledger'

export type HolidayId =
  | 'newyear' | 'mlk' | 'presidents' | 'easter' | 'aprilfools' | 'memorial' | 'juneteenth' | 'july4'
  | 'labor' | 'columbus' | 'halloween' | 'veterans' | 'thanksgiving' | 'winter' | 'hatchday'

// `name` labels the debug tour; `line` goes into the persona prompt.
export type Holiday = { id: HolidayId; name: string; line: string }

const MONDAY = 1
const THURSDAY = 4

const weekdayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

// The date of the `n`th `weekday` (0 is Sunday) in month `m` (1 to 12).
export function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  return 1 + ((weekday - weekdayOf(y, m, 1) + 7) % 7) + 7 * (n - 1)
}

export function lastWeekday(y: number, m: number, weekday: number): number {
  const last = daysIn(y, m)
  return last - ((weekdayOf(y, m, last) - weekday + 7) % 7)
}

// Easter Sunday as [month, day], by the anonymous Gregorian algorithm.
export function easter(y: number): [number, number] {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return [Math.floor(n / 31), (n % 31) + 1]
}

type Rule = Holiday & { on: (y: number, m: number, d: number) => boolean }

const on = (month: number, date: number) => (_y: number, m: number, d: number) => m === month && d === date
const from = (month: number, first: number, last: number) => (_y: number, m: number, d: number) =>
  m === month && d >= first && d <= last

// In match order: the first that matches wins, so Easter beats April Fools when they share a day.
export const HOLIDAYS: readonly Rule[] = [
  {
    id: 'newyear', name: "New Year's", line: "Today is New Year's.",
    on: (_y, m, d) => (m === 12 && d === 31) || (m === 1 && d === 1),
  },
  {
    id: 'mlk', name: 'Martin Luther King Jr. Day', line: 'Today is Martin Luther King Jr. Day.',
    on: (y, m, d) => m === 1 && d === nthWeekday(y, 1, MONDAY, 3),
  },
  {
    id: 'presidents', name: "Presidents' Day", line: "Today is Presidents' Day.",
    on: (y, m, d) => m === 2 && d === nthWeekday(y, 2, MONDAY, 3),
  },
  {
    id: 'easter', name: 'Easter', line: 'Today is Easter.',
    on: (y, m, d) => {
      const [month, date] = easter(y)
      return m === month && d === date
    },
  },
  { id: 'aprilfools', name: "April Fools' Day", line: "Today is April Fools' Day.", on: on(4, 1) },
  {
    id: 'memorial', name: 'Memorial Day', line: 'Today is Memorial Day.',
    on: (y, m, d) => m === 5 && d === lastWeekday(y, 5, MONDAY),
  },
  { id: 'juneteenth', name: 'Juneteenth', line: 'Today is Juneteenth.', on: on(6, 19) },
  { id: 'july4', name: 'Independence Day', line: 'Today is Independence Day.', on: on(7, 4) },
  {
    id: 'labor', name: 'Labor Day', line: 'Today is Labor Day.',
    on: (y, m, d) => m === 9 && d === nthWeekday(y, 9, MONDAY, 1),
  },
  {
    id: 'columbus', name: "Columbus Day and Indigenous Peoples' Day",
    line: "Today is Columbus Day and Indigenous Peoples' Day.",
    on: (y, m, d) => m === 10 && d === nthWeekday(y, 10, MONDAY, 2),
  },
  { id: 'halloween', name: 'Halloween', line: 'It is Halloween week.', on: from(10, 25, 31) },
  { id: 'veterans', name: 'Veterans Day', line: 'Today is Veterans Day.', on: on(11, 11) },
  {
    id: 'thanksgiving', name: 'Thanksgiving', line: 'Today is Thanksgiving.',
    on: (y, m, d) => m === 11 && d === nthWeekday(y, 11, THURSDAY, 4),
  },
  { id: 'winter', name: 'Winter holidays', line: 'It is the winter holidays.', on: from(12, 20, 26) },
]

const parse = (day: string) => day.split('-').map(Number) as [number, number, number]
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// How many years old the buddy turns `today`, on each anniversary of the local date it hatched
// from its first on; null on any other day. Feb 29 falls on Feb 28 in other years.
export function hatchYears(hatchedAt: string, today: string): number | null {
  const born = Date.parse(hatchedAt)
  if (!Number.isFinite(born)) return null
  const [hy, hm, hd] = parse(localDay(born))
  const [y, m, d] = parse(today)
  if (y <= hy) return null
  const [month, date] = hm === 2 && hd === 29 && !isLeap(y) ? [2, 28] : [hm, hd]
  return m === month && d === date ? y - hy : null
}

export function hatchDay(years: number): Holiday {
  return {
    id: 'hatchday',
    name: 'Hatch day',
    line: `Today is your hatch day: you are ${years} year${years === 1 ? '' : 's'} old.`,
  }
}

// What `today` is: a hatch day first, then the first holiday that matches.
export function holidayOn(today: string, hatchedAt: string): Holiday | null {
  const years = hatchYears(hatchedAt, today)
  if (years !== null) return hatchDay(years)
  const [y, m, d] = parse(today)
  const rule = HOLIDAYS.find(h => h.on(y, m, d))
  return rule ? { id: rule.id, name: rule.name, line: rule.line } : null
}

// Night is local midnight to 05:59, when the buddy dozes off sooner.
export function isNight(ms: number): boolean {
  return new Date(ms).getHours() < 6
}

export function dayInfo(ms: number, hatchedAt: string): { holiday: Holiday | null; night: boolean } {
  return { holiday: holidayOn(localDay(ms), hatchedAt), night: isNight(ms) }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 164 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/calendar.ts buddy/hooks/calendar.test.ts
git commit -F - <<'EOF'
feat: the calendar: US federal holidays, Easter, Halloween, hatch days and night

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Stats that change behavior

**Files:**
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/register.tsx`
- Test: `buddy/hooks/voice.test.ts`

**Interfaces:**
- Consumes: `Bones` and `StatName` from `roll.ts`.
- Produces from `voice.ts`:
  - `quipChance(stats): number`, `quipCooldownMs(stats): number`
  - `shouldQuip({ mode, inFlight, now, lastQuipAt, summary, roll, stats })`: `stats` is new and required
  - `shouldFlag({ mode, bubbleUp, flagged, roll, stats }): boolean`
  - `cannedLine(b: Bones, n: number, roll: number): string`: `roll` is new and required
  - `FAIL_PLAIN`, `FAIL_SNARKY: readonly string[]`, `failLine(b: Bones, n: number, roll: number): string`
  - `personaSystem(soul, b, extra: readonly string[] = [])`
  - `QUIP_CHANCE` is removed; `QUIP_COOLDOWN_MS` stays as the shortest cooldown

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/voice.test.ts`, replace
```ts
import {
  BUBBLE_TICKS, FALLBACK_NAMES, MAX_SAY, QUIP_COOLDOWN_MS, RESERVED_NAMES, SAY_GOAL, bubbleTicks, cannedLine, cleanSay,
  fallbackSoul, hatchRequest, matchAddress, parseSoul, personaSystem, reactionPrompt, shouldGreet, shouldQuip,
  streakGreeting, withArticle,
} from './voice'
```
with:
```ts
import {
  BUBBLE_TICKS, FAIL_PLAIN, FAIL_SNARKY, FALLBACK_NAMES, MAX_SAY, QUIP_COOLDOWN_MS, RESERVED_NAMES, SAY_GOAL,
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, parseSoul, personaSystem,
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, withArticle,
} from './voice'
```
Replace
```ts
const base = { mode: 'on' as const, inFlight: false, now: NOW, lastQuipAt: 0, summary: CALM, roll: 0.9 }
```
with:
```ts
// CHAOS 40 and PATIENCE 0 give the base build's flat 0.25 chance and 3-minute cooldown.
const STATS = { DEBUGGING: 50, PATIENCE: 0, CHAOS: 40, WISDOM: 50, SNARK: 50 }
const base = { mode: 'on' as const, inFlight: false, now: NOW, lastQuipAt: 0, summary: CALM, roll: 0.9, stats: STATS }
```
Replace
```ts
test('canned lines come from the peak stat pool', () => {
  const bones = rollBones('voice-seed')
  expect(cannedLine(bones, 0).length).toBeGreaterThan(0)
  expect(cannedLine(bones, 3)).toBe(cannedLine(bones, 0))
})
```
with:
```ts
test('canned lines come from the peak stat pool, or the SNARK pool when the roll is under SNARK', () => {
  const rolled = rollBones('voice-seed')
  const bones = { ...rolled, peak: 'WISDOM' as const, stats: { ...rolled.stats, SNARK: 30 } }
  const wise = cannedLine(bones, 0, 0.9)
  expect(wise.length).toBeGreaterThan(0)
  expect(cannedLine(bones, 3, 0.9)).toBe(wise)
  expect(cannedLine(bones, 0, 0.3)).toBe(wise)
  expect(cannedLine(bones, 0, 0.29)).not.toBe(wise)
  expect(cannedLine(bones, 0, 0.29)).toBe(cannedLine({ ...bones, peak: 'SNARK' }, 0, 0.9))
})

test('CHAOS sets the quip chance and PATIENCE the cooldown', () => {
  const at = (n: number) => ({ ...STATS, CHAOS: n, PATIENCE: n })
  expect(quipChance(at(1))).toBe(0.1525)
  expect(quipChance(at(50))).toBe(0.275)
  expect(quipChance(at(100))).toBe(0.4)
  expect(quipCooldownMs(at(1))).toBe(181_800)
  expect(quipCooldownMs(at(50))).toBe(270_000)
  expect(quipCooldownMs(at(100))).toBe(360_000)
  // A chaotic buddy speaks after an ordinary turn on a roll a calm one would not.
  expect(shouldQuip({ ...base, roll: 0.35, stats: { ...STATS, CHAOS: 100 } })).toBe(true)
  expect(shouldQuip({ ...base, roll: 0.35, stats: { ...STATS, CHAOS: 1 } })).toBe(false)
  // A patient one waits longer, even after a notable turn.
  const fourMinutesAgo = NOW - 240_000
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: fourMinutesAgo, stats: { ...STATS, PATIENCE: 1 } })).toBe(true)
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: fourMinutesAgo, stats: { ...STATS, PATIENCE: 100 } })).toBe(false)
})

test('DEBUGGING decides whether a failed tool call is said out loud at once', () => {
  const flag = { mode: 'on' as const, bubbleUp: false, flagged: false, roll: 0.5, stats: { ...STATS, DEBUGGING: 60 } }
  expect(shouldFlag(flag)).toBe(true)
  expect(shouldFlag({ ...flag, roll: 0.6 })).toBe(false)
  expect(shouldFlag({ ...flag, roll: 0.999, stats: { ...STATS, DEBUGGING: 100 } })).toBe(true)
  expect(shouldFlag({ ...flag, bubbleUp: true })).toBe(false)
  expect(shouldFlag({ ...flag, flagged: true })).toBe(false)
  expect(shouldFlag({ ...flag, mode: 'muted' })).toBe(false)
  expect(shouldFlag({ ...flag, mode: 'off' })).toBe(false)
})

test('failure lines come in a plain half and a snarky half, picked by SNARK', () => {
  expect(FAIL_PLAIN).toHaveLength(4)
  expect(FAIL_SNARKY).toHaveLength(4)
  const bones = { ...rollBones('voice-seed'), stats: { ...STATS, SNARK: 40 } }
  expect(FAIL_SNARKY).toContain(failLine(bones, 0, 0.39))
  expect(FAIL_PLAIN).toContain(failLine(bones, 0, 0.4))
  expect(failLine(bones, 5, 0.9)).toBe(FAIL_PLAIN[1])
})

test('the persona hears the extra lines between the stats and the reply rules', () => {
  const bones = rollBones('voice-seed')
  const soul = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T00:00:00.000Z' }
  const lines = personaSystem(soul, bones, ['Mood: smug.', 'Today is Easter.']).split('\n')
  expect(lines.slice(3, 5)).toEqual(['Mood: smug.', 'Today is Easter.'])
  expect(lines.at(-1)).toMatch(/^Reply with one line/)
  expect(personaSystem(soul, bones).split('\n')).toHaveLength(4)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `voice.test.ts` fails to load, since `FAIL_PLAIN`, `failLine`, `quipChance`, `quipCooldownMs` and `shouldFlag` don't exist. 164 pass, minus the voice file's tests that ran before.

- [ ] **Step 3: Put the stats into `voice.ts`**

In `buddy/hooks/voice.ts`, replace
```ts
export const QUIP_COOLDOWN_MS = 180_000
export const REPLY_FLOOR_MS = 5_000
export const LONG_TURN_MS = 120_000
export const QUIP_CHANCE = 0.25
```
with:
```ts
// The shortest quip cooldown: PATIENCE only ever lengthens it (Alive spec section 3).
export const QUIP_COOLDOWN_MS = 180_000
export const REPLY_FLOOR_MS = 5_000
export const LONG_TURN_MS = 120_000
```
Replace
```ts
export function shouldQuip(o: {
  mode: Mode
  inFlight: boolean
  now: number
  lastQuipAt: number
  summary: TurnSummary
  roll: number
}): boolean {
  if (o.mode !== 'on' || o.inFlight) return false
  if (o.now - o.lastQuipAt < QUIP_COOLDOWN_MS) return false
  return isNotable(o.summary) || o.roll < QUIP_CHANCE
}
```
with:
```ts
type Stats = Readonly<Record<StatName, number>>

// CHAOS 1 to 100 gives a chance from 0.1525 to 0.40 that an ordinary turn gets a quip.
export function quipChance(stats: Stats): number {
  return 0.15 + (0.25 * stats.CHAOS) / 100
}

// PATIENCE 1 to 100 stretches the cooldown from 3 minutes to 6, so reactions stay at 20 an hour at most.
export function quipCooldownMs(stats: Stats): number {
  return QUIP_COOLDOWN_MS + 1_800 * stats.PATIENCE
}

export function shouldQuip(o: {
  mode: Mode
  inFlight: boolean
  now: number
  lastQuipAt: number
  summary: TurnSummary
  roll: number
  stats: Stats
}): boolean {
  if (o.mode !== 'on' || o.inFlight) return false
  if (o.now - o.lastQuipAt < quipCooldownMs(o.stats)) return false
  return isNotable(o.summary) || o.roll < quipChance(o.stats)
}

// A failed tool call said out loud at once, with no model call: never over a bubble, at most
// once a turn, and as often as DEBUGGING says.
export function shouldFlag(o: { mode: Mode; bubbleUp: boolean; flagged: boolean; roll: number; stats: Stats }): boolean {
  return o.mode === 'on' && !o.bubbleUp && !o.flagged && o.roll < o.stats.DEBUGGING / 100
}
```
Replace
```ts
export function personaSystem(soul: Soul, b: Bones): string {
  return [
    `You are ${soul.name}, ${withArticle(b.rarity)}${b.shiny ? ' shiny' : ''} ${b.species} who lives in a developer's terminal, above their prompt.`,
    `Personality: ${soul.personality}`,
    `Stats: ${statLine(b)}.`,
    `Reply with one line of at most ${SAY_GOAL} characters, in character. No markdown, no emoji, no quotation marks.`,
  ].join('\n')
}
```
with:
```ts
// `extra` carries the moment: the mood and holiday lines (Alive spec sections 2 and 5).
export function personaSystem(soul: Soul, b: Bones, extra: readonly string[] = []): string {
  return [
    `You are ${soul.name}, ${withArticle(b.rarity)}${b.shiny ? ' shiny' : ''} ${b.species} who lives in a developer's terminal, above their prompt.`,
    `Personality: ${soul.personality}`,
    `Stats: ${statLine(b)}.`,
    ...extra,
    `Reply with one line of at most ${SAY_GOAL} characters, in character. No markdown, no emoji, no quotation marks.`,
  ].join('\n')
}
```
Replace
```ts
export function cannedLine(b: Bones, n: number): string {
  const pool = CANNED[b.peak]
  return pool[((n % pool.length) + pool.length) % pool.length]!
}
```
with:
```ts
function nth(pool: readonly string[], n: number): string {
  return pool[((n % pool.length) + pool.length) % pool.length]!
}

// A talk or pet fallback: the SNARK pool when the roll comes in under SNARK, else the peak stat's.
export function cannedLine(b: Bones, n: number, roll: number): string {
  return nth(CANNED[roll < b.stats.SNARK / 100 ? 'SNARK' : b.peak], n)
}

export const FAIL_PLAIN: readonly string[] = [
  "That one didn't take.",
  'A tool just failed. Noted.',
  'Error spotted. Worth a look at the trace.',
  'That call came back red.',
]
export const FAIL_SNARKY: readonly string[] = [
  'Red text. Bold choice.',
  'Ah, the error path. Classic.',
  'That went great, for the error.',
  'Failed. I am not saying anything. Much.',
]

// Said the moment a tool fails (shouldFlag): snarky when the roll comes in under SNARK.
export function failLine(b: Bones, n: number, roll: number): string {
  return nth(roll < b.stats.SNARK / 100 ? FAIL_SNARKY : FAIL_PLAIN, n)
}
```

- [ ] **Step 4: Pass the stats and the rolls from `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
  await showBubble($, text ?? cannedLine(bones, cannedCount++))
```
with:
```ts
  await showBubble($, text ?? cannedLine(bones, cannedCount++, Math.random()))
```
Replace
```ts
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: saved.mode,
    inFlight: inFlight !== null,
    now,
    lastQuipAt: await read($, lastQuipAt),
    summary,
    roll: Math.random(),
  })
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const buddy = activeBuddy(saved)
  const text = await ask($, buddy.soul, rollBones(buddy.seed), reactionPrompt(summary), 'react')
  if (text) await showBubble($, text)
```
with:
```ts
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const buddy = activeBuddy(saved)
  const bones = rollBones(buddy.seed)
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: saved.mode,
    inFlight: inFlight !== null,
    now,
    lastQuipAt: await read($, lastQuipAt),
    summary,
    roll: Math.random(),
    stats: bones.stats,
  })
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const text = await ask($, buddy.soul, bones, reactionPrompt(summary), 'react')
  if (text) await showBubble($, text)
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 168 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/voice.ts buddy/hooks/voice.test.ts buddy/hooks/register.tsx
git commit -F - <<'EOF'
feat: stats change behavior: CHAOS, PATIENCE, DEBUGGING and SNARK

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Reaction frames for every species

**Files:**
- Modify: `buddy/hooks/sprites.ts`
- Test: `buddy/hooks/sprites.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces from `sprites.ts`:
  - `type Pose = 'flinch' | 'celebrate' | 'sleep'`, `POSES: readonly Pose[]`, `POSE_EYE: Record<Pose, string>`
  - `bodyRows(species, frame: Frame | Pose)` and `spriteRows({ species, eye, frame: Frame | Pose, top })`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/sprites.test.ts`, replace
```ts
import { BLANK, HAT_ART, HEARTS, SPRITE_W, bodyRows, eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow } from './sprites'
```
with:
```ts
import {
  BLANK, HAT_ART, HEARTS, POSES, POSE_EYE, SPRITE_W, bodyRows, eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow,
} from './sprites'
```
and add at the end of the file:
```ts
test('every species has a flinch, celebrate and sleep frame of 4 rows within 12 columns, each with an eye', () => {
  const bad: string[] = []
  for (const species of SPECIES) {
    for (const pose of POSES) {
      const rows = bodyRows(species, pose)
      if (rows.length !== 4) bad.push(`${species} ${pose}: ${rows.length} rows`)
      if (!rows.some(row => row.includes('{E}'))) bad.push(`${species} ${pose}: no eye`)
      for (const row of rows) {
        const drawn = fillEyes(row, POSE_EYE[pose])
        if (drawn.length > SPRITE_W) bad.push(`${species} ${pose}: "${drawn}"`)
      }
    }
  }
  expect(bad).toEqual([])
})

test('a posed sprite is 5 rows of 12 with the hat row on top, and differs from the rest frame', () => {
  for (const species of SPECIES) {
    const rest = spriteRows({ species, eye: '·', frame: 0, top: BLANK })
    for (const pose of POSES) {
      const rows = spriteRows({ species, eye: POSE_EYE[pose], frame: pose, top: BLANK })
      expect(rows).toHaveLength(5)
      expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
      expect(rows[0]).toBe(BLANK)
      expect(rows).not.toEqual(rest)
    }
  }
})

test('the pose eyes are none of the rolled eyes', () => {
  for (const pose of POSES) expect(EYES as readonly string[]).not.toContain(POSE_EYE[pose])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: the three new tests fail, since `POSES` and `POSE_EYE` don't exist. 168 pass.

- [ ] **Step 3: Draw the frames**

In `buddy/hooks/sprites.ts`, replace everything from the line `export type Frame = 0 | 1 | 2` up to, but not including, the line ``const EGG = String.raw` `` with the block below. It keeps the rest and fidget-B frames exactly as they are and adds three sections to every species. Paste it with the editor, never through a shell heredoc.

````ts
export type Frame = 0 | 1 | 2
// The reaction poses (Alive spec section 4), drawn for every species.
export type Pose = 'flinch' | 'celebrate' | 'sleep'
export const POSES: readonly Pose[] = ['flinch', 'celebrate', 'sleep']
// Each pose fills {E} with its own eye. None is a rolled eye.
export const POSE_EYE: Record<Pose, string> = { flinch: 'O', celebrate: '^', sleep: '-' }

// Each entry: five sections of four body rows, split by lines holding only "~": rest,
// fidget B, flinch, celebrate, sleep. Lines start at column 0. Rest rows stay within 11
// columns so fidget A (rest nudged one column right) still fits; the others may use all 12.
const ART: Record<Species, string> = {
  duck: String.raw`
    __
  <({E} )___
   ( ._> /
    '---'
~
    __
  <({E} )___
   ( ._> \/
    '---'
~
    __  !
  <({E} )___
  \( ._> /\
    '---'
~
  \ __
  <({E} )___/
   ( ._> /
    '---'
~

    __
  <({E} )____
   (_.__>_/
`,
  goose: String.raw`
    ({E}>
     )|
   _(  )_
   ^^  ^^
~
    ({E}O
     )|
   _(  )_
    ^^ ^^
~
  ! ({E}>
    ( |
   _(  )_
   ^^  ^^
~
    ({E}>
  \  )|  /
   _(  )_
   ^^  ^^
~

    _____
   _( {E}<)_
   ^^  ^^
`,
  blob: String.raw`
  .------.
 ( {E}    {E} )
 (   ~~   )
  '------'
~

 .--------.
( {E}    {E}  )
 '--------'
~
 .-------. !
( {E}    {E}  )
 (   oo   )
  '------'
~
  .------.
\( {E}    {E} )/
 (   \/   )
  '------'
~

  .------.
 ( {E}    {E} )
 '--------'
`,
  cat: String.raw`
  /\_/\
 ( {E} {E} )
 =\ w /=
  (")(")~
~
  /\_/\
 ( {E} {E} )
 =\ w /=
  (")(")_
~
  /\_/\  !
 ( {E} {E} )
 =\ o /=
 /(")(")\
~
  /\_/\
 ( {E} {E} )
\=\ w /=/
  (")(")~
~

  /\_/\___
 ( {E} {E}    )~
  (")(")___)
`,
  dragon: String.raw`
  /)    (\
 (  {E}  {E}  )
  \  vv  /
   \____/
~
  /)    (\
 (  {E}  {E}  )
  \  ~~  /
   \____/~
~
  /)    (\ !
 (  {E}  {E}  )
  \  ^^  /
   \____/~
~
  /)    (\
 (  {E}  {E}  )
  \  vv  /~*
   \____/
~

  /)____(\
 (  {E}  {E}  )
  \______/
`,
  octopus: String.raw`
   ,----,
  ( {E}  {E} )
  (  __  )
  //||||\\
~
   ,----,
  ( {E}  {E} )
  (  __  )
  \\||||//
~
   ,----, !
  ( {E}  {E} )
  (  oo  )
 /// || \\\
~
\\ ,----, //
 \( {E}  {E} )/
  (  \/  )
   /||||\
~

   ,----,
  ( {E}  {E} )
 ~~||||||~~
`,
  owl: String.raw`
  /\____/\
 ( ({E})({E}) )
 (   \/   )
  '------'
~
  /\____/\
 ( ({E})(-) )
 (   \/   )
  '------'
~
  /\____/\ !
 ( ({E})({E}) )
 (   <>   )
 /'------'\
~
  /\____/\
\( ({E})({E}) )/
 (   \/   )
  '------'
~

  /\____/\
 ( ({E})({E}) )
 (___\/___)
`,
  penguin: String.raw`
   .--.
  ({E} v {E})
 /(    )\
   ^  ^
~
   .--.
  ({E} v {E})
 \(    )/
   ^  ^
~
   .--.  !
  ({E} o {E})
 -(    )-
   ^  ^
~
 \ .--. /
  ({E} v {E})
   (    )
  ^    ^
~

   .--.
  ({E} v {E})
 _(____)_
`,
  turtle: String.raw`
   .-==-.
  ( {E}  {E} )
 /[_/\/\_]\
  ''    ''
~
   .-==-.
  ( {E}  {E} )
 /[_/\/\_]\
 ''      ''
~
   .-==-. !
  ( {E}  {E} )
  [_/\/\_]
   ''  ''
~
   .-==-.
 \( {E}  {E} )/
 /[_/\/\_]\
  ''    ''
~

   .-==-.
  [_/{E}{E}\_]
  ''    ''
`,
  snail: String.raw`
 {E} {E}  .--.
 \ \ ( @ )
  \_\_)__/
   ~~~~~~
~
 {E}  {E} .--.
 | / ( @ )
  \_\_)__/
   ~~~~~~
~
  !   .--.
 {E}{E}  ( @ )
  \_\_)__/
   ~~~~~~
~
 {E}   {E} .--.
  \ / ( @ )
  \_\_)__/
   ~~~~~~
~

      .--.
  {E}{E} ( @ )
  \__)__/
`,
  ghost: String.raw`
   .-''-.
  / {E}  {E} \
  |   o  |
  |/\/\/\|
~
   .-''-.
  / {E}  {E} \
  |   O  |
  |\/\/\/|
~
  .-''-.  !
 / {E}  {E}  \
 |   O   |
 |\/\/\/\|
~
   .-''-.
\ / {E}  {E} \ /
  |   v  |
  |/\/\/\|
~

   .-''-.
  / {E}  {E} \
  '~~~~~~'
`,
  axolotl: String.raw`
} ,----, {
}( {E} . {E} ){
  ( '--' )~
   ^    ^
~
{ ,----, }
{( {E} . {E} )}
  ( '--' )~
   ^    ^
~
}},----,{{ !
}( {E} . {E} ){
  ( 'oo' )~
   ^    ^
~
{ ,----, }
{( {E} . {E} )}
 \( '--' )/
   ^    ^
~

} ,----, {
}( {E} . {E} ){
 ~( ____ )~
`,
  capybara: String.raw`
  o______o
 ( {E}    {E} )
 (  (oo)  )
  '------'
~
  o______o
 ( {E}    {E} )
 (  (..)  )
  '------'
~
  o______o !
 ( {E}    {E} )
 (  (OO)  )
 /'------'\
~
  o______o
\( {E}    {E} )/
 (  (oo)  )
  '------'
~

  o______o
 ( {E}    {E} )
 (__(..)__)
`,
  cactus: String.raw`
 n  .--.  n
 | | {E}{E} | |
 '-|    |-'
   |____|
~
 n  .*-.  n
 | | {E}{E} | |
 '-|    |-'
   |____|
~
 n *.--.* n
 | | {E}{E} | |
 '-|  o |-'
   |____|
~
\n  .*-.  n/
 | | {E}{E} | |
 '-|    |-'
   |____|
~
    .--.
   | {E}{E} |
 .-|    |-.
 U |____| U
`,
  robot: String.raw`
    _||_
  |[{E}][{E}]|
  | -==- |
  d[____]b
~
    _|*_
  |[{E}][{E}]|
  | -==- |
  d[____]b
~
  * _||_ *
  |[{E}][{E}]|
  | -!!- |
  d[____]b
~
    _||_
\ |[{E}][{E}]| /
  | \__/ |
  d[____]b
~
    _||_
  |[{E}][{E}]|
  | .... |
 _d[____]b_
`,
  rabbit: String.raw`
   (\  /)
  ( {E}  {E} )
 =(  w  )=
  (")-(")
~
   (\  _)
  ( {E}  {E} )
 =(  w  )=
  (")-(")
~
   ||  || !
  ( {E}  {E} )
 =(  o  )=
  (")-(")
~
   (\  /)
 \( {E}  {E} )/
 =(  w  )=
  ('')('')
~

  __    __
  ( {E}  {E} )
 =(__w__)=
`,
  mushroom: String.raw`
  .-o--o-.
 (________)
   | {E}{E} |
   (____)
~
  .-o--o-. .
 (________)
   | {E}{E} |
   (____)
~
 .-o--o-. .
(________) !
   | {E}{E} |
   (____)
~
  .-o--o-.
 (________)
 \ | {E}{E} | /
   (____)
~

  .-o--o-.
 (________)
   (_{E}{E}_)
`,
  chonk: String.raw`
  /\____/\
 (  {E}  {E}  )
 (   ww   )
  (______)
~
  /\____/\
 (  {E}  {E}  )
 (   ww   )~
  (______)
~
  /\____/\ !
 (  {E}  {E}  )
 (   oo   )
 /(______)\
~
  /\____/\
\(  {E}  {E}  )/
 (   ww   )
  (______)
~

  /\____/\
 (  {E}  {E}  )
 (________)~
`,
}

````

Then replace
```ts
function parseArt(art: string): [string[], string[]] {
  const lines = art.replace(/\r/g, '').split('\n').slice(1, -1)
  const cut = lines.indexOf('~')
  return [lines.slice(0, cut), lines.slice(cut + 1)]
}
```
with:
```ts
// An art string's sections, split at its "~" lines.
function parseArt(art: string): string[][] {
  const sections: string[][] = [[]]
  for (const line of art.replace(/\r/g, '').split('\n').slice(1, -1)) {
    if (line === '~') sections.push([])
    else sections[sections.length - 1]!.push(line)
  }
  return sections
}
```
Replace
```ts
export function bodyRows(species: Species, frame: Frame): string[] {
  const [rest, alt] = parseArt(ART[species])
  if (frame === 1) return rest.map(row => ' ' + row)
  return frame === 0 ? rest : alt
}

export function spriteRows(o: { species: Species; eye: string; frame: Frame; top: string }): string[] {
```
with:
```ts
// Where each frame after the rest frame sits in a species' art.
const SECTION: Record<2 | Pose, number> = { 2: 1, flinch: 2, celebrate: 3, sleep: 4 }

export function bodyRows(species: Species, frame: Frame | Pose): string[] {
  const sections = parseArt(ART[species])
  const rest = sections[0]!
  if (frame === 0) return rest
  if (frame === 1) return rest.map(row => ' ' + row)
  return sections[SECTION[frame]]!
}

export function spriteRows(o: { species: Species; eye: string; frame: Frame | Pose; top: string }): string[] {
```
Replace
```ts
  const [whole, cracked] = parseArt(EGG)
```
with:
```ts
  const [whole, cracked] = parseArt(EGG) as [string[], string[]]
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 171 pass, 0 fail. The existing sprite tests still pass, which shows the rest and fidget frames are unchanged.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/sprites.ts buddy/hooks/sprites.test.ts
git commit -F - <<'EOF'
feat: flinch, celebrate and sleep frames for all 18 species

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The hat row and holiday props

**Files:**
- Modify: `buddy/hooks/sprites.ts`
- Test: `buddy/hooks/sprites.test.ts`

**Interfaces:**
- Consumes: `type HolidayId` from Task 3.
- Produces from `sprites.ts`:
  - `CONFETTI: readonly string[]` (two 12-column rows), `ZZZ: readonly string[]` (`z`, `zZ`, `zZz`, right-aligned to 12)
  - `HOLIDAY_HATS: Readonly<Partial<Record<HolidayId, string>>>`
  - `type Prop = { art: readonly string[]; paint?: readonly string[] }`, `PROP_ROWS = 5`, `PROP_W = 10`
  - `PAINT: Readonly<Record<string, string>>`: `r y g c b m` to color names
  - `PROPS: Readonly<Partial<Record<HolidayId, Prop>>>`
  - `topRow({ hat, heartsFrame, sparkle, confetti?, zzz?, holidayHat? })`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/sprites.test.ts`, replace
```ts
import {
  BLANK, HAT_ART, HEARTS, POSES, POSE_EYE, SPRITE_W, bodyRows, eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow,
} from './sprites'
```
with:
```ts
import {
  BLANK, CONFETTI, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W, SPRITE_W, ZZZ, bodyRows,
  eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow,
} from './sprites'
import type { Prop } from './sprites'
```
and add at the end of the file:
```ts
test('holiday hats fit the hat row, and every prop fits 5 rows by 10 columns with its paint inside it', () => {
  for (const hat of Object.values(HOLIDAY_HATS) as string[]) expect([hat, hat.length <= SPRITE_W]).toEqual([hat, true])
  for (const [id, prop] of Object.entries(PROPS) as [string, Prop][]) {
    expect([id, prop.art.length <= PROP_ROWS]).toEqual([id, true])
    for (const row of prop.art) expect([id, row, row.length <= PROP_W]).toEqual([id, row, true])
    const paint = prop.paint ?? []
    expect([id, paint.length <= prop.art.length]).toEqual([id, true])
    paint.forEach((row, i) => {
      expect([id, row, row.length <= prop.art[i]!.length]).toEqual([id, row, true])
      expect([id, row, /^[rygcbm ]*$/.test(row)]).toEqual([id, row, true])
    })
  }
})

test('the hat row: hearts, then confetti, then zZ, then a holiday hat, then the rolled hat', () => {
  const all = { hat: 'crown' as const, heartsFrame: 0, sparkle: 0, confetti: 0, zzz: 0, holidayHat: HOLIDAY_HATS.halloween! }
  expect(topRow(all)).toContain('♥')
  expect(topRow({ ...all, heartsFrame: null })).toBe(CONFETTI[0])
  expect(topRow({ ...all, heartsFrame: null, confetti: null })).toBe(ZZZ[0])
  expect(topRow({ ...all, heartsFrame: null, confetti: null, zzz: null })).toBe(HOLIDAY_HATS.halloween!.padEnd(SPRITE_W))
  expect(topRow({ ...all, heartsFrame: null, confetti: null, zzz: null, holidayHat: null })).toBe(
    HAT_ART.crown.padEnd(SPRITE_W),
  )
})

test('confetti alternates each tick and the z rises every 2 ticks', () => {
  const confetti = (t: number) => topRow({ hat: 'none', heartsFrame: null, sparkle: null, confetti: t })
  expect(confetti(0)).not.toBe(confetti(1))
  expect(confetti(0)).toBe(confetti(2))
  expect(CONFETTI.every(row => row.length === SPRITE_W)).toBe(true)
  const z = (t: number) => topRow({ hat: 'none', heartsFrame: null, sparkle: null, zzz: t }).trim()
  expect([0, 1, 2, 3, 4, 5, 6].map(z)).toEqual(['z', 'z', 'zZ', 'zZ', 'zZz', 'zZz', 'z'])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `sprites.test.ts` fails to load, since `CONFETTI`, `HOLIDAY_HATS`, `PROPS`, `PROP_ROWS`, `PROP_W` and `ZZZ` don't exist. The other files pass.

- [ ] **Step 3: Add the hats, props and the new hat-row order**

In `buddy/hooks/sprites.ts`, replace
```ts
import type { Hat, Species } from './roll'
```
with:
```ts
import type { HolidayId } from './calendar'
import type { Hat, Species } from './roll'
```
Replace
```ts
export const HEARTS: readonly string[] = ['   ♥    ♥', '  ♥   ♥  ♥', ' ♥  ♥   ♥']
```
with the block below. Paste it with the editor, never through a shell heredoc.
````ts
export const HEARTS: readonly string[] = ['   ♥    ♥', '  ♥   ♥  ♥', ' ♥  ♥   ♥']

// Confetti over a celebration: two patterns that alternate each tick.
export const CONFETTI: readonly string[] = [' *  .  *  . ', ' .  *  .  * ']
// A sleeper's z, zZ, zZz, rising a step every 2 ticks.
export const ZZZ: readonly string[] = ['z', 'zZ', 'zZz'].map(z => z.padStart(SPRITE_W))

// Holiday hats replace the rolled hat for the day (Alive spec section 5). The quieter days
// (MLK, Memorial, Juneteenth, Columbus and Indigenous Peoples', Veterans) have none.
export const HOLIDAY_HATS: Readonly<Partial<Record<HolidayId, string>>> = {
  newyear: '  * _|##|_ *',
  presidents: '   _|==|_',
  easter: '    (\\ /)',
  aprilfools: '   o\\/\\/o',
  july4: '   _|**|_',
  labor: '   _.--._',
  halloween: '   __/\\__',
  thanksgiving: '   _[#]_',
  winter: '    /\\__o',
  hatchday: '   ~*/\\*~',
}

// A prop stands to the right of the sprite while no bubble is up. `paint` colors it: a string
// per row, a letter per column from PAINT; a space, or a column past the paint's end, keeps
// the text color.
export type Prop = { art: readonly string[]; paint?: readonly string[] }
export const PROP_ROWS = 5
export const PROP_W = 10
export const PAINT: Readonly<Record<string, string>> = {
  r: 'red',
  y: 'yellow',
  g: 'green',
  c: 'cyan',
  b: 'blue',
  m: 'magenta',
}

export const PROPS: Readonly<Partial<Record<HolidayId, Prop>>> = {
  newyear: {
    art: ['  \\ | /', ' -- * --', '  / | \\', '     .  *', ' *   .'],
    paint: ['  y y y', ' yy y yy', '  y y y', '     m  m', ' m   m'],
  },
  mlk: {
    art: ['   __', ' >(. \\__', '   \\    )', "    '--'~"],
  },
  easter: {
    art: ['   ___', '  /   \\', ' |o 0 o|', ' |_____|'],
    paint: ['', '', '  m c y'],
  },
  memorial: {
    art: [' .@.', '(@*@)', " '@'", '  |', '  |'],
    paint: [' rrr', 'rrrrr', ' rrr', '  g', '  g'],
  },
  juneteenth: {
    art: ['|=========', '| --*--===', '|=========', '|', '|'],
    paint: [' bbbbbbbbb', '       bbb', ' rrrrrrrrr'],
  },
  july4: {
    art: ['|*:*:=====', '|:*:*-----', '|*:*:=====', '|---------', '|'],
    paint: [' bbbbrrrrr', ' bbbb', ' bbbbrrrrr'],
  },
  columbus: {
    art: ['  _/\\_', ' <    >', '  \\  /', '   \\/', '    \\'],
    paint: ['  yyyy', ' yyyyyy', '  yyyy', '   yy'],
  },
  halloween: {
    art: ['   _|_', " .'^ ^'.", '(  \\_/  )', " '.___.'"],
    paint: ['   ggg', ' yyyyyyy', 'yyyyyyyyy', ' yyyyyyy'],
  },
  veterans: {
    art: ['|*=-=', '|-=-=', '|', '|'],
    paint: [' br r', '  r r'],
  },
  thanksgiving: {
    art: [' \\|||/', '  (o>', ' /(  )\\', '  ^  ^'],
    paint: [' yrrry', '    y'],
  },
  winter: {
    art: ['    *', '   /.\\', '  /o *\\', ' /*_o__\\', '   [_]'],
    paint: ['    y', '   ggg', '  gr yg', ' gygrggg'],
  },
  hatchday: {
    art: ['  i i i', ' _|_|_|_', '|~~~~~~~|', '|_______|'],
    paint: ['  y y y', '  m m m', ' mmmmmmm'],
  },
}
````
Replace
```ts
export function topRow(o: { hat: Hat | 'none'; heartsFrame: number | null; sparkle: number | null }): string {
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
```
with:
```ts
// The hat row, the first that applies: hearts, confetti, zZ, a holiday hat, the rolled hat, the sparkle.
export function topRow(o: {
  hat: Hat | 'none'
  heartsFrame: number | null
  sparkle: number | null
  confetti?: number | null
  zzz?: number | null
  holidayHat?: string | null
}): string {
  const confetti = o.confetti ?? null
  const zzz = o.zzz ?? null
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (confetti !== null) return fit(CONFETTI[confetti % CONFETTI.length]!)
  if (zzz !== null) return fit(ZZZ[Math.floor(zzz / 2) % ZZZ.length]!)
  if (o.holidayHat) return fit(o.holidayHat)
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 174 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/sprites.ts buddy/hooks/sprites.test.ts
git commit -F - <<'EOF'
feat: holiday hats and props, confetti and the rising z

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: One function for what the band shows

**Files:**
- Create: `buddy/hooks/look.ts`, `buddy/hooks/look.test.ts`

**Interfaces:**
- Consumes: `type Holiday` (Task 3); `MOOD_EYE`, `type MoodName` (Task 1); `HOLIDAY_HATS`, `POSE_EYE`, `PROPS`, `faceFor`, `frameAt`, `spriteRows`, `topRow`, `type Pose`, `type Prop` (Tasks 5 and 6).
- Produces from `look.ts`:
  - `FLINCH_TICKS = 4`, `CELEBRATE_TICKS = 6`, `DAY_SLEEP_TICKS = 1_200`, `NIGHT_SLEEP_TICKS = 120`
  - `type Scene = { bones: Pick<Bones, 'species' | 'eye' | 'hat' | 'shiny'>; tick: number; mood: MoodName; pose: Pose | null; idleTicks: number; night: boolean; holiday: Holiday | null; heartsFrame: number | null; saying: boolean }`
  - `type Drawn = { sprite: string[]; face: string; prop: Prop | null; asleep: boolean }`
  - `isAsleep(s): boolean`, `draw(s: Scene): Drawn`, `portrait(bones, tick): string[]`

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/look.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { holidayOn } from './calendar'
import { DAY_SLEEP_TICKS, NIGHT_SLEEP_TICKS, draw, isAsleep, portrait } from './look'
import type { Scene } from './look'
import { MOOD_EYE } from './mood'
import { CONFETTI, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SPRITE_W, ZZZ, bodyRows, fillEyes } from './sprites'
import type { Pose } from './sprites'

// A plain duck in a crown, doing nothing in particular.
const BONES = { species: 'duck' as const, eye: '·' as const, hat: 'crown' as const, shiny: false }
const CALM: Scene = {
  bones: BONES, tick: 0, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame: null, saying: false,
}
const HATCHED = new Date(2020, 0, 15, 12).toISOString()
const JULY4 = holidayOn('2026-07-04', HATCHED)
const body = (rows: string[]) => rows.slice(1).map(r => r.trimEnd())
const posed = (pose: Pose) => bodyRows('duck', pose).map(r => fillEyes(r, POSE_EYE[pose]).trimEnd())

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
  const rows = portrait(BONES, 0)
  expect(rows[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(rows.join('\n')).toContain('<(· )___')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `look.test.ts` fails to load because `./look` doesn't exist. 174 pass.

- [ ] **Step 3: Write `look.ts`**

Create `buddy/hooks/look.ts`:
```ts
// What the band shows at one moment (Alive spec section 6): the body frame, the eyes, the hat
// row, the compact face and a prop, each by its own order of what wins. Pure: no $.
import type { Holiday } from './calendar'
import { MOOD_EYE } from './mood'
import type { MoodName } from './mood'
import type { Bones } from './roll'
import { HOLIDAY_HATS, POSE_EYE, PROPS, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Pose, Prop } from './sprites'

export const FLINCH_TICKS = 4
export const CELEBRATE_TICKS = 6
// Idle ticks before sleep: 10 minutes by day, 1 at night.
export const DAY_SLEEP_TICKS = 1_200
export const NIGHT_SLEEP_TICKS = 120

export type Scene = {
  bones: Pick<Bones, 'species' | 'eye' | 'hat' | 'shiny'>
  tick: number
  mood: MoodName
  // A flinch or celebrate still running. Only the debug tour poses 'sleep'; otherwise sleep
  // comes from idle time.
  pose: Pose | null
  idleTicks: number
  night: boolean
  holiday: Holiday | null
  heartsFrame: number | null
  saying: boolean
}

export type Drawn = { sprite: string[]; face: string; prop: Prop | null; asleep: boolean }

// Asleep when posed so, or idle long enough with no pose, bubble or hearts to keep it awake.
export function isAsleep(s: Pick<Scene, 'pose' | 'idleTicks' | 'night' | 'heartsFrame' | 'saying'>): boolean {
  if (s.pose !== null) return s.pose === 'sleep'
  if (s.saying || s.heartsFrame !== null) return false
  return s.idleTicks >= (s.night ? NIGHT_SLEEP_TICKS : DAY_SLEEP_TICKS)
}

export function draw(s: Scene): Drawn {
  const asleep = isAsleep(s)
  const pose: Pose | null = asleep ? 'sleep' : s.pose
  const { frame, blink } = frameAt(s.tick)
  const eye = pose ? POSE_EYE[pose] : blink ? '-' : s.mood === 'neutral' ? s.bones.eye : MOOD_EYE[s.mood]
  const top = topRow({
    hat: s.bones.hat,
    heartsFrame: s.heartsFrame,
    sparkle: s.bones.shiny ? s.tick : null,
    confetti: pose === 'celebrate' ? s.tick : null,
    zzz: asleep ? s.tick : null,
    holidayHat: s.holiday ? (HOLIDAY_HATS[s.holiday.id] ?? null) : null,
  })
  return {
    sprite: spriteRows({ species: s.bones.species, eye, frame: pose ?? frame, top }),
    face: faceFor(s.bones.species, eye) + (asleep ? ' zZ' : ''),
    prop: s.holiday && !s.saying ? (PROPS[s.holiday.id] ?? null) : null,
    asleep,
  }
}

// The card's portrait: who the buddy is, with its fidgets and blink but none of the moment's
// pose, sleep, mood, hearts or holiday.
export function portrait(bones: Scene['bones'], tick: number): string[] {
  return draw({
    bones, tick, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame: null, saying: false,
  }).sprite
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 181 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/look.ts buddy/hooks/look.test.ts
git commit -F - <<'EOF'
feat: one pure draw for the band: pose, sleep, eyes, hat row and prop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Colored runs on both surfaces

**Files:**
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/svg.ts`, `buddy/hooks/register.tsx`
- Test: `buddy/hooks/layout.test.ts`, `buddy/hooks/svg.test.ts`

**Interfaces:**
- Consumes: `PAINT`, `type Prop` (Task 6).
- Produces:
  - `layout.ts`: `type Run = { text: string; color?: string }`, `PROP_GAP = 2`, `paintRuns(art: string, paint?: string): Run[]`, `rightRuns(bubble: readonly string[], prop: Prop | null): Run[][]`
  - `svg.ts`: `bandSvg({ sprite, right: readonly (readonly Run[])[], color, bold })`, which replaces the `bubble` input. A colored run draws as `<tspan class="paint-<color>">` with light and dark fills.
  - `register.tsx` draws the right-hand column from `rightRuns` on both surfaces. It passes `null` for the prop until Task 9.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/layout.test.ts`, replace
```ts
  pageAt, spriteTint, streakLine, wrap,
```
with:
```ts
  pageAt, paintRuns, rightRuns, spriteTint, streakLine, wrap,
```
and add at the end of the file:
```ts
test('a painted row splits into runs by color, and unpainted columns keep the text color', () => {
  expect(paintRuns('|*:*==', ' bbbrr')).toEqual([{ text: '|' }, { text: '*:*', color: 'blue' }, { text: '==', color: 'red' }])
  expect(paintRuns('|----', ' bb')).toEqual([{ text: '|' }, { text: '--', color: 'blue' }, { text: '--' }])
  expect(paintRuns('plain')).toEqual([{ text: 'plain' }])
})

test('the right-hand column: the bubble when there is one, else the prop after a 2-column gap', () => {
  const prop = { art: ['|*=', '|='], paint: [' br'] }
  const quiet = rightRuns(['', '', '', '', ''], prop)
  expect(quiet[0]).toEqual([{ text: '  ' }, { text: '|' }, { text: '*', color: 'blue' }, { text: '=', color: 'red' }])
  expect(quiet[1]).toEqual([{ text: '  ' }, { text: '|=' }])
  expect(quiet[2]).toEqual([{ text: ' ' }])
  const talking = bandRows(SPRITE, 'Hello there.', 80, 0)
  expect(rightRuns(talking.bubble, prop).map(row => row.map(r => r.text).join(''))).toEqual(
    talking.bubble.map(row => ' ' + row),
  )
  expect(rightRuns(['', '', '', '', ''], null)).toEqual(Array.from({ length: 5 }, () => [{ text: ' ' }]))
})
```

In `buddy/hooks/svg.test.ts`, replace
```ts
import { SHIMMER } from './layout'
import { RARITIES, RARITY } from './roll'
```
with:
```ts
import { SHIMMER, rightRuns } from './layout'
import { RARITIES, RARITY } from './roll'
import { PAINT } from './sprites'
```
Replace every occurrence of `bubble: NO_BUBBLE` with `right: rightRuns(NO_BUBBLE, null)` (three places).

Replace every occurrence of `{ sprite: SPRITE, bubble, ` with `{ sprite: SPRITE, right: rightRuns(bubble, null), ` (two places).

Replace
```ts
  const asked = [...SHIMMER, ...RARITIES.map(r => RARITY[r].color).filter(c => c !== undefined)]
```
with:
```ts
  const asked = [...SHIMMER, ...Object.values(PAINT), ...RARITIES.map(r => RARITY[r].color).filter(c => c !== undefined)]
```
and add at the end of the file:
```ts
test('a painted prop gets its own fills in light and dark themes', () => {
  const right = rightRuns(['', '', '', '', ''], { art: ['|*='], paint: [' br'] })
  const { source } = bandSvg({ sprite: SPRITE, right, color: undefined, bold: false })
  expect(source).toContain('<tspan class="paint-blue">*</tspan><tspan class="paint-red">=</tspan>')
  expect(source).toContain(`.paint-blue{fill:${SVG_COLORS.blue![0]}}`)
  expect(source).toContain(`.paint-red{fill:${SVG_COLORS.red![1]}}}`)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `layout.test.ts` and `svg.test.ts` fail to load, since `paintRuns` and `rightRuns` don't exist. The other files pass.

- [ ] **Step 3: Add the runs to `layout.ts`**

In `buddy/hooks/layout.ts`, replace
```ts
import { totalCalls } from './ledger'
```
with:
```ts
import { totalCalls } from './ledger'
import { PAINT } from './sprites'
import type { Prop } from './sprites'

// A stretch of one row in one color; no color is the text color.
export type Run = { text: string; color?: string }
// Columns between the sprite and a prop.
export const PROP_GAP = 2

// One art row cut into runs by its paint: a paint letter picks a color, and a space or a
// column past the paint's end keeps the text color.
export function paintRuns(art: string, paint = ''): Run[] {
  const runs: Run[] = []
  for (let i = 0; i < art.length; i++) {
    const color = PAINT[paint.charAt(i)]
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += art.charAt(i)
    else runs.push(color ? { text: art.charAt(i), color } : { text: art.charAt(i) })
  }
  return runs
}

// The band's right-hand column, a row of runs per sprite row: the bubble when it has one, else
// a holiday prop after a 2-column gap, else a space.
export function rightRuns(bubble: readonly string[], prop: Prop | null): Run[][] {
  const quiet = bubble.every(row => !row)
  return bubble.map((row, i) => {
    const art = quiet ? prop?.art[i] : undefined
    return art ? [{ text: ' '.repeat(PROP_GAP) }, ...paintRuns(art, prop?.paint?.[i])] : [{ text: ' ' + row }]
  })
}
```

- [ ] **Step 4: Draw the runs in `svg.ts`**

In `buddy/hooks/svg.ts`, replace
```ts
// The desktop band's art as one SVG: the desktop's Text is proportional and
// its Code is colored by the engine, so the rows are monospace SVG text whose
// fill the mod picks. Pure: no $.
```
with:
```ts
// The desktop band's art as one SVG: the desktop's Text is proportional and
// its Code is colored by the engine, so the rows are monospace SVG text whose
// fill the mod picks. Pure: no $.
import type { Run } from './layout'
```
Replace
```ts
export function bandSvg(o: {
  sprite: readonly string[]
  bubble: readonly string[]
  color: string | undefined
  bold: boolean
}): { source: string; width: number; height: number } {
  const ink = SVG_COLORS.ink!
  const fill = SVG_COLORS[o.color ?? 'ink'] ?? ink
  const rows = o.sprite.map((sprite, i) => ({ sprite, say: ' ' + (o.bubble[i] ?? '') }))
  const width = Math.max(...rows.map(r => r.sprite.length + r.say.length)) * CHAR_PX + 4
  const height = rows.length * LINE_PX + 4
  const style =
    `text{font-family:ui-monospace,Menlo,Consolas,"Courier New",monospace;font-size:${FONT_PX}px;white-space:pre}` +
    `.ink{fill:${ink[0]}}.sprite{fill:${fill[0]}${o.bold ? ';font-weight:bold' : ''}}` +
    `@media (prefers-color-scheme:dark){.ink{fill:${ink[1]}}.sprite{fill:${fill[1]}}}`
  const lines = rows.map(
    (r, i) =>
      `<text x="0" y="${(i + 1) * LINE_PX - 3}" xml:space="preserve">` +
      `<tspan class="sprite">${esc(r.sprite)}</tspan><tspan class="ink">${esc(r.say)}</tspan></text>`,
  )
```
with:
```ts
// `right` is the column beside the sprite, a row of runs per sprite row (layout's rightRuns).
export function bandSvg(o: {
  sprite: readonly string[]
  right: readonly (readonly Run[])[]
  color: string | undefined
  bold: boolean
}): { source: string; width: number; height: number } {
  const ink = SVG_COLORS.ink!
  const fill = SVG_COLORS[o.color ?? 'ink'] ?? ink
  const rows = o.sprite.map((sprite, i) => ({ sprite, right: o.right[i] ?? [] }))
  const width =
    Math.max(...rows.map(r => r.sprite.length + r.right.reduce((n, run) => n + run.text.length, 0))) * CHAR_PX + 4
  const height = rows.length * LINE_PX + 4
  // A painted prop's colors, each a `paint-<color>` class with a light and a dark fill.
  const painted = [...new Set(rows.flatMap(r => r.right.map(run => run.color)))].filter(
    (c): c is string => c !== undefined && SVG_COLORS[c] !== undefined,
  )
  const light = painted.map(c => `.paint-${c}{fill:${SVG_COLORS[c]![0]}}`).join('')
  const dark = painted.map(c => `.paint-${c}{fill:${SVG_COLORS[c]![1]}}`).join('')
  const style =
    `text{font-family:ui-monospace,Menlo,Consolas,"Courier New",monospace;font-size:${FONT_PX}px;white-space:pre}` +
    `.ink{fill:${ink[0]}}.sprite{fill:${fill[0]}${o.bold ? ';font-weight:bold' : ''}}${light}` +
    `@media (prefers-color-scheme:dark){.ink{fill:${ink[1]}}.sprite{fill:${fill[1]}}${dark}}`
  const span = (run: Run) =>
    `<tspan class="${run.color && SVG_COLORS[run.color] ? `paint-${run.color}` : 'ink'}">${esc(run.text)}</tspan>`
  const lines = rows.map(
    (r, i) =>
      `<text x="0" y="${(i + 1) * LINE_PX - 3}" xml:space="preserve">` +
      `<tspan class="sprite">${esc(r.sprite)}</tspan>${r.right.map(span).join('')}</text>`,
  )
```

- [ ] **Step 5: Draw the runs from `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import { bandRows, cardLines, compactLine, isCompact, nameLine, spriteTint, streakLine } from './layout'
```
with:
```ts
import { bandRows, cardLines, compactLine, isCompact, nameLine, rightRuns, spriteTint, streakLine } from './layout'
```
Replace
```tsx
      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns, view.sayAt)
      const nameRow = (
```
with:
```tsx
      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns, view.sayAt)
      const right = rightRuns(rows.bubble, null)
      const nameRow = (
```
Replace
```tsx
        const art = bandSvg({ ...rows, color: view.spriteColor, bold: view.spriteBold })
```
with:
```tsx
        const art = bandSvg({ sprite: rows.sprite, right, color: view.spriteColor, bold: view.spriteBold })
```
Replace
```tsx
              <Text>{' ' + (rows.bubble[i] ?? '')}</Text>
```
with:
```tsx
              {(right[i] ?? []).map(run => (
                <Text {...tint(run.color)}>{run.text}</Text>
              ))}
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 184 pass, 0 fail. The existing band tests (six rows, the narrow band's pages, the desktop Svg) pass on the new runs unchanged.

- [ ] **Step 7: Commit**

```bash
git add buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/svg.ts buddy/hooks/svg.test.ts buddy/hooks/register.tsx
git commit -F - <<'EOF'
feat: the band's right-hand column as colored runs, for painted props

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: The band through `look.ts`: holidays, sleep and activity

**Files:**
- Modify: `buddy/types/index.d.ts`, `buddy/hooks/register.tsx`
- Test: `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `dayInfo` (Task 3); `applyMood`, `moodOf` (Task 1); `draw`, `portrait`, `type Scene` (Task 7); `rightRuns` (Task 8).
- Produces:
  - `PluginState.buddy` gains `pose: { kind: 'flinch' | 'celebrate'; untilTick: number } | null`, `lastActiveTick: number`, `pendingMood: Record<string, MoodEvent[]>`
  - in `register.tsx`: atoms `posing` (key `pose`), `lastActive` (key `lastActiveTick`) and `pendingMood`; `stir($)`; `liveScene(...)`; `Look.prop`
  - the band shows holiday hats and props, sleeps when idle, and wakes on activity; the card draws `portrait`

- [ ] **Step 1: Declare the new state**

In `buddy/types/index.d.ts`, replace
```ts
      // Counts not yet saved, by buddy seed (Foundation spec section 2).
      pending: Record<string, Counts>
```
with:
```ts
      // Counts not yet saved, by buddy seed (Foundation spec section 2).
      pending: Record<string, Counts>
      // A flinch or celebrate and the tick it ends on (Alive spec section 4).
      pose: { kind: 'flinch' | 'celebrate'; untilTick: number } | null
      // The tick of the last activity, for idle sleep.
      lastActiveTick: number
      // Mood events not yet saved, by buddy seed (Alive spec section 2).
      pendingMood: Record<string, MoodEvent[]>
```

- [ ] **Step 2: Write the failing tests**

In `buddy/hooks/buddy.test.tsx`, replace
```ts
// The world beneath the plugin: a clock, a store, the command registry, session
```
with:
```ts
// Local noon on Wednesday 2026-10-07 in any time zone: not a holiday and not night, so the
// band's calendar stays out of every test that doesn't ask for it.
const NOON = new Date(2026, 9, 7, 12).getTime()

// The world beneath the plugin: a clock, a store, the command registry, session
```
Replace
```ts
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true, now = 1_000_000) {
```
with:
```ts
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true, now = NOON) {
```
Replace
```ts
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()

const SAVED: Saved = {
```
with:
```ts
const SAVED: Saved = {
```
and add at the end of the file:
```tsx
// A terminal band's elements, as much of them as these tests read.
type Drawn = { findAll: (q: { type: string }) => Promise<{ text?: string; props: Record<string, unknown> }[]> }

// The five sprite rows a terminal band drew, as text: the Text elements carrying a `bold` prop.
const drawnSprite = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Text' })).filter(t => 'bold' in t.props).map(t => t.text ?? '')

// Local noon on Independence Day 2026.
const JULY4_NOON = new Date(2026, 6, 4, 12).getTime()

test('on the Fourth of July a quiet buddy wears the hat and holds the flag; a bubble takes its place', async ($, on) => {
  const clock = world(on, { buddy: RECORD }, true, JULY4_NOON)
  model(on, null, 'Fireworks later?')
  await $.session.start(START)
  await clock.settle()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(terminal))[0]).toContain('_|**|_')
  expect((await terminal.find({ type: 'Text', text: /^\*:\*:$/ }))?.props.color).toBe('blue')
  expect((await terminal.find({ type: 'Text', text: /^=====$/ }))?.props.color).toBe('red')
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band() })
  expect(String((await desktop.find({ type: 'Svg' }))?.props.source)).toContain('<tspan class="paint-blue">*:*:</tspan>')
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  expect((await short.findAll({ type: 'Text' })).map(t => t.text).join('')).not.toContain('*:*:')
  await runner($)('pet')
  await clock.settle()
  expect(await terminal.find({ type: 'Text', text: /Fireworks later\?/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /^\*:\*:$/ })).toBeUndefined()
})

test('the card keeps the rolled hat on a holiday', async ($, on) => {
  // 'tint-11' rolls a rare penguin in a wizard hat.
  const clock = world(on, { buddy: { ...RECORD, seed: 'tint-11' } }, true, JULY4_NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui))[0]).toContain('_|**|_')
  const card = await cardText($)
  expect(card).toContain('/*\\')
  expect(card).not.toContain('_|**|_')
})

test('a buddy left alone for 10 minutes falls asleep, and a prompt wakes it', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(599_000)
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
  await clock.advance(1_000)
  expect((await drawnSprite(ui))[0]).toMatch(/z$/)
  // The ghost's sleep frame, eyes shut.
  expect((await drawnSprite(ui)).join('\n')).toContain('/ -  - \\')
  await $.prompt.submit({ text: 'run the tests', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
})

test('at night the buddy dozes off after a minute', async ($, on) => {
  const clock = world(on, { buddy: RECORD }, true, new Date(2026, 9, 7, 0, 30).getTime())
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(59_500)
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
  await clock.advance(500)
  expect((await drawnSprite(ui))[0]).toMatch(/z$/)
})
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: the four new tests fail: the band shows no holiday, never sleeps, and the card still reads the band's look. 184 pass.

- [ ] **Step 4: Wire the scene into `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import type { Buddy, Counts, Saved, Soul } from '../types'
import { cardAlt, cardSvg, meter } from './card'
```
with:
```ts
import type { Buddy, Counts, Saved, Soul } from '../types'
import { dayInfo } from './calendar'
import { cardAlt, cardSvg, meter } from './card'
```
Replace
```ts
import type { CountEvent } from './ledger'
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub } from './record'
```
with:
```ts
import type { CountEvent } from './ledger'
import { draw, portrait } from './look'
import type { Scene } from './look'
import { applyMood, moodOf } from './mood'
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub } from './record'
```
Replace
```ts
import { eggRows, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Frame } from './sprites'
```
with:
```ts
import { eggRows, frameAt } from './sprites'
import type { Frame, Prop } from './sprites'
```
Replace
```ts
const pending = atom({ plugin: 'buddy', key: 'pending' } as const, {})
```
with:
```ts
const pending = atom({ plugin: 'buddy', key: 'pending' } as const, {})
const posing = atom({ plugin: 'buddy', key: 'pose' } as const, null)
const lastActive = atom({ plugin: 'buddy', key: 'lastActiveTick' } as const, 0)
const pendingMood = atom({ plugin: 'buddy', key: 'pendingMood' } as const, {})
```
Replace
```ts
  // How far through its life the bubble is, 0 to 1: which page a long one is on.
  sayAt: number
}
```
with:
```ts
  // How far through its life the bubble is, 0 to 1: which page a long one is on.
  sayAt: number
  // A holiday prop beside the sprite, while nothing is said.
  prop: Prop | null
}
```
Replace
```ts
async function showBubble($: EngineInterface, text: string) {
```
with:
```ts
// Activity: the buddy wakes, and idle sleep counts from now (Alive spec section 4).
async function stir($: EngineInterface) {
  const now = await read($, tick)
  await update($, lastActive, () => now)
}

async function showBubble($: EngineInterface, text: string) {
```
Replace
```ts
    say: null,
    sayAt: 0,
  }
}
```
with:
```ts
    say: null,
    sayAt: 0,
    prop: null,
  }
}
```
Replace the whole of `buddyLook`:
```ts
// `withTour` false draws the real buddy whatever the band is touring (the card pane).
async function buddyLook($: EngineInterface, saved: Saved, t: number, withTour = true): Promise<Look> {
  const buddy = activeBuddy(saved)
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = withTour ? await read($, tourStart) : null
  const tour = started === null ? null : tourAt(t - started)
  const bones = tour ? { ...rollBones(buddy.seed), ...tour.look } : rollBones(buddy.seed)
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : buddy.soul.name
  const animTick = tour ? tour.tick : t
  const { frame, blink } = frameAt(animTick)
  const eye = blink ? '-' : bones.eye
  const heartsUntilTick = await read($, heartsUntil)
  const top = topRow({
    hat: bones.hat,
    heartsFrame: t < heartsUntilTick ? t : null,
    sparkle: bones.shiny ? animTick : null,
  })
  const said = await read($, bubble)
  const saying = said !== null && t < said.untilTick
  const { label, stars } = nameLine(name, bones)
  const sprite = spriteTint(bones, animTick)
  return {
    sprite: spriteRows({ species: bones.species, eye, frame, top }),
    face: faceFor(bones.species, eye),
    name,
    label,
    stars,
    starColor: RARITY[bones.rarity].color,
    spriteColor: sprite.color,
    spriteBold: sprite.bold,
    say: saying ? said.text : null,
    sayAt: saying ? (t - said.fromTick) / (said.untilTick - said.fromTick) : 0,
  }
}
```
with:
```ts
// The moment as it really is: the mood with this session's unsaved events, a pose still running,
// idle time, and what the clock says about night and holidays.
async function liveScene(
  $: EngineInterface,
  buddy: Buddy,
  bones: Bones,
  t: number,
  heartsFrame: number | null,
  saying: boolean,
): Promise<Scene> {
  const now = await $.clock.now()
  const day = dayInfo(now, buddy.soul.hatchedAt)
  const queued = (await read($, pendingMood))[buddy.seed] ?? []
  const posed = await read($, posing)
  return {
    bones,
    tick: t,
    mood: moodOf(applyMood(buddy.mood, queued, now), now),
    pose: posed && t < posed.untilTick ? posed.kind : null,
    idleTicks: t - (await read($, lastActive)),
    night: day.night,
    holiday: day.holiday,
    heartsFrame,
    saying,
  }
}

async function buddyLook($: EngineInterface, saved: Saved, t: number): Promise<Look> {
  const buddy = activeBuddy(saved)
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = await read($, tourStart)
  const tour = started === null ? null : tourAt(t - started)
  const bones = tour ? { ...rollBones(buddy.seed), ...tour.look } : rollBones(buddy.seed)
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : buddy.soul.name
  const animTick = tour ? tour.tick : t
  const heartsUntilTick = await read($, heartsUntil)
  const heartsFrame = t < heartsUntilTick ? t : null
  const said = await read($, bubble)
  const saying = said !== null && t < said.untilTick
  const scene: Scene = tour
    ? { bones, tick: animTick, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame, saying }
    : await liveScene($, buddy, bones, t, heartsFrame, saying)
  const drawn = draw(scene)
  const { label, stars } = nameLine(name, bones)
  const sprite = spriteTint(bones, animTick)
  return {
    sprite: drawn.sprite,
    face: drawn.face,
    name,
    label,
    stars,
    starColor: RARITY[bones.rarity].color,
    spriteColor: sprite.color,
    spriteBold: sprite.bold,
    say: saying ? said.text : null,
    sayAt: saying ? (t - said.fromTick) / (said.untilTick - said.fromTick) : 0,
    prop: drawn.prop,
  }
}
```
Replace
```tsx
      const right = rightRuns(rows.bubble, null)
```
with:
```tsx
      const right = rightRuns(rows.bubble, view.prop)
```
In the card pane's render hook, replace
```tsx
      const view = await buddyLook($, saved, await read($, tick), false)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{buddy.soul.name}</Text>
            <Text {...tint(view.starColor)}>{'  ' + view.stars}</Text>
          </Box>
```
with:
```tsx
      // The card is the buddy as it rolled: no pose, sleep, mood, hearts or holiday.
      const t = await read($, tick)
      const sprite = spriteTint(bones, t)
      const starColor = RARITY[bones.rarity].color
      const { stars } = nameLine(buddy.soul.name, bones)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{buddy.soul.name}</Text>
            <Text {...tint(starColor)}>{'  ' + stars}</Text>
          </Box>
```
Replace
```tsx
          {view.sprite.map(row => (
            <Text {...tint(view.spriteColor)} bold={view.spriteBold}>
```
with:
```tsx
          {portrait(bones, t).map(row => (
            <Text {...tint(sprite.color)} bold={sprite.bold}>
```
Replace
```tsx
              <Text {...tint(view.starColor)}>{meter(bones.stats[s], cells)}</Text>
```
with:
```tsx
              <Text {...tint(starColor)}>{meter(bones.stats[s], cells)}</Text>
```

- [ ] **Step 5: Count activity**

Still in `register.tsx`, replace
```ts
      // A reload in the middle of a hatch leaves the egg flag set with nobody to clear it.
      await update($, hatching, () => false)
```
with:
```ts
      // A reload in the middle of a hatch leaves the egg flag set with nobody to clear it.
      await update($, hatching, () => false)
      // A session start is activity: a session never opens on a sleeping buddy.
      await stir($)
```
Replace
```ts
  on('command.run', { command: 'buddy' }, async ($, e) => {
    try {
      return { text: await runBuddy($, parseSub(e.args)) }
```
with:
```ts
  on('command.run', { command: 'buddy' }, async ($, e) => {
    try {
      await stir($)
      return { text: await runBuddy($, parseSub(e.args)) }
```
Replace
```ts
    const ran = await next(e)
    try {
      // Main conversation only: a subagent's calls never reach the buddy's reactions or counts.
```
with:
```ts
    const ran = await next(e)
    try {
      // Any tool call is activity, a subagent's included: the session is busy either way.
      later($, () => stir($))
      // Main conversation only: a subagent's calls never reach the buddy's reactions or counts.
```
Replace
```ts
    const result = await next(e)
    try {
      if (e.agentId === undefined) {
```
with:
```ts
    const result = await next(e)
    try {
      later($, () => stir($))
      if (e.agentId === undefined) {
```
Replace
```ts
  on('prompt.submit', async ($, e, next) => {
    try {
      const saved = await read($, record)
```
with:
```ts
  on('prompt.submit', async ($, e, next) => {
    try {
      later($, () => stir($))
      const saved = await read($, record)
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 188 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: the band through look.ts: holiday hats and props, sleep, and waking on activity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: The debug tour's three phases

**Files:**
- Modify: `buddy/hooks/tour.ts`, `buddy/hooks/register.tsx`
- Test: `buddy/hooks/tour.test.ts`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `HOLIDAYS`, `hatchDay`, `type Holiday` (Task 3); `type MoodName` (Task 1); `type Pose` (Task 5).
- Produces from `tour.ts`:
  - `TOUR_STEP_TICKS = 28`, `TOUR_STEPS = 18`, `DECOR_TICKS = 8`, `MOOD_TICKS = 4`, `TOUR_TICKS = 636`
  - `TOUR_DECORATIONS: readonly Holiday[]` (the 14 holidays, then hatch day), `TOUR_MOODS: readonly MoodName[]`
  - `type TourAt = { name: string; tick: number; look: Partial<TourLook>; pose: Pose | null; holiday: Holiday | null; mood: MoodName }`
  - `tourAt(elapsed: number): TourAt | null`

- [ ] **Step 1: Write the failing tests**

Replace the whole of `buddy/hooks/tour.test.ts` with:
```ts
import { expect, test } from 'claude-code/testing'

import { HOLIDAYS } from './calendar'
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { DECOR_TICKS, MOOD_TICKS, TOUR_DECORATIONS, TOUR_STEPS, TOUR_STEP_TICKS, TOUR_TICKS, tourAt } from './tour'

const SPECIES_TICKS = TOUR_STEPS * TOUR_STEP_TICKS

test('each species gets a step: plain, shiny, then flinch, celebrate and sleep', () => {
  expect(TOUR_STEPS).toBe(SPECIES.length)
  expect(TOUR_STEP_TICKS).toBe(28)
  SPECIES.forEach((species, step) => {
    const at = (tick: number) => tourAt(step * TOUR_STEP_TICKS + tick)!
    expect(at(0)).toMatchObject({ name: `tour ${step + 1}/18`, tick: 0, look: { species, shiny: false }, pose: null })
    expect(at(8)).toMatchObject({ look: { species, shiny: true }, pose: null })
    expect(at(16)).toMatchObject({ look: { species, shiny: false }, pose: 'flinch' })
    expect(at(19).pose).toBe('flinch')
    expect(at(20).pose).toBe('celebrate')
    expect(at(24).pose).toBe('sleep')
    expect(at(27).pose).toBe('sleep')
  })
})

test('then the real buddy wears each holiday, hatch day last, then each mood', () => {
  expect(TOUR_DECORATIONS.map(h => h.id)).toEqual([...HOLIDAYS.map(h => h.id), 'hatchday'])
  TOUR_DECORATIONS.forEach((holiday, i) => {
    const at = tourAt(SPECIES_TICKS + i * DECOR_TICKS)!
    expect(at).toMatchObject({ name: `tour: ${holiday.name}`, pose: null, holiday, mood: 'neutral' })
    expect(at.look).toEqual({})
  })
  const moodsFrom = SPECIES_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS
  const moods = [0, 1, 2].map(i => tourAt(moodsFrom + i * MOOD_TICKS)!)
  expect(moods.map(m => [m.name, m.mood, m.holiday])).toEqual([
    ['tour: anxious', 'anxious', null],
    ['tour: smug', 'smug', null],
    ['tour: sulky', 'sulky', null],
  ])
})

test('the tour runs 636 ticks, and is over before it starts and after its last mood', () => {
  expect(TOUR_TICKS).toBe(636)
  expect(tourAt(-1)).toBeNull()
  expect(tourAt(TOUR_TICKS - 1)?.mood).toBe('sulky')
  expect(tourAt(TOUR_TICKS)).toBeNull()
})

test('plain ticks wear no hat; shiny ticks show every hat and no hat', () => {
  const plainHats = new Set<string | undefined>()
  const shinyHats = new Set<string | undefined>()
  for (let step = 0; step < TOUR_STEPS; step++) {
    plainHats.add(tourAt(step * TOUR_STEP_TICKS)!.look.hat)
    plainHats.add(tourAt(step * TOUR_STEP_TICKS + 16)!.look.hat)
    shinyHats.add(tourAt(step * TOUR_STEP_TICKS + 8)!.look.hat)
  }
  expect([...plainHats]).toEqual(['none'])
  expect([...shinyHats].sort()).toEqual(['none', ...HATS].sort())
})

test('every rarity and eye shows up, including a shiny legendary', () => {
  const steps = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS)!.look)
  expect(new Set(steps.map(l => l.rarity)).size).toBe(RARITIES.length)
  expect(new Set(steps.map(l => l.eye)).size).toBe(EYES.length)
  const shinyLegendary = Array.from({ length: TOUR_STEPS }, (_, step) => tourAt(step * TOUR_STEP_TICKS + 8)!.look)
    .filter(l => l.shiny && l.rarity === 'legendary')
  expect(shinyLegendary.length).toBeGreaterThan(0)
})
```

In `buddy/hooks/buddy.test.tsx`, replace
```ts
import { zeroCounts } from './ledger'
```
with:
```ts
import { zeroCounts } from './ledger'
import { TOUR_TICKS } from './tour'
```
Replace
```ts
// One tour step is a 16-tick animation cycle at 500 ms a tick: 4 s plain, then 4 s shiny.
const HALF_STEP_MS = 4_000
```
with:
```ts
// One tour step is 28 ticks at 500 ms a tick: 4 s plain, 4 s shiny, then 6 s of poses.
const HALF_STEP_MS = 4_000
const STEP_MS = 14_000
```
Replace
```ts
  expect(await runner($)('debug')).toBe('Touring all 18 species, plain then shiny. Run /buddy debug off to stop.')
```
with:
```ts
  expect(await runner($)('debug')).toBe(
    'Touring all 18 species with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
```
Replace
```ts
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck \(shiny\)  $/ })).toBeDefined()
  expect(await shimmering()).toBe(true)
  await clock.advance(HALF_STEP_MS)
  expect(await ui.find({ type: 'Text', text: /tour 2\/18  uncommon goose  $/ })).toBeDefined()
```
with:
```ts
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck \(shiny\)  $/ })).toBeDefined()
  expect(await shimmering()).toBe(true)
  await clock.advance(HALF_STEP_MS)
  // The duck's flinch, wide-eyed.
  expect(await ui.find({ type: 'Text', text: /<\(O \)___/ })).toBeDefined()
  await clock.advance(STEP_MS - 2 * HALF_STEP_MS)
  expect(await ui.find({ type: 'Text', text: /tour 2\/18  uncommon goose  $/ })).toBeDefined()
```
Replace
```ts
test('the tour ends by itself after the last species', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(18 * 2 * HALF_STEP_MS - 500)
  expect(await ui.find({ type: 'Text', text: /tour 18\/18/ })).toBeDefined()
```
with:
```ts
test('the tour ends by itself after the last mood', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(TOUR_TICKS * 500 - 500)
  expect(await ui.find({ type: 'Text', text: /tour: sulky/ })).toBeDefined()
```
and add at the end of the file:
```tsx
test('the tour dresses the real buddy for each holiday, then shows each mood', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // Independence Day is the eighth decoration.
  await clock.advance((18 * 28 + 7 * 8) * 500)
  expect(await ui.find({ type: 'Text', text: /tour: Independence Day  common ghost/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^\*:\*:$/ }))?.props.color).toBe('blue')
  await clock.advance(8 * 8 * 500)
  expect(await ui.find({ type: 'Text', text: /tour: anxious/ })).toBeDefined()
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ;  ; \\')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `tour.test.ts` and `buddy.test.tsx` fail to load, since `DECOR_TICKS`, `MOOD_TICKS`, `TOUR_DECORATIONS` and `TOUR_TICKS` don't exist. The other files pass.

- [ ] **Step 3: Rewrite `tour.ts`**

Replace the whole of `buddy/hooks/tour.ts` with:
```ts
// The hidden /buddy debug tour (Alive spec section 7). First a step for every species: plain,
// then shiny, then its flinch, celebrate and sleep. Then the real buddy wears each holiday's
// hat and prop, hatch day last, then each mood. Hats, rarities and eyes rotate; some
// combinations (a common in a crown) can never roll. Pure: no $.
import { HOLIDAYS, hatchDay } from './calendar'
import type { Holiday } from './calendar'
import type { MoodName } from './mood'
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import type { Bones } from './roll'
import type { Pose } from './sprites'

export const TOUR_STEP_TICKS = 28
export const TOUR_STEPS = SPECIES.length
export const DECOR_TICKS = 8
export const MOOD_TICKS = 4
export const TOUR_DECORATIONS: readonly Holiday[] = [
  ...HOLIDAYS.map(({ id, name, line }) => ({ id, name, line })),
  hatchDay(1),
]
export const TOUR_MOODS: readonly MoodName[] = ['anxious', 'smug', 'sulky']
export const TOUR_TICKS =
  TOUR_STEPS * TOUR_STEP_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS + TOUR_MOODS.length * MOOD_TICKS

// Within a species step: plain until tick 8, shiny until 16, then 4 ticks of each pose.
const SHINY_FROM = 8
const POSES_FROM = 16
const POSE_TICKS = 4
const STEP_POSES: readonly Pose[] = ['flinch', 'celebrate', 'sleep']

const SHINY_HATS = ['none', ...HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'hat' | 'shiny'>

export type TourAt = {
  name: string
  // Ticks into this step, for the animation.
  tick: number
  // The species phase's dressing; empty in the later phases, which show the real buddy.
  look: Partial<TourLook>
  pose: Pose | null
  holiday: Holiday | null
  mood: MoodName
}

// `elapsed` is ticks since the tour started; null once it is over.
export function tourAt(elapsed: number): TourAt | null {
  if (elapsed < 0 || elapsed >= TOUR_TICKS) return null
  const speciesTicks = TOUR_STEPS * TOUR_STEP_TICKS
  if (elapsed < speciesTicks) {
    const step = Math.floor(elapsed / TOUR_STEP_TICKS)
    const tick = elapsed % TOUR_STEP_TICKS
    const shiny = tick >= SHINY_FROM && tick < POSES_FROM
    return {
      name: `tour ${step + 1}/${TOUR_STEPS}`,
      tick,
      look: {
        rarity: RARITIES[step % RARITIES.length]!,
        species: SPECIES[step]!,
        eye: EYES[step % EYES.length]!,
        hat: shiny ? SHINY_HATS[step % SHINY_HATS.length]! : 'none',
        shiny,
      },
      pose: tick >= POSES_FROM ? STEP_POSES[Math.floor((tick - POSES_FROM) / POSE_TICKS)]! : null,
      holiday: null,
      mood: 'neutral',
    }
  }
  const into = elapsed - speciesTicks
  const decorTicks = TOUR_DECORATIONS.length * DECOR_TICKS
  if (into < decorTicks) {
    const holiday = TOUR_DECORATIONS[Math.floor(into / DECOR_TICKS)]!
    return { name: `tour: ${holiday.name}`, tick: into % DECOR_TICKS, look: {}, pose: null, holiday, mood: 'neutral' }
  }
  const mood = TOUR_MOODS[Math.floor((into - decorTicks) / MOOD_TICKS)]!
  return { name: `tour: ${mood}`, tick: (into - decorTicks) % MOOD_TICKS, look: {}, pose: null, holiday: null, mood }
}
```

- [ ] **Step 4: Draw the tour's scene in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : buddy.soul.name
```
with:
```ts
  const name = tour ? tour.name : buddy.soul.name
```
Replace
```ts
    ? { bones, tick: animTick, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame, saying }
```
with:
```ts
    ? {
        bones,
        tick: animTick,
        mood: tour.mood,
        pose: tour.pose,
        idleTicks: 0,
        night: false,
        holiday: tour.holiday,
        heartsFrame,
        saying,
      }
```
Replace
```ts
      return `Touring all ${TOUR_STEPS} species, plain then shiny. Run /buddy debug off to stop.`
```
with:
```ts
      return `Touring all ${TOUR_STEPS} species with their reactions, then the holidays and moods. Run /buddy debug off to stop.`
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 190 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/tour.ts buddy/hooks/tour.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: the debug tour shows every reaction, holiday and mood

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Mood, poses and the DEBUGGING line from session events

**Files:**
- Modify: `buddy/hooks/register.tsx`
- Test: `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `FLINCH_TICKS`, `CELEBRATE_TICKS` (Task 7); `mergeMood`, `moodLine`, `queueMood`, `turnMood` (Task 1); `failLine`, `shouldFlag` (Task 4); the flush change's `mood` (Task 2); the atoms from Task 9.
- Produces in `register.tsx`:
  - `feel($, events, kind)`: queues mood events for the active buddy and strikes a pose
  - `speakUp($, turn)`: the DEBUGGING line
  - `momentLines($, who)`: the persona's mood and holiday lines
  - `ask($, who: Who, bones, prompt, kind)`: takes `who` in place of `soul`
  - `Who = Pick<Buddy, 'seed' | 'soul' | 'mood'>`
  - the flush carries `pendingMood`; pets and talks soothe

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/buddy.test.tsx`, replace
```ts
import { FALLBACK_NAMES } from './voice'
```
with:
```ts
import { FAIL_PLAIN, FAIL_SNARKY, FALLBACK_NAMES } from './voice'
```
and add at the end of the file:
```tsx
// The bubble's words on a terminal band, '' when there is none.
const bubbleOf = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Text' }))
    .map(t => t.text ?? '')
    .filter(text => /^ [<|] /.test(text))
    .map(text => text.slice(3, -2).trim())
    .filter(Boolean)
    .join(' ')

test('a failed tool call makes the buddy flinch for 2 seconds', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  // The ghost's flinch frame, wide-eyed.
  expect((await drawnSprite(ui)).join('\n')).toContain(' / O  O  \\')
  await clock.advance(2_000)
  expect((await drawnSprite(ui)).join('\n')).not.toContain('O  O')
})

test('two failed turns make the buddy anxious, and the turn-end save keeps the mood', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete({ ...TURN, reason: 'error' })
  await clock.settle()
  // A record from before this build had no mood; the first save with events gives it one.
  expect(activeOf(shared.row)?.mood).toEqual({ meter: -1, sulk: 0, at: new Date(NOON).toISOString() })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'error' })
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.meter).toBe(-2)
  // Past the flinch, the ghost's eyes are anxious.
  await clock.advance(2_000)
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ;  ; \\')
})

test('a long clean turn makes the buddy celebrate under confetti', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete({ ...TURN, durationMs: 130_000 })
  await clock.settle()
  const rows = await drawnSprite(ui)
  expect([' *  .  *  . ', ' .  *  .  * ']).toContain(rows[0])
  expect(rows.join('\n')).toContain('\\ / ^  ^ \\ /')
  await clock.advance(3_000)
  expect((await drawnSprite(ui))[0]?.trim()).toBe('')
})

test("another session's mood survives this session's save", async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  // Mid-turn, another session saves a run of failures of its own.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.mood = { meter: -3, sulk: 0, at: new Date(NOON).toISOString() }
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.meter).toBe(-4)
})

test('back after days away, the buddy sulks until it is petted', async ($, on) => {
  // 2026-10-04 to 2026-10-07 misses two days: sulk 1.
  const shared = sharedStore(on, { ...SAVED, you: { ...SAVED.you, lastDay: '2026-10-04' } })
  const clock = world(on, null)
  model(on, null, 'Hmph.')
  await $.session.start(START)
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.sulk).toBe(1)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui)).join('\n')).toContain('/ =  = \\')
  await runner($)('pet')
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.sulk).toBe(0)
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ✦  ✦ \\')
})

// 'debug-142' rolls an epic mushroom with DEBUGGING 100.
const KEEN = { ...RECORD, seed: 'debug-142' }

test('a buddy with DEBUGGING 100 speaks up once a turn when a tool fails, never when muted, and calls no model', async ($, on) => {
  const clock = world(on, { buddy: KEEN })
  engineBelow(on)
  const prompts = model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const lines = [...FAIL_PLAIN, ...FAIL_SNARKY]
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(lines).toContain(await bubbleOf(ui))
  // Once that bubble is gone, a second failure in the same turn stays quiet.
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // A new turn may speak again.
  await $.turn.complete(TURN)
  await clock.settle()
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(lines).toContain(await bubbleOf(ui))
  // Muted, it says nothing.
  await runner($)('mute')
  await $.turn.complete({ ...TURN, turnId: 't3' })
  await clock.settle()
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // The only model calls were turn-end reactions.
  expect(prompts.filter(p => !p.startsWith('Claude just finished a turn'))).toEqual([])
})

test("the persona hears the buddy's mood and the day", async ($, on) => {
  const clock = world(on, { buddy: RECORD }, true, JULY4_NOON)
  engineBelow(on)
  const systems: string[] = []
  on('model.complete', async (_$, e) => {
    systems.push(e.system ?? '')
    return { value: ok('Boom.') }
  })
  await $.session.start(START)
  await clock.settle()
  await $.turn.complete({ ...TURN, reason: 'error' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'error' })
  await clock.settle()
  await runner($)('pet')
  await clock.settle()
  const pet = systems.at(-1) ?? ''
  expect(pet).toContain('Mood: anxious, after a run of failures. Let it color the line.')
  expect(pet).toContain('Today is Independence Day.')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: six of the seven new tests fail: no flinch, no celebration, no mood saved, no speaking up, no mood line. `back after days away` fails only at the pet, which doesn't soothe yet. 190 pass.

- [ ] **Step 3: Wire the events in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import type { Buddy, Counts, Saved, Soul } from '../types'
```
with:
```ts
import type { Buddy, Counts, MoodEvent, Saved } from '../types'
```
Replace
```ts
import { draw, portrait } from './look'
import type { Scene } from './look'
import { applyMood, moodOf } from './mood'
```
with:
```ts
import { CELEBRATE_TICKS, FLINCH_TICKS, draw, portrait } from './look'
import type { Scene } from './look'
import { applyMood, mergeMood, moodLine, moodOf, queueMood, turnMood } from './mood'
```
Replace
```ts
  cleanSay,
  fallbackSoul,
```
with:
```ts
  cleanSay,
  failLine,
  fallbackSoul,
```
Replace
```ts
  shouldGreet,
  shouldQuip,
```
with:
```ts
  shouldFlag,
  shouldGreet,
  shouldQuip,
```
Replace
```ts
// The part of a buddy that speaks: its seed, for the bones, and its soul.
type Who = Pick<Buddy, 'seed' | 'soul'>
```
with:
```ts
// The part of a buddy that speaks: its seed, for the bones, its soul, and its saved mood.
type Who = Pick<Buddy, 'seed' | 'soul' | 'mood'>
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
// Main turns completed in this module's life, and the last one the DEBUGGING line spoke in: a
// failed call's line can run after its turn has ended, so it carries its turn's number.
let turnNo = 0
let flaggedTurn = -1
```
Replace
```ts
// Saves the unsaved counts with today's visit. A failed store write has already taken them
// into this session's copy (commit adopts before it writes), so they go back into `pending`
// only when the commit failed before that.
async function flush($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  // Taken and cleared in one update, so a count landing in between is never erased.
  let taken: Record<string, Counts> = {}
  await update($, pending, p => {
    taken = p
    return {}
  })
  try {
    await commit($, { kind: 'flush', pending: taken })
  } catch {
    await update($, pending, p => mergePending(taken, p))
  }
}

async function countAndFlush($: EngineInterface, event: CountEvent) {
  await count($, event)
  await flush($)
}
```
with:
```ts
// Queues mood events for the active buddy and strikes a pose, under the rules for counting
// (Alive spec sections 2 and 4). A celebration never cuts a flinch short.
async function feel($: EngineInterface, events: readonly MoodEvent[], kind: 'flinch' | 'celebrate' | null) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off' || (await read($, hatching))) return
  const seed = saved.active
  if (events.length > 0) await update($, pendingMood, p => ({ ...p, [seed]: queueMood(p[seed], events) }))
  if (kind === null) return
  const now = await read($, tick)
  const untilTick = now + (kind === 'flinch' ? FLINCH_TICKS : CELEBRATE_TICKS)
  await update($, posing, p =>
    kind === 'celebrate' && p?.kind === 'flinch' && now < p.untilTick ? p : { kind, untilTick },
  )
}

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

async function countAndFlush(
  $: EngineInterface,
  event: CountEvent,
  events: readonly MoodEvent[] = [],
  kind: 'flinch' | 'celebrate' | null = null,
) {
  await count($, event)
  await feel($, events, kind)
  await flush($)
}

// A failed main-conversation tool call in turn `turn`, said out loud at once when DEBUGGING
// says so: a canned line, no model call (Alive spec section 3).
async function speakUp($: EngineInterface, turn: number) {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const bones = rollBones(saved.active)
  const t = await read($, tick)
  const said = await read($, bubble)
  const say = shouldFlag({
    mode: saved.mode,
    bubbleUp: said !== null && t < said.untilTick,
    flagged: flaggedTurn === turn,
    roll: Math.random(),
    stats: bones.stats,
  })
  if (!say) return
  flaggedTurn = turn
  await showBubble($, failLine(bones, cannedCount++, Math.random()))
}

// The moment, for the persona prompt: the mood with this session's unsaved events, and the day.
async function momentLines($: EngineInterface, who: Who): Promise<string[]> {
  const now = await $.clock.now()
  const queued = (await read($, pendingMood))[who.seed] ?? []
  const mood = moodLine(moodOf(applyMood(who.mood, queued, now), now))
  const holiday = dayInfo(now, who.soul.hatchedAt).holiday
  return [mood, holiday?.line ?? null].filter((line): line is string => line !== null)
}
```
Replace
```ts
async function ask(
  $: EngineInterface,
  soul: Soul,
  bones: Bones,
  prompt: string,
  kind: 'react' | 'reply',
): Promise<string | null> {
  if (kind === 'react' && inFlight) return null
  if (kind === 'reply') inFlight?.controller.abort()
  const mine = { controller: new AbortController(), kind }
  inFlight = mine
  try {
    const result = await $.model.complete(
      { model: 'haiku', system: personaSystem(soul, bones), prompt, maxTokens: 80, timeoutMs: 8000 },
      { signal: mine.controller.signal },
    )
```
with:
```ts
async function ask(
  $: EngineInterface,
  who: Who,
  bones: Bones,
  prompt: string,
  kind: 'react' | 'reply',
): Promise<string | null> {
  if (kind === 'react' && inFlight) return null
  if (kind === 'reply') inFlight?.controller.abort()
  const mine = { controller: new AbortController(), kind }
  inFlight = mine
  try {
    const system = personaSystem(who.soul, bones, await momentLines($, who))
    const result = await $.model.complete(
      { model: 'haiku', system, prompt, maxTokens: 80, timeoutMs: 8000 },
      { signal: mine.controller.signal },
    )
```
Replace
```ts
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who.soul, bones, prompt, 'reply')
```
with:
```ts
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who, bones, prompt, 'reply')
```
Replace
```ts
  const text = await ask($, buddy.soul, bones, reactionPrompt(summary), 'react')
```
with:
```ts
  const text = await ask($, buddy, bones, reactionPrompt(summary), 'react')
```
Replace
```ts
      later($, () => countAndFlush($, { kind: 'pet' }))
```
with:
```ts
      later($, () => countAndFlush($, { kind: 'pet' }, ['soothe']))
```
Replace
```ts
        later($, () => countAndFlush($, { kind: 'talk' }))
```
with:
```ts
        later($, () => countAndFlush($, { kind: 'talk' }, ['soothe']))
```
Replace
```ts
        // A denied call never ran, so it isn't counted.
        if (ran.deny === undefined) later($, () => count($, { kind: 'call', tool: e.tool, failed }))
```
with:
```ts
        // A denied call never ran, so it isn't counted.
        if (ran.deny === undefined) later($, () => count($, { kind: 'call', tool: e.tool, failed }))
        if (failed) {
          const turn = turnNo
          later($, () => feel($, ['fail'], 'flinch'))
          later($, () => speakUp($, turn))
        }
```
Replace
```ts
        tally = {}
        failedTools = []
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        later($, () => countAndFlush($, turn))
```
with:
```ts
        tally = {}
        failedTools = []
        turnNo++
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        const felt = turnMood(e.reason, e.durationMs, summary.failed.length)
        const kind = e.reason === 'error' ? 'flinch' : felt === 'longClean' ? 'celebrate' : null
        later($, () => countAndFlush($, turn, felt ? [felt] : [], kind))
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 197 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: session events move the mood, strike poses, and let DEBUGGING speak up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Type-check, version, README, and record what shipped

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-10-07-buddy-alive-design.md` (status line)

**Interfaces:**
- Consumes: the finished Alive build.
- Produces: a type-checked mod at version 0.3.0, a README that says what it saves and does, and an accurate spec status.

- [ ] **Step 1: Type-check**

The repo copy has no engine-laid types, so check it against the installed copy's types. The first run fetches TypeScript 5.6 from npm.
```bash
MOD="$(cygpath -m "$(pwd)/buddy")"
TYPES="$(cygpath -m "$(ls -d ~/.claude/plugins/cache/buddy-mods/buddy/*/.claude-plugin/types/claude-code/index.d.ts | sort -V | tail -1)")"
TMP="$(mktemp -d)"
printf '{ "extends": "%s/tsconfig.json", "include": ["%s", "%s/hooks", "%s/types"] }\n' "$MOD" "$TYPES" "$MOD" "$MOD" > "$TMP/tsconfig.json"
npx -y -p typescript@5.6 tsc -p "$(cygpath -m "$TMP/tsconfig.json")"
```
Expected: no output (exit 0). If `tsc` reports a missing engine type that `main`'s code already used, update the installed plugin first. Otherwise, fix every error, re-run the tests, and commit the fixes as `fix: type errors`.

- [ ] **Step 2: Bump the version**

In `buddy/.claude-plugin/plugin.json`, replace `"version": "0.2.0"` with `"version": "0.3.0"`.

- [ ] **Step 3: Update the README**

In `README.md`, replace
```
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |
```
with:
```
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |

It has moods. A run of failed tools makes it anxious, long clean turns make it smug, and days away make it sulk until you pet it or talk to it. It flinches when a tool fails, celebrates a long clean turn, and dozes off when left alone, sooner after midnight. On US federal holidays, Easter, April Fools' Day, Halloween week and its own hatch day, it dresses for the occasion. Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, and SNARK sharpens its canned lines.
```
Replace
```
  - for a comment after a turn, at most one every 3 minutes
```
with:
```
  - for a comment after a turn, at most one every 3 minutes (longer for a patient buddy)

  Moods, reactions, holidays and the line it says when a tool fails need no model call.
```
Replace
```
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, and lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks. Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited. Never prompt text, answers, file contents or command arguments.
```
with:
```
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks, and its mood (two small numbers and when they last moved). Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited. Never prompt text, answers, file contents or command arguments.
```
Replace
```
These are point-in-time records: each spec's status line lists what changed during its build.
```
with:
```
Moods, stats that change behavior, reactions and the calendar come from [`docs/specs/2026-10-07-buddy-alive-design.md`](docs/specs/2026-10-07-buddy-alive-design.md) and its plan, [`docs/specs/2026-10-07-buddy-alive-plan.md`](docs/specs/2026-10-07-buddy-alive-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```

- [ ] **Step 4: Record what shipped**

```bash
sed -i "s|^\*\*Status:\*\* designed 2026-10-07; not built\.$|**Status:** built $(date +%F); live check pending. Plan: [\`2026-10-07-buddy-alive-plan.md\`](2026-10-07-buddy-alive-plan.md); its \"Deliberate deviations\" section lists ten small departures from this spec.|" docs/specs/2026-10-07-buddy-alive-design.md
head -3 docs/specs/2026-10-07-buddy-alive-design.md
```
Expected: the third line is the new status line with today's date.

- [ ] **Step 5: Final full run**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 197 pass, 0 fail. Validation passes, and its `state writes:` and `state reads:` lines include `buddy.pose`, `buddy.lastActiveTick` and `buddy.pendingMood`.

- [ ] **Step 6: Commit**

```bash
git add buddy/.claude-plugin/plugin.json README.md docs/specs/2026-10-07-buddy-alive-design.md
git commit -F - <<'EOF'
chore: buddy 0.3.0, with Alive recorded as built

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
2. Run a command that fails (`false` through Bash): the buddy flinches for 2 seconds.
3. Run a turn that takes over 2 minutes with no failures: confetti and the celebrate frame.
4. Leave it alone for 10 minutes: it sleeps, with a rising z. Type a prompt: it wakes.
5. Fail two turns in a row: its eyes turn to `;`.
6. Run `/buddy debug` and watch the decorations phase: every holiday's hat and prop, the flag in blue and red.

Report what was seen. Once it checks out, change the spec's status line from `live check pending` to `live-checked` with the date, commit that, and close issues #6, #7, #8 and #9 with a pointer to the merge.
