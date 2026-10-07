# `buddy` Foundation — Design Spec

**Status:** designed 2026-10-07; not built.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-07
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec). Section numbers below that start with "base" point there.

## Purpose

Sub-project A of five. The later ones are B (Alive: mood, stats that change behavior, reaction animations, calendar), C (Memory: journal), D (Progression: XP and levels, achievements, hat unlocks, evolution, Buddydex) and E (Interaction: rubber-duck nudge, toys, break nudges). Each gets its own spec, plan and build, in that order.

Foundation fixes the saved record's shape so that only one migration is ever needed, and adds the data the later sub-projects read:
- the `schema: 2` record, with the migration from 1
- every buddy kept after a reroll (the data the Buddydex in D will show)
- lifetime counts per buddy
- a visit streak that belongs to the person

**Ownership.** A buddy's own data stays with it in the dex and comes back if it is swapped back in (D): its soul, its counts, and later its XP, level, evolution stage and journal. The person's data carries across rerolls: the streak, and later achievements and unlocked hats.

**Not here:** dex commands (`/buddy dex`, `/buddy swap`), XP, achievements, hats, journal, mood. Foundation adds no model calls.

## 1. The saved record

**`$.store` key `buddy`**, replacing base section 3's record:

```ts
type Saved = {
  schema: 2
  mode: Mode                  // the person's: applies to whichever buddy is active
  rerolls: number             // the person's
  active: string              // seed of the active buddy
  buddies: Buddy[]            // active and retired, in hatch order
  you: You
}

type Buddy = {
  seed: string
  soul: Soul                  // unchanged: { name, personality, hatchedAt }
  retiredAt: string | null    // ISO time; null while active
  counts: Counts
}

type You = {
  lastDay: string | null      // local date YYYY-MM-DD of the last visit
  streak: number
  bestStreak: number
  days: number                // distinct days visited
}

type Counts = {
  turns: number
  failedTurns: number         // turns whose reason is error or aborted
  longestTurnMs: number
  calls: Record<ToolGroup, number>
  failedCalls: number
  pets: number
  talks: number
}

type ToolGroup = 'shell' | 'edit' | 'read' | 'web' | 'agent' | 'mcp' | 'other'
```

The schema 1 record (base section 3) keeps its shape under the name `SavedV1`. `$.state`'s `record` now holds a `Saved`.

**Tool groups**, so the counts stay bounded however many MCP tools are connected:

| Group | Tools |
|-|-|
| shell | Bash, PowerShell |
| edit | Edit, Write, NotebookEdit |
| read | Read, Grep, Glob, LSP |
| web | WebFetch, WebSearch |
| agent | Agent |
| mcp | any name starting `mcp__` |
| other | everything else |

**Reading the store** (`classify` in `record.ts`):

| Stored value | Result |
|-|-|
| missing | not hatched |
| `schema: 1` | migrated in memory (below) |
| `schema: 2` whose `active` is the seed of an entry in `buddies` | read as is |
| `schema: 2` whose `active` matches no entry | damaged |
| any other schema | foreign |

A damaged or foreign record is never written. Every subcommand replies with one line and changes nothing: foreign gives `Saved buddy uses schema N; this mod knows 1 and 2.` and damaged gives `Saved buddy is damaged; this mod won't overwrite it.` Nothing is counted while the record is damaged or foreign.

**Migration from 1 to 2** happens in memory when the store is read and is saved by the first commit:
```ts
{ schema: 2, mode: v1.mode, rerolls: v1.rerolls, active: v1.seed,
  buddies: [{ seed: v1.seed, soul: v1.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 } }
```
Buddies replaced under schema 1 are already gone, so the list starts with the current one.

**Adding fields later.** Sub-projects B to E add fields as optional ones that read as their default when missing. They don't change `schema`. A commit starts from the stored object and changes only the fields it names, at every level (top, `you`, each `buddies` entry). So fields written by a newer build of the mod survive a write from an older build in another session.

**Size.** One buddy is about 0.5 KB, so 50 rerolls come to about 25 KB.

## 2. Saving

`commit($, change)` in `register.tsx` is the only code that writes the store. It replaces `save`.

1. Read the store and classify it. While this session's last write has failed (`unsaved`), its own copy in `$.state` is the base instead, as in the base build: that copy carries on until a write succeeds. With nothing stored and no such copy, only `hatch` and `reroll` build a record; any other change writes nothing.
2. Stop if the record is damaged or foreign.
3. Apply the change with the pure `applyChange(saved, change, now)` from `record.ts`.
4. Write the store.
5. Adopt the result: it goes into `$.state.record`, and the timer follows its mode, as `adopt` does today.

**Changes:**

| Change | Effect |
|-|-|
| `hatch(seed, soul)` | Nothing stored yet: a new `Saved` with this buddy active, mode `on`, `rerolls` 0, then today's visit. A record already stored (another session hatched first): appended as a reroll is, without counting one |
| `reroll(seed, soul)` | The buddy active in the store gets `retiredAt = now`; the new one is appended and made active; `rerolls + 1`; mode `on` |
| `mode(m)` | Sets `mode` |
| `flush(pending)` | Adds each seed's pending counts to the entry with that seed; drops counts for a seed the store has no entry for; then today's visit |
| `visit(today)` | The streak rule in section 3 |

**Pending counts** live in `$.state` under a new key `pending: Record<string, Counts>`, keyed by seed, so a hot reload keeps them. A count goes under the seed of the buddy that is active when the event happens. A flush takes `pending` and clears it. If its commit fails before the result reaches `$.state` (a failed store read or state write), the counts go back into `pending`.

**Flush points:** a main-conversation `turn.complete`, after a pet, and after a talk. An empty `pending` with no new day writes nothing.

**Other sessions.** Each commit starts from a fresh read, so another session's mode change, reroll or counts are kept. Two sessions committing in the same few milliseconds can lose one of the writes. For a toy that's accepted (the counts at stake are one turn's worth).

**A failed store write:**
- The result still goes into `$.state`, with `unsaved` set: the base build's behavior. That copy, counts included, is the base of the next commit, so nothing is counted twice and nothing is lost when a later write succeeds.
- `hatch`, `reroll` and `mode` say so in the command text: `Could not save your buddy; it lives for this session only.`

## 3. Counting and the streak

Nothing is counted when there is no record, while hatching, when mode is `off`, or when the record is damaged or foreign. Mode `muted` counts as normal.

| Event | Count |
|-|-|
| main-conversation `tool.call` that ran (no `deny`) | `calls[group] + 1`; plus `failedCalls + 1` when the result has `isError` |
| main-conversation `turn.complete` | `turns + 1`; `failedTurns + 1` when `reason` is `error` or `aborted`; `longestTurnMs = max(longestTurnMs, durationMs)` |
| `/buddy pet` | `pets + 1` |
| a talk (`Pip, ...` matched) | `talks + 1` |

Adding two `Counts` sums every field except `longestTurnMs`, which takes the larger value.

**Today** is the local calendar date of `$.clock.now()` as `YYYY-MM-DD`. **Yesterday** is found by calendar arithmetic on that date, not by subtracting 24 hours.

**Visit rule** (`visit` in `ledger.ts`, pure), applied at `session.start` and inside every flush:
- `lastDay == today`: nothing changes.
- `lastDay` is yesterday: `streak + 1`.
- anything else, `null` included: `streak = 1`.
- whenever the day is new: `days + 1`, `lastDay = today`, `bestStreak = max(bestStreak, streak)`.

The `session.start` visit is its own commit, and only runs when mode is not `off`.

## 4. What changes on screen

- **Card.** `/buddy card` opens the card pane (base section 4), so the streak goes into each of its three forms. The line is `Streak 12 days (best 30) · 340 turns · 2,104 tool calls`. Thousands take commas, a count of 1 is singular (`1 day`, `1 turn`, `1 tool call`), and turns and tool calls are the active buddy's, unsaved counts included.
  - Terminal pane: the line goes under the `Hatched … Rerolls: …` footer.
  - SVG card (desktop, VS Code, mobile): a second footer row, 20 px lower, with `Streak 12 days (best 30)` on the left and `340 turns · 2,104 tool calls` on the right. The card grows 20 px. The alt text ends with the same line as a sentence.
  - Text fallback (`cardLines`, where no pane is placed): the line goes after `Hatched …`, which brings it to 10 lines.
- **Greeting:** when the `session.start` visit lands on a new day, the streak is 2 or more, and mode is `on`, the bubble shows a canned line for the usual 24 ticks. There's no model call. The pool in `voice.ts`, picked by `streak % 4`:
  - `Day {n} together.`
  - `{n} days in a row. Not that I'm counting.`
  - `Back again. That's {n} days.`
  - `{n}-day streak. Don't make it weird.`
- **Reroll warning:** `This retires <name>, <rarity> <species>. Run /buddy reroll confirm.`
- **Usage, `/buddy`, pet, talk, mute, off:** unchanged, but read and written through `commit`.
- **`/buddy debug` and `debug off`:** unchanged. The tour still writes nothing, and counting goes on underneath it for the real buddy.

## 5. Files

| File | Change |
|-|-|
| `record.ts` | `SavedV1`/`Saved` handling, `classify`, `migrate`, `applyChange`; `parseSub` unchanged |
| `ledger.ts` (new, pure) | `toolGroup(name)`, `zeroCounts()`, `addCounts(a, b)`, `localDay(ms)`, `prevDay(day)`, `visit(you, today)` |
| `layout.ts` | the streak line and its two halves |
| `card.ts` | the SVG card's streak row and alt sentence |
| `voice.ts` | the greeting pool |
| `register.tsx` | `commit`, the `pending` value, counting in the existing `tool.call` / `turn.complete` / pet / talk hooks, the visit at `session.start` |
| `types/index.d.ts` | `Saved`, `SavedV1`, `Buddy`, `You`, `Counts`, `ToolGroup`; `pending` in `PluginState` |

`register.tsx` still holds no game logic. Every rule above is in a pure file.

## 6. Failure handling

As base section 9:
- `commit` turns a failed store write into the note above. A failed store read or state write throws to the hook, whose own `try`/`catch` keeps the event going.
- `tool.call` returns `next`'s result unchanged, even when counting throws.
- A turn, prompt or tool call never waits on a store write that fails.

## 7. Testing

All with the desktop app's bundled `claude plugin test` (base section 11).

**Pure:**
- `ledger.test.ts`:
  - every row of the tool-group table, plus `mcp__a__b` and an unknown name
  - `addCounts` sums all fields and takes the max of `longestTurnMs`
  - `visit` on the same day, after yesterday, after a gap, on the first visit (`null`), and from `2026-12-31` to `2027-01-01`
  - `bestStreak` holds through a reset
- `record.test.ts`:
  - `classify` covers missing, v1, v2, damaged and schema 3
  - `migrate` keeps the seed, soul, mode and reroll count, and gives one buddy with zero counts and an empty `you`
  - `applyChange`:
    - keeps unknown fields at the top level, in `you` and in each `buddies` entry
    - `reroll` retires the stored active buddy and appends the new one
    - `flush` drops counts for an unknown seed
- `layout.test.ts`: the streak line takes commas and singulars, and the text card with it is at most 12 lines.
- `card.test.ts`: given the history, the SVG card carries the streak row and is 20 px taller, and the alt text ends with the streak sentence.

**Mod-level** (`buddy.test.tsx`):
- A turn with a failed Bash call, a failed Read call and a denied call saves `turns 1`, `shell 1`, `read 1` and `failedCalls 2` at `turn.complete`. The denied call isn't counted.
- Another session sets mode `muted` and adds counts in the store mid-turn. The flush keeps both and adds this turn's counts.
- A failed write keeps the turn's counts in this session's copy, and the next flush writes both turns.
- A stored v1 record is upgraded to v2 by the first commit.
- A schema 3 record and a damaged record are unchanged after turns and commands.
- `/buddy reroll confirm` leaves two entries, the first retired.
- The greeting shows at the first `session.start` of a new day with a streak of 2 or more, and not at a second start the same day.
- Mode `off` saves no counts and no visit.
- The card shows the streak line on the terminal pane, in the SVG card's alt text, and in the text fallback.
- The debug tour adds no writes beyond the session's visit.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look at the card and greeting in the terminal and the Desktop Code tab.
