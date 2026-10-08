# `buddy` Memory — Design Spec

**Status:** designed 2026-10-08; not built.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-08
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec), [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) (Foundation) and [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md) (Alive). Section numbers below that start with "base", "Foundation" or "Alive" point there.
**Issue:** #10. Roadmap: #18.

## Purpose

Sub-project C of five. Each buddy keeps a short journal of notable moments: records, milestones, comebacks and returns. Quips and talk replies can call back to them the way a friend would ("remember when Claude failed 18 shell commands in a row?"), and `/buddy journal` lists them.

Rules kept from the roadmap:
- New saved data goes in optional fields, so the schema stays at 2.
- The buddy never sees prompt text, answers, file contents or command arguments, except a prompt addressed to it by name. A moment holds only a kind, a number, a tool group and a time. So a run of failed `git` calls is remembered as shell commands: the command itself is an argument.
- Reactions stay within the base spec's cost table (base section 10). This sub-project adds no model calls.

**Not here:** retired buddies' journals in the dex (D, #14); any bubble announcing a new moment.

## 1. Saved data and session state

**Two new optional fields on each `buddies` entry** (Foundation section 1):
```ts
type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  mood?: Mood
  journal?: Moment[]          // oldest first, at most 20; missing reads as []
  bests?: Bests               // missing reads as { failRun: 0, calls: 0 }
}

type Moment = {
  at: string                  // ISO time of the flush or visit that wrote it
  kind: MomentKind
  n: number                   // what the kind counts (section 2)
  group?: ToolGroup           // failRun only, when the whole run was one group
}

type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away'

type Bests = {
  failRun: number             // the longest run of consecutive failed calls in one turn
  calls: number               // the most tool calls in one turn
}
```
The longest turn is already `counts.longestTurnMs`, so `bests` doesn't repeat it. `bests` always tracks the largest value seen, floor or not.

The schema stays at 2. A record written before this build has neither field on any entry. Its `bests` read as zeros, so the first bad run after the upgrade can be logged as a record even if an older one was worse. As Foundation section 1 requires, a commit changes only the fields it names. So a `journal` written by this build survives a write from a 0.3.x session, which spreads each entry.

A moment is stored as data, not text, so its wording can change without touching saves. One is about 75 bytes, so a full journal is about 1.5 KB.

A reroll's new buddy starts with no journal and no bests. A retired buddy keeps both, for the dex in D.

**`$.state`, plugin `buddy`**, one new key (survives a hot reload, not a session):

| Key | Type | Meaning |
|-|-|-|
| `pendingTurns` | `Record<string, TurnFacts[]>` | Finished main turns not yet saved, by buddy seed |

```ts
type TurnFacts = {
  reason: 'answer' | 'aborted' | 'refusal' | 'error'
  durationMs: number
  calls: number               // tool calls that ran in the turn
  failRun: number             // the turn's longest run of consecutive failed calls
  failRunGroup: ToolGroup | null  // that run's group, or null when it spanned groups
  afterRough: number          // rough turns in a row just before this one (section 3)
}
```

Module variables (lost on reload, which is acceptable, as `tally` is):
- the current run of failed calls and its group or groups
- the turn's longest run and its call count
- the count of rough turns in a row

## 2. Moments

| Kind | Logged when | `n` | Text |
|-|-|-|-|
| `failRun` | a turn's `failRun` beats `bests.failRun` and is at least 5 | the run | `Claude failed 18 shell commands in a row` |
| `longTurn` | a turn's `durationMs` beats `counts.longestTurnMs` and is at least 10 min | whole minutes | `a 34-minute turn, the longest yet` |
| `busyTurn` | a turn's `calls` beats `bests.calls` and is at least 50 | the calls | `73 tool calls in one turn` |
| `turns` | lifetime `turns` cross 100, 1,000 or 10,000 | the mark | `1,000 turns together` |
| `calls` | lifetime tool calls (`totalCalls`) cross 1,000, 10,000 or 100,000 | the mark | `10,000 tool calls together` |
| `comeback` | a clean turn after 3 or more rough turns in a row (section 3) | the rough turns | `a clean turn after 4 rough ones` |
| `away` | a visit after 3 or more missed days: `daysBetween(lastDay, today) >= 4` | `daysBetween` | `back after 9 days away` |

**The group noun** in `failRun` text:

| Group | Noun |
|-|-|
| shell | shell commands |
| edit | edits |
| read | file reads |
| web | web fetches |
| agent | agent calls |
| mcp | MCP calls |
| other, or a run that spanned groups | tool calls |

**Rules:**
- Numbers take thousands commas.
- A turn can log more than one moment. Section 3 gives the order they are checked and appended in.
- "Crossing" a mark means `before < mark <= after`. A flush that crosses two marks logs both.
- The text never carries a date. The age is shown beside it (section 4).
- **The cap.** New moments are appended, then the journal is trimmed to its newest 20.
- **No sulk overlap.** `away` lands on the same buddy as the sulk (Alive section 2), but its floor is one missed day higher, so an ordinary weekend leaves no moment.

## 3. From a turn to a saved moment

**In the session.** Main-conversation events only (`agentId` unset).
- **Runs.** A `tool.call` that ran with `isError` extends the current run of failed calls; one that ran without it ends the run. A denied call never ran, so it neither extends nor ends one. The turn keeps its longest run (the first, on a tie) and whether that run stayed in one group.
- **Calls.** The turn counts the calls that ran.
- **Rough turns.** A turn is rough when its reason is `error` or `aborted`, or it had a failed call. It is clean when its reason is `answer` and it had no failed call.
- **At `turn.complete`:** one `TurnFacts` is queued on `pendingTurns[seed of the active buddy]`, keeping the last 20 per seed. `afterRough` is the count of rough turns in a row before this one. After queuing, a rough turn adds 1 to that count, and any other turn resets it to 0. The run and the turn's tallies reset.
- **Gating.** Nothing is queued with no record, while hatching, when mode is `off`, or when the record is damaged or foreign. Mode `muted` queues as normal (Foundation section 3).

**The flush change** grows a field:
```ts
| {
    kind: 'flush'
    pending: Readonly<Record<string, Counts>>
    mood?: Readonly<Record<string, readonly MoodEvent[]>>
    turns?: Readonly<Record<string, readonly TurnFacts[]>>
  }
```
A flush takes `pendingTurns` with `pending` and `pendingMood` and clears all three, each in one update. If its commit fails before the result reaches `$.state`, the facts go back in front of any queued since, keeping the last 20, as mood events do (Alive section 2).

**In `applyChange`** (pure, against the freshly read store):
1. **The visit** (`arrive`) runs first, as today. When the day is new, `lastDay` is not null, and `daysBetween(lastDay, today) >= 4`, the active buddy gets an `away` moment next to its sulk. `arrive` also runs in `visit` and before a reroll retires anyone, so the moment lands on the buddy that was left alone, never the new one.
2. **Turn facts.** For each entry with facts, `noticeTurns` walks them in order. Each fact is checked against the running bests: `failRun` against `bests.failRun`, `longTurn` against `counts.longestTurnMs`, `busyTurn` against `bests.calls`, then `comeback`. The running bests rise after each fact, so two queued turns can't both claim one record.
3. **Milestones** compare the entry's counts before and after `addCounts` with this flush's pending counts.
4. **Write.** The entry gets its new `bests`, and its new moments are appended in that order (away, turn moments, milestones), then trimmed to 20.

Facts for a seed with no entry are dropped, as counts are. Each moment's `at` is the flush's `now`.

Because detection runs against the fresh store, two open sessions can't both log the same milestone: the second flush already sees the first's counts.

## 4. Callbacks

**Ages** (`ageText(at, now)`) count calendar days between the local dates (`daysBetween`), so daylight saving can't move them:

| Days | Shown as |
|-|-|
| 0 | today |
| 1 | yesterday |
| 2–6 | N days ago |
| 7–13 | last week |
| 14–59 | N weeks ago (`floor(days / 7)`) |
| 60–729 | N months ago (`floor(days / 30)`) |
| 730 or more | N years ago (`floor(days / 365)`) |

**Quips.** `shouldQuip` is unchanged, so a memory never makes the buddy speak more often. It only rides along on a quip that was already going to happen. Once a quip is on, `recall(journal, facts, now, stats, roll, pick)` returns at most one memory:
1. **Eligible** memories are at least an hour old, so a record set by this very turn isn't "remembered" seconds later.
2. **Relevant first.** Take the first row below that this turn matches and that has an eligible memory of its kind. Within the kind, the largest `n` wins; on a tie, the newest.

   | This turn | Kind |
   |-|-|
   | `failRun > 0` | `failRun` |
   | `durationMs > LONG_TURN_MS` (2 min) | `longTurn` |
   | `calls >= 25` | `busyTurn` |
   | clean, with `afterRough >= 1` | `comeback` |

3. **Otherwise WISDOM.** If `roll < recallChance(stats)`, a random eligible memory is chosen by `pick`. Else none.

| Stat | Changes | Curve | At 1 / 50 / 100 |
|-|-|-|-|
| WISDOM | the chance a quip with no relevant memory brings one up | `0.05 + 0.25 * WISDOM / 100` | 0.0525 / 0.175 / 0.30 |

WISDOM is the one stat Alive left without a behavior. `roll` and `pick` come from `Math.random()` in `register.tsx`, as the Alive rolls do.

The memory adds one line to `reactionPrompt`, before `React in one line.`:
```
A memory (2 weeks ago): Claude failed 18 shell commands in a row. Bring it up if it fits, as "remember when...", without a date.
```

**Talk.** `talkPrompt(message, memories)` carries the 3 newest memories, of any age, before `Reply in one line.`. With an empty journal it is unchanged.
```
Your memories, newest first:
- yesterday: a clean turn after 4 rough ones
- 2 weeks ago: Claude failed 18 shell commands in a row
Mention one only if it fits what they said.
```

Pet and hello prompts are unchanged. Quips and talks read only the saved journal: moments waiting on a flush aren't remembered yet.

## 5. `/buddy journal`

**The command.** `journal` joins the simple subcommands in `parseSub`, and `USAGE` and the argument hint become `[pet | card | journal | mute | unmute | off | reroll [confirm]]`.

Like `card`, it works in any mode and shows the active buddy only. It opens a pane, so nothing reaches the transcript (base section 10):
```ts
$.ui.open({ id: 'journal', title: 'Journal', closeOnEscape: true })
```

**What it shows**, newest first. `journalRows(journal, now)` in `layout.ts` gives `{ age, text }` pairs, with ages padded to the widest:
```
Pip's journal
yesterday      a clean turn after 4 rough ones
last week      1,000 turns together
2 weeks ago    Claude failed 18 shell commands in a row
4 months ago   back after 9 days away
```
- An empty journal shows `Nothing in Pip's journal yet.` under the header.
- Only saved moments show: a record set this turn appears once the turn's flush lands.
- For any number under 100,000, no text is longer than 45 characters, and no age label is longer than 13, so rows don't wrap.

**Per surface**, split as the card is (Foundation section 4):
- **Terminal pane:** the header in bold, then one row per moment with the age dimmed.
- **SVG** (desktop, VS Code, mobile): `journalSvg(name, bones, rows)` in `card.ts`, in the card's frame.
  - 420 px wide, with the rarity color for the border and the header, and the card's ink color for rows.
  - The age at the left pad, the text 110 px in. Rows are 22 px apart, so a full journal is about 520 px tall.
  - `journalAlt` reads the list as sentences: `Pip's journal. Yesterday: a clean turn after 4 rough ones. Last week: …`
- **Text fallback**, where no pane is placed: `journalLines(name, journal, now, 10)` gives the header and the newest 10, which is 11 lines, inside the 12-line cap the card's fallback keeps.

## 6. Files

| File | Change |
|-|-|
| `journal.ts` (new, pure) | Kinds, floors and marks; `noticeTurns`, `milestones`, `awayMoment`, `addMoments` (the cap), `momentText`, `ageText`, `recallChance`, `recall`, `memoryLine`, `talkMemories`, `queueTurns`, `mergeTurns` |
| `ledger.ts` | `withCommas`, moved here from `layout.ts` and exported, so `journal.ts` and `layout.ts` share it |
| `record.ts` | `flush` applies turn facts and milestones; `arrive` adds `away`; `parseSub` and `USAGE` gain `journal` |
| `voice.ts` | `reactionPrompt(summary, memory?)`; `talkPrompt(message, memories)` |
| `layout.ts` | `journalRows`, `journalLines` |
| `card.ts` | `journalSvg`, `journalAlt` |
| `register.tsx` | Run, call and rough-turn tracking in the existing `tool.call` and `turn.complete` hooks; `pendingTurns` with take, clear and put-back in `flush`; the `recall` rolls in `react`; memories in the talk prompt; the `journal` subcommand, argument hint and its pane render hook |
| `types/index.d.ts` | `Moment`, `MomentKind`, `Bests`, `TurnFacts`; `journal?` and `bests?` on `Buddy`; `pendingTurns` in `PluginState` |
| `README.md` | `/buddy journal` in "Use"; journal and bests in "What it saves"; a short paragraph on memories; this spec in "Design" |
| `plugin.json` | version 0.4.0 |

`register.tsx` still holds no game logic.

## 7. Failure handling and cost

As base section 9, Foundation section 6 and Alive section 9:
- `tool.call` returns `next`'s result unchanged, even when run tracking throws.
- A flush that fails before it adopts puts the turn facts back into `pendingTurns`.
- A throw in `recall` or `memoryLine` sends the quip without a memory. A throw in `talkMemories` sends the talk without memories.
- A throw while drawing the journal pane falls back to `next(e)`.

**Cost:**
- No new model calls, and the quip rate is unchanged (Alive section 3).
- A quip that carries a memory grows by about 30 tokens; a talk, by up to about 60.
- The pane never reaches the transcript; the text fallback is at most 11 lines.

## 8. Testing

All with `claude plugin test` (base section 11).

**Pure:**
- `journal.test.ts`:
  - each kind at its floor and one under: a run of 5 and 4, 10 min and 9:59, 50 calls and 49, 3 rough turns and 2, 3 missed days and 2
  - a record must beat the stored best, `longTurn` against an existing `counts.longestTurnMs`; missing `bests` read as zeros
  - two queued facts with the same run log one `failRun`
  - `bests` rising on a value under the floor
  - the group noun for a one-group run and a mixed one
  - milestones at 99→100, 100→101 (none), 999→1,000 calls, and one jump across two marks
  - `addMoments` keeping the newest 20
  - `ageText` at 0, 1, 2, 6, 7, 13, 14, 59, 60, 729 and 730 days, and across a daylight-saving change
  - `momentText` for each kind, with commas
  - `recall`:
    - a relevant memory beating the roll; the largest `n` within the kind, the newest on a tie
    - memories under an hour old skipped
    - the WISDOM gate; an empty journal
    - `recallChance` at 1, 50 and 100
- `record.test.ts`:
  - `flush` applies facts to the right entry and drops an unknown seed
  - `visit` adds `away` with the sulk, and a reroll after a gap puts it on the retiring buddy
  - a missing `journal` reads as empty; unknown fields are kept
  - `parseSub('journal')`, and `journal x` as usage
- `voice.test.ts`: `reactionPrompt` with and without a memory; `talkPrompt` with 0, 1 and 3 memories.
- `layout.test.ts`: `journalRows` newest first with padded ages; the empty line; `journalLines` at most 12 lines.
- `card.test.ts`: `journalSvg` height growing with rows, text escaped, and `journalAlt`'s sentences.

**Mod-level** (`buddy.test.tsx`):
- **Records:**
  - 5 failed Bash calls in a row save a `failRun` moment with group `shell` and `bests.failRun` 5; the same turn again logs nothing
  - fail ×3, a success, fail ×3 logs nothing, and a denied call between failures doesn't break the run
  - a subagent's failed calls are ignored
- **Comebacks:** 3 turns with failed calls, then a clean answer, log a comeback.
- **Milestones across sessions:** another session writes counts that reach turn 100 mid-turn, and this session's flush does not log it again.
- **Callbacks:**
  - with an old `failRun` moment stored, a quip after a turn with failed calls carries its line
  - with no relevant memory and a roll above the chance, no line
  - no test sees more `$.model.complete` calls than before this build
  - a talk's prompt carries the 3 newest memories
- **The command:** `/buddy journal` opens the pane and draws it in the terminal and as SVG. Where no pane is placed it returns the text fallback, and it works in mode `off`.
- **Gating:** mode `off` queues no facts; `muted` does.
- **Old records:** a stored record with no `journal` loads, and gains one at its first flush with a moment.
- **A failed write** keeps the moments in this session's copy, and the next flush writes them.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look at the journal pane in the terminal and the Desktop Code tab, empty and with entries.
