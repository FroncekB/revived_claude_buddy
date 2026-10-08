# `buddy` Progression — Design Spec

**Status:** designed 2026-10-08; not built yet.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-08
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec), [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) (Foundation), [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md) (Alive) and [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md) (Memory). Section numbers below that start with "base", "Foundation", "Alive" or "Memory" point there.
**Issues:** #11 XP and levels, #12 achievements, #13 evolution, #14 Buddydex. Roadmap: #18.

## Purpose

Sub-project D of five. A buddy grows up:
- **XP and levels** worked out from its lifetime counts. Each level raises a floor under its stats, so the Alive behaviors change as it grows.
- **Evolution:** it is drawn as a hatchling, an adult or an elder, by level. Every stage is drawn in full for every species.
- **Achievements** for milestones you reach, six of which unlock hats no roll gives.
- **The Buddydex:** `/buddy dex` shows every buddy you've had, `/buddy swap` brings a retired one back, and `card` and `journal` can show a retired buddy.

Rules kept from the roadmap:
- New saved data goes in optional fields, so the schema stays at 2.
- The buddy never sees prompt text, answers, file contents or command arguments, except a prompt addressed to it by name. Everything here is computed from counts, bests, the streak and the buddy list.
- Reactions stay within the base spec's cost table (base section 10). Announcements are canned, and the only new model call is the hello after a swap, which the person asked for.

**Not here:** wearing an earned hat (`/buddy hat`, E #16); earned rerolls (rerolls are already free); level-ups or achievements in the journal.

## 1. Saved data and session state

**One new optional field on `you`** (Foundation section 1):
```ts
type You = {
  lastDay: string | null
  streak: number
  bestStreak: number
  days: number
  earned?: Record<string, string>   // achievement id → ISO time it was earned; missing reads as {}
}
```

Everything else is computed when it is needed and never saved: XP, level, stat floors and stage from each buddy's `counts`, and the unlocked hats from `earned`. So two sessions can never disagree about a level, and no new merge rules are needed.

**One new moment kind** (Memory section 1): `grew`, with `n` 1 for adult and 2 for elder (section 4). A 0.4 session skips the unknown kind, as `readable` already does.

The schema stays at 2. As Foundation section 1 requires, a commit changes only the fields it names, so `earned` survives a write from a 0.4 session, which spreads `you`.

**`$.state`, plugin `buddy`**, new keys (survive a hot reload, not a session):

| Key | Type | Meaning |
|-|-|-|
| `cardSeed` | `string \| null` | The buddy the card pane shows; null for the active one |
| `journalSeed` | `string \| null` | The buddy the journal pane shows; null for the active one |
| `tourStage` | `Stage` | The stage the debug tour draws (section 5) |

`Bubble` gains `news?: true`, set on an announcement (section 4).

```ts
type Stage = 'hatchling' | 'adult' | 'elder'
```

## 2. XP, levels and stat floors

All in `progress.ts`, pure.

**XP**, from one buddy's saved counts:
```
xp = 10 × turns + totalCalls + 15 × failedTurns + 5 × pets + 5 × talks
```
A rough turn earns 25 in all: its 10 as a turn and 15 for sitting through it. A count that is missing or not a finite number reads as 0, so `xpOf` never throws.

**Level.** Reaching level L takes `xpForLevel(L) = 100 × (L − 1)²` XP. `levelOf(counts)` is the largest L from 1 to 99 with `xpForLevel(L) <= xp`, found with integers, not a float square root, so 8,100 is exactly level 10. At a steady day of about 1,000 XP:

| Level | XP | Steady use |
|-|-|-|
| 2 | 100 | the first hour |
| 10 | 8,100 | about a week |
| 30 | 84,100 | about 3 months |
| 50 | 240,100 | about 8 months |
| 99 | 960,400 | about 2.5 years |

**Stages.** `stageOf(level)`: hatchling for levels 1–9, adult for 10–29, elder for 30 and up (`ADULT_LEVEL = 10`, `ELDER_LEVEL = 30`).

**Saved counts only.** A level, its stage and its floors come from saved counts, never this session's pending ones. So the name line, the sprite, the stats and the announcement all change together, when a flush lands.

**Stat floors.** `grow(bones, level)` returns the bones with raised stats:
```
floor = min(60, RARITY[rarity].floor − 10 + (level − 1))
stat  = max(rolled, min(floor, peak − 1))      for every stat but the peak
```
- At level 1 the floor is at or under every stat a roll can give (base section 2), so a level-1 buddy has exactly its rolled stats.
- The peak keeps its rolled value, and `peak − 1` keeps it the unique highest, which matters for a common whose peak rolled under 61.
- `peak` and `low` keep their rolled names, so the card still marks the same stats.
- A common's low stat of 3 reads 14 at level 20, 34 at level 40, and stops at 60 by level 66. A legendary's floor reaches 60 at level 21.

`register.tsx` gets its bones through one helper, `bonesFor(buddy) = grow(rollBones(buddy.seed), levelOf(buddy.counts))`. Every reader of stats then sees grown ones with no other change: the quip chance and cooldown (Alive section 3), the fail line, the SNARK pick, WISDOM's recall chance (Memory section 4), the persona prompt and the radar. Stat growth raises the quip chance only under the existing cooldown.

**Existing buddies.** No special case. Counts began with 0.2.0, so a buddy hatched before this build is at whatever level its counts give, which for most is a hatchling for its first week.

## 3. Achievements and earned hats

All in `achievements.ts`, pure. Achievements belong to you, so a reroll or a swap keeps them.

**Measured on your lifetime**, across every entry in `buddies`:
- counts summed with `addCounts`, which keeps the largest `longestTurnMs`
- `bests.rough`, the largest across buddies
- each buddy's level from its own counts
- `you.bestStreak`, and the length of `buddies`

| Id | Title | Earned at | Hat |
|-|-|-|-|
| `shell` | Shell regular | 500 shell commands | `hardhat` |
| `editor` | Editor | 1,000 edits | |
| `bookworm` | Bookworm | 5,000 file reads | |
| `researcher` | Researcher | 100 web fetches | |
| `manager` | Manager | 100 agent calls | |
| `thousandTurns` | Thousand turns | 1,000 turns | |
| `marathon` | Marathon | a turn of 10 minutes or more | |
| `ultramarathon` | Ultramarathon | a turn of 30 minutes or more | `nightcap` |
| `survivor` | Survivor | 100 rough turns (`failedTurns`) | |
| `comeback` | Comeback | a clean turn after 5 rough ones (`bests.rough >= 5`) | |
| `goodFriend` | Good friend | 100 pets | `flowercrown` |
| `chatterbox` | Chatterbox | 50 talks | `headphones` |
| `regular` | Regular | a 7-day streak (`bestStreak`) | |
| `devoted` | Devoted | a 30-day streak | `mortarboard` |
| `grownUp` | Grown up | any buddy at level 10 | |
| `elder` | Elder | any buddy at level 30 | `laurel` |
| `collector` | Collector | 5 buddies in the dex | |

The ids are saved, so they never change. Titles and thresholds can.

**Earning.** `earn(saved, now)` adds every achievement that is met and not yet in `earned`, each dated `now`. `applyChange` runs it last in `flush` and `visit` (section 4), against the freshly read store, so two sessions can't both earn one. The first save after the upgrade awards everything already met, dated that save. `collector` is earned at the first flush after the fifth buddy hatches.

**Earned hats.** `earnedHats(earned)` lists the hats of the achievements earned, in table order. Each is 12 columns at most, drawn on the hat row like the rolled hats:

| Hat | Art (draft) | Called |
|-|-|-|
| `hardhat` | `   _/==\_` | a hard hat |
| `nightcap` | `    __.-*` | a nightcap |
| `flowercrown` | `   @*@*@` | a flower crown |
| `headphones` | `  [=----=]` | headphones |
| `mortarboard` | `   _[==]_` | a mortarboard |
| `laurel` | `   ~v~v~v~` | a laurel |

The art is a draft for the build to settle; the debug tour shows each one (section 5). Earned hats are a separate type from the rolled `Hat`, `EarnedHat`, so the roll never gives one and a tinyduck still means legendary.

A newer build's id in `earned` is kept but neither shown nor counted. An `earned` that isn't an object reads as `{}`, and the next save that earns something replaces it.

## 4. Announcements and the journal

**In `applyChange`'s `flush`**, after Memory's steps (Memory section 3):
5. **Growth.** For each entry the flush added counts to, compare `stageOf(levelOf(counts))` before and after. Each stage crossed appends a `grew` moment (1 for adult, 2 for elder), after the milestones, then the journal is trimmed to 20 as before.
6. **Achievements.** `earn` runs on the result.

**In `visit`**, `earn` runs after `arrive`, for the streak achievements.

| Kind | Logged when | `n` | Text |
|-|-|-|-|
| `grew` | the buddy's stage rises in a flush | 1 or 2 | `grew into an adult` / `grew into an elder` |

**What is news.** `newsOf(before, after)` in `progress.ts` compares the record a commit started from with the one it made:
- `level`: the active buddy's new level, when it rose and the active buddy is the same in both
- `stage`: its new stage, when that rose too
- `earned`: ids in `after.earned` and not in `before.earned`, in table order

It is null when nothing rose, when `before` is null (the first hatch), or when the active buddy changed.

**The line.** `newsLine(news)` in `voice.ts`, canned, no model call:
- A level: `Level 12!`. With a stage: `Level 10! I grew into an adult.` or `Level 30! I'm an elder now.`
- Achievements, after the level: `Earned Marathon.`, `Earned Marathon and Survivor.`, `Earned Marathon, Survivor and Comeback.`
- Hats ride on the earned sentence: `Earned Shell regular, and a hard hat.`, or `…, and a nightcap and a laurel.`
- Together: `Level 10! I grew into an adult. Earned Grown up.`

**Showing it.** `commitNow` computes the news after it adopts the result, whether or not the store write then succeeds. So only the session whose commit made the change announces it; a session that adopts another's record never does. Then:
- **Mode `on`:** a celebrate pose (Alive section 4) and the line as a bubble with `news: true`, for `bubbleTicks(line)`.
- **Mode `muted`:** the celebrate pose only.
- **Mode `off`:** nothing.

A throw while working out or showing the news costs only the announcement.

**Over an announcement:**
- A quip whose reply comes back while a `news` bubble is up is dropped. `lastQuipAt` still moves, since the call was made.
- The fail line already never shows over a bubble (Alive section 3).
- The streak greeting isn't shown while a `news` bubble is up, so a visit that earns Regular says that instead.
- A pet, talk or hello reply replaces it, since the person asked.

## 5. Evolution

**Art files.** The bodies move out of `sprites.ts` into three flat files in `hooks/`, each a `Record<Species, string>` in today's format (base section 8): 5 sections per species (rest, fidget B, flinch, celebrate, sleep), split at `~` lines, each 4 body rows, at most 12 columns once `{E}` is filled in.
- `art-adult.ts`: today's art, moved unchanged.
- `art-hatchling.ts`: new.
- `art-elder.ts`: new.

They stay flat in `hooks/`, not a subfolder, since nested imports in the plugin loader are untested. `sprites.ts` keeps the hats, hearts, confetti, zZ, props, the egg, the compact faces and the helpers. Fidget A stays the rest frame shifted one column.

**Art direction:**
- **Hatchling:** at most 3 non-blank rows and 9 columns in every section, on the same bottom row as the adult, so it reads small beside it. Rounder and simpler, and still its species at a glance. Its head sits near column 6, where the hats sit.
- **Elder:** the adult's size, with marks of age chosen per species: a beard, brows, a stoop, a cane, a mossy shell. Every section is drawn new, never a copy of the adult's.
- All three stages share the species' compact face (at most 6 columns).

**The hat sits on the head.** `spriteRows` puts the top row (hearts, confetti, zZ, a holiday hat, the hat, the sparkle; `topRow`'s order is unchanged) in the row just above the first non-blank row of the stage's rest frame, and leaves the rows above it blank. That row is the same for every frame of the stage, so the hat never jumps between frames. Every adult rest frame starts on its first body row, so an adult's top row stays row 0 and nothing about adults moves.

**`bodyRows(species, stage, frame)`** picks the stage's art. `draw`'s `Scene` gains `stage`, and `portrait(bones, stage, tick)` takes it.

**Where the stage shows:**
- **The band**, terminal and desktop SVG: the active buddy's stage.
- **The card portrait**: the shown buddy's stage.
- **The dex**: each buddy at its own stage.
- **The egg**: unchanged. A new buddy hatches as a hatchling.

A stage change also strikes the celebrate pose (section 4).

**The debug tour.** `/buddy debug [hatchling | adult | elder]`, still hidden from `USAGE`, the argument hint and the README. With no word it draws adults, which is today's tour. The chosen stage is kept in `tourStage`, and `tourAt(elapsed, stage)` draws every phase at it: each species with its fidgets and poses, then the real buddy in each holiday's hat and prop, then each mood. The shiny pass rotates the earned hats along with the rolled ones (`['none', ...HATS, ...EARNED_HATS]`). A tour takes about 4 minutes, so all three stages in one run, at about 12, would be too long to watch. The reply names the stage: `Touring all 18 species as hatchlings with their reactions, then the holidays and moods. Run /buddy debug off to stop.`

## 6. The card, the band and the dex

**The band's name line:**
```
  Pip  Lv 12  uncommon duck  ★★
```
The compact layout is unchanged.

**The card** shows the shown buddy (section 7) with grown stats, at its stage:
- **SVG:**
  - Under the hatch and reroll row: `Lv 12` at the left pad, a bar to the right pad that fills from `xpForLevel(L)` to `xpForLevel(L + 1)`, and the label `12,345 / 14,400 xp` (total XP over the total for the next level). At 99 the bar is full and the label is `1,034,500 xp`.
  - Then `Achievements 7 of 17`, and the earned ones as chips in the rarity color, newest first, wrapping. Unearned ones aren't shown.
  - A retired buddy's card adds `Retired Oct 9, 2026`.
  - `cardAlt` adds `Level 12, adult, 12,345 of 14,400 XP. 7 of 17 achievements: Marathon, …`.
- **Text fallback**, still at most 12 lines:
  ```
  Pip, uncommon duck ★★
  Lv 12 adult · 12,345 / 14,400 xp
  Hat: none   Eyes: ·
  <personality>
  DEBUGGING  ##########---------- 50
  … (5 stat lines)
  Hatched 2026-10-07   Rerolls: 2
  Streak 4 days (best 9) · 1,204 turns · 9,876 tool calls
  Achievements: 7 of 17
  ```
  A retired buddy's hatch line adds `   Retired 2026-10-09`.

The achievements and the streak are yours, so every buddy's card shows the same ones.

**`/buddy dex`.** Every buddy keeps its place in `buddies`, which only grows, as its dex number: #1 is the first. The command works in any mode and opens a pane, so nothing reaches the transcript (base section 10):
```ts
$.ui.open({ id: 'dex', title: 'Buddydex', closeOnEscape: true })
```
- **SVG** (desktop, VS Code, mobile): `dexSvg(rows)` in `card.ts`, in the card's frame, 420 px wide, with the header `Buddydex` and a grid of tiles 3 across, about 140 px per row of tiles. Each tile holds:
  - the buddy's rest frame at its stage, in its rarity color (`SHINY` if shiny), hat on, at 11 px
  - `#3 Pip`
  - its stars and `Lv 12`
  - its stage and species: `adult duck`
  - `Oct 7 – Oct 9`, or `Oct 7 – now` on the active one, which is outlined in its rarity color

  A date shows its year only when that isn't this year.
- **Terminal pane:** one row per buddy, oldest first, the active one in bold:
  ```
  #1  <(·)    Pip     Lv 31 elder rare duck ★★★      Oct 7 – Nov 2
  #2  =^·^=   Mochi   Lv 12 adult common cat ★       Nov 2 – now
  ```
  Numbers pad to the widest, faces to 6 columns, names to 12. A row is about 80 columns.
- **Text fallback:** `dexLines(saved, now)` gives `Buddydex: 14 buddies` (`1 buddy` for one), then `…4 earlier` when there are more than 10, then the newest 10 rows in dex order, as the terminal rows read. At most 12 lines.
- `dexAlt` reads it as sentences: `Buddydex, 2 buddies. Number 1, Pip, level 31 elder rare duck, October 7 to November 2. …`

## 7. Swap and targets

**`parseSub`** returns `{ sub, target? }` instead of a bare string:

| Words | Result |
|-|-|
| `card`, `journal` | the active buddy |
| `card <who>`, `journal <who>` | that buddy |
| `dex` | the dex |
| `swap <who>` | a swap |
| `swap` alone, or any of these with an extra word | usage |
| `debug`, `debug hatchling`, `debug adult`, `debug elder`, `debug off` | the tour (section 5) |

`<who>` is one word, since names are one word (base section 5): a name, `#5` or `5`. `USAGE` and the argument hint become:
```
Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]
```

**Finding a buddy.** `findBuddy(saved, who)` in `record.ts`, case-insensitive on names:
- `{ kind: 'one', seed }`: exactly one match
- `{ kind: 'many', numbers }`: two or more by that name
- `{ kind: 'none' }`: no match, or a number out of range

Replies, with the command's own name in the hint:
- many: `2 buddies are named Pip: #2 duck, #5 owl. Run /buddy swap #5.` The hint uses the last match.
- none: `No buddy named Rex in the dex.`, or `No buddy #12 in the dex.`

**Card and journal targets.** A target sets `cardSeed` or `journalSeed`, which their pane render hooks read; no target sets it to null. A target that is the active buddy also sets null, so the pane follows the active buddy after a swap. The text fallbacks use the same buddy. A retired buddy's card shows its saved counts; only the active one adds pending counts, as today.

**`/buddy swap <who>`** is a new change:
```ts
| { kind: 'swap'; seed: string }
```
In `applyChange`, against the fresh store:
1. **The visit** (`arrive`) runs first, as with a reroll, so a sulk or `away` from days off lands on the buddy you left (Memory section 3).
2. **The swap.** The current active buddy gets `retiredAt = now`. The target's `retiredAt` becomes `null`, `active` becomes its seed, and `mode` becomes `on`. `rerolls` is unchanged.
3. **It missed you.** From `localDay(retiredAt)` to today, the returning buddy gets `withSulk(mood, sulkFor(...), now)` (Alive section 2, at most 3) and, at 4 days or more, an `away` moment (Memory section 2), as a visit would give.

A seed with no entry, or one that is already active, returns null: nothing to write.

**Replies:**
- the active buddy: `Pip is already here.`
- while the egg is out: `Wait for the egg to hatch.`, with nothing written
- no record: `NO_BUDDY`
- a refused or failed write: the refusal or `SAVE_FAILED`, as other commands
- otherwise: `Mochi is back.`, then a hello through `HELLO_PROMPT`, as `/buddy` after `off` (one person-initiated call, the talk and pet row of the cost table)

A swap ends a running debug tour, as a hatch does, so the returning buddy is shown as itself. Pending counts and mood are keyed by seed, so they still flush to the buddy that earned them. `adopt` already resets the rough-turn run when the active buddy changes (Memory section 3). No confirm is needed: a swap can always be swapped back.

## 8. Files

| File | Change |
|-|-|
| `progress.ts` (new, pure) | `xpOf`, `xpForLevel`, `levelOf`, `stageOf`, `ADULT_LEVEL`, `ELDER_LEVEL`, `MAX_LEVEL`, `grow`, `newsOf` |
| `achievements.ts` (new, pure) | `ACHIEVEMENTS` (id, title, test, hat), `lifetime`, `earn`, `earnedHats`, `knownEarned` |
| `art-hatchling.ts`, `art-adult.ts`, `art-elder.ts` (new) | The bodies by stage; adult is today's art, moved unchanged |
| `sprites.ts` | `bodyRows(species, stage, frame)`, the top row placed above the head, `EarnedHat`, `EARNED_HATS`, `EARNED_HAT_ART`, `hatArt` for a rolled or earned hat |
| `look.ts` | `Scene.stage`; `portrait(bones, stage, tick)` |
| `tour.ts` | `tourAt(elapsed, stage)`; earned hats in the shiny rotation |
| `journal.ts` | The `grew` kind and its text |
| `record.ts` | `earn` in `flush` and `visit`; `grew` in `flush`; the `swap` change with its sulk and `away`; `findBuddy`; `parseSub` returning `{ sub, target? }`; `USAGE` |
| `layout.ts` | `nameLine` with the level; `cardLines` with the level, retired and achievements lines; `dexRows`, `dexLines` |
| `card.ts` | The XP bar, achievement chips and retired line on `cardSvg` and `cardAlt`; `dexSvg`, `dexAlt` |
| `voice.ts` | `newsLine` |
| `register.tsx` | `bonesFor`; the stage in the band's scene and the portrait; the news in `commitNow`; dropping a quip and skipping the greeting over a `news` bubble; `cardSeed` and `journalSeed`; the `dex` pane and its render hook; `swap`; `debug <stage>` and `tourStage`; the argument hint |
| `types/index.d.ts` | `Stage`; `earned?` on `You`; `grew` in `MomentKind`; `news?` on `Bubble`; `cardSeed`, `journalSeed`, `tourStage` in `PluginState` |
| `README.md` | `dex`, `swap` and the targets in "Use"; a paragraph on levels, stages and achievements; `earned` in "What it saves"; the swap hello under model calls; this spec in "Design" |
| `plugin.json` | version 0.5.0 |

`register.tsx` still holds no game logic.

**Build order**, for the plan: progress and floors; achievements and announcements; the dex, swap and targets; the stage plumbing with the art split, adults only; then the hatchling and elder art in three tasks of 6 species each; then the release. Each art task ends by writing every new frame of its species, all three stages side by side, to a text sheet for review before the next starts.

## 9. Failure handling and cost

As base section 9 and the later specs:
- `xpOf`, `levelOf` and `grow` never throw: a missing or non-finite count reads as 0, so a damaged buddy is level 1 with its rolled stats.
- An `earned` that isn't an object reads as `{}`. A newer build's id is kept, not shown, not counted.
- The news runs after the commit adopts, inside its own `try`; a throw costs only the bubble and the pose.
- A throw while drawing the dex pane falls back to `next(e)`, as the card and journal panes do.
- A swap's refused or failed write answers as other commands do; a failed store write keeps the swap in this session's copy, marked unsaved (Foundation section 2).
- A `cardSeed` or `journalSeed` with no entry (another session's record replaced this one) shows the active buddy.

**Cost:**
- Announcements, achievements and growth add no model calls.
- The swap hello is one person-initiated call, in the talk and pet row (base section 10).
- Grown stats can raise the quip chance, never past the cooldown's 20 an hour.
- A dropped quip is a call already made, never an extra one.
- The dex pane never reaches the transcript; every text fallback stays at 12 lines or fewer.

## 10. Testing

All with `claude plugin test` (base section 11).

**Pure:**
- `progress.test.ts`:
  - `xpOf` with each count's weight, and a non-finite count read as 0
  - `levelOf` at 0, 99, 100, 8,099, 8,100 and past 960,400 (99, the cap)
  - `stageOf` at 9, 10, 29 and 30
  - `grow`: level 1 returns the rolled stats for a roll at every rarity's lowest values; the floor at levels 20 and 40; the cap at 60; `peak − 1` for a common with a peak of 55; the peak unchanged
  - `newsOf`: a level-up; a stage with it; new achievements in table order; null for no change, a null `before` and a changed active buddy
- `achievements.test.ts`:
  - each achievement at its threshold and one under
  - sums across a retired and an active buddy; the largest `longestTurnMs` and `bests.rough`
  - `earn` keeping existing dates and dating new ones `now`
  - an `earned` that isn't an object; an unknown id kept and not counted
  - `earnedHats` in table order
- `record.test.ts`:
  - `flush` crossing level 10 logs one `grew` and earns `grownUp`; one crossing nothing logs neither
  - `visit` earning `regular` at a 7-day streak
  - `swap`: retire, restore, `mode` on, `rerolls` unchanged; the sulk and `away` after 5 days retired, neither after 1; an unknown or active seed returning null
  - `arrive` before the swap: a gap's sulk lands on the buddy left behind
  - `findBuddy` by name, any case; by `#5` and `5`; two matches; none; a number out of range
  - `parseSub` for every row of section 7's table
- `journal.test.ts`: `grew` text for 1 and 2; `readable` accepts it.
- `voice.test.ts`: `newsLine` for a level, a stage, one, two and three achievements, a hat, two hats, and everything together.
- `layout.test.ts`: `nameLine` with the level; `cardLines` at 12 lines with and without the retired line; `dexRows` padding; `dexLines` with 1, 10 and 14 buddies, at most 12 lines.
- `card.test.ts`: the XP bar at a level's start, middle and 99; achievement chips escaped; `dexSvg` height by tile rows; `dexAlt` sentences.
- `sprites.test.ts`:
  - every stage × species × section: 4 body rows, at most 12 columns once eyes are filled, an eye in every section
  - every hatchling section: at most 3 non-blank rows and 9 columns
  - no elder section equal to the adult's
  - the adult art equal to the 0.4 art, row for row
  - the top row's position: row 0 for every adult, above the head for every hatchling
  - every earned hat at most 12 columns
- `tour.test.ts`: `tourAt` passes the stage through every phase; the shiny rotation includes the earned hats.

**Mod-level** (`buddy.test.tsx`):
- **Growth:**
  - a flush that crosses level 10 shows one `news` bubble, strikes celebrate, and saves a `grew` moment and `grownUp`
  - the band's sprite after it is the adult's, and the name line reads `Lv 10`
  - `muted`: the pose, no bubble; `off`: neither
  - a second session that adopts the record announces nothing
- **Over an announcement:** a quip reply landing while it's up is dropped and `lastQuipAt` moves; a pet reply replaces it; a visit that earns `regular` skips the streak greeting.
- **Floors:** a buddy whose counts put it at level 40 quips by its grown CHAOS, checked through the roll it is given.
- **Dex:** `/buddy dex` opens the pane and draws it in the terminal and as SVG; without a placed pane it returns the text fallback; it works in mode `off`.
- **Targets:** `/buddy card #1` and `/buddy journal Pip` draw a retired buddy; a name shared by two buddies answers with the numbers.
- **Swap:** by name and by number; the band then draws the returning buddy; it sends one hello; this session's pending counts from before the swap land on the buddy that earned them.
- **Debug:** `/buddy debug hatchling` tours hatchlings; `/buddy debug` tours adults.
- **Old records:** a 0.4 record with no `earned` loads, and the first flush earns what is already met.
- **Cost:** no test sees more `$.model.complete` calls than before this build, apart from the swap hello.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look in the terminal and the Desktop Code tab at all three debug tours, the dex, a level-up announcement, and the card for the active and a retired buddy.
