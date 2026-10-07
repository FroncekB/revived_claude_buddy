# `buddy` Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the buddy's saved record to `schema: 2`. Retired buddies are kept, each buddy gets lifetime counts, the person gets a visit streak, and every save goes through one `commit` that merges with other sessions.

**Architecture:** Two pure modules carry the rules:
- `ledger.ts` (new): counts, tool groups and the visit streak.
- `record.ts`: the schema 2 record, the migration from 1, and `applyChange`.

`register.tsx` stays wiring only. It gains `current`, `commit`, `count` and `flush`. Counts wait in `$.state` under `pending` and are saved when a main turn ends, after a pet and after a talk. All three forms of the card get a streak line: the terminal pane, the SVG card (`card.ts`) and the text fallback. The first session of a new day greets the streak.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.289 when this was written) for `claude plugin test` and `claude plugin validate`, and TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md).

**Starting point:** this branch with `main` merged in at `4025786`: the card pane, the `/buddy debug` tour, rarity-colored sprites and the desktop SVG band. 100 tests pass.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH (2.1.263) has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit.
- **Line endings:** LF. Write files with the editor tools, not a Python `write_text` on Windows, which writes CRLF.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared in the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`. The contract file exports a type before its `declare module` block, or the validator doesn't see the declarations.
- **Tests find elements by text or type, never by `key`.**
- **No Node or DOM.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available. Clone in tests with `JSON.parse(JSON.stringify(x))`.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Every hook catches its own errors** and lets the event continue (`next(e)`, or returns `next`'s result unchanged).
- **Haiku calls:** model `haiku`, `timeoutMs: 8000`, `maxTokens: 80` for speech and 200 for hatch. Foundation adds no model calls.
- **The debug tour stays as it is.** It writes nothing, and the card pane always shows the real buddy.
- **Exact text** (from the spec):

  | Where | Text |
  |-|-|
  | Foreign record | `Saved buddy uses schema N; this mod knows 1 and 2.` |
  | Damaged record | `Saved buddy is damaged; this mod won't overwrite it.` |
  | Reroll warning | `This retires <name>, <rarity> <species>. Run /buddy reroll confirm.` |
  | Failed write | `Could not save your buddy; it lives for this session only.` |
  | Streak line | `Streak 12 days (best 30) · 340 turns · 2,104 tool calls`, singular at 1 |
  | Greeting pool, by `streak % 4` | `Day {n} together.` / `{n} days in a row. Not that I'm counting.` / `Back again. That's {n} days.` / `{n}-day streak. Don't make it weird.` |

- **Tool groups:**

  | Group | Tools |
  |-|-|
  | shell | Bash, PowerShell |
  | edit | Edit, Write, NotebookEdit |
  | read | Read, Grep, Glob, LSP |
  | web | WebFetch, WebSearch |
  | agent | Agent |
  | mcp | names starting `mcp__` |
  | other | everything else |

- **Forward compatibility:** every change starts from the stored object and spreads it at every level (top, `you`, each `buddies` entry), so fields a newer build wrote survive.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. The text fallback's streak line comes from a new `streakLine(you, counts)` that `register.tsx` appends after `cardLines`'s output, so `cardLines` doesn't change. `cardSvg` and `cardAlt` take the streak as an optional last argument, `history`, so their existing tests stand unchanged.
2. The `session.start` visit (and its greeting) runs on a `$.clock.after(0)` timer through the existing `later` helper, so a store write never holds up a session start. Counting a tool call also goes through `later`, so a tool result never waits on a state write.
3. `hatch` and `reroll` share one `Change` variant (`kind: 'hatch' | 'reroll'`), since they carry the same fields.

---

### Task 1: The ledger

**Files:**
- Modify: `buddy/types/index.d.ts`
- Create: `buddy/hooks/ledger.ts`
- Test: `buddy/hooks/ledger.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - types in `buddy/types/index.d.ts`: `ToolGroup`, `Counts`, `You`
  - from `ledger.ts`:
    - `TOOL_GROUPS: readonly ToolGroup[]`, `toolGroup(tool: string): ToolGroup`
    - `zeroCounts(): Counts`, `totalCalls(c: Counts): number`
    - `type CountEvent`, `countEvent(c: Counts, e: CountEvent): Counts`
    - `addCounts(a: Counts, b: Counts): Counts`
    - `mergePending(a, b: Readonly<Record<string, Counts>>): Record<string, Counts>`
    - `localDay(ms: number): string`, `prevDay(day: string): string`
    - `visit(you: You, today: string): You`

- [ ] **Step 1: Add the ledger's types to the contract**

In `buddy/types/index.d.ts`, replace
```ts
export type Bubble = { text: string; untilTick: number }
```
with:
```ts
export type ToolGroup = 'shell' | 'edit' | 'read' | 'web' | 'agent' | 'mcp' | 'other'

// One buddy's lifetime counts. Main-conversation events only.
export type Counts = {
  turns: number
  failedTurns: number
  longestTurnMs: number
  calls: Record<ToolGroup, number>
  failedCalls: number
  pets: number
  talks: number
}

// The person's own data: it carries across rerolls.
export type You = {
  lastDay: string | null
  streak: number
  bestStreak: number
  days: number
}

export type Bubble = { text: string; untilTick: number }
```

- [ ] **Step 2: Write the failing tests**

`buddy/hooks/ledger.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import {
  addCounts, countEvent, localDay, mergePending, prevDay, toolGroup, totalCalls, visit, zeroCounts,
} from './ledger'

test('every tool lands in its group', () => {
  const cases: [string, string][] = [
    ['Bash', 'shell'], ['PowerShell', 'shell'],
    ['Edit', 'edit'], ['Write', 'edit'], ['NotebookEdit', 'edit'],
    ['Read', 'read'], ['Grep', 'read'], ['Glob', 'read'], ['LSP', 'read'],
    ['WebFetch', 'web'], ['WebSearch', 'web'],
    ['Agent', 'agent'],
    ['mcp__a__b', 'mcp'],
    ['Frobnicate', 'other'], ['toString', 'other'],
  ]
  for (const [tool, group] of cases) expect(toolGroup(tool)).toBe(group)
})

test('each event adds to its own counts', () => {
  let c = zeroCounts()
  c = countEvent(c, { kind: 'call', tool: 'Bash', failed: true })
  c = countEvent(c, { kind: 'call', tool: 'mcp__x__y', failed: false })
  c = countEvent(c, { kind: 'turn', reason: 'error', durationMs: 9_000 })
  c = countEvent(c, { kind: 'turn', reason: 'answer', durationMs: 4_000 })
  c = countEvent(c, { kind: 'pet' })
  c = countEvent(c, { kind: 'talk' })
  expect(c).toEqual({
    turns: 2,
    failedTurns: 1,
    longestTurnMs: 9_000,
    calls: { shell: 1, edit: 0, read: 0, web: 0, agent: 0, mcp: 1, other: 0 },
    failedCalls: 1,
    pets: 1,
    talks: 1,
  })
  expect(totalCalls(c)).toBe(2)
  expect(countEvent(zeroCounts(), { kind: 'turn', reason: 'aborted', durationMs: 1 }).failedTurns).toBe(1)
})

test('adding counts sums them, except the longest turn, which takes the larger', () => {
  const a = countEvent(countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 5_000 }), {
    kind: 'call', tool: 'Read', failed: false,
  })
  const b = countEvent(countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 3_000 }), {
    kind: 'call', tool: 'Read', failed: true,
  })
  expect(addCounts(a, b)).toMatchObject({ turns: 2, longestTurnMs: 5_000, failedCalls: 1, calls: { read: 2 } })
})

test('pending counts merge seed by seed', () => {
  const one = countEvent(zeroCounts(), { kind: 'pet' })
  expect(mergePending({ a: one }, { a: one, b: one })).toEqual({ a: addCounts(one, one), b: one })
})

test('days are local calendar dates', () => {
  expect(localDay(new Date(2026, 9, 7, 0, 5).getTime())).toBe('2026-10-07')
  expect(localDay(new Date(2026, 9, 7, 23, 55).getTime())).toBe('2026-10-07')
  expect(prevDay('2026-10-07')).toBe('2026-10-06')
  expect(prevDay('2026-03-01')).toBe('2026-02-28')
  expect(prevDay('2027-01-01')).toBe('2026-12-31')
})

test('the visit rule', () => {
  const first = visit({ lastDay: null, streak: 0, bestStreak: 0, days: 0 }, '2026-10-07')
  expect(first).toEqual({ lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 })
  expect(visit(first, '2026-10-07')).toBe(first)
  const second = visit(first, '2026-10-08')
  expect(second).toEqual({ lastDay: '2026-10-08', streak: 2, bestStreak: 2, days: 2 })
  expect(visit(second, '2026-10-11')).toEqual({ lastDay: '2026-10-11', streak: 1, bestStreak: 2, days: 3 })
  const yearEnd = { lastDay: '2026-12-31', streak: 4, bestStreak: 4, days: 9 }
  expect(visit(yearEnd, '2027-01-01')).toMatchObject({ streak: 5, bestStreak: 5, days: 10 })
})
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy
```
Expected: `ledger.test.ts` fails to load because `./ledger` doesn't exist. The other 100 tests pass.

- [ ] **Step 4: Write the ledger**

`buddy/hooks/ledger.ts`:
```ts
// Lifetime counts and the visit streak (Foundation spec section 3). Pure: no $.
import type { Counts, ToolGroup, You } from '../types'

export const TOOL_GROUPS: readonly ToolGroup[] = ['shell', 'edit', 'read', 'web', 'agent', 'mcp', 'other']

// A Map, so a tool named like an Object method ("toString") still lands in `other`.
const GROUP_OF: ReadonlyMap<string, ToolGroup> = new Map<string, ToolGroup>([
  ['Bash', 'shell'],
  ['PowerShell', 'shell'],
  ['Edit', 'edit'],
  ['Write', 'edit'],
  ['NotebookEdit', 'edit'],
  ['Read', 'read'],
  ['Grep', 'read'],
  ['Glob', 'read'],
  ['LSP', 'read'],
  ['WebFetch', 'web'],
  ['WebSearch', 'web'],
  ['Agent', 'agent'],
])

export function toolGroup(tool: string): ToolGroup {
  if (tool.startsWith('mcp__')) return 'mcp'
  return GROUP_OF.get(tool) ?? 'other'
}

export function zeroCounts(): Counts {
  return {
    turns: 0,
    failedTurns: 0,
    longestTurnMs: 0,
    calls: { shell: 0, edit: 0, read: 0, web: 0, agent: 0, mcp: 0, other: 0 },
    failedCalls: 0,
    pets: 0,
    talks: 0,
  }
}

export function totalCalls(c: Counts): number {
  return TOOL_GROUPS.reduce((sum, g) => sum + c.calls[g], 0)
}

export type CountEvent =
  | { kind: 'call'; tool: string; failed: boolean }
  | { kind: 'turn'; reason: string; durationMs: number }
  | { kind: 'pet' }
  | { kind: 'talk' }

export function countEvent(c: Counts, e: CountEvent): Counts {
  switch (e.kind) {
    case 'call': {
      const g = toolGroup(e.tool)
      return { ...c, calls: { ...c.calls, [g]: c.calls[g] + 1 }, failedCalls: c.failedCalls + (e.failed ? 1 : 0) }
    }
    case 'turn':
      return {
        ...c,
        turns: c.turns + 1,
        failedTurns: c.failedTurns + (e.reason === 'error' || e.reason === 'aborted' ? 1 : 0),
        longestTurnMs: Math.max(c.longestTurnMs, e.durationMs),
      }
    case 'pet':
      return { ...c, pets: c.pets + 1 }
    case 'talk':
      return { ...c, talks: c.talks + 1 }
  }
}

// Sums every field except longestTurnMs, which keeps the larger. Fields only `a` has are kept.
export function addCounts(a: Counts, b: Counts): Counts {
  const calls = { ...a.calls }
  for (const g of TOOL_GROUPS) calls[g] = a.calls[g] + b.calls[g]
  return {
    ...a,
    turns: a.turns + b.turns,
    failedTurns: a.failedTurns + b.failedTurns,
    longestTurnMs: Math.max(a.longestTurnMs, b.longestTurnMs),
    calls,
    failedCalls: a.failedCalls + b.failedCalls,
    pets: a.pets + b.pets,
    talks: a.talks + b.talks,
  }
}

export function mergePending(
  a: Readonly<Record<string, Counts>>,
  b: Readonly<Record<string, Counts>>,
): Record<string, Counts> {
  const out: Record<string, Counts> = { ...a }
  for (const [seed, counts] of Object.entries(b)) {
    const had = out[seed]
    out[seed] = had ? addCounts(had, counts) : counts
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

export function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  // Noon, so a daylight-saving change can't push the date across midnight.
  return localDay(new Date(y!, m! - 1, d! - 1, 12).getTime())
}

// A new day extends the streak when it follows lastDay, and starts it over otherwise.
// The same day returns `you` itself, so a caller can tell nothing changed.
export function visit(you: You, today: string): You {
  if (you.lastDay === today) return you
  const streak = you.lastDay !== null && prevDay(today) === you.lastDay ? you.streak + 1 : 1
  return { ...you, lastDay: today, streak, bestStreak: Math.max(you.bestStreak, streak), days: you.days + 1 }
}
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 106 pass, 0 fail. Validation passes.

- [ ] **Step 6: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/ledger.ts buddy/hooks/ledger.test.ts
git commit -F - <<'EOF'
feat: the ledger: tool groups, lifetime counts and the visit streak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The schema 2 record

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/record.ts`
- Test: `buddy/hooks/record.test.ts`

**Interfaces:**
- Consumes from Task 1: `zeroCounts`, `addCounts`, `localDay`, `visit`, and the types `Counts` and `You`.
- Produces:
  - types: `SavedV1`, `Buddy`, `Saved`
  - from `record.ts`:
    - `type Stored = { kind: 'none' } | { kind: 'ok'; saved: Saved } | { kind: 'damaged' } | { kind: 'foreign'; schema: string }`
    - `classify(raw: unknown): Stored`, `migrate(v1: SavedV1): Saved`, `activeBuddy(saved: Saved): Buddy`
    - `type Change = { kind: 'hatch' | 'reroll'; seed: string; soul: Soul } | { kind: 'mode'; mode: Mode } | { kind: 'flush'; pending: Readonly<Record<string, Counts>> } | { kind: 'visit' }`
    - `applyChange(saved: Saved | null, change: Change, now: number): Saved | null`, where null means nothing to write

  The schema 1 helpers (`Loaded`, `classifyRecord`, `newRecord`, `BuddyRecord`) stay until Task 4, because `register.tsx` still uses them.

- [ ] **Step 1: Add the record's types to the contract**

In `buddy/types/index.d.ts`, replace
```ts
export type ToolGroup = 'shell' | 'edit' | 'read' | 'web' | 'agent' | 'mcp' | 'other'
```
with:
```ts
// The schema 1 record (base spec section 3), read only to migrate it.
export type SavedV1 = BuddyRecord

export type ToolGroup = 'shell' | 'edit' | 'read' | 'web' | 'agent' | 'mcp' | 'other'
```
and replace
```ts
export type Bubble = { text: string; untilTick: number }
```
with:
```ts
export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
}

// The `$.store` key `buddy` (Foundation spec section 1).
export type Saved = {
  schema: 2
  mode: Mode
  rerolls: number
  active: string
  buddies: Buddy[]
  you: You
}

export type Bubble = { text: string; untilTick: number }
```

- [ ] **Step 2: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
import { USAGE, classifyRecord, newRecord, parseSub } from './record'
```
with:
```ts
import type { Saved } from '../types'
import { countEvent, zeroCounts } from './ledger'
import { USAGE, activeBuddy, applyChange, classify, classifyRecord, migrate, newRecord, parseSub } from './record'
import type { Change } from './record'
```
replace
```ts
const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
```
with:
```ts
const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
const V1 = { schema: 1 as const, seed: 's', soul: SOUL, mode: 'muted' as const, rerolls: 3 }
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()
```
and add at the end of the file:
```ts
test('schemas 1 and 2 are ours; a schema 2 record without its active buddy is damaged', () => {
  expect(classify(undefined)).toEqual({ kind: 'none' })
  expect(classify(null)).toEqual({ kind: 'none' })
  expect(classify(V1)).toEqual({ kind: 'ok', saved: migrate(V1) })
  const saved = migrate(V1)
  expect(classify(saved)).toEqual({ kind: 'ok', saved })
  expect(classify({ ...saved, active: 'gone' })).toEqual({ kind: 'damaged' })
  expect(classify({ schema: 2 })).toEqual({ kind: 'damaged' })
  expect(classify({ schema: 3, seed: 'x' })).toEqual({ kind: 'foreign', schema: '3' })
  expect(classify('junk')).toEqual({ kind: 'foreign', schema: 'unknown' })
})

test('migration keeps the buddy and starts its counts and the streak at zero', () => {
  expect(migrate(V1)).toEqual({
    schema: 2,
    mode: 'muted',
    rerolls: 3,
    active: 's',
    buddies: [{ seed: 's', soul: SOUL, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
  })
})

test('a first hatch starts a record on, with today as its first visit', () => {
  expect(applyChange(null, { kind: 'hatch', seed: 'h', soul: SOUL }, NOON)).toMatchObject({
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'h',
    buddies: [{ seed: 'h', retiredAt: null }],
    you: { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 },
  })
})

test('a reroll retires the active buddy and appends the new one', () => {
  const saved = applyChange(migrate(V1), { kind: 'reroll', seed: 'n', soul: { ...SOUL, name: 'Bix' } }, NOON)!
  expect(saved.buddies.map(b => b.seed)).toEqual(['s', 'n'])
  expect(saved.buddies[0]?.retiredAt).toBe(new Date(NOON).toISOString())
  expect(saved.buddies[1]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: 'n', rerolls: 4, mode: 'on' })
  expect(activeBuddy(saved).soul.name).toBe('Bix')
})

test('a hatch onto a stored record keeps the buddy already there without counting a reroll', () => {
  const saved = applyChange(migrate(V1), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)!
  expect(saved.buddies.map(b => b.seed)).toEqual(['s', 'n'])
  expect(saved).toMatchObject({ active: 'n', rerolls: 3 })
})

test('a flush adds counts by seed, drops unknown seeds, and records the visit', () => {
  const one = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 1_000 })
  const saved = applyChange(migrate(V1), { kind: 'flush', pending: { s: one, gone: one } }, NOON)!
  expect(saved.buddies).toHaveLength(1)
  expect(activeBuddy(saved).counts.turns).toBe(1)
  expect(saved.you).toMatchObject({ lastDay: '2026-10-07', streak: 1 })
})

test('mode changes; a flush or visit with nothing new writes nothing', () => {
  const visited = applyChange(migrate(V1), { kind: 'visit' }, NOON)!
  expect(visited.you.lastDay).toBe('2026-10-07')
  expect(applyChange(visited, { kind: 'mode', mode: 'off' }, NOON)?.mode).toBe('off')
  expect(applyChange(visited, { kind: 'visit' }, NOON)).toBeNull()
  expect(applyChange(visited, { kind: 'flush', pending: {} }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'flush', pending: {} }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'visit' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'mode', mode: 'off' }, NOON)).toBeNull()
})

test('fields this build does not know survive every change', () => {
  const base = migrate(V1)
  const future = {
    ...base,
    journal: ['x'],
    you: { ...base.you, hats: ['crown'] },
    buddies: base.buddies.map(b => ({ ...b, xp: 7 })),
  } as Saved
  const changes: Change[] = [
    { kind: 'mode', mode: 'off' },
    { kind: 'flush', pending: { s: countEvent(zeroCounts(), { kind: 'pet' }) } },
    { kind: 'visit' },
    { kind: 'reroll', seed: 'n', soul: SOUL },
  ]
  for (const change of changes) {
    const after = applyChange(future, change, NOON) as unknown as { buddies: unknown[] }
    expect(after).toMatchObject({ journal: ['x'], you: { hats: ['crown'] } })
    expect(after.buddies[0]).toMatchObject({ xp: 7 })
  }
})
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy
```
Expected: `record.test.ts` fails to load, since `activeBuddy`, `applyChange`, `classify` and `migrate` don't exist yet. The other files pass.

- [ ] **Step 4: Write the schema 2 record**

In `buddy/hooks/record.ts`, replace
```ts
import type { BuddyRecord, Soul } from '../types'
```
with:
```ts
import type { Buddy, BuddyRecord, Counts, Mode, Saved, SavedV1, Soul } from '../types'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
Then replace
```ts
export type Sub =
```
with the new code, followed by the line it replaced:
```ts
// What the store holds, as this build reads it (Foundation spec section 1).
export type Stored =
  | { kind: 'none' }
  | { kind: 'ok'; saved: Saved }
  | { kind: 'damaged' }
  | { kind: 'foreign'; schema: string }

export function classify(raw: unknown): Stored {
  if (raw === undefined || raw === null) return { kind: 'none' }
  const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
  if (schema === 1) return { kind: 'ok', saved: migrate(raw as SavedV1) }
  if (schema === 2) {
    const saved = raw as Saved
    const intact = Array.isArray(saved.buddies) && saved.buddies.some(b => b.seed === saved.active)
    return intact ? { kind: 'ok', saved } : { kind: 'damaged' }
  }
  return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
}

function fresh(seed: string, soul: Soul, rerolls: number): Saved {
  return {
    schema: 2,
    mode: 'on',
    rerolls,
    active: seed,
    buddies: [{ seed, soul, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
  }
}

export function migrate(v1: SavedV1): Saved {
  return { ...fresh(v1.seed, v1.soul, v1.rerolls), mode: v1.mode }
}

// `classify` answers ok only when the active seed has an entry, and every change keeps it so.
export function activeBuddy(saved: Saved): Buddy {
  return saved.buddies.find(b => b.seed === saved.active)!
}

export type Change =
  | { kind: 'hatch' | 'reroll'; seed: string; soul: Soul }
  | { kind: 'mode'; mode: Mode }
  | { kind: 'flush'; pending: Readonly<Record<string, Counts>> }
  | { kind: 'visit' }

// One change, made on the stored object itself so fields a newer build wrote are kept.
// Null means there is nothing to write.
export function applyChange(saved: Saved | null, change: Change, now: number): Saved | null {
  const today = localDay(now)
  switch (change.kind) {
    case 'hatch':
    case 'reroll': {
      const counted = change.kind === 'reroll' ? 1 : 0
      if (!saved) {
        const born = fresh(change.seed, change.soul, counted)
        return { ...born, you: visit(born.you, today) }
      }
      const retiredAt = new Date(now).toISOString()
      return {
        ...saved,
        mode: 'on',
        rerolls: saved.rerolls + counted,
        active: change.seed,
        buddies: [
          ...saved.buddies.map(b => (b.seed === saved.active ? { ...b, retiredAt } : b)),
          { seed: change.seed, soul: change.soul, retiredAt: null, counts: zeroCounts() },
        ],
      }
    }
    case 'mode':
      return saved && { ...saved, mode: change.mode }
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
  }
}

export type Sub =
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 114 pass, 0 fail. Validation passes.

- [ ] **Step 6: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/record.ts buddy/hooks/record.test.ts
git commit -F - <<'EOF'
feat: the schema 2 record, its migration and applyChange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The streak on the card, and the greeting

**Files:**
- Modify: `buddy/hooks/layout.ts`
- Modify: `buddy/hooks/card.ts`
- Modify: `buddy/hooks/voice.ts`
- Test: `buddy/hooks/layout.test.ts`
- Test: `buddy/hooks/card.test.ts`
- Test: `buddy/hooks/voice.test.ts`

**Interfaces:**
- Consumes from Task 1: `totalCalls`, `zeroCounts`, and the types `Counts` and `You`.
- Produces:
  - from `layout.ts`: `streakText(you: You): string`, `countsText(counts: Counts): string`, `streakLine(you: You, counts: Counts): string`
  - from `card.ts`: `type CardHistory = { you: You; counts: Counts }`, plus an optional last argument `history?: CardHistory` on `cardSvg` and on `cardAlt`
  - from `voice.ts`: `streakGreeting(streak: number): string`, `shouldGreet(o: { mode: Mode; dayBefore: string | null; you: You }): boolean`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/layout.test.ts`, replace
```ts
import { SHIMMER, bandRows, bubbleRows, cardLines, compactLine, isCompact, nameLine, spriteTint, wrap } from './layout'
```
with:
```ts
import {
  SHIMMER, bandRows, bubbleRows, cardLines, compactLine, isCompact, nameLine, spriteTint, streakLine, wrap,
} from './layout'
import { zeroCounts } from './ledger'
```
and add at the end of the file:
```ts
test('the streak line counts with commas, agrees in number, and keeps the text card short', () => {
  const many = { ...zeroCounts(), turns: 340, calls: { ...zeroCounts().calls, shell: 2_000, read: 104 } }
  const twelve = { lastDay: '2026-10-07', streak: 12, bestStreak: 30, days: 40 }
  expect(streakLine(twelve, many)).toBe('Streak 12 days (best 30) · 340 turns · 2,104 tool calls')
  const one = { ...zeroCounts(), turns: 1, calls: { ...zeroCounts().calls, edit: 1 } }
  expect(streakLine({ lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }, one)).toBe(
    'Streak 1 day (best 1) · 1 turn · 1 tool call',
  )
  expect(streakLine(twelve, { ...zeroCounts(), turns: 1_234_567 })).toContain('1,234,567 turns')
  const card = [...cardLines(SOUL, rollBones('layout-seed'), 2), streakLine(twelve, many)]
  expect(card.length).toBeLessThanOrEqual(12)
})
```

In `buddy/hooks/card.test.ts`, replace
```ts
import { cardAlt, cardSvg, meter, radarPoint, statAlt } from './card'
```
with:
```ts
import { cardAlt, cardSvg, meter, radarPoint, statAlt } from './card'
import { zeroCounts } from './ledger'
```
and add at the end of the file:
```ts
test('given the history, the card adds a streak row 20 px lower and the alt text ends with it', () => {
  const history = {
    you: { lastDay: '2026-10-07', streak: 12, bestStreak: 30, days: 40 },
    counts: { ...zeroCounts(), turns: 340, calls: { ...zeroCounts().calls, shell: 2_104 } },
  }
  const svg = cardSvg(SOUL, BONES, 0, history)
  expect(svg).toContain('>Streak 12 days (best 30)</text>')
  expect(svg).toContain('>340 turns · 2,104 tool calls</text>')
  const plain = cardSvg(SOUL, BONES, 0)
  expect(plain).not.toContain('Streak')
  const height = (s: string) => Number(/height="(\d+)"/.exec(s)?.[1])
  expect(height(svg)).toBe(height(plain) + 20)
  expect(cardAlt(SOUL, BONES, 0, history)).toBe(
    `${cardAlt(SOUL, BONES, 0)} Streak 12 days (best 30) · 340 turns · 2,104 tool calls.`,
  )
})
```

In `buddy/hooks/voice.test.ts`, replace
```ts
  matchAddress, parseSoul, personaSystem, reactionPrompt, shouldQuip, withArticle,
```
with:
```ts
  matchAddress, parseSoul, personaSystem, reactionPrompt, shouldGreet, shouldQuip, streakGreeting, withArticle,
```
and add at the end of the file:
```ts
test('the streak greeting comes from a pool of four and greets only a new day of a streak', () => {
  expect(streakGreeting(4)).toBe('Day 4 together.')
  expect(streakGreeting(5)).toBe("5 days in a row. Not that I'm counting.")
  expect(streakGreeting(6)).toBe("Back again. That's 6 days.")
  expect(streakGreeting(7)).toBe("7-day streak. Don't make it weird.")
  const you = { lastDay: '2026-10-07', streak: 2, bestStreak: 2, days: 2 }
  expect(shouldGreet({ mode: 'on', dayBefore: '2026-10-06', you })).toBe(true)
  expect(shouldGreet({ mode: 'muted', dayBefore: '2026-10-06', you })).toBe(false)
  expect(shouldGreet({ mode: 'on', dayBefore: '2026-10-07', you })).toBe(false)
  expect(shouldGreet({ mode: 'on', dayBefore: null, you: { ...you, streak: 1 } })).toBe(false)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy
```
Expected: three tests fail:
- the streak-line test in `layout.test.ts`: `streakLine` isn't exported yet
- the history test in `card.test.ts`: there's no streak row yet
- the greeting test in `voice.test.ts`: `streakGreeting` and `shouldGreet` aren't exported yet

- [ ] **Step 3: Write the streak line**

In `buddy/hooks/layout.ts`, replace
```ts
import type { Soul } from '../types'
```
with:
```ts
import type { Counts, Soul, You } from '../types'
import { totalCalls } from './ledger'
```
and add at the end of the file:
```ts
const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const howMany = (n: number, noun: string) => `${withCommas(n)} ${noun}${n === 1 ? '' : 's'}`

// The person's streak: the first half of the card's streak line.
export function streakText(you: You): string {
  return `Streak ${howMany(you.streak, 'day')} (best ${withCommas(you.bestStreak)})`
}

// The active buddy's lifetime counts: the second half.
export function countsText(counts: Counts): string {
  return `${howMany(counts.turns, 'turn')} · ${howMany(totalCalls(counts), 'tool call')}`
}

export function streakLine(you: You, counts: Counts): string {
  return `${streakText(you)} · ${countsText(counts)}`
}
```

- [ ] **Step 4: Put the streak on the SVG card**

In `buddy/hooks/card.ts`, replace
```ts
import type { Soul } from '../types'
import { wrap } from './layout'
```
with:
```ts
import type { Counts, Soul, You } from '../types'
import { countsText, streakLine, streakText, wrap } from './layout'
```
Replace
```ts
// The radar, in its own box.
```
with:
```ts
// The person's streak and the buddy's counts, for the card's last row.
export type CardHistory = { you: You; counts: Counts }

// The radar, in its own box.
```
Replace
```ts
export function cardSvg(soul: Soul, bones: Bones, rerolls: number): string {
```
with:
```ts
export function cardSvg(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory): string {
```
Replace
```ts
  const h = foot + 38
```
with:
```ts
  if (history) {
    marks.push(
      `<text x="${PAD}" y="${foot + 42}" font-size="12" fill="${INK}">${esc(streakText(history.you))}</text>`,
      `<text x="${W - PAD}" y="${foot + 42}" text-anchor="end" font-size="12" fill="${INK}">${esc(countsText(history.counts))}</text>`,
    )
  }

  const h = foot + (history ? 58 : 38)
```
Replace
```ts
export function cardAlt(soul: Soul, bones: Bones, rerolls: number): string {
  const stars = RARITY[bones.rarity].stars
  return (
    `${soul.name}, ${bones.rarity} ${bones.species}, ${stars} star${stars === 1 ? '' : 's'}. ` +
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    `Hatched ${hatchDay(soul.hatchedAt)}. Rerolls ${rerolls}.`
  )
}
```
with:
```ts
export function cardAlt(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory): string {
  const stars = RARITY[bones.rarity].stars
  return (
    `${soul.name}, ${bones.rarity} ${bones.species}, ${stars} star${stars === 1 ? '' : 's'}. ` +
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    `Hatched ${hatchDay(soul.hatchedAt)}. Rerolls ${rerolls}.` +
    (history ? ` ${streakLine(history.you, history.counts)}.` : '')
  )
}
```

- [ ] **Step 5: Write the greeting**

In `buddy/hooks/voice.ts`, replace
```ts
import type { Mode, Soul } from '../types'
```
with:
```ts
import type { Mode, Soul, You } from '../types'
```
and add at the end of the file:
```ts
const STREAK_LINES: readonly string[] = [
  'Day {n} together.',
  "{n} days in a row. Not that I'm counting.",
  "Back again. That's {n} days.",
  "{n}-day streak. Don't make it weird.",
]

// Said without a model call when the first session of a new day extends a streak.
export function streakGreeting(streak: number): string {
  return STREAK_LINES[streak % STREAK_LINES.length]!.replace('{n}', String(streak))
}

export function shouldGreet(o: { mode: Mode; dayBefore: string | null; you: You }): boolean {
  return o.mode === 'on' && o.you.lastDay !== o.dayBefore && o.you.streak >= 2
}
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 117 pass, 0 fail. Validation passes.

- [ ] **Step 7: Commit**

```bash
git add buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/card.ts buddy/hooks/card.test.ts buddy/hooks/voice.ts buddy/hooks/voice.test.ts
git commit -F - <<'EOF'
feat: the streak line, its row on the SVG card, and the streak greeting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Every save through `commit`

The session runs on the schema 2 record, and `commit` replaces `save`. A reroll retires the old buddy instead of replacing it. Nothing is counted yet: that's Task 5.

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/record.ts` (delete the schema 1 helpers)
- Modify: `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`
- Modify: `buddy/hooks/buddy.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes from Task 2: `classify`, `activeBuddy`, `applyChange`, `type Stored`, `type Change`, and the types `Saved` and `Buddy`.
- Produces, in `register.tsx` (Task 5 extends it):
  - `current($): Promise<Stored>`
  - `commit($, change: Change): Promise<string | null>`
  - `adopt($, saved: Saved)`
  - `type Who = Pick<Buddy, 'seed' | 'soul'>` and `reply($, who: Who, prompt)`
  - `hatch($, kind: 'hatch' | 'reroll')`
  - `SAVE_FAILED`
  - in the `card` pane hook, the active buddy as `buddy`

  In `buddy.test.tsx` (Task 5 extends it): `sharedStore(on, row): { row: unknown; writes: number; refuse: boolean }`.

- [ ] **Step 1: Write the failing mod-level tests**

In `buddy/hooks/buddy.test.tsx`:

Replace
```ts
import { SHIMMER } from './layout'
```
with:
```ts
import type { Saved } from '../types'
import { SHIMMER } from './layout'
```

Replace
```ts
// What the card pane shows on the terminal once /buddy card opened it, which prints nothing.
```
with:
```ts
// A store this test can look into and turn off: one row under `buddy`, as another
// session sharing it would see it.
function sharedStore(on: On, row: unknown) {
  const shared = { row, writes: 0, refuse: false }
  on('store.get', async () => ({ value: shared.row }))
  on('store.set', async (_$, e) => {
    if (shared.refuse) return { deny: 'disk full' }
    shared.row = e.value
    shared.writes++
    return { value: undefined }
  })
  return shared
}

// What the card pane shows on the terminal once /buddy card opened it, which prints nothing.
```

In the test `'reroll asks first, then replaces the buddy and counts the reroll'`, replace
```ts
  expect(await run('reroll')).toMatch(/^This replaces Pip, .* for good\. Run \/buddy reroll confirm\.$/)
```
with:
```ts
  expect(await run('reroll')).toMatch(/^This retires Pip, \w+ \w+\. Run \/buddy reroll confirm\.$/)
```

Replace the whole test
```ts
test('a record from a newer schema is never touched', async ($, on) => {
  world(on, { buddy: { schema: 2, seed: 'future' } })
  await $.session.start(START)
  const run = runner($)
  for (const args of ['', 'pet', 'reroll confirm']) {
    expect(await run(args)).toBe('Saved buddy uses schema 2; this mod knows 1.')
  }
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
})
```
with:
```ts
const UNTOUCHABLE = [
  ['a record from a newer schema is never touched', { schema: 3, seed: 'future' }, 'Saved buddy uses schema 3; this mod knows 1 and 2.'],
  ['a damaged record is never touched', { schema: 2, active: 'gone', buddies: [] }, "Saved buddy is damaged; this mod won't overwrite it."],
] as const

for (const [name, row, line] of UNTOUCHABLE) {
  test(name, async ($, on) => {
    const shared = sharedStore(on, row)
    const clock = world(on, null)
    engineBelow(on)
    model(on, null, null)
    await $.session.start(START)
    const run = runner($)
    for (const args of ['', 'pet', 'card', 'reroll confirm', 'debug']) {
      expect(await run(args)).toBe(line)
    }
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete(TURN)
    await clock.settle()
    expect(shared.writes).toBe(0)
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })
}
```

In the test `"another session's reroll is not overwritten"`, replace
```ts
  expect(shared.row).toMatchObject({ seed: 'other-seed', mode: 'muted' })
```
with:
```ts
  expect(shared.row).toMatchObject({ schema: 2, active: 'other-seed', mode: 'muted' })
```

At the end of the file, add:
```ts
test('a schema 1 record is upgraded by the first save', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  await $.session.start(START)
  expect(shared.writes).toBe(0)
  await runner($)('mute')
  expect(shared.row).toMatchObject({
    schema: 2,
    mode: 'muted',
    rerolls: 0,
    active: 'test-seed',
    buddies: [{ seed: 'test-seed', soul: { name: 'Pip' }, retiredAt: null }],
  })
})

test('a reroll retires the old buddy and keeps it', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toMatch(/^Bix, an? /)
  const saved = shared.row as Saved
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Pip', 'Bix'])
  expect(typeof saved.buddies[0]?.retiredAt).toBe('string')
  expect(saved.buddies[1]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: saved.buddies[1]?.seed, rerolls: 1, mode: 'on' })
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy
```
Expected: these six fail on the old build:
- the reroll warning test
- the two never-touched tests
- the other-session test
- the two new tests

- [ ] **Step 3: Point the contract at the schema 2 record**

In `buddy/types/index.d.ts`, replace
```ts
export type BuddyRecord = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
}
```
with:
```ts
// The schema 1 record (base spec section 3), read only to migrate it.
export type SavedV1 = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
}
```
delete the alias Task 2 added:
```ts
// The schema 1 record (base spec section 3), read only to migrate it.
export type SavedV1 = BuddyRecord

```
and replace
```ts
      record: BuddyRecord | null
```
with:
```ts
      record: Saved | null
```

- [ ] **Step 4: Delete the schema 1 helpers**

In `buddy/hooks/record.ts`:
- Replace
  ```ts
  import type { Buddy, BuddyRecord, Counts, Mode, Saved, SavedV1, Soul } from '../types'
  ```
  with:
  ```ts
  import type { Buddy, Counts, Mode, Saved, SavedV1, Soul } from '../types'
  ```
- Delete this block, from `export type Loaded =` through the closing `}` of `newRecord`, together with the blank line after it:
  ```ts
  export type Loaded =
    | { kind: 'none' }
    | { kind: 'ok'; record: BuddyRecord }
    | { kind: 'foreign'; schema: string }

  export function classifyRecord(raw: unknown): Loaded {
    if (raw === undefined || raw === null) return { kind: 'none' }
    const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
    if (schema === 1) return { kind: 'ok', record: raw as BuddyRecord }
    return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
  }

  export function newRecord(seed: string, soul: Soul, rerolls: number): BuddyRecord {
    return { schema: 1, seed, soul, mode: 'on', rerolls }
  }
  ```

In `buddy/hooks/record.test.ts`:
- Replace
  ```ts
  import { USAGE, activeBuddy, applyChange, classify, classifyRecord, migrate, newRecord, parseSub } from './record'
  ```
  with:
  ```ts
  import { USAGE, activeBuddy, applyChange, classify, migrate, parseSub } from './record'
  ```
- Delete the tests `'records are classified, and only schema 1 is ours'` and `'a new record starts on, with the rerolls it is given'`.

- [ ] **Step 5: Rewire `register.tsx` onto `commit`**

Make these replacements in `buddy/hooks/register.tsx`, in order.

**Imports.** Replace
```ts
import type { BuddyRecord } from '../types'
```
with:
```ts
import type { Buddy, Saved, Soul } from '../types'
```
Replace
```ts
import { STORE_KEY, USAGE, classifyRecord, newRecord, parseSub } from './record'
import type { Sub } from './record'
```
with:
```ts
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub } from './record'
import type { Change, Stored, Sub } from './record'
```

**Constants and types.** Replace
```ts
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
```
with:
```ts
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
const SAVE_FAILED = 'Could not save your buddy; it lives for this session only.'
```
Replace
```ts
const tint = (color: string | undefined) => (color ? { color } : {})
```
with:
```ts
// The part of a buddy that speaks: its seed, for the bones, and its soul.
type Who = Pick<Buddy, 'seed' | 'soul'>

const tint = (color: string | undefined) => (color ? { color } : {})
```

**`adopt`, `current` and `commit`.** Replace
```ts
// Make `rec` the session's buddy: into state, and the timer to match its mode.
async function adopt($: EngineInterface, rec: BuddyRecord) {
  await update($, record, () => rec)
  if (rec.mode === 'off') stopTimer()
  else if (!timer) startTimer($)
}

async function save($: EngineInterface, rec: BuddyRecord): Promise<string | null> {
  await adopt($, rec)
  try {
    await $.store.set(STORE_KEY, rec)
    await update($, unsaved, () => false)
    return null
  } catch {
    await update($, unsaved, () => true)
    return 'Could not save your buddy; it lives for this session only.'
  }
}
```
with:
```ts
// Make `saved` the session's buddy: into state, and the timer to match its mode.
async function adopt($: EngineInterface, saved: Saved) {
  await update($, record, () => saved)
  if (saved.mode === 'off') stopTimer()
  else if (!timer) startTimer($)
}

// What this session builds on. The store is shared between sessions, so it is the truth,
// unless this session's last write failed: then its own copy in state carries on until a
// write succeeds.
async function current($: EngineInterface): Promise<Stored> {
  const stored = classify(await $.store.get(STORE_KEY))
  if (stored.kind === 'damaged' || stored.kind === 'foreign') return stored
  const mine = await read($, record)
  if (mine && (await read($, unsaved))) return { kind: 'ok', saved: mine }
  return stored
}

// The only writer of the store: read fresh, make one change, write (Foundation spec section 2).
// A failed write leaves the result in state, marked unsaved, and returns the note saying so.
async function commit($: EngineInterface, change: Change): Promise<string | null> {
  const base = await current($)
  if (base.kind === 'damaged' || base.kind === 'foreign') return null
  const saved = applyChange(base.kind === 'ok' ? base.saved : null, change, await $.clock.now())
  if (!saved) return null
  await adopt($, saved)
  try {
    await $.store.set(STORE_KEY, saved)
    await update($, unsaved, () => false)
    return null
  } catch {
    await update($, unsaved, () => true)
    return SAVE_FAILED
  }
}
```

**`ask` takes a soul.** Replace
```ts
  rec: BuddyRecord,
  bones: Bones,
```
with:
```ts
  soul: Soul,
  bones: Bones,
```
and replace
```ts
      { model: 'haiku', system: personaSystem(rec.soul, bones), prompt, maxTokens: 80, timeoutMs: 8000 },
```
with:
```ts
      { model: 'haiku', system: personaSystem(soul, bones), prompt, maxTokens: 80, timeoutMs: 8000 },
```

**`reply` takes a `Who`.** Replace
```ts
async function reply($: EngineInterface, rec: BuddyRecord, prompt: string) {
  const bones = rollBones(rec.seed)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, rec, bones, prompt, 'reply')
```
with:
```ts
async function reply($: EngineInterface, who: Who, prompt: string) {
  const bones = rollBones(who.seed)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who.soul, bones, prompt, 'reply')
```

**`react` reads the active buddy.** Replace
```ts
  const rec = await read($, record)
  if (!rec || (await read($, hatching))) return
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: rec.mode,
```
with:
```ts
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: saved.mode,
```
and replace
```ts
  const text = await ask($, rec, rollBones(rec.seed), reactionPrompt(summary), 'react')
```
with:
```ts
  const buddy = activeBuddy(saved)
  const text = await ask($, buddy.soul, rollBones(buddy.seed), reactionPrompt(summary), 'react')
```

**`hatch` commits a hatch or a reroll.** Replace
```ts
async function hatch($: EngineInterface, rerolls: number): Promise<string> {
```
with:
```ts
async function hatch($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
```
and replace
```ts
    const rec = newRecord(seed, { ...soul, hatchedAt }, rerolls)
    const note = await save($, rec)
    await update($, bubble, () => null)
    later($, () => reply($, rec, HELLO_PROMPT))
```
with:
```ts
    const born: Who = { seed, soul: { ...soul, hatchedAt } }
    const note = await commit($, { kind, ...born })
    await update($, bubble, () => null)
    later($, () => reply($, born, HELLO_PROMPT))
```

**`runBuddy`.** Replace the whole function, from `async function runBuddy(` through its closing `}` just before `function eggLook`, with:
```ts
async function runBuddy($: EngineInterface, sub: Sub): Promise<string | undefined> {
  if (sub === 'usage') return USAGE
  const stored = await current($)
  if (stored.kind === 'foreign') return `Saved buddy uses schema ${stored.schema}; this mod knows 1 and 2.`
  if (stored.kind === 'damaged') return "Saved buddy is damaged; this mod won't overwrite it."
  if (stored.kind === 'none') return sub === 'show' ? hatch($, 'hatch') : NO_BUDDY
  const saved = stored.saved
  // Another session may have changed the store since this one last looked.
  await adopt($, saved)
  const buddy = activeBuddy(saved)
  const bones = rollBones(buddy.seed)
  const name = buddy.soul.name
  const who = `${name}, ${bones.rarity} ${bones.species}`
  const hidden = `${name} is hidden. Run /buddy to bring it back.`
  switch (sub) {
    case 'show': {
      const note = await commit($, { kind: 'mode', mode: 'on' })
      later($, () => reply($, buddy, HELLO_PROMPT))
      return note ?? `${who}, is here.`
    }
    case 'pet': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => reply($, buddy, PET_PROMPT))
      return undefined
    }
    case 'card': {
      const opened = await $.ui.open({ id: CARD, title: 'Buddy', closeOnEscape: true })
      // A surface that places no panes gets the card as text instead.
      return opened.isPlaced ? undefined : cardLines(buddy.soul, bones, saved.rerolls).join('\n')
    }
    case 'mute':
      return (await commit($, { kind: 'mode', mode: 'muted' })) ?? `${name} will stay quiet unless spoken to.`
    case 'unmute':
      return (await commit($, { kind: 'mode', mode: 'on' })) ?? `${name} can talk again.`
    case 'off':
      return (await commit($, { kind: 'mode', mode: 'off' })) ?? hidden
    case 'reroll':
      return `This retires ${who}. Run /buddy reroll confirm.`
    case 'reroll-confirm':
      return hatch($, 'reroll')
    case 'debug': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, tourStart, () => now)
      return `Touring all ${TOUR_STEPS} species, plain then shiny. Run /buddy debug off to stop.`
    }
    case 'debug-off':
      await update($, tourStart, () => null)
      return saved.mode === 'off' ? hidden : `Back to ${name}.`
  }
}
```

**`buddyLook` takes the saved record.** Replace
```ts
async function buddyLook($: EngineInterface, rec: BuddyRecord, t: number, withTour = true): Promise<Look> {
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = withTour ? await read($, tourStart) : null
  const tour = started === null ? null : tourAt(t - started)
  const bones = tour ? { ...rollBones(rec.seed), ...tour.look } : rollBones(rec.seed)
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : rec.soul.name
```
with:
```ts
async function buddyLook($: EngineInterface, saved: Saved, t: number, withTour = true): Promise<Look> {
  const buddy = activeBuddy(saved)
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = withTour ? await read($, tourStart) : null
  const tour = started === null ? null : tourAt(t - started)
  const bones = tour ? { ...rollBones(buddy.seed), ...tour.look } : rollBones(buddy.seed)
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : buddy.soul.name
```

**`session.start` loads through `current`.** Replace
```ts
      const loaded = classifyRecord(await $.store.get(STORE_KEY))
      // A write that failed before a reload left the only copy in state: keep it.
      const pending = (await read($, unsaved)) ? await read($, record) : null
      const rec = pending ?? (loaded.kind === 'ok' ? loaded.record : null)
      await update($, record, () => rec)
      if (rec && rec.mode !== 'off') startTimer($)
```
with:
```ts
      // A write that failed before a reload left the only copy in state: current() keeps it.
      const stored = await current($)
      const saved = stored.kind === 'ok' ? stored.saved : null
      await update($, record, () => saved)
      if (saved && saved.mode !== 'off') startTimer($)
```

**`prompt.submit` matches the active buddy's name.** Replace
```ts
      const rec = await read($, record)
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      // A prompt carrying images or files is a request for Claude, whatever it starts with.
      const bare = !e.attachments || e.attachments.length === 0
      const message = rec && rec.mode !== 'off' && fromPerson && bare ? matchAddress(rec.soul.name, e.text) : null
      if (rec && message !== null) {
        later($, () => reply($, rec, talkPrompt(message)))
        return { drop: `(to ${rec.soul.name})` }
      }
```
with:
```ts
      const saved = await read($, record)
      const buddy = saved && saved.mode !== 'off' ? activeBuddy(saved) : null
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      // A prompt carrying images or files is a request for Claude, whatever it starts with.
      const bare = !e.attachments || e.attachments.length === 0
      const message = buddy && fromPerson && bare ? matchAddress(buddy.soul.name, e.text) : null
      if (buddy && message !== null) {
        later($, () => reply($, buddy, talkPrompt(message)))
        return { drop: `(to ${buddy.soul.name})` }
      }
```

**The `AbovePrompt` hook** needs no change: its `rec` is now a `Saved`, which is what `buddyLook` takes.

**The `card` pane draws the active buddy.** Replace
```ts
      const rec = await read($, record)
      if (!rec) return <Text dimColor>{NO_BUDDY}</Text>

      const bones = rollBones(rec.seed)
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={cardSvg(rec.soul, bones, rec.rerolls)} alt={cardAlt(rec.soul, bones, rec.rerolls)} />
      }

      const view = await buddyLook($, rec, await read($, tick), false)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{rec.soul.name}</Text>
            <Text {...tint(view.starColor)}>{'  ' + view.stars}</Text>
          </Box>
          <Text dimColor>
            {`${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}   Hat: ${bones.hat}   Eyes: ${bones.eye}`}
          </Text>
          <Text>{rec.soul.personality}</Text>
        </Box>
      )
      const footer = <Text dimColor>{`Hatched ${rec.soul.hatchedAt.slice(0, 10)}   Rerolls: ${rec.rerolls}`}</Text>
```
with:
```ts
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = activeBuddy(saved)
      const bones = rollBones(buddy.seed)
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={cardSvg(buddy.soul, bones, saved.rerolls)} alt={cardAlt(buddy.soul, bones, saved.rerolls)} />
      }

      const view = await buddyLook($, saved, await read($, tick), false)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{buddy.soul.name}</Text>
            <Text {...tint(view.starColor)}>{'  ' + view.stars}</Text>
          </Box>
          <Text dimColor>
            {`${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}   Hat: ${bones.hat}   Eyes: ${bones.eye}`}
          </Text>
          <Text>{buddy.soul.personality}</Text>
        </Box>
      )
      const footer = <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}`}</Text>
```

Then check that nothing still names the old record:
```bash
grep -n "BuddyRecord\|classifyRecord\|newRecord\|save(\$" buddy/hooks/register.tsx buddy/hooks/record.ts buddy/types/index.d.ts
```
Expected: no output.

- [ ] **Step 6: Say what reroll does now in the README**

In `README.md`, replace
```
| `/buddy reroll`, then `/buddy reroll confirm` | Replace it with a new one, for good |
```
with:
```
| `/buddy reroll`, then `/buddy reroll confirm` | Retire it and hatch a new one; the old one is kept |
```

- [ ] **Step 7: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 118 pass, 0 fail. Validation passes, and its `calls:` line lists `$.store.get` (via `current`) and `$.store.set` (via `commit`).

- [ ] **Step 8: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx README.md
git commit -F - <<'EOF'
feat: every save goes through commit, on the schema 2 record

A commit reads the store fresh, makes one change and writes it, so another
session's changes are kept. A reroll retires the old buddy instead of
replacing it. A damaged or newer-schema record is never written.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Counting, saving the counts, the card's streak, and the greeting

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/register.tsx`
- Modify: `buddy/hooks/buddy.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes:
  - from Task 1: `addCounts`, `countEvent`, `mergePending`, `zeroCounts`, `type CountEvent`
  - from Task 3: `streakLine`, `cardSvg`/`cardAlt` with `history`, `shouldGreet`, `streakGreeting`
  - from Task 4: `commit`, `later`, `reply`, `showBubble`, the pane's `buddy`, `sharedStore`
- Produces, in `register.tsx`:
  - the `pending` state value
  - `count($, event)`, `flush($)`, `countAndFlush($, event)`, `countsOf($, buddy)` and `visitToday($)`

- [ ] **Step 1: Write the failing mod-level tests**

In `buddy/hooks/buddy.test.tsx`:

Replace
```ts
import { FALLBACK_NAMES } from './voice'
```
with:
```ts
import { zeroCounts } from './ledger'
import { FALLBACK_NAMES } from './voice'
```

Replace
```ts
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true) {
  const clock = mock.clock(on, { now: 1_000_000 })
```
with:
```ts
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true, now = 1_000_000) {
  const clock = mock.clock(on, { now })
```

Replace
```ts
// What the card pane shows on the terminal once /buddy card opened it, which prints nothing.
```
with:
```ts
// The active buddy's entry in a stored row.
function activeOf(row: unknown) {
  const saved = row as Saved
  return saved.buddies.find(b => b.seed === saved.active)
}

// What the card pane shows on the terminal once /buddy card opened it, which prints nothing.
```

Replace the test
```ts
test('card opens a pane with the name, personality and rerolls, and prints nothing', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const card = await cardText($)
  expect(card).toMatch(/^Pip\b/m)
  expect(card).toMatch(/Counts semicolons\./)
  expect(card).toMatch(/Rerolls: 0/)
})
```
with:
```ts
test('card opens a pane with the name, personality, rerolls and streak, and prints nothing', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await clock.settle()
  const card = await cardText($)
  expect(card).toMatch(/^Pip\b/m)
  expect(card).toMatch(/Counts semicolons\./)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/Streak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
})
```

In the test `'the card pane is one drawn card on desktop and meters on the terminal'`, replace
```ts
  expect(cards[0]?.props.alt).toMatch(/^Pip, .*"Counts semicolons\." .*Stats: DEBUGGING \d+/)
```
with:
```ts
  expect(cards[0]?.props.alt).toMatch(/^Pip, .*"Counts semicolons\." .*Stats: DEBUGGING \d+/)
  expect(cards[0]?.props.alt).toMatch(/Rerolls 0\. Streak \d+ days? \(best \d+\) · 0 turns · 0 tool calls\.$/)
  expect(String(cards[0]?.props.source)).toContain('>0 turns · 0 tool calls</text>')
```

Replace the test
```ts
test('where no pane can be placed, card prints the text card', async ($, on) => {
  world(on, { buddy: RECORD }, false)
  await $.session.start(START)
  const card = (await runner($)('card')) ?? ''
  expect(card).toMatch(/^Pip, /)
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
})
```
with:
```ts
test('where no pane can be placed, card prints the text card with the streak', async ($, on) => {
  const clock = world(on, { buddy: RECORD }, false)
  await $.session.start(START)
  await clock.settle()
  const card = (await runner($)('card')) ?? ''
  expect(card).toMatch(/^Pip, /)
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
})
```

In the test `'the debug tour shows each species plain, then shiny, and never writes the store'`, replace
```ts
  const clock = world(on, null)
  await $.session.start(START)
  expect(await runner($)('debug')).toBe('Touring all 18 species, plain then shiny. Run /buddy debug off to stop.')
```
with:
```ts
  const clock = world(on, null)
  await $.session.start(START)
  // The session's visit is its own write; the tour adds none.
  await clock.settle()
  const visits = writes.length
  expect(await runner($)('debug')).toBe('Touring all 18 species, plain then shiny. Run /buddy debug off to stop.')
```
and, at the end of the same test, replace
```ts
  expect(writes).toEqual([])
```
with:
```ts
  expect(writes).toHaveLength(visits)
```

At the end of the file, add:
```ts
// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()

const SAVED: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: 'test-seed',
  buddies: [{ seed: 'test-seed', soul: RECORD.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: '2026-10-06', streak: 3, bestStreak: 3, days: 3 },
}

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny' ? { deny: 'not here' } : { isError: true as const, result: 'boom' },
  )
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await $.tool.call({ tool: 'Bash', command: 'deny' })
  await $.turn.complete({ ...TURN, durationMs: 7_000 })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({
    turns: 1,
    longestTurnMs: 7_000,
    failedCalls: 2,
    calls: { shell: 1, read: 1 },
  })
})

test("another session's changes survive this session's save", async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  // Mid-turn, another session mutes the buddy and saves five turns of its own.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.mode = 'muted'
  theirs.buddies[0]!.counts.turns = 5
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(shared.row).toMatchObject({ mode: 'muted' })
  expect(activeOf(shared.row)?.counts).toMatchObject({ turns: 6, failedCalls: 1 })
})

test('a failed write keeps the counts for the next save', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(0)
  shared.refuse = false
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({ turns: 2, failedCalls: 1 })
})

test('pets and talks are counted and saved', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, 'Hi.')
  await $.session.start(START)
  expect(await runner($)('pet')).toBeUndefined()
  await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({ pets: 1, talks: 1 })
})

test('the first session of a new day greets the streak; the next one that day does not', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null, true, NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Day 4 together\./ })).toBeDefined()
  expect((shared.row as Saved).you).toEqual({ lastDay: '2026-10-07', streak: 4, bestStreak: 4, days: 4 })
  await clock.advance(13_000)
  expect(await ui.find({ text: /together/ })).toBeUndefined()
  await $.session.start(START)
  await clock.settle()
  expect(await ui.find({ text: /together/ })).toBeUndefined()
})

test('a buddy that is off counts nothing and records no visit', async ($, on) => {
  const shared = sharedStore(on, { ...RECORD, mode: 'off' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(shared.writes).toBe(0)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy
```
Expected: eight fail:
- the three card tests, since no streak line is drawn yet
- the counts, merge, failed-write, pets-and-talks and greeting tests

The "off" test and the edited tour test already pass, since nothing writes on those paths yet.

- [ ] **Step 3: Add `pending` to the contract**

In `buddy/types/index.d.ts`, replace
```ts
      lastReplyAt: number
    }
```
with:
```ts
      lastReplyAt: number
      // Counts not yet saved, by buddy seed (Foundation spec section 2).
      pending: Record<string, Counts>
    }
```

- [ ] **Step 4: Count, save, show and greet**

Make these replacements in `buddy/hooks/register.tsx`, in order.

**Imports.** Replace
```ts
import type { Buddy, Saved, Soul } from '../types'
```
with:
```ts
import type { Buddy, Counts, Saved, Soul } from '../types'
```
Replace
```ts
import { bandRows, cardLines, compactLine, isCompact, nameLine, spriteTint } from './layout'
```
with:
```ts
import { bandRows, cardLines, compactLine, isCompact, nameLine, spriteTint, streakLine } from './layout'
import { addCounts, countEvent, mergePending, zeroCounts } from './ledger'
import type { CountEvent } from './ledger'
```
In the `./voice` import list, replace
```ts
  reactionPrompt,
  shouldQuip,
```
with:
```ts
  reactionPrompt,
  shouldGreet,
  shouldQuip,
  streakGreeting,
```

**The `pending` atom.** Replace
```ts
const lastReplyAt = atom({ plugin: 'buddy', key: 'lastReplyAt' } as const, 0)
```
with:
```ts
const lastReplyAt = atom({ plugin: 'buddy', key: 'lastReplyAt' } as const, 0)
const pending = atom({ plugin: 'buddy', key: 'pending' } as const, {})
```

**Counting and flushing.** Replace
```ts
async function showBubble($: EngineInterface, text: string) {
```
with the new code, followed by the line it replaced:
```ts
// Adds one event to this session's unsaved counts for the active buddy. Nothing is counted
// with no buddy, while the egg is out, or while the buddy is off.
async function count($: EngineInterface, event: CountEvent) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off' || (await read($, hatching))) return
  const seed = saved.active
  await update($, pending, p => ({ ...p, [seed]: countEvent(p[seed] ?? zeroCounts(), event) }))
}

// Saves the unsaved counts with today's visit. A failed store write has already taken them
// into this session's copy (commit adopts before it writes), so they go back into `pending`
// only when the commit failed before that.
async function flush($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  const taken = await read($, pending)
  await update($, pending, () => ({}))
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

// A buddy's lifetime counts with this session's unsaved ones added, for the card.
async function countsOf($: EngineInterface, buddy: Buddy): Promise<Counts> {
  const waiting = (await read($, pending))[buddy.seed]
  return waiting ? addCounts(buddy.counts, waiting) : buddy.counts
}

async function showBubble($: EngineInterface, text: string) {
```

**The visit and the greeting.** Replace
```ts
// One model call at a time: a reply cancels a pending reaction; a reaction
```
with the new code, followed by the line it replaced:
```ts
// The session's visit (spec section 3), greeting the streak on the first session of a new day.
async function visitToday($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  const dayBefore = saved.you.lastDay
  await commit($, { kind: 'visit' })
  const after = await read($, record)
  if (after && shouldGreet({ mode: after.mode, dayBefore, you: after.you })) {
    await showBubble($, streakGreeting(after.you.streak))
  }
}

// One model call at a time: a reply cancels a pending reaction; a reaction
```

**Pets are counted.** In `runBuddy`, replace
```ts
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => reply($, buddy, PET_PROMPT))
```
with:
```ts
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => countAndFlush($, { kind: 'pet' }))
      later($, () => reply($, buddy, PET_PROMPT))
```

**The text card gets the streak line.** In `runBuddy`, replace
```ts
      return opened.isPlaced ? undefined : cardLines(buddy.soul, bones, saved.rerolls).join('\n')
```
with:
```ts
      if (opened.isPlaced) return undefined
      return [...cardLines(buddy.soul, bones, saved.rerolls), streakLine(saved.you, await countsOf($, buddy))].join('\n')
```

**The session's visit.** In the `session.start` hook, replace
```ts
      if (saved && saved.mode !== 'off') startTimer($)
```
with:
```ts
      if (saved && saved.mode !== 'off') {
        startTimer($)
        later($, () => visitToday($))
      }
```

**Tool calls are counted.** In the `tool.call` hook, replace
```ts
      // Main conversation only: a subagent's calls never reach the buddy's reactions.
      if (e.agentId === undefined) {
        tally[e.tool] = (tally[e.tool] ?? 0) + 1
        if (ran.deny === undefined && ran.isError === true) failedTools.push(e.tool)
      }
```
with:
```ts
      // Main conversation only: a subagent's calls never reach the buddy's reactions or counts.
      if (e.agentId === undefined) {
        tally[e.tool] = (tally[e.tool] ?? 0) + 1
        const failed = ran.deny === undefined && ran.isError === true
        if (failed) failedTools.push(e.tool)
        // A denied call never ran, so it isn't counted.
        if (ran.deny === undefined) later($, () => count($, { kind: 'call', tool: e.tool, failed }))
      }
```

**Turns are counted and saved.** In the `turn.complete` hook, replace
```ts
        tally = {}
        failedTools = []
        later($, () => react($, summary))
```
with:
```ts
        tally = {}
        failedTools = []
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        later($, () => countAndFlush($, turn))
        later($, () => react($, summary))
```

**Talks are counted.** In the `prompt.submit` hook, replace
```ts
        later($, () => reply($, buddy, talkPrompt(message)))
```
with:
```ts
        later($, () => countAndFlush($, { kind: 'talk' }))
        later($, () => reply($, buddy, talkPrompt(message)))
```

**The card pane shows the streak.** In the `card` pane hook, replace
```ts
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={cardSvg(buddy.soul, bones, saved.rerolls)} alt={cardAlt(buddy.soul, bones, saved.rerolls)} />
      }
```
with:
```ts
      const history = { you: saved.you, counts: await countsOf($, buddy) }
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return (
          <Svg
            source={cardSvg(buddy.soul, bones, saved.rerolls, history)}
            alt={cardAlt(buddy.soul, bones, saved.rerolls, history)}
          />
        )
      }
```
and replace
```ts
          {footer}
        </Box>
```
with:
```ts
          {footer}
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
        </Box>
```

- [ ] **Step 5: Say what the card shows and what it saves in the README**

In `README.md`, replace
```
| `/buddy card` | Name, species, rarity, stats |
```
with:
```
| `/buddy card` | Its card: name, species, rarity, stats, your streak and its lifetime counts |
```
and replace
```
- **What it saves.** One small record in the mod's own store: the seed, the name, the personality, the hatch date, the mute/off mode and the reroll count.
```
with:
```
- **What it saves.** One record in the mod's own store: every buddy you've had (its seed, name, personality and hatch date, plus lifetime counts of turns, tool calls by kind, failures, pets and talks), the mute/off mode, the reroll count, and your visit streak by date. Never prompt text, answers, file contents or command arguments.
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 124 pass, 0 fail. Validation passes, and its `state writes:` and `state reads:` lines now include `buddy.pending`.

- [ ] **Step 7: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx README.md
git commit -F - <<'EOF'
feat: count every main turn, tool call, pet and talk, and greet the streak

Counts wait in state and are saved at the end of a main turn and after a
pet or a talk, merged with whatever another session saved. The card shows
the streak and the active buddy's counts in all three forms. The first
session of a new day records the visit and, on a streak of 2 or more, says so.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Type-check, version, and record what shipped

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `docs/specs/2026-10-07-buddy-foundation-design.md` (status line)
- Modify: `README.md` (Design section)

**Interfaces:**
- Consumes: the finished Foundation.
- Produces: a type-checked mod at version 0.2.0 and an accurate spec status.

- [ ] **Step 1: Type-check**

The repo copy has no engine-laid types, so check it against the installed copy's types. The first run fetches TypeScript 5.6 from npm.
```bash
MOD="$(cygpath -m "$(pwd)/buddy")"
TYPES="$(cygpath -m "$(ls -d ~/.claude/plugins/cache/buddy-mods/buddy/*/.claude-plugin/types/claude-code/index.d.ts | sort -V | tail -1)")"
TMP="$(mktemp -d)"
printf '{ "extends": "%s/tsconfig.json", "include": ["%s", "%s/hooks", "%s/types"] }\n' "$MOD" "$TYPES" "$MOD" "$MOD" > "$TMP/tsconfig.json"
npx -y -p typescript@5.6 tsc -p "$(cygpath -m "$TMP/tsconfig.json")"
```
Expected: no output (exit 0). The installed copy may be older than `main`. If `tsc` reports a missing engine type that `main`'s code uses (such as `Svg` or `ui.open`), update the installed plugin first. Otherwise, fix every error, re-run the tests, and commit the fixes as `fix: type errors`.

- [ ] **Step 2: Bump the version and record what shipped**

In `buddy/.claude-plugin/plugin.json`, change `"version": "0.1.1"` to `"version": "0.2.0"`.

In `docs/specs/2026-10-07-buddy-foundation-design.md`, change the status line `**Status:** designed 2026-10-07; not built.` to the build date and a pointer to this plan:
```bash
sed -i "s|^\*\*Status:\*\* designed 2026-10-07; not built\.$|**Status:** built $(date +%F); live check pending. Plan: [\`2026-10-07-buddy-foundation-plan.md\`](2026-10-07-buddy-foundation-plan.md); its \"Deliberate deviations\" section lists three small departures from this spec.|" docs/specs/2026-10-07-buddy-foundation-design.md
head -3 docs/specs/2026-10-07-buddy-foundation-design.md
```
Expected: the third line is the new status line with today's date.

In `README.md`, replace the paragraph under `## Design` with:
```
[`docs/specs/2026-10-07-buddy-mod-design.md`](docs/specs/2026-10-07-buddy-mod-design.md) is the design spec, and [`docs/specs/2026-10-07-buddy-mod-plan.md`](docs/specs/2026-10-07-buddy-mod-plan.md) is the test-driven plan the mod was built from. The saved record, counts and streak come from [`docs/specs/2026-10-07-buddy-foundation-design.md`](docs/specs/2026-10-07-buddy-foundation-design.md) and its plan, [`docs/specs/2026-10-07-buddy-foundation-plan.md`](docs/specs/2026-10-07-buddy-foundation-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```

- [ ] **Step 3: Final full run**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 124 pass, 0 fail. Validation passes.

- [ ] **Step 4: Commit**

```bash
git add buddy/.claude-plugin/plugin.json docs/specs/2026-10-07-buddy-foundation-design.md README.md
git commit -F - <<'EOF'
chore: buddy 0.2.0, with the Foundation recorded as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: See it live**

The installed buddy runs the copy cached from GitHub, so it only picks up the change from `main`. Ask the person before pushing or merging. Once it's on `main`:
```bash
claude plugin update buddy@buddy-mods
```
Then, in a session:
1. Run `/reload-plugins`.
2. Run `/buddy card`. The card should end with `Streak 1 day (best 1) · …`, as a footer row on the SVG card and as a line on the terminal pane. The existing buddy has been migrated, with counts starting at zero.
3. Run a turn, then `/buddy card` again: the turn and tool-call counts have gone up.
4. The next day's first session should show a streak greeting once the streak reaches 2.

Report what was seen. Once it checks out, change the spec's status line from `live check pending` to `live-checked` with the date, and commit that.
