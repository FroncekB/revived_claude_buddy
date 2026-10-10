# `buddy` Breeding — Design Spec

**Status:** built 2026-10-09; live check pending. Plan: [`2026-10-09-buddy-breeding-plan.md`](2026-10-09-buddy-breeding-plan.md); its "Deliberate deviations" section lists the small departures from this spec.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-09
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec), [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) (Foundation), [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md) (Alive), [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md) (Memory), [`2026-10-08-buddy-progression-design.md`](2026-10-08-buddy-progression-design.md) (Progression) and [`2026-10-08-buddy-interaction-design.md`](2026-10-08-buddy-interaction-design.md) (Interaction). Section numbers below that start with "base", "Foundation", "Alive", "Memory", "Progression" or "Interaction" point there.
**Issues:** #26 earned eggs, #23 carrying and hatching, #22 breeding. Roadmap: #18.

## Purpose

Sub-project F of six. New buddies stop being free:
- **Earned eggs** (#26): rerolls go away, apart from one mulligan at the very start. Every 8,100 XP you earn across your buddies brings an egg.
- **Carrying** (#23): the egg rides in the band beside the active buddy, wobbling more as it nears hatching, and hatches after 150 turns. The hatchling joins the dex; the active buddy stays.
- **Breeding** (#22): once five buddies are in the dex, `/buddy breed <who>` sets the active buddy and a retired one to brood the egg now incubating. The hatchling takes after both.

Breeding spends the egg you earned and lays none of its own, so it never brings buddies faster than wild eggs do. It gives you a say in who hatches.

Rules kept from the roadmap:
- New saved data goes in optional fields, so the schema stays at 2.
- The buddy never sees prompt text, answers, file contents or command arguments, except a prompt addressed to it by name. Eggs are earned from XP and hatched from turn counts. A bred hatch's prompt carries its parents' names and personalities, which the model wrote and the record already holds.
- Reactions stay within the base spec's cost table (base section 10). Earning, carrying and brooding make no model call. A hatch is the hatch row's one soul call, with no hello.

**Not here:** egg groups (any two adults can breed); a breeding achievement; the egg in the compact layout or the dex; more than one egg at a time; choosing which parent a trait comes from.

## 1. Saved data and session state

**New optional fields** (Foundation section 1):
```ts
type You = {
  // ...as before
  eggs?: number   // eggs started so far; missing reads as floor(xp / 8,100) (section 2)
}

type Egg = {
  seed: string                  // the hatchling's seed
  startedAt: string             // ISO time it started incubating
  fromTurns: number             // lifetimeTurns when it started (section 3)
  parents?: [string, string]    // set by /buddy breed: [the active buddy then, its partner]
}

type Buddy = {
  // ...as before
  parents?: [string, string]    // a bred buddy's, copied from its egg
}

type Saved = {
  // ...as before
  egg?: Egg                     // the egg incubating; at most one
}
```

Bones stay unsaved (base section 2). A bred buddy's bones come from its seed and its parents' bones (section 4), so a parent can never leave the record. Only the mulligan replaces an entry, and it needs a dex of one, so the buddy it replaces has no children.

**Two new moment kinds** (Memory section 1): `brooded` and `hatched` (section 5). A 0.6 session skips them, as `readable` already does.

**Writes from older builds.** As Foundation section 1 requires, a commit changes only the fields it names. A 0.6 session spreads the record, `you` and each buddy, so `egg`, `you.eggs` and `parents` survive its writes. Two gaps are accepted until every session runs 0.7: a 0.6 session draws a bred buddy as its seed's plain roll, and it still allows free rerolls.

**Changes** (Foundation section 2):
```ts
| { kind: 'flush'; ...as before; eggSeed: string }                   // used only if an egg starts
| { kind: 'breed'; partner: string }
| { kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed: string }
```
`applyChange` stays pure, so a seed an egg might need comes in on the change, made with `crypto.randomUUID()` by the session committing. Only the commit that starts an egg uses its seed, against the fresh store, so two sessions can't start two eggs.

`reroll` keeps its shape and becomes the mulligan (section 2). `hatch` against a record that already exists writes nothing: it only makes the first record. That happens only when another session hatched first, and the reply then names the buddy already there.

**`$.state`, plugin `buddy`**, one new key:

| Key | Type | Meaning |
|-|-|-|
| `eggHatching` | `boolean` | The egg's soul call is in flight: the band shows it cracked, and no second hatch starts |

`session.start` clears it, as it clears `hatching`, since a reload mid-hatch leaves nobody to.

## 2. Earning eggs and the mulligan

All the reckoning is in `eggs.ts`, pure.

**The mulligan.** `/buddy reroll` works once, while all three hold:
- the dex has one buddy
- it is under level 2 (100 XP), by saved counts as levels are (Progression section 2)
- `rerolls` is 0

`mulliganOpen(saved)` checks them; nothing new is saved. The reroll runs today's hatch path (base section 5), egg animation and all. Its change replaces entry #1 in place: a new seed and soul, zero counts, and none of the old buddy's mood, journal, bests or hat. `rerolls` becomes 1 and `mode` becomes `on`. It adds no dex entry, so it can't count toward Collector. Against a fresh store where the window has shut, it writes nothing and the reply is the closed line.

| Command | Window open | Window shut |
|-|-|-|
| `/buddy reroll` | `This replaces Pip, a common duck, for good. Run /buddy reroll confirm.` | `No more rerolls. <egg status>` |
| `/buddy reroll confirm` | the reroll; `Bean, a rare owl, hatched.` | the same closed line |

The first hatch says so: `Pip, a common duck, hatched. Not the one? /buddy reroll works once, before level 2.`

**Earning.**
```
EGG_XP  = 8,100                                     // the XP that reaches level 10
xp      = sum of xpOf(counts) over every buddy      // saved counts only
earned  = floor(xp / EGG_XP)
owed    = earned − you.eggs
```
A new person's first egg comes when their first buddy grows into an adult, about a week in. A turn is worth the same XP to any buddy, so swapping to a hatchling earns no faster.

**Starting an egg.** In `applyChange`'s `flush`, after Progression's steps:
1. When `you.eggs` is missing or not a finite number, it is set to `floor(xp / EGG_XP)` from the counts as stored, before this flush's are added. So an existing record's clock runs from its XP at upgrade: no back-paid eggs, and none owed.
2. After the counts are added, when there is no egg and `owed > 0`, an egg starts: `egg = { seed: change.eggSeed, startedAt: now, fromTurns: lifetimeTurns }` and `you.eggs + 1`. An egg earned while another incubates waits: it starts on the hatch commit (section 3).

`fresh` writes `eggs: 0`, so a new record never reads the fallback.

**The egg status**, `eggStatus(saved)`, for replies:
- an egg incubating: `An egg is on the way: 40 of 150 turns.`
- none, and one owed: `Your next egg starts after the next turn.` (only between a write that set it owing and the flush that starts it)
- otherwise: `Your next egg comes in 3,200 xp.`, the XP left to `(you.eggs + 1) × EGG_XP`

## 3. Carrying and hatching

**Progress** counts turns summed over every buddy's saved counts:
```
HATCH_TURNS   = 150                             // a day or two of steady use
lifetimeTurns = sum of safeCounts(counts).turns over every buddy
done          = clamp(lifetimeTurns − egg.fromTurns, 0, HATCH_TURNS)
due           = done >= HATCH_TURNS
```
Summed, so a swap mid-egg neither resets it nor skips it, and nothing new needs merging across sessions. It pauses while the mod is off, since counts do. Every egg takes the same 150 turns: a brooded egg's rarity isn't known until it hatches.

**When it hatches.** `hatchIfDue` checks `due` after this session adopts a commit (run with `later`, since nothing inside `commitNow` may call `commit`), at `session.start` and on `/buddy`. It does nothing in mode `off`, while `eggHatching` or `hatching` is set, or with no egg. When due:
1. Set a module flag before the first await, so a second check in this session returns at once, then `eggHatching = true` for the band, which shows the egg cracked and shaking (section 6). The active buddy stays on screen and its events still count.
2. Work out the egg's bones: `rollBones(seed)` for a wild egg, `breedBones` for a brooded one (section 4).
3. Ask Haiku for the soul through the hatch path (base section 5). A brooded egg's request adds its parents (section 4). A failed call uses the fallback soul, as now.
4. Commit `hatchEgg` with the seed, the parents the soul was made for, the soul and a fresh `eggSeed`.
5. Clear the flag and `eggHatching`, whatever happened.

**The `hatchEgg` change** writes nothing unless the stored egg has this seed, is due, and has the same parents the soul was made for. When it does:
- the hatchling joins the end of `buddies`: its seed and soul, zero counts, `retiredAt` equal to its `hatchedAt`, the egg's `parents` when it has them, and a `hatched` moment
- `egg` is removed
- when `owed > 0`, the next egg starts at once, from `eggSeed`, with `you.eggs + 1`
- `earn` runs last (Progression section 3), so a fifth hatch earns Collector on the same commit
- the active buddy, the mode and the visit are untouched

**Races.** Two sessions can find the same egg due. Both make the soul call; the first commit wins, and the second writes nothing, adopts and says nothing. A `breed` from another session during the soul call changes the parents, so the commit writes nothing and the next check hatches with the right parents. Each costs one extra soul call, and only in a race.

**A hatchling that has never been active** reads from `retiredAt === soul.hatchedAt`:
- the dex shows `hatched Oct 9` instead of a date range (section 6)
- its first `/buddy swap` in gives no sulk and no `away` moment (Progression section 7), since nobody left it

## 4. Breeding and inheritance

**Unlocking.** Breeding needs 5 buddies in the dex, Collector's mark (Progression section 3). Earning Collector adds `Breeding unlocked.` to its announcement (section 5).

**`/buddy breed <who>`**, checked in this order against the adopted record:
1. The first hatch or the mulligan running: `Wait for the egg to hatch.`
2. `eggHatching`: `The egg is hatching.`
3. Mode `off`: `Pip is hidden. Run /buddy to bring it back.`, as `feed` gives.
4. Under 5 buddies: `Breeding unlocks at 5 buddies in the dex: 2 to go.`
5. No egg: `No egg to brood. Your next egg comes in 3,200 xp.`
6. The egg has parents: `Pip and Mochi are already brooding this egg.`
7. No buddy or several by that name: `notFound(…, 'breed')` (Progression section 7).
8. The active buddy: `Pip can't breed with itself. Pick one from /buddy dex.`
9. Either one under level 10, by saved counts: `Mochi is level 6. Buddies breed from level 10.`
10. Otherwise it commits `breed`, strikes the celebrate pose, and replies `Pip and Mochi are brooding the egg. It hatches in 110 turns.`

**The `breed` change**, against the fresh store, writes nothing unless the dex has 5 or more, an egg is out with no parents, the partner exists and isn't the active buddy, and both are level 10 or more. Then it sets `egg.parents = [active, partner]` and appends a `brooded` moment to each, its `n` the other's dex number. No visit, as `rename` makes none. Parents can't change once set. When it wrote nothing, the reply is worked out again from the fresh record: another session may have set parents first.

**Inheritance:** `breedBones(seed, a, b)` in `breed.ts`, pure. `a` and `b` are the parents' born bones, never their grown ones, so a child never changes as its parents level. Draws come from `rngFor(seed)` in this fixed order:
1. **Rarity:** rolled with today's weights, then raised to the lower parent's rarity when it came in under it.
2. **Species:** `rng() < 0.5` gives `a`'s, else `b`'s.
3. **Eye:** the same way.
4. **Hat:** uniform from the rarity's list, as now.
5. **Shiny:** `rng() < 0.04` when either parent is shiny, else `0.01`.
6. **The 3 copied stats:** three distinct indices, each redrawn until it is one not yet taken.
7. **Each copied stat**, in `STATS` order: its parent 50/50, the value clamped to the child's rarity range, `[max(1, F − 10), min(100, F + 79)]`: the lowest low to the highest peak a roll at that rarity gives.
8. **Each fresh stat**, in `STATS` order: `F + r(40)`, a roll's middle-stat formula.

The **peak** is then the highest stat and the **low** the lowest of the rest, ties going to the earlier stat in `STATS`. A tied peak can happen; `grow` lifts no stat past `peak − 1` and never lowers one, so a tied stat keeps its value (Progression section 2).

**Looking a buddy up.** `bornBones(buddies, seed)`:
- an entry with a well-formed `parents`, both in the record and neither yet seen on this walk: `breedBones(seed, bornBones(parent0), bornBones(parent1))`
- otherwise: `rollBones(seed)`

A damaged `parents`, a missing parent or a hand-made loop reads as a plain roll, so it never throws. The egg's bones use the same rule. Every reader of a buddy's bones goes through it:
- `bonesFor(buddy, buddies) = grow(bornBones(buddies, buddy.seed), levelOf(buddy.counts))` (Progression section 2)
- the rolled hat in `toys.ts` and in `applyChange`'s `hat` (Interaction section 2)
- the species in `notFound`

**The hatch prompt.** `hatchRequest(bones, parents?)` adds, for a brooded egg: `Parents: Pip, a duck ("<personality>"), and Mochi, a cat ("<personality>"). Take after them a little; the name is your own.` Each personality is at most 160 characters (base section 5).

## 5. Announcements and the journal

**News** (Progression section 4). `newsOf(before, after)` gains two parts, both null when the active buddy changed, as before:
- `hatched`: the buddy `after` has that `before` didn't, with its name, rarity, species, shiny, and what to swap by: the name, or `#6` when another buddy shares it
- `egg`: true when `after` has an egg with a seed `before`'s egg doesn't

**The line.** `newsLine` in this order, all canned:
1. `The egg hatched! Meet Sprout, a rare owl. Run /buddy swap Sprout.` (`a shiny rare owl` when shiny)
2. the level and stage, as now
3. `An egg! It hatches in 150 turns.`
4. what was earned, as now, then `Breeding unlocked.` when Collector is among it

So a fifth hatch reads `The egg hatched! Meet Sprout, a rare owl. Run /buddy swap Sprout. Earned Collector. Breeding unlocked.`, and a flush that earns an egg as the buddy grows reads `Level 10! I grew into an adult. An egg! It hatches in 150 turns. Earned Grown up.`

It shows as news does now: in mode `on` a celebrate pose and a `news` bubble; in `muted` the pose only. Only the session whose commit made the change announces it.

**Journal** (Memory section 2):

| Kind | Logged | `n` | Text |
|-|-|-|-|
| `brooded` | on both parents, by `breed` | the other's dex number | `brooded an egg with Mochi` |
| `hatched` | on the hatchling, by `hatchEgg` | the turns it took, 150 | `hatched after 150 turns in the egg` |

`momentText(m, buddies?)` names the partner from `buddies[n − 1]`. Without a list, or for a number out of range, it reads `brooded an egg`. The journal pane and the quip and talk prompts pass the record's buddies. Both kinds can be recalled under WISDOM's chance like any moment (Memory section 4); neither echoes a turn.

## 6. Drawing: the band, the card and the dex

**The egg in the band.** A small egg, 3 rows by 5 columns, drawn new. The egg in `sprites.ts` is as big as a hatchling, so it stays the hatching animation for the first hatch and the mulligan.
```
 .-.      .-.
(   )    (\/\)
 '-'      '-'
```
In the full layout (base section 8), while an egg is out, a 7-column gutter sits between the sprite and the right-hand column, the egg in it on band rows 2 to 4, standing on the sprite's ground row. The bubble and a holiday prop shift right by 7, and the bubble's width becomes `min(bodyColumns − 21, 80)`. The egg is in the text color. The desktop SVG band draws the same grid. The compact layout shows no egg.

```
                     .-----------------------.
    __              <  Three retries. Bold.  |
  <(· )___    .-.    '-----------------------'
   ( ._> /   (   )
    '---'     '-'
  Pip  Lv 12  uncommon duck  ★★
```

**Wobble.** At rest the egg sits in columns 1 to 5 of its gutter; a lean moves it one column left or right. Over the 16-tick cycle, with `f = done / 150`:
- `f < 0.5`: left at tick 8, right at 9
- `0.5 ≤ f < 0.9`: the same at ticks 4 and 5, and 12 and 13
- `f ≥ 0.9`: at ticks 0 and 1, 4 and 5, 8 and 9, 12 and 13, and the cracked art throughout
- `eggHatching`: cracked, leaning left on even ticks and right on odd ones

While the buddy sleeps (Alive section 4) the egg keeps still at rest, cracked from `f ≥ 0.9` as above.

**The debug tour** (Progression section 5) ends with a new phase: the real buddy with an egg at `f` 0.25, 0.75 and 0.95, then hatching, one 16-tick cycle each. `TourAt` gains `egg: { f: number; hatching: boolean } | null`. A tour draws no other egg.

**The card**, for any buddy shown:
- **SVG:**
  - A bred buddy gets `Parents  #1 Pip × #3 Mochi` under the hatch and reroll row.
  - Under the XP bar, an egg row. With no egg out: `Next egg`, a bar, `3,200 / 8,100 xp` (`xp − you.eggs × EGG_XP`, kept within 0 and `EGG_XP`, over `EGG_XP`). With one out: `Egg`, a bar, `40 / 150 turns`, and `brooded by Pip and Mochi` under it when it has parents.
  - `cardAlt` adds `Bred from Pip and Mochi.` and `Next egg at 3,200 of 8,100 XP.` or `An egg is 40 of 150 turns along, brooded by Pip and Mochi.`
- **Text fallback**, still at most 12 lines:
  - the parents go on the hatch line: `Hatched 2026-10-09 from #1 Pip and #3 Mochi   Rerolls: 1`
  - the egg goes on the achievements line: `Achievements: 7 of 17 · Next egg 3,200 / 8,100 xp`, or `· Egg 40 / 150 turns`

Eggs are yours, like achievements and the streak, so every buddy's card shows the same egg row.

**The dex** (Progression section 6). A hatchling never yet active shows `hatched Oct 9` where the date range goes, in the SVG tiles, the terminal rows and the text fallback; `dexAlt` reads `hatched October 9`.

## 7. Parsing and usage

**`parseSub`** gains `breed`:

| Words | Result |
|-|-|
| `breed <who>` | `{ sub: 'breed', target }` |
| `breed` alone, or with more words | usage |

`<who>` is one word: a name, `#5` or `5`, as `swap` takes. `USAGE`, the argument hint and the README become:
```
Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]
```

## 8. Files

| File | Change |
|-|-|
| `eggs.ts` (new, pure) | `EGG_XP`, `HATCH_TURNS`, `lifetimeXp`, `lifetimeTurns`, `eggsOf`, `owed`, `readEgg`, `eggProgress`, `eggDue`, `mulliganOpen`, `eggStatus` |
| `breed.ts` (new, pure) | `breedBones`, `bornBones`, `eggBones` |
| `progress.ts` | `bonesFor(buddy, buddies)` |
| `record.ts` | The mulligan `reroll` in place; `hatch` writing nothing over a record; eggs started in `flush`; `breed` and `hatchEgg`; `eggs: 0` in `fresh`; the never-active rule in `welcomeBack`; `parseSub` and `USAGE` gain `breed`; `bornBones` in `hat` and `notFound` |
| `achievements.ts` | `newsOf` gains `hatched` and `egg` |
| `toys.ts` | The rolled hat through `bornBones` |
| `journal.ts` | `brooded` and `hatched`; `momentText(m, buddies?)` |
| `voice.ts` | `hatchRequest(bones, parents?)`; `newsLine`'s hatch, egg and unlock parts; the mulligan and closed reroll lines |
| `sprites.ts` | The small egg, whole and cracked; `eggRows(f, tick, o)` for the gutter |
| `layout.ts` | The egg gutter in the band rows, with `bubbleWidth(bodyColumns, egg)`; the parents and egg folds in `cardLines`; `hatched Oct 9` in `dexRows` |
| `look.ts`, `svg.ts` | The gutter in the scene and the desktop band |
| `card.ts` | The parents row, the egg row and their `cardAlt` sentences; the dex tile's date |
| `tour.ts` | The egg phase |
| `register.tsx` | `breed`; the mulligan replies; `hatchIfDue` after commits, at `session.start` and on `/buddy`; `eggHatching`; `eggSeed` on every flush; the buddy list passed to `bonesFor` and `momentText` |
| `types/index.d.ts` | `Egg`; `egg?` on `Saved`; `eggs?` on `You`; `parents?` on `Buddy`; the two moment kinds; `eggHatching` in `PluginState` |
| `README.md` | `breed` in "Use"; a paragraph on eggs, the mulligan and breeding; `egg`, `eggs` and `parents` in "What it saves"; this spec in "Design" |
| `plugin.json` | version 0.7.0 |

`register.tsx` still holds no game logic.

**Build order**, for the plan:
1. `breed.ts` and `bornBones` through every reader of bones, with no change anyone can see.
2. `eggs.ts`, the mulligan, earning and the egg on the record.
3. Carrying and hatching, with the news.
4. Breeding.
5. The band egg, its wobble and the tour phase.
6. The card, the dex and the journal.
7. The release.

## 9. Failure handling and cost

As base section 9 and the later specs:
- `bornBones`, `breedBones` and every reckoning in `eggs.ts` never throw. A missing or non-finite count reads as 0.
- An `egg` that doesn't read (no seed, a `fromTurns` that isn't finite, `parents` not two seeds in the record) reads as none: it isn't drawn and never hatches, and `breed` answers as if no egg were out. It was counted in `you.eggs`, so the next egg comes on schedule, not early.
- A `you.eggs` that isn't a finite number reads as `floor(xp / EGG_XP)` and is rewritten at the next flush.
- A throw in `hatchIfDue` before the commit costs only that check: `eggHatching` is cleared, the egg stays due, and the next check tries again. A failed store write keeps the hatch in this session's copy, marked unsaved (Foundation section 2).
- A throw while drawing the egg costs only the egg: the band draws without its gutter.
- `breed`'s refused or failed write answers as other commands do.

**Cost:**
- Earning, carrying, brooding and the announcements make no model call.
- A hatch is one soul call, the hatch row (base section 10), and no hello: the hatchling isn't active.
- A race between sessions, or a `breed` during the soul call, can cost one extra soul call.
- Ending free rerolls removes the reroll's soul call and hello, so this build makes fewer calls than 0.6.
- The text fallbacks stay at 12 lines or fewer.

## 10. Testing

All with `claude plugin test` (base section 11).

**Pure:**
- `breed.test.ts`:
  - the same seed and parents give the same bones
  - over 100,000 fixed seeds: species and eye each within 1 point of 50/50 between the parents; rarity never below the lower parent's; shiny within 0.3 points of 1% with plain parents and of 4% with a shiny one; every stat inside the child's rarity range; at least 3 stats equal to a parent's value or that value clamped
  - peak and low on a tie
  - `bornBones` on a grandchild; on a damaged `parents`; on a missing parent; on a loop
- `eggs.test.ts`:
  - `earned` at 8,099 and 8,100 summed across two buddies
  - `eggsOf` reading a missing and a non-finite `eggs` as `floor(xp / 8,100)`
  - `eggProgress` at 0, 149, 150 and past; summed across a swap
  - `mulliganOpen` for each of its three conditions failing alone
  - `readEgg` on each way an egg can be damaged
  - `eggStatus` for each of its three lines
- `record.test.ts`:
  - the mulligan replaces #1 in place, sets `rerolls` to 1, and writes nothing when the window has shut
  - `hatch` against an existing record writes nothing
  - the first flush after the upgrade writes `eggs` from the XP before its counts; a later one crossing 8,100 starts an egg with `eggSeed`; one crossing it while an egg is out starts none
  - `hatchEgg`: the hatchling joins the dex with `retiredAt === hatchedAt`, its `parents` and a `hatched` moment; the active buddy and mode unchanged; the egg cleared; the next egg started when one is owed; Collector earned on the fifth; a wrong seed, an egg not due, or different parents writes nothing
  - `breed`: sets parents and both `brooded` moments; writes nothing under 5 buddies, with no egg, with parents already set, for the active buddy, or for a buddy under level 10
  - `swap` to a never-active hatchling: no sulk and no `away` after 5 days
  - `parseSub` for every row of section 7's table
- `achievements.test.ts`: `newsOf`'s `hatched`, with a shared name giving `#6`, and `egg`; both null when the active buddy changed.
- `journal.test.ts`: both kinds' text, with and without the buddy list; `readable` accepts them.
- `voice.test.ts`: `newsLine`'s hatch, shiny hatch, egg and unlock parts, in order with a level and achievements; `hatchRequest` with and without parents; the mulligan lines.
- `sprites.test.ts`: the small egg at 3 rows and 5 columns; `eggRows` at each wobble band and hatching, always 3 rows of 7 columns.
- `layout.test.ts`: the gutter shifts the bubble and the prop by 7 columns, and `bubbleWidth` with an egg; `cardLines` at 12 lines or fewer with both folds; `dexRows` showing `hatched Oct 9`.
- `card.test.ts`: the parents row and each egg row on `cardSvg`, names escaped; their `cardAlt` sentences.
- `tour.test.ts`: the egg phase's four steps, and `TOUR_TICKS` with them.

**Mod-level** (`buddy.test.tsx`):
- **The mulligan:** a first hatch's reply mentions it; `reroll confirm` replaces #1 with no new dex entry; a second answers `No more rerolls.` with the egg status.
- **Earning:** a flush that crosses 8,100 XP starts an egg, announces it, and the band draws the gutter.
- **Hatching:** flushes that carry summed turns to 150 make exactly one soul call and no hello; the active buddy stays in the band; the dex gains the hatchling; the news bubble names it; `muted` gives the pose and no bubble.
- **Races:** a second session that adopts the hatched record makes no call and announces nothing.
- **Breeding:** refused under 5 buddies with the count to go; `breed Mochi` with both adults sets the parents and makes no model call; the hatch prompt carries both parents; the hatchling's card shows them.
- **Swap mid-egg:** the egg stays in the band and its progress carries on.
- **Old records:** a 0.6 record with rerolls loads with the mulligan spent and `eggs` written at the first flush.
- **Cost:** no test sees more `$.model.complete` calls than before this build, apart from one soul call a hatch.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look in the terminal and the Desktop Code tab at the debug tour's egg phase, the card with an egg and with none, and a hatch from a store edited to put an egg one turn from due.
