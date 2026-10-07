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
| `/buddy card` | Its card: name, species, rarity, stats, your streak and its lifetime counts |
| `/buddy mute` / `unmute` | Stop or resume its comments (it still answers when you talk to it) |
| `/buddy off` | Hide it |
| `/buddy reroll`, then `/buddy reroll confirm` | Retire it and hatch a new one; the old one is kept |
| `<name>, how's it going?` | Talk to it. That prompt goes to the buddy, not to Claude |

## What it does with your session

A mod runs inside Claude Code with your permissions, so here is exactly what this one touches. To see its hooks and calls for yourself, run `claude plugin validate ./buddy`.

- **Model calls.** It calls Haiku on your account for three things:
  - once when it hatches
  - when you pet it or talk to it
  - for a comment after a turn, at most one every 3 minutes
- **What a turn comment sees.** Only the turn's outcome, how long it took, and which tools ran or failed. It never sees your prompt, Claude's answer, file contents or command arguments.
- **Prompts addressed to it.** A prompt that starts with the buddy's name and a comma or colon (`Pip, hi`) is dropped before it reaches Claude, and the buddy answers it. Prompts that carry an attachment always go to Claude.
- **What it saves.** One record in the mod's own store. For each buddy you've had: its seed, name, personality, hatch date, the time it was retired, and lifetime counts of turns, failed turns, longest turn, tool calls by kind, failed calls, pets and talks. Then the mode (on, muted or off), the reroll count, and your streak: the last day you visited, your current and best streak, and the days you've visited. Never prompt text, answers, file contents or command arguments.
- **Upgrading.** The record is now schema 2, and the first save after the update converts an older one. A session still open on 0.1.x doesn't know schema 2 and answers `Saved buddy uses schema 2; this mod knows 1.` until you reload it with `/reload-plugins`.

## Develop

The mod lives in `buddy/`. To run its tests:

```bash
claude plugin test ./buddy
```

## Design

[`docs/specs/2026-10-07-buddy-mod-design.md`](docs/specs/2026-10-07-buddy-mod-design.md) is the design spec, and [`docs/specs/2026-10-07-buddy-mod-plan.md`](docs/specs/2026-10-07-buddy-mod-plan.md) is the test-driven plan the mod was built from. The saved record, counts and streak come from [`docs/specs/2026-10-07-buddy-foundation-design.md`](docs/specs/2026-10-07-buddy-foundation-design.md) and its plan, [`docs/specs/2026-10-07-buddy-foundation-plan.md`](docs/specs/2026-10-07-buddy-foundation-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
