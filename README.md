# buddy

A Claude Code mod that brings back the April Fools 2026 `/buddy` companion. It's an ASCII creature that lives above your prompt. Its species, rarity, stats, hat and eyes are rolled from a seed, and Claude (Haiku) writes its name and personality when it hatches. It comments on your turns now and then, and answers when you talk to it by name.

The sprites are original art drawn in the original's format, not copies.

## Requirements

- **Terminal:** Claude Code 2.1.287 or later. Check with `claude --version`; update with `claude update`.
- **Desktop app:** the Code tab, Claude Code 2.1.286 or later. Check with `/status` in a session.
- **Where it draws:** the buddy only appears in the terminal and the Desktop Code tab. The VS Code panel and `claude -p` run its hooks but show nothing.

## Install

```bash
claude plugin marketplace add FroncekB/revived_claude_buddy
claude plugin install buddy@buddy-mods
```

Then start a new session, or run `/reload-plugins` in an open one.

To install from a local copy of this repo instead, run `claude plugin marketplace add /path/to/revived_claude_buddy`.

## Use

| Command | What it does |
|-|-|
| `/buddy` | Hatch your buddy, or bring it back after `off` |
| `/buddy pet` | Hearts, then a reply |
| `/buddy card [who]` | Its card: name, species, rarity, level, stats, your streak, its lifetime counts and your achievements. Name a buddy from the dex, or give its number, to see that one's |
| `/buddy journal [who]` | The moments it remembers, newest first, or another buddy's from the dex |
| `/buddy dex` | Every buddy you've had, with its level and when it was with you |
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
| `/buddy mute` / `unmute` | Stop or resume its comments (it still answers when you talk to it) |
| `/buddy off` | Hide it |
| `/buddy reroll`, then `/buddy reroll confirm` | Retire it and hatch a new one; the old one is kept |
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |

It has moods. A run of failed tools makes it anxious, long clean turns make it smug, and days away make it sulk until you pet it, talk to it, or give it some time. It flinches when a tool fails, celebrates a long clean turn, and dozes off when left alone, sooner after midnight. On US federal holidays, Easter, April Fools' Day, Halloween week and its own hatch day, it dresses for the occasion. Its stats change how it acts: CHAOS makes it chattier, PATIENCE makes it wait longer between comments, DEBUGGING makes it speak up the moment a tool fails, SNARK sharpens its canned lines, and WISDOM makes it bring up old memories.

It keeps a journal of up to 20 moments: its longest turn, its worst run of failed tool calls, its busiest turn, the 100th, 1,000th and 10,000th turn and the 1,000th, 10,000th and 100,000th tool call, a clean turn after a rough patch, you coming back after days away, and growing up. A comment after a turn like one it remembers calls back to it ("remember when Claude failed 18 shell commands in a row?"), and when you talk to it, it can bring them up.

It grows up as you work together. Turns, tool calls, rough turns it sat through, pets and talks earn it XP, and its level shows on its name line and its card. It hatches small, grows into an adult at level 10 and an elder at level 30, and each level lifts its weaker stats a little, so a buddy that never spoke up when a tool failed may start to. Seventeen achievements mark what you've done across every buddy you've had, like 500 shell commands, a 30-minute turn or a 30-day streak, and six of them unlock a hat no roll gives. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.

## What it does with your session

A mod runs inside Claude Code with your permissions, so here is exactly what this one touches. To see its hooks and calls for yourself, run `claude plugin validate ./buddy`.

- **Model calls.** It calls Haiku on your account for three things:
  - once when it hatches
  - when you pet it or talk to it
  - once when a swap brings a buddy back, to say hello
  - for a comment after a turn, at most one every 3 minutes (longer for a patient buddy)

  Moods, reactions, holidays, the journal, levels, achievements and the line it says when a tool fails need no model call.
- **What a turn comment sees.** Only the turn's outcome, how long it took, which tools ran or failed, the buddy's mood, whether today is a holiday or its hatch day, and now and then one of its journal moments. It never sees your prompt, Claude's answer, file contents or command arguments.
- **Prompts addressed to it.** A prompt that starts with the buddy's name and a comma or colon (`Pip, hi`) is dropped before it reaches Claude, and the buddy answers it. Prompts that carry an attachment always go to Claude.
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks, its mood (two small numbers and when they last moved), its three other bests (the longest run of failed calls, the most calls in one turn and the longest rough stretch a clean turn ended), and its journal (up to 20 moments, each a kind, a number and a time, plus the tool group of a run of failed calls). Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited, and the achievements you've earned, each with when you earned it. Its XP, level and stage aren't saved: they're worked out from its counts. Never prompt text, answers, file contents or command arguments.
- **Upgrading.** The record is now schema 2, and the first save after the update converts an older one. A session still open on 0.1.x doesn't know schema 2 and answers `Saved buddy uses schema 2; this mod knows 1.` until you reload it with `/reload-plugins`.

## Develop

The mod lives in `buddy/`. To run its tests:

```bash
claude plugin test ./buddy
```

## Design

[`docs/specs/2026-10-07-buddy-mod-design.md`](docs/specs/2026-10-07-buddy-mod-design.md) is the design spec, and [`docs/specs/2026-10-07-buddy-mod-plan.md`](docs/specs/2026-10-07-buddy-mod-plan.md) is the test-driven plan the mod was built from. The saved record, counts and streak come from [`docs/specs/2026-10-07-buddy-foundation-design.md`](docs/specs/2026-10-07-buddy-foundation-design.md) and its plan, [`docs/specs/2026-10-07-buddy-foundation-plan.md`](docs/specs/2026-10-07-buddy-foundation-plan.md). Moods, stats that change behavior, reactions and the calendar come from [`docs/specs/2026-10-07-buddy-alive-design.md`](docs/specs/2026-10-07-buddy-alive-design.md) and its plan, [`docs/specs/2026-10-07-buddy-alive-plan.md`](docs/specs/2026-10-07-buddy-alive-plan.md). The journal comes from [`docs/specs/2026-10-08-buddy-memory-design.md`](docs/specs/2026-10-08-buddy-memory-design.md) and its plan, [`docs/specs/2026-10-08-buddy-memory-plan.md`](docs/specs/2026-10-08-buddy-memory-plan.md). Levels, achievements, evolution and the dex come from [`docs/specs/2026-10-08-buddy-progression-design.md`](docs/specs/2026-10-08-buddy-progression-design.md) and its plan, [`docs/specs/2026-10-08-buddy-progression-plan.md`](docs/specs/2026-10-08-buddy-progression-plan.md), and [`docs/art/stages.txt`](docs/art/stages.txt) shows every species at every stage. These are point-in-time records: each spec's status line lists what changed during its build.
