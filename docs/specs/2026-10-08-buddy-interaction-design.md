# `buddy` Interaction — Design Spec

**Status:** built 2026-10-08; live check pending. Plan: [`2026-10-08-buddy-interaction-plan.md`](2026-10-08-buddy-interaction-plan.md); its "Deliberate deviations" section lists ten small departures from this spec.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-08
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec), [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) (Foundation), [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md) (Alive), [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md) (Memory) and [`2026-10-08-buddy-progression-design.md`](2026-10-08-buddy-progression-design.md) (Progression). Section numbers below that start with "base", "Foundation", "Alive", "Memory" or "Progression" point there.
**Issues:** #15 rubber-duck nudge, #16 small toys, #17 break nudges. Roadmap: #18.

## Purpose

Sub-project E of six. The buddy gets things to do with you, and notices when you're stuck or tired:
- **Toys:** `/buddy feed`, `/buddy play` (dice, a coin, rock-paper-scissors), `/buddy rename <name>` and `/buddy hat [hat]`, to wear a hat you've earned.
- **The rubber duck:** after one tool fails 3 times across two turns, the buddy offers to talk it through. For 15 minutes after that, talking to it gets rubber-duck questions.
- **Break nudges:** after 90 minutes of turns with no gap longer than 10, the buddy yawns and suggests a break.

Rules kept from the roadmap:
- New saved data goes in optional fields, so the schema stays at 2. The only new saved field is the hat a buddy wears.
- The buddy never sees prompt text, answers, file contents or command arguments, except a prompt addressed to it by name. The duck nudge sees a tool's name and how often it failed, as a quip already does (base section 6). A new name given with `rename` becomes part of the buddy, after passing the hatch rules.
- Reactions stay within the base spec's cost table (base section 10). The toys' replies are person-initiated and sit in the talk and pet row. The duck nudge is one new row: at most 2 an hour (section 6).

**Not here:** toys for a retired buddy; a game score or win streak; snack preferences; a line when you come back from a break; breeding (F #22, #23).

## 1. Saved data and session state

**One new optional field on `Buddy`** (Foundation section 1):
```ts
type Buddy = {
  // ...as before
  hat?: string   // the hat it wears: a rolled or earned hat's id, or 'none'; missing reads as its rolled hat
}
```

A `rename` writes the buddy's `soul.name`, which already exists. The schema stays at 2. As Foundation section 1 requires, a commit changes only the fields it names, so a 0.5 session that spreads a buddy keeps its `hat`. A 0.5 session draws the rolled hat, since it doesn't read the field.

**Two new changes** (Foundation section 2):
```ts
| { kind: 'rename'; seed: string; name: string }
| { kind: 'hat'; seed: string; hat: Wearable | 'none' }
```

**`$.state`, plugin `buddy`**, new keys (survive a hot reload, not a session):

| Key | Type | Meaning |
|-|-|-|
| `snack` | `{ index: number; untilTick: number } \| null` | The snack the hat row shows and the tick its crumbs end on (section 2) |
| `lastFedAt` | `number` | When the buddy last ate, in ms; 0 for never |
| `duckUntil` | `number` | When duck mode ends, in ms; 0 when it's off (section 4) |
| `duckTool` | `string \| null` | The tool duck mode is about |
| `lastNudgeAt` | `number` | When the last duck nudge fired, in ms |

`pose` gains `yawn` (section 5): `{ kind: 'flinch' | 'celebrate' | 'yawn'; untilTick: number }`.

**Module variables** in `register.tsx`, lost on a reload like `roughTurns` (Memory section 3):
- `prevFails`: the previous main turn's failed calls by tool name (section 4)
- `stretch`: the current run of turns (section 5)

## 2. Toys

Each toy works on the active buddy. With the buddy `off` it answers `Pip is hidden. Run /buddy to bring it back.`, as `pet` does. While the egg is out it answers `Wait for the egg to hatch.`, as `swap` does, and does nothing else.

Every toy that replies does so through the pet path: `reply` with its own prompt, at most one model call per 5 s (`REPLY_FLOOR_MS`), answered even when muted, following an announcement in the same bubble (Progression section 4). `reply` gains a `fallback` argument: the line shown when the floor holds or the model doesn't answer. Each toy passes its own fallback, so a game never falls back to a stack-trace joke. Without one, `cannedLine` is used as today.

### `/buddy feed`

1. **Full?** If the buddy ate in the last 10 minutes (`now − lastFedAt < FULL_MS`), it shows a canned line and nothing else: no snack, no count, no model call.
   - `Still full, thanks.`
   - `One more bite and I pop.`
   - `Ask me again in a bit.`
2. **Otherwise** a snack is picked by a local roll from `SNACKS`, `lastFedAt` becomes now, and `snack` is set to that snack until `SNACK_TICKS` (5) from now. The hat row shows the snack for 3 ticks, then crumbs (`    .  . .`) for 2.
3. It is counted as a pet, through `soothe`: it eases a sulk, earns 5 XP and counts toward Good friend. Then the reply: `The developer just fed you {called}. React in one line.` The fallback is `Mm. Thanks for the {snack}.`

The command itself answers nothing, as `pet` does.

| Snack | Called | Art (draft) |
|-|-|-|
| cookie | a cookie | `    (::)` |
| apple | an apple | `     (@)` |
| fish | a fish | `   ><(((°>` |
| cheese | some cheese | `    [:::>` |
| berries | some berries | `     ooo` |
| donut | a donut | `    ( o )` |

`{called}` is the "Called" column: `The developer just fed you a cookie.` The art is a draft for the build to settle. Each is at most 12 columns, drawn on the hat row like a hat (Progression section 5), so it sits above a hatchling's head too.

**The hat row's order** becomes: hearts, snack, confetti, zZ, holiday hat, worn hat, sparkle.

### `/buddy play [game] [pick]`

Three games, decided locally from rolls passed in, with no model call:
- **`dice`:** you and the buddy each roll a die. The higher roll wins; the same roll is a draw.
- **`coin`:** one side calls it and the coin is flipped. If you name `heads` or `tails`, you call it; otherwise the buddy calls it. The caller wins on a match.
- **`rps`:** you throw what you named, or a throw picked for you; the buddy throws one at random. Rock beats scissors, scissors beat paper, paper beats rock.

With no game named, one is picked at random. A pick alone names its game: `rock`, `paper` or `scissors` plays `rps`, and `heads` or `tails` plays `coin`.

The command answers with the result at once:
- `You rolled 4; Pip rolled 6. Pip wins.` / `You both rolled 3. A draw.`
- `You called heads. Tails. Pip wins.` / `Pip called tails. Tails. Pip wins.`
- `You threw rock; Pip threw scissors. You win.` / `You both threw paper. A draw.` A throw picked for you reads `You threw rock (picked for you); …`.

Then:
- **A buddy win** strikes the celebrate pose (Alive section 4).
- It is counted as a pet, through `soothe`.
- The reply: `You just played {game} with the developer: {what happened, from your side}. React in one line.` For example: `You just played rock-paper-scissors with the developer: they threw rock, you threw scissors. They won.`
- The fallback, by outcome:
  - the buddy won: `Ha! Again?` / `Undefeated. Mostly.`
  - it lost: `Best two out of three.` / `I let you win.`
  - a draw: `A draw. Suspicious.` / `Again. Now.`

### `/buddy rename <name>`

`validName(name)` in `voice.ts`, taken out of `parseSoul` so hatching and renaming share it: one word, letters only, at most 12 characters, and not in `RESERVED_NAMES`.

Replies:
- not valid: `A name is one word of letters, at most 12.`
- reserved: `Claude starts too many prompts to be a name.`
- the same name in the same case: `Pip is already its name.` A change of case alone (`pip` to `Pip`) is a rename.
- a refused or failed write: the refusal or `SAVE_FAILED`, as other commands
- otherwise: `Pip is now Mochi.`, then the reply `The developer just renamed you from Pip to Mochi. React in one line.` The fallback is `Mochi. I like it.`

**In `applyChange`:** `rename` sets `soul.name` on the buddy with that seed. It returns null when the seed has no entry or the name is unchanged. It runs no visit, as `mode` runs none. Two buddies may share a name; the dex already numbers them (Progression section 7).

After a rename, a prompt that starts with the new name goes to the buddy and one that starts with the old name goes to Claude. Another open session goes on matching the old name until it next adopts the record, at its next save.

### `/buddy hat [hat]`

**What a buddy can wear** (`wearable(buddy, you)` in `toys.ts`): its own rolled hat if it rolled one, every hat you've earned (Progression section 3, in table order), and `none`. Another buddy's rolled hat is never wearable, so a tiny duck still means legendary.

**What it wears** (`wornHat(buddy, you)`): its `hat` when that is wearable. Otherwise its rolled hat: when `hat` is missing, not a string, unknown to this build, or a hat it can't wear. An unwearable `hat` is kept in the store until it is changed.

**`/buddy hat`** alone lists them:
- `Pip is wearing a crown. It can wear: crown, hardhat, laurel, none.`
- `Pip has no hat on. It can wear: none. Achievements unlock more.`

**`/buddy hat <hat>`** takes a hat's id in any case, with spaces dropped, so `hat flower crown` and `hat Top Hat` both work.
- an unknown id: `No hat called {words}. Pip can wear: crown, hardhat, none.`
- an earned hat not yet earned: `Earn Shell regular to unlock a hard hat.`
- another buddy's rolled hat: `Only a buddy that rolled a halo can wear one.`
- the one it wears: `Pip is already wearing a crown.`, or `Pip has no hat on.`
- a refused or failed write: as other commands
- otherwise: `Pip is wearing a hard hat.` or `Pip took its hat off.`, then the reply `The developer just put a hard hat on you. React in one line.` (`… just took your hat off. …`). The fallback is `How do I look?` or `Cooler up here.`

**In `applyChange`:** `hat` sets the buddy's `hat`, against the fresh store. Choosing its rolled hat deletes the field, so the default is stored as nothing. It returns null when the seed has no entry, when the hat isn't wearable by the fresh record, or when the worn hat wouldn't change.

**Hat names** (`HAT_NAME` in `toys.ts`): for the replies, the rolled hats are `a crown`, `a top hat`, `a propeller cap`, `a halo`, `a wizard hat`, `a beanie` and `a tiny duck`; the earned ones keep `EARNED_HAT_NAME`. The card's `HAT_LABEL` gains the earned hats: `Hard hat`, `Nightcap`, `Flower crown`, `Headphones`, `Mortarboard`, `Laurel`.

**Where the worn hat shows:**
- **The band:** in place of the rolled hat. A holiday hat still covers it in the band only (Alive section 5).
- **The card:** the portrait, the text card's `Hat:` (the id), and the SVG's hat chip.
- **The dex:** the tiles and the text rows.
- **The debug tour:** unchanged; it shows its own hats.

`bones.hat` stays the rolled hat. The places above draw from `wornHat`, so the roll still says what was rolled.

## 3. Parsing and usage

**`parseSub`** gains:

| Words | Result |
|-|-|
| `feed` | feed |
| `play` | a random game |
| `play dice`, `play coin`, `play rps` | that game |
| `play rock`, `play paper`, `play scissors` | `rps` with that throw |
| `play heads`, `play tails` | `coin` with that call |
| `play rps <throw>`, `play coin <call>` | that game with that pick |
| `rename <word> …` | a rename, with everything after `rename` as typed; `validName` refuses more than one word |
| `rename` alone | usage |
| `hat` | the list |
| `hat <words> …` | that hat, the words joined and lower-cased |
| `play` with a word it doesn't know, a pick that doesn't fit its game, or more words | usage |

Game and pick words match in any case. `USAGE` and the argument hint become:
```
Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]
```

## 4. The rubber duck

**The trigger.** When a main turn ends, `duckDue(prevFails, thisTurn)` in `duck.ts` returns the tool to nudge about, with its count, or null:
- `thisTurn` is the turn's failed calls by tool name, from `failedTools`. A denied call never ran, and a subagent's calls never reach the buddy, so neither counts, as today.
- A tool is due when it failed at least once in this turn and at least 3 times across this turn and the one before.
- Of the tools due, the one with the most failures wins; on a tie, the one that failed last in this turn.

`prevFails` then becomes this turn's failures, or `{}` after a nudge, so the same failures never nudge twice.

**When it fires.** Only when all hold:
- the mode is `on` and no egg is out
- at least 30 minutes since `lastNudgeAt` (`NUDGE_GAP_MS`)
- no announcement is showing (Progression section 4)
- no model call is in flight

Otherwise there is no nudge this turn and nothing is called. The next turn can still be due.

**The nudge** takes the turn's reaction slot: the turn gets no quip, and a break nudge due at the same time waits for the next turn end (section 5). It sets `lastNudgeAt` and `lastQuipAt` to now before it calls, so the next quip waits out a full cooldown and a call that fails still counts toward the 30 minutes. It skips the quip cooldown itself: the turn that first failed has usually just quipped, and the cooldown would otherwise swallow almost every nudge.

It asks Haiku once, as a reaction (`ask` with `react`), with the persona and its mood and holiday lines:
```
Claude just failed {tool} {n} times over its last two turns, and the developer may be stuck.
Offer, in one line, to be their rubber duck: they can talk it through with you by starting a message with "{name},".
```
If the model doesn't answer, the bubble shows the fallback: `{n} failed {tool} calls. Want to talk it through? Start with "{name},".` A reply that aborts the call wins, and the nudge shows nothing. A nudge whose answer comes back over an announcement is dropped, as a quip is.

`{tool}` is the tool's name, with an MCP tool's `mcp__server__` prefix dropped: `Bash`, `Edit`, `create_issue`.

**Duck mode.** When the nudge's bubble shows, `duckUntil` becomes now plus 15 minutes (`DUCK_MS`) and `duckTool` the tool. While `now < duckUntil`:
- A talk's prompt carries one more line, and the talk moves `duckUntil` to 15 minutes from then:
  ```
  You're the developer's rubber duck: {tool} kept failing. Ask one short question that helps them say what they expected and what happened instead. Don't guess at a fix; you can't see their code.
  ```
- A rubber duck prop stands to the right of the buddy, in place of any holiday prop, and hides while a bubble is up, as props do (Alive section 6).

Pets, feeds and games neither use nor extend duck mode. Duck mode ends when another buddy becomes active (a hatch, reroll or swap): `adopt` sets `duckUntil` to 0 when the active seed changes. Mute doesn't end it, since talk is answered when muted.

The duck prop, a draft for the build to settle, painted yellow (`PAINT`), its first row blank:
```

    __
  >(o )__
   (  _ /
    '--'
```

## 5. Break nudges

**The stretch.** `breaks.ts` keeps a run of main turns as `{ start, lastEnd, nudgedAt }`, all in ms. When a main turn ends at `now`, its start is `now − durationMs`. `nextStretch(stretch, start, now)`:
- no stretch yet, or a gap of more than 10 minutes since `lastEnd` (`BREAK_GAP_MS`): a new stretch from this turn's start, with `nudgedAt` null
- otherwise: the same stretch, with `lastEnd` now

A subagent's turn neither extends nor breaks a stretch. The stretch lives in a module variable, so a reload starts it over.

**Due.** `breakDue(stretch, now)`: at least 90 minutes (`STRETCH_MS`) since `nudgedAt`, or since `start` before the first nudge. So the first nudge comes 90 minutes into the stretch, and another every 90 minutes after while it goes on.

**The nudge,** when due at a turn's end, and only when:
- the mode is `on` and no egg is out
- no announcement is showing
- no duck nudge took this turn (section 4)

Otherwise it stays due for the next turn end. When it fires, `nudgedAt` becomes now. Then:
- It takes the turn's reaction slot: no quip this turn.
- The buddy strikes `yawn` for `YAWN_TICKS` (4).
- It shows a canned line, with no model call. The lines take turns by `cannedCount`, with `{span}` the stretch so far:
  - `*yawn* That's {span} straight. Stretch your legs?`
  - `*yawn* {span} without a break. Water, maybe?`
  - `*yawn* Even I need a break after {span}.`
  - `*yawn* {span} in. Go look at something far away.`

`{span}` reads `95 minutes` under 2 hours (rounded down to 5), then `2 hours`, `2 and a half hours`, `3 hours`, by the half hour, rounded down.

**The yawn** is drawn with no new art: the sleep body frame (Alive section 4) with closed eyes (`-`), and the hat row as usual, with no zZ. The compact face shows the closed eyes. A yawn isn't sleep: `isAsleep` stays false. A flinch or celebrate struck during a yawn replaces it, and a yawn never cuts a flinch or celebrate short.

## 6. Turn ends, together

When a main turn ends, the reaction slot goes to the first of:
1. a duck nudge (section 4)
2. a break nudge (section 5)
3. a quip, by `shouldQuip` as today

The DEBUGGING fail line (Alive section 3) is unchanged: it speaks when a call fails, before the turn ends.

## 7. Files

| File | Change |
|-|-|
| `toys.ts` (new, pure) | `SNACKS`, `FULL_MS`, `SNACK_TICKS`, the full lines; the games, their outcomes, result lines, prompts and fallbacks; `wearable`, `wornHat`, `HAT_NAME`, hat-word matching and the hat replies |
| `duck.ts` (new, pure) | `duckDue`, `NUDGE_GAP_MS`, `DUCK_MS`, the nudge prompt and fallback, the duck talk line, the tool's shown name |
| `breaks.ts` (new, pure) | `nextStretch`, `breakDue`, `BREAK_GAP_MS`, `STRETCH_MS`, the break lines and `{span}` |
| `record.ts` | the `rename` and `hat` changes; `parseSub` and `USAGE` (section 3) |
| `voice.ts` | `validName`, shared by `parseSoul`; `talkPrompt` takes the duck line |
| `sprites.ts` | the snack and crumb art; the snack in `topRow`; the duck prop |
| `look.ts` | `Scene.snack`, the `yawn` pose, the duck prop over a holiday prop |
| `layout.ts` | the worn hat on the text card and the dex rows |
| `card.ts` | `HAT_LABEL` for every wearable; the worn hat on the card and dex SVGs |
| `register.tsx` | the four commands; `reply`'s fallback; `prevFails`, `stretch` and the turn-end order; duck mode in talk and in `adopt`; the worn hat and the snack in the band and the panes; the argument hint |
| `types/index.d.ts` | `hat?` on `Buddy`; `snack`, `lastFedAt`, `duckUntil`, `duckTool`, `lastNudgeAt` in `PluginState`; `yawn` in `pose` |
| `README.md` | the four commands in "Use"; a paragraph on the rubber duck and breaks; the nudge under model calls; `hat` in "What it saves"; "Choosing one to wear comes in a later update" replaced; this spec in "Design" |
| `plugin.json` | version 0.6.0 |

`register.tsx` still holds no game logic.

**Build order**, for the plan: `validName` and rename; hats (wearable, worn, the band, card and dex); feed; play; break nudges with the yawn; the rubber duck with duck mode and its prop; the release.

## 8. Failure handling and cost

As base section 9 and the later specs:
- A toy's reply runs on a timer (`later`); a throw costs the bubble, never the command's answer.
- `rename` and `hat` answer a refused or failed write as other commands do; a failed store write keeps the change in this session's copy, marked unsaved (Foundation section 2).
- A `hat` that is missing, not a string, unknown or unwearable reads as the rolled hat and is never shown as anything else.
- A name reaches the store only through `validName`, so it is letters only and never carries a control character.
- `duckDue` and `breakDue` never throw on empty input. A throw at a turn's end costs that turn's reaction, as today.
- The duck call is a reaction: one at a time with every other call (base section 6), dropped over an announcement, and aborted by a reply.
- The stretch, `prevFails` and the snack are lost on a reload; at worst a nudge comes later than it would have.

**Cost** (base section 10):

| Source | Rate | Each call |
|-|-|-|
| Feed, play, rename and hat replies | Person-initiated, in the talk and pet row: at most 1 per 5 s | Same as a reaction |
| Rubber-duck nudge | At most 2 an hour (30 minutes apart) | Same as a reaction |

- A full buddy, a game's result and a break nudge cost no model call.
- Duck mode adds one line to a talk's prompt, not a call.
- The command answers stay one line each; nothing new reaches the transcript past a line.

## 9. Testing

All with `claude plugin test` (base section 11).

**Pure:**
- `toys.test.ts`:
  - the snack for each roll; the "Called" words in the prompt
  - each game's outcome for fixed rolls: dice higher, lower and equal; the coin called by you and by the buddy, matched and missed; every pair of throws
  - every result line, including a throw picked for you
  - each outcome's fallbacks
  - `wearable`: rolled plus earned plus `none` in table order; a buddy that rolled none; nothing earned
  - `wornHat`: missing, `'none'`, its rolled hat, an earned hat, a hat not yet earned, another buddy's rolled hat, an unknown id and a number, each reading as section 2 says
  - hat words: case and spaces dropped; each hat reply
- `duck.test.ts`:
  - 3 failures in one turn; 2 and 1 across two turns; 2 and 0 (not due); 0 and 3 in the turn before only (not due)
  - two tools due: the most failures wins; a tie goes to the one that failed last
  - the shown name of an MCP tool
- `breaks.test.ts`:
  - a first turn starts a stretch; a 9-minute gap keeps it; an 11-minute gap starts a new one
  - due at 90 minutes and not at 89; due again 90 minutes after a nudge
  - one turn longer than 90 minutes is due at its end
  - `{span}` at 95 minutes, 2 hours, 2 and a half, and 3
- `voice.test.ts`: `validName` accepts 1 and 12 letters, refuses 13, a digit, a space and every reserved word in any case; `parseSoul` still refuses what it refused.
- `record.test.ts`:
  - `rename` on the active and a retired seed; null for an unknown seed and an unchanged name; a case-only change saved
  - `hat`: an earned hat saved; its rolled hat clears the field; `none` saved; null for a hat not earned, another buddy's rolled hat and no change; the other fields kept
  - `parseSub` for every row of section 3's table
- `sprites.test.ts`: every snack and the crumbs at most 12 columns; `topRow` puts hearts over the snack and the snack over confetti; the duck prop fits `PROP_ROWS` and `PROP_W`.
- `look.test.ts`: `yawn` draws the sleep body with `-` eyes and no zZ, and isn't asleep; the duck prop wins over a holiday prop and hides while saying.
- `layout.test.ts` and `card.test.ts`: the worn hat on the text card, the SVG chip, the dex row and tile; an earned hat's label.

**Mod-level** (`buddy.test.tsx`):
- **Feed:**
  - the snack on the hat row, then the crumbs, then the hat
  - a pet counted and a sulk eased; one model call with the snack in the prompt
  - a second feed inside 10 minutes: the full line, no count, no call; one after 10 minutes eats again
  - `off`: the hidden line
- **Play:**
  - `/buddy play rps rock` answers the result line; a buddy win strikes celebrate
  - a pet counted; one call with the result in the prompt
  - inside the 5 s floor: the game's fallback, not `cannedLine`
- **Rename:**
  - `/buddy rename Mochi` saves, answers, and replies once
  - then `Mochi, hi` goes to the buddy and `Pip, hi` goes to Claude
  - each refusal, with nothing written
- **Hat:**
  - `/buddy hat` lists; wearing an earned hat changes the band, the card and the dex
  - on a holiday the band shows the holiday hat and the card shows the worn one
  - a hat not earned is refused with its achievement's name
- **Rubber duck:**
  - 2 Bash failures, then 1 more the next turn: one nudge call with the tool and count, and no quip that turn
  - the duck prop once the nudge's bubble has gone, hidden under a later bubble, and gone when duck mode ends
  - the model not answering: the fallback line
  - a talk within 15 minutes carries the duck line and extends duck mode; one after it has run out doesn't
  - a second run of failures inside 30 minutes: no nudge; after 30: a nudge
  - `muted` and `off`: no nudge, no call
  - a swap ends duck mode
- **Breaks:**
  - turns every 5 minutes for 90 minutes: one yawn and one line, no model call, no quip that turn
  - an 11-minute gap then 89 minutes: nothing; a further 90 minutes of the first stretch: a second nudge
  - due while muted: nothing; unmuted, it fires at the next turn end
  - a duck nudge and a break due at once: the duck, then the break at the next turn end
- **Old records:** a 0.5 record with no `hat` draws its rolled hat; a record with `hat: 'laurel'` and `laurel` not earned draws the rolled hat.
- **Cost:** no test sees more `$.model.complete` calls than before this build, apart from the toys' replies and the duck nudge.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look in the terminal and the Desktop Code tab at a feed, each game, a rename, wearing an earned hat (on the band, the card and the dex), a duck nudge with the prop, and a break nudge (with its thresholds shortened for the look and then restored).
