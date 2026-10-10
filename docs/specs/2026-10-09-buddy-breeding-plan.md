# `buddy` Breeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New buddies come from eggs: one mulligan at the start in place of free rerolls, an egg earned every 8,100 XP and carried in the band until it hatches into the dex after 150 turns, and, from five buddies, `/buddy breed <who>` to choose the two adults that brood it, so the hatchling takes after both.

**Architecture:** Two new pure modules carry the rules:
- `breed.ts`: a bred buddy's bones, drawn from its own seed and its parents' born bones, and `bornBones`, the lookup every reader of bones now goes through. Bones stay unsaved.
- `eggs.ts`: XP and turns summed over every buddy, the eggs earned and owed, how an egg reads and how far along it is, the mulligan's window, and the egg status a reply gives.

`record.ts` gains the mulligan in place of the reroll, an egg started in `flush`, and the `breed` and `hatchEgg` changes. `achievements.ts` and `voice.ts` announce a hatch and a new egg. `sprites.ts`, `layout.ts`, `tour.ts` and `card.ts` draw the egg in the band, on the card and in the debug tour. `register.tsx` stays wiring only: the `breed` command, the mulligan's replies, `hatchIfDue` after every adopting commit and at session start, and the egg in the band.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.293 when this was written) for `claude plugin test` and `claude plugin validate`, and TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-09-buddy-breeding-design.md`](2026-10-09-buddy-breeding-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md), Foundation [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md), Alive [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md), Memory [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md), Progression [`2026-10-08-buddy-progression-design.md`](2026-10-08-buddy-progression-design.md) and Interaction [`2026-10-08-buddy-interaction-design.md`](2026-10-08-buddy-interaction-design.md).

**Starting point:** branch `claude/roadmap-f-section-213e11` at this plan's commit, on top of the spec commit `69ee33d`, on top of `main` at `a855b0e`. 388 tests pass.

**Checked before handoff:** the code blocks below were taken out of this file and applied to a fresh copy of the repo at `69ee33d`, task by task and tests first. Each Step 2 failed as described, each Step 4 reached its stated pass count, and the result type-checks and validates.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block that runs Claude Code starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text, as it stands after the earlier tasks and the earlier blocks of the same task, top to bottom. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit. A "Create" writes a new file with that content and a final newline.
- **Tests first.** Each task's Step 1 edits only test files and Step 3 only the rest, so Step 2 sees the tests fail before the code exists.
- **Line endings:** LF. Write files with the editor tools or Node's `fs.writeFileSync`, never a Python `write_text` on Windows, which writes CRLF.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared at the top level of the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`, and every key is declared in `PluginState` in `buddy/types/index.d.ts`.
- **Tests find elements by text or type, never by `key`.** In the band, only sprite rows may set `bold`.
- **No Node or DOM in the mod.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **No import cycles.** `breed.ts` imports only `roll.ts`; `eggs.ts` imports `breed.ts`, `ledger.ts` and `progress.ts`; nothing those import may import them back.
- **Every hook catches its own errors** and lets the event continue. Work started from a hook goes through `later`, so a tool result or a turn never waits on a state write. Nothing inside `commitNow` may call `commit`: `hatchIfDue` runs through `later`.
- **Model calls:** the only new one is the hatch's soul call, through `askSoul`, with model `haiku`, `maxTokens: 200` and `timeoutMs: 8000`, as the first hatch makes. An egg's hatch makes no hello. Earning, carrying, brooding, the announcements and the mulligan's refusals call no model.
- **Privacy:** nothing new reads prompt text, answers, file contents or command arguments. A brooded egg's hatch prompt carries its parents' names, species and personalities, which the record already holds.
- **Forward compatibility:** the schema stays at 2. Every change starts from the stored object and spreads it, so fields a newer build wrote survive. New saved fields are optional: `you.eggs`, `egg` and a buddy's `parents`.
- **Bones are never saved.** A bred buddy's come from `breedBones(seed, bornBones(parent0), bornBones(parent1))` every time. `breedBones`' draw order is a compatibility contract, pinned by a golden test.
- **Time zones:** tests build local times with `new Date(y, monthIndex, d, h, min)`, never from a `Z` string.
- **Numbers** (spec sections 2 to 6):

  | What | Value |
  |-|-|
  | An egg | one for every 8,100 XP summed over every buddy's saved counts (`EGG_XP`); one at a time, the rest wait |
  | Hatching | 150 turns summed over every buddy after the egg starts (`HATCH_TURNS`), the same for every egg |
  | The mulligan | once: one buddy in the dex, under level 2 (`MULLIGAN_LEVEL`), `rerolls` at 0; it replaces buddy #1 in place |
  | Breeding | 5 in the dex (`BREED_DEX`); both buddies level 10 or more; parents can't change once set |
  | Inheritance | rarity rolled, never below the lower parent's; species and eye 50/50; 3 stats copied, clamped to `[max(1, F − 10), min(100, F + 79)]`; 2 fresh at `F + r(40)`; shiny 1%, 4% with a shiny parent |
  | The band | a 7-column gutter (`EGG_GUTTER`) after the sprite, the 3 × 5 egg on rows 2 to 4; the bubble is `min(bodyColumns − 21, 80)` wide with an egg out |
  | Wobble | under 0.5 along: a lean at ticks 8 and 9; under 0.9: 4 and 5, 12 and 13; from 0.9: every 4 ticks, cracked; hatching: cracked, leaning every tick; still while asleep |
  | The tour | 4 egg steps of 16 ticks after the moods: 700 ticks in all |

- **Exact text:**

  | Where | Text |
  |-|-|
  | Mulligan | `This replaces Pip, a common duck, for good. Run /buddy reroll confirm.`; the first hatch adds `Not the one? /buddy reroll works once, before level 2.` |
  | Rerolls over | `No more rerolls. ` then the egg status |
  | Egg status | `An egg is on the way: 40 of 150 turns.`, `Your next egg starts after the next turn.`, `Your next egg comes in 3,200 xp.` |
  | A hatch onto a record | `Rex is already here.` |
  | Breed refusals | `Wait for the egg to hatch.`, `The egg is hatching.`, `Breeding unlocks at 5 buddies in the dex: 2 to go.`, `No egg to brood. ` then the egg status, `Pip and Mochi are already brooding this egg.`, `Pip can't breed with itself. Pick one from /buddy dex.`, `Mochi is level 6. Buddies breed from level 10.` |
  | Breed | `Pip and Mochi are brooding the egg. It hatches in 110 turns.` (`1 turn`; `It hatches any moment now.` when due) |
  | News | `The egg hatched! Meet Sprout, a rare owl. Run /buddy swap Sprout.` (`a shiny rare owl`; `#6` when the name is shared), `An egg! It hatches in 150 turns.`, `Breeding unlocked.` after Collector |
  | Hatch prompt | `Parents: Pip, a duck ("…"), and Mochi, a cat ("…"). Take after them a little; the name is your own.` |
  | Journal | `brooded an egg with Mochi` (`brooded an egg` with no name), `hatched after 150 turns in the egg` |
  | Card text | `Hatched 2026-10-09 from #1 Pip and #3 Mochi   Rerolls: 1`, `Achievements: 7 of 17 · Next egg 3,200 / 8,100 xp`, `· Egg 40 / 150 turns` |
  | Card SVG | `Parents  #1 Pip × #3 Mochi`, `Next egg` and `3,200 / 8,100 xp`, `Egg` and `40 / 150 turns`, `brooded by Pip and Mochi` |
  | Card alt | `Bred from Pip and Mochi.`, `Next egg at 3,200 of 8,100 XP.`, `An egg is 40 of 150 turns along, brooded by Pip and Mochi.` |
  | Dex | `hatched Oct 9` for a hatchling never yet active |
  | Usage | `Usage: /buddy [pet \| feed \| play [game] \| card [who] \| journal [who] \| dex \| swap <who> \| breed <who> \| rename <name> \| hat [hat] \| mute \| unmute \| off \| reroll [confirm]]` |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. `flush`'s and `hatchEgg`'s `eggSeed` are optional. A flush without one starts no egg; the egg stays owed and starts at the next flush, which `register.tsx` always gives a seed.
2. `eggs.ts` names its helpers for what they return: `dueEgg` returns the egg, or null, in place of the spec's boolean `eggDue`, and `owedEggs` is the spec's `owed`. It also holds `earnedEggs`, `startEgg`, `withEggCount`, `eggXpSoFar`, `hatchesIn`, `BREED_DEX` and `MULLIGAN_LEVEL`, and the mulligan's lines, `MULLIGAN_NOTE` and `closedLine`, sit there beside `eggStatus` rather than in `voice.ts`.
3. The breed refusals come from `breedChoice` in `record.ts`, which the `breed` change also runs on the fresh record, so the command and the change can't disagree.
4. `/buddy` doesn't call `hatchIfDue` itself: its mode commit adopts the record, and every adopting commit checks for a due egg.
5. The dex's alt text reads the short dates its rows show (`hatched Oct 9`), as its date spans already do (`Oct 7 to Nov 2`), not `hatched October 9`.
6. The terminal card pane's hatch line is the text card's (`hatchLine`), so it names the parents too.
7. `journalLines` takes the dex before its limit: `journalLines(name, journal, now, buddies?, limit = 10)`. Nothing passed a limit.
8. The debug reply still says `then the holidays and moods`; the egg phase follows the moods unnamed, as the command is hidden.
9. `CardProgress` gains `parents` and `egg` as optional fields, so a progress built without them, as the older card tests build one, draws no new row.
10. Tests that used a reroll to put a second buddy in the dex now use the mulligan on a one-buddy record, or a record built with two. Tests whose buddy reaches level 10 from a record with no eggs now also hear `An egg! It hatches in 150 turns.`, since those 8,100 XP earn the first egg.
11. The first hatch and the egg's hatch share `askSoul`, the soul call taken out of `hatch`.

---

### Task 1: Bred bones, looked up through the record

**Files:**
- Create: `buddy/hooks/breed.ts`, `buddy/hooks/breed.test.ts`
- Modify: `buddy/types/index.d.ts`, `buddy/hooks/roll.ts`
- Modify: `buddy/hooks/progress.ts`, `buddy/hooks/progress.test.ts`
- Modify: `buddy/hooks/toys.ts`, `buddy/hooks/toys.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/layout.ts`, `buddy/hooks/register.tsx`

**Interfaces:**
- Consumes: `rngFor`, `rollBones`, `RARITY`, `RARITIES`, `STATS` from `roll.ts`; `grow`, `levelOf` from `progress.ts`.
- Produces:
  - `int`, `pick` and `pickRarity` exported from `roll.ts`, unchanged
  - `parents?: [string, string]` on `Buddy`
  - from `breed.ts`: `COPIED_STATS`, `SHINY_CHANCE`, `SHINY_PARENT_CHANCE`, `statRange(rarity: Rarity): [number, number]`, `breedBones(seed: string, a: Bones, b: Bones): Bones`, `parentsOf(buddies: readonly Pick<Buddy, 'seed'>[], raw: unknown): [string, string] | null`, `bornBones(buddies: readonly Buddy[], seed: string): Bones`
  - `bonesFor(b: { seed: string; counts?: unknown }, buddies: readonly Buddy[]): Bones` in `progress.ts`
  - `Kin = Pick<Saved, 'you' | 'buddies'>` in `toys.ts`; `wearable(buddy, kin)`, `wornHat(buddy, kin)` and `dressed(buddy, kin)` take it in place of `you`

Nothing anyone can see changes: no buddy has parents yet, and `bornBones` of a rolled buddy is `rollBones`. Every reader of a buddy's bones now goes through the record, so a bred buddy will be drawn, voiced and dressed as bred from the start. The child inherits its parents' born bones, never their grown ones.

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/breed.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy } from '../types'
import { breedBones, bornBones, parentsOf, statRange } from './breed'
import { zeroCounts } from './ledger'
import { RARITIES, STATS, rollBones } from './roll'
import type { Bones } from './roll'

// 'tint-11' rolls a plain rare penguin and 'hat-10' an uncommon capybara in a crown: two species,
// two eyes and two rarities, so every draw can be told apart.
const A = rollBones('tint-11')
const B = rollBones('hat-10')

const entry = (seed: string, parents?: unknown): Buddy => ({
  seed,
  soul: { name: seed, personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' },
  retiredAt: null,
  counts: zeroCounts(),
  ...(parents === undefined ? {} : { parents: parents as [string, string] }),
})

test('the parents are as their seeds say', () => {
  expect([A.rarity, A.species, B.rarity, B.species]).toEqual(['rare', 'penguin', 'uncommon', 'capybara'])
  expect(A.eye).not.toBe(B.eye)
})

test("a stat's range at each rarity runs from the lowest low to the highest peak", () => {
  expect(RARITIES.map(statRange)).toEqual([
    [1, 84],
    [5, 94],
    [15, 100],
    [25, 100],
    [40, 100],
  ])
})

// A compatibility contract, as rollBones' golden vectors are: a bred buddy keeps only its seed and
// its parents' seeds, so changing breedBones changes every bred buddy.
test('the same seed and parents always give the same child, pinned', () => {
  expect(breedBones('child-1', A, B)).toEqual(breedBones('child-1', A, B))
  expect(breedBones('golden-child', A, B)).toEqual({
    rarity: 'rare',
    species: 'penguin',
    eye: '·',
    hat: 'tophat',
    shiny: false,
    stats: { DEBUGGING: 54, PATIENCE: 60, CHAOS: 43, WISDOM: 55, SNARK: 83 },
    peak: 'SNARK',
    low: 'CHAOS',
  })
})

test('species and eye come from either parent half the time, and rarity never drops below the lower parent', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  let speciesA = 0
  let eyeA = 0
  for (let i = 0; i < N; i++) {
    const c = breedBones(`breed-${i}`, A, B)
    expect([A.species, B.species]).toContain(c.species)
    expect([A.eye, B.eye]).toContain(c.eye)
    expect(RARITIES.indexOf(c.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('uncommon'))
    if (c.species === A.species) speciesA++
    if (c.eye === A.eye) eyeA++
  }
  expect(Math.abs((speciesA / N) * 100 - 50)).toBeLessThanOrEqual(1)
  expect(Math.abs((eyeA / N) * 100 - 50)).toBeLessThanOrEqual(1)
})

test('a child is shiny 1 time in 100, or 4 with a shiny parent', { timeoutMs: 30_000 }, () => {
  const N = 100_000
  let plain = 0
  let parented = 0
  const shinyA = { ...A, shiny: true }
  for (let i = 0; i < N; i++) {
    if (breedBones(`shine-${i}`, A, B).shiny) plain++
    if (breedBones(`shine-${i}`, B, shinyA).shiny) parented++
  }
  expect(Math.abs((plain / N) * 100 - 1)).toBeLessThanOrEqual(0.3)
  expect(Math.abs((parented / N) * 100 - 4)).toBeLessThanOrEqual(0.3)
})

test("every stat is inside the child's range, and at least 3 are a parent's, clamped into it", { timeoutMs: 30_000 }, () => {
  // A legendary parent's stats run past what an uncommon child may have.
  const big = rollBones('golden-legend')
  const legend: Bones = { ...big, rarity: 'legendary', stats: { DEBUGGING: 100, PATIENCE: 99, CHAOS: 98, WISDOM: 97, SNARK: 96 } }
  for (let i = 0; i < 20_000; i++) {
    const c = breedBones(`stat-${i}`, legend, B)
    const [lo, hi] = statRange(c.rarity)
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v))
    let fromParent = 0
    for (const s of STATS) {
      expect(c.stats[s]).toBeGreaterThanOrEqual(lo)
      expect(c.stats[s]).toBeLessThanOrEqual(hi)
      if (c.stats[s] === clamp(legend.stats[s]) || c.stats[s] === clamp(B.stats[s])) fromParent++
    }
    expect(fromParent).toBeGreaterThanOrEqual(3)
  }
})

test('the peak is the first highest stat and the low the first lowest of the rest', { timeoutMs: 30_000 }, () => {
  // Parents with every stat alike make ties common.
  const even: Bones = { ...A, stats: { DEBUGGING: 40, PATIENCE: 40, CHAOS: 40, WISDOM: 40, SNARK: 40 } }
  let tied = 0
  for (let i = 0; i < 5_000; i++) {
    const c = breedBones(`tie-${i}`, even, even)
    const values = STATS.map(s => c.stats[s])
    const top = Math.max(...values)
    expect(c.peak).toBe(STATS[values.indexOf(top)])
    const rest = STATS.filter(s => s !== c.peak)
    const bottom = Math.min(...rest.map(s => c.stats[s]))
    expect(c.low).toBe(rest.find(s => c.stats[s] === bottom))
    if (values.filter(v => v === top).length > 1) tied++
  }
  expect(tied).toBeGreaterThan(0)
})

test('a parents field reads as two seeds in the record, or as none', () => {
  const buddies = [entry('a'), entry('b')]
  expect(parentsOf(buddies, ['a', 'b'])).toEqual(['a', 'b'])
  for (const raw of [undefined, 'a', ['a'], ['a', 'b', 'a'], ['a', 7], ['a', 'gone'], { 0: 'a', 1: 'b' }]) {
    expect([raw, parentsOf(buddies, raw)]).toEqual([raw, null])
  }
})

test("a buddy's born bones are rolled, bred from its parents', or bred down the generations", () => {
  const buddies = [entry('a'), entry('b'), entry('c', ['a', 'b']), entry('g', ['c', 'a'])]
  expect(bornBones(buddies, 'a')).toEqual(rollBones('a'))
  expect(bornBones(buddies, 'c')).toEqual(breedBones('c', rollBones('a'), rollBones('b')))
  expect(bornBones(buddies, 'g')).toEqual(breedBones('g', breedBones('c', rollBones('a'), rollBones('b')), rollBones('a')))
  // A seed with no entry at all, as a buddy just hatched has, is rolled.
  expect(bornBones(buddies, 'new')).toEqual(rollBones('new'))
})

test('damaged parents, a missing parent or a loop read as a plain roll and never throw', () => {
  for (const raw of ['a', ['a'], ['a', 7], ['a', 'gone']]) {
    expect(bornBones([entry('a'), entry('x', raw)], 'x')).toEqual(rollBones('x'))
  }
  // Its own parent.
  expect(bornBones([entry('a'), entry('x', ['x', 'a'])], 'x')).toEqual(rollBones('x'))
  // Each the other's parent: each reads the other as a plain roll.
  const loop = [entry('p', ['q', 'r']), entry('q', ['p', 'r']), entry('r')]
  expect(bornBones(loop, 'p')).toEqual(breedBones('p', rollBones('q'), rollBones('r')))
  expect(bornBones(loop, 'q')).toEqual(breedBones('q', rollBones('p'), rollBones('r')))
})
```

In `buddy/hooks/progress.test.ts`, replace:
```ts
import { expect, test } from 'claude-code/testing'

import type { Counts } from '../types'
import { zeroCounts } from './ledger'
import {
```
with:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy, Counts } from '../types'
import { breedBones } from './breed'
import { zeroCounts } from './ledger'
import {
```

In `buddy/hooks/progress.test.ts`, replace:
```ts
})

test("a buddy's bones are its seed's, grown by its saved counts", () => {
  expect(bonesFor({ seed: 'test-seed' })).toEqual(rollBones('test-seed'))
  // 'test-seed' rolls a common ghost: DEBUGGING 7, PATIENCE 30, CHAOS 31, WISDOM 59 (its peak)
  // and SNARK 9. Level 40 lifts all but the peak to 34.
  expect(bonesFor({ seed: 'test-seed', counts: worth(152_100) }).stats).toEqual({
    DEBUGGING: 34,
    PATIENCE: 34,
```
with:
```ts
})

test("a buddy's bones are its seed's, grown by its saved counts", () => {
  expect(bonesFor({ seed: 'test-seed' }, [])).toEqual(rollBones('test-seed'))
  // 'test-seed' rolls a common ghost: DEBUGGING 7, PATIENCE 30, CHAOS 31, WISDOM 59 (its peak)
  // and SNARK 9. Level 40 lifts all but the peak to 34.
  expect(bonesFor({ seed: 'test-seed', counts: worth(152_100) }, []).stats).toEqual({
    DEBUGGING: 34,
    PATIENCE: 34,
```

In `buddy/hooks/progress.test.ts`, replace:
```ts
    SNARK: 34,
  })
})

const NOON = new Date(2026, 9, 7, 12).getTime()
```
with:
```ts
    SNARK: 34,
  })
})

test("a bred buddy's bones are bred from its parents' in the record, then grown", () => {
  const entry = (seed: string, parents?: [string, string]): Buddy => ({
    seed,
    soul: { name: seed, personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' },
    retiredAt: null,
    counts: zeroCounts(),
    ...(parents ? { parents } : {}),
  })
  const child = { ...entry('golden-child', ['tint-11', 'hat-10']), counts: worth(152_100) }
  const buddies = [entry('tint-11'), entry('hat-10'), child]
  expect(bonesFor(child, buddies)).toEqual(grow(breedBones('golden-child', rollBones('tint-11'), rollBones('hat-10')), 40))
  // Without its parents in the list, it is its seed's roll.
  expect(bonesFor(child, [child])).toEqual(grow(rollBones('golden-child'), 40))
})

const NOON = new Date(2026, 9, 7, 12).getTime()
```

In `buddy/hooks/toys.test.ts`, replace:
```ts
import { zeroCounts } from './ledger'
import { bonesFor } from './progress'
import {
  FULL_LINES, FULL_MS, HAT_NAME, PLAY_FALLBACKS, SNACKS, THROWS, dressed, feedFallback, feedPrompt, fullLine, hatChoice,
```
with:
```ts
import { zeroCounts } from './ledger'
import { bonesFor } from './progress'
import { rollBones } from './roll'
import {
  FULL_LINES, FULL_MS, HAT_NAME, PLAY_FALLBACKS, SNACKS, THROWS, dressed, feedFallback, feedPrompt, fullLine, hatChoice,
```

In `buddy/hooks/toys.test.ts`, replace:
```ts
const CROWNED = { seed: 'hat-10' }
const BARE = { seed: 'test-seed' }

test('a buddy can wear its own rolled hat, every hat you have earned, or none', () => {
  expect(wearable(CROWNED, EARNED)).toEqual(['crown', 'flowercrown', 'laurel', 'none'])
  expect(wearable(BARE, EARNED)).toEqual(['flowercrown', 'laurel', 'none'])
  expect(wearable(BARE, NOBODY)).toEqual(['none'])
})

test('a buddy wears its choice when it can, and the hat it rolled otherwise', () => {
  expect(wornHat(CROWNED, EARNED)).toBe('crown')
  expect(wornHat({ ...CROWNED, hat: 'none' }, EARNED)).toBe('none')
  expect(wornHat({ ...CROWNED, hat: 'laurel' }, EARNED)).toBe('laurel')
  expect(wornHat({ ...CROWNED, hat: 'crown' }, EARNED)).toBe('crown')
  // Not earned, another buddy's rolled hat, unknown, and not a string.
  expect(wornHat({ ...CROWNED, hat: 'hardhat' }, EARNED)).toBe('crown')
  expect(wornHat({ ...BARE, hat: 'crown' }, EARNED)).toBe('none')
  expect(wornHat({ ...BARE, hat: 'jetpack' }, EARNED)).toBe('none')
  expect(wornHat({ ...CROWNED, hat: 7 } as unknown as Buddy, EARNED)).toBe('crown')
  const drawn = dressed({ ...CROWNED, counts: zeroCounts(), hat: 'laurel' }, EARNED)
  expect(drawn).toEqual({ ...bonesFor(CROWNED), hat: 'laurel' })
})

test('a hat asked for by name, in any case and with spaces, is worn or refused with the reason', () => {
  const can = wearable(CROWNED, EARNED)
  const ask = (words: string, worn: 'crown' | 'none' = 'crown') => hatChoice({ name: 'Pip', words, worn, can })
  expect(ask('laurel')).toEqual({ wear: 'laurel' })
```
with:
```ts
const CROWNED = { seed: 'hat-10' }
const BARE = { seed: 'test-seed' }
// Your achievements with nobody in the dex: every buddy here is its seed's roll.
const KIN = { you: EARNED, buddies: [] }

test('a buddy can wear its own rolled hat, every hat you have earned, or none', () => {
  expect(wearable(CROWNED, KIN)).toEqual(['crown', 'flowercrown', 'laurel', 'none'])
  expect(wearable(BARE, KIN)).toEqual(['flowercrown', 'laurel', 'none'])
  expect(wearable(BARE, { you: NOBODY, buddies: [] })).toEqual(['none'])
})

test("a bred buddy's rolled hat is the one its bred bones give", () => {
  const entry = (seed: string, parents?: [string, string]): Buddy => ({
    seed,
    soul: { name: seed, personality: 'x', hatchedAt: AT },
    retiredAt: null,
    counts: zeroCounts(),
    ...(parents ? { parents } : {}),
  })
  // 'bred-4' bred from 'tint-11' and 'hat-10' is an uncommon penguin in a crown; its own roll is
  // a common octopus with no hat.
  const child = entry('bred-4', ['tint-11', 'hat-10'])
  const kin = { you: NOBODY, buddies: [entry('tint-11'), entry('hat-10'), child] }
  expect(rollBones('bred-4').hat).toBe('none')
  expect(wearable(child, kin)).toEqual(['crown', 'none'])
  expect(wornHat(child, kin)).toBe('crown')
  expect(dressed(child, kin).hat).toBe('crown')
})

test('a buddy wears its choice when it can, and the hat it rolled otherwise', () => {
  expect(wornHat(CROWNED, KIN)).toBe('crown')
  expect(wornHat({ ...CROWNED, hat: 'none' }, KIN)).toBe('none')
  expect(wornHat({ ...CROWNED, hat: 'laurel' }, KIN)).toBe('laurel')
  expect(wornHat({ ...CROWNED, hat: 'crown' }, KIN)).toBe('crown')
  // Not earned, another buddy's rolled hat, unknown, and not a string.
  expect(wornHat({ ...CROWNED, hat: 'hardhat' }, KIN)).toBe('crown')
  expect(wornHat({ ...BARE, hat: 'crown' }, KIN)).toBe('none')
  expect(wornHat({ ...BARE, hat: 'jetpack' }, KIN)).toBe('none')
  expect(wornHat({ ...CROWNED, hat: 7 } as unknown as Buddy, KIN)).toBe('crown')
  const drawn = dressed({ ...CROWNED, counts: zeroCounts(), hat: 'laurel' }, KIN)
  expect(drawn).toEqual({ ...bonesFor(CROWNED, []), hat: 'laurel' })
})

test('a hat asked for by name, in any case and with spaces, is worn or refused with the reason', () => {
  const can = wearable(CROWNED, KIN)
  const ask = (words: string, worn: 'crown' | 'none' = 'crown') => hatChoice({ name: 'Pip', words, worn, can })
  expect(ask('laurel')).toEqual({ wear: 'laurel' })
```

In `buddy/hooks/toys.test.ts`, replace:
```ts
})

test('the hat list, and what is said around a new hat', () => {
  expect(hatList('Pip', 'crown', wearable(CROWNED, EARNED))).toBe(
    'Pip is wearing a crown. It can wear: crown, flowercrown, laurel, none.',
  )
```
with:
```ts
})

test('the hat list, and what is said around a new hat', () => {
  expect(hatList('Pip', 'crown', wearable(CROWNED, KIN))).toBe(
    'Pip is wearing a crown. It can wear: crown, flowercrown, laurel, none.',
  )
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 376 pass and 7 fail:
- `breed.test.ts` doesn't load
- `progress.test.ts` doesn't load
- `toys.test.ts`: a buddy can wear its own rolled hat, every hat you have earned, or none
- `toys.test.ts`: a bred buddy's rolled hat is the one its bred bones give
- `toys.test.ts`: a buddy wears its choice when it can, and the hat it rolled otherwise
- `toys.test.ts`: a hat asked for by name, in any case and with spaces, is worn or refused with the reason
- `toys.test.ts`: the hat list, and what is said around a new hat

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
  // Missing, or a hat it can't wear, reads as the hat it rolled.
  hat?: string
}

// The `$.store` key `buddy` (Foundation spec section 1).
```
with:
```ts
  // Missing, or a hat it can't wear, reads as the hat it rolled.
  hat?: string
  // A bred buddy's parents, copied from its egg: [the active buddy when they brooded it, its
  // partner] (Breeding spec section 1). Its bones are bred from theirs.
  parents?: [string, string]
}

// The `$.store` key `buddy` (Foundation spec section 1).
```

In `buddy/hooks/roll.ts`, replace:
```ts
}

function int(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[int(rng, list.length)]!
}

function pickRarity(rng: () => number): Rarity {
  let roll = rng() * 100
  for (const rarity of RARITIES) {
```
with:
```ts
}

export function int(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[int(rng, list.length)]!
}

export function pickRarity(rng: () => number): Rarity {
  let roll = rng() * 100
  for (const rarity of RARITIES) {
```

Create `buddy/hooks/breed.ts`:
```ts
// Breeding (Breeding spec section 4): a bred buddy's bones, drawn from its own seed and its
// parents' bones, and the lookup that finds any buddy's bones through the record. Bones are
// never saved, so a bred buddy is worked out afresh from its parents every time. Pure: no $.
import type { Buddy } from '../types'
import { RARITIES, RARITY, STATS, int, pick, pickRarity, rngFor, rollBones } from './roll'
import type { Bones, Rarity, StatName } from './roll'

export const COPIED_STATS = 3
export const SHINY_CHANCE = 0.01
// The chance when either parent is shiny.
export const SHINY_PARENT_CHANCE = 0.04

// What a roll at `rarity` can give any stat: the lowest low to the highest peak (base spec
// section 2). A copied stat is clamped into it.
export function statRange(rarity: Rarity): [number, number] {
  const floor = RARITY[rarity].floor
  return [Math.max(1, floor - 10), Math.min(100, floor + 79)]
}

// The child of `a` and `b`, drawn from its own seed in a fixed order so a seed and its parents
// always give the same buddy: rarity, species, eye, hat, shiny, which stats are copied, each
// copied stat's parent, then each fresh stat.
export function breedBones(seed: string, a: Bones, b: Bones): Bones {
  const rng = rngFor(seed)
  const lower = Math.min(RARITIES.indexOf(a.rarity), RARITIES.indexOf(b.rarity))
  const rarity = RARITIES[Math.max(RARITIES.indexOf(pickRarity(rng)), lower)]!
  const species = (rng() < 0.5 ? a : b).species
  const eye = (rng() < 0.5 ? a : b).eye
  const hat = pick(rng, RARITY[rarity].hats)
  const shiny = rng() < (a.shiny || b.shiny ? SHINY_PARENT_CHANCE : SHINY_CHANCE)
  const copied: number[] = []
  while (copied.length < COPIED_STATS) {
    const i = int(rng, STATS.length)
    if (!copied.includes(i)) copied.push(i)
  }
  const [lo, hi] = statRange(rarity)
  const values: number[] = []
  STATS.forEach((name, i) => {
    if (copied.includes(i)) values[i] = Math.min(hi, Math.max(lo, (rng() < 0.5 ? a : b).stats[name]))
  })
  STATS.forEach((_, i) => {
    if (!copied.includes(i)) values[i] = RARITY[rarity].floor + int(rng, 40)
  })
  const stats = Object.fromEntries(STATS.map((name, i) => [name, values[i]!])) as Record<StatName, number>
  // The first highest is the peak, and the first lowest of the rest the low.
  const peak = STATS.reduce((best, s) => (stats[s] > stats[best] ? s : best))
  const low = STATS.filter(s => s !== peak).reduce((worst, s) => (stats[s] < stats[worst] ? s : worst))
  return { rarity, species, eye, hat, shiny, stats, peak, low }
}

// A `parents` field as two seeds of buddies in `buddies`, or null when it is anything else.
export function parentsOf(buddies: readonly Pick<Buddy, 'seed'>[], raw: unknown): [string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [p0, p1] = raw as unknown[]
  if (typeof p0 !== 'string' || typeof p1 !== 'string') return null
  return [p0, p1].every(p => buddies.some(b => b.seed === p)) ? [p0, p1] : null
}

// The bones `seed` was born with: bred from its parents' when it has two in the record, else
// rolled. `seen` holds the buddies already on this walk, so a hand-made loop reads as a roll.
function born(buddies: readonly Buddy[], seed: string, seen: ReadonlySet<string>): Bones {
  const parents = parentsOf(buddies, buddies.find(b => b.seed === seed)?.parents)
  const walked = new Set(seen).add(seed)
  if (!parents || seen.has(seed) || parents.some(p => walked.has(p))) return rollBones(seed)
  return breedBones(seed, born(buddies, parents[0], walked), born(buddies, parents[1], walked))
}

// A buddy's bones before any growth, looked up through the record. Never throws: a damaged
// `parents`, a parent missing from the record or a loop reads as a plain roll.
export function bornBones(buddies: readonly Buddy[], seed: string): Bones {
  return born(buddies, seed, new Set())
}
```

In `buddy/hooks/progress.ts`, replace:
```ts
// Growing up (Progression spec section 2): XP, levels, stages and the stat floors, worked out
// from a buddy's saved counts whenever they are needed and never saved. Pure: no $.
import type { Counts, Moment, Stage } from '../types'
import { TOOL_GROUPS, totalCalls } from './ledger'
import { RARITY, STATS, rollBones } from './roll'
import type { Bones, Rarity } from './roll'

export const MAX_LEVEL = 99
```
with:
```ts
// Growing up (Progression spec section 2): XP, levels, stages and the stat floors, worked out
// from a buddy's saved counts whenever they are needed and never saved. Pure: no $.
import type { Buddy, Counts, Moment, Stage } from '../types'
import { bornBones } from './breed'
import { TOOL_GROUPS, totalCalls } from './ledger'
import { RARITY, STATS } from './roll'
import type { Bones, Rarity } from './roll'

export const MAX_LEVEL = 99
```

In `buddy/hooks/progress.ts`, replace:
```ts
}

// A buddy's bones as they are now: rolled from its seed, grown by its saved counts.
export function bonesFor(b: { seed: string; counts?: unknown }): Bones {
  return grow(rollBones(b.seed), levelOf(b.counts))
}

// A `grew` moment for each stage a save's counts carry a buddy into: 1 for adult, 2 for elder.
```
with:
```ts
}

// A buddy's bones as they are now: born from its seed, and its parents' when it was bred (Breeding
// spec section 4), then grown by its saved counts. `buddies` is the record's list, where its
// parents are found; a buddy not in it yet, as one just hatched, is its seed's roll.
export function bonesFor(b: { seed: string; counts?: unknown }, buddies: readonly Buddy[]): Bones {
  return grow(bornBones(buddies, b.seed), levelOf(b.counts))
}

// A `grew` moment for each stage a save's counts carry a buddy into: 1 for adult, 2 for elder.
```

In `buddy/hooks/toys.ts`, replace:
```ts
// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
import type { Buddy, Snack, You } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME, earnedHats } from './achievements'
import { bonesFor } from './progress'
import { HATS, rollBones } from './roll'
import { EARNED_HATS } from './sprites'
import type { Dressed, Wearable, Worn } from './sprites'
```
with:
```ts
// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
import type { Buddy, Saved, Snack } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME, earnedHats } from './achievements'
import { bornBones } from './breed'
import { bonesFor } from './progress'
import { HATS } from './roll'
import { EARNED_HATS } from './sprites'
import type { Dressed, Wearable, Worn } from './sprites'
```

In `buddy/hooks/toys.ts`, replace:
```ts
const isEarned = (hat: Worn) => (EARNED_HATS as readonly string[]).includes(hat)

// What `buddy` can wear: its own rolled hat if it rolled one, every hat you've earned in table
// order, then none. Never another buddy's rolled hat, so a tiny duck still means legendary.
export function wearable(buddy: Pick<Buddy, 'seed'>, you: You): Worn[] {
  const rolled = rollBones(buddy.seed).hat
  return [...(rolled === 'none' ? [] : [rolled]), ...earnedHats(you), 'none']
}

// The hat `buddy` wears: its saved choice when it can wear that, else the hat it rolled. A choice
// it can't wear (unknown, not earned, another buddy's, or not a string) stays saved but unseen.
export function wornHat(buddy: Pick<Buddy, 'seed' | 'hat'>, you: You): Worn {
  const choice: unknown = buddy.hat
  return wearable(buddy, you).find(h => h === choice) ?? rollBones(buddy.seed).hat
}

// A buddy's bones as the band, card and dex draw them: grown by its counts, in the hat it wears.
export function dressed(buddy: Pick<Buddy, 'seed' | 'counts' | 'hat'>, you: You): Dressed {
  return { ...bonesFor(buddy), hat: wornHat(buddy, you) }
}

// The answer to /buddy hat with no hat named.
```
with:
```ts
const isEarned = (hat: Worn) => (EARNED_HATS as readonly string[]).includes(hat)

// What a hat is judged against: your achievements, and the dex, where a bred buddy's parents are.
export type Kin = Pick<Saved, 'you' | 'buddies'>

// What `buddy` can wear: its own rolled hat if it rolled one, every hat you've earned in table
// order, then none. Never another buddy's rolled hat, so a tiny duck still means legendary. A
// bred buddy's rolled hat is the one its bred bones give (Breeding spec section 4).
export function wearable(buddy: Pick<Buddy, 'seed'>, kin: Kin): Worn[] {
  const rolled = bornBones(kin.buddies, buddy.seed).hat
  return [...(rolled === 'none' ? [] : [rolled]), ...earnedHats(kin.you), 'none']
}

// The hat `buddy` wears: its saved choice when it can wear that, else the hat it rolled. A choice
// it can't wear (unknown, not earned, another buddy's, or not a string) stays saved but unseen.
export function wornHat(buddy: Pick<Buddy, 'seed' | 'hat'>, kin: Kin): Worn {
  const choice: unknown = buddy.hat
  return wearable(buddy, kin).find(h => h === choice) ?? bornBones(kin.buddies, buddy.seed).hat
}

// A buddy's bones as the band, card and dex draw them: grown by its counts, in the hat it wears.
export function dressed(buddy: Pick<Buddy, 'seed' | 'counts' | 'hat'>, kin: Kin): Dressed {
  return { ...bonesFor(buddy, kin.buddies), hat: wornHat(buddy, kin) }
}

// The answer to /buddy hat with no hat named.
```

In `buddy/hooks/record.ts`, replace:
```ts
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
import { STAGES, grewMoments } from './progress'
import { rollBones } from './roll'
import type { Worn } from './sprites'
import { readPlay, wearable, wornHat } from './toys'
```
with:
```ts
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
import { bornBones } from './breed'
import { STAGES, grewMoments } from './progress'
import type { Worn } from './sprites'
import { readPlay, wearable, wornHat } from './toys'
```

In `buddy/hooks/record.ts`, replace:
```ts
      const b = saved?.buddies.find(x => x.seed === change.seed)
      // Judged on the fresh record: a hat it can wear, and a change from what it wears.
      if (!saved || !b || !wearable(b, saved.you).includes(change.hat) || wornHat(b, saved.you) === change.hat) return null
      const rolled = rollBones(b.seed).hat
      return {
        ...saved,
```
with:
```ts
      const b = saved?.buddies.find(x => x.seed === change.seed)
      // Judged on the fresh record: a hat it can wear, and a change from what it wears.
      if (!saved || !b || !wearable(b, saved).includes(change.hat) || wornHat(b, saved) === change.hat) return null
      const rolled = bornBones(saved.buddies, b.seed).hat
      return {
        ...saved,
```

In `buddy/hooks/record.ts`, replace:
```ts
    return number ? `No buddy #${Number(number[1])} in the dex.` : `No buddy named ${who} in the dex.`
  }
  const each = found.numbers.map(n => `#${n} ${rollBones(saved.buddies[n - 1]!.seed).species}`)
  const name = saved.buddies[found.numbers[0]! - 1]!.soul.name
  return `${found.numbers.length} buddies are named ${name}: ${each.join(', ')}. Run /buddy ${command} #${found.numbers.at(-1)}.`
```
with:
```ts
    return number ? `No buddy #${Number(number[1])} in the dex.` : `No buddy named ${who} in the dex.`
  }
  const each = found.numbers.map(n => `#${n} ${bornBones(saved.buddies, saved.buddies[n - 1]!.seed).species}`)
  const name = saved.buddies[found.numbers[0]! - 1]!.soul.name
  return `${found.numbers.length} buddies are named ${name}: ${each.join(', ')}. Run /buddy ${command} #${found.numbers.at(-1)}.`
```

In `buddy/hooks/layout.ts`, replace:
```ts
      number: i + 1,
      name: b.soul.name,
      bones: dressed(b, saved.you),
      level,
      stage: stageOf(level),
```
with:
```ts
      number: i + 1,
      name: b.soul.name,
      bones: dressed(b, saved),
      level,
      stage: stageOf(level),
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const bones = bonesFor(activeBuddy(saved))
  const t = await read($, tick)
  const said = await read($, bubble)
```
with:
```tsx
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const bones = bonesFor(activeBuddy(saved), saved.buddies)
  const t = await read($, tick)
  const said = await read($, bubble)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// doesn't answer; without one, a canned line is.
async function reply($: EngineInterface, who: Who, prompt: string, fallback?: string) {
  const bones = bonesFor(who)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
```
with:
```tsx
// doesn't answer; without one, a canned line is.
async function reply($: EngineInterface, who: Who, prompt: string, fallback?: string) {
  const bones = bonesFor(who, (await read($, record))?.buddies ?? [])
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  const name = buddy.soul.name
  const replied = await read($, lastReplyAt)
  const text = await ask($, buddy, bonesFor(buddy), duckPrompt(name, duck.tool, duck.n), 'react')
  // A reply that came in meanwhile wins, whether it cut the call short or, inside its 5 s floor,
  // asked nothing; so does a swap, which the offer was not for. An answer that comes back over an
```
with:
```tsx
  const name = buddy.soul.name
  const replied = await read($, lastReplyAt)
  const text = await ask($, buddy, bonesFor(buddy, saved.buddies), duckPrompt(name, duck.tool, duck.n), 'react')
  // A reply that came in meanwhile wins, whether it cut the call short or, inside its 5 s floor,
  // asked nothing; so does a swap, which the offer was not for. An answer that comes back over an
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  if (!saved || (await read($, hatching))) return
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy)
  const now = await $.clock.now()
  const speak = shouldQuip({
```
with:
```tsx
  if (!saved || (await read($, hatching))) return
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy, saved.buddies)
  const now = await $.clock.now()
  const speak = shouldQuip({
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  await adopt($, saved)
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy)
  const name = buddy.soul.name
  const who = `${name}, ${bones.rarity} ${bones.species}`
```
with:
```tsx
  await adopt($, saved)
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy, saved.buddies)
  const name = buddy.soul.name
  const who = `${name}, ${bones.rarity} ${bones.species}`
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      const progress = cardProgress(saved, shown)
      return [
        ...cardLines(shown.soul, dressed(shown, saved.you), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length),
```
with:
```tsx
      const progress = cardProgress(saved, shown)
      return [
        ...cardLines(shown.soul, dressed(shown, saved), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length),
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const can = wearable(buddy, saved.you)
      const worn = wornHat(buddy, saved.you)
      if (parsed.hat === undefined) return hatList(name, worn, can)
      const choice = hatChoice({ name, words: parsed.hat, worn, can })
```
with:
```tsx
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const can = wearable(buddy, saved)
      const worn = wornHat(buddy, saved)
      if (parsed.hat === undefined) return hatList(name, worn, can)
      const choice = hatChoice({ name, words: parsed.hat, worn, can })
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  const started = await read($, tourStart)
  const tour = started === null ? null : tourAt(t - started, await read($, tourStage))
  const own = bonesFor(buddy)
  const bones = tour ? { ...own, ...tour.look } : own
  // The tour draws the stage it was asked for; otherwise the buddy is drawn at its own.
```
with:
```tsx
  const started = await read($, tourStart)
  const tour = started === null ? null : tourAt(t - started, await read($, tourStage))
  const own = bonesFor(buddy, saved.buddies)
  const bones = tour ? { ...own, ...tour.look } : own
  // The tour draws the stage it was asked for; otherwise the buddy is drawn at its own.
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        saying,
      }
    : await liveScene($, buddy, { ...own, hat: wornHat(buddy, saved.you) }, stage, t, heartsFrame, saying)
  const drawn = draw(scene)
  const { label, stars } = nameLine(name, bones, tour ? null : levelOf(buddy.counts))
```
with:
```tsx
        saying,
      }
    : await liveScene($, buddy, { ...own, hat: wornHat(buddy, saved) }, stage, t, heartsFrame, saying)
  const drawn = draw(scene)
  const { label, stars } = nameLine(name, bones, tour ? null : levelOf(buddy.counts))
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = shownBuddy(saved, await read($, cardSeed))
      const bones = dressed(buddy, saved.you)
      const progress = cardProgress(saved, buddy)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
```
with:
```tsx
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = shownBuddy(saved, await read($, cardSeed))
      const bones = dressed(buddy, saved)
      const progress = cardProgress(saved, buddy)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={journalSvg(name, bonesFor(buddy), rows)} alt={journalAlt(name, rows)} />
      }

      return (
```
with:
```tsx
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={journalSvg(name, bonesFor(buddy, saved.buddies), rows)} alt={journalAlt(name, rows)} />
      }

      return (
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 400 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: bred bones, looked up through the record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The mulligan, and an egg every 8,100 XP

**Files:**
- Create: `buddy/hooks/eggs.ts`, `buddy/hooks/eggs.test.ts`
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `parentsOf` from `breed.ts`; `xpOf`, `levelOf`, `safeCounts`, `isObject` from `progress.ts`; `withCommas` from `ledger.ts`; `current`, `adopt`, `refusal` and `hatch` in `register.tsx`.
- Produces:
  - `eggs?: number` on `You`; `Egg = { seed: string; startedAt: string; fromTurns: number; parents?: [string, string] }`; `egg?: Egg` on `Saved`
  - from `eggs.ts`: `EGG_XP = 8_100`, `HATCH_TURNS = 150`, `MULLIGAN_LEVEL = 2`, `lifetimeXp(saved)`, `lifetimeTurns(saved)`, `earnedEggs(saved)`, `eggsOf(saved)`, `owedEggs(saved)`, `readEgg(saved): Egg | null`, `eggProgress(saved, egg): number`, `dueEgg(saved): Egg | null`, `startEgg(saved: Saved, seed: string | undefined, now: number): Saved`, `withEggCount(saved: Saved): Saved`, `eggXpSoFar(saved)`, `mulliganOpen(saved): boolean`, `MULLIGAN_NOTE`, `closedLine(saved: Saved): string`, `eggStatus(saved: Saved): string`
  - in `record.ts`: `fresh` writes `eggs: 0`; the `flush` change takes `eggSeed?: string`; `reroll` is the mulligan, in place; `hatch` onto a stored record returns null
  - in `register.tsx`: every flush carries `eggSeed: crypto.randomUUID()`; `unhatched($, kind)` answers a hatch or reroll that wrote nothing

`/buddy reroll` works once, while the dex has one buddy under level 2 and nothing was rerolled, and replaces buddy #1 in place. After that it answers with where the next egg stands. A flush writes `you.eggs` from the counts as they were stored when it is missing, so an existing record's clock runs from its XP at upgrade, then starts an egg when one is owed and none incubates.

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/eggs.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy, Counts, Saved } from '../types'
import {
  EGG_XP, HATCH_TURNS, MULLIGAN_NOTE, closedLine, dueEgg, earnedEggs, eggProgress, eggStatus, eggXpSoFar, eggsOf,
  lifetimeTurns, lifetimeXp, mulliganOpen, owedEggs, readEgg, startEgg, withEggCount,
} from './eggs'
import { zeroCounts } from './ledger'

const NOON = new Date(2026, 9, 7, 12).getTime()
const AT = new Date(NOON).toISOString()

// `turns` turns and `shell` shell calls: 10 XP a turn, 1 a call.
const counts = (turns: number, shell = 0): Counts => ({ ...zeroCounts(), turns, calls: { ...zeroCounts().calls, shell } })
const entry = (seed: string, c: Counts = zeroCounts()): Buddy => ({
  seed,
  soul: { name: seed, personality: 'x', hatchedAt: AT },
  retiredAt: null,
  counts: c,
})
// A record with these buddies, the first active, and `eggs` started so far unless it is undefined.
function record(buddies: Buddy[], eggs?: unknown, extra: Partial<Saved> = {}): Saved {
  const you = { lastDay: null, streak: 0, bestStreak: 0, days: 0, ...(eggs === undefined ? {} : { eggs }) }
  return { schema: 2, mode: 'on', rerolls: 0, active: buddies[0]!.seed, buddies, you: you as Saved['you'], ...extra }
}

test('XP and turns are summed over every buddy, and an egg is earned every 8,100 XP', () => {
  expect([EGG_XP, HATCH_TURNS]).toEqual([8_100, 150])
  const short = record([entry('a', counts(400)), entry('b', counts(400, 99))])
  expect([lifetimeXp(short), lifetimeTurns(short), earnedEggs(short)]).toEqual([8_099, 800, 0])
  const there = record([entry('a', counts(400)), entry('b', counts(400, 100))])
  expect([lifetimeXp(there), earnedEggs(there)]).toEqual([8_100, 1])
  expect(earnedEggs(record([entry('a', counts(1_620))]))).toBe(2)
})

test('the eggs started are as saved; missing or damaged, as many as the XP has earned', () => {
  const buddies = [entry('a', counts(2_000))]
  expect(eggsOf(record(buddies, 1))).toBe(1)
  expect(eggsOf(record(buddies, 0))).toBe(0)
  for (const bad of [undefined, Number.NaN, 'two', null]) expect([bad, eggsOf(record(buddies, bad))]).toEqual([bad, 2])
  expect(owedEggs(record(buddies, 1))).toBe(1)
  expect(owedEggs(record(buddies))).toBe(0)
  // More started than earned owes none.
  expect(owedEggs(record(buddies, 5))).toBe(0)
})

test('the egg count is written from the counts as they stand, only when it is missing or damaged', () => {
  const missing = record([entry('a', counts(2_000))])
  expect(withEggCount(missing).you.eggs).toBe(2)
  expect(withEggCount(record([entry('a', counts(2_000))], 'x')).you.eggs).toBe(2)
  const kept = record([entry('a', counts(2_000))], 0)
  expect(withEggCount(kept)).toBe(kept)
})

test('an egg reads with its parents, or as none when it is damaged', () => {
  const buddies = [entry('a'), entry('b')]
  const egg = { seed: 'e', startedAt: AT, fromTurns: 3 }
  expect(readEgg({ buddies, egg })).toEqual(egg)
  expect(readEgg({ buddies, egg: { ...egg, parents: ['a', 'b'] } })).toEqual({ ...egg, parents: ['a', 'b'] })
  expect(readEgg({ buddies })).toBeNull()
  const damaged: unknown[] = [
    'egg',
    { ...egg, seed: '' },
    { ...egg, seed: 7 },
    { ...egg, startedAt: undefined },
    { ...egg, fromTurns: Number.NaN },
    { ...egg, fromTurns: '3' },
    { ...egg, parents: ['a'] },
    { ...egg, parents: ['a', 'gone'] },
  ]
  for (const bad of damaged) expect([bad, readEgg({ buddies, egg: bad as Saved['egg'] })]).toEqual([bad, null])
})

test('an egg is carried by the turns summed since it started, across a swap, and is due at 150', () => {
  const at = (a: number, b: number) => record([entry('a', counts(a)), entry('b', counts(b))])
  const egg = { seed: 'e', startedAt: AT, fromTurns: 100 }
  expect(eggProgress(at(100, 0), egg)).toBe(0)
  expect(eggProgress(at(60, 40), egg)).toBe(0)
  // Carried by one buddy, then the other.
  expect(eggProgress(at(149, 100), egg)).toBe(149)
  expect(eggProgress(at(150, 100), egg)).toBe(150)
  expect(eggProgress(at(900, 100), egg)).toBe(150)
  // A count edited lower reads as no progress.
  expect(eggProgress(at(10, 0), egg)).toBe(0)
  expect(dueEgg({ ...at(149, 100), egg })).toBeNull()
  expect(dueEgg({ ...at(150, 100), egg })).toEqual(egg)
  expect(dueEgg(at(900, 0))).toBeNull()
})

test('an owed egg starts from the seed it is given, only when none incubates', () => {
  const owing = record([entry('a', counts(810))], 0)
  const started = startEgg(owing, 'egg-1', NOON)
  expect(started.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 810 })
  expect(started.you.eggs).toBe(1)
  // Already incubating, no seed, or nothing owed: nothing starts.
  expect(startEgg(started, 'egg-2', NOON)).toBe(started)
  expect(startEgg(owing, undefined, NOON)).toBe(owing)
  const square = record([entry('a', counts(810))], 1)
  expect(startEgg(square, 'egg-2', NOON)).toBe(square)
  // A damaged egg is replaced by an owed one.
  const damaged = { ...owing, egg: { seed: '' } as Saved['egg'] }
  expect(startEgg(damaged, 'egg-3', NOON).egg?.seed).toBe('egg-3')
})

test('the XP toward the next egg runs from 0 to 8,100', () => {
  expect(eggXpSoFar(record([entry('a', counts(1_130))], 1))).toBe(3_200)
  expect(eggXpSoFar(record([entry('a', counts(0))], 0))).toBe(0)
  expect(eggXpSoFar(record([entry('a', counts(2_000))], 0))).toBe(8_100)
  expect(eggXpSoFar(record([entry('a', counts(10))], 3))).toBe(0)
})

test('the mulligan is open only while the one buddy is under level 2 and nothing was rerolled', () => {
  expect(mulliganOpen(record([entry('a', counts(9, 9))]))).toBe(true)
  expect(mulliganOpen(record([entry('a', counts(10))]))).toBe(false)
  expect(mulliganOpen(record([entry('a'), entry('b')]))).toBe(false)
  expect(mulliganOpen(record([entry('a')], 0, { rerolls: 1 }))).toBe(false)
})

test('the egg status says where the next egg stands', () => {
  const carrying = record([entry('a', counts(850))], 1, { egg: { seed: 'e', startedAt: AT, fromTurns: 810 } })
  expect(eggStatus(carrying)).toBe('An egg is on the way: 40 of 150 turns.')
  expect(eggStatus(record([entry('a', counts(810))], 0))).toBe('Your next egg starts after the next turn.')
  expect(eggStatus(record([entry('a', counts(1_130))], 1))).toBe('Your next egg comes in 4,900 xp.')
  expect(eggStatus(record([entry('a')], 0))).toBe('Your next egg comes in 8,100 xp.')
  expect(closedLine(record([entry('a')], 0))).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(MULLIGAN_NOTE).toBe('Not the one? /buddy reroll works once, before level 2.')
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    active: 's',
    buddies: [{ seed: 's', soul: SOUL, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
  })
})
```
with:
```ts
    active: 's',
    buddies: [{ seed: 's', soul: SOUL, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, eggs: 0 },
  })
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
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
```
with:
```ts
    active: 'h',
    buddies: [{ seed: 'h', retiredAt: null }],
    you: { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1, eggs: 0 },
  })
})

// A first hatch, as a new person has it: one buddy, level 1, nothing rerolled.
const firstHatch = () => applyChange(null, { kind: 'hatch', seed: 's', soul: SOUL }, NOON)!

test('the mulligan replaces buddy #1 in place and counts the reroll', () => {
  const muted = { ...firstHatch(), mode: 'muted' as const }
  const saved = applyChange(muted, { kind: 'reroll', seed: 'n', soul: { ...SOUL, name: 'Bix' } }, NOON)!
  expect(saved.buddies).toEqual([{ seed: 'n', soul: { ...SOUL, name: 'Bix' }, retiredAt: null, counts: zeroCounts() }])
  expect(saved).toMatchObject({ active: 'n', rerolls: 1, mode: 'on' })
})

test('the mulligan writes nothing once its window has shut', () => {
  const reroll: Change = { kind: 'reroll', seed: 'n', soul: SOUL }
  // Rerolled already.
  expect(applyChange(migrate(V1), reroll, NOON)).toBeNull()
  const first = firstHatch()
  // Level 2.
  const grown = { ...first, buddies: [{ ...first.buddies[0]!, counts: { ...zeroCounts(), turns: 10 } }] }
  expect(applyChange(grown, reroll, NOON)).toBeNull()
  // A second buddy in the dex.
  const two = { ...first, buddies: [...first.buddies, { ...first.buddies[0]!, seed: 't', retiredAt: AT }] }
  expect(applyChange(two, reroll, NOON)).toBeNull()
})

test('a hatch only makes the first record: onto a stored one it writes nothing', () => {
  expect(applyChange(migrate(V1), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)).toBeNull()
  expect(applyChange(firstHatch(), { kind: 'hatch', seed: 'n', soul: SOUL }, NOON)).toBeNull()
})

test('a flush adds counts by seed, drops unknown seeds, and records the visit', () => {
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    { kind: 'flush', pending: {}, turns: { s: [{ ...FACTS, failRun: 6 }] } },
    { kind: 'visit' },
    { kind: 'reroll', seed: 'n', soul: SOUL },
    { kind: 'rename', seed: 's', name: 'Rex' },
  ]
```
with:
```ts
    { kind: 'flush', pending: {}, turns: { s: [{ ...FACTS, failRun: 6 }] } },
    { kind: 'visit' },
    { kind: 'rename', seed: 's', name: 'Rex' },
  ]
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    expect(after.buddies[0]).toMatchObject({ xp: 7 })
  }
})

test('a flush applies mood events to the right buddy and drops an unknown seed', () => {
```
with:
```ts
    expect(after.buddies[0]).toMatchObject({ xp: 7 })
  }
  // The mulligan replaces the buddy itself, but the rest of the record survives it.
  const rerolled = applyChange({ ...future, rerolls: 0 }, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)
  expect(rerolled).toMatchObject({ journal: ['x'], you: { hats: ['crown'] } })
})

test('a flush applies mood events to the right buddy and drops an unknown seed', () => {
```

In `buddy/hooks/record.test.ts`, replace:
```ts
})

test("a reroll after days away leaves the sulk with the buddy left alone, and the new one starts neutral", () => {
  const away: Saved = { ...migrate(V1), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  // The first save after it finds the visit already made, so it moves no mood.
  const flushed = applyChange(rerolled, { kind: 'flush', pending: {}, mood: { n: ['longClean'] } }, NOON)!
  expect(flushed.buddies[0]?.mood).toMatchObject({ sulk: 3 })
  expect(activeBuddy(flushed).mood).toMatchObject({ meter: 1, sulk: 0 })
  expect(flushed.you.lastDay).toBe('2026-10-07')
})

test('a pet in the flush that sets the sulk still eases it by one step', () => {
```
with:
```ts
})

test('the mulligan makes the visit, and the buddy it brings starts neutral', () => {
  const away: Saved = { ...firstHatch(), you: { lastDay: '2026-10-02', streak: 4, bestStreak: 4, days: 9 } }
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  expect(rerolled.you.lastDay).toBe('2026-10-07')
  // The first save after it finds the visit already made, so it moves no mood.
  const flushed = applyChange(rerolled, { kind: 'flush', pending: {}, mood: { n: ['longClean'] } }, NOON)!
  expect(activeBuddy(flushed).mood).toMatchObject({ meter: 1, sulk: 0 })
})

test('a pet in the flush that sets the sulk still eases it by one step', () => {
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(activeBuddy(applyChange(away, { kind: 'visit' }, NOON)!).journal).toEqual(moment)
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).journal).toEqual(moment)
  const rerolled = applyChange(away, { kind: 'reroll', seed: 'n', soul: SOUL }, NOON)!
  expect(rerolled.buddies[0]?.journal).toEqual(moment)
  expect(activeBuddy(rerolled).journal).toBeUndefined()
  // Two missed days leave a sulk but no moment.
  const weekend: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-04' } }
  expect(activeBuddy(applyChange(weekend, { kind: 'visit' }, NOON)!).journal).toBeUndefined()
})

// V1's buddy one turn short of level 10.
```
with:
```ts
  expect(activeBuddy(applyChange(away, { kind: 'visit' }, NOON)!).journal).toEqual(moment)
  expect(activeBuddy(applyChange(away, { kind: 'flush', pending: {} }, NOON)!).journal).toEqual(moment)
  // Two missed days leave a sulk but no moment.
  const weekend: Saved = { ...away, you: { ...away.you, lastDay: '2026-10-04' } }
  expect(activeBuddy(applyChange(weekend, { kind: 'visit' }, NOON)!).journal).toBeUndefined()
})

// One turn's counts for buddy 's', and a flush of them carrying an egg seed.
const turnOf = (n = 1) => ({ ...zeroCounts(), turns: n })
const eggFlush = (n = 1, eggSeed = 'egg-1'): Change => ({ kind: 'flush', pending: { s: turnOf(n) }, eggSeed })

test("the first flush after the upgrade writes the egg count from the XP before its own counts", () => {
  const base = migrate(V1)
  // 2,000 turns stored is 20,000 XP: two eggs' worth, none owed.
  const old: Saved = { ...base, you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 }, buddies: [{ ...base.buddies[0]!, counts: turnOf(2_000) }] }
  const saved = applyChange(old, eggFlush(), NOON)!
  expect(saved.you.eggs).toBe(2)
  expect(saved.egg).toBeUndefined()
  // Crossing 24,300 XP earns the third.
  const crossed = applyChange({ ...saved, buddies: [{ ...saved.buddies[0]!, counts: turnOf(2_429) }] }, eggFlush(), NOON)!
  expect(crossed.you.eggs).toBe(3)
  expect(crossed.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 2_430 })
})

test('a flush that crosses 8,100 XP starts an egg from its seed; one with an egg out starts none', () => {
  const first = firstHatch()
  const near: Saved = { ...first, buddies: [{ ...first.buddies[0]!, counts: turnOf(809) }] }
  const saved = applyChange(near, eggFlush(), NOON)!
  expect(saved.egg).toEqual({ seed: 'egg-1', startedAt: AT, fromTurns: 810 })
  expect(saved.you.eggs).toBe(1)
  // 8,100 XP more is owed while the first incubates: it waits.
  const more = applyChange(saved, eggFlush(810, 'egg-2'), NOON)!
  expect(more.egg?.seed).toBe('egg-1')
  expect(more.you.eggs).toBe(1)
  // A flush with no seed starts nothing, and the egg stays owed.
  const seedless = applyChange(near, { kind: 'flush', pending: { s: turnOf(1) } }, NOON)!
  expect(seedless.egg).toBeUndefined()
  expect(seedless.you.eggs).toBe(0)
})

// V1's buddy one turn short of level 10.
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  expect(await runner($)('')).toMatch(/^Pip, (a (common|rare|legendary)|an (uncommon|epic)) .* hatched\.$/)
  await clock.settle()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
```
with:
```tsx
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  expect(await runner($)('')).toMatch(
    /^Pip, (a (common|rare|legendary)|an (uncommon|epic)) .* hatched\. Not the one\? \/buddy reroll works once, before level 2\.$/,
  )
  await clock.settle()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
})

test('reroll asks first, then replaces the buddy and counts the reroll', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This retires Pip, \w+ \w+\. Run \/buddy reroll confirm\.$/)
  expect(await cardText($)).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, an? /)
  const card = await cardText($)
  expect(card).toMatch(/^Bix\b/m)
  expect(card).toMatch(/Rerolls: 1/)
})

test('off hides the buddy and /buddy brings it back', async ($, on) => {
```
with:
```tsx
})

test('reroll asks first, then replaces the buddy and counts the reroll, once', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This replaces Pip, an? \w+ \w+, for good\. Run \/buddy reroll confirm\.$/)
  expect(await cardText($)).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, an? [^.]* hatched\.$/)
  const card = await cardText($)
  expect(card).toMatch(/^Bix\b/m)
  expect(card).toMatch(/Rerolls: 1/)
  expect(await run('reroll')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(await run('reroll confirm')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
})

test('off hides the buddy and /buddy brings it back', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
})

test('a reroll retires the old buddy and keeps it', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
```
with:
```tsx
})

test('the mulligan replaces buddy #1 in place, adding nobody to the dex', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  expect(await runner($)('reroll confirm')).toMatch(/^Bix, an? /)
  const saved = shared.row as Saved
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Pip', 'Bix'])
  expect(typeof saved.buddies[0]?.retiredAt).toBe('string')
  expect(saved.buddies[1]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: saved.buddies[1]?.seed, rerolls: 1, mode: 'on' })
})

test('a record that turns damaged during a hatch is not written over, and nobody says hello', async ($, on) => {
```
with:
```tsx
  expect(await runner($)('reroll confirm')).toMatch(/^Bix, an? /)
  const saved = shared.row as Saved
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Bix'])
  expect(saved.buddies[0]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: saved.buddies[0]?.seed, rerolls: 1, mode: 'on' })
})

test('a mulligan whose window another session shut writes nothing and says so', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  on('model.complete', async () => {
    // Another session rerolls while this one waits for the model.
    shared.row = { ...RECORD, rerolls: 1 }
    return { value: ok('{"name": "Bix", "personality": "New here."}') }
  })
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(shared.row).toMatchObject({ rerolls: 1, seed: 'test-seed' })
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
})

test('a hatch that finds another session hatched first keeps that buddy', async ($, on) => {
  const shared = sharedStore(on, undefined)
  world(on, null)
  on('model.complete', async () => {
    shared.row = { ...RECORD, soul: { ...RECORD.soul, name: 'Rex' } }
    return { value: ok('{"name": "Bix", "personality": "New here."}') }
  })
  await $.session.start(START)
  expect(await runner($)('')).toBe('Rex is already here.')
  expect(shared.writes).toBe(0)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Rex/ })).toBeDefined()
})

test('a record that turns damaged during a hatch is not written over, and nobody says hello', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
// ADULT, with another seed's buddy.
const adultAs = (seed: string): Saved => ({ ...ADULT, active: seed, buddies: [{ ...ADULT.buddies[0]!, seed }] })

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```
with:
```tsx
// ADULT, with another seed's buddy.
const adultAs = (seed: string): Saved => ({ ...ADULT, active: seed, buddies: [{ ...ADULT.buddies[0]!, seed }] })

test('a turn that carries your XP to 8,100 starts an egg', async ($, on) => {
  // RECORD's buddy one turn short of 8,100 XP, with no egg started yet.
  const near: Saved = {
    ...SAVED,
    you: { ...SAVED.you, eggs: 0 },
    buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }],
  }
  const shared = sharedStore(on, near)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  const saved = shared.row as Saved
  expect(saved.you.eggs).toBe(1)
  expect(saved.egg).toMatchObject({ fromTurns: 810 })
  expect(typeof saved.egg?.seed).toBe('string')
  expect(await runner($)('reroll')).toBe('No more rerolls. An egg is on the way: 0 of 150 turns.')
})

test('a record from before eggs has its mulligan spent, and its first save starts the egg clock', async ($, on) => {
  // 2,000 turns is 20,000 XP: two eggs' worth, none owed.
  const old: Saved = { ...SAVED, rerolls: 2, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 2_000 } }] }
  const shared = sharedStore(on, old)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toBe('No more rerolls. Your next egg comes in 4,300 xp.')
  await $.turn.complete(TURN)
  await clock.settle()
  expect((shared.row as Saved).you.eggs).toBe(2)
  expect((shared.row as Saved).egg).toBeUndefined()
})

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
})

test('a swap while the egg is out is told to wait, and swaps nobody', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  let release!: () => void
```
with:
```tsx
})

test('a swap while the egg is out is told to wait, and swaps nobody', async ($, on) => {
  // The mulligan is the one hatch a record can still make (Breeding spec section 2).
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  let release!: () => void
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  await rerolled
  await clock.settle()
  expect(activeOf(shared.row)?.seed).not.toBe('swap-1')
  expect((shared.row as Saved).buddies[0]?.retiredAt).toBe(TWO.buddies[0]!.retiredAt)
})

test('a swap ends a running tour, so the buddy back is drawn as itself', async ($, on) => {
```
with:
```tsx
  await rerolled
  await clock.settle()
  // Only the mulligan wrote: the dex is its one new buddy.
  const saved = shared.row as Saved
  expect(saved.buddies).toHaveLength(1)
  expect(saved.active).not.toBe('test-seed')
})

test('a swap ends a running tour, so the buddy back is drawn as itself', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
})

test('a feed, game, rename or hat while the egg is out is told to wait, and changes nobody', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  let release!: () => void
```
with:
```tsx
})

test('a feed, game, rename or hat while the egg is out is told to wait, and changes nobody', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  let release!: () => void
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 392 pass and 16 fail:
- `buddy.test.tsx`: hatching names the buddy and draws it on terminal and desktop
- `buddy.test.tsx`: reroll asks first, then replaces the buddy and counts the reroll, once
- `buddy.test.tsx`: the mulligan replaces buddy #1 in place, adding nobody to the dex
- `buddy.test.tsx`: a mulligan whose window another session shut writes nothing and says so
- `buddy.test.tsx`: a hatch that finds another session hatched first keeps that buddy
- `buddy.test.tsx`: a turn that carries your XP to 8,100 starts an egg
- `buddy.test.tsx`: a record from before eggs has its mulligan spent, and its first save starts the egg clock
- `buddy.test.tsx`: a swap while the egg is out is told to wait, and swaps nobody
- `eggs.test.ts` doesn't load
- `record.test.ts`: migration keeps the buddy and starts its counts and the streak at zero
- `record.test.ts`: a first hatch starts a record on, with today as its first visit
- `record.test.ts`: the mulligan replaces buddy #1 in place and counts the reroll
- `record.test.ts`: the mulligan writes nothing once its window has shut
- `record.test.ts`: a hatch only makes the first record: onto a stored one it writes nothing
- `record.test.ts`: the first flush after the upgrade writes the egg count from the XP before its own counts
- `record.test.ts`: a flush that crosses 8,100 XP starts an egg from its seed; one with an egg out starts none

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
  // Achievement id to the ISO time it was earned (Progression spec section 3). Missing reads as none.
  earned?: Record<string, string>
}

// A buddy's mood (Alive spec section 2): failures push the meter toward anxious, long clean
```
with:
```ts
  // Achievement id to the ISO time it was earned (Progression spec section 3). Missing reads as none.
  earned?: Record<string, string>
  // Eggs started so far (Breeding spec section 2). Missing reads as the eggs your XP has earned,
  // so none is owed until a flush writes it.
  eggs?: number
}

// The egg incubating (Breeding spec section 1). It hatches into `seed` once the turns summed over
// every buddy are HATCH_TURNS past `fromTurns`.
export type Egg = {
  seed: string
  // When it started incubating.
  startedAt: string
  fromTurns: number
  // Set by /buddy breed: [the active buddy then, its partner]. Missing for a wild egg.
  parents?: [string, string]
}

// A buddy's mood (Alive spec section 2): failures push the meter toward anxious, long clean
```

In `buddy/types/index.d.ts`, replace:
```ts
  buddies: Buddy[]
  you: You
}

// `news` is the announcement a bubble carries (Progression spec section 4): a quip never replaces
```
with:
```ts
  buddies: Buddy[]
  you: You
  // At most one; missing when none is incubating.
  egg?: Egg
}

// `news` is the announcement a bubble carries (Progression spec section 4): a quip never replaces
```

Create `buddy/hooks/eggs.ts`:
```ts
// Eggs (Breeding spec sections 2 and 3): one earned every 8,100 XP, carried 150 turns, and the one
// mulligan at the start. XP and turns are summed over every buddy's saved counts, so two sessions
// can never disagree about them; only the number of eggs started is saved. Pure: no $.
import type { Buddy, Egg, Saved } from '../types'
import { parentsOf } from './breed'
import { withCommas } from './ledger'
import { isObject, levelOf, safeCounts, xpOf } from './progress'

// The XP that reaches level 10: a new person's first egg comes as their first buddy grows up.
export const EGG_XP = 8_100
export const HATCH_TURNS = 150
// The mulligan is open while the only buddy is under this level.
export const MULLIGAN_LEVEL = 2

type Dex = Pick<Saved, 'buddies'>
type Eggs = Pick<Saved, 'you' | 'buddies'>

export function lifetimeXp(saved: Dex): number {
  return saved.buddies.reduce((sum, b) => sum + xpOf(b.counts), 0)
}

export function lifetimeTurns(saved: Dex): number {
  return saved.buddies.reduce((sum, b) => sum + safeCounts(b.counts).turns, 0)
}

// The eggs your XP has earned.
export function earnedEggs(saved: Dex): number {
  return Math.floor(lifetimeXp(saved) / EGG_XP)
}

// The eggs started so far. Missing or damaged reads as the eggs your XP has earned, so none is owed
// until a flush writes the count (section 2).
export function eggsOf(saved: Eggs): number {
  const n: unknown = saved.you.eggs
  return typeof n === 'number' && Number.isFinite(n) ? n : earnedEggs(saved)
}

// Eggs earned and not yet started: they wait while another incubates.
export function owedEggs(saved: Eggs): number {
  return Math.max(0, earnedEggs(saved) - eggsOf(saved))
}

// The egg incubating, as this build reads it, or null. An egg with no seed, no start, a
// `fromTurns` that isn't a finite number, or `parents` that aren't two seeds in the record reads
// as none (section 9).
export function readEgg(saved: Pick<Saved, 'egg' | 'buddies'>): Egg | null {
  const egg: unknown = saved.egg
  if (!isObject(egg)) return null
  const { seed, startedAt, fromTurns, parents } = egg
  if (typeof seed !== 'string' || seed === '' || typeof startedAt !== 'string') return null
  if (typeof fromTurns !== 'number' || !Number.isFinite(fromTurns)) return null
  if (parents === undefined) return { seed, startedAt, fromTurns }
  const pair = parentsOf(saved.buddies, parents)
  return pair ? { seed, startedAt, fromTurns, parents: pair } : null
}

// The turns an egg has been carried, from 0 to HATCH_TURNS.
export function eggProgress(saved: Dex, egg: Pick<Egg, 'fromTurns'>): number {
  return Math.min(HATCH_TURNS, Math.max(0, lifetimeTurns(saved) - egg.fromTurns))
}

// The egg incubating when it is ready to hatch, or null.
export function dueEgg(saved: Pick<Saved, 'egg' | 'buddies'>): Egg | null {
  const egg = readEgg(saved)
  return egg && eggProgress(saved, egg) >= HATCH_TURNS ? egg : null
}

// Starts an owed egg from `seed` when none is incubating: `you.eggs` goes up by one and the egg
// counts from the turns summed now. Returns `saved` itself when no egg starts, or with no seed.
export function startEgg(saved: Saved, seed: string | undefined, now: number): Saved {
  if (seed === undefined || readEgg(saved) !== null || owedEggs(saved) === 0) return saved
  const egg: Egg = { seed, startedAt: new Date(now).toISOString(), fromTurns: lifetimeTurns(saved) }
  return { ...saved, egg, you: { ...saved.you, eggs: eggsOf(saved) + 1 } }
}

// `saved` with `you.eggs` written, from the counts as they stand, when it is missing or damaged.
export function withEggCount(saved: Saved): Saved {
  const n: unknown = saved.you.eggs
  return typeof n === 'number' && Number.isFinite(n) ? saved : { ...saved, you: { ...saved.you, eggs: earnedEggs(saved) } }
}

// The XP earned toward the next egg, from 0 to EGG_XP.
export function eggXpSoFar(saved: Eggs): number {
  return Math.min(EGG_XP, Math.max(0, lifetimeXp(saved) - eggsOf(saved) * EGG_XP))
}

// The one reroll (section 2): while the dex has one buddy, under level 2, and nothing rerolled.
export function mulliganOpen(saved: Pick<Saved, 'buddies' | 'rerolls'>): boolean {
  const only: Buddy | undefined = saved.buddies[0]
  return saved.buddies.length === 1 && levelOf(only?.counts) < MULLIGAN_LEVEL && saved.rerolls === 0
}

export const MULLIGAN_NOTE = 'Not the one? /buddy reroll works once, before level 2.'

// What /buddy reroll answers once the mulligan is spent, or was never there.
export function closedLine(saved: Saved): string {
  return `No more rerolls. ${eggStatus(saved)}`
}

// Where the next egg stands, for a reply: the egg on the way, one waiting to start, or the XP to go.
export function eggStatus(saved: Saved): string {
  const egg = readEgg(saved)
  if (egg) return `An egg is on the way: ${eggProgress(saved, egg)} of ${HATCH_TURNS} turns.`
  if (owedEggs(saved) > 0) return 'Your next egg starts after the next turn.'
  return `Your next egg comes in ${withCommas(EGG_XP - eggXpSoFar(saved))} xp.`
}
```

In `buddy/hooks/record.ts`, replace:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { mulliganOpen, startEgg, withEggCount } from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```

In `buddy/hooks/record.ts`, replace:
```ts
    active: seed,
    buddies: [{ seed, soul, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
  }
}
```
with:
```ts
    active: seed,
    buddies: [{ seed, soul, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, eggs: 0 },
  }
}
```

In `buddy/hooks/record.ts`, replace:
```ts
}

export type Change =
  | { kind: 'hatch' | 'reroll'; seed: string; soul: Soul }
  | { kind: 'mode'; mode: Mode }
```
with:
```ts
}

export type Change =
  // A first hatch, or the one mulligan (Breeding spec section 2).
  | { kind: 'hatch' | 'reroll'; seed: string; soul: Soul }
  | { kind: 'mode'; mode: Mode }
```

In `buddy/hooks/record.ts`, replace:
```ts
      // Finished main turns by seed, for the journal (Memory spec section 3).
      turns?: Readonly<Record<string, readonly TurnFacts[]>>
    }
  | { kind: 'visit' }
```
with:
```ts
      // Finished main turns by seed, for the journal (Memory spec section 3).
      turns?: Readonly<Record<string, readonly TurnFacts[]>>
      // The seed an owed egg starts from, if one starts (Breeding spec section 2).
      eggSeed?: string
    }
  | { kind: 'visit' }
```

In `buddy/hooks/record.ts`, replace:
```ts
        return { ...born, you: visit(born.you, today) }
      }
      // The visit comes first, so a sulk from days away lands on the buddy that was left alone,
      // never on the new one (Alive spec section 2).
      const arrived = arrive(saved, now)
      const retiredAt = new Date(now).toISOString()
      return {
        ...arrived,
        mode: 'on',
        rerolls: arrived.rerolls + counted,
        active: change.seed,
        buddies: [
          ...arrived.buddies.map(b => (b.seed === arrived.active ? { ...b, retiredAt } : b)),
          { seed: change.seed, soul: change.soul, retiredAt: null, counts: zeroCounts() },
        ],
      }
    }
```
with:
```ts
        return { ...born, you: visit(born.you, today) }
      }
      // A hatch only makes the first record: new buddies come from eggs (Breeding spec section 2).
      // A reroll is the one mulligan, judged on the fresh record.
      if (change.kind === 'hatch' || !mulliganOpen(saved)) return null
      // It replaces buddy #1 in place, so it adds no dex entry. The visit is still made.
      const arrived = arrive(saved, now)
      return {
        ...arrived,
        mode: 'on',
        rerolls: arrived.rerolls + 1,
        active: change.seed,
        buddies: [{ seed: change.seed, soul: change.soul, retiredAt: null, counts: zeroCounts() }],
      }
    }
```

In `buddy/hooks/record.ts`, replace:
```ts
        }
      })
      // Achievements are judged last, on every buddy's new totals (Progression spec section 4).
      return added || arrived !== saved ? earn({ ...arrived, buddies }, now) : null
    }
    case 'visit': {
```
with:
```ts
        }
      })
      if (!added && arrived === saved) return null
      // The egg count is written from the counts as stored, before this flush's are added, so an
      // existing record's clock runs from its XP at upgrade (Breeding spec section 2).
      const counted = withEggCount(arrived)
      // Achievements are judged on every buddy's new totals (Progression spec section 4), then an
      // owed egg starts when none is incubating.
      return startEgg(earn({ ...counted, buddies }, now), change.eggSeed, now)
    }
    case 'visit': {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```
with:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import { MULLIGAN_NOTE, closedLine, mulliganOpen } from './eggs'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  })
  try {
    await commit($, { kind: 'flush', pending: taken, mood: felt, turns })
  } catch {
    await update($, pending, p => mergePending(taken, p))
```
with:
```tsx
  })
  try {
    // A fresh seed rides along in case this save starts an owed egg (Breeding spec section 2).
    await commit($, { kind: 'flush', pending: taken, mood: felt, turns, eggSeed: crypto.randomUUID() })
  } catch {
    await update($, pending, p => mergePending(taken, p))
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    // Refused: nothing was written or adopted, so there is no buddy to say hello.
    if (note !== null && note !== SAVE_FAILED) return note
    await update($, bubble, () => null)
    later($, () => reply($, born, HELLO_PROMPT))
    return note ?? `${soul.name}, ${withArticle(bones.rarity)}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
  } finally {
    // The egg never stays out, whatever went wrong above.
    await update($, hatching, () => false)
  }
}

async function runBuddy($: EngineInterface, parsed: Parsed): Promise<string | undefined> {
```
with:
```tsx
    // Refused: nothing was written or adopted, so there is no buddy to say hello.
    if (note !== null && note !== SAVE_FAILED) return note
    // Nothing was written: another session hatched first, or the mulligan's window shut meanwhile.
    if ((await read($, record))?.active !== seed) return unhatched($, kind)
    await update($, bubble, () => null)
    later($, () => reply($, born, HELLO_PROMPT))
    const said = `${soul.name}, ${withArticle(bones.rarity)}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
    // A first hatch says the mulligan is there (Breeding spec section 2).
    return note ?? (kind === 'hatch' ? `${said} ${MULLIGAN_NOTE}` : said)
  } finally {
    // The egg never stays out, whatever went wrong above.
    await update($, hatching, () => false)
  }
}

// What a hatch or a reroll answers when its commit wrote nothing: the record as it now stands,
// adopted, so this session shows the buddy that is really there.
async function unhatched($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
  const stored = await current($)
  if (stored.kind !== 'ok') return refusal(stored) ?? NO_BUDDY
  await adopt($, stored.saved)
  return kind === 'hatch' ? `${activeBuddy(stored.saved).soul.name} is already here.` : closedLine(stored.saved)
}

async function runBuddy($: EngineInterface, parsed: Parsed): Promise<string | undefined> {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    case 'off':
      return (await commit($, { kind: 'mode', mode: 'off' })) ?? hidden
    case 'reroll':
      return `This retires ${who}. Run /buddy reroll confirm.`
    case 'reroll-confirm':
      return hatch($, 'reroll')
    case 'swap': {
      if (await read($, hatching)) return EGG
```
with:
```tsx
    case 'off':
      return (await commit($, { kind: 'mode', mode: 'off' })) ?? hidden
    // The one mulligan (Breeding spec section 2); after it, eggs are the only way to a new buddy.
    case 'reroll':
      if (!mulliganOpen(saved)) return closedLine(saved)
      return `This replaces ${name}, ${withArticle(bones.rarity)} ${bones.species}, for good. Run /buddy reroll confirm.`
    case 'reroll-confirm':
      return mulliganOpen(saved) ? hatch($, 'reroll') : closedLine(saved)
    case 'swap': {
      if (await read($, hatching)) return EGG
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 416 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: eggs earned every 8,100 XP, and one mulligan in place of rerolls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A due egg hatches into the dex

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/breed.ts`, `buddy/hooks/breed.test.ts`
- Modify: `buddy/hooks/journal.ts`, `buddy/hooks/journal.test.ts`
- Modify: `buddy/hooks/achievements.ts`, `buddy/hooks/achievements.test.ts`
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/voice.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `dueEgg`, `readEgg`, `startEgg`, `HATCH_TURNS` from `eggs.ts`; `bornBones`, `parentsOf` from `breed.ts`; `earn` from `achievements.ts`; `commit`, `announce`, `later` in `register.tsx`.
- Produces:
  - `'hatched'` in `MomentKind`, read as `hatched after 150 turns in the egg`; `eggHatching: boolean` in `PluginState`
  - `eggBones(buddies: readonly Buddy[], egg: Pick<Egg, 'seed' | 'parents'>): Bones` in `breed.ts`
  - `Hatched = { name: string; rarity: Rarity; species: Species; shiny: boolean; swapBy: string }`, and `News` gains `hatched?: Hatched` and `egg?: true`, in `achievements.ts`
  - `newsLine` reads the hatch first, the egg after the level, and `Breeding unlocked.` after Collector
  - the change `{ kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed?: string }`
  - in `register.tsx`: the `eggHatching` atom, `askSoul($, seed, bones)`, `hatchIfDue($)`, and a due-egg check after every adopting commit and at session start

A hatch keeps the active buddy: the hatchling joins the end of the dex, retired the moment it hatched, and the news names it. `hatchEgg` writes nothing unless the stored egg has its seed, is due and has the parents its soul was made for, so a second session racing for the same egg writes and says nothing. A hatchling never yet active comes in from the dex with no sulk and no `away`.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/breed.test.ts`, replace:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy } from '../types'
import { breedBones, bornBones, parentsOf, statRange } from './breed'
import { zeroCounts } from './ledger'
import { RARITIES, STATS, rollBones } from './roll'
```
with:
```ts
import { expect, test } from 'claude-code/testing'

import type { Buddy } from '../types'
import { breedBones, bornBones, eggBones, parentsOf, statRange } from './breed'
import { zeroCounts } from './ledger'
import { RARITIES, STATS, rollBones } from './roll'
```

In `buddy/hooks/breed.test.ts`, replace:
```ts
})

test('damaged parents, a missing parent or a loop read as a plain roll and never throw', () => {
  for (const raw of ['a', ['a'], ['a', 7], ['a', 'gone']]) {
```
with:
```ts
})

test("an egg's bones are rolled, or bred from its parents', as the hatchling's entry will be", () => {
  const buddies = [entry('a'), entry('b')]
  expect(eggBones(buddies, { seed: 'e' })).toEqual(rollBones('e'))
  const bred = eggBones(buddies, { seed: 'e', parents: ['a', 'b'] })
  expect(bred).toEqual(breedBones('e', rollBones('a'), rollBones('b')))
  expect(bornBones([...buddies, entry('e', ['a', 'b'])], 'e')).toEqual(bred)
  // Parents not in the record read as none.
  expect(eggBones(buddies, { seed: 'e', parents: ['a', 'gone'] })).toEqual(rollBones('e'))
})

test('damaged parents, a missing parent or a loop read as a plain roll and never throw', () => {
  for (const raw of ['a', ['a'], ['a', 7], ['a', 'gone']]) {
```

In `buddy/hooks/journal.test.ts`, replace:
```ts
})

test('growing up reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'grew', n: 1 })).toBe('grew into an adult')
```
with:
```ts
})

test('a hatch reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'hatched', n: 150 })).toBe('hatched after 150 turns in the egg')
  expect(readable([{ at: AT, kind: 'hatched', n: 150 }])).toEqual([{ at: AT, kind: 'hatched', n: 150 }])
})

test('growing up reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'grew', n: 1 })).toBe('grew into an adult')
```

In `buddy/hooks/achievements.test.ts`, replace:
```ts
})

test("a damaged earned field reads as none; a newer build's id is kept but not counted", () => {
  for (const damaged of [null, 'all', 7, ['shell']]) {
```
with:
```ts
})

test('news names a hatchling that joined the dex, and an egg that started', () => {
  const base = record([buddy('a')])
  // 'hat-10' rolls an uncommon capybara.
  const hatchling = buddy('hat-10', {}, { soul: { ...SOUL, name: 'Sprout' } })
  const joined: Saved = { ...base, buddies: [...base.buddies, hatchling] }
  expect(newsOf(base, joined)).toEqual({
    level: null,
    stage: null,
    earned: [],
    hatched: { name: 'Sprout', rarity: 'uncommon', species: 'capybara', shiny: false, swapBy: 'Sprout' },
  })
  // A name another buddy has, in any case, is swapped to by number.
  const twin: Saved = { ...base, buddies: [...base.buddies, { ...hatchling, soul: { ...SOUL, name: 'PIP' } }] }
  expect(newsOf(base, twin)?.hatched?.swapBy).toBe('#2')
  const egg = { seed: 'e', startedAt: AT, fromTurns: 0 }
  expect(newsOf(base, { ...base, egg })).toEqual({ level: null, stage: null, earned: [], egg: true })
  // The same egg, or a new active buddy, is no news.
  expect(newsOf({ ...base, egg }, { ...base, egg })).toBeNull()
  expect(newsOf(base, { ...joined, active: 'hat-10' })).toBeNull()
})

test("a damaged earned field reads as none; a newer build's id is kept but not counted", () => {
  for (const damaged of [null, 'all', 7, ['shell']]) {
```

In `buddy/hooks/voice.test.ts`, replace:
```ts
    'Level 10! I grew into an adult. Earned Grown up.',
  )
})
```
with:
```ts
    'Level 10! I grew into an adult. Earned Grown up.',
  )
})

test('an announcement reads a hatch first, an egg after the level, and breeding after Collector', () => {
  const news = (o: Partial<News>): News => ({ level: null, stage: null, earned: [], ...o })
  const sprout = { name: 'Sprout', rarity: 'rare' as const, species: 'owl' as const, shiny: false, swapBy: 'Sprout' }
  expect(newsLine(news({ hatched: sprout }))).toBe('The egg hatched! Meet Sprout, a rare owl. Run /buddy swap Sprout.')
  expect(newsLine(news({ hatched: { ...sprout, rarity: 'uncommon', shiny: true, swapBy: '#6' } }))).toBe(
    'The egg hatched! Meet Sprout, a shiny uncommon owl. Run /buddy swap #6.',
  )
  expect(newsLine(news({ hatched: { ...sprout, rarity: 'epic' } }))).toBe(
    'The egg hatched! Meet Sprout, an epic owl. Run /buddy swap Sprout.',
  )
  expect(newsLine(news({ hatched: sprout, earned: ['collector'] }))).toBe(
    'The egg hatched! Meet Sprout, a rare owl. Run /buddy swap Sprout. Earned Collector. Breeding unlocked.',
  )
  expect(newsLine(news({ level: 10, stage: 'adult', egg: true, earned: ['grownUp'] }))).toBe(
    'Level 10! I grew into an adult. An egg! It hatches in 150 turns. Earned Grown up.',
  )
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
```
with:
```ts
})

test('a hatchling never yet active comes in from the dex with no sulk and no away', () => {
  // It joined the dex retired the moment it hatched, five days ago.
  const hatchedAt = new Date(2026, 9, 2, 12).toISOString()
  const waiting = pair(hatchedAt, '2026-10-04')
  const fresh: Saved = { ...waiting, buddies: [{ ...waiting.buddies[0]!, soul: { ...SOUL, hatchedAt } }, waiting.buddies[1]!] }
  const saved = applyChange(fresh, { kind: 'swap', seed: 'a' }, NOON)!
  expect(saved.active).toBe('a')
  expect(saved.buddies[0]?.retiredAt).toBeNull()
  expect(saved.buddies[0]?.mood).toBeUndefined()
  expect(saved.buddies[0]?.journal).toBeUndefined()
})

// Bix ('b', active, 960 turns) carrying an egg started at 810: 150 turns in, so due. `parents`,
// when given, are the egg's.
function carrying(parents?: [string, string]): Saved {
  const base = pair(YESTERDAY)
  return {
    ...base,
    buddies: [base.buddies[0]!, { ...base.buddies[1]!, counts: { ...zeroCounts(), turns: 960 } }],
    you: { ...base.you, eggs: 1 },
    egg: { seed: 'e', startedAt: AT, fromTurns: 810, ...(parents ? { parents } : {}) },
  }
}
const HATCHED_AT = new Date(NOON - 5_000).toISOString()
const hatchEgg = (o: Partial<Extract<Change, { kind: 'hatchEgg' }>> = {}): Change => ({
  kind: 'hatchEgg',
  seed: 'e',
  parents: null,
  soul: { ...SOUL, name: 'Sprout', hatchedAt: HATCHED_AT },
  eggSeed: 'next-egg',
  ...o,
})

test('a due egg hatches into the dex, retired as it hatched, and the active buddy stays', () => {
  const before = carrying()
  const saved = applyChange(before, hatchEgg(), NOON)!
  expect(saved.active).toBe('b')
  expect(saved.mode).toBe(before.mode)
  expect(saved.egg).toBeUndefined()
  expect(saved.buddies.map(b => b.seed)).toEqual(['a', 'b', 'e'])
  expect(saved.buddies[2]).toEqual({
    seed: 'e',
    soul: { ...SOUL, name: 'Sprout', hatchedAt: HATCHED_AT },
    retiredAt: HATCHED_AT,
    counts: zeroCounts(),
    journal: [{ at: AT, kind: 'hatched', n: 150 }],
  })
  expect(saved.you.eggs).toBe(1)
  // A brooded egg's parents go with it.
  const bred = applyChange(carrying(['b', 'a']), hatchEgg({ parents: ['b', 'a'] }), NOON)!
  expect(bred.buddies[2]?.parents).toEqual(['b', 'a'])
})

test('a hatch starts the next owed egg, and the fifth buddy earns Collector', () => {
  const base = carrying()
  // 1,620 turns is 16,200 XP: a second egg is owed and waiting.
  const owing: Saved = { ...base, buddies: [base.buddies[0]!, { ...base.buddies[1]!, counts: { ...zeroCounts(), turns: 1_620 } }], egg: { ...base.egg!, fromTurns: 1_470 } }
  const saved = applyChange(owing, hatchEgg(), NOON)!
  expect(saved.egg).toEqual({ seed: 'next-egg', startedAt: AT, fromTurns: 1_620 })
  expect(saved.you.eggs).toBe(2)
  const four: Saved = { ...base, buddies: [...base.buddies, { ...base.buddies[0]!, seed: 'c' }, { ...base.buddies[0]!, seed: 'd' }] }
  expect(applyChange(four, hatchEgg(), NOON)?.you.earned).toMatchObject({ collector: AT })
})

test('a hatch writes nothing for another egg, an egg not yet due, or parents its soul was not made for', () => {
  expect(applyChange(carrying(), hatchEgg({ seed: 'other' }), NOON)).toBeNull()
  const early = carrying()
  expect(applyChange({ ...early, egg: { ...early.egg!, fromTurns: 811 } }, hatchEgg(), NOON)).toBeNull()
  expect(applyChange(carrying(['b', 'a']), hatchEgg(), NOON)).toBeNull()
  expect(applyChange(carrying(), hatchEgg({ parents: ['b', 'a'] }), NOON)).toBeNull()
  expect(applyChange(carrying(['b', 'a']), hatchEgg({ parents: ['a', 'b'] }), NOON)).toBeNull()
  const { egg: _, ...none } = carrying()
  expect(applyChange(none, hatchEgg(), NOON)).toBeNull()
  expect(applyChange(null, hatchEgg(), NOON)).toBeNull()
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  expect((shared.row as Saved).you.eggs).toBe(2)
  expect((shared.row as Saved).egg).toBeUndefined()
})

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```
with:
```tsx
  expect((shared.row as Saved).you.eggs).toBe(2)
  expect((shared.row as Saved).egg).toBeUndefined()
})

// RECORD's buddy at 959 turns, carrying an egg one turn from its hatch, already visited today so
// no streak greeting takes the bubble.
const NEARLY_HATCHED: Saved = {
  ...SAVED,
  you: { ...SAVED.you, lastDay: '2026-10-07', eggs: 1, earned: { grownUp: '2026-10-01T12:00:00.000Z' } },
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 959 } }],
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 810 },
}

// Answers $.model.complete, keeping the hatch calls apart from the rest: a hatch gets `soul`.
function hatchCalls(on: On, soul: string, onHatch: () => void = () => undefined) {
  const calls = { hatch: [] as string[], other: [] as string[] }
  on('model.complete', async (_$, e) => {
    if (e.system?.includes('JSON only')) {
      calls.hatch.push(e.prompt)
      onHatch()
      return { value: ok(soul) }
    }
    calls.other.push(e.prompt)
    return { value: failed() }
  })
  return calls
}

test('the turn that carries the egg to 150 hatches it into the dex, and the buddy here stays', async ($, on) => {
  const shared = sharedStore(on, NEARLY_HATCHED)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await clock.settle()
  expect(calls.hatch).toHaveLength(0)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  const saved = shared.row as Saved
  expect(saved.egg).toBeUndefined()
  expect(saved.active).toBe('test-seed')
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
  expect(saved.buddies[1]?.retiredAt).toBe(saved.buddies[1]?.soul.hatchedAt)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toMatch(/^The egg hatched! Meet Sprout, an? [a-z ]+\. Run \/buddy swap Sprout\.$/)
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
  // No hello: the hatchling isn't here.
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
})

test('a muted hatch celebrates without a bubble', async ($, on) => {
  const shared = sharedStore(on, { ...NEARLY_HATCHED, mode: 'muted' })
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies).toHaveLength(2)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('')
})

test('an egg another session hatched first is not hatched again, and nothing is announced', async ($, on) => {
  const shared = sharedStore(on, NEARLY_HATCHED)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  // The other session's hatch lands while this one waits for the model.
  const theirs = () => {
    const now = shared.row as Saved
    const { egg: _, ...rest } = now
    const rex = { ...now.buddies[0]!, seed: 'egg-seed', soul: { ...now.buddies[0]!.soul, name: 'Rex' } }
    shared.row = { ...rest, buddies: [...now.buddies, rex] }
  }
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}', theirs)
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Rex'])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('')
})

test('an egg left due hatches when a session starts', async ($, on) => {
  const due: Saved = { ...NEARLY_HATCHED, buddies: [{ ...NEARLY_HATCHED.buddies[0]!, counts: { ...zeroCounts(), turns: 960 } }] }
  const shared = sharedStore(on, due)
  const clock = world(on, null)
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
})

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
}
const CONFETTI_ROWS = [' *  .  *  . ', ' .  *  .  * ']
const NEWS_10 = 'Level 10! I grew into an adult. Earned Grown up.'

test('the turn that reaches level 10 is announced once, under confetti, and saved as growing up', async ($, on) => {
```
with:
```tsx
}
const CONFETTI_ROWS = [' *  .  *  . ', ' .  *  .  * ']
// Its 8,100 XP also earn the first egg (Breeding spec section 2).
const NEWS_10 = 'Level 10! I grew into an adult. An egg! It hatches in 150 turns. Earned Grown up.'

test('the turn that reaches level 10 is announced once, under confetti, and saved as growing up', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Level 10! I grew into an adult. Earned Grown up.')
  expect(await runner($)('swap pip')).toBe('Pip is back.')
  await clock.settle()
```
with:
```tsx
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  expect(await runner($)('swap pip')).toBe('Pip is back.')
  await clock.settle()
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 401 pass and 17 fail:
- `achievements.test.ts`: news names a hatchling that joined the dex, and an egg that started
- `breed.test.ts` doesn't load
- `buddy.test.tsx`: the turn that carries the egg to 150 hatches it into the dex, and the buddy here stays
- `buddy.test.tsx`: a muted hatch celebrates without a bubble
- `buddy.test.tsx`: an egg another session hatched first is not hatched again, and nothing is announced
- `buddy.test.tsx`: an egg left due hatches when a session starts
- `buddy.test.tsx`: the turn that reaches level 10 is announced once, under confetti, and saved as growing up
- `buddy.test.tsx`: a quip that comes back over an announcement is dropped; a pet reply follows it
- `buddy.test.tsx`: once an announcement has gone, a quip shows again
- `buddy.test.tsx`: an announcement shows even when its save fails
- `buddy.test.tsx`: a swap clears the bubble, so the hello never follows the last buddy's news
- `journal.test.ts`: a hatch reads as words, and a journal keeps it
- `record.test.ts`: a hatchling never yet active comes in from the dex with no sulk and no away
- `record.test.ts`: a due egg hatches into the dex, retired as it hatched, and the active buddy stays
- `record.test.ts`: a hatch starts the next owed egg, and the fifth buddy earns Collector
- `record.test.ts`: a hatch writes nothing for another egg, an egg not yet due, or parents its soul was not made for
- `voice.test.ts`: an announcement reads a hatch first, an egg after the level, and breeding after Collector

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away' | 'grew'

export type Moment = {
```
with:
```ts
// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away' | 'grew' | 'hatched'

export type Moment = {
```

In `buddy/types/index.d.ts`, replace:
```ts
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days,
  // the stage grown into (1 adult, 2 elder).
  n: number
  // failRun only, when the whole run was in one group.
```
with:
```ts
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days,
  // the stage grown into (1 adult, 2 elder), the turns spent in the egg.
  n: number
  // failRun only, when the whole run was in one group.
```

In `buddy/types/index.d.ts`, replace:
```ts
      duckTool: string | null
      lastNudgeAt: number
    }
  }
```
with:
```ts
      duckTool: string | null
      lastNudgeAt: number
      // True while the egg's soul call is in flight: the band shows it cracked (Breeding spec section 3).
      eggHatching: boolean
    }
  }
```

In `buddy/hooks/breed.ts`, replace:
```ts
// parents' bones, and the lookup that finds any buddy's bones through the record. Bones are
// never saved, so a bred buddy is worked out afresh from its parents every time. Pure: no $.
import type { Buddy } from '../types'
import { RARITIES, RARITY, STATS, int, pick, pickRarity, rngFor, rollBones } from './roll'
import type { Bones, Rarity, StatName } from './roll'
```
with:
```ts
// parents' bones, and the lookup that finds any buddy's bones through the record. Bones are
// never saved, so a bred buddy is worked out afresh from its parents every time. Pure: no $.
import type { Buddy, Egg } from '../types'
import { RARITIES, RARITY, STATS, int, pick, pickRarity, rngFor, rollBones } from './roll'
import type { Bones, Rarity, StatName } from './roll'
```

In `buddy/hooks/breed.ts`, replace:
```ts
  return born(buddies, seed, new Set())
}
```
with:
```ts
  return born(buddies, seed, new Set())
}

// The bones an egg will hatch into: bred when it has two parents in the record, else rolled, as
// the hatchling's own entry will give once it joins the dex.
export function eggBones(buddies: readonly Buddy[], egg: Pick<Egg, 'seed' | 'parents'>): Bones {
  const parents = parentsOf(buddies, egg.parents)
  if (!parents) return rollBones(egg.seed)
  return breedBones(egg.seed, bornBones(buddies, parents[0]), bornBones(buddies, parents[1]))
}
```

In `buddy/hooks/journal.ts`, replace:
```ts
  away: true,
  grew: true,
} satisfies Record<MomentKind, true>

const NOUN: Record<ToolGroup, string> = {
```
with:
```ts
  away: true,
  grew: true,
  hatched: true,
} satisfies Record<MomentKind, true>

const NOUN: Record<ToolGroup, string> = {
```

In `buddy/hooks/journal.ts`, replace:
```ts
    case 'grew':
      return m.n >= 2 ? 'grew into an elder' : 'grew into an adult'
  }
}
```
with:
```ts
    case 'grew':
      return m.n >= 2 ? 'grew into an elder' : 'grew into an adult'
    case 'hatched':
      return `hatched after ${n} turns in the egg`
  }
}
```

In `buddy/hooks/achievements.ts`, replace:
```ts
// earned; everything else here is worked out from the record. Pure: no $.
import type { Counts, Saved, Stage, You } from '../types'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, asNumber, isObject, levelOf, safeCounts, stageOf } from './progress'
import type { EarnedHat } from './sprites'

export type AchievementId =
```
with:
```ts
// earned; everything else here is worked out from the record. Pure: no $.
import type { Counts, Saved, Stage, You } from '../types'
import { bornBones } from './breed'
import { readEgg } from './eggs'
import { addCounts, zeroCounts } from './ledger'
import { ADULT_LEVEL, ELDER_LEVEL, asNumber, isObject, levelOf, safeCounts, stageOf } from './progress'
import type { Rarity, Species } from './roll'
import type { EarnedHat } from './sprites'

export type AchievementId =
```

In `buddy/hooks/achievements.ts`, replace:
```ts
}

// What a commit changed worth saying (Progression spec section 4): the active buddy's new level,
// its new stage when that rose too, and what was newly earned, in table order.
export type News = { level: number | null; stage: Stage | null; earned: AchievementId[] }

// Null when nothing rose, on a first hatch, or when the active buddy changed (a reroll or a swap).
export function newsOf(before: Saved | null, after: Saved): News | null {
  if (!before || before.active !== after.active) return null
```
with:
```ts
}

// A hatchling the news names (Breeding spec section 5), and what to swap to it by: its name, or its
// dex number when another buddy shares the name.
export type Hatched = { name: string; rarity: Rarity; species: Species; shiny: boolean; swapBy: string }

// What a commit changed worth saying (Progression spec section 4): the active buddy's new level,
// its new stage when that rose too, and what was newly earned, in table order; and a hatchling
// that joined the dex, and an egg that started (Breeding spec section 5).
export type News = {
  level: number | null
  stage: Stage | null
  earned: AchievementId[]
  hatched?: Hatched
  egg?: true
}

// The buddy `after` has that `before` didn't, as the news names it; null when there is none.
function hatchedOf(before: Saved, after: Saved): Hatched | null {
  const i = after.buddies.findIndex(b => !before.buddies.some(x => x.seed === b.seed))
  const b = after.buddies[i]
  if (!b) return null
  const bones = bornBones(after.buddies, b.seed)
  const name = b.soul.name
  const shared = after.buddies.filter(x => x.soul.name.toLowerCase() === name.toLowerCase()).length > 1
  return { name, rarity: bones.rarity, species: bones.species, shiny: bones.shiny, swapBy: shared ? `#${i + 1}` : name }
}

// Null when nothing rose, joined or started, on a first hatch, or when the active buddy changed
// (the mulligan or a swap).
export function newsOf(before: Saved | null, after: Saved): News | null {
  if (!before || before.active !== after.active) return null
```

In `buddy/hooks/achievements.ts`, replace:
```ts
    .filter(a => !Object.hasOwn(had, a.id))
    .map(a => a.id)
  return level === null && earned.length === 0 ? null : { level, stage, earned }
}
```
with:
```ts
    .filter(a => !Object.hasOwn(had, a.id))
    .map(a => a.id)
  const hatched = hatchedOf(before, after)
  const egg = readEgg(after)
  const started = egg !== null && egg.seed !== readEgg(before)?.seed
  if (level === null && earned.length === 0 && !hatched && !started) return null
  return { level, stage, earned, ...(hatched ? { hatched } : {}), ...(started ? { egg: true as const } : {}) }
}
```

In `buddy/hooks/voice.ts`, replace:
```ts
import { ACHIEVEMENTS, EARNED_HAT_NAME } from './achievements'
import type { News } from './achievements'
import { STATS, rngFor } from './roll'
import type { Bones, StatName, Stats } from './roll'
```
with:
```ts
import { ACHIEVEMENTS, EARNED_HAT_NAME } from './achievements'
import type { News } from './achievements'
import { HATCH_TURNS } from './eggs'
import { STATS, rngFor } from './roll'
import type { Bones, StatName, Stats } from './roll'
```

In `buddy/hooks/voice.ts`, replace:
```ts
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
```
with:
```ts
}

// An announcement, said with no model call (Progression spec section 4, Breeding spec section 5):
// a hatchling, the level and the stage it brought, an egg that started, then what was earned and
// any hats it unlocked, and breeding once Collector unlocks it.
export function newsLine(news: News): string {
  const parts: string[] = []
  const h = news.hatched
  if (h) {
    const kind = `${withArticle(`${h.shiny ? 'shiny ' : ''}${h.rarity}`)} ${h.species}`
    parts.push(`The egg hatched! Meet ${h.name}, ${kind}. Run /buddy swap ${h.swapBy}.`)
  }
  if (news.level !== null) parts.push(`Level ${news.level}!`)
  if (news.stage === 'adult') parts.push('I grew into an adult.')
  if (news.stage === 'elder') parts.push("I'm an elder now.")
  if (news.egg) parts.push(`An egg! It hatches in ${HATCH_TURNS} turns.`)
  const got = ACHIEVEMENTS.filter(a => news.earned.includes(a.id))
  if (got.length > 0) {
```

In `buddy/hooks/voice.ts`, replace:
```ts
    parts.push(`Earned ${listOf(got.map(a => a.title))}${hats.length > 0 ? `, and ${listOf(hats)}` : ''}.`)
  }
  return parts.join(' ')
}
```
with:
```ts
    parts.push(`Earned ${listOf(got.map(a => a.title))}${hats.length > 0 ? `, and ${listOf(hats)}` : ''}.`)
  }
  if (news.earned.includes('collector')) parts.push('Breeding unlocked.')
  return parts.join(' ')
}
```

In `buddy/hooks/record.ts`, replace:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { mulliganOpen, startEgg, withEggCount } from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { HATCH_TURNS, dueEgg, mulliganOpen, startEgg, withEggCount } from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
```

In `buddy/hooks/record.ts`, replace:
```ts
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }

// Today's visit (Foundation spec section 3). A new day after two or more missed ones leaves the
```
with:
```ts
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }
  // The egg hatching into the dex, with the parents its soul was made for (Breeding spec section 3).
  | { kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed?: string }

// Today's visit (Foundation spec section 3). A new day after two or more missed ones leaves the
```

In `buddy/hooks/record.ts`, replace:
```ts
// A retired buddy coming back (Progression spec section 7): out of retirement, sulking for the
// days it was left, and with "away" in its journal after three or more missed days, as a visit
// gives. A retirement time that doesn't parse leaves neither.
function welcomeBack(b: Buddy, today: string, now: number): Buddy {
  const left = b.retiredAt !== null && Number.isFinite(Date.parse(b.retiredAt)) ? localDay(Date.parse(b.retiredAt)) : null
  const sulk = sulkFor(left, today)
```
with:
```ts
// A retired buddy coming back (Progression spec section 7): out of retirement, sulking for the
// days it was left, and with "away" in its journal after three or more missed days, as a visit
// gives. A retirement time that doesn't parse leaves neither. A hatchling never yet active,
// retired the moment it hatched, waited for nobody, so it gets neither (Breeding spec section 3).
function welcomeBack(b: Buddy, today: string, now: number): Buddy {
  if (b.retiredAt === b.soul.hatchedAt) return { ...b, retiredAt: null }
  const left = b.retiredAt !== null && Number.isFinite(Date.parse(b.retiredAt)) ? localDay(Date.parse(b.retiredAt)) : null
  const sulk = sulkFor(left, today)
```

In `buddy/hooks/record.ts`, replace:
```ts
      }
    }
    case 'hat': {
      const b = saved?.buddies.find(x => x.seed === change.seed)
```
with:
```ts
      }
    }
    case 'hatchEgg': {
      const egg = saved && dueEgg(saved)
      // Judged on the fresh record: this egg, still due, with the parents its soul was made for.
      if (!saved || !egg || egg.seed !== change.seed || !sameParents(egg.parents, change.parents)) return null
      const { egg: _, ...rest } = saved
      // It joins the dex retired the moment it hatched; the active buddy stays (Breeding spec
      // section 3). Collector is earned here, then the next owed egg starts.
      const hatchling: Buddy = {
        seed: change.seed,
        soul: change.soul,
        retiredAt: change.soul.hatchedAt,
        counts: zeroCounts(),
        ...(egg.parents ? { parents: egg.parents } : {}),
        journal: [{ at: new Date(now).toISOString(), kind: 'hatched', n: HATCH_TURNS }],
      }
      return startEgg(earn({ ...rest, buddies: [...saved.buddies, hatchling] }, now), change.eggSeed, now)
    }
    case 'hat': {
      const b = saved?.buddies.find(x => x.seed === change.seed)
```

In `buddy/hooks/record.ts`, replace:
```ts
    }
  }
}

type Plain =
```
with:
```ts
    }
  }
}

// Both absent, or the same two seeds in the same order.
function sameParents(a: readonly string[] | undefined, b: readonly string[] | null): boolean {
  return a === undefined || b === null ? a === undefined && b === null : a[0] === b[0] && a[1] === b[1]
}

type Plain =
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import { MULLIGAN_NOTE, closedLine, mulliganOpen } from './eggs'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```
with:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import { eggBones } from './breed'
import { MULLIGAN_NOTE, closedLine, dueEgg, mulliganOpen } from './eggs'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
const duckTool = atom({ plugin: 'buddy', key: 'duckTool' } as const, null)
const lastNudgeAt = atom({ plugin: 'buddy', key: 'lastNudgeAt' } as const, 0)

const CARD = 'card'
```
with:
```tsx
const duckTool = atom({ plugin: 'buddy', key: 'duckTool' } as const, null)
const lastNudgeAt = atom({ plugin: 'buddy', key: 'lastNudgeAt' } as const, 0)
const eggHatching = atom({ plugin: 'buddy', key: 'eggHatching' } as const, false)

const CARD = 'card'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// The last commit this session started. The next one waits for it to settle.
let lastCommit: Promise<unknown> = Promise.resolve()

function startTimer($: EngineInterface) {
```
with:
```tsx
// The last commit this session started. The next one waits for it to settle.
let lastCommit: Promise<unknown> = Promise.resolve()
// True from the moment this session starts hatching the egg, before any await, so a second check
// can never start a second hatch (Breeding spec section 3).
let eggBusy = false

function startTimer($: EngineInterface) {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  // Only the session whose commit made the change announces it, whether or not the write lands.
  await announce($, before, saved)
  try {
    await $.store.set(STORE_KEY, saved)
```
with:
```tsx
  // Only the session whose commit made the change announces it, whether or not the write lands.
  await announce($, before, saved)
  // An egg this record carries to its hatch hatches after the commit, never inside it.
  if (dueEgg(saved)) later($, () => hatchIfDue($))
  try {
    await $.store.set(STORE_KEY, saved)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
}

async function hatch($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
  const seed = crypto.randomUUID()
```
with:
```tsx
}

// A new buddy's name and personality: one Haiku call, or the fallback when it fails (base spec
// section 5). Never throws: hatching never fails.
async function askSoul($: EngineInterface, seed: string, bones: Bones): Promise<{ name: string; personality: string }> {
  const fallback = fallbackSoul(seed, bones)
  try {
    const request = hatchRequest(bones)
    const result = await $.model.complete({
      model: 'haiku',
      system: request.system,
      prompt: request.prompt,
      maxTokens: 200,
      timeoutMs: 8000,
    })
    return (result.isAnswered ? parseSoul(result.text) : null) ?? fallback
  } catch {
    return fallback
  }
}

// Hatches the egg once it is due (Breeding spec section 3): the hatch path's one soul call, then
// the hatchEgg commit, whose news announces it. The active buddy stays on screen and its events
// still count. Not while off or while a buddy hatches; a throw leaves the egg due for the next try.
async function hatchIfDue($: EngineInterface) {
  if (eggBusy) return
  eggBusy = true
  try {
    const saved = await read($, record)
    if (!saved || saved.mode === 'off' || (await read($, hatching))) return
    const egg = dueEgg(saved)
    if (!egg) return
    await update($, eggHatching, () => true)
    const soul = await askSoul($, egg.seed, eggBones(saved.buddies, egg))
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const change: Change = {
      kind: 'hatchEgg',
      seed: egg.seed,
      parents: egg.parents ?? null,
      soul: { ...soul, hatchedAt },
      eggSeed: crypto.randomUUID(),
    }
    await commit($, change)
  } catch {
    // The egg stays due: the next check tries again.
  } finally {
    eggBusy = false
    await update($, eggHatching, () => false)
  }
}

async function hatch($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
  const seed = crypto.randomUUID()
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    await update($, tourStart, () => null)
    if (!timer) startTimer($)
    let soul = fallbackSoul(seed, bones)
    try {
      const request = hatchRequest(bones)
      const result = await $.model.complete({
        model: 'haiku',
        system: request.system,
        prompt: request.prompt,
        maxTokens: 200,
        timeoutMs: 8000,
      })
      if (result.isAnswered) soul = parseSoul(result.text) ?? soul
    } catch {
      // Keep the fallback soul: hatching never fails.
    }
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const born: Who = { seed, soul: { ...soul, hatchedAt } }
```
with:
```tsx
    await update($, tourStart, () => null)
    if (!timer) startTimer($)
    const soul = await askSoul($, seed, bones)
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const born: Who = { seed, soul: { ...soul, hatchedAt } }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    }
    try {
      // A reload in the middle of a hatch leaves the egg flag set with nobody to clear it.
      await update($, hatching, () => false)
      // A session start is activity: a session never opens on a sleeping buddy.
      await stir($)
```
with:
```tsx
    }
    try {
      // A reload in the middle of a hatch leaves the egg flags set with nobody to clear them.
      await update($, hatching, () => false)
      await update($, eggHatching, () => false)
      // A session start is activity: a session never opens on a sleeping buddy.
      await stir($)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        startTimer($)
        later($, () => visitToday($))
      }
    } catch {
```
with:
```tsx
        startTimer($)
        later($, () => visitToday($))
        // An egg left due, by another session or a reload mid-hatch, hatches now.
        later($, () => hatchIfDue($))
      }
    } catch {
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 428 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: a due egg hatches into the dex, and the news says so

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `/buddy breed`

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/journal.ts`, `buddy/hooks/journal.test.ts`, `buddy/hooks/layout.ts`
- Modify: `buddy/hooks/eggs.ts`
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/voice.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `readEgg`, `eggStatus`, `eggProgress`, `HATCH_TURNS` from `eggs.ts`; `findBuddy`, `notFound`, `activeBuddy` in `record.ts`; `levelOf`, `ADULT_LEVEL` from `progress.ts`; `bornBones`, `eggBones` from `breed.ts`; `askSoul`, `hatchIfDue`, `feel`, `current`, `adopt` in `register.tsx`.
- Produces:
  - `'brooded'` in `MomentKind`; `Names = readonly Pick<Buddy, 'soul'>[]`, `momentText(m, buddies?)`, `memoryLine(m, now, buddies?)` and `talkMemories(journal, now, buddies?)` in `journal.ts`; `journalRows(journal, now, buddies?)` and `journalLines(name, journal, now, buddies?, limit = 10)` in `layout.ts`
  - `BREED_DEX = 5` and `hatchesIn(left: number): string` in `eggs.ts`
  - `Parent = { name: string; species: string; personality: string }` and `hatchRequest(b: Bones, parents?: readonly [Parent, Parent])` in `voice.ts`
  - in `record.ts`: the change `{ kind: 'breed'; partner: string }`; `BreedChoice` and `breedChoice(saved: Saved, who: string, bySeed = false): BreedChoice`; `parseSub` gives `{ sub: 'breed'; target: string }`; `USAGE` with `breed <who>`
  - in `register.tsx`: the `breed` command, `unbred($, who)`, and `askSoul($, seed, bones, parents?)`

`breedChoice` checks in the spec's order and is shared by the command and the change. Brooding sets the egg's parents, the active buddy first, and logs `brooded` on both with the other's dex number. It spends nothing and lays nothing. The hatch prompt then carries both parents, so the child can take after them.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/journal.test.ts`, replace:
```ts
})

test('a hatch reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'hatched', n: 150 })).toBe('hatched after 150 turns in the egg')
```
with:
```ts
})

test('brooding names the partner by dex number when it has the dex, and nobody when it has not', () => {
  const buddies = [{ soul: { name: 'Pip', personality: 'x', hatchedAt: AT } }, { soul: { name: 'Mochi', personality: 'x', hatchedAt: AT } }]
  const brooded: Moment = { at: AT, kind: 'brooded', n: 2 }
  expect(momentText(brooded, buddies)).toBe('brooded an egg with Mochi')
  expect(momentText(brooded)).toBe('brooded an egg')
  expect(momentText({ ...brooded, n: 3 }, buddies)).toBe('brooded an egg')
  expect(readable([brooded])).toEqual([brooded])
  expect(memoryLine(brooded, NOON, buddies)).toContain(': brooded an egg with Mochi. Bring it up')
  expect(talkMemories([brooded], NOON, buddies)).toContain('- today: brooded an egg with Mochi')
})

test('a hatch reads as words, and a journal keeps it', () => {
  expect(momentText({ at: AT, kind: 'hatched', n: 150 })).toBe('hatched after 150 turns in the egg')
```

In `buddy/hooks/voice.test.ts`, replace:
```ts
})

test('an announcement reads a hatch first, an egg after the level, and breeding after Collector', () => {
  const news = (o: Partial<News>): News => ({ level: null, stage: null, earned: [], ...o })
```
with:
```ts
})

test("a brooded egg's hatch request carries both parents; a wild one's carries none", () => {
  const bones = rollBones('voice-seed')
  const wild = hatchRequest(bones)
  expect(wild.prompt).not.toContain('Parents')
  const parents = [
    { name: 'Pip', species: 'owl', personality: 'Counts semicolons.' },
    { name: 'Mochi', species: 'axolotl', personality: 'Naps on the stack.' },
  ] as const
  const bred = hatchRequest(bones, parents)
  expect(bred.system).toBe(wild.system)
  expect(bred.prompt).toBe(
    `${wild.prompt}\nParents: Pip, an owl ("Counts semicolons."), and Mochi, an axolotl ("Naps on the stack."). ` +
      'Take after them a little; the name is your own.',
  )
})

test('an announcement reads a hatch first, an egg after the level, and breeding after Collector', () => {
  const news = (o: Partial<News>): News => ({ level: null, stage: null, earned: [], ...o })
```

In `buddy/hooks/record.test.ts`, replace:
```ts
import { newsOf } from './achievements'
import { countEvent, zeroCounts } from './ledger'
import { USAGE, activeBuddy, applyChange, classify, findBuddy, migrate, parseSub, shownBuddy, targetOf } from './record'
import type { Change } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
```
with:
```ts
import { newsOf } from './achievements'
import { countEvent, zeroCounts } from './ledger'
import {
  USAGE, activeBuddy, applyChange, breedChoice, classify, findBuddy, migrate, parseSub, shownBuddy, targetOf,
} from './record'
import type { Change } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(sub('swap')).toBe('usage')
  expect(sub('swap Pip now')).toBe('usage')
  expect(parseSub('rename Mochi')).toEqual({ sub: 'rename', name: 'Mochi' })
  expect(parseSub('RENAME  Sir   Pip')).toEqual({ sub: 'rename', name: 'Sir Pip' })
```
with:
```ts
  expect(sub('swap')).toBe('usage')
  expect(sub('swap Pip now')).toBe('usage')
  expect(parseSub('breed Mochi')).toEqual({ sub: 'breed', target: 'Mochi' })
  expect(parseSub('BREED #3')).toEqual({ sub: 'breed', target: '#3' })
  expect(sub('breed')).toBe('usage')
  expect(sub('breed Pip Mochi')).toBe('usage')
  expect(parseSub('rename Mochi')).toEqual({ sub: 'rename', name: 'Mochi' })
  expect(parseSub('RENAME  Sir   Pip')).toEqual({ sub: 'rename', name: 'Sir Pip' })
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(parseSub('HAT Flower  Crown')).toEqual({ sub: 'hat', hat: 'Flower Crown' })
  expect(USAGE).toBe(
    'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
  )
  expect(sub('mute')).toBe('mute')
```
with:
```ts
  expect(parseSub('HAT Flower  Crown')).toEqual({ sub: 'hat', hat: 'Flower Crown' })
  expect(USAGE).toBe(
    'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
  )
  expect(sub('mute')).toBe('mute')
```

In `buddy/hooks/record.test.ts`, replace:
```ts
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
```
with:
```ts
})

// Five in the dex: Pip ('a', retired) and Bix ('b', here), adults at 810 turns each, then three
// hatchlings, Nib, Dot and Moss. An egg 40 turns in, with no parents yet, unless `egg` says
// otherwise; `egg: null` leaves none.
function brood(egg?: Saved['egg'] | null): Saved {
  const base = pair(YESTERDAY)
  const adult = { ...zeroCounts(), turns: 810 }
  const young = (seed: string, name: string) => ({ seed, soul: { ...SOUL, name }, retiredAt: AT, counts: zeroCounts() })
  return {
    ...base,
    buddies: [
      { ...base.buddies[0]!, counts: adult },
      { ...base.buddies[1]!, counts: adult },
      young('c', 'Nib'),
      young('d', 'Dot'),
      young('e', 'Moss'),
    ],
    you: { ...base.you, eggs: 2 },
    ...(egg === null ? {} : { egg: egg ?? { seed: 'egg', startedAt: AT, fromTurns: 1_580 } }),
  }
}

test('breeding is refused, in order, until five are in the dex, an egg waits for parents, and both are adults', () => {
  const reply = (saved: Saved, who: string) => {
    const choice = breedChoice(saved, who)
    return choice.kind === 'no' ? choice.reply : choice.partner
  }
  const four: Saved = { ...brood(), buddies: brood().buddies.slice(0, 4) }
  expect(reply(four, 'Pip')).toBe('Breeding unlocks at 5 buddies in the dex: 1 to go.')
  expect(reply(pair(YESTERDAY), 'Pip')).toBe('Breeding unlocks at 5 buddies in the dex: 3 to go.')
  expect(reply(brood(null), 'Pip')).toBe('No egg to brood. Your next egg comes in 8,100 xp.')
  const brooding = brood({ seed: 'egg', startedAt: AT, fromTurns: 1_580, parents: ['b', 'a'] })
  expect(reply(brooding, 'Pip')).toBe('Bix and Pip are already brooding this egg.')
  expect(reply(brood(), 'Rex')).toBe('No buddy named Rex in the dex.')
  expect(reply(brood(), 'bix')).toBe("Bix can't breed with itself. Pick one from /buddy dex.")
  expect(reply(brood(), 'Nib')).toBe('Nib is level 1. Buddies breed from level 10.')
  const youngHere: Saved = { ...brood(), active: 'c' }
  expect(reply(youngHere, 'Pip')).toBe('Nib is level 1. Buddies breed from level 10.')
  expect(reply(brood(), 'pip')).toBe('a')
  expect(reply(brood(), '#1')).toBe('a')
})

test('breeding sets the egg parents, active first, and logs it on both, with no visit', () => {
  const before = brood()
  const saved = applyChange(before, { kind: 'breed', partner: 'a' }, NOON)!
  expect(saved.egg).toEqual({ seed: 'egg', startedAt: AT, fromTurns: 1_580, parents: ['b', 'a'] })
  expect(saved.buddies[0]?.journal).toEqual([{ at: AT, kind: 'brooded', n: 2 }])
  expect(saved.buddies[1]?.journal).toEqual([{ at: AT, kind: 'brooded', n: 1 }])
  expect(saved.buddies.slice(2).every(b => b.journal === undefined)).toBe(true)
  expect(saved.you).toEqual(before.you)
  // Parents can't change once set, and the refusals write nothing.
  expect(applyChange(saved, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(brood(null), { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'b' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'c' }, NOON)).toBeNull()
  expect(applyChange(brood(), { kind: 'breed', partner: 'gone' }, NOON)).toBeNull()
  expect(applyChange({ ...before, buddies: before.buddies.slice(0, 4) }, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'breed', partner: 'a' }, NOON)).toBeNull()
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
})

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```
with:
```tsx
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
})

// Five in the dex: Pip, here, and Mochi, retired, adults at 810 turns each, and three hatchlings;
// an egg 149 turns along with no parents yet.
const ADULT_COUNTS = { ...zeroCounts(), turns: 810 }
const BROODY: Saved = {
  ...SAVED,
  you: { ...SAVED.you, lastDay: '2026-10-07', eggs: 2, earned: { grownUp: '2026-10-01T12:00:00.000Z', collector: '2026-10-01T12:00:00.000Z' } },
  buddies: [
    { ...SAVED.buddies[0]!, counts: ADULT_COUNTS },
    { seed: 'swap-1', soul: { ...RECORD.soul, name: 'Mochi', personality: 'Naps on the stack.' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: ADULT_COUNTS },
    { seed: 'young-1', soul: { ...RECORD.soul, name: 'Nib' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
    { seed: 'young-2', soul: { ...RECORD.soul, name: 'Dot' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
    { seed: 'young-3', soul: { ...RECORD.soul, name: 'Moss' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
  ],
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 1_471 },
}

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
  world(on, { buddy: TWO })
  await $.session.start(START)
  expect(await runner($)('breed pip')).toBe('Breeding unlocks at 5 buddies in the dex: 3 to go.')
})

test('breed sets the parents with no model call, and the hatch hears about both', async ($, on) => {
  const shared = sharedStore(on, BROODY)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Takes after both."}')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('breed mochi')).toBe('Pip and Mochi are brooding the egg. It hatches in 1 turn.')
  expect(calls.hatch.length + calls.other.length).toBe(0)
  expect((shared.row as Saved).egg?.parents).toEqual(['test-seed', 'swap-1'])
  expect(await run('breed mochi')).toBe('Pip and Mochi are already brooding this egg.')
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect(calls.hatch[0]).toContain('Parents: Pip, ')
  expect(calls.hatch[0]).toContain(', and Mochi, ')
  expect(calls.hatch[0]).toContain('("Naps on the stack.")')
  const saved = shared.row as Saved
  expect(saved.buddies.at(-1)).toMatchObject({ soul: { name: 'Sprout' }, parents: ['test-seed', 'swap-1'] })
})

test('breed while the egg is hatching is told to wait', async ($, on) => {
  const due: Saved = { ...BROODY, egg: { ...BROODY.egg!, fromTurns: 1_470 } }
  const clock = world(on, { buddy: due })
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  for (let i = 0; i < 20; i++) await clock.advance(0)
  expect(await runner($)('breed mochi')).toBe('The egg is hatching.')
  release()
  await clock.settle()
})

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 390 pass and 6 fail:
- `buddy.test.tsx`: breed is refused below five in the dex, with the count to go
- `buddy.test.tsx`: breed sets the parents with no model call, and the hatch hears about both
- `buddy.test.tsx`: breed while the egg is hatching is told to wait
- `journal.test.ts`: brooding names the partner by dex number when it has the dex, and nobody when it has not
- `record.test.ts` doesn't load
- `voice.test.ts`: a brooded egg's hatch request carries both parents; a wild one's carries none

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away' | 'grew' | 'hatched'

export type Moment = {
```
with:
```ts
// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind =
  | 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away' | 'grew' | 'hatched' | 'brooded'

export type Moment = {
```

In `buddy/types/index.d.ts`, replace:
```ts
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days,
  // the stage grown into (1 adult, 2 elder), the turns spent in the egg.
  n: number
  // failRun only, when the whole run was in one group.
```
with:
```ts
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days,
  // the stage grown into (1 adult, 2 elder), the turns spent in the egg, the dex number of the
  // buddy brooding with it.
  n: number
  // failRun only, when the whole run was in one group.
```

In `buddy/hooks/eggs.ts`, replace:
```ts
}

// The one reroll (section 2): while the dex has one buddy, under level 2, and nothing rerolled.
export function mulliganOpen(saved: Pick<Saved, 'buddies' | 'rerolls'>): boolean {
```
with:
```ts
}

// Breeding unlocks with this many buddies in the dex, Collector's mark (section 4).
export const BREED_DEX = 5

// "It hatches in 110 turns.": what is left of an egg's 150 turns.
export function hatchesIn(left: number): string {
  return left > 0 ? `It hatches in ${left} turn${left === 1 ? '' : 's'}.` : 'It hatches any moment now.'
}

// The one reroll (section 2): while the dex has one buddy, under level 2, and nothing rerolled.
export function mulliganOpen(saved: Pick<Saved, 'buddies' | 'rerolls'>): boolean {
```

In `buddy/hooks/journal.ts`, replace:
```ts
  grew: true,
  hatched: true,
} satisfies Record<MomentKind, true>

const NOUN: Record<ToolGroup, string> = {
```
with:
```ts
  grew: true,
  hatched: true,
  brooded: true,
} satisfies Record<MomentKind, true>

// The dex, for the names a moment's words use: `brooded` names its partner by dex number.
export type Names = readonly Pick<Buddy, 'soul'>[]

const NOUN: Record<ToolGroup, string> = {
```

In `buddy/hooks/journal.ts`, replace:
```ts
}

// A moment's words, with no date: "Claude failed 18 shell commands in a row".
export function momentText(m: Moment): string {
  const n = withCommas(m.n)
  switch (m.kind) {
```
with:
```ts
}

// A moment's words, with no date: "Claude failed 18 shell commands in a row". `buddies` names a
// brooding partner; without it, or for a number out of range, the moment names nobody.
export function momentText(m: Moment, buddies?: Names): string {
  const n = withCommas(m.n)
  switch (m.kind) {
```

In `buddy/hooks/journal.ts`, replace:
```ts
    case 'hatched':
      return `hatched after ${n} turns in the egg`
  }
}
```
with:
```ts
    case 'hatched':
      return `hatched after ${n} turns in the egg`
    case 'brooded': {
      const partner = buddies?.[m.n - 1]?.soul.name
      return partner ? `brooded an egg with ${partner}` : 'brooded an egg'
    }
  }
}
```

In `buddy/hooks/journal.ts`, replace:
```ts
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
```
with:
```ts
}

// The quip prompt's line for a recalled memory.
export function memoryLine(m: Moment, now: number, buddies?: Names): string {
  return `A memory (${ageText(m.at, now)}): ${momentText(m, buddies)}. Bring it up if it fits, as "remember when...", without a date.`
}

// The talk prompt's lines: the newest TALK_MEMORIES memories, newest first; none for an empty journal.
export function talkMemories(journal: readonly Moment[] | undefined, now: number, buddies?: Names): string[] {
  const newest = readable(journal).slice(-TALK_MEMORIES).reverse()
  if (newest.length === 0) return []
  return [
    'Your memories, newest first:',
    ...newest.map(m => `- ${ageText(m.at, now)}: ${momentText(m, buddies)}`),
    'Mention one only if it fits what they said.',
  ]
```

In `buddy/hooks/voice.ts`, replace:
```ts
}

export function hatchRequest(b: Bones): { system: string; prompt: string } {
  return {
    system: [
```
with:
```ts
}

// A bred buddy's parent, as its hatch prompt describes it (Breeding spec section 4).
export type Parent = { name: string; species: string; personality: string }

// The hatch request. A brooded egg's carries its parents, so the child can take after them.
export function hatchRequest(b: Bones, parents?: readonly [Parent, Parent]): { system: string; prompt: string } {
  const stats =
    `Species: ${b.species}. Rarity: ${b.rarity}. Shiny: ${b.shiny ? 'yes' : 'no'}. ` +
    `Highest stat: ${b.peak} (${b.stats[b.peak]}). Lowest stat: ${b.low} (${b.stats[b.low]}).`
  const parent = (p: Parent) => `${p.name}, ${withArticle(p.species)} ("${p.personality}")`
  return {
    system: [
```

In `buddy/hooks/voice.ts`, replace:
```ts
      "personality: at most 160 characters, written in the pet's own voice, shaped by its highest and lowest stats.",
    ].join('\n'),
    prompt:
      `Species: ${b.species}. Rarity: ${b.rarity}. Shiny: ${b.shiny ? 'yes' : 'no'}. ` +
      `Highest stat: ${b.peak} (${b.stats[b.peak]}). Lowest stat: ${b.low} (${b.stats[b.low]}).`,
  }
}
```
with:
```ts
      "personality: at most 160 characters, written in the pet's own voice, shaped by its highest and lowest stats.",
    ].join('\n'),
    prompt: parents
      ? `${stats}\nParents: ${parent(parents[0])}, and ${parent(parents[1])}. Take after them a little; the name is your own.`
      : stats,
  }
}
```

In `buddy/hooks/record.ts`, replace:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { HATCH_TURNS, dueEgg, mulliganOpen, startEgg, withEggCount } from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
import { bornBones } from './breed'
import { STAGES, grewMoments } from './progress'
import type { Worn } from './sprites'
import { readPlay, wearable, wornHat } from './toys'
```
with:
```ts
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import { BREED_DEX, HATCH_TURNS, dueEgg, eggStatus, mulliganOpen, readEgg, startEgg, withEggCount } from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
import { bornBones } from './breed'
import { ADULT_LEVEL, STAGES, grewMoments, levelOf } from './progress'
import type { Worn } from './sprites'
import { readPlay, wearable, wornHat } from './toys'
```

In `buddy/hooks/record.ts`, replace:
```ts
export const STORE_KEY = 'buddy'
export const USAGE =
  'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'

// What the store holds, as this build reads it (Foundation spec section 1).
```
with:
```ts
export const STORE_KEY = 'buddy'
export const USAGE =
  'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'

// What the store holds, as this build reads it (Foundation spec section 1).
```

In `buddy/hooks/record.ts`, replace:
```ts
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }
  // The egg hatching into the dex, with the parents its soul was made for (Breeding spec section 3).
  | { kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed?: string }
```
with:
```ts
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }
  // The active buddy and `partner` brooding the egg incubating (Breeding spec section 4).
  | { kind: 'breed'; partner: string }
  // The egg hatching into the dex, with the parents its soul was made for (Breeding spec section 3).
  | { kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed?: string }
```

In `buddy/hooks/record.ts`, replace:
```ts
      }
    }
    case 'hatchEgg': {
      const egg = saved && dueEgg(saved)
```
with:
```ts
      }
    }
    case 'breed': {
      if (!saved || breedChoice(saved, change.partner, true).kind !== 'ok') return null
      const egg = saved.egg!
      const partner = change.partner
      const number = (seed: string) => saved.buddies.findIndex(b => b.seed === seed) + 1
      const at = new Date(now).toISOString()
      const brooded = (b: Buddy, other: string): Buddy => ({
        ...b,
        journal: addMoments(b.journal, [{ at, kind: 'brooded', n: number(other) }]),
      })
      // Parents can't change once set (Breeding spec section 4). No visit, as a rename makes none.
      return {
        ...saved,
        egg: { ...egg, parents: [saved.active, partner] },
        buddies: saved.buddies.map(b =>
          b.seed === saved.active ? brooded(b, partner) : b.seed === partner ? brooded(b, saved.active) : b,
        ),
      }
    }
    case 'hatchEgg': {
      const egg = saved && dueEgg(saved)
```

In `buddy/hooks/record.ts`, replace:
```ts
}

// Both absent, or the same two seeds in the same order.
function sameParents(a: readonly string[] | undefined, b: readonly string[] | null): boolean {
```
with:
```ts
}

// What /buddy breed <who> does (Breeding spec section 4): the partner to brood with, or the line
// refusing it, checked in the spec's order. `bySeed` takes `who` as a seed, as the change does.
export type BreedChoice = { kind: 'ok'; partner: string } | { kind: 'no'; reply: string }

export function breedChoice(saved: Saved, who: string, bySeed = false): BreedChoice {
  const no = (reply: string): BreedChoice => ({ kind: 'no', reply })
  const short = BREED_DEX - saved.buddies.length
  if (short > 0) return no(`Breeding unlocks at ${BREED_DEX} buddies in the dex: ${short} to go.`)
  const egg = readEgg(saved)
  if (!egg) return no(`No egg to brood. ${eggStatus(saved)}`)
  const nameOf = (seed: string) => saved.buddies.find(b => b.seed === seed)?.soul.name ?? 'Buddy'
  if (egg.parents) return no(`${nameOf(egg.parents[0])} and ${nameOf(egg.parents[1])} are already brooding this egg.`)
  const found: Found = bySeed
    ? saved.buddies.some(b => b.seed === who)
      ? { kind: 'one', seed: who }
      : { kind: 'none' }
    : findBuddy(saved, who)
  if (found.kind !== 'one') return no(notFound(saved, who, found, 'breed'))
  const active = activeBuddy(saved)
  if (found.seed === active.seed) return no(`${active.soul.name} can't breed with itself. Pick one from /buddy dex.`)
  for (const b of [active, saved.buddies.find(x => x.seed === found.seed)!]) {
    const level = levelOf(b.counts)
    if (level < ADULT_LEVEL) return no(`${b.soul.name} is level ${level}. Buddies breed from level ${ADULT_LEVEL}.`)
  }
  return { kind: 'ok', partner: found.seed }
}

// Both absent, or the same two seeds in the same order.
function sameParents(a: readonly string[] | undefined, b: readonly string[] | null): boolean {
```

In `buddy/hooks/record.ts`, replace:
```ts
type Plain =
  'show' | 'pet' | 'feed' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug-off' | 'usage'
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename' | 'hat' | 'play'

// A /buddy command as parsed: the subcommand, and what it was given (Progression spec section 7).
```
with:
```ts
type Plain =
  'show' | 'pet' | 'feed' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug-off' | 'usage'
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'breed' | 'debug' | 'rename' | 'hat' | 'play'

// A /buddy command as parsed: the subcommand, and what it was given (Progression spec section 7).
```

In `buddy/hooks/record.ts`, replace:
```ts
  | { sub: Plain }
  | { sub: 'card' | 'journal'; target?: string }
  | { sub: 'swap'; target: string }
  | { sub: 'debug'; stage?: Stage }
  // Everything after `rename`, as typed: validName refuses more than one word.
```
with:
```ts
  | { sub: Plain }
  | { sub: 'card' | 'journal'; target?: string }
  | { sub: 'swap' | 'breed'; target: string }
  | { sub: 'debug'; stage?: Stage }
  // Everything after `rename`, as typed: validName refuses more than one word.
```

In `buddy/hooks/record.ts`, replace:
```ts
  }
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
```
with:
```ts
  }
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
  if (first === 'breed') return words.length === 2 ? { sub: 'breed', target: words[1]! } : { sub: 'usage' }
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
```

In `buddy/hooks/layout.ts`, replace:
```ts
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { ageText, momentText, readable } from './journal'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'
```
with:
```ts
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { ageText, momentText, readable } from './journal'
import type { Names } from './journal'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'
```

In `buddy/hooks/layout.ts`, replace:
```ts
export const emptyJournal = (name: string) => `Nothing in ${name}'s journal yet.`

// A journal's moments newest first, with their ages padded to the widest (Memory spec section 5).
export function journalRows(journal: readonly Moment[] | undefined, now: number): JournalRow[] {
  const rows = readable(journal)
    .reverse()
    .map(m => ({ age: ageText(m.at, now), text: momentText(m) }))
  const width = Math.max(0, ...rows.map(r => r.age.length))
  return rows.map(r => ({ ...r, age: r.age.padEnd(width) }))
```
with:
```ts
export const emptyJournal = (name: string) => `Nothing in ${name}'s journal yet.`

// A journal's moments newest first, with their ages padded to the widest (Memory spec section 5).
export function journalRows(journal: readonly Moment[] | undefined, now: number, buddies?: Names): JournalRow[] {
  const rows = readable(journal)
    .reverse()
    .map(m => ({ age: ageText(m.at, now), text: momentText(m, buddies) }))
  const width = Math.max(0, ...rows.map(r => r.age.length))
  return rows.map(r => ({ ...r, age: r.age.padEnd(width) }))
```

In `buddy/hooks/layout.ts`, replace:
```ts
// The journal as text, where no pane is placed: the header and the newest `limit` moments, inside
// the 12 lines the card's text keeps to.
export function journalLines(name: string, journal: readonly Moment[] | undefined, now: number, limit = 10): string[] {
  const rows = journalRows(journal, now).slice(0, limit)
  if (rows.length === 0) return [journalHeader(name), emptyJournal(name)]
  return [journalHeader(name), ...rows.map(r => `${r.age}   ${r.text}`)]
```
with:
```ts
// The journal as text, where no pane is placed: the header and the newest `limit` moments, inside
// the 12 lines the card's text keeps to.
export function journalLines(
  name: string,
  journal: readonly Moment[] | undefined,
  now: number,
  buddies?: Names,
  limit = 10,
): string[] {
  const rows = journalRows(journal, now, buddies).slice(0, limit)
  if (rows.length === 0) return [journalHeader(name), emptyJournal(name)]
  return [journalHeader(name), ...rows.map(r => `${r.age}   ${r.text}`)]
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import { eggBones } from './breed'
import { MULLIGAN_NOTE, closedLine, dueEgg, mulliganOpen } from './eggs'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```
with:
```tsx
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import { bornBones, eggBones } from './breed'
import { HATCH_TURNS, MULLIGAN_NOTE, closedLine, dueEgg, eggProgress, hatchesIn, mulliganOpen, readEgg } from './eggs'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { mergeQueues, queueNewest } from './queue'
import {
  STORE_KEY, USAGE, activeBuddy, applyChange, classify, findBuddy, notFound, parseSub, shownBuddy, targetOf,
} from './record'
import type { Change, Parsed, Stored } from './record'
```
with:
```tsx
import { mergeQueues, queueNewest } from './queue'
import {
  STORE_KEY, USAGE, activeBuddy, applyChange, breedChoice, classify, findBuddy, notFound, parseSub, shownBuddy, targetOf,
} from './record'
import type { Change, Parsed, Stored } from './record'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  withArticle,
} from './voice'
import type { TurnSummary } from './voice'

const record = atom({ plugin: 'buddy', key: 'record' } as const, null)
```
with:
```tsx
  withArticle,
} from './voice'
import type { Parent, TurnSummary } from './voice'

const record = atom({ plugin: 'buddy', key: 'record' } as const, null)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
const EGG = 'Wait for the egg to hatch.'
const SAVE_FAILED = 'Could not save your buddy; it lives for this session only.'

type Look = {
```
with:
```tsx
const EGG = 'Wait for the egg to hatch.'
const SAVE_FAILED = 'Could not save your buddy; it lives for this session only.'
const SNAG = 'Your buddy hit a snag. Try again.'
const EGG_HATCHING = 'The egg is hatching.'

type Look = {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// The journal line a quip carries, if any (Memory spec section 4), noted in `recalled` so the
// same memory isn't carried again within the hour. A throw costs the memory, never the quip.
function quipMemory(journal: readonly Moment[] | undefined, facts: TurnFacts, now: number, bones: Bones): string | null {
  try {
    const m = recall({ journal, facts, now, stats: bones.stats, roll: Math.random(), pick: Math.random(), recalled })
    if (!m) return null
    recalled = { ...recalled, [momentKey(m)]: now }
    return memoryLine(m, now)
  } catch {
    return null
```
with:
```tsx
// The journal line a quip carries, if any (Memory spec section 4), noted in `recalled` so the
// same memory isn't carried again within the hour. A throw costs the memory, never the quip.
function quipMemory(
  journal: readonly Moment[] | undefined,
  facts: TurnFacts,
  now: number,
  bones: Bones,
  buddies: readonly Buddy[],
): string | null {
  try {
    const m = recall({ journal, facts, now, stats: bones.stats, roll: Math.random(), pick: Math.random(), recalled })
    if (!m) return null
    recalled = { ...recalled, [momentKey(m)]: now }
    return memoryLine(m, now, buddies)
  } catch {
    return null
```

In `buddy/hooks/register.tsx`, replace:
```tsx
async function talkMemoryLines($: EngineInterface, journal: readonly Moment[] | undefined): Promise<string[]> {
  try {
    return talkMemories(journal, await $.clock.now())
  } catch {
    return []
```
with:
```tsx
async function talkMemoryLines($: EngineInterface, journal: readonly Moment[] | undefined): Promise<string[]> {
  try {
    return talkMemories(journal, await $.clock.now(), (await read($, record))?.buddies)
  } catch {
    return []
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const memory = quipMemory(buddy.journal, facts, now, bones)
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
  // An announcement keeps the bubble: a quip that comes back over one is dropped.
```
with:
```tsx
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const memory = quipMemory(buddy.journal, facts, now, bones, saved.buddies)
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
  // An announcement keeps the bubble: a quip that comes back over one is dropped.
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// A new buddy's name and personality: one Haiku call, or the fallback when it fails (base spec
// section 5). Never throws: hatching never fails.
async function askSoul($: EngineInterface, seed: string, bones: Bones): Promise<{ name: string; personality: string }> {
  const fallback = fallbackSoul(seed, bones)
  try {
    const request = hatchRequest(bones)
    const result = await $.model.complete({
      model: 'haiku',
```
with:
```tsx
// A new buddy's name and personality: one Haiku call, or the fallback when it fails (base spec
// section 5). Never throws: hatching never fails.
async function askSoul(
  $: EngineInterface,
  seed: string,
  bones: Bones,
  parents?: readonly [Parent, Parent],
): Promise<{ name: string; personality: string }> {
  const fallback = fallbackSoul(seed, bones)
  try {
    const request = hatchRequest(bones, parents)
    const result = await $.model.complete({
      model: 'haiku',
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    if (!egg) return
    await update($, eggHatching, () => true)
    const soul = await askSoul($, egg.seed, eggBones(saved.buddies, egg))
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const change: Change = {
```
with:
```tsx
    if (!egg) return
    await update($, eggHatching, () => true)
    // A brooded egg's child hears who its parents are (Breeding spec section 4).
    const parentOf = (seed: string): Parent => {
      const b = saved.buddies.find(x => x.seed === seed)
      return { name: b?.soul.name ?? 'Buddy', species: bornBones(saved.buddies, seed).species, personality: b?.soul.personality ?? '' }
    }
    const parents = egg.parents ? ([parentOf(egg.parents[0]), parentOf(egg.parents[1])] as const) : undefined
    const soul = await askSoul($, egg.seed, eggBones(saved.buddies, egg), parents)
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const change: Change = {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    await update($, hatching, () => false)
  }
}

// What a hatch or a reroll answers when its commit wrote nothing: the record as it now stands,
```
with:
```tsx
    await update($, hatching, () => false)
  }
}

// What /buddy breed answers when its commit wrote nothing: the reason, from the record as it now
// stands, adopted, since another session may have set the egg's parents first.
async function unbred($: EngineInterface, who: string): Promise<string> {
  const stored = await current($)
  if (stored.kind !== 'ok') return refusal(stored) ?? NO_BUDDY
  await adopt($, stored.saved)
  const choice = breedChoice(stored.saved, who)
  return choice.kind === 'no' ? choice.reply : SNAG
}

// What a hatch or a reroll answers when its commit wrote nothing: the record as it now stands,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      return journalLines(shown.soul.name, shown.journal, await $.clock.now()).join('\n')
    }
    case 'dex': {
```
with:
```tsx
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      return journalLines(shown.soul.name, shown.journal, await $.clock.now(), saved.buddies).join('\n')
    }
    case 'dex': {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
    case 'rename': {
```
with:
```tsx
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
    case 'breed': {
      if (await read($, hatching)) return EGG
      if (await read($, eggHatching)) return EGG_HATCHING
      if (saved.mode === 'off') return hidden
      const choice = breedChoice(saved, parsed.target)
      if (choice.kind === 'no') return choice.reply
      const note = await commit($, { kind: 'breed', partner: choice.partner })
      // Refused: nothing was written or adopted.
      if (note !== null && note !== SAVE_FAILED) return note
      const after = await read($, record)
      const egg = after && readEgg(after)
      if (!after || egg?.parents?.[1] !== choice.partner) return unbred($, parsed.target)
      await feel($, [], 'celebrate')
      const partner = shownBuddy(after, choice.partner).soul.name
      const left = HATCH_TURNS - eggProgress(after, egg)
      return note ?? `${name} and ${partner} are brooding the egg. ${hatchesIn(left)}`
    }
    case 'rename': {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        description: 'Hatch, pet, or manage your terminal buddy',
        argumentHint:
          '[pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
        immediate: true,
      })
```
with:
```tsx
        description: 'Hatch, pet, or manage your terminal buddy',
        argumentHint:
          '[pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
        immediate: true,
      })
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      const buddy = shownBuddy(saved, await read($, journalSeed))
      const name = buddy.soul.name
      const rows = journalRows(buddy.journal, await $.clock.now())
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
```
with:
```tsx
      const buddy = shownBuddy(saved, await read($, journalSeed))
      const name = buddy.soul.name
      const rows = journalRows(buddy.journal, await $.clock.now(), saved.buddies)
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 435 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: /buddy breed, so two adults brood the egg and the hatchling takes after both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The egg in the band, and in the tour

**Files:**
- Modify: `buddy/hooks/sprites.ts`, `buddy/hooks/sprites.test.ts`
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/tour.ts`, `buddy/hooks/tour.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `readEgg`, `eggProgress`, `HATCH_TURNS` from `eggs.ts`; the `eggHatching` atom; `draw`'s `asleep`; `bandRows` and `rightRuns` in `layout.ts`.
- Produces:
  - from `sprites.ts`: `EGG_GUTTER = 7`, `SMALL_EGG`, `SMALL_EGG_CRACKED`, `eggGutterRows(o: { f: number; tick: number; hatching: boolean; still: boolean }): string[]`, always 5 rows of 7 columns
  - in `layout.ts`: `rightRuns(bubble, prop, egg: readonly string[] | null = null)`, `bubbleWidth(bodyColumns, gutter = 0)`, `bandRows(sprite, say, bodyColumns, at, gutter = 0)`
  - from `tour.ts`: `TourEgg = { f: number; hatching: boolean }`, `EGG_TICKS = 16`, `TOUR_EGGS`, and `egg: TourEgg | null` on `TourAt`; `TOUR_TICKS` is 700
  - in `register.tsx`: `egg: string[] | null` on `Look`, and `carriedEgg($, saved, tour, t, asleep)`

The egg stands in a 7-column gutter between the sprite and the bubble, and the bubble and a holiday prop shift right to make room. The desktop band draws the same runs as SVG text, so it needs no change of its own. A throw while drawing the egg costs only the egg. The debug tour ends with the real buddy carrying an egg at each wobble band, then hatching, so the live check needs no egg of its own.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/sprites.test.ts`, replace:
```ts
import { EYES, HATS, SPECIES, fnv1a32 } from './roll'
import {
  BLANK, CONFETTI, CRUMBS, DUCK_PROP, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS,
  PROP_ROWS, PROP_W, SNACK_ART, SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows,
  topRow,
} from './sprites'
import type { Prop } from './sprites'
```
with:
```ts
import { EYES, HATS, SPECIES, fnv1a32 } from './roll'
import {
  BLANK, CONFETTI, CRUMBS, DUCK_PROP, EARNED_HATS, EARNED_HAT_ART, EGG_GUTTER, HAT_ART, HEARTS, HOLIDAY_HATS, POSES,
  POSE_EYE, PROPS, PROP_ROWS, PROP_W, SMALL_EGG, SMALL_EGG_CRACKED, SNACK_ART, SPRITE_W, ZZZ, bodyRows, eggGutterRows,
  eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
} from './sprites'
import type { Prop } from './sprites'
```

In `buddy/hooks/sprites.test.ts`, replace:
```ts
    expect(egg.every(r => r.length === SPRITE_W)).toBe(true)
  }
})

test('every compact face is at most 6 columns', () => {
```
with:
```ts
    expect(egg.every(r => r.length === SPRITE_W)).toBe(true)
  }
})

test('the carried egg is 3 rows of 5 columns, whole and cracked', () => {
  for (const art of [SMALL_EGG, SMALL_EGG_CRACKED]) {
    expect(art).toHaveLength(3)
    expect(art.every(row => row.length === 5)).toBe(true)
  }
  expect(SMALL_EGG_CRACKED).not.toEqual(SMALL_EGG)
})

test('the egg stands on the ground row of its 7-column gutter, and wobbles more as it nears its hatch', () => {
  // The column the egg's middle row starts on: 1 at rest, 0 leaning left, 2 leaning right.
  const at = (f: number, tick: number, o: { hatching?: boolean; still?: boolean } = {}) =>
    eggGutterRows({ f, tick, hatching: o.hatching ?? false, still: o.still ?? false })
  const lean = (rows: string[]) => rows[3]!.indexOf('(')
  for (const f of [0, 0.5, 0.95]) {
    for (let tick = 0; tick < 32; tick++) {
      const rows = at(f, tick)
      expect(rows).toHaveLength(5)
      expect(rows.every(row => row.length === EGG_GUTTER)).toBe(true)
      expect(rows.slice(0, 2).every(row => row.trim() === '')).toBe(true)
    }
  }
  const leans = (f: number, o = {}) => Array.from({ length: 16 }, (_, tick) => lean(at(f, tick, o))).join('')
  expect(leans(0.25)).toBe('1111111102111111')
  expect(leans(0.75)).toBe('1111021111110211')
  expect(leans(0.95)).toBe('0211021102110211')
  expect(leans(0.95, { still: true })).toBe('1111111111111111')
  expect(leans(1, { hatching: true })).toBe('0202020202020202')
  // Whole until 90% along, then cracked, as it is while hatching.
  expect(at(0.89, 0)[3]).toBe(' (   ) ')
  expect(at(0.9, 0)[3]).toBe('(\\/\\)  ')
  expect(at(0.9, 2)[3]).toBe(' (\\/\\) ')
  expect(at(0.1, 2, { hatching: true })[3]).toBe('(\\/\\)  ')
  expect(at(0.25, 0).slice(2)).toEqual(['  .-.  ', ' (   ) ', "  '-'  "])
})

test('every compact face is at most 6 columns', () => {
```

In `buddy/hooks/layout.test.ts`, replace:
```ts
})

test('the journal reads newest first with ages padded, and its text form keeps to 11 lines', () => {
  const noon = new Date(2026, 9, 7, 12).getTime()
```
with:
```ts
})

test('a carried egg stands in a gutter before the bubble or the prop, which shift right to make room', () => {
  const egg = ['       ', '       ', '  .-.  ', ' (   ) ', "  '-'  "]
  const prop = { art: ['|*=', '|='], paint: [' br'] }
  const quiet = rightRuns(['', '', '', '', ''], prop, egg)
  expect(quiet[0]).toEqual([{ text: '       ' }, { text: '  ' }, { text: '|' }, { text: '*', color: 'blue' }, { text: '=', color: 'red' }])
  expect(quiet[3]).toEqual([{ text: ' (   ) ' }, { text: ' ' }])
  expect(bubbleWidth(80, 7)).toBe(59)
  expect(bubbleWidth(200, 7)).toBe(80)
  const talking = bandRows(SPRITE, 'x'.repeat(200), 80, 0, 7)
  expect(talking.bubble[0]).toHaveLength(59)
  expect(rightRuns(talking.bubble, null, egg).map(row => row.map(r => r.text).join(''))).toEqual(
    talking.bubble.map((row, i) => egg[i] + ' ' + row),
  )
})

test('the journal reads newest first with ages padded, and its text form keeps to 11 lines', () => {
  const noon = new Date(2026, 9, 7, 12).getTime()
```

In `buddy/hooks/tour.test.ts`, replace:
```ts
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { EARNED_HATS } from './sprites'
import { DECOR_TICKS, MOOD_TICKS, TOUR_DECORATIONS, TOUR_STEPS, TOUR_STEP_TICKS, TOUR_TICKS, tourAt } from './tour'

const SPECIES_TICKS = TOUR_STEPS * TOUR_STEP_TICKS
```
with:
```ts
import { EYES, HATS, RARITIES, SPECIES } from './roll'
import { EARNED_HATS } from './sprites'
import {
  DECOR_TICKS, EGG_TICKS, MOOD_TICKS, TOUR_DECORATIONS, TOUR_EGGS, TOUR_MOODS, TOUR_STEPS, TOUR_STEP_TICKS, TOUR_TICKS,
  tourAt,
} from './tour'

const SPECIES_TICKS = TOUR_STEPS * TOUR_STEP_TICKS
```

In `buddy/hooks/tour.test.ts`, replace:
```ts
})

test('the tour runs 636 ticks, and is over before it starts and after its last mood', () => {
  expect(TOUR_TICKS).toBe(636)
  expect(tourAt(-1)).toBeNull()
  expect(tourAt(TOUR_TICKS - 1)?.mood).toBe('sulky')
  expect(tourAt(TOUR_TICKS)).toBeNull()
})
```
with:
```ts
})

test('then the real buddy carries an egg a quarter along, three quarters, 95%, then hatching', () => {
  const eggsFrom = SPECIES_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS + TOUR_MOODS.length * MOOD_TICKS
  expect(EGG_TICKS).toBe(16)
  expect(TOUR_EGGS).toEqual([
    { f: 0.25, hatching: false },
    { f: 0.75, hatching: false },
    { f: 0.95, hatching: false },
    { f: 1, hatching: true },
  ])
  const steps = [0, 1, 2, 3].map(i => tourAt(eggsFrom + i * EGG_TICKS + 5)!)
  expect(steps.map(s => [s.name, s.egg, s.tick, s.mood, s.holiday])).toEqual([
    ['tour: egg 25%', { f: 0.25, hatching: false }, 5, 'neutral', null],
    ['tour: egg 75%', { f: 0.75, hatching: false }, 5, 'neutral', null],
    ['tour: egg 95%', { f: 0.95, hatching: false }, 5, 'neutral', null],
    ['tour: egg hatching', { f: 1, hatching: true }, 5, 'neutral', null],
  ])
  // No other phase carries one.
  for (const elapsed of [0, SPECIES_TICKS, eggsFrom - 1]) expect(tourAt(elapsed)?.egg).toBeNull()
})

test('the tour runs 700 ticks, and is over before it starts and after its egg hatches', () => {
  expect(TOUR_TICKS).toBe(700)
  expect(tourAt(-1)).toBeNull()
  expect(tourAt(TOUR_TICKS - 1)?.egg).toEqual({ f: 1, hatching: true })
  expect(tourAt(TOUR_TICKS)).toBeNull()
})
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
})

test('the tour ends by itself after the last mood', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
```
with:
```tsx
})

test('the tour ends by itself after its egg hatches', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(TOUR_TICKS * 500 - 500)
  expect(await ui.find({ type: 'Text', text: /tour: sulky/ })).toBeDefined()
  await clock.advance(500)
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
```
with:
```tsx
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(TOUR_TICKS * 500 - 500)
  expect(await ui.find({ type: 'Text', text: /tour: egg hatching/ })).toBeDefined()
  // The tour's egg, shaking, though this buddy carries none.
  expect(await ui.find({ text: /\(\\\/\\\)/ })).toBeDefined()
  await clock.advance(500)
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 1_471 },
}

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
```
with:
```tsx
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 1_471 },
}

test('the band carries the egg in a gutter beside the buddy, on the terminal and the desktop', async ($, on) => {
  world(on, { buddy: BROODY })
  model(on, null, 'Hi.')
  await $.session.start(START)
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  // 149 of 150 turns: cracked.
  expect(await terminal.find({ text: /\(\\\/\\\)/ })).toBeDefined()
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band(10, 80) })
  expect(String((await desktop.find({ type: 'Svg' }))?.props.source)).toContain('.-.')
  // The compact band has no room for it.
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  expect(await short.find({ text: /\.-\./ })).toBeUndefined()
})

test('an egg that cannot be drawn costs only the egg, never the band', async ($, on) => {
  world(on, { buddy: BROODY })
  // Once the session has started, the egg's hatching flag can't be read.
  let broken = false
  on('state.get', { plugin: 'buddy', key: 'eggHatching' }, async (_$, e, next) =>
    broken ? { deny: 'state offline' } : next(e),
  )
  await $.session.start(START)
  broken = true
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('a swap mid-egg keeps the egg in the band, and the buddy swapped in carries it to its hatch', async ($, on) => {
  const shared = sharedStore(on, BROODY)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  expect(await runner($)('swap mochi')).toBe('Mochi is back.')
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /\.-\./ })).toBeDefined()
  // Mochi's turn is the 150th since the egg started.
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  const saved = shared.row as Saved
  expect(saved.active).toBe('swap-1')
  expect(saved.buddies.at(-1)?.soul.name).toBe('Sprout')
})

test('with no egg out the band has no gutter', async ($, on) => {
  const { egg: _, ...none } = BROODY
  world(on, { buddy: none })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('the egg shakes, cracked, while its soul call is out', async ($, on) => {
  const due: Saved = { ...BROODY, egg: { ...BROODY.egg!, fromTurns: 1_400 } }
  const clock = world(on, { buddy: due })
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  for (let i = 0; i < 20; i++) await clock.advance(0)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  // The egg's middle row; the ghost's hem zigzags too, but never inside brackets.
  const middle = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').find(text => text.includes('(\\/\\)'))
  const first = await middle()
  await clock.advance(500)
  expect(await middle()).not.toBe(first)
  release()
  await clock.settle()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 410 pass and 7 fail:
- `buddy.test.tsx`: the tour ends by itself after its egg hatches
- `buddy.test.tsx`: the band carries the egg in a gutter beside the buddy, on the terminal and the desktop
- `buddy.test.tsx`: a swap mid-egg keeps the egg in the band, and the buddy swapped in carries it to its hatch
- `buddy.test.tsx`: the egg shakes, cracked, while its soul call is out
- `layout.test.ts`: a carried egg stands in a gutter before the bubble or the prop, which shift right to make room
- `sprites.test.ts` doesn't load
- `tour.test.ts` doesn't load

- [ ] **Step 3: Write the code**

In `buddy/hooks/sprites.ts`, replace:
```ts
}

export function eggRows(frame: Frame): string[] {
  const [whole, cracked] = parseArt(EGG) as [string[], string[]]
```
with:
```ts
}

// The egg carried beside the buddy (Breeding spec section 6): 3 rows by 5 columns, whole and
// cracked, standing in a gutter 7 columns wide so it can lean a column either way.
export const EGG_GUTTER = 7
export const SMALL_EGG: readonly string[] = [' .-. ', '(   )', " '-' "]
export const SMALL_EGG_CRACKED: readonly string[] = [' .-. ', '(\\/\\)', " '-' "]

// The ticks of the 16-tick cycle a wobble starts on, leaning left, then right on the next: more
// often as the egg nears its hatch.
function wobbleStarts(f: number): readonly number[] {
  if (f >= 0.9) return [0, 4, 8, 12]
  if (f >= 0.5) return [4, 12]
  return [8]
}

// The gutter's 5 rows at `tick`, the egg on the bottom 3, standing on the sprite's ground row. `f`
// is how far along it is, 0 to 1. Cracked from 0.9, and shaking every tick while it hatches; still
// while the buddy sleeps.
export function eggGutterRows(o: { f: number; tick: number; hatching: boolean; still: boolean }): string[] {
  const t = ((o.tick % 16) + 16) % 16
  const starts = wobbleStarts(o.f)
  let lean = 0
  if (o.hatching) lean = t % 2 === 0 ? -1 : 1
  else if (!o.still && starts.includes(t)) lean = -1
  else if (!o.still && starts.includes(t - 1)) lean = 1
  const art = o.hatching || o.f >= 0.9 ? SMALL_EGG_CRACKED : SMALL_EGG
  return ['', '', ...art].map(row => (row ? ' '.repeat(1 + lean) + row : '').padEnd(EGG_GUTTER))
}

export function eggRows(frame: Frame): string[] {
  const [whole, cracked] = parseArt(EGG) as [string[], string[]]
```

In `buddy/hooks/layout.ts`, replace:
```ts
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
with:
```ts
}

// The band's right-hand column, a row of runs per sprite row: the bubble when it has one, else
// a holiday prop after a 2-column gap, else a space. An egg being carried stands in a gutter
// before it (Breeding spec section 6).
export function rightRuns(bubble: readonly string[], prop: Prop | null, egg: readonly string[] | null = null): Run[][] {
  const quiet = bubble.every(row => !row)
  return bubble.map((row, i) => {
    const art = quiet ? prop?.art[i] : undefined
    const runs = art ? [{ text: ' '.repeat(PROP_GAP) }, ...paintRuns(art, prop?.paint?.[i])] : [{ text: ' ' + row }]
    return egg ? [{ text: egg[i] ?? '' }, ...runs] : runs
  })
}
```

In `buddy/hooks/layout.ts`, replace:
```ts
}

export function bubbleWidth(bodyColumns: number): number {
  return Math.min(bodyColumns - 14, MAX_BUBBLE_W)
}

// Which of `count` pages is up `at` (0 to 1) of the way through a bubble's life: each gets an equal share.
```
with:
```ts
}

// `gutter` is the columns an egg takes between the sprite and the bubble.
export function bubbleWidth(bodyColumns: number, gutter = 0): number {
  return Math.min(bodyColumns - 14 - gutter, MAX_BUBBLE_W)
}

// Which of `count` pages is up `at` (0 to 1) of the way through a bubble's life: each gets an equal share.
```

In `buddy/hooks/layout.ts`, replace:
```ts
  bodyColumns: number,
  at: number,
): { sprite: string[]; bubble: string[] } {
  const box = say ? bubbleRows(say, bubbleWidth(bodyColumns), at) : []
  return {
    sprite: Array.from({ length: 5 }, (_, i) => sprite[i] ?? ''),
```
with:
```ts
  bodyColumns: number,
  at: number,
  gutter = 0,
): { sprite: string[]; bubble: string[] } {
  const box = say ? bubbleRows(say, bubbleWidth(bodyColumns, gutter), at) : []
  return {
    sprite: Array.from({ length: 5 }, (_, i) => sprite[i] ?? ''),
```

In `buddy/hooks/tour.ts`, replace:
```ts
// The hidden /buddy debug tour (Alive spec section 7). First a step for every species: plain,
// then shiny, then its flinch, celebrate and sleep. Then the real buddy wears each holiday's
// hat and prop, hatch day last, then each mood. Hats, rarities and eyes rotate; some
// combinations (a common in a crown) can never roll. Pure: no $.
import { HOLIDAYS, hatchDay } from './calendar'
import type { Holiday } from './calendar'
```
with:
```ts
// The hidden /buddy debug tour (Alive spec section 7). First a step for every species: plain,
// then shiny, then its flinch, celebrate and sleep. Then the real buddy wears each holiday's
// hat and prop, hatch day last, then each mood, then carries an egg at each stage of its wobble
// and hatching (Breeding spec section 6). Hats, rarities and eyes rotate; some combinations (a
// common in a crown) can never roll. Pure: no $.
import { HOLIDAYS, hatchDay } from './calendar'
import type { Holiday } from './calendar'
```

In `buddy/hooks/tour.ts`, replace:
```ts
]
export const TOUR_MOODS: readonly MoodName[] = ['anxious', 'smug', 'sulky']
export const TOUR_TICKS =
  TOUR_STEPS * TOUR_STEP_TICKS + TOUR_DECORATIONS.length * DECOR_TICKS + TOUR_MOODS.length * MOOD_TICKS

// Within a species step: plain until tick 8, shiny until 16, then 4 ticks of each pose.
```
with:
```ts
]
export const TOUR_MOODS: readonly MoodName[] = ['anxious', 'smug', 'sulky']
// The egg phase: a 16-tick cycle each at a quarter, three quarters and 95% along, then hatching.
export const EGG_TICKS = 16
export const TOUR_EGGS: readonly TourEgg[] = [
  { f: 0.25, hatching: false },
  { f: 0.75, hatching: false },
  { f: 0.95, hatching: false },
  { f: 1, hatching: true },
]
export const TOUR_TICKS =
  TOUR_STEPS * TOUR_STEP_TICKS +
  TOUR_DECORATIONS.length * DECOR_TICKS +
  TOUR_MOODS.length * MOOD_TICKS +
  TOUR_EGGS.length * EGG_TICKS

// Within a species step: plain until tick 8, shiny until 16, then 4 ticks of each pose.
```

In `buddy/hooks/tour.ts`, replace:
```ts
const SHINY_HATS = ['none', ...HATS, ...EARNED_HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'shiny'> & { hat: Worn }

export type TourAt = {
```
with:
```ts
const SHINY_HATS = ['none', ...HATS, ...EARNED_HATS] as const

export type TourLook = Pick<Bones, 'rarity' | 'species' | 'eye' | 'shiny'> & { hat: Worn }
// An egg as the egg phase carries it: how far along, and whether it is hatching.
export type TourEgg = { f: number; hatching: boolean }

export type TourAt = {
```

In `buddy/hooks/tour.ts`, replace:
```ts
  // The stage every phase is drawn at.
  stage: Stage
}

// `elapsed` is ticks since the tour started; null once it is over.
```
with:
```ts
  // The stage every phase is drawn at.
  stage: Stage
  // The egg the egg phase carries; null in every other phase.
  egg: TourEgg | null
}

// `elapsed` is ticks since the tour started; null once it is over.
```

In `buddy/hooks/tour.ts`, replace:
```ts
      mood: 'neutral',
      stage,
    }
  }
```
with:
```ts
      mood: 'neutral',
      stage,
      egg: null,
    }
  }
```

In `buddy/hooks/tour.ts`, replace:
```ts
  if (into < decorTicks) {
    const holiday = TOUR_DECORATIONS[Math.floor(into / DECOR_TICKS)]!
    return { name: `tour: ${holiday.name}`, tick: into % DECOR_TICKS, look: {}, pose: null, holiday, mood: 'neutral', stage }
  }
  const mood = TOUR_MOODS[Math.floor((into - decorTicks) / MOOD_TICKS)]!
  return { name: `tour: ${mood}`, tick: (into - decorTicks) % MOOD_TICKS, look: {}, pose: null, holiday: null, mood, stage }
}
```
with:
```ts
  if (into < decorTicks) {
    const holiday = TOUR_DECORATIONS[Math.floor(into / DECOR_TICKS)]!
    const tick = into % DECOR_TICKS
    return { name: `tour: ${holiday.name}`, tick, look: {}, pose: null, holiday, mood: 'neutral', stage, egg: null }
  }
  const moodTicks = TOUR_MOODS.length * MOOD_TICKS
  if (into - decorTicks < moodTicks) {
    const mood = TOUR_MOODS[Math.floor((into - decorTicks) / MOOD_TICKS)]!
    const tick = (into - decorTicks) % MOOD_TICKS
    return { name: `tour: ${mood}`, tick, look: {}, pose: null, holiday: null, mood, stage, egg: null }
  }
  const eggInto = into - decorTicks - moodTicks
  const egg = TOUR_EGGS[Math.floor(eggInto / EGG_TICKS)]!
  const name = egg.hatching ? 'tour: egg hatching' : `tour: egg ${Math.round(egg.f * 100)}%`
  return { name, tick: eggInto % EGG_TICKS, look: {}, pose: null, holiday: null, mood: 'neutral', stage, egg }
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { RARITY, STATS, rollBones } from './roll'
import type { Bones } from './roll'
import { eggRows, frameAt } from './sprites'
import type { Frame, Prop } from './sprites'
import { bandSvg } from './svg'
```
with:
```tsx
import { RARITY, STATS, rollBones } from './roll'
import type { Bones } from './roll'
import { EGG_GUTTER, eggGutterRows, eggRows, frameAt } from './sprites'
import type { Frame, Prop } from './sprites'
import { bandSvg } from './svg'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  // A holiday prop beside the sprite, while nothing is said.
  prop: Prop | null
}

// The part of a buddy that speaks: its seed and counts, for its grown bones, its soul, and its
```
with:
```tsx
  // A holiday prop beside the sprite, while nothing is said.
  prop: Prop | null
  // The egg being carried, in its gutter's rows; null with none (Breeding spec section 6).
  egg: string[] | null
}

// The part of a buddy that speaks: its seed and counts, for its grown bones, its soul, and its
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    sayAt: 0,
    prop: null,
  }
}
```
with:
```tsx
    sayAt: 0,
    prop: null,
    egg: null,
  }
}

// The egg the band carries now: the tour's in its egg phase, none in its others, else the record's,
// as far along as its turns say, cracked and shaking while it hatches, and still while the buddy
// sleeps. A throw costs only the egg: the band draws without its gutter (Breeding spec section 9).
async function carriedEgg(
  $: EngineInterface,
  saved: Saved,
  tour: ReturnType<typeof tourAt>,
  t: number,
  asleep: boolean,
): Promise<string[] | null> {
  try {
    if (tour) return tour.egg ? eggGutterRows({ ...tour.egg, tick: tour.tick, still: false }) : null
    const egg = readEgg(saved)
    if (!egg) return null
    const f = eggProgress(saved, egg) / HATCH_TURNS
    return eggGutterRows({ f, tick: t, hatching: await read($, eggHatching), still: asleep })
  } catch {
    return null
  }
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    sayAt: saying ? (t - said.fromTick) / (said.untilTick - said.fromTick) : 0,
    prop: drawn.prop,
  }
}
```
with:
```tsx
    sayAt: saying ? (t - said.fromTick) / (said.untilTick - said.fromTick) : 0,
    prop: drawn.prop,
    egg: await carriedEgg($, saved, tour, t, drawn.asleep),
  }
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns, view.sayAt)
      const right = rightRuns(rows.bubble, view.prop)
      const nameRow = (
        <Box>
```
with:
```tsx
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns, view.sayAt, view.egg ? EGG_GUTTER : 0)
      const right = rightRuns(rows.bubble, view.prop, view.egg)
      const nameRow = (
        <Box>
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 444 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: the egg rides in a gutter beside the buddy, wobbling toward its hatch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The card and the dex

**Files:**
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/card.ts`, `buddy/hooks/card.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `parentsOf` from `breed.ts`; `readEgg`, `eggProgress`, `eggXpSoFar`, `EGG_XP`, `HATCH_TURNS` from `eggs.ts`; `cardProgress`, `cardLines`, `achievementsText`, `dexRows` in `layout.ts`.
- Produces:
  - in `layout.ts`: `DexName = { number: number; name: string }`; `CardEgg = { kind: 'next'; xp: number } | { kind: 'carrying'; turns: number; parents: [string, string] | null }`; `parents?: [DexName, DexName] | null` and `egg?: CardEgg` on `CardProgress`, which `cardProgress` always fills; `eggText(egg)`; `hatchLine(soul, rerolls, progress?)`; `achievementsText(earned, egg?)`; `dexRows` dates of `hatched Oct 9` for a hatchling never yet active
  - in `card.ts`: the parents row, the egg row under the XP bar, and their alt sentences

Eggs are yours, so every card shows the same egg row. The text card folds the parents into its hatch line and the egg into its achievements line, so it keeps to 12 lines.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/layout.test.ts`, replace:
```ts
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, dexLines, dexRows, dexText, isCompact, journalLines, journalRows, levelText, longDate, nameLine, pageAt,
  paintRuns, rightRuns, shortDate, spriteTint, streakLine, wrap,
} from './layout'
import { zeroCounts } from './ledger'
import { rollBones } from './roll'
```
with:
```ts
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, dexLines, dexRows, dexText, eggText, hatchLine, isCompact, journalLines, journalRows, levelText, longDate,
  nameLine, pageAt,
  paintRuns, rightRuns, shortDate, spriteTint, streakLine, wrap,
} from './layout'
import type { DexName } from './layout'
import { zeroCounts } from './ledger'
import { rollBones } from './roll'
```

In `buddy/hooks/layout.test.ts`, replace:
```ts
    },
  }
  // Two earned the same day keep table order; a newer build's id is left out.
  expect(cardProgress(saved, buddy)).toEqual({
    level: 12,
```
with:
```ts
    },
  }
  // Two earned the same day keep table order; a newer build's id is left out. 12,100 XP is one
  // egg's worth and 4,000 toward the next.
  expect(cardProgress(saved, buddy)).toEqual({
    level: 12,
```

In `buddy/hooks/layout.test.ts`, replace:
```ts
    earned: ['Shell regular', 'Survivor', 'Marathon'],
    retiredAt: null,
  })
})

// Pip, a common dragon ('swap-1') retired on Nov 2 at level 30, and Mochi, a common axolotl
```
with:
```ts
    earned: ['Shell regular', 'Survivor', 'Marathon'],
    retiredAt: null,
    parents: null,
    egg: { kind: 'next', xp: 4_000 },
  })
})

test("a card's progress names a bred buddy's parents, and the egg on its way with who broods it", () => {
  const entry = (seed: string, name: string, parents?: [string, string]) => ({
    seed,
    soul: { ...SOUL, name },
    retiredAt: null,
    counts: zeroCounts(),
    ...(parents ? { parents } : {}),
  })
  const child = entry('c', 'Sprout', ['a', 'b'])
  const saved: Saved = {
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'a',
    buddies: [entry('a', 'Pip'), entry('b', 'Mochi'), child],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, eggs: 1 },
    egg: { seed: 'e', startedAt: '2026-10-07T12:00:00.000Z', fromTurns: 0, parents: ['b', 'a'] },
  }
  const progress = cardProgress(saved, child)
  expect(progress.parents).toEqual([
    { number: 1, name: 'Pip' },
    { number: 2, name: 'Mochi' },
  ])
  expect(progress.egg).toEqual({ kind: 'carrying', turns: 0, parents: ['Mochi', 'Pip'] })
  expect(cardProgress(saved, saved.buddies[0]!).parents).toBeNull()
  const { egg: _, ...none } = saved
  expect(cardProgress(none, child).egg).toEqual({ kind: 'next', xp: 0 })
})

test('the text card folds the parents into the hatch line and the egg into the achievements line', () => {
  const progress = {
    level: 12,
    stage: 'adult' as const,
    xp: 13_250,
    earned: [],
    retiredAt: '2026-10-09T08:00:00.000Z',
    parents: [{ number: 1, name: 'Pip' }, { number: 3, name: 'Mochi' }] as [DexName, DexName],
    egg: { kind: 'next' as const, xp: 3_200 },
  }
  expect(hatchLine(SOUL, 1, progress)).toBe('Hatched 2026-10-07 from #1 Pip and #3 Mochi   Rerolls: 1   Retired 2026-10-09')
  expect(hatchLine(SOUL, 1)).toBe('Hatched 2026-10-07   Rerolls: 1')
  expect(eggText({ kind: 'next', xp: 3_200 })).toBe('Next egg 3,200 / 8,100 xp')
  expect(eggText({ kind: 'carrying', turns: 40, parents: null })).toBe('Egg 40 / 150 turns')
  expect(achievementsText(7, progress.egg)).toBe('Achievements: 7 of 17 · Next egg 3,200 / 8,100 xp')
  const you = { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }
  const card = [
    ...cardLines(SOUL, rollBones('layout-seed'), 1, progress),
    streakLine(you, zeroCounts()),
    achievementsText(0, progress.egg),
  ]
  expect(card).toHaveLength(12)
  expect(card[9]).toBe('Hatched 2026-10-07 from #1 Pip and #3 Mochi   Rerolls: 1   Retired 2026-10-09')
  expect(card[11]).toBe('Achievements: 0 of 17 · Next egg 3,200 / 8,100 xp')
})

// Pip, a common dragon ('swap-1') retired on Nov 2 at level 30, and Mochi, a common axolotl
```

In `buddy/hooks/layout.test.ts`, replace:
```ts
})

test('the text dex is a count, a note of any older ones, then at most the newest ten', () => {
  const many = (count: number): Saved => ({
```
with:
```ts
})

test('a hatchling never yet active is listed by the day it hatched', () => {
  const waiting = { ...DEX_RECORD.buddies[1]!, seed: 'swap-3', soul: { ...SOUL, name: 'Sprout', hatchedAt: '2026-11-03T09:00:00.000Z' }, retiredAt: '2026-11-03T09:00:00.000Z' }
  const rows = dexRows({ ...DEX_RECORD, buddies: [...DEX_RECORD.buddies, waiting] }, NOV3)
  expect(rows.map(r => r.dates)).toEqual(['Oct 7 – Nov 2', 'Nov 2 – now', 'hatched Nov 3'])
})

test('the text dex is a count, a note of any older ones, then at most the newest ten', () => {
  const many = (count: number): Saved => ({
```

In `buddy/hooks/card.test.ts`, replace:
```ts
import { cardAlt, cardSvg, dexAlt, dexSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import { dexRows } from './layout'
import type { CardProgress } from './layout'
import { zeroCounts } from './ledger'
import type { Bones } from './roll'
```
with:
```ts
import { cardAlt, cardSvg, dexAlt, dexSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import { dexRows } from './layout'
import type { CardProgress, DexName } from './layout'
import { zeroCounts } from './ledger'
import type { Bones } from './roll'
```

In `buddy/hooks/card.test.ts`, replace:
```ts
})

// Pip, a common dragon retired on Nov 2 at level 30, and Mochi, a common axolotl here now at level 12.
const DEX_RECORD: Saved = {
```
with:
```ts
})

test("a bred buddy's card names its parents under the hatch row, escaped, and its alt says who they were", () => {
  const parents: [DexName, DexName] = [
    { number: 1, name: 'Pip' },
    { number: 3, name: 'M&M' },
  ]
  const bred = { ...PROGRESS, parents }
  const svg = cardSvg(SOUL, BONES, 0, undefined, bred)
  expect(svg).toContain('>Parents  #1 Pip × #3 M&amp;M</text>')
  expect(heightOf(svg)).toBe(heightOf(cardSvg(SOUL, BONES, 0, undefined, PROGRESS)) + 20)
  expect(cardAlt(SOUL, BONES, 0, undefined, bred)).toContain('Hatched Oct 7, 2026. Bred from Pip and M&M. Rerolls 0.')
})

test('the egg row under the XP bar fills toward the next egg, or with the turns of the one on its way', () => {
  const next = cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, egg: { kind: 'next', xp: 2_025 } })
  expect(next).toContain('>Next egg</text>')
  expect(next).toContain('>2,025 / 8,100 xp</text>')
  // A quarter of the 372 px bar.
  expect(next).toContain('width="93.0" height="6"')
  expect(heightOf(next)).toBe(heightOf(cardSvg(SOUL, BONES, 0, undefined, PROGRESS)) + 40)
  const carrying = { ...PROGRESS, egg: { kind: 'carrying' as const, turns: 75, parents: ['Pip', '<Mo>'] as [string, string] } }
  const svg = cardSvg(SOUL, BONES, 0, undefined, carrying)
  expect(svg).toContain('>Egg</text>')
  expect(svg).toContain('>75 / 150 turns</text>')
  expect(svg).toContain('width="186.0" height="6"')
  expect(svg).toContain('>brooded by Pip and &lt;Mo&gt;</text>')
  expect(heightOf(svg)).toBe(heightOf(next) + 18)
  expect(cardAlt(SOUL, BONES, 0, undefined, { ...PROGRESS, egg: { kind: 'next', xp: 3_200 } })).toContain(
    'Shell regular. Next egg at 3,200 of 8,100 XP. Hatched',
  )
  expect(cardAlt(SOUL, BONES, 0, undefined, carrying)).toContain(
    'An egg is 75 of 150 turns along, brooded by Pip and <Mo>. Hatched',
  )
})

// Pip, a common dragon retired on Nov 2 at level 30, and Mochi, a common axolotl here now at level 12.
const DEX_RECORD: Saved = {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  expect(card).toMatch(/Counts semicolons\./)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/^Streak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/m)
})

test('the card pane is one drawn card on desktop and meters on the terminal', async ($, on) => {
```
with:
```tsx
  expect(card).toMatch(/Counts semicolons\./)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/^Streak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17 · Next egg 0 \/ 8,100 xp$/m)
})

test('the card pane is one drawn card on desktop and meters on the terminal', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/)
})

test('reroll asks first, then replaces the buddy and counts the reroll, once', async ($, on) => {
```
with:
```tsx
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17 · Next egg 0 \/ 8,100 xp$/)
})

test('reroll asks first, then replaces the buddy and counts the reroll, once', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  await clock.settle()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
```
with:
```tsx
  await clock.settle()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test("the text card folds in a bred buddy's parents and the egg on its way, within 12 lines", async ($, on) => {
  const sprout = {
    seed: 'young-4',
    soul: { ...RECORD.soul, name: 'Sprout', hatchedAt: '2026-10-06T12:00:00.000Z' },
    retiredAt: '2026-10-06T12:00:00.000Z',
    counts: zeroCounts(),
    parents: ['test-seed', 'swap-1'] as [string, string],
  }
  const saved: Saved = { ...BROODY, buddies: [...BROODY.buddies, sprout] }
  world(on, { buddy: saved }, false)
  await $.session.start(START)
  const run = runner($)
  const card = (await run('card sprout')) ?? ''
  expect(card.split('\n').length).toBeLessThanOrEqual(12)
  expect(card).toContain('Hatched 2026-10-06 from #1 Pip and #2 Mochi   Rerolls: 0')
  expect(card).toContain('Achievements: 2 of 17 · Egg 149 / 150 turns')
  expect(await run('dex')).toContain('Sprout        Lv 1 hatchling')
  expect(await run('dex')).toContain('hatched Oct 6')
})

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  const text = await cardText($)
  expect(text).toContain('\nLv 12 adult · 12,100 / 14,400 xp\n')
  expect(text).toMatch(/\nAchievements: 2 of 17\nMarathon · Grown up$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toContain('. Level 12, adult, 12,100 of 14,400 XP. 2 of 17 achievements: Marathon, Grown up. Hatched')
  expect(String(svg?.props.source)).toContain('>Lv 12 adult</text>')
})
```
with:
```tsx
  const text = await cardText($)
  expect(text).toContain('\nLv 12 adult · 12,100 / 14,400 xp\n')
  expect(text).toMatch(/\nAchievements: 2 of 17 · Next egg 4,000 \/ 8,100 xp\nMarathon · Grown up$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toContain(
    '. Level 12, adult, 12,100 of 14,400 XP. 2 of 17 achievements: Marathon, Grown up. Next egg at 4,000 of 8,100 XP. Hatched',
  )
  expect(String(svg?.props.source)).toContain('>Lv 12 adult</text>')
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | grep -E '^hooks|^\(fail\)|^ [0-9]+ (pass|fail)$'
```
Expected: FAIL, 410 pass and 7 fail:
- `buddy.test.tsx`: card opens a pane with the name, personality, rerolls and streak, and prints nothing
- `buddy.test.tsx`: where no pane can be placed, card prints the text card with the streak
- `buddy.test.tsx`: the text card folds in a bred buddy's parents and the egg on its way, within 12 lines
- `buddy.test.tsx`: the card shows the level, the XP to the next one, and your achievements, on every surface
- `card.test.ts`: a bred buddy's card names its parents under the hatch row, escaped, and its alt says who they were
- `card.test.ts`: the egg row under the XP bar fills toward the next egg, or with the turns of the one on its way
- `layout.test.ts` doesn't load

- [ ] **Step 3: Write the code**

In `buddy/hooks/layout.ts`, replace:
```ts
import type { Buddy, Counts, Moment, Saved, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { ageText, momentText, readable } from './journal'
import type { Names } from './journal'
```
with:
```ts
import type { Buddy, Counts, Moment, Saved, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { parentsOf } from './breed'
import { EGG_XP, HATCH_TURNS, eggProgress, eggXpSoFar, readEgg } from './eggs'
import { ageText, momentText, readable } from './journal'
import type { Names } from './journal'
```

In `buddy/hooks/layout.ts`, replace:
```ts
}

// The shown buddy's growth and your achievements, for the card (Progression spec section 6).
export type CardProgress = {
  level: number
```
with:
```ts
}

// A buddy as the card names it: its dex number and name.
export type DexName = { number: number; name: string }

// Your egg, for the card (Breeding spec section 6): the XP toward the next one, or the one
// incubating, its turns and, once brooded, its parents' names.
export type CardEgg = { kind: 'next'; xp: number } | { kind: 'carrying'; turns: number; parents: [string, string] | null }

// The shown buddy's growth and your achievements, for the card (Progression spec section 6), and
// its parents and your egg (Breeding spec section 6). Missing parents or egg draw no row.
export type CardProgress = {
  level: number
```

In `buddy/hooks/layout.ts`, replace:
```ts
  // When the shown buddy was retired; null for the active one.
  retiredAt: string | null
}

export function cardProgress(saved: Saved, buddy: Buddy): CardProgress {
```
with:
```ts
  // When the shown buddy was retired; null for the active one.
  retiredAt: string | null
  // A bred buddy's parents; null for a rolled one.
  parents?: [DexName, DexName] | null
  egg?: CardEgg
}

export function cardProgress(saved: Saved, buddy: Buddy): CardProgress {
```

In `buddy/hooks/layout.ts`, replace:
```ts
    .sort((a, b) => (when(b.id) > when(a.id) ? 1 : when(b.id) < when(a.id) ? -1 : 0))
    .map(a => a.title)
  return { level, stage: stageOf(level), xp: xpOf(buddy.counts), earned, retiredAt: buddy.retiredAt }
}

// "Lv 12 adult · 12,345 / 14,400 xp": the XP so far over the XP for the next level.
```
with:
```ts
    .sort((a, b) => (when(b.id) > when(a.id) ? 1 : when(b.id) < when(a.id) ? -1 : 0))
    .map(a => a.title)
  const dexName = (seed: string): DexName => {
    const i = saved.buddies.findIndex(b => b.seed === seed)
    return { number: i + 1, name: saved.buddies[i]?.soul.name ?? 'Buddy' }
  }
  const pair = parentsOf(saved.buddies, buddy.parents)
  const egg = readEgg(saved)
  return {
    level,
    stage: stageOf(level),
    xp: xpOf(buddy.counts),
    earned,
    retiredAt: buddy.retiredAt,
    parents: pair ? [dexName(pair[0]), dexName(pair[1])] : null,
    egg: egg
      ? {
          kind: 'carrying',
          turns: eggProgress(saved, egg),
          parents: egg.parents ? [dexName(egg.parents[0]).name, dexName(egg.parents[1]).name] : null,
        }
      : { kind: 'next', xp: eggXpSoFar(saved) },
  }
}

// "Next egg 3,200 / 8,100 xp", or "Egg 40 / 150 turns".
export function eggText(egg: CardEgg): string {
  return egg.kind === 'next'
    ? `Next egg ${withCommas(egg.xp)} / ${withCommas(EGG_XP)} xp`
    : `Egg ${egg.turns} / ${HATCH_TURNS} turns`
}

// The card's hatch line, with a bred buddy's parents and a retired buddy's retirement:
// "Hatched 2026-10-09 from #1 Pip and #3 Mochi   Rerolls: 1   Retired 2026-10-10".
export function hatchLine(soul: Soul, rerolls: number, progress?: CardProgress): string {
  const p = progress?.parents
  const from = p ? ` from #${p[0].number} ${p[0].name} and #${p[1].number} ${p[1].name}` : ''
  const retired = progress?.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
  return `Hatched ${soul.hatchedAt.slice(0, 10)}${from}   Rerolls: ${rerolls}${retired}`
}

// "Lv 12 adult · 12,345 / 14,400 xp": the XP so far over the XP for the next level.
```

In `buddy/hooks/layout.ts`, replace:
```ts
}

export function achievementsText(earned: number): string {
  return `Achievements: ${earned} of ${ACHIEVEMENTS.length}`
}

export function cardLines(soul: Soul, bones: Dressed, rerolls: number, progress?: CardProgress): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  const retired = progress?.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
```
with:
```ts
}

// The egg rides on the achievements line, so the text card keeps to 12 lines (Breeding spec section 6).
export function achievementsText(earned: number, egg?: CardEgg): string {
  return `Achievements: ${earned} of ${ACHIEVEMENTS.length}${egg ? ` · ${eggText(egg)}` : ''}`
}

export function cardLines(soul: Soul, bones: Dressed, rerolls: number, progress?: CardProgress): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
```

In `buddy/hooks/layout.ts`, replace:
```ts
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}${retired}`,
  ]
}
```
with:
```ts
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    hatchLine(soul, rerolls, progress),
  ]
}
```

In `buddy/hooks/layout.ts`, replace:
```ts
  level: number
  stage: Stage
  // "Oct 7 – Nov 2", or "Oct 7 – now" for the active buddy.
  dates: string
  active: boolean
```
with:
```ts
  level: number
  stage: Stage
  // "Oct 7 – Nov 2", "Oct 7 – now" for the active buddy, or "hatched Oct 9" for one never yet
  // active (Breeding spec section 3).
  dates: string
  active: boolean
```

In `buddy/hooks/layout.ts`, replace:
```ts
    const active = b.seed === saved.active
    const end = active || b.retiredAt === null ? 'now' : shortDate(b.retiredAt, year)
    return {
      number: i + 1,
```
with:
```ts
    const active = b.seed === saved.active
    const end = active || b.retiredAt === null ? 'now' : shortDate(b.retiredAt, year)
    const hatched = shortDate(b.soul.hatchedAt, year)
    return {
      number: i + 1,
```

In `buddy/hooks/layout.ts`, replace:
```ts
      level,
      stage: stageOf(level),
      dates: `${shortDate(b.soul.hatchedAt, year)} – ${end}`,
      active,
    }
```
with:
```ts
      level,
      stage: stageOf(level),
      dates: !active && b.retiredAt === b.soul.hatchedAt ? `hatched ${hatched}` : `${hatched} – ${end}`,
      active,
    }
```

In `buddy/hooks/card.ts`, replace:
```ts
import type { Counts, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS } from './achievements'
import { countsText, emptyJournal, journalHeader, longDate, streakLine, streakText, wrap } from './layout'
import type { CardProgress, DexRow, JournalRow } from './layout'
import { withCommas } from './ledger'
import { nextLevelXp, xpForLevel } from './progress'
```
with:
```ts
import type { Counts, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS } from './achievements'
import { EGG_XP, HATCH_TURNS } from './eggs'
import { countsText, emptyJournal, journalHeader, longDate, streakLine, streakText, wrap } from './layout'
import type { CardEgg, CardProgress, DexRow, JournalRow } from './layout'
import { withCommas } from './ledger'
import { nextLevelXp, xpForLevel } from './progress'
```

In `buddy/hooks/card.ts`, replace:
```ts
  )

  if (history) {
    marks.push(
      `<text x="${PAD}" y="${foot + 42}" font-size="12" fill="${INK}">${esc(streakText(history.you))}</text>`,
      `<text x="${W - PAD}" y="${foot + 42}" text-anchor="end" font-size="12" fill="${INK}">${esc(countsText(history.counts))}</text>`,
    )
  }
```
with:
```ts
  )

  // A bred buddy's parents get a row under the hatch row (Breeding spec section 6).
  let last = foot + 22
  const p = progress?.parents
  if (p) {
    last += 20
    const names = `#${p[0].number} ${p[0].name} × #${p[1].number} ${p[1].name}`
    marks.push(`<text x="${PAD}" y="${last}" font-size="12" fill="${INK}">Parents  ${esc(names)}</text>`)
  }

  if (history) {
    last += 20
    marks.push(
      `<text x="${PAD}" y="${last}" font-size="12" fill="${INK}">${esc(streakText(history.you))}</text>`,
      `<text x="${W - PAD}" y="${last}" text-anchor="end" font-size="12" fill="${INK}">${esc(countsText(history.counts))}</text>`,
    )
  }
```

In `buddy/hooks/card.ts`, replace:
```ts
  }

  const last = foot + (history ? 42 : 22)
  return framed(color, (progress ? growthMarks(marks, color, progress, last) : last) + 16, marks)
}
```
with:
```ts
  }

  return framed(color, (progress ? growthMarks(marks, color, progress, last) : last) + 16, marks)
}
```

In `buddy/hooks/card.ts`, replace:
```ts
    `<rect x="${PAD}" y="${barY}" width="${(span * filled).toFixed(1)}" height="6" rx="3" fill="${color}"/>`,
  )
  const headY = barY + 30
  marks.push(
    `<text x="${PAD}" y="${headY}" font-size="12" fill="${INK}">Achievements ${p.earned.length} of ${ACHIEVEMENTS.length}</text>`,
```
with:
```ts
    `<rect x="${PAD}" y="${barY}" width="${(span * filled).toFixed(1)}" height="6" rx="3" fill="${color}"/>`,
  )
  const headY = (p.egg ? eggMarks(marks, color, p.egg, barY) : barY) + 30
  marks.push(
    `<text x="${PAD}" y="${headY}" font-size="12" fill="${INK}">Achievements ${p.earned.length} of ${ACHIEVEMENTS.length}</text>`,
```

In `buddy/hooks/card.ts`, replace:
```ts
  }
  return p.earned.length > 0 ? top + 22 : headY
}

// The card's frame around `marks`: a rounded border in the rarity color, `h` px tall.
```
with:
```ts
  }
  return p.earned.length > 0 ? top + 22 : headY
}

// Your egg under the XP bar, whose top is at `above` (Breeding spec section 6): the XP toward the
// next, or the turns of the one incubating and who broods it. Returns the y the next row counts from.
function eggMarks(marks: string[], color: string, egg: CardEgg, above: number): number {
  const span = W - 2 * PAD
  const y = above + 30
  const barY = y + 10
  const [label, value, filled] =
    egg.kind === 'next'
      ? ['Next egg', `${withCommas(egg.xp)} / ${withCommas(EGG_XP)} xp`, egg.xp / EGG_XP]
      : ['Egg', `${egg.turns} / ${HATCH_TURNS} turns`, egg.turns / HATCH_TURNS]
  marks.push(
    `<text x="${PAD}" y="${y}" font-size="12" fill="${INK}">${label}</text>`,
    `<text x="${W - PAD}" y="${y}" text-anchor="end" font-size="12" fill="${INK}">${value}</text>`,
    `<rect x="${PAD}" y="${barY}" width="${span}" height="6" rx="3" fill="${color}" fill-opacity="0.15"/>`,
    `<rect x="${PAD}" y="${barY}" width="${(span * Math.min(1, Math.max(0, filled))).toFixed(1)}" height="6" rx="3" fill="${color}"/>`,
  )
  if (egg.kind !== 'carrying' || !egg.parents) return barY
  const brooders = `brooded by ${egg.parents[0]} and ${egg.parents[1]}`
  marks.push(`<text x="${PAD}" y="${barY + 24}" font-size="11" fill="${INK}" fill-opacity="0.8">${esc(brooders)}</text>`)
  return barY + 18
}

// The card's frame around `marks`: a rounded border in the rarity color, `h` px tall.
```

In `buddy/hooks/card.ts`, replace:
```ts
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    (progress ? `${growthAlt(progress)} ` : '') +
    `Hatched ${longDate(soul.hatchedAt)}.` +
    (progress?.retiredAt ? ` Retired ${longDate(progress.retiredAt)}.` : '') +
    ` Rerolls ${rerolls}.` +
```
with:
```ts
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    (progress ? `${growthAlt(progress)} ` : '') +
    (progress?.egg ? `${eggAlt(progress.egg)} ` : '') +
    `Hatched ${longDate(soul.hatchedAt)}.` +
    (progress?.parents ? ` Bred from ${progress.parents[0].name} and ${progress.parents[1].name}.` : '') +
    (progress?.retiredAt ? ` Retired ${longDate(progress.retiredAt)}.` : '') +
    ` Rerolls ${rerolls}.` +
```

In `buddy/hooks/card.ts`, replace:
```ts
  const earned = `${p.earned.length} of ${ACHIEVEMENTS.length} achievements${p.earned.length > 0 ? `: ${p.earned.join(', ')}` : ''}`
  return `Level ${p.level}, ${p.stage}, ${xp}. ${earned}.`
}

export function statAlt(bones: Dressed): string {
```
with:
```ts
  const earned = `${p.earned.length} of ${ACHIEVEMENTS.length} achievements${p.earned.length > 0 ? `: ${p.earned.join(', ')}` : ''}`
  return `Level ${p.level}, ${p.stage}, ${xp}. ${earned}.`
}

// "Next egg at 3,200 of 8,100 XP." or "An egg is 40 of 150 turns along, brooded by Pip and Mochi."
function eggAlt(egg: CardEgg): string {
  if (egg.kind === 'next') return `Next egg at ${withCommas(egg.xp)} of ${withCommas(EGG_XP)} XP.`
  const by = egg.parents ? `, brooded by ${egg.parents[0]} and ${egg.parents[1]}` : ''
  return `An egg is ${egg.turns} of ${HATCH_TURNS} turns along${by}.`
}

export function statAlt(bones: Dressed): string {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
} from './journal'
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, dexLines, dexRows, dexText, emptyJournal, isCompact,
  journalHeader, journalLines, journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
import { addCounts, countEvent, mergePending, toolGroup, zeroCounts } from './ledger'
```
with:
```tsx
} from './journal'
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, dexLines, dexRows, dexText, emptyJournal, hatchLine,
  isCompact, journalHeader, journalLines, journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
import { addCounts, countEvent, mergePending, toolGroup, zeroCounts } from './ledger'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        ...cardLines(shown.soul, dressed(shown, saved), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length),
      ].join('\n')
    }
```
with:
```tsx
        ...cardLines(shown.soul, dressed(shown, saved), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length, progress.egg),
      ].join('\n')
    }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        </Box>
      )
      const retired = progress.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
      const footer = (
        <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}${retired}`}</Text>
      )
      const cells = Math.max(8, Math.min(30, e.props.bodyColumns - 18))
      return (
```
with:
```tsx
        </Box>
      )
      const footer = <Text dimColor>{hatchLine(buddy.soul, saved.rerolls, progress)}</Text>
      const cells = Math.max(8, Math.min(30, e.props.bodyColumns - 18))
      return (
```

In `buddy/hooks/register.tsx`, replace:
```tsx
          {footer}
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
          <Text dimColor>{achievementsText(progress.earned.length)}</Text>
          {progress.earned.length > 0 ? [<Text>{progress.earned.join(' · ')}</Text>] : []}
        </Box>
```
with:
```tsx
          {footer}
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
          <Text dimColor>{achievementsText(progress.earned.length, progress.egg)}</Text>
          {progress.earned.length > 0 ? [<Text>{progress.earned.join(' · ')}</Text>] : []}
        </Box>
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4
```
Expected: 450 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy
git commit -m "feat: the card shows parents and the egg; the dex lists a hatchling not yet met

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Release 0.7.0

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-10-09-buddy-breeding-design.md` (status line)

**Interfaces:**
- Consumes: the finished Breeding build.
- Produces: a type-checked mod at version 0.7.0, a README that says what it saves and does, and an accurate spec status.

- [ ] **Step 1: Type-check**

The repo copy has no engine-laid types, so check it against the installed copy's types. The first run fetches TypeScript 5.6 from npm.
```bash
MOD="$(cygpath -m "$(pwd)/buddy")"
TYPES="$(cygpath -m "$(ls -d ~/.claude/plugins/cache/buddy-mods/buddy/*/.claude-plugin/types/claude-code/index.d.ts | sort -V | tail -1)")"
TMP="$(mktemp -d)"
printf '{ "extends": "%s/tsconfig.json", "include": ["%s", "%s/hooks", "%s/types"] }\n' "$MOD" "$TYPES" "$MOD" "$MOD" > "$TMP/tsconfig.json"
npx -y -p typescript@5.6 tsc -p "$(cygpath -m "$TMP/tsconfig.json")"
```
Expected: no output (exit 0). Otherwise, fix every error, re-run the tests, and commit the fixes as `fix: type errors`.

- [ ] **Step 2: Validate**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin validate ./buddy 2>&1 | tail -3
```
Expected: `✔ Validation passed`, with `buddy.eggHatching` among the state reads and writes and `$.model.complete (via ask, askSoul)` among the calls.

- [ ] **Step 3: Bump the version, the README and the spec's status**

In `buddy/.claude-plugin/plugin.json`, replace:
```json
{
  "name": "buddy",
  "version": "0.6.0",
  "description": "A seeded ASCII companion above the prompt, recreating the April Fools 2026 /buddy.",
  "author": { "name": "Brandon Froncek" },
```
with:
```json
{
  "name": "buddy",
  "version": "0.7.0",
  "description": "A seeded ASCII companion above the prompt, recreating the April Fools 2026 /buddy.",
  "author": { "name": "Brandon Froncek" },
```

In `README.md`, replace:
```markdown
| `/buddy dex` | Every buddy you've had, with its level and when it was with you |
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
| `/buddy rename <name>` | A new name: one word, letters only, at most 12 characters, and not a word prompts often start with, like `Summary` |
| `/buddy hat [hat]` | The hats it can wear, or put one on: the one it rolled, any you've earned, or `none` |
| `/buddy mute` / `unmute` | Stop or resume its comments (it still answers when you talk to it) |
| `/buddy off` | Hide it |
| `/buddy reroll`, then `/buddy reroll confirm` | Retire it and hatch a new one; the old one is kept |
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |

It has moods. A run of failed tools makes it anxious, long clean turns make it smug, and days away make it sulk until you pet it, talk to it, or give it some time. It flinches when a tool fails, celebrates a long clean turn, and dozes off when left alone, sooner after midnight. On US federal holidays, Easter, April Fools' Day, Halloween week and its own hatch day, it dresses for the occasion. Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, SNARK sharpens its canned lines, and WISDOM makes it bring up old memories.
```
with:
```markdown
| `/buddy dex` | Every buddy you've had, with its level and when it was with you |
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
| `/buddy breed <who>` | Once 5 buddies are in the dex, the buddy here and an adult from the dex brood the egg you're carrying, and what hatches takes after both |
| `/buddy rename <name>` | A new name: one word, letters only, at most 12 characters, and not a word prompts often start with, like `Summary` |
| `/buddy hat [hat]` | The hats it can wear, or put one on: the one it rolled, any you've earned, or `none` |
| `/buddy mute` / `unmute` | Stop or resume its comments (it still answers when you talk to it) |
| `/buddy off` | Hide it |
| `/buddy reroll`, then `/buddy reroll confirm` | Once only, before your first buddy reaches level 2: swap it for a new one |
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |

It has moods. A run of failed tools makes it anxious, long clean turns make it smug, and days away make it sulk until you pet it, talk to it, or give it some time. It flinches when a tool fails, celebrates a long clean turn, and dozes off when left alone, sooner after midnight. On US federal holidays, Easter, April Fools' Day, Halloween week and its own hatch day, it dresses for the occasion. Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, SNARK sharpens its canned lines, and WISDOM makes it bring up old memories.
```

In `README.md`, replace:
```markdown
It grows up as you work together. Turns, tool calls, rough turns it sat through, pets and talks earn it XP, and its level shows on its name line and its card. It hatches small, grows into an adult at level 10 and an elder at level 30, and as it levels up, its weakest stats rise toward a floor that grows with its level, so a buddy that never spoke up when a tool failed may start to. Seventeen achievements mark what you've done across every buddy you've had, like 500 shell commands, a 30-minute turn or a 30-day streak, and six of them unlock a hat no roll gives, which `/buddy hat` puts on it. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.

It notices how you're doing. When one tool fails three times across two turns, it offers to be your rubber duck, and for 15 minutes after, talking to it gets questions that help you say what you expected and what happened, not guesses at a fix. After 90 minutes of turns with no break longer than 10 minutes, it yawns and suggests one.

## What it does with your session
```
with:
```markdown
It grows up as you work together. Turns, tool calls, rough turns it sat through, pets and talks earn it XP, and its level shows on its name line and its card. It hatches small, grows into an adult at level 10 and an elder at level 30, and as it levels up, its weakest stats rise toward a floor that grows with its level, so a buddy that never spoke up when a tool failed may start to. Seventeen achievements mark what you've done across every buddy you've had, like 500 shell commands, a 30-minute turn or a 30-day streak, and six of them unlock a hat no roll gives, which `/buddy hat` puts on it. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.

New buddies come from eggs. Your first buddy is yours for a while: `/buddy reroll` works once, right after it hatches, and never again. After that, every 8,100 XP your buddies earn together brings an egg, so the first comes about a week in, as your first buddy grows into an adult. The egg rides beside your buddy, wobbling more as it gets close, and hatches after 150 turns into a hatchling that joins the dex; your buddy stays, and `/buddy swap` brings the new one over. Once 5 buddies are in the dex, `/buddy breed <who>` lets you choose who broods the next egg: the buddy here and an adult from the dex. The hatchling takes after both: its species and eyes come from one or the other, three of its stats are copied from them, and its rarity is never below the lower parent's. Breeding spends the egg you earned; it doesn't bring buddies any faster.

It notices how you're doing. When one tool fails three times across two turns, it offers to be your rubber duck, and for 15 minutes after, talking to it gets questions that help you say what you expected and what happened, not guesses at a fix. After 90 minutes of turns with no break longer than 10 minutes, it yawns and suggests one.

## What it does with your session
```

In `README.md`, replace:
```markdown
A mod runs inside Claude Code with your permissions, so here is exactly what this one touches. To see its hooks and calls for yourself, run `claude plugin validate ./buddy`.

- **Model calls.** It calls Haiku on your account for five things:
  - once when it hatches
  - when you pet it, feed it, play with it, rename it, change its hat or talk to it
  - once when a swap brings a buddy back, to say hello
```
with:
```markdown
A mod runs inside Claude Code with your permissions, so here is exactly what this one touches. To see its hooks and calls for yourself, run `claude plugin validate ./buddy`.

- **Model calls.** It calls Haiku on your account for five things:
  - once when it hatches, or when an egg does
  - when you pet it, feed it, play with it, rename it, change its hat or talk to it
  - once when a swap brings a buddy back, to say hello
```

In `README.md`, replace:
```markdown
  - to offer to talk it through when a tool keeps failing, at most twice an hour

  Moods, reactions, holidays, the journal, levels, achievements, game results, break nudges and the line it says when a tool fails need no model call.
- **What a turn comment sees.** Only the turn's outcome, how long it took, which tools ran or failed, the buddy's mood, whether today is a holiday or its hatch day, and now and then one of its journal moments. It never sees your prompt, Claude's answer, file contents or command arguments. The rubber-duck offer sees the same mood and day, plus the name of the tool that keeps failing and how often it failed, and nothing else from the turn.
- **Prompts addressed to it.** A prompt that starts with the buddy's name and a comma or colon (`Pip, hi`) is dropped before it reaches Claude, and the buddy answers it. Prompts that carry an attachment always go to Claude.
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, the hat you chose for it, lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks, its mood (two small numbers and when they last moved), its three other bests (the longest run of failed calls, the most calls in one turn and the longest rough stretch a clean turn ended), and its journal (up to 20 moments, each a kind, a number and a time, plus the tool group of a run of failed calls). Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited, and the achievements you've earned, each with when you earned it. Its XP, level and stage aren't saved: they're worked out from its counts. Never prompt text, answers, file contents or command arguments.
- **Upgrading.** The record is now schema 2, and the first save after the update converts an older one. A session still open on 0.1.x doesn't know schema 2 and answers `Saved buddy uses schema 2; this mod knows 1.` until you reload it with `/reload-plugins`.

## Develop
```
with:
```markdown
  - to offer to talk it through when a tool keeps failing, at most twice an hour

  Moods, reactions, holidays, the journal, levels, achievements, eggs, breeding, game results, break nudges and the line it says when a tool fails need no model call. An egg's hatch call hears its parents' names and personalities, so the hatchling can take after them.
- **What a turn comment sees.** Only the turn's outcome, how long it took, which tools ran or failed, the buddy's mood, whether today is a holiday or its hatch day, and now and then one of its journal moments. It never sees your prompt, Claude's answer, file contents or command arguments. The rubber-duck offer sees the same mood and day, plus the name of the tool that keeps failing and how often it failed, and nothing else from the turn.
- **Prompts addressed to it.** A prompt that starts with the buddy's name and a comma or colon (`Pip, hi`) is dropped before it reaches Claude, and the buddy answers it. Prompts that carry an attachment always go to Claude.
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, a bred buddy's parents (their seeds), the hat you chose for it, lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks, its mood (two small numbers and when they last moved), its three other bests (the longest run of failed calls, the most calls in one turn and the longest rough stretch a clean turn ended), and its journal (up to 20 moments, each a kind, a number and a time, plus the tool group of a run of failed calls). Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited, and the achievements you've earned, each with when you earned it, and how many eggs you've had. The egg you're carrying: its seed, when it started, the turn count it started from, and who is brooding it. Its XP, level and stage aren't saved: they're worked out from its counts, and a bred buddy's species, stats and the rest are worked out from its seed and its parents'. Never prompt text, answers, file contents or command arguments.
- **Upgrading.** The record is now schema 2, and the first save after the update converts an older one. A session still open on 0.1.x doesn't know schema 2 and answers `Saved buddy uses schema 2; this mod knows 1.` until you reload it with `/reload-plugins`. Likewise, a session still open on 0.6 allows free rerolls and draws a bred buddy as a plain roll of its seed until you reload it.

## Develop
```

In `README.md`, replace:
```markdown
## Design

[`docs/specs/2026-10-07-buddy-mod-design.md`](docs/specs/2026-10-07-buddy-mod-design.md) is the design spec, and [`docs/specs/2026-10-07-buddy-mod-plan.md`](docs/specs/2026-10-07-buddy-mod-plan.md) is the test-driven plan the mod was built from. The saved record, counts and streak come from [`docs/specs/2026-10-07-buddy-foundation-design.md`](docs/specs/2026-10-07-buddy-foundation-design.md) and its plan, [`docs/specs/2026-10-07-buddy-foundation-plan.md`](docs/specs/2026-10-07-buddy-foundation-plan.md). Moods, stats that change behavior, reactions and the calendar come from [`docs/specs/2026-10-07-buddy-alive-design.md`](docs/specs/2026-10-07-buddy-alive-design.md) and its plan, [`docs/specs/2026-10-07-buddy-alive-plan.md`](docs/specs/2026-10-07-buddy-alive-plan.md). The journal comes from [`docs/specs/2026-10-08-buddy-memory-design.md`](docs/specs/2026-10-08-buddy-memory-design.md) and its plan, [`docs/specs/2026-10-08-buddy-memory-plan.md`](docs/specs/2026-10-08-buddy-memory-plan.md). Levels, achievements, evolution and the dex come from [`docs/specs/2026-10-08-buddy-progression-design.md`](docs/specs/2026-10-08-buddy-progression-design.md) and its plan, [`docs/specs/2026-10-08-buddy-progression-plan.md`](docs/specs/2026-10-08-buddy-progression-plan.md), and [`docs/art/stages.txt`](docs/art/stages.txt) shows every species at every stage. Feeding, games, renaming, hats, the rubber duck and break nudges come from [`docs/specs/2026-10-08-buddy-interaction-design.md`](docs/specs/2026-10-08-buddy-interaction-design.md) and its plan, [`docs/specs/2026-10-08-buddy-interaction-plan.md`](docs/specs/2026-10-08-buddy-interaction-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```
with:
```markdown
## Design

[`docs/specs/2026-10-07-buddy-mod-design.md`](docs/specs/2026-10-07-buddy-mod-design.md) is the design spec, and [`docs/specs/2026-10-07-buddy-mod-plan.md`](docs/specs/2026-10-07-buddy-mod-plan.md) is the test-driven plan the mod was built from. The saved record, counts and streak come from [`docs/specs/2026-10-07-buddy-foundation-design.md`](docs/specs/2026-10-07-buddy-foundation-design.md) and its plan, [`docs/specs/2026-10-07-buddy-foundation-plan.md`](docs/specs/2026-10-07-buddy-foundation-plan.md). Moods, stats that change behavior, reactions and the calendar come from [`docs/specs/2026-10-07-buddy-alive-design.md`](docs/specs/2026-10-07-buddy-alive-design.md) and its plan, [`docs/specs/2026-10-07-buddy-alive-plan.md`](docs/specs/2026-10-07-buddy-alive-plan.md). The journal comes from [`docs/specs/2026-10-08-buddy-memory-design.md`](docs/specs/2026-10-08-buddy-memory-design.md) and its plan, [`docs/specs/2026-10-08-buddy-memory-plan.md`](docs/specs/2026-10-08-buddy-memory-plan.md). Levels, achievements, evolution and the dex come from [`docs/specs/2026-10-08-buddy-progression-design.md`](docs/specs/2026-10-08-buddy-progression-design.md) and its plan, [`docs/specs/2026-10-08-buddy-progression-plan.md`](docs/specs/2026-10-08-buddy-progression-plan.md), and [`docs/art/stages.txt`](docs/art/stages.txt) shows every species at every stage. Feeding, games, renaming, hats, the rubber duck and break nudges come from [`docs/specs/2026-10-08-buddy-interaction-design.md`](docs/specs/2026-10-08-buddy-interaction-design.md) and its plan, [`docs/specs/2026-10-08-buddy-interaction-plan.md`](docs/specs/2026-10-08-buddy-interaction-plan.md). Earned eggs, carrying and hatching, the one reroll and breeding come from [`docs/specs/2026-10-09-buddy-breeding-design.md`](docs/specs/2026-10-09-buddy-breeding-design.md) and its plan, [`docs/specs/2026-10-09-buddy-breeding-plan.md`](docs/specs/2026-10-09-buddy-breeding-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```

In `docs/specs/2026-10-09-buddy-breeding-design.md`, replace:
```markdown
# `buddy` Breeding — Design Spec

**Status:** design approved 2026-10-09; not built.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-09
```
with:
```markdown
# `buddy` Breeding — Design Spec

**Status:** built 2026-10-09; live check pending. Plan: [`2026-10-09-buddy-breeding-plan.md`](2026-10-09-buddy-breeding-plan.md); its "Deliberate deviations" section lists the small departures from this spec.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-09
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -4 && "$CC" plugin validate ./buddy 2>&1 | tail -1
```
Expected: 450 pass, 0 fail, then `✔ Validation passed`.

- [ ] **Step 5: Commit**

```bash
git add buddy README.md docs/specs/2026-10-09-buddy-breeding-design.md
git commit -m "chore: buddy 0.7.0, with Breeding recorded as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: The live check**

Hot-reload the mod in a session with `/reload-plugins`, then look in the terminal and the Desktop Code tab at:
- `/buddy debug`, to its end: the egg a quarter along, three quarters, 95% (cracked), then hatching (cracked and shaking), in a gutter that pushes no bubble off the band
- `/buddy card`, with no egg (`Next egg`) and, after a store edit that puts an egg on the record, with one (`Egg`)
- a hatch: edit the store so an egg is one turn from due (`fromTurns` 149 under your summed turns), finish a turn, and see the hatch news, the dex's new `hatched` row and your buddy still here

Then tick #22, #23 and #26 in the roadmap issue, #18.
