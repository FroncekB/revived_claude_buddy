# `buddy` Alive — Design Spec

**Status:** built 2026-10-07; live-checked 2026-10-08. Plan: [`2026-10-07-buddy-alive-plan.md`](2026-10-07-buddy-alive-plan.md); its "Deliberate deviations" section lists ten small departures from this spec.
**Author:** Brandon Froncek + Claude
**Date:** 2026-10-07
**Builds on:** [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md) (the base spec) and [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md) (Foundation). Section numbers below that start with "base" or "Foundation" point there.
**Issues:** #6 mood, #7 stats that change behavior, #8 reaction animations, #9 calendar. Roadmap: #18.

## Purpose

Sub-project B of five. It makes the buddy feel alive without a single new model call:
- a **mood** that session events move and that is saved on each buddy
- **stats that change behavior**: how often it quips, how long it waits, whether it speaks up when a tool fails, which canned lines it reaches for
- drawn **reaction frames** for every species: flinch, celebrate, sleep
- a **calendar**: sleep at night, a hat and a prop for holidays, and a party hat on its hatch day

Rules kept from the roadmap:
- New saved data goes in optional fields, so the schema stays at 2.
- The buddy never sees prompt text, answers, file contents or command arguments, except a prompt addressed to it by name. Mood is moved by outcomes only: failed calls, turn reasons, durations, pets, talks and visit days.
- Reactions stay within the base spec's cost table (base section 10).

**Not here:** the journal (C), XP, achievements and the dex (D), nudges and toys (E). The card does not show mood, poses or holidays.

## 1. Saved data and session state

**One new optional field on each `buddies` entry** (Foundation section 1):
```ts
type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  mood?: Mood                 // missing reads as neutral
}

type Mood = {
  meter: number               // -6..6: below zero leans anxious, above zero leans smug
  sulk: number                // 0..3
  at: string                  // ISO time decay is measured from
}
```
The schema stays at 2. A record written before this build has no `mood` on any entry, which reads as `{ meter: 0, sulk: 0 }`. As Foundation section 1 requires, a commit changes only the fields it names, so a `mood` written by this build survives a write from a 0.2.x session.

**`$.state`, plugin `buddy`**, new keys (survive a hot reload, not a session):

| Key | Type | Meaning |
|-|-|-|
| `pose` | `{ kind: 'flinch' \| 'celebrate'; untilTick: number } \| null` | A reaction pose, shown while `tick < untilTick` |
| `lastActiveTick` | `number` | The tick of the last activity (section 4), for idle sleep |
| `pendingMood` | `Record<string, MoodEvent[]>` | Mood events not yet saved, by buddy seed |

Module variable (lost on reload, which is acceptable): whether the current main turn has had its DEBUGGING line (section 3).

## 2. Mood

**Events.** Main-conversation events only (`agentId` unset). Nothing is queued with no record, while hatching, when mode is `off`, or when the record is damaged or foreign. Mode `muted` queues as normal.

```ts
type MoodEvent = 'fail' | 'clean' | 'longClean' | 'soothe'
```

| Happening | Event | Effect when replayed |
|-|-|-|
| A tool call that ran and has `isError` | `fail` | `meter - 1` |
| A `turn.complete` whose `reason` is `error` or `aborted` | `fail` | `meter - 1` |
| A `turn.complete` whose `reason` is `answer`, with no failed calls, `durationMs <= 120_000` | `clean` | `meter + 1` only while `meter < 0` |
| The same, with `durationMs > 120_000` (base `LONG_TURN_MS`) | `longClean` | `meter + 1` |
| `/buddy pet`, or a talk | `soothe` | `sulk - 1` |

`meter` is clamped to `-6..6` and `sulk` to `0..3`. A turn with reason `refusal` queues nothing. A failed turn that also had failed calls queues one `fail` per failed call plus one for the turn.

**The sulk** is set inside the visit rule (Foundation section 3), which runs at `session.start` and inside every flush. When the visit lands on a new day, `you.lastDay` is not null, and the days missed in between (`daysBetween(lastDay, today) - 1`) are 2 or more, the active buddy's `sulk = max(sulk, min(3, missed - 1))`. Friday to Monday misses 2 days and gives sulk 1; a week away gives 3. `daysBetween` counts calendar days on `Date.UTC` of the two dates, so daylight saving can't move it.

**Decay** (`decayMood(mood, now)`, pure). Every 30 minutes since `at`, `meter` and `sulk` each move one step toward zero, and a single gap counts for at most 2 hours (4 steps):
```
elapsed = now - at
steps   = floor(min(elapsed, 2 h) / 30 min)
meter, sulk move `steps` toward 0
at      = elapsed > 2 h ? now : at + steps * 30 min
```
`at` moves by whole steps, so a commit every 29 minutes can't stop decay. The cap means a buddy left at −6 at 11pm comes back at −2 the next morning.

**A neutral mood's clock restarts.** When an event or a sulk moves a mood whose `meter` and `sulk` are both 0 (after decay), `at` becomes `now`, so time spent neutral never shortens the next mood.

**Applying events** (`applyMood(mood, events, now)`, pure): decay to `now`, then replay the events in order. Order matters: a `clean` after a `fail` eases the anxiety the `fail` caused.

**Pending events.** The `tool.call`, `turn.complete`, pet and talk hooks push onto `pendingMood[seed of the active buddy]`, keeping the last 20 per seed. A flush takes `pendingMood` with `pending` and clears both. If its commit fails before the result reaches `$.state`, the events go back in front of any queued since, as counts do (Foundation section 2).

**The flush change** grows a field:
```ts
| { kind: 'flush'; pending: Readonly<Record<string, Counts>>; mood: Readonly<Record<string, MoodEvent[]>> }
```
`applyChange` applies each seed's events to the entry with that seed, sets that entry's `mood`, and drops events for a seed with no entry. Events from another session were already applied to the stored mood by that session's flush, so this one's replay builds on them.

**How it reads** (`moodOf(mood, now)`, after decay):

| Condition | Mood |
|-|-|
| `sulk >= 1` | sulky (wins) |
| `meter <= -2` | anxious |
| `meter >= 2` | smug |
| otherwise | neutral |

**What a session shows** is the stored mood of the active buddy with that seed's `pendingMood` applied, decayed to now. So anxiety rises as tools fail mid-turn, before the turn's flush.

**Mood eyes** replace the rolled eye in the full sprite and the compact face, and are none of the rolled eyes (base section 2):

| Mood | Eye | Duck | Cat |
|-|-|-|-|
| anxious | `;` | `<(; )___` | `( ;  ; )` |
| smug | `¬` | `<(¬ )___` | `( ¬  ¬ )` |
| sulky | `=` | `<(= )___` | `( =  = )` |

**Persona prompt.** `personaSystem` (base section 6) gets one more line when the mood isn't neutral:
- anxious: `Mood: anxious, after a run of failures. Let it color the line.`
- smug: `Mood: smug, after some long clean turns. Let it color the line.`
- sulky: `Mood: sulky, the developer stayed away for days. Let it color the line.`

A reroll's new buddy starts neutral. A retired buddy keeps its `mood`.

## 3. Stats that change behavior

| Stat | Changes | Curve | At 1 / 50 / 100 |
|-|-|-|-|
| CHAOS | the chance of a quip after a turn that isn't notable (was `QUIP_CHANCE` 0.25) | `0.15 + 0.25 * CHAOS / 100` | 0.1525 / 0.275 / 0.40 |
| PATIENCE | the quip cooldown (was `QUIP_COOLDOWN_MS` 180 s) | `180_000 + 1_800 * PATIENCE` ms | 181.8 s / 270 s / 360 s |
| DEBUGGING | the chance of a canned line the moment a tool fails | `DEBUGGING / 100` | 0.01 / 0.50 / 1.00 |
| SNARK | the chance a canned line comes from the snarky pool | `SNARK / 100` | 0.01 / 0.50 / 1.00 |

`shouldQuip` takes the bones' stats in place of the two constants. A notable turn (base section 6) still speaks whenever the cooldown allows. The cooldown is never shorter than 3 minutes, so model-backed reactions stay at 20 an hour at most.

**DEBUGGING's line.** On a main-conversation tool call that ran and has `isError`, a canned line shows at once (`showBubble`) when all of these hold:
- mode is `on`
- no bubble is showing
- this turn hasn't had one yet
- `roll < DEBUGGING / 100`

There is no model call, and `lastQuipAt` is untouched, so the turn-end quip still follows `shouldQuip`. The line comes from a new failure pool in `voice.ts` with a plain half (`That one didn't take.`) and a snarky half (`Red text. Bold choice.`), four lines each.

**SNARK's pool.** Every canned line rolls `roll < SNARK / 100`:
- talk and pet fallbacks (base section 9): a pass takes the `SNARK` pool, otherwise the peak stat's pool as today
- DEBUGGING lines: a pass takes the snarky half, otherwise the plain half

A buddy whose peak is SNARK draws from the `SNARK` pool either way, as today. The streak greeting (Foundation section 4) is unchanged.

**Rolls** come from `Math.random()` in `register.tsx` and are passed into the pure functions, as `shouldQuip` gets its roll today.

## 4. Poses: flinch, celebrate, sleep

**Art.** Each species' entry in `ART` (base section 8) grows from two sections to five, separated by `~` lines: rest, fidget B, flinch, celebrate, sleep. Each new frame has 4 body rows, at most 12 columns once its eyes are filled, and at least one `{E}`. Each pose fills `{E}` with its own eye:

| Pose | Eye |
|-|-|
| flinch | `O` |
| celebrate | `^` |
| sleep | `-` |

The duck, with its top row:
```
flinch           celebrate         sleep
                 *  .  *  .                zZ
    __  !         \ __
  <(O )___        <(^ )___/          __
  \( ._> /\        ( ._> /         <(- )____
    '---'           '---'           (_.__>_/
```
The 54 frames are drawn in the plan, a batch of species at a time.

**Triggers** (main conversation only):

| Pose | Starts on | Length | Top row |
|-|-|-|-|
| flinch | a tool call that ran and has `isError`, or a `turn.complete` with reason `error` | 4 ticks; a new failure restarts it | unchanged |
| celebrate | a `longClean` turn (section 2) | 6 ticks | confetti: ` *  .  *  . ` and ` .  *  .  * `, alternating each tick |
| sleep | idle for 1,200 ticks (10 min) by day, or 120 ticks (1 min) at night (section 5) | until activity | `z`, `zZ`, `zZz`, right-aligned, a step every 2 ticks |

A flinch replaces a celebrate, and a celebrate never replaces a flinch.

**Activity** sets `lastActiveTick` to the current tick: `prompt.submit`, `tool.call`, `turn.complete`, and any `/buddy` command. Idle time is counted in ticks, so it needs no clock calls.

**Sleep does not show** while a pose is up, a bubble is showing, hearts are showing, or the egg is out. It returns once they end, if the buddy is still idle.

**Mode.** Poses and sleep show when `on` or `muted`, since they aren't speech. When `off` nothing is drawn (base section 8).

## 5. Calendar

`calendar.ts` (pure) takes clock milliseconds and the soul's `hatchedAt` and returns `{ holiday: Holiday | null; night: boolean }`. Dates are local (`localDay` from `ledger.ts`).

**Night** is local hours 00:00 to 05:59. It shortens the idle time before sleep (section 4) and does nothing else.

**Holidays.** Ranges include both ends.

| Holiday | Dates | Hat | Prop |
|-|-|-|-|
| New Year | Dec 31 – Jan 1 | top hat with sparkles | fireworks |
| MLK Day | 3rd Monday of January | rolled hat stays | dove |
| Presidents' Day | 3rd Monday of February | stovepipe | none |
| Easter | Easter Sunday (anonymous Gregorian algorithm) | bunny ears | basket of eggs |
| April Fools | Apr 1 | jester hat | none |
| Memorial Day | last Monday of May | rolled hat stays | poppy |
| Juneteenth | Jun 19 | rolled hat stays | Juneteenth flag |
| Independence Day | Jul 4 | striped top hat | US flag |
| Labor Day | 1st Monday of September | hard hat | none |
| Columbus / Indigenous Peoples' Day | 2nd Monday of October | rolled hat stays | autumn leaf |
| Halloween | Oct 25–31 | witch hat | jack-o'-lantern |
| Veterans Day | Nov 11 | rolled hat stays | small flag |
| Thanksgiving | 4th Thursday of November | pilgrim hat | turkey |
| Winter holidays | Dec 20–26 | Santa hat | tree |
| Hatch day | each anniversary of the local date of `soul.hatchedAt`, from year 1 | party hat | cake |

- The quieter days (MLK, Memorial, Juneteenth, Columbus / Indigenous Peoples', Veterans) keep the buddy's own hat and add only a small prop. Columbus / Indigenous Peoples' Day gets a neutral autumn leaf, since its name is contested.
- **Overlaps.** Hatch day wins over any holiday. Easter and April Fools are the only pair that can share a date (2029-04-01); Easter wins.
- A Feb 29 hatch day falls on Feb 28 in other years.
- A holiday hat replaces the rolled hat, at every rarity, so a common gets one. The card keeps the rolled hat.

**Holiday hats** are 12 columns, like the rolled hats (base section 8), and go in `sprites.ts`.

**Props** (`sprites.ts`):
```ts
type Prop = { art: string[]; paint?: string[] }
```
- At most 5 rows and 10 columns. Row 0 lines up with the sprite's top row.
- `paint` is an optional color mask: one string per art row, the same width. `r y g c b m` pick red, yellow, green, cyan, blue and magenta from the palette in `svg.ts`; a space means the text color.
- The US flag gets a blue canton and red stripes; the jack-o'-lantern is yellow.

**Persona prompt.** On a holiday, one more line: `Today is Halloween.` On a hatch day: `Today is your hatch day: you are 2 years old.` (`1 year old` for the first).

Nothing here is saved.

## 6. Drawing

**`look.ts`** (new, pure) is the one function that decides what the band shows. It takes the bones, the tick, the mood, the pose, the ticks since `lastActiveTick`, the night flag, the holiday, the hearts tick and whether a bubble is showing, and returns the sprite rows, the compact face and the prop. `buddyLook` in `register.tsx` keeps only the reads from state.

**Which effect wins:**

| Part | In order, first that applies |
|-|-|
| Body frame | pose (flinch, then celebrate), sleep, the fidget cycle (base section 8) |
| Eyes | the pose's eye, the blink, the mood eye, the rolled eye |
| Top row | hearts, confetti, `zZ`, the holiday or hatch-day hat, the rolled hat, the shiny sparkle |

**Prop.** Shown to the right of the sprite, after a 2-column gap, only while no bubble is showing and only in the full layout. The full layout needs 44 columns and a prop needs 24, so it always fits. `bandRows` returns the right-hand column as colored runs (`{ text, color }[]` per row) so a painted prop and the bubble share one shape:
- **Terminal:** one `Text` per run.
- **Desktop:** one `tspan` per run in `bandSvg`, with the existing light and dark fills.

**Compact layout** (base section 8): the face takes the same eye as the full sprite. Asleep, it gets ` zZ` after it: `<(-) zZ  Pip`. Props and hats never show in compact.

**The card** (`/buddy card`, every form) draws the buddy as it rolled: the rest frame, its rolled eye, its rolled hat. No pose, sleep, mood or holiday.

The night flag and the holiday come from one `$.clock.now()` read per band draw.

## 7. Debug tour

`/buddy debug` (base section 4) shows the new art. It still never writes the store.

| Phase | Steps | Ticks each | Name line |
|-|-|-|-|
| Species | 18 | 28: plain (0–7), shiny (8–15), flinch (16–19), celebrate (20–23), asleep (24–27) | `tour 3/18` |
| Decorations | 15: each holiday, then hatch day, on the real buddy | 8 | `tour: Halloween` |
| Moods | 3: anxious, smug, sulky, on the real buddy | 4 | `tour: anxious` |

In the species phase, the poses use the step's plain look. The tour runs 636 ticks, about 5½ minutes. It still ends by itself, on `/buddy debug off`, or on a hatch. Its reply line becomes `Touring all 18 species with their reactions, then the holidays and moods. Run /buddy debug off to stop.`

## 8. Files

| File | Change |
|-|-|
| `mood.ts` (new, pure) | `MoodEvent`, `neutralMood`, `decayMood`, `applyMood`, `sulkFor(lastDay, today)`, `moodOf`, `MOOD_EYE`, `moodLine` |
| `calendar.ts` (new, pure) | `easter(year)`, `nthWeekday`, `lastWeekday`, `holidayOn(day, hatchedAt)`, `isNight(ms)`, `dayInfo(ms, hatchedAt)`, `holidayLine` |
| `look.ts` (new, pure) | `look(...)`: frame, eyes, top row, face and prop by the rules in section 6 |
| `ledger.ts` | `daysBetween(a, b)` |
| `record.ts` | `flush` applies mood events; the visit rule sets the sulk, in both `visit` and `flush` |
| `roll.ts` | unchanged |
| `sprites.ts` | flinch, celebrate and sleep sections in every `ART` entry; pose eyes; confetti and `zZ` rows; holiday hats; props |
| `voice.ts` | `quipChance`, `quipCooldownMs`, `shouldQuip` on stats; `shouldFlag` and the failure pool; the SNARK pick in `cannedLine`; mood and holiday lines in `personaSystem` |
| `layout.ts` | the prop column; `bandRows` returns colored runs |
| `svg.ts` | `tspan` runs for the right-hand column |
| `tour.ts` | the three phases |
| `register.tsx` | the new state keys; mood events and poses from the existing hooks; activity ticks; the DEBUGGING line; the clock read in the band's render |
| `types/index.d.ts` | `Mood`, `MoodEvent`, `mood?` on `Buddy`; `pose`, `lastActiveTick`, `pendingMood` in `PluginState` |
| `README.md` | mood in "What it saves"; a short paragraph on moods, reactions and holidays |
| `plugin.json` | version 0.3.0 |

`register.tsx` still holds no game logic.

## 9. Failure handling and cost

As base section 9 and Foundation section 6:
- A throw in `look.ts`, `calendar.ts` or `mood.ts` during a draw falls back to `next(e)` through the render hook's `try`/`catch`.
- `tool.call` returns `next`'s result unchanged, even when queuing a mood event, starting a flinch or showing a DEBUGGING line throws.
- A flush that fails before it adopts puts the mood events back into `pendingMood`.

**Cost:**
- No new model calls.
- Reactions stay at 20 an hour at most (section 3).
- The mood and holiday lines add about 20 tokens to the persona prompt when present.
- DEBUGGING lines are canned.

## 10. Testing

All with `claude plugin test` (base section 11).

**Pure:**
- `mood.test.ts`:
  - each event row in section 2, and the clamps at ±6 and 0–3
  - decay: one step per 30 min, at most 4 steps for one gap, `at` moving by whole steps, `at = now` past the cap
  - a neutral mood's clock restarting at the event that moves it
  - `moodOf` at each threshold, with sulk winning
  - replay order: `fail` then `clean` ends at 0
  - `sulkFor`: no sulk for a first visit, yesterday, or 1 missed day; 1 for Friday to Monday; 3 for a week
- `calendar.test.ts`:
  - every holiday in 2026 and 2027, by its rule: MLK 2026-01-19 and 2027-01-18; Presidents' 2026-02-16; Easter 2026-04-05 and 2027-03-28; Memorial 2026-05-25 and 2027-05-31 (a May with five Mondays); Labor 2026-09-07; Columbus 2026-10-12; Thanksgiving 2026-11-26
  - Easter beating April Fools on 2029-04-01
  - both ends of each range, and New Year from 2026-12-31 to 2027-01-01
  - hatch day: not on the hatch date, yes a year later, beating a holiday, Feb 29 to Feb 28
  - night: 00:00 and 05:59 in, 06:00 and 23:59 out
- `sprites.test.ts`:
  - every species × flinch, celebrate and sleep × its pose eye: 4 body rows, at most 12 columns, at least one `{E}`
  - holiday hats at most 12 columns
  - every prop within 5 × 10, with `paint` rows the same width as `art` and only `r y g c b m` or spaces
- `look.test.ts`:
  - each row of the section 6 table
  - sleep at 1,200 ticks by day and 120 at night, and not while a pose, bubble or hearts are up
  - the prop only with no bubble
  - the card look ignoring pose, sleep, mood and holiday
- `voice.test.ts`:
  - the four curves at 1, 50 and 100
  - `shouldQuip` with the stat-driven chance and cooldown
  - `shouldFlag` across mode, bubble, once-per-turn and the roll
  - the SNARK pick for talk fallbacks and for failure lines
  - `personaSystem` with and without the mood and holiday lines
- `layout.test.ts`: the prop column's gap and width, never in compact, and paint splitting into runs.
- `record.test.ts`:
  - `flush` applies mood events to the right entry and drops an unknown seed
  - `visit` and `flush` set the sulk on a new day after a gap
  - a missing `mood` reads as neutral; unknown fields are kept
- `tour.test.ts`: each phase's steps, ticks and name line, and the total of 636 ticks.

**Mod-level** (`buddy.test.tsx`):
- **Mood and poses:**
  - a failed Bash call shows the flinch frame
  - two failed turns show the anxious eye, and the flush saves `mood` on the active buddy's entry
  - a long clean turn shows the celebrate frame and confetti
  - another session's mood written to the store mid-turn survives this session's flush
- **Sleep:**
  - 1,200 ticks without activity show the sleep frame, and a prompt wakes it
  - with the clock at 00:30, 120 ticks are enough
- **Calendar:**
  - with the clock on Jul 4, the band shows the flag prop with no bubble and the bubble without it
  - the card keeps the rolled hat
- **Stats:**
  - a seed with DEBUGGING 100 shows one failure line per failing turn, and none when muted
  - no test sees more `$.model.complete` calls than before this build
- **Old records:** a stored record with no `mood` loads, reads neutral, and gains `mood` at the first flush with events.
- **Tour:** the debug tour adds no store writes.

**Checks before done:** `claude plugin validate`, `tsc`, then a live look in the terminal and the Desktop Code tab: a flinch (a failing command), a celebrate (a turn over 2 minutes), sleep, a mood eye, and every holiday's hat and prop through the debug tour's decorations phase.
