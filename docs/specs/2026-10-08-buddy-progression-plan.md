# `buddy` Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a buddy grow up: XP and levels from its counts, stat floors that rise with them, hatchling, adult and elder art for every species, seventeen achievements (six unlocking earned-only hats) announced with a canned line, and the Buddydex with `/buddy dex`, `/buddy swap`, and card and journal targets.

**Architecture:** Two new pure modules carry the rules:
- `progress.ts`: XP, level, stage, stat floors and `grow`, worked out from a buddy's saved counts and never saved; `bonesFor(buddy)` is the one way the mod gets a buddy's bones.
- `achievements.ts`: the seventeen, your lifetime across every buddy, `earn`, and the news a commit makes.

`record.ts` earns achievements and logs growing up inside the flush and the visit, against the freshly read store, and gains the `swap` change, buddy lookup and a structured `parseSub`. `layout.ts` and `card.ts` draw the level, the XP bar, the achievements and the dex. The bodies move out of `sprites.ts` into one file per stage, and the hat row moves to just above each stage's head. `register.tsx` stays wiring only: grown bones everywhere, the announcement in `commitNow`, the dex pane, targets, swap and the staged debug tour.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.293 when this was written) for `claude plugin test` and `claude plugin validate`, TypeScript 5.6 via `npx` for the type-check, and Node 22 for the art review sheet.

**Spec:** [`2026-10-08-buddy-progression-design.md`](2026-10-08-buddy-progression-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md), Foundation [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md), Alive [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md) and Memory [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md).

**Starting point:** branch `claude/subproject-d-roadmap-447f40` at the spec commit `cae047f`, on top of `main` at `bda6b85`. 252 tests pass.

**The art tasks (9 to 11)** carry only the duck, as a worked example. The rest of the 180 drawings are the deliverable, so each art task gives the format, the rules the tests enforce, a direction per species, and a review sheet the person reads before the next group starts.

**Checked before handoff:** Tasks 1 to 8 were applied to a scratch copy of the repo, edit by edit, and each reached its stated pass count; the result type-checks. Task 11's two mod tests and the review sheet were run against the duck example plus two throwaway drawings, and passed at 309.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block that runs Claude Code starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text, as it stands after the earlier tasks. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit.
- **Line endings:** LF. Write files with the editor tools or Node's `fs.writeFileSync`, never a Python `write_text` on Windows, which writes CRLF.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared at the top level of the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`, and every key is declared in `PluginState` in `buddy/types/index.d.ts`.
- **Tests find elements by text or type, never by `key`.** In the band, only sprite rows may set `bold`. The panes may.
- **No Node or DOM in the mod.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available. Only `tools/art-sheet.mjs`, which runs under Node outside the mod, may use `node:fs`.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Every hook catches its own errors** and lets the event continue (`next(e)`, or returns `next`'s result unchanged). Work started from a hook goes through `later`, so a tool result or a turn never waits on a state write.
- **Model calls:** the only new one is the hello after a swap, through the existing `reply` and `HELLO_PROMPT`. Haiku calls keep model `haiku`, `timeoutMs: 8000`, `maxTokens: 80` for speech and 200 for hatch. `shouldQuip` is unchanged.
- **Privacy:** nothing new reads prompt text, answers, file contents or command arguments. Everything here is computed from counts, bests, the streak and the buddy list.
- **Forward compatibility:** every change starts from the stored object and spreads it at every level (top, `you`, each `buddies` entry), so fields a newer build wrote survive. An achievement id or moment kind this build doesn't know is kept but never shown, counted or announced.
- **Time zones:** tests build local times with `new Date(y, monthIndex, d, h, min)`, never from a `Z` string, unless the test reads the date off the string itself.
- **Numbers** (spec sections 2 to 6):

  | What | Value |
  |-|-|
  | XP | `10 × turns + tool calls + 15 × failedTurns + 5 × pets + 5 × talks` |
  | Level | the largest L from 1 to 99 with `100 × (L − 1)² <= xp` |
  | Stages | hatchling 1–9, adult 10–29, elder 30 and up |
  | Stat floor | `min(60, rarity floor − 10 + (level − 1))`; each stat but the peak is `max(rolled, min(floor, peak − 1))` |
  | Achievements | 17; thresholds in section 3's table; hats on shell, ultramarathon, goodFriend, chatterbox, devoted, elder |
  | Hatchling art | at most 3 non-blank rows and 9 columns in every section |
  | Card XP bar | from `xpForLevel(L)` to `xpForLevel(L + 1)`, 372 px wide, 6 px tall, 10 px under the level row |
  | Card growth rows | level row 30 px under the last row, achievements line 30 px under the bar, chips from 10 px under that, rows of chips 30 px apart |
  | Dex tiles | 118 × 136 px, 3 across 9 px apart, rows 146 px apart from y 64; frame height `64 + rows × 146 + 14` |
  | Dex text | the count, `…N earlier` past 10, then the newest 10 |

- **Exact text:**

  | Where | Text |
  |-|-|
  | Name line | `  Pip  Lv 12  uncommon duck  ` (the tour's has no level) |
  | Level | `Lv 12 adult · 12,345 / 14,400 xp`; at 99 `Lv 99 elder · 1,034,500 xp` |
  | Achievements | text `Achievements: 7 of 17`; SVG `Achievements 7 of 17` |
  | News | `Level 12!`, `Level 10! I grew into an adult.`, `Level 30! I'm an elder now.`, `Earned Marathon, Survivor and Comeback.`, `Earned Shell regular, and a hard hat.` |
  | Journal | `grew into an adult`, `grew into an elder` |
  | Dex | `Buddydex: 14 buddies` (`1 buddy`), `…4 earlier`, rows like `#1  (×vv×)  Pip           Lv 30 elder common dragon ★  Oct 7 – Nov 2` |
  | Lookup | `2 buddies are named Pip: #1 dragon, #3 axolotl. Run /buddy swap #3.`, `No buddy named Rex in the dex.`, `No buddy #12 in the dex.` |
  | Swap | `Pip is back.`, `Pip is already here.`, `Wait for the egg to hatch.` |
  | Tour | `Touring all 18 species as hatchlings with their reactions, then the holidays and moods. Run /buddy debug off to stop.` (`adults`, `elders`) |
  | Usage | `Usage: /buddy [pet \| card [who] \| journal [who] \| dex \| swap <who> \| mute \| unmute \| off \| reroll [confirm]]` |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. `newsOf` and `News` live in `achievements.ts`, not `progress.ts`: news includes achievements, and `achievements.ts` already imports `progress.ts`.
2. `earnedHats` takes `you` rather than the `earned` map, and `achievements.ts` reads `bests.rough` itself rather than importing `bestsOf`. `voice.ts` imports `achievements.ts` for the news line, and `journal.ts` imports `voice.ts`, so importing `journal.ts` there would make a cycle.
3. The mod-level check that floors reach behavior reads the grown stats in the persona prompt instead of counting quips. `Math.random` can't be stubbed in a test, and the prompt goes through the same `bonesFor` every stat reader uses.
4. The card's terminal pane also shows the level line, the achievements count and the earned titles. Spec section 6 lists them for the SVG and the text fallback only.
5. `parseSub` keeps a target word's case, so a reply names it as typed (`No buddy named Rex`). Subcommand words still match in any case.
6. `dexAlt` reads dates as `Oct 7 to Nov 2`, not with full month names.
7. The debug tour's reply names the stage for adults too (`as adults`), so the reply to a bare `/buddy debug` changes.
8. Until a species' hatchling or elder is drawn, that stage draws the species' adult art. `HATCHLING` and `ELDER` are partial records until Task 11 makes them complete, so the build stays green between art tasks.
9. The month names and the long date move from `card.ts` to `layout.ts` (`longDate`, `shortDate`), so the dex rows can use them.

---

### Task 1: XP, levels and grown stats

**Files:**
- Modify: `buddy/types/index.d.ts`
- Create: `buddy/hooks/progress.ts`
- Test: `buddy/hooks/progress.test.ts`
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `TOOL_GROUPS`, `totalCalls` from `ledger.ts`; `RARITY`, `STATS`, `rollBones`, `Bones` from `roll.ts`.
- Produces:
  - type `Stage = 'hatchling' | 'adult' | 'elder'` in `types/index.d.ts`
  - from `progress.ts`: constants `MAX_LEVEL` (99), `ADULT_LEVEL` (10), `ELDER_LEVEL` (30), `MAX_FLOOR` (60), `STAGES: readonly Stage[]`
  - `safeCounts(stored: unknown): Counts`
  - `xpOf(counts: unknown): number`
  - `xpForLevel(level: number): number`
  - `levelOf(counts: unknown): number`
  - `stageOf(level: number): Stage`
  - `floorAt(rarity: Rarity, level: number): number`
  - `grow(bones: Bones, level: number): Bones`
  - `bonesFor(b: { seed: string; counts?: unknown }): Bones`
  - `nameLine(name, bones: Pick<Bones, 'rarity' | 'species' | 'shiny'>, level: number | null = null)` in `layout.ts`

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/progress.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Counts } from '../types'
import { zeroCounts } from './ledger'
import {
  ADULT_LEVEL, ELDER_LEVEL, MAX_LEVEL, bonesFor, floorAt, grow, levelOf, safeCounts, stageOf, xpForLevel, xpOf,
} from './progress'
import { RARITIES, RARITY, rollBones } from './roll'
import type { Bones } from './roll'

const counts = (o: Partial<Counts>): Counts => ({ ...zeroCounts(), ...o })
// Counts worth exactly `xp`: a turn for each 10, a shell call for each 1 left over.
const worth = (xp: number) => counts({ turns: Math.floor(xp / 10), calls: { ...zeroCounts().calls, shell: xp % 10 } })

test('XP is 10 a turn, 1 a tool call, 15 more a rough turn, and 5 a pet or a talk', () => {
  expect(xpOf(zeroCounts())).toBe(0)
  expect(xpOf(counts({ turns: 3 }))).toBe(30)
  expect(xpOf(counts({ calls: { ...zeroCounts().calls, shell: 4, mcp: 2 } }))).toBe(6)
  expect(xpOf(counts({ turns: 1, failedTurns: 1 }))).toBe(25)
  expect(xpOf(counts({ pets: 2, talks: 1 }))).toBe(15)
  // A failed call already counts as a call, and the longest turn is a record, not work.
  expect(xpOf(counts({ failedCalls: 9, longestTurnMs: 600_000 }))).toBe(0)
})

test('missing or damaged counts read as zero, so XP and level never throw', () => {
  expect(xpOf(undefined)).toBe(0)
  expect(xpOf(null)).toBe(0)
  expect(xpOf('lots')).toBe(0)
  expect(xpOf({ turns: 'many', pets: Infinity, talks: Number.NaN })).toBe(0)
  expect(xpOf({ turns: 2 })).toBe(20)
  expect(safeCounts({ calls: { shell: 3, web: 'x' } }).calls).toEqual({ ...zeroCounts().calls, shell: 3 })
  expect(levelOf(undefined)).toBe(1)
})

test('level L takes 100 x (L - 1) squared XP, and stops at 99', () => {
  expect([1, 2, 10, 30, 50, 99].map(xpForLevel)).toEqual([0, 100, 8_100, 84_100, 240_100, 960_400])
  expect(levelOf(worth(0))).toBe(1)
  expect(levelOf(worth(99))).toBe(1)
  expect(levelOf(worth(100))).toBe(2)
  expect(levelOf(worth(8_099))).toBe(9)
  expect(levelOf(worth(8_100))).toBe(10)
  expect(levelOf(worth(960_399))).toBe(98)
  expect(levelOf(worth(960_400))).toBe(MAX_LEVEL)
  expect(levelOf(worth(5_000_000))).toBe(MAX_LEVEL)
})

test('a hatchling until level 10, an adult until 30, then an elder', () => {
  expect([ADULT_LEVEL, ELDER_LEVEL]).toEqual([10, 30])
  expect([1, 9, 10, 29, 30, 99].map(stageOf)).toEqual(['hatchling', 'hatchling', 'adult', 'adult', 'elder', 'elder'])
})

test('at level 1 every stat stays as rolled, at every rarity', () => {
  for (const rarity of RARITIES) {
    const f = RARITY[rarity].floor
    // The lowest stats a roll gives: the low at max(1, F - 10), the others at F, the peak at F + 50.
    const lowest: Bones = {
      rarity,
      species: 'blob',
      eye: '·',
      hat: 'none',
      shiny: false,
      stats: { DEBUGGING: f, PATIENCE: f, CHAOS: f, WISDOM: f + 50, SNARK: Math.max(1, f - 10) },
      peak: 'WISDOM',
      low: 'SNARK',
    }
    expect([rarity, grow(lowest, 1)]).toEqual([rarity, lowest])
  }
})

// A common whose peak rolled as low as a common's can: 55.
const LOW_PEAK: Bones = {
  rarity: 'common',
  species: 'blob',
  eye: '·',
  hat: 'none',
  shiny: false,
  stats: { DEBUGGING: 5, PATIENCE: 12, CHAOS: 44, WISDOM: 55, SNARK: 1 },
  peak: 'WISDOM',
  low: 'SNARK',
}

test('each level lifts the floor a point, to 60 at most, and never to the peak', () => {
  expect([20, 40, 66, 99].map(level => floorAt('common', level))).toEqual([14, 34, 60, 60])
  expect(floorAt('legendary', 21)).toBe(60)
  expect(grow(LOW_PEAK, 20).stats).toEqual({ DEBUGGING: 14, PATIENCE: 14, CHAOS: 44, WISDOM: 55, SNARK: 14 })
  expect(grow(LOW_PEAK, 40).stats).toEqual({ DEBUGGING: 34, PATIENCE: 34, CHAOS: 44, WISDOM: 55, SNARK: 34 })
  // The floor is 60 by now, but the peak rolled 55: the others stop at 54.
  expect(grow(LOW_PEAK, 99).stats).toEqual({ DEBUGGING: 54, PATIENCE: 54, CHAOS: 54, WISDOM: 55, SNARK: 54 })
  // The names of the peak and the low stay as rolled.
  expect([grow(LOW_PEAK, 99).peak, grow(LOW_PEAK, 99).low]).toEqual(['WISDOM', 'SNARK'])
})

test("a buddy's bones are its seed's, grown by its saved counts", () => {
  expect(bonesFor({ seed: 'test-seed' })).toEqual(rollBones('test-seed'))
  // 'test-seed' rolls a common ghost: DEBUGGING 7, PATIENCE 30, CHAOS 31, WISDOM 59 (its peak)
  // and SNARK 9. Level 40 lifts all but the peak to 34.
  expect(bonesFor({ seed: 'test-seed', counts: worth(152_100) }).stats).toEqual({
    DEBUGGING: 34,
    PATIENCE: 34,
    CHAOS: 34,
    WISDOM: 59,
    SNARK: 34,
  })
})
```

In `buddy/hooks/layout.test.ts`, replace
```ts
  expect(label).toContain(`Pip  ${bones.rarity} ${bones.species}`)
```
with:
```ts
  expect(label).toContain(`Pip  ${bones.rarity} ${bones.species}`)
  // 'layout-seed' rolls a common cactus.
  expect(nameLine('Pip', bones, 12).label).toBe('  Pip  Lv 12  common cactus  ')
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
// SAVED's buddy with counts worth exactly 152,100 XP: level 40.
const ELDERLY: Saved = { ...SAVED, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 15_210 } }] }

test('the level shows on the name line, and the persona hears the stats the buddy grew into', async ($, on) => {
  const clock = world(on, { buddy: ELDERLY })
  const systems: string[] = []
  on('model.complete', async (_$, e) => {
    systems.push(e.system ?? '')
    return { value: ok('Hm.') }
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 40  common ghost  ' })).toBeDefined()
  await runner($)('pet')
  await clock.settle()
  // 'test-seed' rolled DEBUGGING 7, PATIENCE 30, CHAOS 31 and SNARK 9; level 40 lifts each to 34.
  expect(systems.at(-1)).toContain('Stats: DEBUGGING 34, PATIENCE 34, CHAOS 34, WISDOM 59, SNARK 34.')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `progress.test.ts` fails to load, because there is no `./progress`. The name-line test fails on the level. The new mod test fails on the name line. The other tests pass.

- [ ] **Step 3: Add the stage type**

In `buddy/types/index.d.ts`, replace
```ts
export type Mode = 'on' | 'muted' | 'off'
```
with:
```ts
export type Mode = 'on' | 'muted' | 'off'

// How grown a buddy is, by its level (Progression spec section 2).
export type Stage = 'hatchling' | 'adult' | 'elder'
```

- [ ] **Step 4: Write `progress.ts`**

Create `buddy/hooks/progress.ts`:
```ts
// Growing up (Progression spec section 2): XP, levels, stages and the stat floors, worked out
// from a buddy's saved counts whenever they are needed and never saved. Pure: no $.
import type { Counts, Stage } from '../types'
import { TOOL_GROUPS, totalCalls } from './ledger'
import { RARITY, STATS, rollBones } from './roll'
import type { Bones, Rarity } from './roll'

export const MAX_LEVEL = 99
export const ADULT_LEVEL = 10
export const ELDER_LEVEL = 30
// No floor rises past this.
export const MAX_FLOOR = 60
export const STAGES: readonly Stage[] = ['hatchling', 'adult', 'elder']

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Counts as numbers, whatever was stored: a missing or damaged field reads as 0.
export function safeCounts(stored: unknown): Counts {
  const c = isObject(stored) ? stored : {}
  const calls = isObject(c.calls) ? c.calls : {}
  return {
    turns: n(c.turns),
    failedTurns: n(c.failedTurns),
    longestTurnMs: n(c.longestTurnMs),
    calls: Object.fromEntries(TOOL_GROUPS.map(g => [g, n(calls[g])])) as Counts['calls'],
    failedCalls: n(c.failedCalls),
    pets: n(c.pets),
    talks: n(c.talks),
  }
}

// 10 a turn, 1 a tool call, 15 more for a rough turn sat through, 5 a pet or a talk.
export function xpOf(counts: unknown): number {
  const c = safeCounts(counts)
  return 10 * c.turns + totalCalls(c) + 15 * c.failedTurns + 5 * c.pets + 5 * c.talks
}

// The XP that reaches `level`: 0 for level 1, 100 for 2, 8,100 for 10.
export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2
}

// The largest level from 1 to 99 whose XP is reached, counted up in whole numbers so no float
// square root can land a hair under a boundary.
export function levelOf(counts: unknown): number {
  const xp = xpOf(counts)
  let level = 1
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++
  return level
}

export function stageOf(level: number): Stage {
  if (level >= ELDER_LEVEL) return 'elder'
  return level >= ADULT_LEVEL ? 'adult' : 'hatchling'
}

// The floor under a buddy's stats at `level`: at or under every stat a roll gives at level 1,
// then a point a level, up to 60.
export function floorAt(rarity: Rarity, level: number): number {
  return Math.min(MAX_FLOOR, RARITY[rarity].floor - 10 + (level - 1))
}

// The bones with every stat but the peak lifted to the level's floor, and never to the peak, so
// the peak stays the one highest stat. `peak` and `low` keep their rolled names.
export function grow(bones: Bones, level: number): Bones {
  const lift = Math.min(floorAt(bones.rarity, level), bones.stats[bones.peak] - 1)
  const stats = { ...bones.stats }
  for (const s of STATS) if (s !== bones.peak) stats[s] = Math.max(stats[s], lift)
  return { ...bones, stats }
}

// A buddy's bones as they are now: rolled from its seed, grown by its saved counts.
export function bonesFor(b: { seed: string; counts?: unknown }): Bones {
  return grow(rollBones(b.seed), levelOf(b.counts))
}
```

- [ ] **Step 5: The level on the name line**

In `buddy/hooks/layout.ts`, replace
```ts
export function nameLine(name: string, bones: Bones): { label: string; stars: string } {
  return {
    label: `  ${name}  ${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}  `,
```
with:
```ts
// The band's name line, with the level when there is one (the debug tour shows none).
export function nameLine(
  name: string,
  bones: Pick<Bones, 'rarity' | 'species' | 'shiny'>,
  level: number | null = null,
): { label: string; stars: string } {
  return {
    label: `  ${name}  ${level === null ? '' : `Lv ${level}  `}${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}  `,
```

- [ ] **Step 6: Grown bones everywhere in `register.tsx`**

In `buddy/hooks/register.tsx`:

Replace
```ts
import { mergeQueues, queueNewest } from './queue'
```
with:
```ts
import { bonesFor, levelOf } from './progress'
import { mergeQueues, queueNewest } from './queue'
```

Replace
```ts
// The part of a buddy that speaks: its seed, for the bones, its soul, and its saved mood.
type Who = Pick<Buddy, 'seed' | 'soul' | 'mood'>
```
with:
```ts
// The part of a buddy that speaks: its seed and counts, for its grown bones, its soul, and its
// saved mood. A buddy just hatched has no counts yet, so it is level 1.
type Who = Pick<Buddy, 'seed' | 'soul' | 'mood'> & { counts?: Counts }
```

Replace `  const bones = rollBones(saved.active)` with `  const bones = bonesFor(activeBuddy(saved))`.

Replace `  const bones = rollBones(who.seed)` with `  const bones = bonesFor(who)`.

Replace
```ts
  const buddy = activeBuddy(saved)
  const bones = rollBones(buddy.seed)
  const now = await $.clock.now()
```
with:
```ts
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy)
  const now = await $.clock.now()
```

Replace
```ts
  const buddy = activeBuddy(saved)
  const bones = rollBones(buddy.seed)
  const name = buddy.soul.name
```
with:
```ts
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy)
  const name = buddy.soul.name
```

Replace
```ts
  const bones = tour ? { ...rollBones(buddy.seed), ...tour.look } : rollBones(buddy.seed)
```
with:
```ts
  const own = bonesFor(buddy)
  const bones = tour ? { ...own, ...tour.look } : own
```

Replace `  const { label, stars } = nameLine(name, bones)` with `  const { label, stars } = nameLine(name, bones, tour ? null : levelOf(buddy.counts))`.

Replace
```ts
      const buddy = activeBuddy(saved)
      const bones = rollBones(buddy.seed)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
```
with:
```ts
      const buddy = activeBuddy(saved)
      const bones = bonesFor(buddy)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
```

Replace `journalSvg(name, rollBones(buddy.seed), rows)` with `journalSvg(name, bonesFor(buddy), rows)`.

`hatch` keeps `rollBones(seed)`: a buddy that hasn't hatched has no counts, and level 1 bones are the rolled ones.

- [ ] **Step 7: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 260 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/progress.ts buddy/hooks/progress.test.ts buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: XP and levels from the counts, and stats that grow with them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Achievements, earned hats, and growing up in the journal

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/sprites.ts`, `buddy/hooks/sprites.test.ts`
- Create: `buddy/hooks/achievements.ts`
- Test: `buddy/hooks/achievements.test.ts`
- Modify: `buddy/hooks/progress.ts`, `buddy/hooks/progress.test.ts`
- Modify: `buddy/hooks/journal.ts`, `buddy/hooks/journal.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`

**Interfaces:**
- Consumes: Task 1's `ADULT_LEVEL`, `ELDER_LEVEL`, `levelOf`, `safeCounts`, `stageOf`, `STAGES`; `addCounts`, `zeroCounts` from `ledger.ts`.
- Produces:
  - `earned?: Record<string, string>` on `You`; `'grew'` in `MomentKind`
  - from `sprites.ts`: `EARNED_HATS`, type `EarnedHat`, `EARNED_HAT_ART: Record<EarnedHat, string>`, type `Wearable = Hat | EarnedHat`, `hatArt(hat: Wearable): string`; `topRow`'s `hat` is `Wearable | 'none'`
  - from `achievements.ts`:
    - type `AchievementId`; type `Achievement = { id; title; hat?: EarnedHat; met(l: Lifetime): boolean }`; type `Lifetime = { counts; rough; topLevel; bestStreak; buddies }`
    - `ACHIEVEMENTS: readonly Achievement[]` (table order), `EARNED_HAT_NAME: Record<EarnedHat, string>`
    - `lifetime(saved: Saved): Lifetime`
    - `earnedOf(you: You): Readonly<Record<string, string>>`
    - `earn(saved: Saved, now: number): Saved` (returns `saved` itself when nothing is new)
    - `knownEarned(you: You): Achievement[]` (table order)
    - `earnedHats(you: You): EarnedHat[]`
  - `grewMoments(before: unknown, after: unknown, now: number): Moment[]` in `progress.ts`
  - `momentText` reads `grew`; `readable` keeps it

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/achievements.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy, Counts, Saved, You } from '../types'
import { ACHIEVEMENTS, earn, earnedHats, earnedOf, knownEarned, lifetime } from './achievements'
import { zeroCounts } from './ledger'

const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()
const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-01T12:00:00.000Z' }
const NOBODY: You = { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }

const buddy = (seed: string, counts: Partial<Counts> = {}, more: Partial<Buddy> = {}): Buddy => ({
  seed,
  soul: SOUL,
  retiredAt: null,
  counts: { ...zeroCounts(), ...counts },
  ...more,
})
const record = (buddies: Buddy[], you: Partial<You> = {}): Saved => ({
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: buddies.at(-1)!.seed,
  buddies,
  you: { ...NOBODY, ...you },
})
const calls = (o: Partial<Counts['calls']>) => ({ ...zeroCounts().calls, ...o })
// The ids `earn` gives a record that has earned nothing yet, in the order it earned them.
const earned = (saved: Saved) => Object.keys(earnedOf(earn(saved, NOON).you))

test('seventeen achievements with ids never repeated, six of them with a hat', () => {
  expect(ACHIEVEMENTS).toHaveLength(17)
  expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(17)
  expect(ACHIEVEMENTS.flatMap(a => (a.hat ? [[a.id, a.hat]] : []))).toEqual([
    ['shell', 'hardhat'],
    ['ultramarathon', 'nightcap'],
    ['goodFriend', 'flowercrown'],
    ['chatterbox', 'headphones'],
    ['devoted', 'mortarboard'],
    ['elder', 'laurel'],
  ])
})

// For each achievement, in table order: a record that meets it, and one a step under.
const rough = (n: number) => ({ bests: { failRun: 0, calls: 0, rough: n } })
const EDGES: [string, Saved, Saved][] = [
  ['shell', record([buddy('a', { calls: calls({ shell: 500 }) })]), record([buddy('a', { calls: calls({ shell: 499 }) })])],
  ['editor', record([buddy('a', { calls: calls({ edit: 1_000 }) })]), record([buddy('a', { calls: calls({ edit: 999 }) })])],
  ['bookworm', record([buddy('a', { calls: calls({ read: 5_000 }) })]), record([buddy('a', { calls: calls({ read: 4_999 }) })])],
  ['researcher', record([buddy('a', { calls: calls({ web: 100 }) })]), record([buddy('a', { calls: calls({ web: 99 }) })])],
  ['manager', record([buddy('a', { calls: calls({ agent: 100 }) })]), record([buddy('a', { calls: calls({ agent: 99 }) })])],
  ['thousandTurns', record([buddy('a', { turns: 1_000 })]), record([buddy('a', { turns: 999 })])],
  ['marathon', record([buddy('a', { longestTurnMs: 600_000 })]), record([buddy('a', { longestTurnMs: 599_999 })])],
  ['ultramarathon', record([buddy('a', { longestTurnMs: 1_800_000 })]), record([buddy('a', { longestTurnMs: 1_799_999 })])],
  ['survivor', record([buddy('a', { failedTurns: 100 })]), record([buddy('a', { failedTurns: 99 })])],
  ['comeback', record([buddy('a', {}, rough(5))]), record([buddy('a', {}, rough(4))])],
  ['goodFriend', record([buddy('a', { pets: 100 })]), record([buddy('a', { pets: 99 })])],
  ['chatterbox', record([buddy('a', { talks: 50 })]), record([buddy('a', { talks: 49 })])],
  ['regular', record([buddy('a')], { bestStreak: 7 }), record([buddy('a')], { bestStreak: 6 })],
  ['devoted', record([buddy('a')], { bestStreak: 30 }), record([buddy('a')], { bestStreak: 29 })],
  // 8,100 XP is level 10; 84,100 is level 30.
  ['grownUp', record([buddy('a', { turns: 810 })]), record([buddy('a', { turns: 809 })])],
  ['elder', record([buddy('a', { turns: 8_410 })]), record([buddy('a', { turns: 8_409 })])],
  ['collector', record(['a', 'b', 'c', 'd', 'e'].map(s => buddy(s))), record(['a', 'b', 'c', 'd'].map(s => buddy(s)))],
]

test('each achievement is earned at its threshold and not a step under', () => {
  expect(EDGES.map(([id]) => id)).toEqual(ACHIEVEMENTS.map(a => a.id))
  for (const [id, met, under] of EDGES) {
    expect([id, earned(met).includes(id)]).toEqual([id, true])
    expect([id, earned(under).includes(id)]).toEqual([id, false])
  }
})

test('your lifetime sums every buddy, retired ones too, and keeps the largest records', () => {
  const saved = record(
    [
      buddy('a', { turns: 600, longestTurnMs: 700_000, calls: calls({ shell: 300 }) }, { retiredAt: AT, ...rough(6) }),
      buddy('b', { turns: 500, longestTurnMs: 90_000, calls: calls({ shell: 250 }) }),
    ],
    { bestStreak: 12 },
  )
  expect(lifetime(saved)).toMatchObject({
    counts: { turns: 1_100, longestTurnMs: 700_000, calls: { shell: 550 } },
    rough: 6,
    // 6,300 XP and 5,250 XP: both level 8.
    topLevel: 8,
    bestStreak: 12,
    buddies: 2,
  })
  // Neither buddy alone has 500 shell commands or 1,000 turns; together they do.
  expect(earned(saved)).toEqual(['shell', 'thousandTurns', 'marathon', 'comeback', 'regular'])
})

test('earning keeps the dates already there, dates new ones now, and with nothing new changes nothing', () => {
  const saved = record([buddy('a', { pets: 100, talks: 50 })], { earned: { goodFriend: '2026-09-01T00:00:00.000Z' } })
  const done = earn(saved, NOON)
  expect(done.you.earned).toEqual({ goodFriend: '2026-09-01T00:00:00.000Z', chatterbox: AT })
  expect(earn(done, NOON + 1)).toBe(done)
})

test("a damaged earned field reads as none; a newer build's id is kept but not counted", () => {
  for (const damaged of [null, 'all', 7, ['shell']]) {
    expect(earnedOf({ ...NOBODY, earned: damaged as unknown as Record<string, string> })).toEqual({})
  }
  const you: You = { ...NOBODY, earned: { party: AT, devoted: AT, shell: AT } }
  expect(knownEarned(you).map(a => a.id)).toEqual(['shell', 'devoted'])
  expect(earnedHats(you)).toEqual(['hardhat', 'mortarboard'])
  expect(earn(record([buddy('a')], you), NOON).you.earned).toEqual({ party: AT, devoted: AT, shell: AT })
})
```

In `buddy/hooks/progress.test.ts`, replace
```ts
import {
  ADULT_LEVEL, ELDER_LEVEL, MAX_LEVEL, bonesFor, floorAt, grow, levelOf, safeCounts, stageOf, xpForLevel, xpOf,
} from './progress'
```
with:
```ts
import {
  ADULT_LEVEL, ELDER_LEVEL, MAX_LEVEL, bonesFor, floorAt, grewMoments, grow, levelOf, safeCounts, stageOf, xpForLevel,
  xpOf,
} from './progress'
```
and append:
```ts
const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()

test('a save logs one grew moment for each stage it carries a buddy into', () => {
  expect(grewMoments(worth(8_099), worth(8_100), NOON)).toEqual([{ at: AT, kind: 'grew', n: 1 }])
  expect(grewMoments(worth(8_100), worth(8_200), NOON)).toEqual([])
  expect(grewMoments(worth(84_099), worth(84_100), NOON)).toEqual([{ at: AT, kind: 'grew', n: 2 }])
  expect(grewMoments(worth(0), worth(84_100), NOON)).toEqual([
    { at: AT, kind: 'grew', n: 1 },
    { at: AT, kind: 'grew', n: 2 },
  ])
})
```

Append to `buddy/hooks/journal.test.ts`:
```ts
test('growing up reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'grew', n: 1 })).toBe('grew into an adult')
  expect(momentText({ at: AT, kind: 'grew', n: 2 })).toBe('grew into an elder')
  expect(readable([{ at: AT, kind: 'grew', n: 1 }])).toEqual([{ at: AT, kind: 'grew', n: 1 }])
})
```

In `buddy/hooks/sprites.test.ts`, replace
```ts
import {
  BLANK, CONFETTI, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W, SPRITE_W, ZZZ, bodyRows,
  eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow,
} from './sprites'
```
with:
```ts
import {
  BLANK, CONFETTI, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W,
  SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, spriteRows, topRow,
} from './sprites'
```
Replace
```ts
  for (const hat of HATS) expect(HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
```
with:
```ts
  for (const hat of HATS) expect(HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
  for (const hat of EARNED_HATS) expect(EARNED_HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
```
and append:
```ts
test('an earned hat is worn on the hat row like a rolled one, and no roll gives one', () => {
  expect(topRow({ hat: 'hardhat', heartsFrame: null, sparkle: null })).toBe(EARNED_HAT_ART.hardhat.padEnd(SPRITE_W))
  expect(hatArt('crown')).toBe(HAT_ART.crown)
  for (const hat of EARNED_HATS) expect(HATS as readonly string[]).not.toContain(hat)
})
```

Append to `buddy/hooks/record.test.ts`:
```ts
// V1's buddy one turn short of level 10.
function nearly(): Saved {
  const base = migrate(V1)
  return { ...base, buddies: [{ ...base.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }] }
}
const ONE_TURN = countEvent(zeroCounts(), { kind: 'turn', reason: 'answer', durationMs: 1_000 })

test('a flush that carries a buddy to level 10 logs that it grew and earns Grown up, once', () => {
  const saved = applyChange(nearly(), { kind: 'flush', pending: { s: ONE_TURN } }, NOON)!
  expect(activeBuddy(saved).journal).toEqual([{ at: AT, kind: 'grew', n: 1 }])
  expect(saved.you.earned).toEqual({ grownUp: AT })
  const again = applyChange(saved, { kind: 'flush', pending: { s: ONE_TURN } }, NOON + 1_000)!
  expect(activeBuddy(again).journal).toHaveLength(1)
  expect(again.you.earned).toEqual({ grownUp: AT })
})

test('a visit earns the streak achievements and keeps what was earned before', () => {
  const base = migrate(V1)
  const six = { ...base, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6, earned: { marathon: 'before' } } }
  const saved = applyChange(six, { kind: 'visit' }, NOON)!
  expect(saved.you.earned).toEqual({ marathon: 'before', regular: AT })
  expect(applyChange(saved, { kind: 'visit' }, NOON)).toBeNull()
})

test('an earned field that is not an object is replaced when something is earned, and none is added for nothing', () => {
  const base = migrate(V1)
  const damaged = { ...base, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6, earned: 'lots' } } as unknown as Saved
  expect(applyChange(damaged, { kind: 'visit' }, NOON)?.you.earned).toEqual({ regular: AT })
  expect('earned' in applyChange(base, { kind: 'visit' }, NOON)!.you).toBe(false)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `achievements.test.ts` fails to load (no `./achievements`), `progress.test.ts` and `sprites.test.ts` fail to load (no `grewMoments`, no `EARNED_HATS`), and the new journal and record tests fail. The rest pass.

- [ ] **Step 3: The types**

In `buddy/types/index.d.ts`, replace
```ts
// The person's own data: it carries across rerolls.
export type You = {
  lastDay: string | null
  streak: number
  bestStreak: number
  days: number
}
```
with:
```ts
// The person's own data: it carries across rerolls.
export type You = {
  lastDay: string | null
  streak: number
  bestStreak: number
  days: number
  // Achievement id to the ISO time it was earned (Progression spec section 3). Missing reads as none.
  earned?: Record<string, string>
}
```
Replace
```ts
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away'
```
with:
```ts
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away' | 'grew'
```
Replace
```ts
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days.
```
with:
```ts
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days,
  // the stage grown into (1 adult, 2 elder).
```

- [ ] **Step 4: Earned hats in `sprites.ts`**

In `buddy/hooks/sprites.ts`, replace
```ts
  tinyduck: "     <(')",
}
```
with:
```ts
  tinyduck: "     <(')",
}

// Hats an achievement unlocks (Progression spec section 3). No roll gives one, so a tinyduck
// still means legendary. Wearing one is E's /buddy hat.
export const EARNED_HATS = ['hardhat', 'nightcap', 'flowercrown', 'headphones', 'mortarboard', 'laurel'] as const
export type EarnedHat = (typeof EARNED_HATS)[number]
export const EARNED_HAT_ART: Record<EarnedHat, string> = {
  hardhat: '   _/==\\_',
  nightcap: '    __.-*',
  flowercrown: '   @*@*@',
  headphones: '  [=----=]',
  mortarboard: '   _[==]_',
  laurel: '   ~v~v~v~',
}

// A hat a buddy can wear: one it rolled, or one you earned.
export type Wearable = Hat | EarnedHat
const WEARABLE_ART: Record<Wearable, string> = { ...HAT_ART, ...EARNED_HAT_ART }

export function hatArt(hat: Wearable): string {
  return WEARABLE_ART[hat]
}
```
Replace
```ts
export function topRow(o: {
  hat: Hat | 'none'
```
with:
```ts
export function topRow(o: {
  hat: Wearable | 'none'
```
Replace
```ts
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
```
with:
```ts
  if (o.hat !== 'none') return fit(hatArt(o.hat))
```

- [ ] **Step 5: Write `achievements.ts`**

Create `buddy/hooks/achievements.ts`:
```ts
// Achievements (Progression spec section 3): milestones you reach across every buddy you've had,
// six of which unlock a hat no roll gives. Earned ones are saved on `you` with the time each was
// earned; everything else here is worked out from the record. Pure: no $.
import type { Counts, Saved, You } from '../types'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, levelOf, safeCounts } from './progress'
import type { EarnedHat } from './sprites'

export type AchievementId =
  | 'shell' | 'editor' | 'bookworm' | 'researcher' | 'manager' | 'thousandTurns' | 'marathon' | 'ultramarathon'
  | 'survivor' | 'comeback' | 'goodFriend' | 'chatterbox' | 'regular' | 'devoted' | 'grownUp' | 'elder' | 'collector'

// Your lifetime, as the achievements read it.
export type Lifetime = {
  // Every buddy's counts summed, with the longest turn the longest of any.
  counts: Counts
  // The longest run of rough turns a clean turn has ended, on any buddy.
  rough: number
  // The highest level any buddy has reached.
  topLevel: number
  bestStreak: number
  buddies: number
}

export type Achievement = { id: AchievementId; title: string; hat?: EarnedHat; met: (l: Lifetime) => boolean }

const MINUTE = 60_000

// In the order they are listed, announced and counted. The ids are saved, so they never change.
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'shell', title: 'Shell regular', hat: 'hardhat', met: l => l.counts.calls.shell >= 500 },
  { id: 'editor', title: 'Editor', met: l => l.counts.calls.edit >= 1_000 },
  { id: 'bookworm', title: 'Bookworm', met: l => l.counts.calls.read >= 5_000 },
  { id: 'researcher', title: 'Researcher', met: l => l.counts.calls.web >= 100 },
  { id: 'manager', title: 'Manager', met: l => l.counts.calls.agent >= 100 },
  { id: 'thousandTurns', title: 'Thousand turns', met: l => l.counts.turns >= 1_000 },
  { id: 'marathon', title: 'Marathon', met: l => l.counts.longestTurnMs >= 10 * MINUTE },
  { id: 'ultramarathon', title: 'Ultramarathon', hat: 'nightcap', met: l => l.counts.longestTurnMs >= 30 * MINUTE },
  { id: 'survivor', title: 'Survivor', met: l => l.counts.failedTurns >= 100 },
  { id: 'comeback', title: 'Comeback', met: l => l.rough >= 5 },
  { id: 'goodFriend', title: 'Good friend', hat: 'flowercrown', met: l => l.counts.pets >= 100 },
  { id: 'chatterbox', title: 'Chatterbox', hat: 'headphones', met: l => l.counts.talks >= 50 },
  { id: 'regular', title: 'Regular', met: l => l.bestStreak >= 7 },
  { id: 'devoted', title: 'Devoted', hat: 'mortarboard', met: l => l.bestStreak >= 30 },
  { id: 'grownUp', title: 'Grown up', met: l => l.topLevel >= ADULT_LEVEL },
  { id: 'elder', title: 'Elder', hat: 'laurel', met: l => l.topLevel >= ELDER_LEVEL },
  { id: 'collector', title: 'Collector', met: l => l.buddies >= 5 },
]

// What each earned hat is called in a sentence.
export const EARNED_HAT_NAME: Record<EarnedHat, string> = {
  hardhat: 'a hard hat',
  nightcap: 'a nightcap',
  flowercrown: 'a flower crown',
  headphones: 'headphones',
  mortarboard: 'a mortarboard',
  laurel: 'a laurel',
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function lifetime(saved: Saved): Lifetime {
  let counts = zeroCounts()
  let rough = 0
  let topLevel = 1
  for (const b of saved.buddies) {
    counts = addCounts(counts, safeCounts(b.counts))
    rough = Math.max(rough, n(b.bests?.rough))
    topLevel = Math.max(topLevel, levelOf(b.counts))
  }
  return { counts, rough, topLevel, bestStreak: n(saved.you.bestStreak), buddies: saved.buddies.length }
}

// Your earned achievements by id. A field that isn't a plain object reads as none.
export function earnedOf(you: You): Readonly<Record<string, string>> {
  const e: unknown = you.earned
  return typeof e === 'object' && e !== null && !Array.isArray(e) ? (e as Record<string, string>) : {}
}

// Earns every achievement met and not yet earned, dated `now`. Returns `saved` itself when there
// is none, so a caller can tell nothing changed. A damaged `earned` is replaced.
export function earn(saved: Saved, now: number): Saved {
  const had = earnedOf(saved.you)
  const life = lifetime(saved)
  const fresh = ACHIEVEMENTS.filter(a => !Object.hasOwn(had, a.id) && a.met(life))
  if (fresh.length === 0) return saved
  const at = new Date(now).toISOString()
  return { ...saved, you: { ...saved.you, earned: { ...had, ...Object.fromEntries(fresh.map(a => [a.id, at])) } } }
}

// The achievements this build knows that you've earned, in table order. A newer build's id is skipped.
export function knownEarned(you: You): Achievement[] {
  const had = earnedOf(you)
  return ACHIEVEMENTS.filter(a => Object.hasOwn(had, a.id))
}

// The hats you've earned, in table order.
export function earnedHats(you: You): EarnedHat[] {
  return knownEarned(you).flatMap(a => (a.hat ? [a.hat] : []))
}
```

- [ ] **Step 6: `grewMoments` in `progress.ts`**

In `buddy/hooks/progress.ts`, replace
```ts
import type { Counts, Stage } from '../types'
```
with:
```ts
import type { Counts, Moment, Stage } from '../types'
```
and append:
```ts
// A `grew` moment for each stage a save's counts carry a buddy into: 1 for adult, 2 for elder.
export function grewMoments(before: unknown, after: unknown, now: number): Moment[] {
  const from = STAGES.indexOf(stageOf(levelOf(before)))
  const to = STAGES.indexOf(stageOf(levelOf(after)))
  const at = new Date(now).toISOString()
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => ({ at, kind: 'grew' as const, n: from + 1 + i }))
}
```

- [ ] **Step 7: `grew` in `journal.ts`**

In `buddy/hooks/journal.ts`, replace
```ts
  away: true,
} satisfies Record<MomentKind, true>
```
with:
```ts
  away: true,
  grew: true,
} satisfies Record<MomentKind, true>
```
Replace
```ts
    case 'away':
      return `back after ${n} days away`
```
with:
```ts
    case 'away':
      return `back after ${n} days away`
    case 'grew':
      return m.n >= 2 ? 'grew into an elder' : 'grew into an adult'
```

- [ ] **Step 8: Earning and growing in `record.ts`**

In `buddy/hooks/record.ts`, replace
```ts
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
```
with:
```ts
import { earn } from './achievements'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
```
Replace
```ts
import { applyMood, sulkFor, withSulk } from './mood'
```
with:
```ts
import { applyMood, sulkFor, withSulk } from './mood'
import { grewMoments } from './progress'
```
Replace
```ts
        const moments = [...noticed.moments, ...milestones(b.counts, counts, now)]
```
with:
```ts
        const moments = [...noticed.moments, ...milestones(b.counts, counts, now), ...grewMoments(b.counts, counts, now)]
```
Replace
```ts
      return added || arrived !== saved ? { ...arrived, buddies } : null
```
with:
```ts
      // Achievements are judged last, on every buddy's new totals (Progression spec section 4).
      return added || arrived !== saved ? earn({ ...arrived, buddies }, now) : null
```
Replace
```ts
      const arrived = arrive(saved, now)
      return arrived !== saved ? arrived : null
```
with:
```ts
      const arrived = arrive(saved, now)
      return arrived !== saved ? earn(arrived, now) : null
```

- [ ] **Step 9: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 271 pass, 0 fail.

- [ ] **Step 10: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/sprites.ts buddy/hooks/sprites.test.ts buddy/hooks/achievements.ts buddy/hooks/achievements.test.ts buddy/hooks/progress.ts buddy/hooks/progress.test.ts buddy/hooks/journal.ts buddy/hooks/journal.test.ts buddy/hooks/record.ts buddy/hooks/record.test.ts
git commit -F - <<'EOF'
feat: achievements earned across every buddy, earned-only hats, and growing up in the journal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Announcements

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/achievements.ts`, `buddy/hooks/achievements.test.ts`
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/voice.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 2's `ACHIEVEMENTS`, `EARNED_HAT_NAME`, `earnedOf`, `knownEarned`; Task 1's `levelOf`, `stageOf`.
- Produces:
  - `news?: true` on `Bubble`
  - `News = { level: number | null; stage: Stage | null; earned: AchievementId[] }` and `newsOf(before: Saved | null, after: Saved): News | null` in `achievements.ts`
  - `newsLine(news: News): string` in `voice.ts`
  - `register.tsx`: `newsUp($)` and `announce($, before, after)`, called from `commitNow`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/achievements.test.ts`, replace
```ts
import { ACHIEVEMENTS, earn, earnedHats, earnedOf, knownEarned, lifetime } from './achievements'
```
with:
```ts
import { ACHIEVEMENTS, earn, earnedHats, earnedOf, knownEarned, lifetime, newsOf } from './achievements'
```
and append:
```ts
test('news: the level that rose, the stage with it, and what was newly earned, in table order', () => {
  const at = (turns: number, done: Record<string, string> = {}) => record([buddy('a', { turns })], { earned: done })
  // 810 turns are 8,100 XP, level 10; 1,210 are 12,100 XP, level 12.
  expect(newsOf(at(809), at(810, { grownUp: AT }))).toEqual({ level: 10, stage: 'adult', earned: ['grownUp'] })
  expect(newsOf(at(810), at(1_210))).toEqual({ level: 12, stage: null, earned: [] })
  expect(newsOf(at(810), at(811))).toBeNull()
  expect(newsOf(null, at(810))).toBeNull()
  // A different active buddy: a reroll or a swap is no level-up.
  const other = record([buddy('a', { turns: 1_210 }), buddy('b')])
  expect(newsOf(at(810), other)).toBeNull()
  // Only achievements this build knows, in table order, and only new ones.
  expect(newsOf(at(0, { shell: AT }), at(0, { shell: AT, party: AT, devoted: AT, marathon: AT }))).toEqual({
    level: null,
    stage: null,
    earned: ['marathon', 'devoted'],
  })
})
```

In `buddy/hooks/voice.test.ts`, replace
```ts
import { rollBones } from './roll'
```
with:
```ts
import type { News } from './achievements'
import { rollBones } from './roll'
```
Replace
```ts
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, parseSoul, personaSystem,
```
with:
```ts
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, newsLine, parseSoul, personaSystem,
```
and append:
```ts
test('an announcement reads the level, the stage, then what was earned and any hats', () => {
  const news = (o: Partial<News>): News => ({ level: null, stage: null, earned: [], ...o })
  expect(newsLine(news({ level: 12 }))).toBe('Level 12!')
  expect(newsLine(news({ level: 10, stage: 'adult' }))).toBe('Level 10! I grew into an adult.')
  expect(newsLine(news({ level: 30, stage: 'elder' }))).toBe("Level 30! I'm an elder now.")
  expect(newsLine(news({ earned: ['marathon'] }))).toBe('Earned Marathon.')
  expect(newsLine(news({ earned: ['marathon', 'survivor'] }))).toBe('Earned Marathon and Survivor.')
  expect(newsLine(news({ earned: ['marathon', 'survivor', 'comeback'] }))).toBe('Earned Marathon, Survivor and Comeback.')
  expect(newsLine(news({ earned: ['shell'] }))).toBe('Earned Shell regular, and a hard hat.')
  expect(newsLine(news({ earned: ['ultramarathon', 'elder'] }))).toBe(
    'Earned Ultramarathon and Elder, and a nightcap and a laurel.',
  )
  expect(newsLine(news({ level: 10, stage: 'adult', earned: ['grownUp'] }))).toBe(
    'Level 10! I grew into an adult. Earned Grown up.',
  )
})
```

Append to `buddy/hooks/buddy.test.tsx`:
```tsx
// SAVED's buddy one turn short of level 10, on its first visit, so no streak greeting takes the bubble.
const NEARLY: Saved = {
  ...SAVED,
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
}
const CONFETTI_ROWS = [' *  .  *  . ', ' .  *  .  * ']
const NEWS_10 = 'Level 10! I grew into an adult. Earned Grown up.'

test('the turn that reaches level 10 is announced once, under confetti, and saved as growing up', async ($, on) => {
  const shared = sharedStore(on, NEARLY)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  expect(CONFETTI_ROWS).toContain((await drawnSprite(ui))[0])
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 10  common ghost  ' })).toBeDefined()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'grew', n: 1 }])
  expect((shared.row as Saved).you.earned).toEqual({ grownUp: new Date(NOON).toISOString() })
  // The next turn crosses nothing and says nothing.
  await clock.advance(30_000)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
})

test('muted, an announcement is confetti with no words', async ($, on) => {
  const shared = sharedStore(on, { ...NEARLY, mode: 'muted' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  expect(CONFETTI_ROWS).toContain((await drawnSprite(ui))[0])
  expect((shared.row as Saved).you.earned).toEqual({ grownUp: new Date(NOON).toISOString() })
})

test('a level another session reached is not announced here', async ($, on) => {
  const shared = sharedStore(on, NEARLY)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // Another session saves the turn that reaches level 10, and what it earned.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.counts.turns = 810
  theirs.you.earned = { grownUp: new Date(NOON).toISOString() }
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(811)
  expect(await bubbleOf(ui)).toBe('')
  expect(CONFETTI_ROWS).not.toContain((await drawnSprite(ui))[0])
})

test('a quip that comes back over an announcement is dropped; a pet reply is not', async ($, on) => {
  const clock = world(on, { buddy: NEARLY })
  engineBelow(on)
  const prompts = model(on, null, 'Nice.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  // Past the failed call's flinch, whose frame has a row that reads like a bubble row.
  await clock.advance(2_000)
  // The failed call made the turn notable, so a quip was asked for; the news kept the bubble.
  expect(prompts.filter(p => p.startsWith('Claude just finished a turn'))).toHaveLength(1)
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  await runner($)('pet')
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Nice.')
})

test('a visit that earns something says so in place of the streak greeting', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6 } } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Earned Regular.')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `achievements.test.ts` and `voice.test.ts` fail to load (no `newsOf`, no `newsLine`), and the five new mod tests fail. The rest pass.

- [ ] **Step 3: The news flag on a bubble**

In `buddy/types/index.d.ts`, replace
```ts
export type Bubble = { text: string; fromTick: number; untilTick: number }
```
with:
```ts
// `news` marks an announcement (Progression spec section 4): a quip never replaces one.
export type Bubble = { text: string; fromTick: number; untilTick: number; news?: true }
```

- [ ] **Step 4: `newsOf` in `achievements.ts`**

In `buddy/hooks/achievements.ts`, replace
```ts
import type { Counts, Saved, You } from '../types'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, levelOf, safeCounts } from './progress'
```
with:
```ts
import type { Counts, Saved, Stage, You } from '../types'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, levelOf, safeCounts, stageOf } from './progress'
```
and append:
```ts
// What a commit changed worth saying (Progression spec section 4): the active buddy's new level,
// its new stage when that rose too, and what was newly earned, in table order.
export type News = { level: number | null; stage: Stage | null; earned: AchievementId[] }

// Null when nothing rose, on a first hatch, or when the active buddy changed (a reroll or a swap).
export function newsOf(before: Saved | null, after: Saved): News | null {
  if (!before || before.active !== after.active) return null
  const countsOf = (s: Saved) => s.buddies.find(b => b.seed === s.active)?.counts
  const was = levelOf(countsOf(before))
  const is = levelOf(countsOf(after))
  const level = is > was ? is : null
  const stage = level !== null && stageOf(is) !== stageOf(was) ? stageOf(is) : null
  const had = earnedOf(before.you)
  const earned = knownEarned(after.you)
    .filter(a => !Object.hasOwn(had, a.id))
    .map(a => a.id)
  return level === null && earned.length === 0 ? null : { level, stage, earned }
}
```

- [ ] **Step 5: `newsLine` in `voice.ts`**

In `buddy/hooks/voice.ts`, replace
```ts
import type { Mode, Soul, TurnReason, You } from '../types'
import { STATS, rngFor } from './roll'
```
with:
```ts
import type { Mode, Soul, TurnReason, You } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME } from './achievements'
import type { News } from './achievements'
import { STATS, rngFor } from './roll'
```
and append:
```ts
// "a", "a and b", "a, b and c".
function listOf(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

// An announcement, said with no model call (Progression spec section 4): the level, the stage it
// brought, then what was earned and any hats it unlocked.
export function newsLine(news: News): string {
  const parts: string[] = []
  if (news.level !== null) parts.push(`Level ${news.level}!`)
  if (news.stage === 'adult') parts.push('I grew into an adult.')
  if (news.stage === 'elder') parts.push("I'm an elder now.")
  const got = ACHIEVEMENTS.filter(a => news.earned.includes(a.id))
  if (got.length > 0) {
    const hats = got.flatMap(a => (a.hat ? [EARNED_HAT_NAME[a.hat]] : []))
    parts.push(`Earned ${listOf(got.map(a => a.title))}${hats.length > 0 ? `, and ${listOf(hats)}` : ''}.`)
  }
  return parts.join(' ')
}
```

- [ ] **Step 6: Announce from `commitNow`**

In `buddy/hooks/register.tsx`:

Replace
```ts
import type { Buddy, Counts, Moment, MoodEvent, Saved, TurnFacts } from '../types'
```
with:
```ts
import type { Buddy, Counts, Moment, MoodEvent, Saved, TurnFacts } from '../types'
import { newsOf } from './achievements'
```
Replace
```ts
  matchAddress,
  parseSoul,
```
with:
```ts
  matchAddress,
  newsLine,
  parseSoul,
```
Replace
```ts
  const saved = applyChange(base.kind === 'ok' ? base.saved : null, change, await $.clock.now())
  if (!saved) return null
  await adopt($, saved)
```
with:
```ts
  const before = base.kind === 'ok' ? base.saved : null
  const saved = applyChange(before, change, await $.clock.now())
  if (!saved) return null
  await adopt($, saved)
  // Only the session whose commit made the change announces it, whether or not the write lands.
  await announce($, before, saved)
```
Replace
```ts
async function showBubble($: EngineInterface, text: string) {
  const now = await read($, tick)
  await update($, bubble, () => ({ text, fromTick: now, untilTick: now + bubbleTicks(text) }))
}
```
with:
```ts
async function showBubble($: EngineInterface, text: string) {
  const now = await read($, tick)
  await update($, bubble, () => ({ text, fromTick: now, untilTick: now + bubbleTicks(text) }))
}

// An announcement is up: the bubble is news and still showing.
async function newsUp($: EngineInterface): Promise<boolean> {
  const said = await read($, bubble)
  return said !== null && said.news === true && (await read($, tick)) < said.untilTick
}

// What a commit changed worth saying (Progression spec section 4): a celebration, and a canned
// line unless muted. A throw costs only the announcement; the card shows the news either way.
async function announce($: EngineInterface, before: Saved | null, after: Saved) {
  try {
    const news = newsOf(before, after)
    if (!news || after.mode === 'off') return
    await feel($, [], 'celebrate')
    if (after.mode !== 'on') return
    const text = newsLine(news)
    const now = await read($, tick)
    await update($, bubble, () => ({ text, fromTick: now, untilTick: now + bubbleTicks(text), news: true as const }))
  } catch {
    // Nothing to undo.
  }
}
```
Replace
```ts
  if (after && shouldGreet({ mode: after.mode, dayBefore, you: after.you })) {
```
with:
```ts
  // A visit that earned something has already said so.
  if (after && shouldGreet({ mode: after.mode, dayBefore, you: after.you }) && !(await newsUp($))) {
```
Replace
```ts
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
  if (text) await showBubble($, text)
```
with:
```ts
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
  // An announcement keeps the bubble: a quip that comes back over one is dropped.
  if (text && !(await newsUp($))) await showBubble($, text)
```

- [ ] **Step 7: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 278 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/achievements.ts buddy/hooks/achievements.test.ts buddy/hooks/voice.ts buddy/hooks/voice.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: level-ups, growing up and achievements announced by the session that saved them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The card shows the level, the XP bar and your achievements

**Files:**
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/card.ts`, `buddy/hooks/card.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MAX_LEVEL`, `levelOf`, `stageOf`, `xpForLevel`, `xpOf`; Task 2's `ACHIEVEMENTS`, `earnedOf`, `knownEarned`.
- Produces, in `layout.ts`:
  - type `CardProgress = { level: number; stage: Stage; xp: number; earned: readonly string[]; retiredAt: string | null }` (`earned` holds titles, newest first)
  - `cardProgress(saved: Saved, buddy: Buddy): CardProgress`
  - `levelText(p: Pick<CardProgress, 'level' | 'stage' | 'xp'>): string`
  - `achievementsText(earned: number): string`
  - `cardLines(soul, bones, rerolls, progress?: CardProgress)`: the level line second, and `   Retired YYYY-MM-DD` on the hatch line of a retired buddy
- And in `card.ts`: `cardSvg(soul, bones, rerolls, history?, progress?)` and `cardAlt(soul, bones, rerolls, history?, progress?)`.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/layout.test.ts`, replace
```ts
import type { Moment } from '../types'
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, bandRows, bubbleRows, bubbleWidth, cardLines, compactLine, isCompact,
  journalLines, journalRows, nameLine, pageAt, paintRuns, rightRuns, spriteTint, streakLine, wrap,
} from './layout'
```
with:
```ts
import type { Moment, Saved } from '../types'
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, isCompact, journalLines, journalRows, levelText, nameLine, pageAt, paintRuns, rightRuns, spriteTint,
  streakLine, wrap,
} from './layout'
```
and append:
```ts
test('the level reads with the XP for the next one, and the text card keeps to 12 lines with it', () => {
  expect(levelText({ level: 12, stage: 'adult', xp: 13_250 })).toBe('Lv 12 adult · 13,250 / 14,400 xp')
  expect(levelText({ level: 99, stage: 'elder', xp: 1_034_500 })).toBe('Lv 99 elder · 1,034,500 xp')
  expect(achievementsText(7)).toBe('Achievements: 7 of 17')
  const progress = { level: 12, stage: 'adult' as const, xp: 13_250, earned: [], retiredAt: '2026-10-09T08:00:00.000Z' }
  const you = { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }
  const card = [...cardLines(SOUL, rollBones('layout-seed'), 2, progress), streakLine(you, zeroCounts()), achievementsText(0)]
  expect(card).toHaveLength(12)
  expect(card[1]).toBe('Lv 12 adult · 13,250 / 14,400 xp')
  expect(card[9]).toBe('Hatched 2026-10-07   Rerolls: 2   Retired 2026-10-09')
})

test("a card's progress: the level from the buddy's own counts, and your achievements newest first", () => {
  const buddy = { seed: 'layout-seed', soul: SOUL, retiredAt: null, counts: { ...zeroCounts(), turns: 1_210 } }
  const saved: Saved = {
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'layout-seed',
    buddies: [buddy],
    you: {
      lastDay: '2026-10-07',
      streak: 1,
      bestStreak: 1,
      days: 1,
      earned: {
        marathon: '2026-10-05T12:00:00.000Z',
        survivor: '2026-10-06T12:00:00.000Z',
        shell: '2026-10-06T12:00:00.000Z',
        party: '2026-10-07T12:00:00.000Z',
      },
    },
  }
  // Two earned the same day keep table order; a newer build's id is left out.
  expect(cardProgress(saved, buddy)).toEqual({
    level: 12,
    stage: 'adult',
    xp: 12_100,
    earned: ['Shell regular', 'Survivor', 'Marathon'],
    retiredAt: null,
  })
})
```

In `buddy/hooks/card.test.ts`, replace
```ts
import { cardAlt, cardSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
```
with:
```ts
import { ACHIEVEMENTS } from './achievements'
import { cardAlt, cardSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import type { CardProgress } from './layout'
```
and append:
```ts
const PROGRESS: CardProgress = { level: 12, stage: 'adult', xp: 13_250, earned: ['Marathon', 'Shell regular'], retiredAt: null }
const heightOf = (svg: string) => Number(/height="(\d+)"/.exec(svg)?.[1])

test('given its progress, the card shows the level, an XP bar part full, and the achievements', () => {
  const svg = cardSvg(SOUL, BONES, 0, undefined, PROGRESS)
  expect(svg).toContain('>Lv 12 adult</text>')
  expect(svg).toContain('>13,250 / 14,400 xp</text>')
  // 13,250 is 1,150 of the 2,300 XP from level 12 to 13: half of the 372 px bar.
  expect(svg).toContain('width="186.0" height="6"')
  expect(svg).toContain('>Achievements 2 of 17</text>')
  expect(svg.indexOf('>Marathon</text>')).toBeLessThan(svg.indexOf('>Shell regular</text>'))
  expect(cardAlt(SOUL, BONES, 0, undefined, PROGRESS)).toBe(
    'Nib, uncommon mushroom, 2 stars. "Speaks rarely, mostly in proverbs." Propeller hat, ✦ eyes. ' +
      `${statAlt(BONES)}. Level 12, adult, 13,250 of 14,400 XP. 2 of 17 achievements: Marathon, Shell regular. ` +
      'Hatched Oct 7, 2026. Rerolls 0.',
  )
})

test('the XP bar is empty at the start of a level, and full at 99 with no next level', () => {
  expect(cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, xp: 12_100 })).toContain('width="0.0" height="6"')
  const top = { ...PROGRESS, level: 99, stage: 'elder' as const, xp: 1_034_500, earned: [] }
  const svg = cardSvg(SOUL, BONES, 0, undefined, top)
  expect(svg).toContain('>1,034,500 xp</text>')
  expect(svg).toContain('width="372.0" height="6"')
  expect(cardAlt(SOUL, BONES, 0, undefined, top)).toContain('Level 99, elder, 1,034,500 XP. 0 of 17 achievements. Hatched')
})

test('a retired buddy says when it retired, and achievement titles are escaped', () => {
  const retired = { ...PROGRESS, earned: ['<b>'], retiredAt: '2026-10-09T08:00:00.000Z' }
  const svg = cardSvg(SOUL, BONES, 0, undefined, retired)
  expect(svg).toContain('>Retired Oct 9, 2026</text>')
  expect(svg).toContain('>&lt;b&gt;</text>')
  expect(cardAlt(SOUL, BONES, 0, undefined, retired)).toContain('Hatched Oct 7, 2026. Retired Oct 9, 2026. Rerolls 0.')
})

test('the card grows with its chips, and progress adds 70 px under the last row', () => {
  const none = cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, earned: [] })
  const all = cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, earned: ACHIEVEMENTS.map(a => a.title) })
  expect(heightOf(all)).toBeGreaterThan(heightOf(none) + 60)
  expect(heightOf(none)).toBe(heightOf(cardSvg(SOUL, BONES, 0)) + 70)
})
```

In `buddy/hooks/buddy.test.tsx`, replace
```ts
  expect(card).toMatch(/Streak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
```
with:
```ts
  expect(card).toMatch(/^Streak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/m)
```
Replace
```ts
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
```
with:
```ts
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/)
```
and append:
```tsx
test('the card shows the level, the XP to the next one, and your achievements, on every surface', async ($, on) => {
  // 500 turns and 7,100 MCP calls are 12,100 XP, level 12, with no turn or call achievement.
  const grown: Saved = {
    ...SAVED,
    buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 500, calls: { ...zeroCounts().calls, mcp: 7_100 } } }],
    you: { ...SAVED.you, earned: { grownUp: '2026-10-04T12:00:00.000Z', marathon: '2026-10-05T12:00:00.000Z' } },
  }
  const clock = world(on, { buddy: grown })
  await $.session.start(START)
  await clock.settle()
  const text = await cardText($)
  expect(text).toContain('\nLv 12 adult · 12,100 / 14,400 xp\n')
  expect(text).toMatch(/\nAchievements: 2 of 17\nMarathon · Grown up$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toContain('. Level 12, adult, 12,100 of 14,400 XP. 2 of 17 achievements: Marathon, Grown up. Hatched')
  expect(String(svg?.props.source)).toContain('>Lv 12 adult</text>')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `layout.test.ts` and `card.test.ts` fail to load (no `levelText`, no `CardProgress`), and the three card mod tests fail. The rest pass.

- [ ] **Step 3: The card's progress in `layout.ts`**

In `buddy/hooks/layout.ts`, replace
```ts
import type { Counts, Moment, Soul, You } from '../types'
import { ageText, momentText, readable } from './journal'
```
with:
```ts
import type { Buddy, Counts, Moment, Saved, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { ageText, momentText, readable } from './journal'
```
Replace
```ts
import { totalCalls, withCommas } from './ledger'
```
with:
```ts
import { totalCalls, withCommas } from './ledger'
import { MAX_LEVEL, levelOf, stageOf, xpForLevel, xpOf } from './progress'
```
Replace
```ts
export function cardLines(soul: Soul, bones: Bones, rerolls: number): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
    `Hat: ${bones.hat}   Eyes: ${bones.eye}`,
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}`,
  ]
}
```
with:
```ts
// The shown buddy's growth and your achievements, for the card (Progression spec section 6).
export type CardProgress = {
  level: number
  stage: Stage
  xp: number
  // Earned achievement titles, newest first.
  earned: readonly string[]
  // When the shown buddy was retired; null for the active one.
  retiredAt: string | null
}

export function cardProgress(saved: Saved, buddy: Buddy): CardProgress {
  const level = levelOf(buddy.counts)
  const had = earnedOf(saved.you)
  const when = (id: string) => String(had[id])
  // Newest first; the sort is stable, so two earned together keep table order.
  const earned = knownEarned(saved.you)
    .sort((a, b) => (when(b.id) > when(a.id) ? 1 : when(b.id) < when(a.id) ? -1 : 0))
    .map(a => a.title)
  return { level, stage: stageOf(level), xp: xpOf(buddy.counts), earned, retiredAt: buddy.retiredAt }
}

// "Lv 12 adult · 12,345 / 14,400 xp": the XP so far over the XP for the next level.
export function levelText(p: Pick<CardProgress, 'level' | 'stage' | 'xp'>): string {
  const next = p.level < MAX_LEVEL ? ` / ${withCommas(xpForLevel(p.level + 1))}` : ''
  return `Lv ${p.level} ${p.stage} · ${withCommas(p.xp)}${next} xp`
}

export function achievementsText(earned: number): string {
  return `Achievements: ${earned} of ${ACHIEVEMENTS.length}`
}

export function cardLines(soul: Soul, bones: Bones, rerolls: number, progress?: CardProgress): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  const retired = progress?.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
    ...(progress ? [levelText(progress)] : []),
    `Hat: ${bones.hat}   Eyes: ${bones.eye}`,
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}${retired}`,
  ]
}
```

- [ ] **Step 4: The growth rows in `card.ts`**

In `buddy/hooks/card.ts`, replace
```ts
import type { Counts, Soul, You } from '../types'
import { countsText, emptyJournal, journalHeader, streakLine, streakText, wrap } from './layout'
import type { JournalRow } from './layout'
```
with:
```ts
import type { Counts, Soul, You } from '../types'
import { ACHIEVEMENTS } from './achievements'
import { countsText, emptyJournal, journalHeader, streakLine, streakText, wrap } from './layout'
import type { CardProgress, JournalRow } from './layout'
import { withCommas } from './ledger'
import { MAX_LEVEL, xpForLevel } from './progress'
```
Replace
```ts
export function cardSvg(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory): string {
```
with:
```ts
export function cardSvg(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
```
Replace
```ts
  return framed(color, foot + (history ? 58 : 38), marks)
}
```
with:
```ts
  if (progress?.retiredAt) {
    marks.push(
      `<text x="${MID}" y="${foot + 22}" text-anchor="middle" font-size="12" fill="${INK}">Retired ${hatchDay(progress.retiredAt)}</text>`,
    )
  }

  const last = foot + (history ? 42 : 22)
  return framed(color, (progress ? growthMarks(marks, color, progress, last) : last) + 16, marks)
}

// The level, its XP bar and your achievements under the card's last row, whose baseline is at
// `last` (Progression spec section 6). Pushes onto `marks` and returns the new last baseline.
function growthMarks(marks: string[], color: string, p: CardProgress, last: number): number {
  const span = W - 2 * PAD
  const levelY = last + 30
  const barY = levelY + 10
  const from = xpForLevel(p.level)
  const to = p.level < MAX_LEVEL ? xpForLevel(p.level + 1) : from
  const filled = to > from ? Math.min(1, Math.max(0, (p.xp - from) / (to - from))) : 1
  const label = p.level < MAX_LEVEL ? `${withCommas(p.xp)} / ${withCommas(to)} xp` : `${withCommas(p.xp)} xp`
  marks.push(
    `<text x="${PAD}" y="${levelY}" font-size="13" font-weight="700" fill="${color}">Lv ${p.level} ${p.stage}</text>`,
    `<text x="${W - PAD}" y="${levelY}" text-anchor="end" font-size="12" fill="${INK}">${label}</text>`,
    `<rect x="${PAD}" y="${barY}" width="${span}" height="6" rx="3" fill="${color}" fill-opacity="0.15"/>`,
    `<rect x="${PAD}" y="${barY}" width="${(span * filled).toFixed(1)}" height="6" rx="3" fill="${color}"/>`,
  )
  const headY = barY + 30
  marks.push(
    `<text x="${PAD}" y="${headY}" font-size="12" fill="${INK}">Achievements ${p.earned.length} of ${ACHIEVEMENTS.length}</text>`,
  )
  // The earned ones as chips, newest first, wrapping at the right pad.
  let x = PAD
  let top = headY + 10
  for (const title of p.earned) {
    const w = title.length * 7 + 20
    if (x > PAD && x + w > W - PAD) {
      x = PAD
      top += 30
    }
    marks.push(
      `<rect x="${x}" y="${top}" width="${w}" height="22" rx="11" fill="${color}" fill-opacity="0.15"/>`,
      `<text x="${x + w / 2}" y="${top + 15}" text-anchor="middle" font-size="12" fill="${color}">${esc(title)}</text>`,
    )
    x += w + 8
  }
  return p.earned.length > 0 ? top + 22 : headY
}
```
Replace
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
with:
```ts
export function cardAlt(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
  const stars = RARITY[bones.rarity].stars
  return (
    `${soul.name}, ${bones.rarity} ${bones.species}, ${stars} star${stars === 1 ? '' : 's'}. ` +
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    (progress ? `${growthAlt(progress)} ` : '') +
    `Hatched ${hatchDay(soul.hatchedAt)}.` +
    (progress?.retiredAt ? ` Retired ${hatchDay(progress.retiredAt)}.` : '') +
    ` Rerolls ${rerolls}.` +
    (history ? ` ${streakLine(history.you, history.counts)}.` : '')
  )
}

// "Level 12, adult, 13,250 of 14,400 XP. 2 of 17 achievements: Marathon, Shell regular."
function growthAlt(p: CardProgress): string {
  const xp =
    p.level < MAX_LEVEL ? `${withCommas(p.xp)} of ${withCommas(xpForLevel(p.level + 1))} XP` : `${withCommas(p.xp)} XP`
  const earned = `${p.earned.length} of ${ACHIEVEMENTS.length} achievements${p.earned.length > 0 ? `: ${p.earned.join(', ')}` : ''}`
  return `Level ${p.level}, ${p.stage}, ${xp}. ${earned}.`
}
```

- [ ] **Step 5: The card pane and its text in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import {
  bandRows, cardLines, compactLine, emptyJournal, isCompact, journalHeader, journalLines, journalRows, nameLine, rightRuns,
  spriteTint, streakLine,
} from './layout'
```
with:
```ts
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, emptyJournal, isCompact, journalHeader, journalLines,
  journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
```
Replace
```ts
      return [...cardLines(buddy.soul, bones, saved.rerolls), streakLine(saved.you, await countsOf($, buddy))].join('\n')
```
with:
```ts
      const progress = cardProgress(saved, buddy)
      return [
        ...cardLines(buddy.soul, bones, saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, buddy)),
        achievementsText(progress.earned.length),
      ].join('\n')
```
Replace
```ts
      const bones = bonesFor(buddy)
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
with:
```ts
      const bones = bonesFor(buddy)
      const progress = cardProgress(saved, buddy)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return (
          <Svg
            source={cardSvg(buddy.soul, bones, saved.rerolls, history, progress)}
            alt={cardAlt(buddy.soul, bones, saved.rerolls, history, progress)}
          />
        )
      }
```
Replace
```tsx
            <Text {...tint(starColor)}>{'  ' + stars}</Text>
          </Box>
          <Text dimColor>
```
with:
```tsx
            <Text {...tint(starColor)}>{'  ' + stars}</Text>
          </Box>
          <Text>{levelText(progress)}</Text>
          <Text dimColor>
```
Replace
```tsx
      const footer = <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}`}</Text>
```
with:
```tsx
      const retired = progress.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
      const footer = (
        <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}${retired}`}</Text>
      )
```
Replace
```tsx
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
        </Box>
```
with:
```tsx
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
          <Text dimColor>{achievementsText(progress.earned.length)}</Text>
          {progress.earned.length > 0 ? [<Text>{progress.earned.join(' · ')}</Text>] : []}
        </Box>
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 285 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/card.ts buddy/hooks/card.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: the card shows the level, the XP to the next one, and your achievements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `/buddy dex`

**Files:**
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/card.ts`, `buddy/hooks/card.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 1's `bonesFor`, `levelOf`, `stageOf`; `faceFor` from `sprites.ts`.
- Produces:
  - from `record.ts`: type `Parsed = { sub: Sub }` (grown in Tasks 6 to 8); `parseSub(args): Parsed`; `'dex'` in `Sub`
  - from `layout.ts`: `longDate(iso)`, `shortDate(iso, year)`, type `DexRow = { number; name; bones: Bones; level; stage; dates; active }`, `DEX_TEXT_ROWS` (10), `dexRows(saved, now): DexRow[]`, `dexText(row, numberWidth): string`, `dexLines(saved, now): string[]`
  - from `card.ts`: `dexSvg(rows: readonly DexRow[]): string`, `dexAlt(rows): string`; the private `stillRows(bones)` the card and the dex share
  - `register.tsx`: `runBuddy($, parsed: Parsed)`; the `dex` subcommand and its pane

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
test('subcommands', () => {
  expect(parseSub('')).toBe('show')
  expect(parseSub('  pet ')).toBe('pet')
  expect(parseSub('CARD')).toBe('card')
  expect(parseSub('journal')).toBe('journal')
  expect(parseSub('journal all')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]')
  expect(parseSub('mute')).toBe('mute')
  expect(parseSub('unmute')).toBe('unmute')
  expect(parseSub('off')).toBe('off')
  expect(parseSub('reroll')).toBe('reroll')
  expect(parseSub('reroll confirm')).toBe('reroll-confirm')
  expect(parseSub('reroll now')).toBe('usage')
  expect(parseSub('pet twice')).toBe('usage')
  expect(parseSub('dance')).toBe('usage')
})

test('debug is a subcommand the usage line never mentions', () => {
  expect(parseSub('debug')).toBe('debug')
  expect(parseSub(' DEBUG off ')).toBe('debug-off')
  expect(parseSub('debug now')).toBe('usage')
  expect(USAGE).not.toMatch(/debug/)
})
```
with:
```ts
const sub = (args: string) => parseSub(args).sub

test('subcommands', () => {
  expect(parseSub('')).toEqual({ sub: 'show' })
  expect(sub('  pet ')).toBe('pet')
  expect(sub('CARD')).toBe('card')
  expect(sub('journal')).toBe('journal')
  expect(sub('dex')).toBe('dex')
  expect(sub('dex all')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card | journal | dex | mute | unmute | off | reroll [confirm]]')
  expect(sub('mute')).toBe('mute')
  expect(sub('unmute')).toBe('unmute')
  expect(sub('off')).toBe('off')
  expect(sub('reroll')).toBe('reroll')
  expect(sub('reroll confirm')).toBe('reroll-confirm')
  expect(sub('reroll now')).toBe('usage')
  expect(sub('pet twice')).toBe('usage')
  expect(sub('dance')).toBe('usage')
})

test('debug is a subcommand the usage line never mentions', () => {
  expect(parseSub('debug')).toEqual({ sub: 'debug' })
  expect(parseSub(' DEBUG off ')).toEqual({ sub: 'debug-off' })
  expect(parseSub('debug now')).toEqual({ sub: 'usage' })
  expect(USAGE).not.toMatch(/debug/)
})
```

In `buddy/hooks/layout.test.ts`, replace
```ts
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, isCompact, journalLines, journalRows, levelText, nameLine, pageAt, paintRuns, rightRuns, spriteTint,
  streakLine, wrap,
} from './layout'
```
with:
```ts
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, dexLines, dexRows, dexText, isCompact, journalLines, journalRows, levelText, longDate, nameLine, pageAt,
  paintRuns, rightRuns, shortDate, spriteTint, streakLine, wrap,
} from './layout'
```
and append:
```ts
// Pip, a common dragon ('swap-1') retired on Nov 2 at level 30, and Mochi, a common axolotl
// ('swap-2') here now at level 12.
const DEX_RECORD: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 1,
  active: 'swap-2',
  buddies: [
    { seed: 'swap-1', soul: SOUL, retiredAt: '2026-11-02T12:00:00.000Z', counts: { ...zeroCounts(), turns: 8_410 } },
    {
      seed: 'swap-2',
      soul: { ...SOUL, name: 'Mochi', hatchedAt: '2026-11-02T12:00:00.000Z' },
      retiredAt: null,
      counts: { ...zeroCounts(), turns: 1_210 },
    },
  ],
  you: { lastDay: '2026-11-03', streak: 1, bestStreak: 1, days: 1 },
}
const NOV3 = new Date(2026, 10, 3, 12).getTime()

test('dates read off the string, with the year only when it is not this one', () => {
  expect(longDate('2026-10-07T23:30:00.000Z')).toBe('Oct 7, 2026')
  expect(shortDate('2026-10-07T23:30:00.000Z', 2026)).toBe('Oct 7')
  expect(shortDate('2025-12-31T09:00:00.000Z', 2026)).toBe('Dec 31, 2025')
})

test('the dex lists every buddy in the order you had them, each at its own level and stage', () => {
  const rows = dexRows(DEX_RECORD, NOV3)
  expect(rows.map(r => [r.number, r.name, r.level, r.stage, r.dates, r.active])).toEqual([
    [1, 'Pip', 30, 'elder', 'Oct 7 – Nov 2', false],
    [2, 'Mochi', 12, 'adult', 'Nov 2 – now', true],
  ])
  expect(dexText(rows[0]!, 2)).toBe(`#1  (×vv×)  ${'Pip'.padEnd(12)}  Lv 30 elder common dragon ★  Oct 7 – Nov 2`)
  expect(dexText(rows[1]!, 3)).toBe(`#2   }◉.◉{   ${'Mochi'.padEnd(12)}  Lv 12 adult common axolotl ★  Nov 2 – now`)
})

test('the text dex is a count, a note of any older ones, then at most the newest ten', () => {
  const many = (count: number): Saved => ({
    ...DEX_RECORD,
    active: `b${count - 1}`,
    buddies: Array.from({ length: count }, (_, i) => ({ ...DEX_RECORD.buddies[1]!, seed: `b${i}` })),
  })
  expect(dexLines(many(1), NOV3)[0]).toBe('Buddydex: 1 buddy')
  expect(dexLines(many(10), NOV3)).toHaveLength(11)
  const lines = dexLines(many(14), NOV3)
  expect(lines).toHaveLength(12)
  expect(lines.slice(0, 2)).toEqual(['Buddydex: 14 buddies', '…4 earlier'])
  expect(lines[2]).toMatch(/^#5 {3}/)
  expect(lines[11]).toMatch(/^#14 {2}.* – now$/)
})
```

In `buddy/hooks/card.test.ts`, replace
```ts
import { cardAlt, cardSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import type { CardProgress } from './layout'
```
with:
```ts
import type { Saved } from '../types'
import { cardAlt, cardSvg, dexAlt, dexSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import { dexRows } from './layout'
import type { CardProgress } from './layout'
```
and append:
```ts
// Pip, a common dragon retired on Nov 2 at level 30, and Mochi, a common axolotl here now at level 12.
const DEX_RECORD: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 1,
  active: 'swap-2',
  buddies: [
    {
      seed: 'swap-1',
      soul: { ...SOUL, name: 'Pip' },
      retiredAt: '2026-11-02T12:00:00.000Z',
      counts: { ...zeroCounts(), turns: 8_410 },
    },
    {
      seed: 'swap-2',
      soul: { ...SOUL, name: 'Mochi', hatchedAt: '2026-11-02T12:00:00.000Z' },
      retiredAt: null,
      counts: { ...zeroCounts(), turns: 1_210 },
    },
  ],
  you: { lastDay: '2026-11-03', streak: 1, bestStreak: 1, days: 1 },
}
const NOV3 = new Date(2026, 10, 3, 12).getTime()

test('the dex is a tile per buddy, three across, the active one outlined; its alt reads them out', () => {
  const rows = dexRows(DEX_RECORD, NOV3)
  const svg = dexSvg(rows)
  expect(svg).toContain('>Buddydex</text>')
  expect(svg).toContain('>#1 Pip</text>')
  expect(svg).toContain('>elder dragon</text>')
  expect(svg).toContain('>Oct 7 – Nov 2</text>')
  expect(svg).toContain('>#2 Mochi</text>')
  // The frame and the active tile are the only outlines.
  expect(svg.match(/stroke-width="2"/g)).toHaveLength(2)
  // A fourth buddy starts a second row of tiles, 146 px down.
  expect(heightOf(dexSvg([...rows, ...rows]))).toBe(heightOf(svg) + 146)
  expect(dexSvg([{ ...rows[0]!, name: '<Pip>' }])).toContain('>#1 &lt;Pip&gt;</text>')
  expect(dexAlt(rows)).toBe(
    'Buddydex, 2 buddies. Number 1, Pip, level 30 elder common dragon, Oct 7 to Nov 2. ' +
      'Number 2, Mochi, level 12 adult common axolotl, Nov 2 to now.',
  )
})
```

Append to `buddy/hooks/buddy.test.tsx`:
```tsx
// Pip, a common dragon ('swap-1') retired two days ago, and Mochi, a common axolotl ('swap-2'), here now.
const TWO: Saved = {
  ...SAVED,
  rerolls: 1,
  active: 'swap-2',
  buddies: [
    {
      seed: 'swap-1',
      soul: { ...RECORD.soul, hatchedAt: '2026-10-01T12:00:00.000Z' },
      retiredAt: '2026-10-05T12:00:00.000Z',
      counts: zeroCounts(),
    },
    {
      seed: 'swap-2',
      soul: { ...RECORD.soul, name: 'Mochi', hatchedAt: '2026-10-05T12:00:00.000Z' },
      retiredAt: null,
      counts: zeroCounts(),
    },
  ],
}
const dexPane = () => ({ ...pane(), requestId: 'dex', props: { ...pane().props, title: 'Buddydex' } })

test('dex opens a pane listing every buddy oldest first, the active one in bold, even while off', async ($, on) => {
  const clock = world(on, { buddy: { ...TWO, mode: 'off' } })
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('dex')).toBeUndefined()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...dexPane() })
  const texts = await terminal.findAll({ type: 'Text' })
  expect(texts.map(t => t.text)).toEqual([
    'Buddydex',
    `#1  (×vv×)  ${'Pip'.padEnd(12)}  Lv 1 hatchling common dragon ★  Oct 1 – Oct 5`,
    `#2  }◉.◉{   ${'Mochi'.padEnd(12)}  Lv 1 hatchling common axolotl ★  Oct 5 – now`,
  ])
  expect(texts.map(t => t.props.bold)).toEqual([true, false, true])
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...dexPane() })
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  expect(svgs[0]?.props.alt).toBe(
    'Buddydex, 2 buddies. Number 1, Pip, level 1 hatchling common dragon, Oct 1 to Oct 5. ' +
      'Number 2, Mochi, level 1 hatchling common axolotl, Oct 5 to now.',
  )
})

test('where no pane can be placed, dex prints a count and the newest ten', async ($, on) => {
  const many: Saved = {
    ...SAVED,
    active: 'b13',
    buddies: Array.from({ length: 14 }, (_, i) => ({
      ...SAVED.buddies[0]!,
      seed: `b${i}`,
      retiredAt: i === 13 ? null : '2026-10-06T12:00:00.000Z',
    })),
  }
  const clock = world(on, { buddy: many }, false)
  await $.session.start(START)
  await clock.settle()
  const lines = ((await runner($)('dex')) ?? '').split('\n')
  expect(lines).toHaveLength(12)
  expect(lines.slice(0, 2)).toEqual(['Buddydex: 14 buddies', '…4 earlier'])
  expect(lines[2]).toMatch(/^#5 /)
  expect(lines[11]).toMatch(/^#14 .* – now$/)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `layout.test.ts` and `card.test.ts` fail to load (no `dexRows`, no `dexSvg`), the two parse tests fail on the new shape, and the two dex mod tests fail. The rest pass.

- [ ] **Step 3: A structured `parseSub` with `dex`**

In `buddy/hooks/record.ts`, replace
```ts
export const USAGE = 'Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
export const USAGE = 'Usage: /buddy [pet | card | journal | dex | mute | unmute | off | reroll [confirm]]'
```
Replace
```ts
export type Sub =
  | 'show' | 'pet' | 'card' | 'journal' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug' | 'debug-off'
  | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'journal', 'mute', 'unmute', 'off']

export function parseSub(args: string): Sub {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [first, second] = words
  if (first === undefined) return 'show'
  if (first === 'reroll') {
    if (words.length === 1) return 'reroll'
    return words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage'
  }
  // Hidden: left out of USAGE, the argument hint and the README on purpose.
  if (first === 'debug') {
    if (words.length === 1) return 'debug'
    return words.length === 2 && second === 'off' ? 'debug-off' : 'usage'
  }
  return words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage'
}
```
with:
```ts
export type Sub =
  | 'show' | 'pet' | 'card' | 'journal' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug'
  | 'debug-off' | 'usage'

// A /buddy command as parsed: the subcommand, and what it was given (Progression spec section 7).
export type Parsed = { sub: Sub }

const SIMPLE: readonly string[] = ['pet', 'card', 'journal', 'dex', 'mute', 'unmute', 'off']

// Subcommand words match in any case; anything after them keeps the case it was typed in.
export function parseSub(args: string): Parsed {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.toLowerCase()
  const second = words[1]?.toLowerCase()
  if (first === undefined) return { sub: 'show' }
  if (first === 'reroll') {
    if (words.length === 1) return { sub: 'reroll' }
    return { sub: words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage' }
  }
  // Hidden: left out of USAGE, the argument hint and the README on purpose.
  if (first === 'debug') {
    if (words.length === 1) return { sub: 'debug' }
    return { sub: words.length === 2 && second === 'off' ? 'debug-off' : 'usage' }
  }
  return { sub: words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage' }
}
```

- [ ] **Step 4: Dates and dex rows in `layout.ts`**

In `buddy/hooks/layout.ts`, replace
```ts
import { MAX_LEVEL, levelOf, stageOf, xpForLevel, xpOf } from './progress'
import { PAINT } from './sprites'
```
with:
```ts
import { MAX_LEVEL, bonesFor, levelOf, stageOf, xpForLevel, xpOf } from './progress'
import { PAINT, faceFor } from './sprites'
```
and append:
```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-07T12:00:00.000Z" as "Oct 7, 2026", read off the string so no time zone moves the day.
export function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`
}

// "Oct 7", with its year only when that isn't `year`.
export function shortDate(iso: string, year: number): string {
  const [y, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}${y === year ? '' : `, ${y}`}`
}

// One buddy in the dex (Progression spec section 6).
export type DexRow = {
  // Its place in `buddies`, from 1. `buddies` only grows, so the number never changes.
  number: number
  name: string
  // Grown, for the portrait, the face, the rarity and the species.
  bones: Bones
  level: number
  stage: Stage
  // "Oct 7 – Nov 2", or "Oct 7 – now" for the active buddy.
  dates: string
  active: boolean
}

export const DEX_TEXT_ROWS = 10

export function dexRows(saved: Saved, now: number): DexRow[] {
  const year = new Date(now).getFullYear()
  return saved.buddies.map((b, i) => {
    const level = levelOf(b.counts)
    const active = b.seed === saved.active
    const end = active || b.retiredAt === null ? 'now' : shortDate(b.retiredAt, year)
    return {
      number: i + 1,
      name: b.soul.name,
      bones: bonesFor(b),
      level,
      stage: stageOf(level),
      dates: `${shortDate(b.soul.hatchedAt, year)} – ${end}`,
      active,
    }
  })
}

// One dex row as text, its number padded to `numberWidth`:
// "#1  (×vv×)  Pip           Lv 30 elder common dragon ★  Oct 7 – Nov 2".
export function dexText(row: DexRow, numberWidth: number): string {
  const b = row.bones
  return [
    `#${row.number}`.padEnd(numberWidth),
    faceFor(b.species, b.eye).padEnd(6),
    row.name.padEnd(12),
    `Lv ${row.level} ${row.stage} ${b.rarity} ${b.species} ${'★'.repeat(RARITY[b.rarity].stars)}`,
    row.dates,
  ].join('  ')
}

// The dex as text, where no pane is placed: the count, a note of any older ones, then the newest
// ten in dex order, inside the 12 lines the card's text keeps to.
export function dexLines(saved: Saved, now: number): string[] {
  const rows = dexRows(saved, now)
  const width = `#${rows.length}`.length
  const shown = rows.slice(-DEX_TEXT_ROWS)
  const earlier = rows.length - shown.length
  return [
    `Buddydex: ${rows.length} ${rows.length === 1 ? 'buddy' : 'buddies'}`,
    ...(earlier > 0 ? [`…${earlier} earlier`] : []),
    ...shown.map(row => dexText(row, width)),
  ]
}
```

- [ ] **Step 5: The dex drawn in `card.ts`**

In `buddy/hooks/card.ts`, delete
```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
```
and delete
```ts
// "2026-10-07T12:00:00.000Z" as "Oct 7, 2026", read off the string so no time zone moves the day.
function hatchDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`
}
```
then point every remaining call at the date's new home:
```bash
sed -i 's/hatchDay(/longDate(/g' buddy/hooks/card.ts
grep -c 'longDate(' buddy/hooks/card.ts
grep -c 'hatchDay' buddy/hooks/card.ts
```
Expected: `4`, then `0`: the hatch and retired dates in `cardSvg` and in `cardAlt`.

Replace
```ts
import { countsText, emptyJournal, journalHeader, streakLine, streakText, wrap } from './layout'
import type { CardProgress, JournalRow } from './layout'
```
with:
```ts
import { countsText, emptyJournal, journalHeader, longDate, streakLine, streakText, wrap } from './layout'
import type { CardProgress, DexRow, JournalRow } from './layout'
```
Replace
```ts
  // A still portrait: the resting frame, hat on, eyes open.
  const top = topRow({ hat: bones.hat, heartsFrame: null, sparkle: null })
  spriteRows({ species: bones.species, eye: bones.eye, frame: 0, top }).forEach((row, i) =>
```
with:
```ts
  stillRows(bones).forEach((row, i) =>
```
Replace
```ts
// The whole card, top to bottom: name and stars, kind, portrait, quote, chips, radar, history.
```
with:
```ts
// A still portrait: the resting frame, hat on, eyes open. The card and the dex draw it.
function stillRows(bones: Pick<Bones, 'species' | 'eye' | 'hat'>): string[] {
  const top = topRow({ hat: bones.hat, heartsFrame: null, sparkle: null })
  return spriteRows({ species: bones.species, eye: bones.eye, frame: 0, top })
}

// The whole card, top to bottom: name and stars, kind, portrait, quote, chips, radar, history.
```
and append:
```ts
// The dex's tiles: 3 across under the header.
const TILE_W = 118
const TILE_H = 136
const TILE_GAP = 9
const TILE_ROW = TILE_H + 10
const DEX_TOP = 64

// The dex as one SVG in the card's frame (Progression spec section 6): a tile per buddy, oldest
// first, each with its still portrait in its rarity color, the active one outlined.
export function dexSvg(rows: readonly DexRow[]): string {
  const lead = rows.find(r => r.active) ?? rows[0]
  const color = FILL[lead?.bones.rarity ?? 'common']
  const marks = [`<text x="${PAD}" y="44" font-size="22" font-weight="700" fill="${color}">Buddydex</text>`]
  rows.forEach((row, i) => {
    const x = PAD + (i % 3) * (TILE_W + TILE_GAP)
    const y = DEX_TOP + Math.floor(i / 3) * TILE_ROW
    const mid = x + TILE_W / 2
    const tint = FILL[row.bones.rarity]
    const outline = row.active ? ` stroke="${tint}" stroke-width="2"` : ''
    marks.push(
      `<rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" rx="10" fill="${tint}" fill-opacity="0.08"${outline}/>`,
    )
    stillRows(row.bones).forEach((line, j) =>
      marks.push(
        `<text x="${mid}" y="${y + 18 + j * 12}" text-anchor="middle" xml:space="preserve" ` +
          `font-family="ui-monospace, Consolas, monospace" font-size="11" fill="${row.bones.shiny ? SHINY : tint}">${esc(line)}</text>`,
      ),
    )
    marks.push(
      `<text x="${mid}" y="${y + 86}" text-anchor="middle" font-size="11" font-weight="700" fill="${tint}">${esc(`#${row.number} ${row.name}`)}</text>`,
      `<text x="${mid}" y="${y + 101}" text-anchor="middle" font-size="11" fill="${tint}">${'★'.repeat(RARITY[row.bones.rarity].stars)} Lv ${row.level}</text>`,
      `<text x="${mid}" y="${y + 115}" text-anchor="middle" font-size="11" fill="${INK}">${row.stage} ${row.bones.species}</text>`,
      `<text x="${mid}" y="${y + 129}" text-anchor="middle" font-size="10" fill="${INK}">${esc(row.dates)}</text>`,
    )
  })
  return framed(color, DEX_TOP + Math.max(1, Math.ceil(rows.length / 3)) * TILE_ROW + 14, marks)
}

export function dexAlt(rows: readonly DexRow[]): string {
  const each = rows.map(
    r =>
      `Number ${r.number}, ${r.name}, level ${r.level} ${r.stage} ${r.bones.rarity} ${r.bones.species}, ` +
      `${r.dates.replace(' – ', ' to ')}.`,
  )
  return [`Buddydex, ${rows.length} ${rows.length === 1 ? 'buddy' : 'buddies'}.`, ...each].join(' ')
}
```

- [ ] **Step 6: The `dex` subcommand and pane in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import { cardAlt, cardSvg, journalAlt, journalSvg, meter } from './card'
```
with:
```ts
import { cardAlt, cardSvg, dexAlt, dexSvg, journalAlt, journalSvg, meter } from './card'
```
Replace
```ts
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, emptyJournal, isCompact, journalHeader, journalLines,
  journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
```
with:
```ts
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, dexLines, dexRows, dexText, emptyJournal, isCompact,
  journalHeader, journalLines, journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
```
Replace
```ts
import type { Change, Stored, Sub } from './record'
```
with:
```ts
import type { Change, Parsed, Stored } from './record'
```
Replace
```ts
const JOURNAL = 'journal'
```
with:
```ts
const JOURNAL = 'journal'
const DEX = 'dex'
```
Replace
```ts
async function runBuddy($: EngineInterface, sub: Sub): Promise<string | undefined> {
  if (sub === 'usage') return USAGE
```
with:
```ts
async function runBuddy($: EngineInterface, parsed: Parsed): Promise<string | undefined> {
  const { sub } = parsed
  if (sub === 'usage') return USAGE
```
Replace
```ts
      return journalLines(name, buddy.journal, await $.clock.now()).join('\n')
    }
    case 'mute':
```
with:
```ts
      return journalLines(name, buddy.journal, await $.clock.now()).join('\n')
    }
    case 'dex': {
      const opened = await $.ui.open({ id: DEX, title: 'Buddydex', closeOnEscape: true })
      // A surface that places no panes gets the count and the newest ten as text instead.
      if (opened.isPlaced) return undefined
      return dexLines(saved, await $.clock.now()).join('\n')
    }
    case 'mute':
```
Replace
```ts
        argumentHint: '[pet | card | journal | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
        argumentHint: '[pet | card | journal | dex | mute | unmute | off | reroll [confirm]]',
```
Replace the end of the file,
```tsx
    } catch {
      return next(e)
    }
  })
}
```
with:
```tsx
    } catch {
      return next(e)
    }
  })

  // The dex pane (Progression spec section 6): every buddy you've had, oldest first.
  on('ui.render', { component: 'Pane', requestId: DEX }, async ($, e, next) => {
    try {
      const { Box, Text } = $.ui.resolve(e)
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const rows = dexRows(saved, await $.clock.now())
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={dexSvg(rows)} alt={dexAlt(rows)} />
      }

      const width = `#${rows.length}`.length
      return (
        <Box flexDirection="column">
          <Text bold>Buddydex</Text>
          {rows.map(row => (
            <Text bold={row.active}>{dexText(row, width)}</Text>
          ))}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```

- [ ] **Step 7: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 291 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/layout.ts buddy/hooks/layout.test.ts buddy/hooks/card.ts buddy/hooks/card.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy dex, every buddy you've had as tiles, rows or text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Card and journal for any buddy

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 5's `Parsed`; Task 4's `cardProgress`, `achievementsText`.
- Produces:
  - `cardSeed: string | null` and `journalSeed: string | null` in `PluginState`
  - from `record.ts`:
    - `Parsed = { sub: Sub; target?: string }`
    - type `Found = { kind: 'one'; seed: string } | { kind: 'many'; numbers: number[] } | { kind: 'none' }`
    - `findBuddy(saved: Saved, who: string): Found`
    - `notFound(saved: Saved, who: string, found: Exclude<Found, { kind: 'one' }>, command: string): string`
    - `targetOf(saved: Saved, who: string | undefined, command: string): { seed: string | null } | { reply: string }`
    - `shownBuddy(saved: Saved, seed: string | null): Buddy`

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
import { USAGE, activeBuddy, applyChange, classify, migrate, parseSub } from './record'
```
with:
```ts
import { USAGE, activeBuddy, applyChange, classify, findBuddy, migrate, parseSub, shownBuddy, targetOf } from './record'
```
Replace
```ts
  expect(sub('dex all')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card | journal | dex | mute | unmute | off | reroll [confirm]]')
```
with:
```ts
  expect(sub('dex all')).toBe('usage')
  expect(parseSub('card #2')).toEqual({ sub: 'card', target: '#2' })
  expect(parseSub('Journal Pip')).toEqual({ sub: 'journal', target: 'Pip' })
  expect(sub('card Pip twice')).toBe('usage')
  expect(USAGE).toBe('Usage: /buddy [pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]')
```
and append:
```ts
// Pip, a common dragon ('swap-1'); Bix, a common ghost ('test-seed'); and pip, a common axolotl
// ('swap-2'), who is here now.
const THREE: Saved = {
  ...migrate(V1),
  active: 'swap-2',
  buddies: [
    { seed: 'swap-1', soul: SOUL, retiredAt: AT, counts: zeroCounts() },
    { seed: 'test-seed', soul: { ...SOUL, name: 'Bix' }, retiredAt: AT, counts: zeroCounts() },
    { seed: 'swap-2', soul: { ...SOUL, name: 'pip' }, retiredAt: null, counts: zeroCounts() },
  ],
}

test('a buddy is found by name in any case, or by its dex number', () => {
  expect(findBuddy(THREE, 'BIX')).toEqual({ kind: 'one', seed: 'test-seed' })
  expect(findBuddy(THREE, '#1')).toEqual({ kind: 'one', seed: 'swap-1' })
  expect(findBuddy(THREE, '3')).toEqual({ kind: 'one', seed: 'swap-2' })
  expect(findBuddy(THREE, 'Pip')).toEqual({ kind: 'many', numbers: [1, 3] })
  for (const nobody of ['Rex', '#4', '0', '#']) expect([nobody, findBuddy(THREE, nobody)]).toEqual([nobody, { kind: 'none' }])
})

test('a card or journal target is one buddy, the active one as null, or the reason there is none', () => {
  expect(targetOf(THREE, undefined, 'card')).toEqual({ seed: null })
  expect(targetOf(THREE, 'bix', 'card')).toEqual({ seed: 'test-seed' })
  expect(targetOf(THREE, '#3', 'card')).toEqual({ seed: null })
  expect(targetOf(THREE, 'PIP', 'journal')).toEqual({
    reply: '2 buddies are named Pip: #1 dragon, #3 axolotl. Run /buddy journal #3.',
  })
  expect(targetOf(THREE, 'Rex', 'card')).toEqual({ reply: 'No buddy named Rex in the dex.' })
  expect(targetOf(THREE, '#09', 'card')).toEqual({ reply: 'No buddy #9 in the dex.' })
  expect(shownBuddy(THREE, 'test-seed').soul.name).toBe('Bix')
  expect(shownBuddy(THREE, null).seed).toBe('swap-2')
  expect(shownBuddy(THREE, 'gone').seed).toBe('swap-2')
})
```

Append to `buddy/hooks/buddy.test.tsx`:
```tsx
test('card and journal show a retired buddy by number or by name, and the active one again with neither', async ($, on) => {
  const pip = { ...TWO.buddies[0]!, journal: [{ at: LAST_WEEK, kind: 'away' as const, n: 9 }] }
  const clock = world(on, { buddy: { ...TWO, buddies: [pip, TWO.buddies[1]!] } })
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('card #1')).toBeUndefined()
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  const text = (await card.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await card.unmount()
  expect(text).toMatch(/^Pip$/m)
  expect(text).toContain('Hatched 2026-10-01   Rerolls: 1   Retired 2026-10-05')
  expect(await run('journal pip')).toBeUndefined()
  const journal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  expect(await journal.find({ text: "Pip's journal" })).toBeDefined()
  expect(await journal.find({ text: 'back after 9 days away' })).toBeDefined()
  expect(await cardText($)).toMatch(/^Mochi$/m)
})

test('a name two buddies share gets their numbers, and a name nobody has is answered', async ($, on) => {
  const twins = { ...TWO, buddies: [TWO.buddies[0]!, { ...TWO.buddies[1]!, soul: { ...TWO.buddies[1]!.soul, name: 'Pip' } }] }
  const clock = world(on, { buddy: twins }, false)
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('card pip')).toBe('2 buddies are named Pip: #1 dragon, #2 axolotl. Run /buddy card #2.')
  expect(await run('journal Rex')).toBe('No buddy named Rex in the dex.')
  expect((await run('card #1')) ?? '').toMatch(/^Pip, common dragon ★\nLv 1 hatchling · 0 \/ 100 xp\n/)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `record.test.ts` fails to load (no `findBuddy`), and the two target mod tests fail. The rest pass.

- [ ] **Step 3: The pane seeds**

In `buddy/types/index.d.ts`, replace
```ts
      // Finished main turns not yet saved, by buddy seed (Memory spec section 3).
      pendingTurns: Record<string, TurnFacts[]>
```
with:
```ts
      // Finished main turns not yet saved, by buddy seed (Memory spec section 3).
      pendingTurns: Record<string, TurnFacts[]>
      // The buddy the card and journal panes show; null for the active one (Progression spec section 7).
      cardSeed: string | null
      journalSeed: string | null
```

- [ ] **Step 4: Targets and lookup in `record.ts`**

In `buddy/hooks/record.ts`, replace
```ts
import { grewMoments } from './progress'
```
with:
```ts
import { grewMoments } from './progress'
import { rollBones } from './roll'
```
Replace
```ts
export const USAGE = 'Usage: /buddy [pet | card | journal | dex | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
export const USAGE = 'Usage: /buddy [pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]'
```
Replace
```ts
export type Parsed = { sub: Sub }

const SIMPLE: readonly string[] = ['pet', 'card', 'journal', 'dex', 'mute', 'unmute', 'off']
```
with:
```ts
export type Parsed = { sub: Sub; target?: string }

const SIMPLE: readonly string[] = ['pet', 'dex', 'mute', 'unmute', 'off']
// Subcommands that can name one buddy after them.
const TARGETED: readonly string[] = ['card', 'journal']
```
Replace
```ts
  return { sub: words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage' }
}
```
with:
```ts
  if (TARGETED.includes(first)) {
    if (words.length === 1) return { sub: first as Sub }
    return words.length === 2 ? { sub: first as Sub, target: words[1]! } : { sub: 'usage' }
  }
  return { sub: words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage' }
}

// A buddy asked for by name, in any case, or by its dex number: "#5" or "5".
export type Found = { kind: 'one'; seed: string } | { kind: 'many'; numbers: number[] } | { kind: 'none' }

const NUMBER = /^#?(\d+)$/

export function findBuddy(saved: Saved, who: string): Found {
  const number = NUMBER.exec(who)
  if (number) {
    const b = saved.buddies[Number(number[1]) - 1]
    return b ? { kind: 'one', seed: b.seed } : { kind: 'none' }
  }
  const name = who.toLowerCase()
  const numbers = saved.buddies.flatMap((b, i) => (b.soul.name.toLowerCase() === name ? [i + 1] : []))
  if (numbers.length > 1) return { kind: 'many', numbers }
  const one = numbers[0]
  return one === undefined ? { kind: 'none' } : { kind: 'one', seed: saved.buddies[one - 1]!.seed }
}

// The answer when `who` names no one buddy, with `command` in the hint.
export function notFound(saved: Saved, who: string, found: Exclude<Found, { kind: 'one' }>, command: string): string {
  if (found.kind === 'none') {
    const number = NUMBER.exec(who)
    return number ? `No buddy #${Number(number[1])} in the dex.` : `No buddy named ${who} in the dex.`
  }
  const each = found.numbers.map(n => `#${n} ${rollBones(saved.buddies[n - 1]!.seed).species}`)
  const name = saved.buddies[found.numbers[0]! - 1]!.soul.name
  return `${found.numbers.length} buddies are named ${name}: ${each.join(', ')}. Run /buddy ${command} #${found.numbers.at(-1)}.`
}

// What a card or journal asks to show: null for the active buddy, which a pane then follows
// through a swap, or the line to answer with when `who` names no one buddy.
export function targetOf(
  saved: Saved,
  who: string | undefined,
  command: string,
): { seed: string | null } | { reply: string } {
  if (who === undefined) return { seed: null }
  const found = findBuddy(saved, who)
  if (found.kind !== 'one') return { reply: notFound(saved, who, found, command) }
  return { seed: found.seed === saved.active ? null : found.seed }
}

// The buddy a pane shows: the one with `seed`, or the active one when that is null or gone.
export function shownBuddy(saved: Saved, seed: string | null): Buddy {
  return saved.buddies.find(b => b.seed === seed) ?? activeBuddy(saved)
}
```

- [ ] **Step 5: Targets in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub } from './record'
```
with:
```ts
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub, shownBuddy, targetOf } from './record'
```
Replace
```ts
const pendingTurns = atom({ plugin: 'buddy', key: 'pendingTurns' } as const, {})
```
with:
```ts
const pendingTurns = atom({ plugin: 'buddy', key: 'pendingTurns' } as const, {})
const cardSeed = atom({ plugin: 'buddy', key: 'cardSeed' } as const, null)
const journalSeed = atom({ plugin: 'buddy', key: 'journalSeed' } as const, null)
```
Replace
```ts
    case 'card': {
      const opened = await $.ui.open({ id: CARD, title: 'Buddy', closeOnEscape: true })
      // A surface that places no panes gets the card as text instead.
      if (opened.isPlaced) return undefined
      const progress = cardProgress(saved, buddy)
      return [
        ...cardLines(buddy.soul, bones, saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, buddy)),
        achievementsText(progress.earned.length),
      ].join('\n')
    }
    case 'journal': {
      const opened = await $.ui.open({ id: JOURNAL, title: 'Journal', closeOnEscape: true })
      // A surface that places no panes gets the newest ten as text instead.
      if (opened.isPlaced) return undefined
      return journalLines(name, buddy.journal, await $.clock.now()).join('\n')
    }
```
with:
```ts
    case 'card': {
      const target = targetOf(saved, parsed.target, 'card')
      if ('reply' in target) return target.reply
      await update($, cardSeed, () => target.seed)
      const opened = await $.ui.open({ id: CARD, title: 'Buddy', closeOnEscape: true })
      // A surface that places no panes gets the card as text instead.
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      const progress = cardProgress(saved, shown)
      return [
        ...cardLines(shown.soul, bonesFor(shown), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length),
      ].join('\n')
    }
    case 'journal': {
      const target = targetOf(saved, parsed.target, 'journal')
      if ('reply' in target) return target.reply
      await update($, journalSeed, () => target.seed)
      const opened = await $.ui.open({ id: JOURNAL, title: 'Journal', closeOnEscape: true })
      // A surface that places no panes gets the newest ten as text instead.
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      return journalLines(shown.soul.name, shown.journal, await $.clock.now()).join('\n')
    }
```
Replace
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = activeBuddy(saved)
      const bones = bonesFor(buddy)
      const progress = cardProgress(saved, buddy)
```
with:
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = shownBuddy(saved, await read($, cardSeed))
      const bones = bonesFor(buddy)
      const progress = cardProgress(saved, buddy)
```
Replace
```tsx
  // The journal pane (Memory spec section 5): the active buddy's saved moments, newest first.
```
with:
```tsx
  // The journal pane (Memory spec section 5): the shown buddy's saved moments, newest first.
```
Replace
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = activeBuddy(saved)
      const name = buddy.soul.name
```
with:
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = shownBuddy(saved, await read($, journalSeed))
      const name = buddy.soul.name
```
Replace
```ts
        argumentHint: '[pet | card | journal | dex | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
        argumentHint: '[pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]',
```

- [ ] **Step 6: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 295 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: card and journal for any buddy in the dex, by name or number

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: `/buddy swap`

**Files:**
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 6's `findBuddy`, `notFound`, `shownBuddy`; `sulkFor`, `withSulk` from `mood.ts`; `awayMoment`, `addMoments` from `journal.ts`.
- Produces: `{ kind: 'swap'; seed: string }` in `Change`; `'swap'` in `Sub`, with its `target`; the final `USAGE` and argument hint.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/record.test.ts`, replace
```ts
  expect(USAGE).toBe('Usage: /buddy [pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]')
```
with:
```ts
  expect(parseSub('swap #2')).toEqual({ sub: 'swap', target: '#2' })
  expect(sub('swap')).toBe('usage')
  expect(sub('swap Pip now')).toBe('usage')
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]',
  )
```
and append:
```ts
// Two buddies: a, retired at `retiredAt`, and b, here now, last visited on `lastDay`.
const pair = (retiredAt: string, lastDay = '2026-10-06'): Saved => ({
  ...migrate(V1),
  rerolls: 1,
  active: 'b',
  buddies: [
    { seed: 'a', soul: SOUL, retiredAt, counts: zeroCounts() },
    { seed: 'b', soul: { ...SOUL, name: 'Bix' }, retiredAt: null, counts: zeroCounts() },
  ],
  you: { lastDay, streak: 1, bestStreak: 1, days: 1 },
})
const YESTERDAY = new Date(2026, 9, 6, 12).toISOString()

test('a swap retires the active buddy, brings the other back on, and leaves the reroll count alone', () => {
  const saved = applyChange({ ...pair(YESTERDAY), mode: 'off' }, { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved).toMatchObject({ active: 'a', mode: 'on', rerolls: 1 })
  expect(saved.buddies.map(b => [b.seed, b.retiredAt])).toEqual([
    ['a', null],
    ['b', AT],
  ])
  // A day in retirement is no reason to sulk.
  expect(saved.buddies[0]?.mood).toBeUndefined()
  expect(saved.buddies[0]?.journal).toBeUndefined()
  expect(applyChange(pair(YESTERDAY), { kind: 'swap', seed: 'b' }, NOON)).toBeNull()
  expect(applyChange(pair(YESTERDAY), { kind: 'swap', seed: 'gone' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'swap', seed: 'a' }, NOON)).toBeNull()
})

test('a buddy back after five days retired sulks and remembers being away; the one left keeps the visit sulk', () => {
  const saved = applyChange(pair(new Date(2026, 9, 2, 12).toISOString(), '2026-10-04'), { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved.buddies[0]?.mood).toEqual({ meter: 0, sulk: 3, at: AT })
  expect(saved.buddies[0]?.journal).toEqual([{ at: AT, kind: 'away', n: 5 }])
  // 2026-10-04 to 2026-10-07 misses two days: the buddy left alone sulks 1.
  expect(saved.buddies[1]?.mood?.sulk).toBe(1)
  // A damaged retirement time leaves no sulk.
  expect(applyChange(pair('never'), { kind: 'swap', seed: 'a' }, NOON)?.buddies[0]?.mood).toBeUndefined()
})
```

Append to `buddy/hooks/buddy.test.tsx`:
```tsx
test('swap brings a retired buddy back by name, says hello once, and draws it', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  const prompts = model(on, null, 'Missed you.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('swap pip')).toBe('Pip is back.')
  await clock.settle()
  expect(shared.row).toMatchObject({ active: 'swap-1', rerolls: 1, mode: 'on' })
  expect((shared.row as Saved).buddies.map(b => b.retiredAt)).toEqual([null, new Date(NOON).toISOString()])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 1  common dragon  ' })).toBeDefined()
  expect(await ui.find({ text: /Missed you\./ })).toBeDefined()
  expect(prompts.filter(p => p.includes('called you over'))).toHaveLength(1)
})

test('swap by number; the buddy already here, a stranger and a bare swap are answered without one', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('swap #2')).toBe('Mochi is already here.')
  expect(await run('swap Rex')).toBe('No buddy named Rex in the dex.')
  expect(await run('swap')).toMatch(/^Usage: /)
  expect(await run('swap 1')).toBe('Pip is back.')
  expect(await run('swap mochi')).toBe('Mochi is back.')
})

test('calls counted before a swap land on the buddy that made them, and the turn after on the one back', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await runner($)('swap Pip')).toBe('Pip is back.')
  await $.turn.complete(TURN)
  await clock.settle()
  const [pip, mochi] = (shared.row as Saved).buddies
  expect(mochi?.counts).toMatchObject({ turns: 0, failedCalls: 1, calls: { shell: 1 } })
  expect(pip?.counts).toMatchObject({ turns: 1, failedCalls: 0 })
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: the subcommand test, the two swap record tests and the three swap mod tests fail. The rest pass.

- [ ] **Step 3: The `swap` change in `record.ts`**

In `buddy/hooks/record.ts`, replace
```ts
export const USAGE = 'Usage: /buddy [pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
export const USAGE =
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]'
```
Replace
```ts
  | { kind: 'visit' }

```
with:
```ts
  | { kind: 'visit' }
  // A retired buddy made active again (Progression spec section 7).
  | { kind: 'swap'; seed: string }

```
Replace
```ts
// One change, made on the stored object itself so fields a newer build wrote are kept.
```
with:
```ts
// A retired buddy coming back (Progression spec section 7): out of retirement, sulking for the
// days it was left, and with "away" in its journal after three or more missed days, as a visit
// gives. A retirement time that doesn't parse leaves neither.
function welcomeBack(b: Buddy, today: string, now: number): Buddy {
  const left = b.retiredAt !== null && Number.isFinite(Date.parse(b.retiredAt)) ? localDay(Date.parse(b.retiredAt)) : null
  const sulk = sulkFor(left, today)
  const away = awayMoment(left, today, now)
  return {
    ...b,
    retiredAt: null,
    ...(sulk > 0 ? { mood: withSulk(b.mood, sulk, now) } : {}),
    ...(away ? { journal: addMoments(b.journal, [away]) } : {}),
  }
}

// One change, made on the stored object itself so fields a newer build wrote are kept.
```
Replace
```ts
    case 'visit': {
      if (!saved) return null
      const arrived = arrive(saved, now)
      return arrived !== saved ? earn(arrived, now) : null
    }
```
with:
```ts
    case 'visit': {
      if (!saved) return null
      const arrived = arrive(saved, now)
      return arrived !== saved ? earn(arrived, now) : null
    }
    case 'swap': {
      if (!saved || change.seed === saved.active || !saved.buddies.some(b => b.seed === change.seed)) return null
      // The visit comes first, so a sulk from days away lands on the buddy left alone.
      const arrived = arrive(saved, now)
      const retiredAt = new Date(now).toISOString()
      return {
        ...arrived,
        mode: 'on',
        active: change.seed,
        buddies: arrived.buddies.map(b =>
          b.seed === arrived.active ? { ...b, retiredAt } : b.seed === change.seed ? welcomeBack(b, today, now) : b,
        ),
      }
    }
```
Replace
```ts
  | 'show' | 'pet' | 'card' | 'journal' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug'
  | 'debug-off' | 'usage'
```
with:
```ts
  | 'show' | 'pet' | 'card' | 'journal' | 'dex' | 'swap' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm'
  | 'debug' | 'debug-off' | 'usage'
```
Replace
```ts
  if (TARGETED.includes(first)) {
```
with:
```ts
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
  if (TARGETED.includes(first)) {
```

- [ ] **Step 4: The `swap` subcommand in `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub, shownBuddy, targetOf } from './record'
```
with:
```ts
import {
  STORE_KEY, USAGE, activeBuddy, applyChange, classify, findBuddy, notFound, parseSub, shownBuddy, targetOf,
} from './record'
```
Replace
```ts
    case 'reroll-confirm':
      return hatch($, 'reroll')
```
with:
```ts
    case 'reroll-confirm':
      return hatch($, 'reroll')
    case 'swap': {
      if (await read($, hatching)) return 'Wait for the egg to hatch.'
      const who = parsed.target!
      const found = findBuddy(saved, who)
      if (found.kind !== 'one') return notFound(saved, who, found, 'swap')
      if (found.seed === saved.active) return `${name} is already here.`
      // The returning buddy is shown as itself, not mid-tour.
      await update($, tourStart, () => null)
      const note = await commit($, { kind: 'swap', seed: found.seed })
      // Refused: nothing was written or adopted, so nobody is back to say hello.
      if (note !== null && note !== SAVE_FAILED) return note
      const back = shownBuddy((await read($, record)) ?? saved, found.seed)
      await update($, bubble, () => null)
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
```
Replace
```ts
        argumentHint: '[pet | card [who] | journal [who] | dex | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
        argumentHint: '[pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]',
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 300 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy swap brings a retired buddy back, sulking for the days it was left

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Stages: the art split, the hat on the head, and the staged tour

**Files:**
- Create: `buddy/hooks/art-adult.ts` (moved out of `sprites.ts`), `buddy/hooks/art-hatchling.ts`, `buddy/hooks/art-elder.ts`
- Modify: `buddy/hooks/sprites.ts`, `buddy/hooks/sprites.test.ts`
- Modify: `buddy/hooks/look.ts`, `buddy/hooks/look.test.ts`
- Modify: `buddy/hooks/tour.ts`, `buddy/hooks/tour.test.ts`
- Modify: `buddy/hooks/card.ts`
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: Task 1's `Stage`, `STAGES`, `stageOf`, `levelOf`; Task 2's `EARNED_HATS`, `Wearable`; Task 4's `CardProgress.stage`; Task 5's `DexRow.stage`.
- Produces:
  - `ADULT: Record<Species, string>` in `art-adult.ts`; `HATCHLING` and `ELDER: Partial<Record<Species, string>>` (complete from Task 11)
  - from `sprites.ts`: `bodyRows(species, stage, frame)`, `headRow(rest: readonly string[]): number`, `spriteRows({ species, stage, eye, frame, top })`
  - `Scene.stage: Stage` and `Scene.bones.hat: Wearable | 'none'`; `portrait(bones, stage, tick)` in `look.ts`
  - `tourAt(elapsed, stage = 'adult')` returning `stage`; the shiny pass rotates `['none', ...HATS, ...EARNED_HATS]`
  - `tourStage: Stage` in `PluginState`; `Parsed.stage?: Stage`; `/buddy debug hatchling | adult | elder`

This task draws no new art: a stage with nothing drawn for a species draws that species' adult. It moves the adult art, makes every drawer stage-aware, and moves the art-sensitive mod tests onto a grown-up fixture so the hatchling art in Tasks 9 to 11 can't break them.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/sprites.test.ts`, replace
```ts
import { EYES, HATS, SPECIES } from './roll'
```
with:
```ts
import { ADULT } from './art-adult'
import { ELDER } from './art-elder'
import { HATCHLING } from './art-hatchling'
import { STAGES } from './progress'
import { EYES, HATS, SPECIES, fnv1a32 } from './roll'
```
Replace
```ts
  SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, spriteRows, topRow,
```
with:
```ts
  SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
```
Replace
```ts
test('every species frame is 4 body rows of at most 12 columns for every eye', () => {
  const over: string[] = []
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = bodyRows(species, frame)
      if (rows.length !== 4) over.push(`${species} frame ${frame}: ${rows.length} rows`)
      for (const eye of [...EYES, '-']) {
        for (const row of rows) {
          const drawn = fillEyes(row, eye)
          if (drawn.length > SPRITE_W) over.push(`${species} frame ${frame}: "${drawn}"`)
        }
      }
    }
  }
  expect(over).toEqual([])
})

test('a drawn sprite is exactly 5 rows of 12 columns with the hat row on top', () => {
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = spriteRows({ species, eye: '·', frame, top: BLANK })
      expect(rows).toHaveLength(5)
      expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
      expect(rows[0]).toBe(BLANK)
    }
  }
})
```
with:
```ts
test('every frame at every stage is 4 body rows of at most 12 columns for every eye', () => {
  const over: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const frame of [0, 1, 2] as const) {
        const rows = bodyRows(species, stage, frame)
        if (rows.length !== 4) over.push(`${stage} ${species} frame ${frame}: ${rows.length} rows`)
        for (const eye of [...EYES, '-']) {
          for (const row of rows) {
            const drawn = fillEyes(row, eye)
            if (drawn.length > SPRITE_W) over.push(`${stage} ${species} frame ${frame}: "${drawn}"`)
          }
        }
      }
    }
  }
  expect(over).toEqual([])
})

test('a drawn sprite is exactly 5 rows of 12 columns at every stage', () => {
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const frame of [0, 1, 2] as const) {
        const rows = spriteRows({ species, stage, eye: '·', frame, top: BLANK })
        expect(rows).toHaveLength(5)
        expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
        expect(rows[0]).toBe(BLANK)
      }
    }
  }
})
```
Replace
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
```
with:
```ts
test('every species has a flinch, celebrate and sleep frame at every stage, 4 rows within 12 columns, each with an eye', () => {
  const bad: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const pose of POSES) {
        const rows = bodyRows(species, stage, pose)
        if (rows.length !== 4) bad.push(`${stage} ${species} ${pose}: ${rows.length} rows`)
        if (!rows.some(row => row.includes('{E}'))) bad.push(`${stage} ${species} ${pose}: no eye`)
        for (const row of rows) {
          const drawn = fillEyes(row, POSE_EYE[pose])
          if (drawn.length > SPRITE_W) bad.push(`${stage} ${species} ${pose}: "${drawn}"`)
        }
      }
    }
  }
  expect(bad).toEqual([])
})

test('a posed sprite is 5 rows of 12 at every stage, and differs from its rest frame', () => {
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      const rest = spriteRows({ species, stage, eye: '·', frame: 0, top: BLANK })
      for (const pose of POSES) {
        const rows = spriteRows({ species, stage, eye: POSE_EYE[pose], frame: pose, top: BLANK })
        expect(rows).toHaveLength(5)
        expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
        expect(rows).not.toEqual(rest)
      }
    }
  }
})
```
and append:
```ts
test('the adult art is the art every buddy had before 0.5, moved unchanged', () => {
  expect(fnv1a32(SPECIES.map(s => ADULT[s]).join('\n'))).toBe(0x2e0b7210)
})

test('the top row sits just above the head: row 0 for every adult', () => {
  expect(headRow(['    __', '  <(· )___', '   ( ._> /', "    '---'"])).toBe(0)
  expect(headRow(['', '    ,_', '   (·>', '  (__)'])).toBe(1)
  expect(headRow(['', '', '', ''])).toBe(0)
  for (const species of SPECIES) {
    const rows = spriteRows({ species, stage: 'adult', eye: '·', frame: 0, top: 'HAT' })
    expect([species, rows[0]]).toEqual([species, 'HAT'.padEnd(SPRITE_W)])
  }
})

test('nothing is drawn above the head in any frame, at any stage', () => {
  const bad: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      const head = headRow(bodyRows(species, stage, 0))
      for (const frame of [0, 1, 2, ...POSES] as const) {
        const above = bodyRows(species, stage, frame).slice(0, head)
        if (above.some(row => row.trim() !== '')) bad.push(`${stage} ${species} ${frame}`)
      }
    }
  }
  expect(bad).toEqual([])
})

test('every hatchling drawn is small: at most 3 rows and 9 columns in every frame', () => {
  const bad: string[] = []
  for (const species of SPECIES.filter(s => HATCHLING[s] !== undefined)) {
    // Fidget A, the rest frame a column to the right, may reach 10.
    for (const frame of [0, 2, ...POSES] as const) {
      const rows = bodyRows(species, 'hatchling', frame).map(row => fillEyes(row, '·'))
      if (rows.filter(row => row.trim() !== '').length > 3) bad.push(`${species} ${frame}: over 3 rows`)
      if (rows.some(row => row.trimEnd().length > 9)) bad.push(`${species} ${frame}: over 9 columns`)
    }
  }
  expect(bad).toEqual([])
})

test('every elder drawn is drawn new: no frame is a copy of its adult frame', () => {
  const copied: string[] = []
  for (const species of SPECIES.filter(s => ELDER[s] !== undefined)) {
    for (const frame of [0, 2, ...POSES] as const) {
      const elder = bodyRows(species, 'elder', frame).join('\n')
      if (elder === bodyRows(species, 'adult', frame).join('\n')) copied.push(`${species} ${frame}`)
    }
  }
  expect(copied).toEqual([])
})
```

In `buddy/hooks/look.test.ts`, replace
```ts
const CALM: Scene = {
  bones: BONES, tick: 0, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame: null, saying: false,
}
```
with:
```ts
const CALM: Scene = {
  bones: BONES,
  stage: 'adult',
  tick: 0,
  mood: 'neutral',
  pose: null,
  idleTicks: 0,
  night: false,
  holiday: null,
  heartsFrame: null,
  saying: false,
}
```
Replace
```ts
const posed = (pose: Pose) => bodyRows('duck', pose).map(r => fillEyes(r, POSE_EYE[pose]).trimEnd())
```
with:
```ts
const posed = (pose: Pose) => bodyRows('duck', 'adult', pose).map(r => fillEyes(r, POSE_EYE[pose]).trimEnd())
```
Replace
```ts
  const rows = portrait(BONES, 0)
```
with:
```ts
  const rows = portrait(BONES, 'adult', 0)
```

In `buddy/hooks/tour.test.ts`, replace
```ts
import { EYES, HATS, RARITIES, SPECIES } from './roll'
```
with:
```ts
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { EARNED_HATS } from './sprites'
```
Replace
```ts
test('plain ticks wear no hat; shiny ticks show every hat and no hat', () => {
```
with:
```ts
test('plain ticks wear no hat; shiny ticks show every hat, earned ones too, and no hat', () => {
```
Replace
```ts
  expect([...shinyHats].sort()).toEqual(['none', ...HATS].sort())
```
with:
```ts
  expect([...shinyHats].sort()).toEqual(['none', ...HATS, ...EARNED_HATS].sort())
```
and append:
```ts
test('the tour draws every phase at the stage it was asked for, adults when not asked', () => {
  for (const elapsed of [0, SPECIES_TICKS, SPECIES_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS]) {
    expect(tourAt(elapsed)?.stage).toBe('adult')
    expect(tourAt(elapsed, 'hatchling')?.stage).toBe('hatchling')
    expect(tourAt(elapsed, 'elder')?.stage).toBe('elder')
  }
})
```

In `buddy/hooks/record.test.ts`, replace
```ts
test('debug is a subcommand the usage line never mentions', () => {
  expect(parseSub('debug')).toEqual({ sub: 'debug' })
  expect(parseSub(' DEBUG off ')).toEqual({ sub: 'debug-off' })
  expect(parseSub('debug now')).toEqual({ sub: 'usage' })
  expect(USAGE).not.toMatch(/debug/)
})
```
with:
```ts
test('debug is a subcommand the usage line never mentions, and can tour one stage', () => {
  expect(parseSub('debug')).toEqual({ sub: 'debug' })
  expect(parseSub(' DEBUG off ')).toEqual({ sub: 'debug-off' })
  expect(parseSub('debug Hatchling')).toEqual({ sub: 'debug', stage: 'hatchling' })
  expect(parseSub('debug adult')).toEqual({ sub: 'debug', stage: 'adult' })
  expect(parseSub('debug elder')).toEqual({ sub: 'debug', stage: 'elder' })
  expect(parseSub('debug now')).toEqual({ sub: 'usage' })
  expect(parseSub('debug elder off')).toEqual({ sub: 'usage' })
  expect(USAGE).not.toMatch(/debug/)
})
```

In `buddy/hooks/buddy.test.tsx`, replace
```ts
  expect(await runner($)('debug')).toBe(
    'Touring all 18 species with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
```
with:
```ts
  expect(await runner($)('debug')).toBe(
    'Touring all 18 species as adults with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
```
Replace
```ts
const SAVED: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: 'test-seed',
  buddies: [{ seed: 'test-seed', soul: RECORD.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: '2026-10-06', streak: 3, bestStreak: 3, days: 3 },
}
```
with:
```ts
const SAVED: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: 'test-seed',
  buddies: [{ seed: 'test-seed', soul: RECORD.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: '2026-10-06', streak: 3, bestStreak: 3, days: 3 },
}

// RECORD's buddy grown to exactly level 10, the first adult level, so the tests below that read
// sprite rows read the adult art. A common's floor at level 10 is 4, under every stat 'test-seed'
// rolled, so its stats stay as rolled; Grown up is already earned, so nothing is announced.
const ADULT: Saved = {
  ...SAVED,
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 810 } }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { grownUp: '2026-10-01T12:00:00.000Z' } },
}
// ADULT, with another seed's buddy.
const adultAs = (seed: string): Saved => ({ ...ADULT, active: seed, buddies: [{ ...ADULT.buddies[0]!, seed }] })
```
Then move each art-reading test onto it. Replace
```ts
test('on the Fourth of July a quiet buddy wears the hat and holds the flag; a bubble takes its place', async ($, on) => {
  const clock = world(on, { buddy: RECORD }, true, JULY4_NOON)
```
with:
```ts
test('on the Fourth of July a quiet buddy wears the hat and holds the flag; a bubble takes its place', async ($, on) => {
  const clock = world(on, { buddy: ADULT }, true, JULY4_NOON)
```
Replace
```ts
  const clock = world(on, { buddy: { ...RECORD, seed: 'tint-11' } }, true, JULY4_NOON)
```
with:
```ts
  const clock = world(on, { buddy: adultAs('tint-11') }, true, JULY4_NOON)
```
Replace
```ts
test('a buddy left alone for 10 minutes falls asleep, and a prompt wakes it', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
```
with:
```ts
test('a buddy left alone for 10 minutes falls asleep, and a prompt wakes it', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
```
Replace
```ts
  const clock = world(on, { buddy: RECORD }, true, new Date(2026, 9, 7, 0, 30).getTime())
```
with:
```ts
  const clock = world(on, { buddy: ADULT }, true, new Date(2026, 9, 7, 0, 30).getTime())
```
Replace
```ts
test('a failed tool call makes the buddy flinch for 2 seconds', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
```
with:
```ts
test('a failed tool call makes the buddy flinch for 2 seconds', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
```
Replace
```ts
test('two failed turns make the buddy anxious, and the turn-end save keeps the mood', async ($, on) => {
  const shared = sharedStore(on, RECORD)
```
with:
```ts
test('two failed turns make the buddy anxious, and the turn-end save keeps the mood', async ($, on) => {
  const shared = sharedStore(on, ADULT)
```
Replace
```ts
test('a long clean turn makes the buddy celebrate under confetti', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
```
with:
```ts
test('a long clean turn makes the buddy celebrate under confetti', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
```
Replace
```ts
  const shared = sharedStore(on, { ...SAVED, you: { ...SAVED.you, lastDay: '2026-10-04' } })
```
with:
```ts
  const shared = sharedStore(on, { ...ADULT, you: { ...ADULT.you, lastDay: '2026-10-04' } })
```
and append:
```tsx
test('debug can tour the hatchlings or the elders, and says which', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('debug hatchling')).toBe(
    'Touring all 18 species as hatchlings with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck  $/ })).toBeDefined()
  expect(await run('debug elder')).toMatch(/ as elders with /)
  expect(await run('debug baby')).toMatch(/^Usage: /)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: `sprites.test.ts` fails to load (no `./art-adult`), `look.test.ts` and `tour.test.ts` fail on the new arguments, the debug parse test and the two debug mod tests fail. The rest pass, including the tests moved onto `ADULT`.

- [ ] **Step 3: Move the adult art out of `sprites.ts`**

The block from the comment `// Each entry: five sections` through the `ART` object's closing `}` moves to `art-adult.ts` as `ADULT`, byte for byte:
```bash
node - <<'NODE'
const fs = require('fs')
const path = 'buddy/hooks/sprites.ts'
const src = fs.readFileSync(path, 'utf8')
const start = src.indexOf('// Each entry: five sections')
const end = src.indexOf('\nconst EGG = ')
if (start < 0 || end < 0) throw new Error('sprites.ts has moved on; stop and re-read it')
const art = src.slice(start, end).replace('const ART: Record<Species, string> = {', 'export const ADULT: Record<Species, string> = {')
if (!art.includes('export const ADULT')) throw new Error('no ART object found')
fs.writeFileSync(
  'buddy/hooks/art-adult.ts',
  "// The adult bodies (Progression spec section 5): the art every buddy had before 0.5, moved here\n" +
    "// from sprites.ts unchanged.\nimport type { Species } from './roll'\n\n" +
    art.trimEnd() +
    '\n',
)
fs.writeFileSync(path, src.slice(0, start) + src.slice(end + 1))
NODE
head -8 buddy/hooks/art-adult.ts
grep -n "const ART\|const EGG" buddy/hooks/sprites.ts
```
Expected: `art-adult.ts` starts with the two comment lines, the import, then `// Each entry: five sections of four body rows...` and `export const ADULT: Record<Species, string> = {`. In `sprites.ts`, only `const EGG = String.raw\`` is left of the two.

Create `buddy/hooks/art-hatchling.ts`:
```ts
// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section. A species not drawn here yet is
// drawn as its adult.
import type { Species } from './roll'

export const HATCHLING: Partial<Record<Species, string>> = {}
```

Create `buddy/hooks/art-elder.ts`:
```ts
// The elder bodies (Progression spec section 5), in art-adult.ts's format: the adult's size with
// marks of age, every section drawn new, and nothing above the rest frame's head in any section.
// A species not drawn here yet is drawn as its adult.
import type { Species } from './roll'

export const ELDER: Partial<Record<Species, string>> = {}
```

- [ ] **Step 4: Stage-aware bodies and the hat on the head in `sprites.ts`**

In `buddy/hooks/sprites.ts`, replace
```ts
// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12
// columns, row 0 kept for a hat, {E} marking each eye.
import type { HolidayId } from './calendar'
import type { Hat, Species } from './roll'
```
with:
```ts
// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12 columns, the hat row
// just above the head (row 0 for an adult), {E} marking each eye. The bodies live in
// art-hatchling.ts, art-adult.ts and art-elder.ts, one file per stage.
import type { Stage } from '../types'
import { ADULT } from './art-adult'
import { ELDER } from './art-elder'
import { HATCHLING } from './art-hatchling'
import type { HolidayId } from './calendar'
import type { Hat, Species } from './roll'
```
Replace
```ts
export function bodyRows(species: Species, frame: Frame | Pose): string[] {
  const sections = parseArt(ART[species])
```
with:
```ts
// Each stage's bodies. A species a stage hasn't drawn yet is drawn as its adult.
const STAGE_ART: Record<Stage, Partial<Record<Species, string>>> = { hatchling: HATCHLING, adult: ADULT, elder: ELDER }

export function bodyRows(species: Species, stage: Stage, frame: Frame | Pose): string[] {
  const sections = parseArt(STAGE_ART[stage][species] ?? ADULT[species])
```
Replace
```ts
export function spriteRows(o: { species: Species; eye: string; frame: Frame | Pose; top: string }): string[] {
  return [o.top, ...bodyRows(o.species, o.frame).map(row => fillEyes(row, o.eye))].map(fit)
}
```
with:
```ts
// The body row a stage's head starts on: its rest frame's first row with anything drawn.
export function headRow(rest: readonly string[]): number {
  return Math.max(0, rest.findIndex(row => row.trim() !== ''))
}

// The 5 sprite rows. The top row (hearts, confetti, zZ, a hat or the sparkle) sits just above the
// head, which is where the stage's rest frame starts, and every row above it is blank (Progression
// spec section 5). Every adult's head starts on its first body row, so its top row is row 0. Art
// keeps the rows above the head blank in every section, so the top row covers nothing.
export function spriteRows(o: { species: Species; stage: Stage; eye: string; frame: Frame | Pose; top: string }): string[] {
  const rows = [BLANK, ...bodyRows(o.species, o.stage, o.frame).map(row => fillEyes(row, o.eye))]
  rows[headRow(bodyRows(o.species, o.stage, 0))] = o.top
  return rows.map(fit)
}
```

- [ ] **Step 5: The stage in the scene**

In `buddy/hooks/look.ts`, replace
```ts
import type { Holiday } from './calendar'
```
with:
```ts
import type { Stage } from '../types'
import type { Holiday } from './calendar'
```
Replace
```ts
import type { Pose, Prop } from './sprites'
```
with:
```ts
import type { Pose, Prop, Wearable } from './sprites'
```
Replace
```ts
export type Scene = {
  bones: Pick<Bones, 'species' | 'eye' | 'hat' | 'shiny'>
```
with:
```ts
export type Scene = {
  // The hat may be an earned one: the debug tour shows them.
  bones: Pick<Bones, 'species' | 'eye' | 'shiny'> & { hat: Wearable | 'none' }
  // The stage the body is drawn at (Progression spec section 5).
  stage: Stage
```
Replace
```ts
    sprite: spriteRows({ species: s.bones.species, eye, frame: pose ?? frame, top }),
```
with:
```ts
    sprite: spriteRows({ species: s.bones.species, stage: s.stage, eye, frame: pose ?? frame, top }),
```
Replace
```ts
export function portrait(bones: Scene['bones'], tick: number): string[] {
  return draw({
    bones, tick, mood: 'neutral', pose: null, idleTicks: 0, night: false, holiday: null, heartsFrame: null, saying: false,
  }).sprite
}
```
with:
```ts
export function portrait(bones: Scene['bones'], stage: Stage, tick: number): string[] {
  return draw({
    bones,
    stage,
    tick,
    mood: 'neutral',
    pose: null,
    idleTicks: 0,
    night: false,
    holiday: null,
    heartsFrame: null,
    saying: false,
  }).sprite
}
```

- [ ] **Step 6: The staged tour in `tour.ts`**

In `buddy/hooks/tour.ts`, replace
```ts
import type { Pose } from './sprites'
```
with:
```ts
import type { Stage } from '../types'
import { EARNED_HATS } from './sprites'
import type { Pose, Wearable } from './sprites'
```
Replace
```ts
const SHINY_HATS = ['none', ...HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'hat' | 'shiny'>
```
with:
```ts
// The shiny pass rotates every hat a buddy can wear, earned ones too (Progression spec section 5).
const SHINY_HATS = ['none', ...HATS, ...EARNED_HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'shiny'> & { hat: Wearable | 'none' }
```
Replace
```ts
  holiday: Holiday | null
  mood: MoodName
}
```
with:
```ts
  holiday: Holiday | null
  mood: MoodName
  // The stage every phase is drawn at.
  stage: Stage
}
```
Replace
```ts
export function tourAt(elapsed: number): TourAt | null {
```
with:
```ts
export function tourAt(elapsed: number, stage: Stage = 'adult'): TourAt | null {
```
Replace
```ts
      holiday: null,
      mood: 'neutral',
    }
  }
```
with:
```ts
      holiday: null,
      mood: 'neutral',
      stage,
    }
  }
```
Replace
```ts
    return { name: `tour: ${holiday.name}`, tick: into % DECOR_TICKS, look: {}, pose: null, holiday, mood: 'neutral' }
```
with:
```ts
    return { name: `tour: ${holiday.name}`, tick: into % DECOR_TICKS, look: {}, pose: null, holiday, mood: 'neutral', stage }
```
Replace
```ts
  return { name: `tour: ${mood}`, tick: (into - decorTicks) % MOOD_TICKS, look: {}, pose: null, holiday: null, mood }
```
with:
```ts
  return { name: `tour: ${mood}`, tick: (into - decorTicks) % MOOD_TICKS, look: {}, pose: null, holiday: null, mood, stage }
```

- [ ] **Step 7: Still portraits at a stage in `card.ts`**

In `buddy/hooks/card.ts`, replace
```ts
import type { Counts, Soul, You } from '../types'
```
with:
```ts
import type { Counts, Soul, Stage, You } from '../types'
```
Replace
```ts
function stillRows(bones: Pick<Bones, 'species' | 'eye' | 'hat'>): string[] {
  const top = topRow({ hat: bones.hat, heartsFrame: null, sparkle: null })
  return spriteRows({ species: bones.species, eye: bones.eye, frame: 0, top })
}
```
with:
```ts
function stillRows(bones: Pick<Bones, 'species' | 'eye' | 'hat'>, stage: Stage): string[] {
  const top = topRow({ hat: bones.hat, heartsFrame: null, sparkle: null })
  return spriteRows({ species: bones.species, stage, eye: bones.eye, frame: 0, top })
}
```
Replace
```ts
  stillRows(bones).forEach((row, i) =>
```
with:
```ts
  stillRows(bones, progress?.stage ?? 'adult').forEach((row, i) =>
```
Replace
```ts
    stillRows(row.bones).forEach((line, j) =>
```
with:
```ts
    stillRows(row.bones, row.stage).forEach((line, j) =>
```

- [ ] **Step 8: The tour's stage, saved in state and parsed**

In `buddy/types/index.d.ts`, replace
```ts
      cardSeed: string | null
      journalSeed: string | null
```
with:
```ts
      cardSeed: string | null
      journalSeed: string | null
      // The stage /buddy debug tours (Progression spec section 5).
      tourStage: Stage
```

In `buddy/hooks/record.ts`, replace
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, TurnFacts } from '../types'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
```
Replace
```ts
export type Parsed = { sub: Sub; target?: string }
```
with:
```ts
export type Parsed = { sub: Sub; target?: string; stage?: Stage }

const STAGE_WORDS: readonly string[] = ['hatchling', 'adult', 'elder']
```
Replace
```ts
  if (first === 'debug') {
    if (words.length === 1) return { sub: 'debug' }
    return { sub: words.length === 2 && second === 'off' ? 'debug-off' : 'usage' }
  }
```
with:
```ts
  if (first === 'debug') {
    if (words.length === 1) return { sub: 'debug' }
    if (words.length !== 2 || second === undefined) return { sub: 'usage' }
    if (second === 'off') return { sub: 'debug-off' }
    return STAGE_WORDS.includes(second) ? { sub: 'debug', stage: second as Stage } : { sub: 'usage' }
  }
```

- [ ] **Step 9: Stages through `register.tsx`**

In `buddy/hooks/register.tsx`, replace
```ts
import type { Buddy, Counts, Moment, MoodEvent, Saved, TurnFacts } from '../types'
```
with:
```ts
import type { Buddy, Counts, Moment, MoodEvent, Saved, Stage, TurnFacts } from '../types'
```
Replace
```ts
import { bonesFor, levelOf } from './progress'
```
with:
```ts
import { bonesFor, levelOf, stageOf } from './progress'
```
Replace
```ts
const journalSeed = atom({ plugin: 'buddy', key: 'journalSeed' } as const, null)
```
with:
```ts
const journalSeed = atom({ plugin: 'buddy', key: 'journalSeed' } as const, null)
const tourStage = atom({ plugin: 'buddy', key: 'tourStage' } as const, 'adult')
```
Replace
```ts
  bones: Bones,
  t: number,
  heartsFrame: number | null,
  saying: boolean,
): Promise<Scene> {
```
with:
```ts
  bones: Bones,
  stage: Stage,
  t: number,
  heartsFrame: number | null,
  saying: boolean,
): Promise<Scene> {
```
Replace
```ts
  return {
    bones,
    tick: t,
```
with:
```ts
  return {
    bones,
    stage,
    tick: t,
```
Replace
```ts
  const tour = started === null ? null : tourAt(t - started)
  const own = bonesFor(buddy)
  const bones = tour ? { ...own, ...tour.look } : own
```
with:
```ts
  const tour = started === null ? null : tourAt(t - started, await read($, tourStage))
  const own = bonesFor(buddy)
  const bones = tour ? { ...own, ...tour.look } : own
  // The tour draws the stage it was asked for; otherwise the buddy is drawn at its own.
  const stage = tour ? tour.stage : stageOf(levelOf(buddy.counts))
```
Replace
```ts
    ? {
        bones,
        tick: animTick,
```
with:
```ts
    ? {
        bones,
        stage,
        tick: animTick,
```
Replace
```ts
    : await liveScene($, buddy, bones, t, heartsFrame, saying)
```
with:
```ts
    : await liveScene($, buddy, own, stage, t, heartsFrame, saying)
```
Replace
```ts
    case 'debug': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, tourStart, () => now)
      return `Touring all ${TOUR_STEPS} species with their reactions, then the holidays and moods. Run /buddy debug off to stop.`
    }
```
with:
```ts
    case 'debug': {
      if (saved.mode === 'off') return hidden
      const stage = parsed.stage ?? 'adult'
      const now = await read($, tick)
      await update($, tourStage, () => stage)
      await update($, tourStart, () => now)
      return `Touring all ${TOUR_STEPS} species as ${stage}s with their reactions, then the holidays and moods. Run /buddy debug off to stop.`
    }
```
Replace
```tsx
          {portrait(bones, t).map(row => (
```
with:
```tsx
          {portrait(bones, progress.stage, t).map(row => (
```

- [ ] **Step 10: Run the tests to see them pass**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -5
```
Expected: 307 pass, 0 fail.

- [ ] **Step 11: Commit**

```bash
git add buddy/hooks/art-adult.ts buddy/hooks/art-hatchling.ts buddy/hooks/art-elder.ts buddy/hooks/sprites.ts buddy/hooks/sprites.test.ts buddy/hooks/look.ts buddy/hooks/look.test.ts buddy/hooks/tour.ts buddy/hooks/tour.test.ts buddy/hooks/card.ts buddy/types/index.d.ts buddy/hooks/record.ts buddy/hooks/record.test.ts buddy/hooks/register.tsx buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: a stage for every body, the hat on the head, and /buddy debug by stage

The adult art moves to art-adult.ts unchanged; hatchling and elder art
follow, one group of species at a time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Hatchling and elder art: duck, goose, blob, cat, dragon, octopus

**Files:**
- Create: `tools/art-sheet.mjs`
- Modify: `buddy/hooks/art-hatchling.ts`, `buddy/hooks/art-elder.ts`
- Create: `docs/art/stages.txt` (generated)

**Interfaces:**
- Consumes: Task 8's `HATCHLING`, `ELDER`, and the art tests in `sprites.test.ts`.
- Produces: `HATCHLING` and `ELDER` entries for duck, goose, blob, cat, dragon and octopus; `tools/art-sheet.mjs`, which writes `docs/art/stages.txt`.

**The rules every drawing keeps.** `sprites.test.ts` checks each of these:
- **Format.** Each entry is a `String.raw` template that starts with a newline, holding 5 sections split by lines with only `~`: rest, fidget B, flinch, celebrate, sleep. Each section is exactly 4 lines; an empty line is a blank row and counts. Lines start at column 0 of the file. `{E}` marks each eye, at least once in every section. Use no backticks and no `${`.
- **Width,** counting `{E}` as 1 column: rest rows at most 11 (fidget A draws the rest frame a column to the right), every other section at most 12.
- **Hatchlings:** at most 3 non-blank rows and at most 9 columns in every section, standing on the bottom row with blank rows first. The head sits near column 6, under the hats.
- **Nothing above the head.** In every section, the rows above the rest frame's first non-blank row are blank. The hat, hearts, confetti and zZ are drawn there.
- **Poses read like the adult's:** flinch jolts (often a `!`), celebrate raises wings or arms or jumps, sleep lies lower. Their eyes are drawn as `O`, `^` and `-`. Each pose differs from the rest frame.
- **Elders:** the adult's size with marks of age; no section may equal the adult's.
- **Original art,** in the original's style, never copied from anywhere.

**The duck, as the worked example.** For reference, the adult duck in `art-adult.ts` is:
```
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
```

**Direction for this group:**

| Species | Hatchling | Elder |
|-|-|-|
| duck | a round duckling, a tuft and a short beak | brow feathers, a hunched back, a cane |
| goose | a fuzzy gosling, short neck, big feet | a long neck bent into a stoop, a scarf, a cane |
| blob | a small droplet with a shine | wider and saggier, wrinkle lines, a single hair on top |
| cat | a kitten, ears too big for it, a stub of a tail | long drooping whiskers, a ruff like a beard, a curled tail |
| dragon | a bit of eggshell still on it, nub horns, tiny wings | long whiskers or a beard, curled horns, folded wings |
| octopus | a little round head over four short tentacles | a wrinkled mantle, a ring around one eye like a monocle, a tentacle curled into a cane |

- [ ] **Step 1: The review sheet**

Create `tools/art-sheet.mjs`:
```js
// Writes docs/art/stages.txt: every species at every stage drawn so far, its frames side by side,
// with a crown on the hat row so its place above the head shows. Run from the repo root:
//   node tools/art-sheet.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle',
  'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk',
]
const STAGES = [
  ['hatchling', 'art-hatchling.ts'],
  ['adult', 'art-adult.ts'],
  ['elder', 'art-elder.ts'],
]
// Each frame's name and the eye it is drawn with. Fidget A is the rest frame a column right.
const FRAMES = [['rest', '·'], ['fidget A', '·'], ['fidget B', '·'], ['flinch', 'O'], ['celebrate', '^'], ['sleep', '-']]
const CROWN = '   .WWW.'
const W = 12

// A stage file's object: from the "{" after its type to the file's last "}", evaluated as
// JavaScript. The entries are String.raw templates, so they read back exactly as written.
function load(file) {
  const src = readFileSync(`buddy/hooks/${file}`, 'utf8').replace(/\r/g, '')
  const from = src.indexOf('{', src.indexOf('Record<Species, string>'))
  return new Function(`return ${src.slice(from, src.lastIndexOf('}') + 1)}`)()
}

// An entry's sections, split at its "~" lines, as sprites.ts splits them.
function sections(entry) {
  const out = [[]]
  for (const line of entry.split('\n').slice(1, -1)) {
    if (line === '~') out.push([])
    else out.at(-1).push(line)
  }
  return out
}

const art = Object.fromEntries(STAGES.map(([stage, file]) => [stage, load(file)]))
const lines = []
for (const species of SPECIES) {
  lines.push(`== ${species} ==`)
  for (const [stage] of STAGES) {
    const entry = art[stage][species]
    if (!entry) {
      lines.push(`-- ${stage}: not drawn yet`, '')
      continue
    }
    const [rest, fidgetB, flinch, celebrate, sleep] = sections(entry)
    const frames = [rest, rest.map(r => ' ' + r), fidgetB, flinch, celebrate, sleep]
    const head = Math.max(0, rest.findIndex(r => r.trim() !== ''))
    lines.push(`-- ${stage}`, FRAMES.map(([name]) => name.padEnd(W)).join('  ').trimEnd())
    const drawn = frames.map((rows, i) => {
      const sprite = ['', ...rows.map(r => r.split('{E}').join(FRAMES[i][1]))]
      sprite[head] = CROWN
      return sprite.map(r => r.padEnd(W))
    })
    for (let row = 0; row < 5; row++) lines.push(drawn.map(f => f[row]).join('  ').trimEnd())
    lines.push('')
  }
}
mkdirSync('docs/art', { recursive: true })
writeFileSync('docs/art/stages.txt', lines.join('\n'))
console.log('wrote docs/art/stages.txt')
```
Run it:
```bash
node tools/art-sheet.mjs && sed -n 1,20p docs/art/stages.txt
```
Expected: `wrote docs/art/stages.txt`, then `== duck ==`, `-- hatchling: not drawn yet`, the adult duck's six frames with the crown on row 0, and `-- elder: not drawn yet`.

- [ ] **Step 2: Draw the hatchlings**

In `buddy/hooks/art-hatchling.ts`, replace
```ts
export const HATCHLING: Partial<Record<Species, string>> = {}
```
with an object holding six entries in this order: duck, goose, blob, cat, dragon, octopus. Start with the duck as drawn here:
```ts
export const HATCHLING: Partial<Record<Species, string>> = {
  duck: String.raw`

    __
   ({E}>
   (__)
~

    __
   ({E}>
  /(__)
~

   __  !
  ({E}>
  (__)
~

  \ __ /
   ({E}>
   (__)
~


   ({E}>_
   (___)
`,
```
Then draw goose, blob, cat, dragon and octopus to the rules and the direction table above, and close the object with `}`.

- [ ] **Step 3: Draw the elders**

In `buddy/hooks/art-elder.ts`, replace
```ts
export const ELDER: Partial<Record<Species, string>> = {}
```
with an object holding six entries in the same order. Start with the duck as drawn here:
```ts
export const ELDER: Partial<Record<Species, string>> = {
  duck: String.raw`
   ~__
  <({E} )___
  ( ._> / |
   '---' _|
~
   ~__
  <({E} )___
  ( ._> \/|
   '---' _|
~
   ~__  !
  <({E} )___
 \( ._> /\|
   '---' _|
~
 \ ~__
  <({E} )___/
  ( ._> / |
   '---' _|
~

   ~__
  <({E} )____|
  (_.__>_/_|
`,
```
Then draw goose, blob, cat, dragon and octopus, and close the object with `}`.

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 307 pass, 0 fail. A failing art test names the stage, species and frame that broke a rule. Fix the drawing, never the test.

- [ ] **Step 5: The review stop**

```bash
node tools/art-sheet.mjs
```
Show the person `docs/art/stages.txt`, pointing them at the hatchling and elder blocks for these six species. Ask what to change. Make the changes they ask for, re-run Steps 4 and 5, and repeat until they approve this group. Don't start Task 10 before then.

- [ ] **Step 6: Commit**

```bash
git add tools/art-sheet.mjs buddy/hooks/art-hatchling.ts buddy/hooks/art-elder.ts docs/art/stages.txt
git commit -F - <<'EOF'
feat: hatchlings and elders for the duck, goose, blob, cat, dragon and octopus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Hatchling and elder art: owl, penguin, turtle, snail, ghost, axolotl

**Files:**
- Modify: `buddy/hooks/art-hatchling.ts`, `buddy/hooks/art-elder.ts`
- Modify: `docs/art/stages.txt` (generated)

**Interfaces:**
- Consumes: Task 9's `HATCHLING` and `ELDER` objects and `tools/art-sheet.mjs`.
- Produces: `HATCHLING` and `ELDER` entries for owl, penguin, turtle, snail, ghost and axolotl.

**The rules every drawing keeps.** `sprites.test.ts` checks each of these:
- **Format.** Each entry is a `String.raw` template that starts with a newline, holding 5 sections split by lines with only `~`: rest, fidget B, flinch, celebrate, sleep. Each section is exactly 4 lines; an empty line is a blank row and counts. Lines start at column 0 of the file. `{E}` marks each eye, at least once in every section. Use no backticks and no `${`.
- **Width,** counting `{E}` as 1 column: rest rows at most 11 (fidget A draws the rest frame a column to the right), every other section at most 12.
- **Hatchlings:** at most 3 non-blank rows and at most 9 columns in every section, standing on the bottom row with blank rows first. The head sits near column 6, under the hats.
- **Nothing above the head.** In every section, the rows above the rest frame's first non-blank row are blank. The hat, hearts, confetti and zZ are drawn there.
- **Poses read like the adult's:** flinch jolts (often a `!`), celebrate raises wings or arms or jumps, sleep lies lower. Their eyes are drawn as `O`, `^` and `-`. Each pose differs from the rest frame.
- **Elders:** the adult's size with marks of age; no section may equal the adult's.
- **Original art,** in the original's style, never copied from anywhere.

Task 9's duck entries in `art-hatchling.ts` and `art-elder.ts` show the format and the size of each stage.

**Direction for this group:**

| Species | Hatchling | Elder |
|-|-|-|
| owl | a fluffy owlet ball, two big eyes, no ear tufts yet | long ear tufts like eyebrows, a feathered beard, spectacles around the eyes |
| penguin | a fuzzy chick in one colour, no white front | a bent stance, a tuft on its head, a cane |
| turtle | a tiny domed shell, the head poking out | a mossy shell (`~` or `"` on top), a long beard, heavy feet |
| snail | a small spiral shell, short eye stalks | a big mossy shell, drooping eye stalks |
| ghost | a small sheet with a short wavy hem | a tattered, ragged hem, a trailing wisp, heavy brows |
| axolotl | tiny, with stubby gill nubs | long drooping gills like a moustache, a wrinkled smile |

- [ ] **Step 1: Draw the hatchlings**

In `buddy/hooks/art-hatchling.ts`, add six entries after `octopus`, in this order: owl, penguin, turtle, snail, ghost, axolotl.

- [ ] **Step 2: Draw the elders**

In `buddy/hooks/art-elder.ts`, add six entries after `octopus`, in the same order.

- [ ] **Step 3: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 307 pass, 0 fail. A failing art test names the stage, species and frame that broke a rule. Fix the drawing, never the test.

- [ ] **Step 4: The review stop**

```bash
node tools/art-sheet.mjs
```
Show the person `docs/art/stages.txt`, pointing them at the hatchling and elder blocks for these six species. Ask what to change. Make the changes they ask for, re-run Steps 3 and 4, and repeat until they approve this group. Don't start Task 11 before then.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/art-hatchling.ts buddy/hooks/art-elder.ts docs/art/stages.txt
git commit -F - <<'EOF'
feat: hatchlings and elders for the owl, penguin, turtle, snail, ghost and axolotl

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Hatchling and elder art: capybara, cactus, robot, rabbit, mushroom, chonk; every stage complete

**Files:**
- Modify: `buddy/hooks/art-hatchling.ts`, `buddy/hooks/art-elder.ts`
- Modify: `buddy/hooks/sprites.ts`
- Modify: `buddy/hooks/buddy.test.tsx`
- Modify: `docs/art/stages.txt` (generated)

**Interfaces:**
- Consumes: Task 10's `HATCHLING` and `ELDER` objects and `tools/art-sheet.mjs`.
- Produces: `HATCHLING` and `ELDER` as complete `Record<Species, string>`; `bodyRows` with no fallback to the adult.

**The rules every drawing keeps.** `sprites.test.ts` checks each of these:
- **Format.** Each entry is a `String.raw` template that starts with a newline, holding 5 sections split by lines with only `~`: rest, fidget B, flinch, celebrate, sleep. Each section is exactly 4 lines; an empty line is a blank row and counts. Lines start at column 0 of the file. `{E}` marks each eye, at least once in every section. Use no backticks and no `${`.
- **Width,** counting `{E}` as 1 column: rest rows at most 11 (fidget A draws the rest frame a column to the right), every other section at most 12.
- **Hatchlings:** at most 3 non-blank rows and at most 9 columns in every section, standing on the bottom row with blank rows first. The head sits near column 6, under the hats.
- **Nothing above the head.** In every section, the rows above the rest frame's first non-blank row are blank. The hat, hearts, confetti and zZ are drawn there.
- **Poses read like the adult's:** flinch jolts (often a `!`), celebrate raises wings or arms or jumps, sleep lies lower. Their eyes are drawn as `O`, `^` and `-`. Each pose differs from the rest frame.
- **Elders:** the adult's size with marks of age; no section may equal the adult's.
- **Original art,** in the original's style, never copied from anywhere.

Task 9's duck entries in `art-hatchling.ts` and `art-elder.ts` show the format and the size of each stage.

**Direction for this group:**

| Species | Hatchling | Elder |
|-|-|-|
| capybara | a small round pup | grey whisker tufts, a heavier sit, a cane |
| cactus | a sprout with two seed leaves in a tiny pot | taller, its arms drooping, a flower on top |
| robot | a small cube with one antenna | rust spots (`%`), a bent antenna, a patched panel |
| rabbit | short ears, a round body | one ear flopped over, a tuft of beard, a cane |
| mushroom | a button mushroom, a small cap on a short stem | a wide drooping cap with spots, a beard of gills |
| chonk | a small round kitten-chonk | even rounder, a beard, slumped low |

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/buddy.test.tsx`, replace
```ts
import { zeroCounts } from './ledger'
```
with:
```ts
import { zeroCounts } from './ledger'
import { HAT_ART, bodyRows, fillEyes, headRow } from './sprites'
```
and append:
```tsx
// The body rows a sprite should show under its top row, eyes filled and padded as the band pads them.
const bodyBelowHead = (rest: string[], eye: string) => rest.slice(headRow(rest)).map(r => fillEyes(r, eye).padEnd(12))

test('a new buddy is a hatchling, its hat just above its head, and the tour can show the hatchlings', async ($, on) => {
  // 'tint-11' rolls a rare penguin with ° eyes in a wizard hat; with no counts it is a hatchling.
  const clock = world(on, { buddy: { ...RECORD, seed: 'tint-11' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const rest = bodyRows('penguin', 'hatchling', 0)
  const head = headRow(rest)
  const rows = await drawnSprite(ui)
  expect(head).toBeGreaterThan(0)
  expect(rows.slice(0, head).every(r => r.trim() === '')).toBe(true)
  expect(rows[head]).toBe(HAT_ART.wizard.padEnd(12))
  expect(rows.slice(head + 1)).toEqual(bodyBelowHead(rest, '°'))
  // The tour's first step is a plain common duck with · eyes.
  await runner($)('debug hatchling')
  const duck = bodyRows('duck', 'hatchling', 0)
  expect((await drawnSprite(ui)).slice(headRow(duck) + 1)).toEqual(bodyBelowHead(duck, '·'))
})

test('a buddy at level 30 is drawn as its elder, on the band and on the card', async ($, on) => {
  // 8,410 turns are 84,100 XP: level 30. What that earns is already earned, so nothing is announced.
  const elder: Saved = {
    ...ADULT,
    buddies: [{ ...ADULT.buddies[0]!, counts: { ...zeroCounts(), turns: 8_410 } }],
    you: {
      ...ADULT.you,
      earned: {
        grownUp: '2026-10-01T12:00:00.000Z',
        elder: '2026-10-02T12:00:00.000Z',
        thousandTurns: '2026-10-02T12:00:00.000Z',
      },
    },
  }
  const clock = world(on, { buddy: elder })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // 'test-seed' rolls a common ghost with ✦ eyes.
  const rest = bodyRows('ghost', 'elder', 0)
  const body = bodyBelowHead(rest, '✦')
  expect((await drawnSprite(ui)).slice(headRow(rest) + 1)).toEqual(body)
  expect(await cardText($)).toContain(body.join('\n'))
})
```

- [ ] **Step 2: Draw the hatchlings**

In `buddy/hooks/art-hatchling.ts`, add six entries after `axolotl`, in this order: capybara, cactus, robot, rabbit, mushroom, chonk.

- [ ] **Step 3: Draw the elders**

In `buddy/hooks/art-elder.ts`, add six entries after `axolotl`, in the same order.

- [ ] **Step 4: Every stage complete**

In `buddy/hooks/art-hatchling.ts`, replace
```ts
// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section. A species not drawn here yet is
// drawn as its adult.
import type { Species } from './roll'

export const HATCHLING: Partial<Record<Species, string>> = {
```
with:
```ts
// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section.
import type { Species } from './roll'

export const HATCHLING: Record<Species, string> = {
```
In `buddy/hooks/art-elder.ts`, replace
```ts
// The elder bodies (Progression spec section 5), in art-adult.ts's format: the adult's size with
// marks of age, every section drawn new, and nothing above the rest frame's head in any section.
// A species not drawn here yet is drawn as its adult.
import type { Species } from './roll'

export const ELDER: Partial<Record<Species, string>> = {
```
with:
```ts
// The elder bodies (Progression spec section 5), in art-adult.ts's format: the adult's size with
// marks of age, every section drawn new, and nothing above the rest frame's head in any section.
import type { Species } from './roll'

export const ELDER: Record<Species, string> = {
```
In `buddy/hooks/sprites.ts`, replace
```ts
// Each stage's bodies. A species a stage hasn't drawn yet is drawn as its adult.
const STAGE_ART: Record<Stage, Partial<Record<Species, string>>> = { hatchling: HATCHLING, adult: ADULT, elder: ELDER }

export function bodyRows(species: Species, stage: Stage, frame: Frame | Pose): string[] {
  const sections = parseArt(STAGE_ART[stage][species] ?? ADULT[species])
```
with:
```ts
// Each stage's bodies, every species drawn at every stage.
const STAGE_ART: Record<Stage, Record<Species, string>> = { hatchling: HATCHLING, adult: ADULT, elder: ELDER }

export function bodyRows(species: Species, stage: Stage, frame: Frame | Pose): string[] {
  const sections = parseArt(STAGE_ART[stage][species])
```

- [ ] **Step 5: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 309 pass, 0 fail. A failing art test names the stage, species and frame that broke a rule. Fix the drawing, never the test.

- [ ] **Step 6: The review stop**

```bash
node tools/art-sheet.mjs
grep -c 'not drawn yet' docs/art/stages.txt
```
Expected: `0`. Show the person `docs/art/stages.txt`, pointing them at the hatchling and elder blocks for these six species, and offer the whole sheet for one last look across all 18. Ask what to change. Make the changes they ask for, re-run Steps 5 and 6, and repeat until they approve.

- [ ] **Step 7: Commit**

```bash
git add buddy/hooks/art-hatchling.ts buddy/hooks/art-elder.ts buddy/hooks/sprites.ts buddy/hooks/buddy.test.tsx docs/art/stages.txt
git commit -F - <<'EOF'
feat: hatchlings and elders for the last six species, and every stage drawn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Type-check, version, README, and record what shipped

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-10-08-buddy-progression-design.md` (status line)

**Interfaces:**
- Consumes: the finished Progression build.
- Produces: a type-checked mod at version 0.5.0, a README that says what it saves and does, and an accurate spec status.

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
- `buddyLook`'s `{ ...own, ...tour.look }`, whose hat may now be an earned one: it goes only to `nameLine`, `spriteTint` and the tour's scene, never to `liveScene`, which takes `own`
- the `tourStage` atom's initial `'adult'`
- the conditional children in the card pane

- [ ] **Step 2: Bump the version**

In `buddy/.claude-plugin/plugin.json`, replace `"version": "0.4.0"` with `"version": "0.5.0"`.

- [ ] **Step 3: Update the README**

In `README.md`, replace
```
| `/buddy card` | Its card: name, species, rarity, stats, your streak and its lifetime counts |
| `/buddy journal` | The moments it remembers, newest first |
```
with:
```
| `/buddy card [who]` | Its card: name, species, rarity, level, stats, your streak, its lifetime counts and your achievements. Name a buddy from the dex, or give its number, to see that one's |
| `/buddy journal [who]` | The moments it remembers, newest first, or another buddy's from the dex |
| `/buddy dex` | Every buddy you've had, with its level and when it was with you |
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
```
Replace
```
It keeps a journal of up to 20 moments: its longest turn, its worst run of failed tool calls, its busiest turn, the 100th, 1,000th and 10,000th turn and the 1,000th, 10,000th and 100,000th tool call, a clean turn after a rough patch, and you coming back after days away. A comment after a turn like one it remembers calls back to it ("remember when Claude failed 18 shell commands in a row?"), and when you talk to it, it can bring them up.
```
with:
```
It keeps a journal of up to 20 moments: its longest turn, its worst run of failed tool calls, its busiest turn, the 100th, 1,000th and 10,000th turn and the 1,000th, 10,000th and 100,000th tool call, a clean turn after a rough patch, you coming back after days away, and growing up. A comment after a turn like one it remembers calls back to it ("remember when Claude failed 18 shell commands in a row?"), and when you talk to it, it can bring them up.

It grows up as you work together. Turns, tool calls, rough turns it sat through, pets and talks earn it XP, and its level shows on its name line and its card. It hatches small, grows into an adult at level 10 and an elder at level 30, and each level lifts its weaker stats a little, so a buddy that never spoke up when a tool failed may start to. Seventeen achievements mark what you've done across every buddy you've had, like 500 shell commands, a 30-minute turn or a 30-day streak, and six of them unlock a hat no roll gives. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.
```
Replace
```
  - when you pet it or talk to it
```
with:
```
  - when you pet it or talk to it
  - once when a swap brings a buddy back, to say hello
```
Replace
```
  Moods, reactions, holidays, the journal and the line it says when a tool fails need no model call.
```
with:
```
  Moods, reactions, holidays, the journal, levels, achievements and the line it says when a tool fails need no model call.
```
Replace
```
the days you've visited. Never prompt text, answers, file contents or command arguments.
```
with:
```
the days you've visited, and the achievements you've earned, each with when you earned it. Its XP, level and stage aren't saved: they're worked out from its counts. Never prompt text, answers, file contents or command arguments.
```
Replace
```
These are point-in-time records: each spec's status line lists what changed during its build.
```
with:
```
Levels, achievements, evolution and the dex come from [`docs/specs/2026-10-08-buddy-progression-design.md`](docs/specs/2026-10-08-buddy-progression-design.md) and its plan, [`docs/specs/2026-10-08-buddy-progression-plan.md`](docs/specs/2026-10-08-buddy-progression-plan.md), and [`docs/art/stages.txt`](docs/art/stages.txt) shows every species at every stage. These are point-in-time records: each spec's status line lists what changed during its build.
```

- [ ] **Step 4: Record what shipped**

```bash
sed -i "s|^\*\*Status:\*\* designed 2026-10-08; not built yet\.$|**Status:** built $(date +%F); live check pending. Plan: [\`2026-10-08-buddy-progression-plan.md\`](2026-10-08-buddy-progression-plan.md); its \"Deliberate deviations\" section lists nine small departures from this spec.|" docs/specs/2026-10-08-buddy-progression-design.md
head -3 docs/specs/2026-10-08-buddy-progression-design.md
```
Expected: the third line is the new status line with today's date.

- [ ] **Step 5: Final full run**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 309 pass, 0 fail. Validation passes, and its `state writes:` and `state reads:` lines include `buddy.cardSeed`, `buddy.journalSeed` and `buddy.tourStage`.

- [ ] **Step 6: Commit**

```bash
git add buddy/.claude-plugin/plugin.json README.md docs/specs/2026-10-08-buddy-progression-design.md
git commit -F - <<'EOF'
chore: buddy 0.5.0, with Progression recorded as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: See it live**

The installed buddy runs the copy cached from GitHub, so it only picks up the change from `main`. Ask the person before pushing or merging. Once it's on `main`:
```bash
claude plugin update buddy@buddy-mods
```
Then, in a session, in the terminal and in the Desktop Code tab:
1. Run `/reload-plugins`. The first turn's save earns whatever you've already done; expect an `Earned …` bubble.
2. Look at the name line: `Lv N` before the species. A buddy under level 10 is now a hatchling.
3. Run `/buddy card`: the level, the XP bar and your achievements under the hatch row.
4. Run `/buddy debug hatchling`, then `/buddy debug elder`, then `/buddy debug`, each to its end or `/buddy debug off`: every species at each stage, with the hats on their heads.
5. Run `/buddy dex`, then `/buddy card #1` and `/buddy journal #1`.
6. With two or more buddies, run `/buddy swap #1`, then swap back.
7. Close each pane with Escape.

Report what was seen. Once it checks out:
- Change the spec's status line from `live check pending` to `live-checked` with the date, and commit that.
- Close issues #11, #12, #13 and #14 with a pointer to the merge.
- Tick them in the roadmap issue, #18.
