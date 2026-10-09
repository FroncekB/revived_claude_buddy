# `buddy` Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the buddy things to do with you and a sense of how you're doing: `/buddy feed`, `/buddy play`, `/buddy rename` and `/buddy hat`; a rubber-duck offer when one tool keeps failing, with rubber-duck talk after it; and a yawn and a break suggestion after 90 minutes of turns.

**Architecture:** Three new pure modules carry the rules:
- `toys.ts`: names, hats you can wear, snacks and fullness, and the three games, each with what the command answers and what the buddy is told.
- `duck.ts`: when a tool's failures make a nudge due, when one may be said, and the offer, its fallback and the duck line a talk carries.
- `breaks.ts`: the stretch of turns, when a break is due, and the break lines.

`record.ts` gains the `rename` and `hat` changes and the new subcommands. `sprites.ts` and `look.ts` draw the snack, the yawn and the duck prop. `layout.ts` and `card.ts` draw the worn hat. `register.tsx` stays wiring only: the four commands, a fallback for replies, the turn end's one reaction slot (duck, then break, then quip), duck mode in talks, and the worn hat and snack in the band and panes.

**Tech Stack:** Claude Code mods API (function hooks, TypeScript/TSX, the `claude-code` and `claude-code/testing` modules), the desktop app's bundled Claude Code (2.1.293 when this was written) for `claude plugin test` and `claude plugin validate`, and TypeScript 5.6 via `npx` for the type-check.

**Spec:** [`2026-10-08-buddy-interaction-design.md`](2026-10-08-buddy-interaction-design.md), which builds on the base spec [`2026-10-07-buddy-mod-design.md`](2026-10-07-buddy-mod-design.md), Foundation [`2026-10-07-buddy-foundation-design.md`](2026-10-07-buddy-foundation-design.md), Alive [`2026-10-07-buddy-alive-design.md`](2026-10-07-buddy-alive-design.md), Memory [`2026-10-08-buddy-memory-design.md`](2026-10-08-buddy-memory-design.md) and Progression [`2026-10-08-buddy-progression-design.md`](2026-10-08-buddy-progression-design.md).

**Starting point:** branch `claude/roadmap-d-e-3b6189` at the spec commit `7946991`, on top of `main` at `31ba836`. 323 tests pass.

**Checked before handoff:** the code blocks below were taken out of this file and applied to a fresh copy of the repo at `7946991`, task by task and tests first. Each Step 2 failed as described, each Step 4 reached its stated pass count, and the result type-checks and validates.

## Global Constraints

- **Mod folder:** `buddy/` in this repo. Run every command from the repo root.
- **Shell:** Git Bash. Every command block that runs Claude Code starts with this line:
  ```bash
  CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
  ```
  `$CC` is the desktop app's bundled Claude Code. The `claude` on PATH has no `plugin test` command. Never use it for this mod.
- **Edits are find-and-replace.** Each "replace" below quotes the exact current text, as it stands after the earlier tasks. If a quoted block isn't found, the file has moved on since this plan was written. Stop and re-read the file; don't force the edit. "Append" adds a blank line, then the block, at the end of the file.
- **Tests first.** Each task's Step 1 edits only test files and Step 3 only the rest, so Step 2 sees the tests fail before the code exists.
- **Line endings:** LF. Write files with the editor tools or Node's `fs.writeFileSync`, never a Python `write_text` on Windows, which writes CRLF.
- **`$` stays in `register.tsx`.** The validator follows `$` only into functions declared at the top level of the same file. Pure files never take `$`.
- **State refs are literals:** `atom({ plugin: 'buddy', key: '<literal>' } as const, initial)`, and every key is declared in `PluginState` in `buddy/types/index.d.ts`.
- **Tests find elements by text or type, never by `key`.** In the band, only sprite rows may set `bold`.
- **No Node or DOM in the mod.** `crypto.randomUUID`, `Math.random`, `Date`, `AbortController` and `JSON` are available.
- **`noUncheckedIndexedAccess` is on.** An indexed read is `T | undefined`, so use `!` only where the index is provably in range.
- **Every hook catches its own errors** and lets the event continue. Work started from a hook goes through `later`, so a tool result or a turn never waits on a state write.
- **Model calls:** the toys' replies go through `reply`, with its 5 s floor and a fallback of their own. The rubber-duck offer is a reaction (`ask` with `react`), at most once in 30 minutes. Haiku calls keep model `haiku`, `timeoutMs: 8000`, `maxTokens: 80`. `shouldQuip` is unchanged. A full buddy, a game's result and a break nudge call no model.
- **Privacy:** nothing new reads prompt text, answers, file contents or command arguments. The offer sees a tool's name and how often it failed, as a quip already does; a name given with `rename` has passed `validName`.
- **Forward compatibility:** the schema stays at 2. Every change starts from the stored object and spreads it, so fields a newer build wrote survive. A `hat` this build can't wear is kept but drawn as the rolled hat.
- **Time zones:** tests build local times with `new Date(y, monthIndex, d, h, min)`, never from a `Z` string.
- **Numbers** (spec sections 2 to 6):

  | What | Value |
  |-|-|
  | Full | 10 minutes after a feed (`FULL_MS`) |
  | Snack | 5 ticks on the hat row (`SNACK_TICKS`), the last 2 as crumbs (`CRUMB_TICKS`) |
  | Hat row | hearts, snack, confetti, zZ, holiday hat, worn hat, sparkle: the first that applies |
  | Duck | due at 3 failures of one tool across a turn and the one before, at least 1 in this turn; 30 minutes between nudges; duck mode 15 minutes from the offer or the last talk |
  | Break | a gap of more than 10 minutes starts a new stretch; due 90 minutes in, then 90 minutes after each nudge; the yawn is 4 ticks |
  | Turn end | a duck nudge, else a break nudge, else a quip |

- **Exact text:**

  | Where | Text |
  |-|-|
  | Rename | `Pip is now Mochi.`, `A name is one word of letters, at most 12.`, `Claude starts too many prompts to be a name.`, `Pip is already its name.` |
  | Hat | `Pip is wearing a crown. It can wear: crown, flowercrown, none.`, `Pip has no hat on. It can wear: none. Achievements unlock more.`, `Pip is wearing a flower crown.`, `Pip took its hat off.`, `Earn Shell regular to unlock a hard hat.`, `Only a buddy that rolled a halo can wear one.`, `No hat called jetpack. Pip can wear: crown, flowercrown, none.` |
  | Feed | `Still full, thanks.`, `One more bite and I pop.`, `Ask me again in a bit.`; the fallback `Mm. Thanks for the cookie.` |
  | Play | `You rolled 4; Pip rolled 6. Pip wins.`, `You called heads. Tails. Pip wins.`, `Pip called tails. Heads. You win.`, `You threw rock (picked for you); Pip threw paper. Pip wins.`, `You both threw paper. A draw.` |
  | Duck | the fallback `3 failed Bash calls. Want to talk it through? Start with "Pip,".` |
  | Break | `*yawn* That's 2 hours straight. Stretch your legs?`, `*yawn* 2 hours without a break. Water, maybe?`, `*yawn* Even I need a break after 2 hours.`, `*yawn* 2 hours in. Go look at something far away.` |
  | Usage | `Usage: /buddy [pet \| feed \| play [game] \| card [who] \| journal [who] \| dex \| swap <who> \| rename <name> \| hat [hat] \| mute \| unmute \| off \| reroll [confirm]]` |

- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate deviations from the spec

1. `$.state`'s `snack` holds the snack's id (`{ kind, untilTick }`), not an index.
2. `parseSub` keeps a hat's words as typed (`{ sub: 'hat', hat: 'Flower Crown' }`), and `hatChoice` lower-cases them and drops the spaces, so a refusal names the hat as it was typed.
3. The dex's text rows draw only the face, as before, so only its tiles show the worn hat.
4. The rename replies come from `renameRefusal` in `toys.ts`, which uses `validName` from `voice.ts`.
5. A full buddy's line follows an announcement in the same bubble, as a reply does (`sayAfterNews`), instead of replacing it.
6. `nudgeDuck` tells a call that a reply cut short from one the model didn't answer by whether `lastReplyAt` moved, since `ask` returns null for both.
7. The break tests build their stretches from long turns rather than many short ones (a turn starts at its end minus its duration), which keeps the mock clock's advances, and the tests, short.
8. The 60-turn memory test now expects 58 quips. Its turns are 4 minutes apart, so they are one long stretch, and the turn ends 92 and 184 minutes in get a break nudge instead.
9. There is no separate cost test: each new mod test checks every model call it sees, and every older test still passes unchanged apart from the one above.
10. The duck prop is drawn facing left with a red beak (`<(.)__`), not as the spec's draft.

---

### Task 1: Rename, and a fallback for replies

**Files:**
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/voice.test.ts`
- Create: `buddy/hooks/toys.ts`, `buddy/hooks/toys.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `RESERVED_NAMES` from `voice.ts`; `applyChange`, `parseSub`, `Change`, `Parsed` from `record.ts`; `reply`, `commit`, `hidden` and `SAVE_FAILED` in `register.tsx`.
- Produces:
  - `validName(name: string): boolean` in `voice.ts`, now used by `parseSoul`
  - from `toys.ts`: `renameRefusal(name: string, current: string): string | null`, `renamePrompt(from: string, to: string): string`, `renameFallback(to: string): string`
  - the change `{ kind: 'rename'; seed: string; name: string }` and the parse `{ sub: 'rename'; name: string }` in `record.ts`
  - in `register.tsx`: `reply($, who, prompt, fallback?: string)`, said when the model isn't asked or doesn't answer, and `EGG = 'Wait for the egg to hatch.'`

The rename rules come out of `parseSoul` as `validName`, so hatching and renaming share them. `reply` gains a fallback here so every toy after this can pass its own.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/voice.test.ts`, replace:
```ts
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, newsLine, parseSoul, personaSystem,
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, talkPrompt, withArticle,
} from './voice'
```
with:
```ts
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, newsLine, parseSoul, personaSystem,
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, talkPrompt, validName,
  withArticle,
} from './voice'
```

In `buddy/hooks/voice.test.ts`, replace:
```ts
  expect(RESERVED_NAMES.size).toBe(29)
```
with:
```ts
  expect(RESERVED_NAMES.size).toBe(29)
  for (const name of ['P', 'Abcdefghijkl', 'mochi']) expect([name, validName(name)]).toEqual([name, true])
  for (const name of ['', 'Abcdefghijklm', 'R2D2', 'Sir Pip', 'Pip!']) {
    expect([name, validName(name)]).toEqual([name, false])
  }
  for (const word of RESERVED_NAMES) {
    expect([word, validName(word)]).toEqual([word, false])
    expect([word, validName(word.toUpperCase())]).toEqual([word, false])
  }
```

Create `buddy/hooks/toys.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { renameFallback, renamePrompt, renameRefusal } from './toys'

test('a rename is refused with its reason, or allowed, a change of case included', () => {
  expect(renameRefusal('Mochi', 'Pip')).toBeNull()
  expect(renameRefusal('pip', 'Pip')).toBeNull()
  expect(renameRefusal('Pip', 'Pip')).toBe('Pip is already its name.')
  expect(renameRefusal('Claude', 'Pip')).toBe('Claude starts too many prompts to be a name.')
  expect(renameRefusal('FIX', 'Pip')).toBe('FIX starts too many prompts to be a name.')
  expect(renameRefusal('Sir Pip', 'Pip')).toBe('A name is one word of letters, at most 12.')
  expect(renameRefusal('Abcdefghijklm', 'Pip')).toBe('A name is one word of letters, at most 12.')
  expect(renamePrompt('Pip', 'Mochi')).toBe('The developer just renamed you from Pip to Mochi. React in one line.')
  expect(renameFallback('Mochi')).toBe('Mochi. I like it.')
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(sub('swap Pip now')).toBe('usage')
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]',
  )
```
with:
```ts
  expect(sub('swap Pip now')).toBe('usage')
  expect(parseSub('rename Mochi')).toEqual({ sub: 'rename', name: 'Mochi' })
  expect(parseSub('RENAME  Sir   Pip')).toEqual({ sub: 'rename', name: 'Sir Pip' })
  expect(sub('rename')).toBe('usage')
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]',
  )
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    { kind: 'reroll', seed: 'n', soul: SOUL },
  ]
```
with:
```ts
    { kind: 'reroll', seed: 'n', soul: SOUL },
    { kind: 'rename', seed: 's', name: 'Rex' },
  ]
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(newsOf(swapped, flushed)?.earned).toEqual(['regular'])
})
```
with:
```ts
  expect(newsOf(swapped, flushed)?.earned).toEqual(['regular'])
})

test("a rename changes only that buddy's name, with no visit, and nothing when the name or seed is wrong", () => {
  const before = pair(YESTERDAY)
  const saved = applyChange(before, { kind: 'rename', seed: 'b', name: 'Mochi' }, NOON)!
  expect(saved.buddies.map(b => b.soul)).toEqual([SOUL, { ...SOUL, name: 'Mochi' }])
  expect(saved.you).toEqual(before.you)
  expect(saved.active).toBe('b')
  expect(applyChange(before, { kind: 'rename', seed: 'a', name: 'Rex' }, NOON)?.buddies[0]?.soul.name).toBe('Rex')
  expect(applyChange(before, { kind: 'rename', seed: 'b', name: 'bix' }, NOON)?.buddies[1]?.soul.name).toBe('bix')
  expect(applyChange(before, { kind: 'rename', seed: 'b', name: 'Bix' }, NOON)).toBeNull()
  expect(applyChange(before, { kind: 'rename', seed: 'gone', name: 'Rex' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'rename', seed: 'b', name: 'Rex' }, NOON)).toBeNull()
})
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
test('a rename is saved and answered, and the buddy then answers to its new name only', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  const prompts = model(on, null, 'Mochi it is.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('rename Mochi')).toBe('Pip is now Mochi.')
  await clock.settle()
  expect(activeOf(shared.row)?.soul.name).toBe('Mochi')
  expect(prompts).toEqual(['The developer just renamed you from Pip to Mochi. React in one line.'])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Mochi it is.')
  expect(await ui.find({ text: /^ {2}Mochi {2}Lv 1 / })).toBeDefined()
  expect(await $.prompt.submit({ text: 'Mochi, hi', wait: false, origin: { kind: 'composer' } })).toEqual({
    drop: '(to Mochi)',
  })
  expect(await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })).toMatchObject({
    text: 'Pip, hi',
  })
})

test('a rename the name rules refuse says why and writes nothing; a hidden buddy is not renamed', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const writes = shared.writes
  expect(await runner($)('rename Sir Pip')).toBe('A name is one word of letters, at most 12.')
  expect(await runner($)('rename claude')).toBe('claude starts too many prompts to be a name.')
  expect(await runner($)('rename Pip')).toBe('Pip is already its name.')
  expect(await runner($)('rename')).toMatch(/^Usage: /)
  await clock.settle()
  expect(shared.writes).toBe(writes)
  await runner($)('off')
  expect(await runner($)('rename Mochi')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(activeOf(shared.row)?.soul.name).toBe('Pip')
  expect(prompts).toEqual([])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. `voice.test.ts` doesn't load (`Export named 'validName' not found in module …voice.ts`), `toys.test.ts` can't find `./toys`, and the new record and mod tests fail.

- [ ] **Step 3: Write the code**

In `buddy/hooks/voice.ts`, replace:
```ts
  'hey', 'hi', 'please', 'thanks', 'wait', 'next', 'now', 'so', 'lint',
])
```
with:
```ts
  'hey', 'hi', 'please', 'thanks', 'wait', 'next', 'now', 'so', 'lint',
])

// A name a buddy can have (base spec section 5): one word, letters only, at most 12 characters,
// and not a word prompts open with. Hatching and /buddy rename both hold to it.
export function validName(name: string): boolean {
  return /^[A-Za-z]{1,12}$/.test(name) && !RESERVED_NAMES.has(name.toLowerCase())
}
```

In `buddy/hooks/voice.ts`, replace:
```ts
    if (!/^[A-Za-z]{1,12}$/.test(name) || RESERVED_NAMES.has(name.toLowerCase())) return null
```
with:
```ts
    if (!validName(name)) return null
```

Create `buddy/hooks/toys.ts`:
```ts
// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
import { RESERVED_NAMES, validName } from './voice'

// The answer to /buddy rename when `name` can't be the buddy's new name; null when it can. A
// change of case alone is a rename.
export function renameRefusal(name: string, current: string): string | null {
  if (RESERVED_NAMES.has(name.toLowerCase())) return `${name} starts too many prompts to be a name.`
  if (!validName(name)) return 'A name is one word of letters, at most 12.'
  return name === current ? `${current} is already its name.` : null
}

export function renamePrompt(from: string, to: string): string {
  return `The developer just renamed you from ${from} to ${to}. React in one line.`
}

export function renameFallback(to: string): string {
  return `${to}. I like it.`
}
```

In `buddy/hooks/record.ts`, replace:
```ts
export const USAGE =
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
export const USAGE =
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]'
```

In `buddy/hooks/record.ts`, replace:
```ts
  // A retired buddy made active again (Progression spec section 7).
  | { kind: 'swap'; seed: string }
```
with:
```ts
  // A retired buddy made active again (Progression spec section 7).
  | { kind: 'swap'; seed: string }
  // A new name for one buddy (Interaction spec section 2).
  | { kind: 'rename'; seed: string; name: string }
```

In `buddy/hooks/record.ts`, replace:
```ts
          b.seed === arrived.active ? { ...b, retiredAt } : b.seed === change.seed ? welcomeBack(b, today, now) : b,
        ),
      }
    }
  }
}
```
with:
```ts
          b.seed === arrived.active ? { ...b, retiredAt } : b.seed === change.seed ? welcomeBack(b, today, now) : b,
        ),
      }
    }
    case 'rename': {
      // No visit, as a mode change makes none: only the name moves.
      if (!saved || !saved.buddies.some(b => b.seed === change.seed && b.soul.name !== change.name)) return null
      return {
        ...saved,
        buddies: saved.buddies.map(b => (b.seed === change.seed ? { ...b, soul: { ...b.soul, name: change.name } } : b)),
      }
    }
  }
}
```

In `buddy/hooks/record.ts`, replace:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug'
```
with:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename'
```

In `buddy/hooks/record.ts`, replace:
```ts
  | { sub: 'debug'; stage?: Stage }
```
with:
```ts
  | { sub: 'debug'; stage?: Stage }
  // Everything after `rename`, as typed: validName refuses more than one word.
  | { sub: 'rename'; name: string }
```

In `buddy/hooks/record.ts`, replace:
```ts
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
```
with:
```ts
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { TOUR_STEPS, tourAt } from './tour'
```
with:
```tsx
import { TOUR_STEPS, tourAt } from './tour'
import { renameFallback, renamePrompt, renameRefusal } from './toys'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
```
with:
```tsx
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
const EGG = 'Wait for the egg to hatch.'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// Talk, pet and hello: answered even when muted, at most one model call per 5 s. A reply that
// lands on an announcement follows it in the same bubble, so a pet that earns Good friend still
// says so (Progression spec section 4).
async function reply($: EngineInterface, who: Who, prompt: string) {
  const bones = bonesFor(who)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who, bones, prompt, 'reply')
  const line = text ?? cannedLine(bones, cannedCount++, Math.random())
```
with:
```tsx
// Talk, pet, hello and the toys: answered even when muted, at most one model call per 5 s. A reply
// that lands on an announcement follows it in the same bubble, so a pet that earns Good friend
// still says so (Progression spec section 4). `fallback` is said when the model isn't asked or
// doesn't answer; without one, a canned line is.
async function reply($: EngineInterface, who: Who, prompt: string, fallback?: string) {
  const bones = bonesFor(who)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who, bones, prompt, 'reply')
  const line = text ?? fallback ?? cannedLine(bones, cannedCount++, Math.random())
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    case 'swap': {
      if (await read($, hatching)) return 'Wait for the egg to hatch.'
```
with:
```tsx
    case 'swap': {
      if (await read($, hatching)) return EGG
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
```
with:
```tsx
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
    case 'rename': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const refused = renameRefusal(parsed.name, name)
      if (refused) return refused
      const note = await commit($, { kind: 'rename', seed: buddy.seed, name: parsed.name })
      // Refused: nothing was written or adopted.
      if (note !== null && note !== SAVE_FAILED) return note
      const renamed = shownBuddy((await read($, record)) ?? saved, buddy.seed)
      later($, () => reply($, renamed, renamePrompt(name, parsed.name), renameFallback(parsed.name)))
      return note ?? `${name} is now ${parsed.name}.`
    }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        argumentHint: '[pet | card [who] | journal [who] | dex | swap <who> | mute | unmute | off | reroll [confirm]]',
```
with:
```tsx
        argumentHint: '[pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]',
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 327 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/voice.ts buddy/hooks/toys.ts buddy/hooks/record.ts buddy/hooks/register.tsx buddy/hooks/voice.test.ts buddy/hooks/toys.test.ts buddy/hooks/record.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy rename, under the rules a hatched name follows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Hats you can wear

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/toys.ts`, `buddy/hooks/toys.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/layout.ts`, `buddy/hooks/layout.test.ts`
- Modify: `buddy/hooks/card.ts`, `buddy/hooks/card.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `earnedHats`, `EARNED_HAT_NAME`, `ACHIEVEMENTS` from `achievements.ts`; `bonesFor` from `progress.ts`; `HATS`, `rollBones`, `Bones` from `roll.ts`; `EARNED_HATS`, `Wearable` from `sprites.ts`; Task 1's `toys.ts`, `EGG` and `reply` fallback.
- Produces:
  - `hat?: string` on `Buddy` in `types/index.d.ts`
  - from `toys.ts`: `type Worn = Wearable | 'none'`, `type Dressed = Omit<Bones, 'hat'> & { hat: Worn }`, `HAT_NAME: Record<Wearable, string>`
  - `wearable(buddy: Pick<Buddy, 'seed'>, you: You): Worn[]`, `wornHat(buddy: Pick<Buddy, 'seed' | 'hat'>, you: You): Worn`, `dressed(buddy: Pick<Buddy, 'seed' | 'counts' | 'hat'>, you: You): Dressed`
  - `hatList(name, worn, can): string`, `hatChoice({ name, words, worn, can }): { wear: Worn } | { reply: string }`, `woreLine(name, hat)`, `hatPrompt(hat)`, `hatFallback(hat)`
  - the change `{ kind: 'hat'; seed: string; hat: Worn }` and the parse `{ sub: 'hat'; hat?: string }` in `record.ts`
  - `cardLines`, `cardSvg`, `cardAlt` and `statAlt` take `Dressed`; `DexRow.bones` is `Dressed`

A buddy's `bones.hat` stays the hat it rolled. Everything that draws it (the band's live scene, the card and the dex) draws `dressed(buddy, you)` instead, so the roll still says what was rolled. The debug tour keeps its own hats. A holiday hat still covers the worn one in the band, since `topRow` puts the holiday hat first.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/toys.test.ts`, replace:
```ts
import { renameFallback, renamePrompt, renameRefusal } from './toys'
```
with:
```ts
import type { Buddy, You } from '../types'
import { zeroCounts } from './ledger'
import { bonesFor } from './progress'
import {
  HAT_NAME, dressed, hatChoice, hatFallback, hatList, hatPrompt, renameFallback, renamePrompt, renameRefusal, wearable,
  woreLine, wornHat,
} from './toys'
```

Append to the end of `buddy/hooks/toys.test.ts`:
```ts
const AT = '2026-10-01T12:00:00.000Z'
const NOBODY: You = { lastDay: null, streak: 0, bestStreak: 0, days: 0 }
// Good friend's flower crown and Elder's laurel.
const EARNED: You = { ...NOBODY, earned: { goodFriend: AT, elder: AT } }
// 'hat-10' rolls an uncommon capybara in a crown; 'test-seed' a common ghost with no hat.
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
  expect(ask('Flower Crown')).toEqual({ wear: 'flowercrown' })
  expect(ask('NONE')).toEqual({ wear: 'none' })
  expect(ask('crown', 'none')).toEqual({ wear: 'crown' })
  expect(ask('crown')).toEqual({ reply: 'Pip is already wearing a crown.' })
  expect(ask('none', 'none')).toEqual({ reply: 'Pip has no hat on.' })
  expect(ask('hard hat')).toEqual({ reply: 'Earn Shell regular to unlock a hard hat.' })
  expect(ask('halo')).toEqual({ reply: 'Only a buddy that rolled a halo can wear one.' })
  expect(ask('jet pack')).toEqual({ reply: 'No hat called jet pack. Pip can wear: crown, flowercrown, laurel, none.' })
})

test('the hat list, and what is said around a new hat', () => {
  expect(hatList('Pip', 'crown', wearable(CROWNED, EARNED))).toBe(
    'Pip is wearing a crown. It can wear: crown, flowercrown, laurel, none.',
  )
  expect(hatList('Pip', 'none', ['none'])).toBe('Pip has no hat on. It can wear: none. Achievements unlock more.')
  expect(hatList('Pip', 'crown', ['crown', 'none'])).toBe(
    'Pip is wearing a crown. It can wear: crown, none. Achievements unlock more.',
  )
  expect(woreLine('Pip', 'flowercrown')).toBe('Pip is wearing a flower crown.')
  expect(woreLine('Pip', 'none')).toBe('Pip took its hat off.')
  expect(hatPrompt('headphones')).toBe('The developer just put headphones on you. React in one line.')
  expect(hatPrompt('none')).toBe('The developer just took your hat off. React in one line.')
  expect(hatFallback('tophat')).toBe('How do I look?')
  expect(hatFallback('none')).toBe('Cooler up here.')
  expect(Object.keys(HAT_NAME)).toHaveLength(13)
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(sub('rename')).toBe('usage')
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]',
  )
```
with:
```ts
  expect(sub('rename')).toBe('usage')
  expect(parseSub('hat')).toEqual({ sub: 'hat' })
  expect(parseSub('HAT Flower  Crown')).toEqual({ sub: 'hat', hat: 'Flower Crown' })
  expect(USAGE).toBe(
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
  )
```

Append to the end of `buddy/hooks/record.test.ts`:
```ts
// 'hat-10' rolls an uncommon capybara in a crown. You've earned Good friend's flower crown.
const hatted = (hat?: string): Saved => ({
  ...migrate(V1),
  active: 'hat-10',
  buddies: [{ seed: 'hat-10', soul: SOUL, retiredAt: null, counts: zeroCounts(), ...(hat === undefined ? {} : { hat }) }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { goodFriend: AT } },
})

test('a hat change saves a hat it can wear, saves its rolled hat as no choice, and refuses the rest', () => {
  const crown = applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat: 'flowercrown' }, NOON)!
  expect(crown.buddies[0]?.hat).toBe('flowercrown')
  expect(crown.you).toEqual(hatted().you)
  expect(applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)?.buddies[0]?.hat).toBe('none')
  const back = applyChange(hatted('flowercrown'), { kind: 'hat', seed: 'hat-10', hat: 'crown' }, NOON)!
  expect('hat' in back.buddies[0]!).toBe(false)
  // Already worn, not earned, and another buddy's rolled hat.
  for (const hat of ['crown', 'laurel', 'halo'] as const) {
    expect([hat, applyChange(hatted(), { kind: 'hat', seed: 'hat-10', hat }, NOON)]).toEqual([hat, null])
  }
  expect(applyChange(hatted(), { kind: 'hat', seed: 'gone', hat: 'none' }, NOON)).toBeNull()
  expect(applyChange(null, { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)).toBeNull()
  // A field a newer build wrote survives.
  const future = { ...hatted(), buddies: [{ ...hatted().buddies[0]!, xp: 7 }] } as unknown as Saved
  expect(applyChange(future, { kind: 'hat', seed: 'hat-10', hat: 'none' }, NOON)?.buddies[0]).toMatchObject({ xp: 7 })
})
```

Append to the end of `buddy/hooks/layout.test.ts`:
```ts
test('the text card and the dex show the hat a buddy wears', () => {
  const you = { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { elder: '2026-10-01T12:00:00.000Z' } }
  const saved: Saved = {
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'hat-10',
    buddies: [{ seed: 'hat-10', soul: SOUL, retiredAt: null, counts: zeroCounts(), hat: 'laurel' }],
    you,
  }
  expect(dexRows(saved, NOV3)[0]?.bones.hat).toBe('laurel')
  expect(cardLines(SOUL, { ...rollBones('hat-10'), hat: 'laurel' }, 0).join('\n')).toContain('Hat: laurel   Eyes: ·')
})
```

Append to the end of `buddy/hooks/card.test.ts`:
```ts
test('an earned hat gets a chip of its own', () => {
  expect(cardSvg(SOUL, { ...BONES, hat: 'flowercrown' }, 0)).toContain('>Flower crown<')
  expect(cardAlt(SOUL, { ...BONES, hat: 'mortarboard' }, 0)).toContain('Mortarboard, ✦ eyes')
})
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
import { HAT_ART, bodyRows, fillEyes, headRow } from './sprites'
```
with:
```tsx
import { EARNED_HAT_ART, HAT_ART, HOLIDAY_HATS, bodyRows, fillEyes, headRow } from './sprites'
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
// 'hat-10' rolls an uncommon capybara in a crown. Good friend has earned the flower crown. A first
// visit, so no streak greeting takes the bubble.
const CROWNED: Saved = {
  ...SAVED,
  active: 'hat-10',
  buddies: [{ ...SAVED.buddies[0]!, seed: 'hat-10' }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { goodFriend: '2026-10-01T12:00:00.000Z' } },
}

test('a hat you have earned is saved and worn in the band, on the card and in the dex', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Fancy.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('hat')).toBe('Pip is wearing a crown. It can wear: crown, flowercrown, none.')
  expect(await runner($)('hat flower crown')).toBe('Pip is wearing a flower crown.')
  await clock.settle()
  expect(activeOf(shared.row)?.hat).toBe('flowercrown')
  expect(prompts).toEqual(['The developer just put a flower crown on you. React in one line.'])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Fancy.')
  const sprite = (await drawnSprite(ui)).join('\n')
  expect(sprite).toContain(EARNED_HAT_ART.flowercrown)
  expect(sprite).not.toContain(HAT_ART.crown)
  expect(await cardText($)).toContain('Hat: flowercrown')
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  expect(String((await card.find({ type: 'Svg' }))?.props.source)).toContain('>Flower crown<')
  expect(await runner($)('dex')).toBeUndefined()
  const dex = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...dexPane() })
  expect(String((await dex.find({ type: 'Svg' }))?.props.source)).toContain(EARNED_HAT_ART.flowercrown)
  expect(await runner($)('hat none')).toBe('Pip took its hat off.')
  await clock.settle()
  expect(activeOf(shared.row)?.hat).toBe('none')
})

test('a hat not earned, or rolled by another buddy, is refused with the reason and nothing is saved', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Fancy.')
  await $.session.start(START)
  await clock.settle()
  const writes = shared.writes
  expect(await runner($)('hat hardhat')).toBe('Earn Shell regular to unlock a hard hat.')
  expect(await runner($)('hat halo')).toBe('Only a buddy that rolled a halo can wear one.')
  expect(await runner($)('hat crown')).toBe('Pip is already wearing a crown.')
  expect(await runner($)('hat jetpack')).toBe('No hat called jetpack. Pip can wear: crown, flowercrown, none.')
  await clock.settle()
  expect(shared.writes).toBe(writes)
  expect(prompts).toEqual([])
})

test('on a holiday the band wears the holiday hat and the card keeps the hat it chose', async ($, on) => {
  const chose: Saved = { ...CROWNED, buddies: [{ ...CROWNED.buddies[0]!, hat: 'flowercrown' }] }
  const clock = world(on, { buddy: chose }, true, JULY4_NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const sprite = (await drawnSprite(ui)).join('\n')
  expect(sprite).toContain(HOLIDAY_HATS.july4!)
  expect(sprite).not.toContain(EARNED_HAT_ART.flowercrown)
  expect(await cardText($)).toContain('Hat: flowercrown')
})

test('a saved hat the buddy cannot wear, from an old or edited record, draws the hat it rolled', async ($, on) => {
  const odd: Saved = { ...CROWNED, buddies: [{ ...CROWNED.buddies[0]!, hat: 'laurel' }] }
  const clock = world(on, { buddy: odd })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui)).join('\n')).toContain(HAT_ART.crown)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. `toys.test.ts` doesn't load (`Export named 'HAT_NAME' not found in module …toys.ts`), and the new record, layout, card and mod tests fail.

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
  // Missing reads as zeros.
  bests?: Bests
}
```
with:
```ts
  // Missing reads as zeros.
  bests?: Bests
  // The hat it wears: a rolled or earned hat's id, or 'none' (Interaction spec section 2).
  // Missing, or a hat it can't wear, reads as the hat it rolled.
  hat?: string
}
```

In `buddy/hooks/toys.ts`, replace:
```ts
import { RESERVED_NAMES, validName } from './voice'
```
with:
```ts
import type { Buddy, You } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME, earnedHats } from './achievements'
import { bonesFor } from './progress'
import { HATS, rollBones } from './roll'
import type { Bones } from './roll'
import { EARNED_HATS } from './sprites'
import type { Wearable } from './sprites'
import { RESERVED_NAMES, validName } from './voice'
```

Append to the end of `buddy/hooks/toys.ts`:
```ts
// A hat on a buddy's head, or none.
export type Worn = Wearable | 'none'

// A buddy's grown bones with the hat it wears in place of the one it rolled.
export type Dressed = Omit<Bones, 'hat'> & { hat: Worn }

// What each hat is called in a sentence.
export const HAT_NAME: Record<Wearable, string> = {
  crown: 'a crown',
  tophat: 'a top hat',
  propeller: 'a propeller cap',
  halo: 'a halo',
  wizard: 'a wizard hat',
  beanie: 'a beanie',
  tinyduck: 'a tiny duck',
  ...EARNED_HAT_NAME,
}

const WEARABLES: readonly Wearable[] = [...HATS, ...EARNED_HATS]
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
export function hatList(name: string, worn: Worn, can: readonly Worn[]): string {
  const now = worn === 'none' ? `${name} has no hat on.` : `${name} is wearing ${HAT_NAME[worn]}.`
  return `${now} It can wear: ${can.join(', ')}.${can.some(isEarned) ? '' : ' Achievements unlock more.'}`
}

// What /buddy hat <words> does: the hat to wear, or the line refusing it. A hat is named by its
// id, in any case, with spaces dropped: "flower crown" is flowercrown.
export function hatChoice(o: {
  name: string
  words: string
  worn: Worn
  can: readonly Worn[]
}): { wear: Worn } | { reply: string } {
  const id = o.words.toLowerCase().replace(/\s+/g, '')
  const hat = id === 'none' ? 'none' : WEARABLES.find(h => h === id)
  if (hat === undefined) return { reply: `No hat called ${o.words}. ${o.name} can wear: ${o.can.join(', ')}.` }
  if (hat === o.worn) {
    return { reply: hat === 'none' ? `${o.name} has no hat on.` : `${o.name} is already wearing ${HAT_NAME[hat]}.` }
  }
  if (hat === 'none' || o.can.includes(hat)) return { wear: hat }
  const unlock = ACHIEVEMENTS.find(a => a.hat === hat)
  if (unlock) return { reply: `Earn ${unlock.title} to unlock ${HAT_NAME[hat]}.` }
  return { reply: `Only a buddy that rolled ${HAT_NAME[hat]} can wear one.` }
}

// The answer once the hat is on.
export function woreLine(name: string, hat: Worn): string {
  return hat === 'none' ? `${name} took its hat off.` : `${name} is wearing ${HAT_NAME[hat]}.`
}

export function hatPrompt(hat: Worn): string {
  return hat === 'none'
    ? 'The developer just took your hat off. React in one line.'
    : `The developer just put ${HAT_NAME[hat]} on you. React in one line.`
}

export function hatFallback(hat: Worn): string {
  return hat === 'none' ? 'Cooler up here.' : 'How do I look?'
}
```

In `buddy/hooks/record.ts`, replace:
```ts
import { rollBones } from './roll'
```
with:
```ts
import { rollBones } from './roll'
import { wearable, wornHat } from './toys'
import type { Worn } from './toys'
```

In `buddy/hooks/record.ts`, replace:
```ts
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'
```

In `buddy/hooks/record.ts`, replace:
```ts
  // A new name for one buddy (Interaction spec section 2).
  | { kind: 'rename'; seed: string; name: string }
```
with:
```ts
  // A new name for one buddy, and the hat it wears (Interaction spec section 2).
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }
```

In `buddy/hooks/record.ts`, replace:
```ts
        buddies: saved.buddies.map(b => (b.seed === change.seed ? { ...b, soul: { ...b.soul, name: change.name } } : b)),
      }
    }
```
with:
```ts
        buddies: saved.buddies.map(b => (b.seed === change.seed ? { ...b, soul: { ...b.soul, name: change.name } } : b)),
      }
    }
    case 'hat': {
      const b = saved?.buddies.find(x => x.seed === change.seed)
      // Judged on the fresh record: a hat it can wear, and a change from what it wears.
      if (!saved || !b || !wearable(b, saved.you).includes(change.hat) || wornHat(b, saved.you) === change.hat) return null
      const rolled = rollBones(b.seed).hat
      return {
        ...saved,
        buddies: saved.buddies.map(x => {
          if (x.seed !== change.seed) return x
          if (change.hat !== rolled) return { ...x, hat: change.hat }
          // Its rolled hat is the default, saved as no choice at all.
          const { hat: _, ...rest } = x
          return rest
        }),
      }
    }
```

In `buddy/hooks/record.ts`, replace:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename'
```
with:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename' | 'hat'
```

In `buddy/hooks/record.ts`, replace:
```ts
  | { sub: 'rename'; name: string }
```
with:
```ts
  | { sub: 'rename'; name: string }
  // The hat's words as typed; none lists the hats.
  | { sub: 'hat'; hat?: string }
```

In `buddy/hooks/record.ts`, replace:
```ts
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
```
with:
```ts
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
```

In `buddy/hooks/layout.ts`, replace:
```ts
import { PAINT, faceFor } from './sprites'
import type { Prop } from './sprites'
```
with:
```ts
import { PAINT, faceFor } from './sprites'
import type { Prop } from './sprites'
import { dressed } from './toys'
import type { Dressed } from './toys'
```

In `buddy/hooks/layout.ts`, replace:
```ts
export function cardLines(soul: Soul, bones: Bones, rerolls: number, progress?: CardProgress): string[] {
```
with:
```ts
export function cardLines(soul: Soul, bones: Dressed, rerolls: number, progress?: CardProgress): string[] {
```

In `buddy/hooks/layout.ts`, replace:
```ts
  // Grown, for the portrait, the face, the rarity and the species.
  bones: Bones
```
with:
```ts
  // Grown and in the hat it wears, for the portrait, the face, the rarity and the species.
  bones: Dressed
```

In `buddy/hooks/layout.ts`, replace:
```ts
      bones: bonesFor(b),
```
with:
```ts
      bones: dressed(b, saved.you),
```

In `buddy/hooks/card.ts`, replace:
```ts
import type { Bones, Hat, Rarity } from './roll'
import { spriteRows, topRow } from './sprites'
```
with:
```ts
import type { Bones, Rarity } from './roll'
import { spriteRows, topRow } from './sprites'
import type { Wearable } from './sprites'
import type { Dressed } from './toys'
```

In `buddy/hooks/card.ts`, replace:
```ts
const HAT_LABEL: Record<Hat, string> = {
  crown: 'Crown',
  tophat: 'Top hat',
  propeller: 'Propeller hat',
  halo: 'Halo',
  wizard: 'Wizard hat',
  beanie: 'Beanie',
  tinyduck: 'Tiny duck',
}
```
with:
```ts
const HAT_LABEL: Record<Wearable, string> = {
  crown: 'Crown',
  tophat: 'Top hat',
  propeller: 'Propeller hat',
  halo: 'Halo',
  wizard: 'Wizard hat',
  beanie: 'Beanie',
  tinyduck: 'Tiny duck',
  hardhat: 'Hard hat',
  nightcap: 'Nightcap',
  flowercrown: 'Flower crown',
  headphones: 'Headphones',
  mortarboard: 'Mortarboard',
  laurel: 'Laurel',
}
```

In `buddy/hooks/card.ts`, replace:
```ts
function label(bones: Bones, index: number): string {
```
with:
```ts
function label(bones: Dressed, index: number): string {
```

In `buddy/hooks/card.ts`, replace:
```ts
function statChart(bones: Bones): string {
```
with:
```ts
function statChart(bones: Dressed): string {
```

In `buddy/hooks/card.ts`, replace:
```ts
function chips(bones: Bones): string[] {
```
with:
```ts
function chips(bones: Dressed): string[] {
```

In `buddy/hooks/card.ts`, replace:
```ts
function stillRows(bones: Pick<Bones, 'species' | 'eye' | 'hat'>, stage: Stage): string[] {
```
with:
```ts
function stillRows(bones: Pick<Dressed, 'species' | 'eye' | 'hat'>, stage: Stage): string[] {
```

In `buddy/hooks/card.ts`, replace:
```ts
export function cardSvg(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
```
with:
```ts
export function cardSvg(soul: Soul, bones: Dressed, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
```

In `buddy/hooks/card.ts`, replace:
```ts
export function cardAlt(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
```
with:
```ts
export function cardAlt(soul: Soul, bones: Dressed, rerolls: number, history?: CardHistory, progress?: CardProgress): string {
```

In `buddy/hooks/card.ts`, replace:
```ts
export function statAlt(bones: Bones): string {
```
with:
```ts
export function statAlt(bones: Dressed): string {
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { renameFallback, renamePrompt, renameRefusal } from './toys'
```
with:
```tsx
import {
  dressed, hatChoice, hatFallback, hatList, hatPrompt, renameFallback, renamePrompt, renameRefusal, wearable, woreLine,
  wornHat,
} from './toys'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        ...cardLines(shown.soul, bonesFor(shown), saved.rerolls, progress),
```
with:
```tsx
        ...cardLines(shown.soul, dressed(shown, saved.you), saved.rerolls, progress),
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      later($, () => reply($, renamed, renamePrompt(name, parsed.name), renameFallback(parsed.name)))
      return note ?? `${name} is now ${parsed.name}.`
    }
```
with:
```tsx
      later($, () => reply($, renamed, renamePrompt(name, parsed.name), renameFallback(parsed.name)))
      return note ?? `${name} is now ${parsed.name}.`
    }
    case 'hat': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const can = wearable(buddy, saved.you)
      const worn = wornHat(buddy, saved.you)
      if (parsed.hat === undefined) return hatList(name, worn, can)
      const choice = hatChoice({ name, words: parsed.hat, worn, can })
      if ('reply' in choice) return choice.reply
      const hat = choice.wear
      const note = await commit($, { kind: 'hat', seed: buddy.seed, hat })
      // Refused: nothing was written or adopted.
      if (note !== null && note !== SAVE_FAILED) return note
      later($, () => reply($, buddy, hatPrompt(hat), hatFallback(hat)))
      return note ?? woreLine(name, hat)
    }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  buddy: Buddy,
  bones: Bones,
  stage: Stage,
```
with:
```tsx
  buddy: Buddy,
  bones: Scene['bones'],
  stage: Stage,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    : await liveScene($, buddy, own, stage, t, heartsFrame, saying)
```
with:
```tsx
    : await liveScene($, buddy, { ...own, hat: wornHat(buddy, saved.you) }, stage, t, heartsFrame, saying)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      const bones = bonesFor(buddy)
      const progress = cardProgress(saved, buddy)
```
with:
```tsx
      const bones = dressed(buddy, saved.you)
      const progress = cardProgress(saved, buddy)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        argumentHint: '[pet | card [who] | journal [who] | dex | swap <who> | rename <name> | mute | unmute | off | reroll [confirm]]',
```
with:
```tsx
        argumentHint:
          '[pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```

In `buddy/hooks/layout.ts`, replace:
```ts
import { bonesFor, levelOf, nextLevelXp, stageOf, xpOf } from './progress'
```
with:
```ts
import { levelOf, nextLevelXp, stageOf, xpOf } from './progress'
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 338 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/toys.ts buddy/hooks/record.ts buddy/hooks/layout.ts buddy/hooks/card.ts buddy/hooks/register.tsx buddy/hooks/toys.test.ts buddy/hooks/record.test.ts buddy/hooks/layout.test.ts buddy/hooks/card.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy hat, to wear the hat it rolled or one you've earned

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Feed

**Files:**
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/sprites.ts`, `buddy/hooks/sprites.test.ts`
- Modify: `buddy/hooks/look.ts`, `buddy/hooks/look.test.ts`
- Modify: `buddy/hooks/toys.ts`, `buddy/hooks/toys.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `soothe`, `reply`, `newsShowing`, `showBubble` and the `tick` atom in `register.tsx`; Task 2's `CROWNED` fixture in `buddy.test.tsx`.
- Produces:
  - `type Snack = 'cookie' | 'apple' | 'fish' | 'cheese' | 'berries' | 'donut'` in `types/index.d.ts`; `snack` and `lastFedAt` in `PluginState`
  - from `sprites.ts`: `SNACK_ART: Record<Snack, string>`, `CRUMBS`; `topRow` takes `snack?: string | null`, drawn after hearts and before confetti
  - from `look.ts`: `SNACK_TICKS` (5), `CRUMB_TICKS` (2), and `Scene.snack?: { kind: Snack; untilTick: number } | null`
  - from `toys.ts`: `SNACKS`, `FULL_MS`, `FULL_LINES`, `snackOf(roll: number): Snack`, `isFull(lastFedAt: number, now: number): boolean`, `fullLine(n: number)`, `feedPrompt(snack)`, `feedFallback(snack)`
  - in `register.tsx`: `sayAfterNews($, line)`, which `reply` now ends with, and `soothe($, event, who, prompt, fallback?)`

A feed is care, like a pet: it goes through `soothe` as a pet, so it is counted, eases a sulk and earns 5 XP. A second feed within 10 minutes eats nothing and calls no model.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/toys.test.ts`, replace:
```ts
import {
  HAT_NAME, dressed, hatChoice, hatFallback, hatList, hatPrompt, renameFallback, renamePrompt, renameRefusal, wearable,
  woreLine, wornHat,
} from './toys'
```
with:
```ts
import {
  FULL_LINES, FULL_MS, HAT_NAME, SNACKS, dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList,
  hatPrompt, isFull, renameFallback, renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
```

Append to the end of `buddy/hooks/toys.test.ts`:
```ts
test('a snack for every roll, what the buddy is told it ate, and its fallback', () => {
  expect(snackOf(0)).toBe('cookie')
  expect(snackOf(0.5)).toBe('cheese')
  expect(snackOf(0.999)).toBe('donut')
  expect(snackOf(1)).toBe('donut')
  expect(SNACKS.map(feedPrompt)).toEqual([
    'The developer just fed you a cookie. React in one line.',
    'The developer just fed you an apple. React in one line.',
    'The developer just fed you a fish. React in one line.',
    'The developer just fed you some cheese. React in one line.',
    'The developer just fed you some berries. React in one line.',
    'The developer just fed you a donut. React in one line.',
  ])
  expect(feedFallback('berries')).toBe('Mm. Thanks for the berries.')
})

test('a buddy fed in the last 10 minutes is full, and says so in turn', () => {
  const NOW = 1_000_000_000
  expect(isFull(0, NOW)).toBe(false)
  expect(isFull(NOW - FULL_MS + 1, NOW)).toBe(true)
  expect(isFull(NOW - FULL_MS, NOW)).toBe(false)
  expect([0, 1, 2, 3].map(fullLine)).toEqual([...FULL_LINES, FULL_LINES[0]])
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(sub('  pet ')).toBe('pet')
```
with:
```ts
  expect(sub('  pet ')).toBe('pet')
  expect(sub('Feed')).toBe('feed')
  expect(sub('feed twice')).toBe('usage')
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
    'Usage: /buddy [pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```

In `buddy/hooks/sprites.test.ts`, replace:
```ts
  BLANK, CONFETTI, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W,
  SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
} from './sprites'
```
with:
```ts
  BLANK, CONFETTI, CRUMBS, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS,
  PROP_W, SNACK_ART, SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
} from './sprites'
```

Append to the end of `buddy/hooks/sprites.test.ts`:
```ts
test('every snack and its crumbs fit the hat row, and a snack sits under the hearts and over the confetti', () => {
  for (const art of [...Object.values(SNACK_ART), CRUMBS]) expect([art, [...art].length <= SPRITE_W]).toEqual([art, true])
  const all = { hat: 'crown' as const, heartsFrame: 0, sparkle: null, snack: SNACK_ART.fish, confetti: 0 }
  expect(topRow(all)).toContain('♥')
  expect(topRow({ ...all, heartsFrame: null })).toBe(SNACK_ART.fish.padEnd(SPRITE_W))
  expect(topRow({ ...all, heartsFrame: null, snack: null })).toBe(CONFETTI[0])
})
```

In `buddy/hooks/look.test.ts`, replace:
```ts
import { DAY_SLEEP_TICKS, NIGHT_SLEEP_TICKS, draw, isAsleep, portrait } from './look'
```
with:
```ts
import { DAY_SLEEP_TICKS, NIGHT_SLEEP_TICKS, SNACK_TICKS, draw, isAsleep, portrait } from './look'
```

In `buddy/hooks/look.test.ts`, replace:
```ts
import { CONFETTI, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SPRITE_W, ZZZ, bodyRows, fillEyes } from './sprites'
```
with:
```ts
import {
  CONFETTI, CRUMBS, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, SPRITE_W, ZZZ, bodyRows, fillEyes,
} from './sprites'
```

Append to the end of `buddy/hooks/look.test.ts`:
```ts
test('a snack is on the hat row for 3 ticks, then crumbs for 2, then the hat again', () => {
  const snack = { kind: 'cookie' as const, untilTick: 10 + SNACK_TICKS }
  const top = (tick: number) => draw({ ...CALM, tick, snack }).sprite[0]
  expect([10, 11, 12].map(top)).toEqual(Array(3).fill(SNACK_ART.cookie.padEnd(SPRITE_W)))
  expect([13, 14].map(top)).toEqual(Array(2).fill(CRUMBS.padEnd(SPRITE_W)))
  expect(top(15)).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(draw({ ...CALM, tick: 10 }).sprite[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
})
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
import { EARNED_HAT_ART, HAT_ART, HOLIDAY_HATS, bodyRows, fillEyes, headRow } from './sprites'
```
with:
```tsx
import { CRUMBS, EARNED_HAT_ART, HAT_ART, HOLIDAY_HATS, SNACK_ART, bodyRows, fillEyes, headRow } from './sprites'
import { FULL_LINES, SNACKS, feedPrompt } from './toys'
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
const SOOTHERS: [string, ($: Engine) => Promise<unknown>][] = [
  ['a pet', $ => runner($)('pet')],
```
with:
```tsx
const SOOTHERS: [string, ($: Engine) => Promise<unknown>][] = [
  ['a pet', $ => runner($)('pet')],
  ['a feed', $ => runner($)('feed')],
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
test('a feed shows its snack, then crumbs, counts as a pet and asks once; fed again soon, the buddy is full', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Crunchy.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await runner($)('feed')).toBeUndefined()
  await clock.settle()
  const snack = SNACKS.find(s => prompts[0] === feedPrompt(s))
  expect(snack).toBeDefined()
  expect((await drawnSprite(ui)).join('\n')).toContain(SNACK_ART[snack!])
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  expect(await bubbleOf(ui)).toBe('Crunchy.')
  await clock.advance(1_500)
  expect((await drawnSprite(ui)).join('\n')).toContain(CRUMBS)
  await clock.advance(1_000)
  expect((await drawnSprite(ui)).join('\n')).toContain(HAT_ART.crown)
  // Fed again inside 10 minutes: a canned no-thanks, nothing counted, no model call.
  expect(await runner($)('feed')).toBeUndefined()
  await clock.settle()
  expect(FULL_LINES).toContain(await bubbleOf(ui))
  expect(prompts).toHaveLength(1)
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  await clock.advance(10 * 60_000)
  await runner($)('feed')
  await clock.settle()
  expect(prompts).toHaveLength(2)
  expect(activeOf(shared.row)?.counts.pets).toBe(2)
})

test('a hidden buddy is not fed', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, mode: 'off' } })
  const prompts = model(on, null, 'Crunchy.')
  await $.session.start(START)
  expect(await runner($)('feed')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(prompts).toEqual([])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. The sprite, look, toys and mod test files don't load (`Export named 'CRUMBS' not found in module …sprites.ts`, and likewise `SNACK_TICKS` and `FULL_LINES`), and the new record tests fail.

- [ ] **Step 3: Write the code**

In `buddy/types/index.d.ts`, replace:
```ts
// How grown a buddy is, by its level (Progression spec section 2).
export type Stage = 'hatchling' | 'adult' | 'elder'
```
with:
```ts
// How grown a buddy is, by its level (Progression spec section 2).
export type Stage = 'hatchling' | 'adult' | 'elder'

// A snack /buddy feed gives (Interaction spec section 2).
export type Snack = 'cookie' | 'apple' | 'fish' | 'cheese' | 'berries' | 'donut'
```

In `buddy/types/index.d.ts`, replace:
```ts
      // The stage /buddy debug tours (Progression spec section 5).
      tourStage: Stage
```
with:
```ts
      // The stage /buddy debug tours (Progression spec section 5).
      tourStage: Stage
      // The snack the hat row shows and the tick it's eaten by, and when the buddy last ate, in
      // ms, 0 for never (Interaction spec section 2).
      snack: { kind: Snack; untilTick: number } | null
      lastFedAt: number
```

In `buddy/hooks/sprites.ts`, replace:
```ts
import type { Stage } from '../types'
```
with:
```ts
import type { Snack, Stage } from '../types'
```

In `buddy/hooks/sprites.ts`, replace:
```ts
export function hatArt(hat: Wearable): string {
  return WEARABLE_ART[hat]
}
```
with:
```ts
export function hatArt(hat: Wearable): string {
  return WEARABLE_ART[hat]
}

// A snack on the hat row while it's eaten, then its crumbs (Interaction spec section 2).
export const SNACK_ART: Record<Snack, string> = {
  cookie: '    (::)',
  apple: '     (@)',
  fish: '   ><(((°>',
  cheese: '    [:::>',
  berries: '     ooo',
  donut: '    ( o )',
}
export const CRUMBS = '    .  . .'
```

In `buddy/hooks/sprites.ts`, replace:
```ts
// The hat row, the first that applies: hearts, confetti, zZ, a holiday hat, the rolled hat, the sparkle.
export function topRow(o: {
  hat: Wearable | 'none'
  heartsFrame: number | null
  sparkle: number | null
  confetti?: number | null
```
with:
```ts
// The hat row, the first that applies: hearts, a snack, confetti, zZ, a holiday hat, the hat, the sparkle.
export function topRow(o: {
  hat: Wearable | 'none'
  heartsFrame: number | null
  sparkle: number | null
  snack?: string | null
  confetti?: number | null
```

In `buddy/hooks/sprites.ts`, replace:
```ts
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
```
with:
```ts
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.snack) return fit(o.snack)
```

In `buddy/hooks/look.ts`, replace:
```ts
import type { Stage } from '../types'
```
with:
```ts
import type { Snack, Stage } from '../types'
```

In `buddy/hooks/look.ts`, replace:
```ts
import { HOLIDAY_HATS, POSE_EYE, PROPS, faceFor, frameAt, spriteRows, topRow } from './sprites'
```
with:
```ts
import { CRUMBS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, faceFor, frameAt, spriteRows, topRow } from './sprites'
```

In `buddy/hooks/look.ts`, replace:
```ts
export const FLINCH_TICKS = 4
export const CELEBRATE_TICKS = 6
```
with:
```ts
export const FLINCH_TICKS = 4
export const CELEBRATE_TICKS = 6
// A snack is on the hat row for 5 ticks, the last 2 of them as crumbs (Interaction spec section 2).
export const SNACK_TICKS = 5
export const CRUMB_TICKS = 2
```

In `buddy/hooks/look.ts`, replace:
```ts
  heartsFrame: number | null
  saying: boolean
}

export type Drawn
```
with:
```ts
  heartsFrame: number | null
  saying: boolean
  // A snack being eaten and the tick it's gone by. Missing reads as none.
  snack?: { kind: Snack; untilTick: number } | null
}

export type Drawn
```

In `buddy/hooks/look.ts`, replace:
```ts
export function draw(s: Scene): Drawn {
```
with:
```ts
// The hat row's snack at `tick`: the snack, then crumbs for its last CRUMB_TICKS; null once eaten.
function snackRow(snack: Scene['snack'], tick: number): string | null {
  if (!snack || tick >= snack.untilTick) return null
  return snack.untilTick - tick > CRUMB_TICKS ? SNACK_ART[snack.kind] : CRUMBS
}

export function draw(s: Scene): Drawn {
```

In `buddy/hooks/look.ts`, replace:
```ts
    heartsFrame: s.heartsFrame,
    sparkle: s.bones.shiny ? s.tick : null,
```
with:
```ts
    heartsFrame: s.heartsFrame,
    snack: snackRow(s.snack, s.tick),
    sparkle: s.bones.shiny ? s.tick : null,
```

In `buddy/hooks/toys.ts`, replace:
```ts
import type { Buddy, You } from '../types'
```
with:
```ts
import type { Buddy, Snack, You } from '../types'
```

Append to the end of `buddy/hooks/toys.ts`:
```ts
// Snacks for /buddy feed, and what the prompt calls each.
export const SNACKS: readonly Snack[] = ['cookie', 'apple', 'fish', 'cheese', 'berries', 'donut']
const CALLED: Record<Snack, string> = {
  cookie: 'a cookie',
  apple: 'an apple',
  fish: 'a fish',
  cheese: 'some cheese',
  berries: 'some berries',
  donut: 'a donut',
}

// How long a buddy that ate stays full, and what it says when fed again before then.
export const FULL_MS = 10 * 60_000
export const FULL_LINES: readonly string[] = ['Still full, thanks.', 'One more bite and I pop.', 'Ask me again in a bit.']

// The snack for a roll from 0 to 1.
export function snackOf(roll: number): Snack {
  return SNACKS[Math.min(SNACKS.length - 1, Math.max(0, Math.floor(roll * SNACKS.length)))]!
}

// `lastFedAt` is 0 for a buddy this session never fed.
export function isFull(lastFedAt: number, now: number): boolean {
  return lastFedAt > 0 && now - lastFedAt < FULL_MS
}

export function fullLine(n: number): string {
  return FULL_LINES[((n % FULL_LINES.length) + FULL_LINES.length) % FULL_LINES.length]!
}

export function feedPrompt(snack: Snack): string {
  return `The developer just fed you ${CALLED[snack]}. React in one line.`
}

export function feedFallback(snack: Snack): string {
  return `Mm. Thanks for the ${snack}.`
}
```

In `buddy/hooks/record.ts`, replace:
```ts
  'Usage: /buddy [pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
  'Usage: /buddy [pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'
```

In `buddy/hooks/record.ts`, replace:
```ts
type Plain = 'show' | 'pet' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug-off' | 'usage'
```
with:
```ts
type Plain =
  'show' | 'pet' | 'feed' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug-off' | 'usage'
```

In `buddy/hooks/record.ts`, replace:
```ts
const SIMPLE: readonly string[] = ['pet', 'dex', 'mute', 'unmute', 'off']
```
with:
```ts
const SIMPLE: readonly string[] = ['pet', 'feed', 'dex', 'mute', 'unmute', 'off']
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { CELEBRATE_TICKS, FLINCH_TICKS, draw, portrait } from './look'
```
with:
```tsx
import { CELEBRATE_TICKS, FLINCH_TICKS, SNACK_TICKS, draw, portrait } from './look'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import {
  dressed, hatChoice, hatFallback, hatList, hatPrompt, renameFallback, renamePrompt, renameRefusal, wearable, woreLine,
  wornHat,
} from './toys'
```
with:
```tsx
import {
  dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList, hatPrompt, isFull, renameFallback,
  renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
const tourStage = atom({ plugin: 'buddy', key: 'tourStage' } as const, 'adult')
```
with:
```tsx
const tourStage = atom({ plugin: 'buddy', key: 'tourStage' } as const, 'adult')
const snackShown = atom({ plugin: 'buddy', key: 'snack' } as const, null)
const lastFedAt = atom({ plugin: 'buddy', key: 'lastFedAt' } as const, 0)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  const line = text ?? fallback ?? cannedLine(bones, cannedCount++, Math.random())
  const news = await newsShowing($)
  await showBubble($, news === null ? line : `${news} ${line}`, news ?? undefined)
}
```
with:
```tsx
  await sayAfterNews($, text ?? fallback ?? cannedLine(bones, cannedCount++, Math.random()))
}

// Says `line`, after an announcement still showing, in the same bubble (Progression spec section 4).
async function sayAfterNews($: EngineInterface, line: string) {
  const news = await newsShowing($)
  await showBubble($, news === null ? line : `${news} ${line}`, news ?? undefined)
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
async function soothe($: EngineInterface, event: CountEvent, who: Who, prompt: string) {
  try {
    await countAndFlush($, event, ['soothe'])
  } finally {
    await reply($, who, prompt)
  }
}
```
with:
```tsx
async function soothe($: EngineInterface, event: CountEvent, who: Who, prompt: string, fallback?: string) {
  try {
    await countAndFlush($, event, ['soothe'])
  } finally {
    await reply($, who, prompt, fallback)
  }
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      later($, () => soothe($, { kind: 'pet' }, buddy, PET_PROMPT))
      return undefined
    }
```
with:
```tsx
      later($, () => soothe($, { kind: 'pet' }, buddy, PET_PROMPT))
      return undefined
    }
    case 'feed': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const now = await $.clock.now()
      // Fed in the last 10 minutes: a canned no-thanks, with nothing eaten or counted.
      if (isFull(await read($, lastFedAt), now)) {
        await sayAfterNews($, fullLine(cannedCount++))
        return undefined
      }
      const snack = snackOf(Math.random())
      const t = await read($, tick)
      await update($, lastFedAt, () => now)
      await update($, snackShown, () => ({ kind: snack, untilTick: t + SNACK_TICKS }))
      // Care, like a pet: counted, it eases a sulk, then the reply.
      later($, () => soothe($, { kind: 'pet' }, buddy, feedPrompt(snack), feedFallback(snack)))
      return undefined
    }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    tick: t,
    mood: await moodNow($, buddy, now),
```
with:
```tsx
    tick: t,
    snack: await read($, snackShown),
    mood: await moodNow($, buddy, now),
```

In `buddy/hooks/register.tsx`, replace:
```tsx
          '[pet | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```
with:
```tsx
          '[pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 345 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/types/index.d.ts buddy/hooks/sprites.ts buddy/hooks/look.ts buddy/hooks/toys.ts buddy/hooks/record.ts buddy/hooks/register.tsx buddy/hooks/toys.test.ts buddy/hooks/record.test.ts buddy/hooks/sprites.test.ts buddy/hooks/look.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy feed: a snack on the hat row, counted as care, and full for 10 minutes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Play

**Files:**
- Modify: `buddy/hooks/toys.ts`, `buddy/hooks/toys.test.ts`
- Modify: `buddy/hooks/record.ts`, `buddy/hooks/record.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `feel`, `soothe` and `cannedCount` in `register.tsx`; `CONFETTI_ROWS`, `CROWNED` and `SOOTHERS` in `buddy.test.tsx`.
- Produces:
  - from `toys.ts`: `type Game = 'dice' | 'coin' | 'rps'`, `type Throw`, `type Side`, `GAMES`, `THROWS`, `SIDES`, `type Outcome = 'win' | 'lose' | 'draw'` (the buddy's side), `type Played = { game; outcome; line; told }`
  - `readPlay(words: readonly string[]): { game?: Game; pick?: Throw | Side } | null`
  - `play(o: { name: string; game?: Game; pick?: Throw | Side; roll: () => number }): Played`
  - `playPrompt(played: Played): string`, `PLAY_FALLBACKS: Record<Outcome, readonly string[]>`, `playFallback(outcome: Outcome, n: number): string`
  - the parse `{ sub: 'play'; game?: Game; pick?: Throw | Side }` in `record.ts`

`play` takes its rolls as a function, so tests hand it a fixed sequence and the command hands it `Math.random`. The command answers with the result at once. A win for the buddy strikes the celebrate pose, and the game counts as a pet.

- [ ] **Step 1: Write the failing tests**

In `buddy/hooks/toys.test.ts`, replace:
```ts
import {
  FULL_LINES, FULL_MS, HAT_NAME, SNACKS, dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList,
  hatPrompt, isFull, renameFallback, renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
```
with:
```ts
import {
  FULL_LINES, FULL_MS, HAT_NAME, PLAY_FALLBACKS, SNACKS, THROWS, dressed, feedFallback, feedPrompt, fullLine, hatChoice,
  hatFallback, hatList, hatPrompt, isFull, play, playFallback, playPrompt, renameFallback, renamePrompt, renameRefusal,
  snackOf, wearable, woreLine, wornHat,
} from './toys'
```

Append to the end of `buddy/hooks/toys.test.ts`:
```ts
// Rolls that come back in the order given, as a game draws them.
const rolls = (...r: number[]) => {
  let i = 0
  return () => r[i++] ?? 0
}

test('dice: the higher roll wins and the same roll is a draw, told from the buddy side', () => {
  // A die rolls 1 + floor(6r): 0.5 is a 4, 0.9 a 6, 0.4 and 0.34 both a 3.
  expect(play({ name: 'Pip', game: 'dice', roll: rolls(0.5, 0.9) })).toEqual({
    game: 'dice',
    outcome: 'win',
    line: 'You rolled 4; Pip rolled 6. Pip wins.',
    told: 'You just played dice with the developer: they rolled 4, you rolled 6. You won.',
  })
  expect(play({ name: 'Pip', game: 'dice', roll: rolls(0.9, 0.5) })).toMatchObject({
    outcome: 'lose',
    line: 'You rolled 6; Pip rolled 4. You win.',
  })
  expect(play({ name: 'Pip', game: 'dice', roll: rolls(0.4, 0.34) })).toMatchObject({
    outcome: 'draw',
    line: 'You both rolled 3. A draw.',
    told: 'You just played dice with the developer: they rolled 3, you rolled 3. A draw.',
  })
})

test('a coin: you call it when you name a side, else the buddy does, and the caller wins on a match', () => {
  // A side is heads under 0.5, tails from 0.5.
  expect(play({ name: 'Pip', game: 'coin', pick: 'heads', roll: rolls(0.7) })).toEqual({
    game: 'coin',
    outcome: 'win',
    line: 'You called heads. Tails. Pip wins.',
    told: 'You just played a coin toss with the developer: they called heads, and it came up tails. You won.',
  })
  expect(play({ name: 'Pip', game: 'coin', pick: 'tails', roll: rolls(0.7) }).line).toBe(
    'You called tails. Tails. You win.',
  )
  expect(play({ name: 'Pip', game: 'coin', roll: rolls(0.7, 0.7) })).toMatchObject({
    outcome: 'win',
    line: 'Pip called tails. Tails. Pip wins.',
    told: 'You just played a coin toss with the developer: you called tails, and it came up tails. You won.',
  })
  expect(play({ name: 'Pip', game: 'coin', roll: rolls(0.7, 0.2) })).toMatchObject({
    outcome: 'lose',
    line: 'Pip called tails. Heads. You win.',
  })
})

test('rock-paper-scissors: every pair of throws, and a throw picked for you', () => {
  // A throw is rock under 1/3, paper under 2/3, scissors above.
  expect(play({ name: 'Pip', game: 'rps', pick: 'rock', roll: rolls(0.9) })).toEqual({
    game: 'rps',
    outcome: 'lose',
    line: 'You threw rock; Pip threw scissors. You win.',
    told: 'You just played rock-paper-scissors with the developer: they threw rock, you threw scissors. They won.',
  })
  const beats = ['rock>scissors', 'scissors>paper', 'paper>rock']
  for (const mine of THROWS) {
    for (const [j, theirs] of THROWS.entries()) {
      const { outcome } = play({ name: 'Pip', game: 'rps', pick: mine, roll: rolls((j + 0.5) / 3) })
      const expected = mine === theirs ? 'draw' : beats.includes(`${mine}>${theirs}`) ? 'lose' : 'win'
      expect([mine, theirs, outcome]).toEqual([mine, theirs, expected])
    }
  }
  expect(play({ name: 'Pip', game: 'rps', roll: rolls(0, 0.4) }).line).toBe(
    'You threw rock (picked for you); Pip threw paper. Pip wins.',
  )
  expect(play({ name: 'Pip', game: 'rps', roll: rolls(0.4, 0.4) }).line).toBe(
    'You both threw paper (yours picked for you). A draw.',
  )
})

test('no game named picks one; the prompt and the fallbacks follow the outcome', () => {
  expect(play({ name: 'Pip', roll: rolls(0, 0.5, 0.5) }).game).toBe('dice')
  expect(play({ name: 'Pip', roll: rolls(0.5, 0.7, 0.7) }).game).toBe('coin')
  expect(play({ name: 'Pip', roll: rolls(0.99, 0, 0) }).game).toBe('rps')
  const played = play({ name: 'Pip', game: 'dice', roll: rolls(0.5, 0.9) })
  expect(playPrompt(played)).toBe(`${played.told} React in one line.`)
  expect([0, 1, 2].map(n => playFallback('win', n))).toEqual(['Ha! Again?', 'Undefeated. Mostly.', 'Ha! Again?'])
  expect(playFallback('lose', 1)).toBe('I let you win.')
  expect(playFallback('draw', 0)).toBe('A draw. Suspicious.')
  expect(Object.values(PLAY_FALLBACKS).flat()).toHaveLength(6)
})
```

In `buddy/hooks/record.test.ts`, replace:
```ts
  expect(sub('Feed')).toBe('feed')
  expect(sub('feed twice')).toBe('usage')
```
with:
```ts
  expect(sub('Feed')).toBe('feed')
  expect(sub('feed twice')).toBe('usage')
  expect(parseSub('play')).toEqual({ sub: 'play' })
  expect(parseSub('play Dice')).toEqual({ sub: 'play', game: 'dice' })
  expect(parseSub('play coin')).toEqual({ sub: 'play', game: 'coin' })
  expect(parseSub('play rps')).toEqual({ sub: 'play', game: 'rps' })
  expect(parseSub('play ROCK')).toEqual({ sub: 'play', game: 'rps', pick: 'rock' })
  expect(parseSub('play tails')).toEqual({ sub: 'play', game: 'coin', pick: 'tails' })
  expect(parseSub('play rps scissors')).toEqual({ sub: 'play', game: 'rps', pick: 'scissors' })
  expect(parseSub('play coin Heads')).toEqual({ sub: 'play', game: 'coin', pick: 'heads' })
  for (const bad of ['play chess', 'play dice 4', 'play coin rock', 'play rps heads', 'play rps rock now']) {
    expect([bad, sub(bad)]).toEqual([bad, 'usage'])
  }
```

In `buddy/hooks/record.test.ts`, replace:
```ts
    'Usage: /buddy [pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```
with:
```ts
    'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
import { FULL_LINES, SNACKS, feedPrompt } from './toys'
```
with:
```tsx
import { FULL_LINES, PLAY_FALLBACKS, SNACKS, feedPrompt } from './toys'
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  ['a feed', $ => runner($)('feed')],
```
with:
```tsx
  ['a feed', $ => runner($)('feed')],
  ['a game', $ => runner($)('play dice')],
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
test('a game answers its result at once, counts as a pet and asks once; inside 5 s its fallback is about the game', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Rematch.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await runner($)('play rps rock')).toMatch(
    /^(You threw rock; Pip threw (paper|scissors)\. (Pip wins|You win)\.|You both threw rock\. A draw\.)$/,
  )
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toMatch(/^You just played rock-paper-scissors with the developer: they threw rock, you threw \w+\. /)
  expect(prompts[0]).toMatch(/\. (You won|They won|A draw)\. React in one line\.$/)
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  expect(await bubbleOf(ui)).toBe('Rematch.')
  expect(await runner($)('play coin')).toMatch(/^Pip called (heads|tails)\. (Heads|Tails)\. (Pip wins|You win)\.$/)
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(Object.values(PLAY_FALLBACKS).flat()).toContain(await bubbleOf(ui))
  expect(activeOf(shared.row)?.counts.pets).toBe(2)
})

// Math.random can't be stubbed in a test, so this plays until it has seen a win and a game that
// wasn't one. The buddy wins a game of dice 15 times in 36, so 40 games miss either about once in
// a hundred million runs.
test('the buddy celebrates a game it wins, and only one it wins', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const seen = new Set<boolean>()
  for (let i = 0; i < 40 && seen.size < 2; i++) {
    const won = ((await runner($)('play dice')) ?? '').endsWith('Pip wins.')
    await clock.settle()
    const sprite = (await drawnSprite(ui)).join('\n')
    expect([i, CONFETTI_ROWS.some(row => sprite.includes(row))]).toEqual([i, won])
    seen.add(won)
    // Past the celebration's 3 seconds.
    await clock.advance(4_000)
  }
  expect(seen.size).toBe(2)
})

test('a hidden buddy does not play', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, mode: 'off' } })
  const prompts = model(on, null, 'Rematch.')
  await $.session.start(START)
  expect(await runner($)('play')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(prompts).toEqual([])
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. `toys.test.ts` and `buddy.test.tsx` don't load (`Export named 'PLAY_FALLBACKS' not found in module …toys.ts`), and the new parse rows fail.

- [ ] **Step 3: Write the code**

Append to the end of `buddy/hooks/toys.ts`:
```ts
// The games /buddy play knows, and the picks that name one.
export type Game = 'dice' | 'coin' | 'rps'
export type Throw = 'rock' | 'paper' | 'scissors'
export type Side = 'heads' | 'tails'
export const GAMES: readonly Game[] = ['dice', 'coin', 'rps']
export const THROWS: readonly Throw[] = ['rock', 'paper', 'scissors']
export const SIDES: readonly Side[] = ['heads', 'tails']
// What each throw beats.
const BEATS: Record<Throw, Throw> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
const GAME_NAME: Record<Game, string> = { dice: 'dice', coin: 'a coin toss', rps: 'rock-paper-scissors' }

// How a game went, from the buddy's side.
export type Outcome = 'win' | 'lose' | 'draw'
const TOLD: Record<Outcome, string> = { win: 'You won.', lose: 'They won.', draw: 'A draw.' }

export type Played = {
  game: Game
  outcome: Outcome
  // The command's answer.
  line: string
  // What happened, as the buddy is told it.
  told: string
}

const pickGame = (word: string): Game | undefined =>
  (THROWS as readonly string[]).includes(word) ? 'rps' : (SIDES as readonly string[]).includes(word) ? 'coin' : undefined

// The words after `play`, lower-cased: a game, a pick that names its game, or a game and a pick
// that fits it. Null for anything else.
export function readPlay(words: readonly string[]): { game?: Game; pick?: Throw | Side } | null {
  const [first, second, ...rest] = words
  if (first === undefined) return {}
  if (rest.length > 0) return null
  if (second === undefined) {
    if ((GAMES as readonly string[]).includes(first)) return { game: first as Game }
    const game = pickGame(first)
    return game ? { game, pick: first as Throw | Side } : null
  }
  const game = pickGame(second)
  return game !== undefined && game === first ? { game, pick: second as Throw | Side } : null
}

// One game, decided by `roll`, which gives a number from 0 to 1 each time it is called: the game
// when none was named, then each side's die, call, flip or throw in the order the game needs them.
export function play(o: { name: string; game?: Game; pick?: Throw | Side; roll: () => number }): Played {
  const any = <T>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(o.roll() * list.length))]!
  const game = o.game ?? any(GAMES)
  const done = (outcome: Outcome, line: string, what: string): Played => ({
    game,
    outcome,
    line,
    told: `You just played ${GAME_NAME[game]} with the developer: ${what}. ${TOLD[outcome]}`,
  })
  const winner = (outcome: Outcome) => (outcome === 'win' ? `${o.name} wins.` : 'You win.')
  if (game === 'dice') {
    const yours = 1 + Math.floor(o.roll() * 6)
    const theirs = 1 + Math.floor(o.roll() * 6)
    const what = `they rolled ${yours}, you rolled ${theirs}`
    if (yours === theirs) return done('draw', `You both rolled ${yours}. A draw.`, what)
    const outcome = theirs > yours ? 'win' : 'lose'
    return done(outcome, `You rolled ${yours}; ${o.name} rolled ${theirs}. ${winner(outcome)}`, what)
  }
  if (game === 'coin') {
    // You call it when you named a side; otherwise the buddy does.
    const youCall = o.pick === 'heads' || o.pick === 'tails'
    const call = youCall ? (o.pick as Side) : any(SIDES)
    const flip = any(SIDES)
    const outcome = (flip === call) === youCall ? 'lose' : 'win'
    const caller = youCall ? 'You' : o.name
    const what = `${youCall ? 'they' : 'you'} called ${call}, and it came up ${flip}`
    return done(outcome, `${caller} called ${call}. ${flip === 'heads' ? 'Heads' : 'Tails'}. ${winner(outcome)}`, what)
  }
  const picked = !(THROWS as readonly (string | undefined)[]).includes(o.pick)
  const yours = picked ? any(THROWS) : (o.pick as Throw)
  const theirs = any(THROWS)
  const what = `they threw ${yours}, you threw ${theirs}`
  if (yours === theirs) {
    return done('draw', `You both threw ${yours}${picked ? ' (yours picked for you)' : ''}. A draw.`, what)
  }
  const outcome = BEATS[theirs] === yours ? 'win' : 'lose'
  const mine = `You threw ${yours}${picked ? ' (picked for you)' : ''}`
  return done(outcome, `${mine}; ${o.name} threw ${theirs}. ${winner(outcome)}`, what)
}

export function playPrompt(played: Played): string {
  return `${played.told} React in one line.`
}

export const PLAY_FALLBACKS: Record<Outcome, readonly string[]> = {
  win: ['Ha! Again?', 'Undefeated. Mostly.'],
  lose: ['Best two out of three.', 'I let you win.'],
  draw: ['A draw. Suspicious.', 'Again. Now.'],
}

export function playFallback(outcome: Outcome, n: number): string {
  const pool = PLAY_FALLBACKS[outcome]
  return pool[((n % pool.length) + pool.length) % pool.length]!
}
```

In `buddy/hooks/record.ts`, replace:
```ts
import { wearable, wornHat } from './toys'
import type { Worn } from './toys'
```
with:
```ts
import { readPlay, wearable, wornHat } from './toys'
import type { Game, Side, Throw, Worn } from './toys'
```

In `buddy/hooks/record.ts`, replace:
```ts
  'Usage: /buddy [pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'
```
with:
```ts
  'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'
```

In `buddy/hooks/record.ts`, replace:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename' | 'hat'
```
with:
```ts
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'debug' | 'rename' | 'hat' | 'play'
```

In `buddy/hooks/record.ts`, replace:
```ts
  // The hat's words as typed; none lists the hats.
  | { sub: 'hat'; hat?: string }
```
with:
```ts
  // The hat's words as typed; none lists the hats.
  | { sub: 'hat'; hat?: string }
  // No game picks one at random; no pick lets the game pick for you.
  | { sub: 'play'; game?: Game; pick?: Throw | Side }
```

In `buddy/hooks/record.ts`, replace:
```ts
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
```
with:
```ts
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
  if (first === 'play') {
    const chosen = readPlay(words.slice(1).map(w => w.toLowerCase()))
    return chosen ? { sub: 'play', ...chosen } : { sub: 'usage' }
  }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import {
  dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList, hatPrompt, isFull, renameFallback,
  renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
```
with:
```tsx
import {
  dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList, hatPrompt, isFull, play, playFallback,
  playPrompt, renameFallback, renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
      later($, () => soothe($, { kind: 'pet' }, buddy, feedPrompt(snack), feedFallback(snack)))
      return undefined
    }
```
with:
```tsx
      later($, () => soothe($, { kind: 'pet' }, buddy, feedPrompt(snack), feedFallback(snack)))
      return undefined
    }
    case 'play': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const played = play({ name, game: parsed.game, pick: parsed.pick, roll: Math.random })
      if (played.outcome === 'win') await feel($, [], 'celebrate')
      // Care, like a pet: counted, it eases a sulk, then the buddy has its say about the game.
      later($, () => soothe($, { kind: 'pet' }, buddy, playPrompt(played), playFallback(played.outcome, cannedCount++)))
      return played.line
    }
```

In `buddy/hooks/register.tsx`, replace:
```tsx
          '[pet | feed | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```
with:
```tsx
          '[pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 353 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/toys.ts buddy/hooks/record.ts buddy/hooks/register.tsx buddy/hooks/toys.test.ts buddy/hooks/record.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: /buddy play: dice, a coin toss and rock-paper-scissors, decided locally

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Break nudges and the yawn

**Files:**
- Create: `buddy/hooks/breaks.ts`, `buddy/hooks/breaks.test.ts`
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/look.ts`, `buddy/hooks/look.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `feel`, `showBubble`, `newsShowing`, `react` and `cannedCount` in `register.tsx`; `POSE_EYE.sleep` from `sprites.ts`; `CROWNED`, `bubbleOf` and `engineBelow` in `buddy.test.tsx`.
- Produces:
  - from `breaks.ts`: `BREAK_GAP_MS`, `STRETCH_MS`, `type Stretch = { start: number; lastEnd: number; nudgedAt: number | null }`, `nextStretch(stretch, start, end): Stretch`, `breakDue(stretch, now): boolean`, `spanText(ms)`, `BREAK_LINES`, `breakLine(n, ms)`
  - `YAWN_TICKS` (4) from `look.ts`; `Scene.pose` and `PluginState.pose` accept `'yawn'`
  - in `register.tsx`: `feel` accepts `'yawn'`, `respond($, summary, facts)` takes the turn's reaction slot, and `nudgeBreak($)`; the module variable `stretch`
  - in `buddy.test.tsx`: `turnOf(minutes, turnId?)`, `isBreakLine(text)`, `saidNow($)` and the `LONG_DONE` fixture

The stretch is session state in a module variable, updated as each main turn ends, from the turn's end and its duration. `respond` gives the turn's one reaction slot to a break nudge when one is due, else to a quip. The yawn reuses the sleep frame with closed eyes, so it needs no new art.

The existing 60-turn memory test runs turns 4 minutes apart for 4 hours: one long stretch. Two of its turn ends now go to break nudges, so it expects 58 quips.

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/breaks.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { BREAK_LINES, breakDue, breakLine, nextStretch, spanText } from './breaks'

const MIN = 60_000
const T0 = 1_000_000_000

test('a first turn starts a stretch; a gap of 10 minutes keeps it, and one of more starts a new one', () => {
  const first = nextStretch(null, T0, T0 + 4 * MIN)
  expect(first).toEqual({ start: T0, lastEnd: T0 + 4 * MIN, nudgedAt: null })
  expect(nextStretch(first, T0 + 14 * MIN, T0 + 15 * MIN)).toEqual({ start: T0, lastEnd: T0 + 15 * MIN, nudgedAt: null })
  expect(nextStretch(first, T0 + 14 * MIN + 1, T0 + 15 * MIN)).toEqual({
    start: T0 + 14 * MIN + 1,
    lastEnd: T0 + 15 * MIN,
    nudgedAt: null,
  })
  // A turn that started before the last one ended carries the stretch on.
  expect(nextStretch(first, T0 + MIN, T0 + 5 * MIN).start).toBe(T0)
  const nudged = { start: T0, lastEnd: T0 + 90 * MIN, nudgedAt: T0 + 90 * MIN }
  expect(nextStretch(nudged, T0 + 95 * MIN, T0 + 96 * MIN).nudgedAt).toBe(T0 + 90 * MIN)
})

test('a break is due 90 minutes into a stretch, then 90 minutes after each nudge', () => {
  expect(breakDue(null, T0)).toBe(false)
  const run = { start: T0, lastEnd: T0, nudgedAt: null }
  expect(breakDue(run, T0 + 90 * MIN - 1)).toBe(false)
  expect(breakDue(run, T0 + 90 * MIN)).toBe(true)
  const nudged = { ...run, nudgedAt: T0 + 90 * MIN }
  expect(breakDue(nudged, T0 + 179 * MIN)).toBe(false)
  expect(breakDue(nudged, T0 + 180 * MIN)).toBe(true)
  // One turn longer than 90 minutes is due at its end.
  expect(breakDue(nextStretch(null, T0, T0 + 95 * MIN), T0 + 95 * MIN)).toBe(true)
})

test('the span reads in minutes under 2 hours, then by the half hour', () => {
  expect(spanText(90 * MIN)).toBe('90 minutes')
  expect(spanText(99 * MIN)).toBe('95 minutes')
  expect(spanText(120 * MIN)).toBe('2 hours')
  expect(spanText(165 * MIN)).toBe('2 and a half hours')
  expect(spanText(180 * MIN)).toBe('3 hours')
})

test('the break lines take turns, each saying how long the stretch has run', () => {
  expect([0, 1, 2, 3, 4].map(n => breakLine(n, 120 * MIN))).toEqual([
    "*yawn* That's 2 hours straight. Stretch your legs?",
    '*yawn* 2 hours without a break. Water, maybe?',
    '*yawn* Even I need a break after 2 hours.',
    '*yawn* 2 hours in. Go look at something far away.',
    "*yawn* That's 2 hours straight. Stretch your legs?",
  ])
  expect(BREAK_LINES).toHaveLength(4)
})
```

Append to the end of `buddy/hooks/look.test.ts`:
```ts
test('a yawn draws the sleep frame with closed eyes, awake: no zZ, and the hat stays on', () => {
  const yawn = draw({ ...CALM, pose: 'yawn' })
  expect(body(yawn.sprite)).toEqual(posed('sleep'))
  expect(yawn.sprite[0]).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(yawn.asleep).toBe(false)
  expect(yawn.face).not.toContain('zZ')
  expect(yawn.face).toContain(POSE_EYE.sleep)
  expect(isAsleep({ ...CALM, pose: 'yawn', idleTicks: DAY_SLEEP_TICKS })).toBe(false)
})
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
// A main turn `minutes` long, ending now.
const turnOf = (minutes: number, turnId = 't1') => ({ ...TURN, turnId, durationMs: minutes * 60_000 })
// Every break line opens with a yawn, and nothing else the buddy says does.
const isBreakLine = (text: string) => text.startsWith('*yawn* ')
// The bubble's words now, from a band mounted just to look: a band left mounted redraws on every
// tick, which makes an advance of an hour or more slow.
async function saidNow($: Engine): Promise<string> {
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const said = await bubbleOf(ui)
  await ui.unmount()
  return said
}
// CROWNED, with Marathon and Ultramarathon already earned, so a long turn announces nothing.
const EARNED_AT = '2026-10-01T12:00:00.000Z'
const LONG_DONE: Saved = {
  ...CROWNED,
  you: { ...CROWNED.you, earned: { goodFriend: EARNED_AT, marathon: EARNED_AT, ultramarathon: EARNED_AT } },
}

test('after 90 minutes of turns with no long gap the buddy yawns and suggests a break, in place of a quip', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  const prompts = model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  const face = async () => (await short.findAll({ type: 'Text' }))[0]?.text ?? ''
  // 85 minutes: not yet.
  await $.turn.complete(turnOf(85))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // A 4-minute gap, then 1 more: 90 minutes since the stretch began.
  await clock.advance(5 * 60_000)
  const asked = prompts.length
  await $.turn.complete(turnOf(1, 't2'))
  await clock.settle()
  const said = await bubbleOf(ui)
  expect(isBreakLine(said)).toBe(true)
  expect(said).toContain('90 minutes')
  expect(prompts).toHaveLength(asked)
  // 'hat-10' rolls a capybara with · eyes: closed for the yawn, with no zZ, then open again.
  expect(await face()).toMatch(/^\(-oo-\) {2}Pip/)
  expect(await face()).not.toContain('zZ')
  await clock.advance(2_000)
  expect(await face()).toMatch(/^\(·oo·\) {2}Pip/)
})

test('a gap of more than 10 minutes starts the stretch over', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // 85 minutes, then 11 minutes away: the 96 minutes since it began are two stretches.
  await $.turn.complete(turnOf(85))
  await clock.advance(11 * 60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
})

test('a stretch that runs on is nudged again 90 minutes after the last nudge, and not before', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // One turn of 90 minutes is due at its end.
  await $.turn.complete(turnOf(90))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
  await clock.advance(30 * 60_000)
  await $.turn.complete(turnOf(29, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(false)
  await clock.advance(60 * 60_000)
  await $.turn.complete(turnOf(59, 't3'))
  await clock.settle()
  const said = await saidNow($)
  expect(isBreakLine(said)).toBe(true)
  expect(said).toContain('3 hours')
})

test('a break due while muted waits, and comes at the first turn end after unmuting', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await runner($)('mute')
  await $.turn.complete(turnOf(95))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  await runner($)('unmute')
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await bubbleOf(ui))).toBe(true)
})
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
  // Errored turns with no calls: each gets a quip, and none echoes a kind of memory.
  for (let i = 0; i < 60; i++) {
    await $.turn.complete({ ...TURN, turnId: `t${i}`, reason: 'error' })
    await clock.settle()
    await clock.advance(4 * 60_000)
  }
  expect(prompts).toHaveLength(60)
  // At 0.30, no memory in 60 quips comes about once in two billion runs, and one in all 60 never.
  const remembered = prompts.filter(p => p.includes('\nA memory (')).length
  expect(remembered).toBeGreaterThan(0)
  expect(remembered).toBeLessThan(60)
```
with:
```tsx
  // Errored turns with no calls: each gets a quip, and none echoes a kind of memory. Four minutes
  // apart they are one long stretch, so the turns 92 and 184 minutes in get a break nudge instead.
  for (let i = 0; i < 60; i++) {
    await $.turn.complete({ ...TURN, turnId: `t${i}`, reason: 'error' })
    await clock.settle()
    await clock.advance(4 * 60_000)
  }
  expect(prompts).toHaveLength(58)
  // At 0.30, no memory in 58 quips comes about once in a billion runs, and one in all 58 never.
  const remembered = prompts.filter(p => p.includes('\nA memory (')).length
  expect(remembered).toBeGreaterThan(0)
  expect(remembered).toBeLessThan(58)
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. `breaks.test.ts` can't find `./breaks`, the yawn test fails (no sleep frame for `'yawn'`), and the new mod tests and the 60-turn memory test (60 quips, expected 58) fail.

- [ ] **Step 3: Write the code**

Create `buddy/hooks/breaks.ts`:
```ts
// Break nudges (Interaction spec section 5): a run of main turns with no gap longer than 10
// minutes, and when it has gone on long enough to suggest a break. Pure: no $.

export const BREAK_GAP_MS = 10 * 60_000
export const STRETCH_MS = 90 * 60_000

// A run of main turns, in ms: when its first turn started, when its last one ended, and when it
// last nudged, null before its first nudge.
export type Stretch = { start: number; lastEnd: number; nudgedAt: number | null }

// The stretch once a main turn that ran from `start` to `end` is done: the same one carried on,
// or a new one after a gap of more than 10 minutes.
export function nextStretch(stretch: Stretch | null, start: number, end: number): Stretch {
  if (stretch === null || start - stretch.lastEnd > BREAK_GAP_MS) return { start, lastEnd: end, nudgedAt: null }
  return { ...stretch, lastEnd: end }
}

// Due 90 minutes into a stretch, then every 90 minutes after its last nudge.
export function breakDue(stretch: Stretch | null, now: number): boolean {
  return stretch !== null && now - (stretch.nudgedAt ?? stretch.start) >= STRETCH_MS
}

// How long a stretch has run: "95 minutes" under 2 hours, rounded down to 5; then by the half
// hour, rounded down: "2 hours", "2 and a half hours".
export function spanText(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 120) return `${Math.floor(minutes / 5) * 5} minutes`
  const halves = Math.floor(minutes / 30)
  const hours = Math.floor(halves / 2)
  return halves % 2 === 0 ? `${hours} hours` : `${hours} and a half hours`
}

export const BREAK_LINES: readonly string[] = [
  "*yawn* That's {span} straight. Stretch your legs?",
  '*yawn* {span} without a break. Water, maybe?',
  '*yawn* Even I need a break after {span}.',
  '*yawn* {span} in. Go look at something far away.',
]

// The `n`th break line, for a stretch `ms` long.
export function breakLine(n: number, ms: number): string {
  return BREAK_LINES[((n % BREAK_LINES.length) + BREAK_LINES.length) % BREAK_LINES.length]!.replace('{span}', spanText(ms))
}
```

In `buddy/types/index.d.ts`, replace:
```ts
      // A flinch or celebrate and the tick it ends on (Alive spec section 4).
      pose: { kind: 'flinch' | 'celebrate'; untilTick: number } | null
```
with:
```ts
      // A flinch, celebrate or yawn and the tick it ends on (Alive spec section 4, Interaction
      // spec section 5).
      pose: { kind: 'flinch' | 'celebrate' | 'yawn'; untilTick: number } | null
```

In `buddy/hooks/look.ts`, replace:
```ts
// A snack is on the hat row for 5 ticks, the last 2 of them as crumbs (Interaction spec section 2).
```
with:
```ts
// A yawn before a break nudge (Interaction spec section 5).
export const YAWN_TICKS = 4
// A snack is on the hat row for 5 ticks, the last 2 of them as crumbs (Interaction spec section 2).
```

In `buddy/hooks/look.ts`, replace:
```ts
  // A flinch or celebrate still running. Only the debug tour poses 'sleep'; otherwise sleep
  // comes from idle time.
  pose: Pose | null
```
with:
```ts
  // A flinch, celebrate or yawn still running. Only the debug tour poses 'sleep'; otherwise sleep
  // comes from idle time.
  pose: Pose | 'yawn' | null
```

In `buddy/hooks/look.ts`, replace:
```ts
  const asleep = isAsleep(s)
  const pose: Pose | null = asleep ? 'sleep' : s.pose
```
with:
```ts
  const asleep = isAsleep(s)
  // A yawn is the sleep frame with its closed eyes, awake: no zZ.
  const pose: Pose | null = asleep || s.pose === 'yawn' ? 'sleep' : s.pose
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { CELEBRATE_TICKS, FLINCH_TICKS, SNACK_TICKS, draw, portrait } from './look'
```
with:
```tsx
import { breakDue, breakLine, nextStretch } from './breaks'
import type { Stretch } from './breaks'
import { CELEBRATE_TICKS, FLINCH_TICKS, SNACK_TICKS, YAWN_TICKS, draw, portrait } from './look'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
let turnNo = 0
let flaggedTurn = -1
```
with:
```tsx
let turnNo = 0
let flaggedTurn = -1
// The run of main turns a break nudge watches (Interaction spec section 5). Lost on a reload, which
// starts it over: at worst a nudge comes later.
let stretch: Stretch | null = null
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// Queues mood events for the active buddy and strikes a pose, under the rules for counting
// (Alive spec sections 2 and 4). A celebration never cuts a flinch short.
async function feel($: EngineInterface, events: readonly MoodEvent[], kind: 'flinch' | 'celebrate' | null) {
  const seed = await countedSeed($)
  if (seed === null) return
  if (events.length > 0) await update($, pendingMood, p => ({ ...p, [seed]: queueNewest(p[seed], events, MAX_QUEUED_MOOD) }))
  if (kind === null) return
  const now = await read($, tick)
  const untilTick = now + (kind === 'flinch' ? FLINCH_TICKS : CELEBRATE_TICKS)
  await update($, posing, p =>
    kind === 'celebrate' && p?.kind === 'flinch' && now < p.untilTick ? p : { kind, untilTick },
  )
}
```
with:
```tsx
const POSE_TICKS = { flinch: FLINCH_TICKS, celebrate: CELEBRATE_TICKS, yawn: YAWN_TICKS } as const

// Queues mood events for the active buddy and strikes a pose, under the rules for counting
// (Alive spec sections 2 and 4). A celebration never cuts a flinch short, and a yawn never cuts
// either short.
async function feel($: EngineInterface, events: readonly MoodEvent[], kind: 'flinch' | 'celebrate' | 'yawn' | null) {
  const seed = await countedSeed($)
  if (seed === null) return
  if (events.length > 0) await update($, pendingMood, p => ({ ...p, [seed]: queueNewest(p[seed], events, MAX_QUEUED_MOOD) }))
  if (kind === null) return
  const now = await read($, tick)
  const untilTick = now + POSE_TICKS[kind]
  await update($, posing, p => {
    const running = p !== null && now < p.untilTick
    return running && (kind === 'yawn' || (kind === 'celebrate' && p.kind === 'flinch')) ? p : { kind, untilTick }
  })
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is
// pending. A quip may call back to a journal moment.
```
with:
```tsx
// The reaction slot a finished main turn has (Interaction spec section 6): a break nudge when one
// is due, else a quip.
async function respond($: EngineInterface, summary: TurnSummary, facts: TurnFacts) {
  if (await nudgeBreak($)) return
  await react($, summary, facts)
}

// A break nudge, once the stretch has run long enough (Interaction spec section 5): a yawn and a
// canned line, no model call, only when on. One that can't be said now stays due. Returns whether
// it took the turn's reaction slot.
async function nudgeBreak($: EngineInterface): Promise<boolean> {
  const saved = await read($, record)
  const now = await $.clock.now()
  const run = stretch
  if (!saved || saved.mode !== 'on' || (await read($, hatching)) || !run || !breakDue(run, now)) return false
  if ((await newsShowing($)) !== null) return false
  stretch = { ...run, nudgedAt: now }
  await feel($, [], 'yawn')
  await showBubble($, breakLine(cannedCount++, now - run.start))
  return true
}

// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is
// pending. A quip may call back to a journal moment.
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        later($, () => countAndFlush($, turn, felt ? [felt] : [], kind, facts))
        later($, () => react($, summary, facts))
```
with:
```tsx
        later($, () => countAndFlush($, turn, felt ? [felt] : [], kind, facts))
        const end = await $.clock.now()
        stretch = nextStretch(stretch, end - e.durationMs, end)
        later($, () => respond($, summary, facts))
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 362 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/breaks.ts buddy/types/index.d.ts buddy/hooks/look.ts buddy/hooks/register.tsx buddy/hooks/breaks.test.ts buddy/hooks/look.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: the buddy yawns and suggests a break after 90 minutes of turns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The rubber duck

**Files:**
- Create: `buddy/hooks/duck.ts`, `buddy/hooks/duck.test.ts`
- Modify: `buddy/types/index.d.ts`
- Modify: `buddy/hooks/voice.ts`, `buddy/hooks/voice.test.ts`
- Modify: `buddy/hooks/sprites.ts`, `buddy/hooks/sprites.test.ts`
- Modify: `buddy/hooks/look.ts`, `buddy/hooks/look.test.ts`
- Modify: `buddy/hooks/register.tsx`, `buddy/hooks/buddy.test.tsx`

**Interfaces:**
- Consumes: `ask`, `inFlight`, `newsShowing`, `showBubble`, `adopt`, `respond` and `nudgeBreak` in `register.tsx`; `Prop` from `sprites.ts`; `CROWNED`, `TWO`, `LONG_DONE`, `turnOf`, `isBreakLine` and `saidNow` in `buddy.test.tsx`.
- Produces:
  - from `duck.ts`: `DUCK_FAILS` (3), `NUDGE_GAP_MS`, `DUCK_MS`, `failsByTool(failed)`, `duckDue(prevFails, failed): { tool: string; n: number } | null`, `shouldNudge({ mode, inFlight, newsUp, now, lastNudgeAt })`, `toolName(tool)`, `duckPrompt(name, tool, n)`, `duckFallback(name, tool, n)`, `duckLine(tool)`
  - `talkPrompt(message, memories = [], duck: string | null = null)` in `voice.ts`
  - `DUCK_PROP: Prop` from `sprites.ts`; `Scene.duck?: boolean` in `look.ts`
  - `duckUntil`, `duckTool` and `lastNudgeAt` in `PluginState`
  - in `register.tsx`: `respond($, summary, facts, duck)`, `nudgeDuck($, due)`, `duckTalk($)`, and the module variable `prevFails`

The turn end works out whether a tool is due before its failures replace the last turn's. `respond` gives the reaction slot to the duck first, then a break, then a quip. The offer skips the quip cooldown, since the turn that first failed has usually just quipped, but it moves `lastQuipAt`, so the next quip waits a full cooldown. Duck mode lives in `$.state`; a talk inside it carries the duck line and keeps it going, and a change of buddy ends it in `adopt`.

- [ ] **Step 1: Write the failing tests**

Create `buddy/hooks/duck.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import {
  NUDGE_GAP_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge, toolName,
} from './duck'

test('a tool is due at 3 failures across this turn and the one before, with one at least in this turn', () => {
  expect(duckDue({}, ['Bash', 'Bash', 'Bash'])).toEqual({ tool: 'Bash', n: 3 })
  expect(duckDue({ Bash: 2 }, ['Bash'])).toEqual({ tool: 'Bash', n: 3 })
  expect(duckDue({ Bash: 2 }, ['Read', 'Bash', 'Read'])).toEqual({ tool: 'Bash', n: 3 })
  expect(duckDue({ Bash: 1 }, ['Bash'])).toBeNull()
  expect(duckDue({ Bash: 2 }, [])).toBeNull()
  expect(duckDue({ Bash: 3 }, ['Edit'])).toBeNull()
  expect(duckDue({}, [])).toBeNull()
})

test('of two tools due, the one that failed more wins, then the one that failed last', () => {
  expect(duckDue({ Bash: 2 }, ['Edit', 'Edit', 'Edit', 'Bash', 'Bash'])).toEqual({ tool: 'Bash', n: 4 })
  expect(duckDue({ Bash: 1 }, ['Edit', 'Edit', 'Edit', 'Bash', 'Bash'])).toEqual({ tool: 'Bash', n: 3 })
  expect(duckDue({ Bash: 1 }, ['Edit', 'Bash', 'Bash', 'Edit', 'Edit'])).toEqual({ tool: 'Edit', n: 3 })
  expect(failsByTool(['Bash', 'Edit', 'Bash'])).toEqual({ Bash: 2, Edit: 1 })
})

test('a nudge is said only when on, with no call in flight or announcement up, 30 minutes after the last', () => {
  const now = 10 * NUDGE_GAP_MS
  const base = { mode: 'on' as const, inFlight: false, newsUp: false, now, lastNudgeAt: 0 }
  expect(shouldNudge(base)).toBe(true)
  expect(shouldNudge({ ...base, lastNudgeAt: now - NUDGE_GAP_MS })).toBe(true)
  expect(shouldNudge({ ...base, lastNudgeAt: now - NUDGE_GAP_MS + 1 })).toBe(false)
  expect(shouldNudge({ ...base, mode: 'muted' })).toBe(false)
  expect(shouldNudge({ ...base, mode: 'off' })).toBe(false)
  expect(shouldNudge({ ...base, inFlight: true })).toBe(false)
  expect(shouldNudge({ ...base, newsUp: true })).toBe(false)
})

test('the offer, its fallback and the duck line name the tool as the buddy says it', () => {
  expect(toolName('Bash')).toBe('Bash')
  expect(toolName('mcp__github__create_issue')).toBe('create_issue')
  expect(toolName('mcp__odd')).toBe('mcp__odd')
  expect(duckPrompt('Pip', 'Bash', 3)).toBe(
    'Claude just failed Bash 3 times over its last two turns, and the developer may be stuck.\n' +
      'Offer, in one line, to be their rubber duck: they can talk it through with you by starting a message with "Pip,".',
  )
  expect(duckFallback('Pip', 'mcp__github__create_issue', 4)).toBe(
    '4 failed create_issue calls. Want to talk it through? Start with "Pip,".',
  )
  expect(duckLine('Bash')).toBe(
    "You're the developer's rubber duck: Bash kept failing. Ask one short question that helps them say what they " +
      "expected and what happened instead. Don't guess at a fix; you can't see their code.",
  )
})
```

In `buddy/hooks/voice.test.ts`, replace:
```ts
  expect(talkPrompt('hi')).toBe('The developer says to you: hi\nReply in one line.')
```
with:
```ts
  expect(talkPrompt('hi')).toBe('The developer says to you: hi\nReply in one line.')
  expect(talkPrompt('hi', ['- today: x'], 'Be a duck.')).toBe(
    'The developer says to you: hi\n- today: x\nBe a duck.\nReply in one line.',
  )
```

In `buddy/hooks/sprites.test.ts`, replace:
```ts
  BLANK, CONFETTI, CRUMBS, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS,
  PROP_W, SNACK_ART, SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
```
with:
```ts
  BLANK, CONFETTI, CRUMBS, DUCK_PROP, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS,
  PROP_ROWS, PROP_W, SNACK_ART, SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows,
  topRow,
```

Append to the end of `buddy/hooks/sprites.test.ts`:
```ts
test('the rubber duck fits a prop box, with its paint inside it', () => {
  expect(DUCK_PROP.art).toHaveLength(PROP_ROWS)
  DUCK_PROP.art.forEach((row, i) => {
    expect([i, [...row].length <= PROP_W]).toEqual([i, true])
    expect([i, (DUCK_PROP.paint?.[i] ?? '').length <= row.length]).toEqual([i, true])
  })
})
```

In `buddy/hooks/look.test.ts`, replace:
```ts
import {
  CONFETTI, CRUMBS, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, SPRITE_W, ZZZ, bodyRows, fillEyes,
} from './sprites'
```
with:
```ts
import {
  CONFETTI, CRUMBS, DUCK_PROP, HAT_ART, HEARTS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, SPRITE_W, ZZZ, bodyRows, fillEyes,
} from './sprites'
```

Append to the end of `buddy/hooks/look.test.ts`:
```ts
test('in duck mode the rubber duck stands in for a holiday prop, and hides while something is said', () => {
  expect(draw({ ...CALM, duck: true }).prop).toBe(DUCK_PROP)
  expect(draw({ ...CALM, duck: true, holiday: JULY4 }).prop).toBe(DUCK_PROP)
  expect(draw({ ...CALM, duck: true, saying: true }).prop).toBeNull()
  expect(draw({ ...CALM, duck: false, holiday: JULY4 }).prop).toBe(PROPS.july4)
})
```

In `buddy/hooks/buddy.test.tsx`, replace:
```tsx
import { FULL_LINES, PLAY_FALLBACKS, SNACKS, feedPrompt } from './toys'
```
with:
```tsx
import { FULL_LINES, PLAY_FALLBACKS, SNACKS, feedPrompt } from './toys'
import { duckLine, duckPrompt } from './duck'
```

Append to the end of `buddy/hooks/buddy.test.tsx`:
```tsx
const OFFER = 'Want to talk it through?'
// The rubber duck's yellow body in the band's prop column.
const duckDrawn = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const body = await ui.find({ type: 'Text', text: /^\(\.\)__$/ })
  await ui.unmount()
  return body?.props.color === 'yellow'
}
const fail = async ($: Engine, times: number) => {
  for (let i = 0; i < times; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
}

test('a tool that fails 3 times across two turns gets one rubber-duck offer in place of a quip, then the duck stands by', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const quips = () => prompts.filter(p => p.startsWith('Claude just finished a turn'))
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  await fail($, 2)
  await $.turn.complete(TURN)
  await clock.settle()
  expect([quips().length, offers().length]).toEqual([1, 0])
  // Past the quip cooldown, so this turn would quip if the offer didn't take its place.
  await clock.advance(7 * 60_000)
  await fail($, 1)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3)])
  expect(quips()).toHaveLength(1)
  expect(await saidNow($)).toBe(OFFER)
  expect(await duckDrawn($)).toBe(false)
  // Once the bubble has gone, the duck stands beside the buddy until duck mode runs out.
  await clock.advance(13_000)
  expect(await duckDrawn($)).toBe(true)
  await clock.advance(15 * 60_000)
  expect(await duckDrawn($)).toBe(false)
})

test('an offer the model leaves unanswered is canned; talk inside duck mode is rubber-ducked and keeps it going', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    return { value: e.prompt.startsWith('Claude just failed') ? failed() : ok('Walk me through it.') }
  })
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await saidNow($)).toBe('3 failed Bash calls. Want to talk it through? Start with "Pip,".')
  const talk = async () => {
    await $.prompt.submit({ text: 'Pip, the build keeps failing', wait: false, origin: { kind: 'composer' } })
    await clock.settle()
    return prompts.at(-1) ?? ''
  }
  // 10 minutes on, a talk carries the duck line and keeps duck mode 15 minutes from then.
  await clock.advance(10 * 60_000)
  expect(await talk()).toContain(duckLine('Bash'))
  await clock.advance(14 * 60_000)
  expect(await talk()).toContain(duckLine('Bash'))
  // 16 minutes after the last talk, it has run out.
  await clock.advance(16 * 60_000)
  expect(await talk()).not.toContain('rubber duck')
})

test('a second run of failures inside 30 minutes gets no offer; one after 30 does', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(offers()).toHaveLength(1)
  await clock.advance(10 * 60_000)
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(offers()).toHaveLength(1)
  // Not nudged, the last turn's 3 count with this one's.
  await clock.advance(21 * 60_000)
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't3' })
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3), duckPrompt('Pip', 'Bash', 6)])
})

test('a muted or hidden buddy makes no offer and calls no model', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await runner($)('mute')
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  await runner($)('off')
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(prompts).toEqual([])
})

test('a swap ends duck mode: the buddy back gets no duck line', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts.filter(p => p.startsWith('Claude just failed'))).toEqual([duckPrompt('Mochi', 'Bash', 3)])
  expect(await runner($)('swap Pip')).toBe('Pip is back.')
  await clock.advance(60_000)
  await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(prompts.at(-1)).toContain('The developer says to you: hi')
  expect(prompts.at(-1)).not.toContain('rubber duck')
  expect(await duckDrawn($)).toBe(false)
})

test('a duck offer and a break due at one turn end: the offer, then the break at the next turn end', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(turnOf(90))
  await clock.settle()
  expect(await saidNow($)).toBe(OFFER)
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
})
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: FAIL. The duck and mod test files can't find `./duck`, the sprite and look test files don't load (`Export named 'DUCK_PROP' not found in module …sprites.ts`), and the new voice test fails.

- [ ] **Step 3: Write the code**

Create `buddy/hooks/duck.ts`:
```ts
// The rubber duck (Interaction spec section 4): when one tool keeps failing, the buddy offers to
// talk it through, and for a while after, talking to it gets rubber-duck questions. Pure: no $.
import type { Mode } from '../types'

// Failures of one tool across a turn and the one before it that make a nudge due.
export const DUCK_FAILS = 3
// The least time between two nudges, and how long duck mode lasts after a nudge or a talk.
export const NUDGE_GAP_MS = 30 * 60_000
export const DUCK_MS = 15 * 60_000

// A turn's failed calls, by tool name.
export function failsByTool(failed: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tool of failed) counts[tool] = (counts[tool] ?? 0) + 1
  return counts
}

// The tool to nudge about once a main turn ends, with how often it failed across this turn and the
// one before; null when none is due. A tool is due once it has failed DUCK_FAILS times across the
// two, at least once in this turn. Of two due, the one that failed more wins, then the one that
// failed last. `failed` is this turn's failed calls in order.
export function duckDue(
  prevFails: Readonly<Record<string, number>>,
  failed: readonly string[],
): { tool: string; n: number } | null {
  let best: { tool: string; n: number; last: number } | null = null
  for (const [tool, here] of Object.entries(failsByTool(failed))) {
    const n = here + (prevFails[tool] ?? 0)
    const last = failed.lastIndexOf(tool)
    if (n >= DUCK_FAILS && (!best || n > best.n || (n === best.n && last > best.last))) best = { tool, n, last }
  }
  return best && { tool: best.tool, n: best.n }
}

// Whether a due nudge may be said now: on, no model call in flight, no announcement up, and 30
// minutes since the last one.
export function shouldNudge(o: {
  mode: Mode
  inFlight: boolean
  newsUp: boolean
  now: number
  lastNudgeAt: number
}): boolean {
  return o.mode === 'on' && !o.inFlight && !o.newsUp && o.now - o.lastNudgeAt >= NUDGE_GAP_MS
}

// A tool's name as the buddy says it: an MCP tool without its `mcp__server__` prefix.
export function toolName(tool: string): string {
  return (tool.startsWith('mcp__') && tool.split('__').slice(2).join('__')) || tool
}

export function duckPrompt(name: string, tool: string, n: number): string {
  return [
    `Claude just failed ${toolName(tool)} ${n} times over its last two turns, and the developer may be stuck.`,
    `Offer, in one line, to be their rubber duck: they can talk it through with you by starting a message with "${name},".`,
  ].join('\n')
}

// The offer when the model doesn't answer.
export function duckFallback(name: string, tool: string, n: number): string {
  return `${n} failed ${toolName(tool)} calls. Want to talk it through? Start with "${name},".`
}

// The line a talk's prompt carries while duck mode lasts.
export function duckLine(tool: string): string {
  return (
    `You're the developer's rubber duck: ${toolName(tool)} kept failing. Ask one short question that helps them ` +
    "say what they expected and what happened instead. Don't guess at a fix; you can't see their code."
  )
}
```

In `buddy/types/index.d.ts`, replace:
```ts
      snack: { kind: Snack; untilTick: number } | null
      lastFedAt: number
```
with:
```ts
      snack: { kind: Snack; untilTick: number } | null
      lastFedAt: number
      // When duck mode ends, in ms, 0 when it's off; the tool it's about; and when the last duck
      // nudge fired (Interaction spec section 4).
      duckUntil: number
      duckTool: string | null
      lastNudgeAt: number
```

In `buddy/hooks/voice.ts`, replace:
```ts
// `memories` are the journal lines a talk may draw on (Memory spec section 4).
export function talkPrompt(message: string, memories: readonly string[] = []): string {
  return [`The developer says to you: ${message.slice(0, 500)}`, ...memories, 'Reply in one line.'].join('\n')
}
```
with:
```ts
// `memories` are the journal lines a talk may draw on (Memory spec section 4), and `duck` the
// rubber-duck line while duck mode lasts (Interaction spec section 4).
export function talkPrompt(message: string, memories: readonly string[] = [], duck: string | null = null): string {
  const lines = [`The developer says to you: ${message.slice(0, 500)}`, ...memories, ...(duck ? [duck] : [])]
  return [...lines, 'Reply in one line.'].join('\n')
}
```

In `buddy/hooks/sprites.ts`, replace:
```ts
export const PROPS: Readonly<Partial<Record<HolidayId, Prop>>> = {
```
with:
```ts
// The rubber duck beside the buddy while duck mode lasts (Interaction spec section 4).
export const DUCK_PROP: Prop = {
  art: ['', '    _', '  <(.)__', '   (___/', ''],
  paint: ['', '    y', '  ryyyyy', '   yyyyy', ''],
}

export const PROPS: Readonly<Partial<Record<HolidayId, Prop>>> = {
```

In `buddy/hooks/look.ts`, replace:
```ts
import { CRUMBS, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, faceFor, frameAt, spriteRows, topRow } from './sprites'
```
with:
```ts
import {
  CRUMBS, DUCK_PROP, HOLIDAY_HATS, POSE_EYE, PROPS, SNACK_ART, faceFor, frameAt, spriteRows, topRow,
} from './sprites'
```

In `buddy/hooks/look.ts`, replace:
```ts
  // A snack being eaten and the tick it's gone by. Missing reads as none.
  snack?: { kind: Snack; untilTick: number } | null
}
```
with:
```ts
  // A snack being eaten and the tick it's gone by. Missing reads as none.
  snack?: { kind: Snack; untilTick: number } | null
  // Duck mode: the rubber duck stands in for any holiday prop. Missing reads as off.
  duck?: boolean
}
```

In `buddy/hooks/look.ts`, replace:
```ts
    prop: s.holiday && !s.saying ? (PROPS[s.holiday.id] ?? null) : null,
```
with:
```ts
    prop: s.saying ? null : s.duck ? DUCK_PROP : s.holiday ? (PROPS[s.holiday.id] ?? null) : null,
```

In `buddy/hooks/register.tsx`, replace:
```tsx
import { dayInfo } from './calendar'
```
with:
```tsx
import { dayInfo } from './calendar'
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
```

In `buddy/hooks/register.tsx`, replace:
```tsx
const lastFedAt = atom({ plugin: 'buddy', key: 'lastFedAt' } as const, 0)
```
with:
```tsx
const lastFedAt = atom({ plugin: 'buddy', key: 'lastFedAt' } as const, 0)
const duckUntil = atom({ plugin: 'buddy', key: 'duckUntil' } as const, 0)
const duckTool = atom({ plugin: 'buddy', key: 'duckTool' } as const, null)
const lastNudgeAt = atom({ plugin: 'buddy', key: 'lastNudgeAt' } as const, 0)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
let stretch: Stretch | null = null
```
with:
```tsx
let stretch: Stretch | null = null
// The last main turn's failed calls by tool, for the rubber duck (Interaction spec section 4).
let prevFails: Record<string, number> = {}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
  if (saved.mode === 'off' || saved.active !== before?.active) roughTurns = 0
```
with:
```tsx
  if (saved.mode === 'off' || saved.active !== before?.active) roughTurns = 0
  // Duck mode belongs to the buddy that offered it (Interaction spec section 4).
  if (saved.active !== before?.active) await update($, duckUntil, () => 0)
```

In `buddy/hooks/register.tsx`, replace:
```tsx
// The reaction slot a finished main turn has (Interaction spec section 6): a break nudge when one
// is due, else a quip.
async function respond($: EngineInterface, summary: TurnSummary, facts: TurnFacts) {
  if (await nudgeBreak($)) return
  await react($, summary, facts)
}
```
with:
```tsx
// The reaction slot a finished main turn has (Interaction spec section 6): the rubber duck when a
// tool keeps failing, else a break nudge when one is due, else a quip.
async function respond(
  $: EngineInterface,
  summary: TurnSummary,
  facts: TurnFacts,
  duck: { tool: string; n: number } | null,
) {
  if (duck && (await nudgeDuck($, duck))) return
  if (await nudgeBreak($)) return
  await react($, summary, facts)
}

// The rubber-duck offer (Interaction spec section 4): one Haiku call in the turn's reaction slot,
// past the quip cooldown but at most once in 30 minutes, and then duck mode. Returns whether it
// took the turn's reaction slot.
async function nudgeDuck($: EngineInterface, due: { tool: string; n: number }): Promise<boolean> {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return false
  const now = await $.clock.now()
  const say = shouldNudge({
    mode: saved.mode,
    inFlight: inFlight !== null,
    newsUp: (await newsShowing($)) !== null,
    now,
    lastNudgeAt: await read($, lastNudgeAt),
  })
  if (!say) return false
  // The same failures never nudge twice, and the next quip waits out a full cooldown.
  prevFails = {}
  await update($, lastNudgeAt, () => now)
  await update($, lastQuipAt, () => now)
  const buddy = activeBuddy(saved)
  const name = buddy.soul.name
  const replied = await read($, lastReplyAt)
  const text = await ask($, buddy, bonesFor(buddy), duckPrompt(name, due.tool, due.n), 'react')
  // A reply that cut the call short wins; an answer that comes back over an announcement is dropped.
  if (text === null && (await read($, lastReplyAt)) !== replied) return true
  if ((await newsShowing($)) !== null) return true
  await showBubble($, text ?? duckFallback(name, due.tool, due.n))
  const shown = await $.clock.now()
  await update($, duckUntil, () => shown + DUCK_MS)
  await update($, duckTool, () => due.tool)
  return true
}

// The duck line a talk carries while duck mode lasts; the talk keeps duck mode for 15 minutes
// more (Interaction spec section 4). Null once it has run out.
async function duckTalk($: EngineInterface): Promise<string | null> {
  const now = await $.clock.now()
  const tool = await read($, duckTool)
  if (tool === null || now >= (await read($, duckUntil))) return null
  await update($, duckUntil, () => now + DUCK_MS)
  return duckLine(tool)
}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
    snack: await read($, snackShown),
```
with:
```tsx
    snack: await read($, snackShown),
    duck: now < (await read($, duckUntil)),
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        const facts = turnFacts(e.reason, e.durationMs, turnCalls, roughTurns)
        tally = {}
```
with:
```tsx
        const facts = turnFacts(e.reason, e.durationMs, turnCalls, roughTurns)
        // Judged before this turn's failures take the last turn's place (Interaction spec section 4).
        const duck = duckDue(prevFails, failedTools)
        prevFails = failsByTool(failedTools)
        tally = {}
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        later($, () => respond($, summary, facts))
```
with:
```tsx
        later($, () => respond($, summary, facts, duck))
```

In `buddy/hooks/register.tsx`, replace:
```tsx
        later($, async () => soothe($, { kind: 'talk' }, buddy, talkPrompt(message, await talkMemoryLines($, buddy.journal))))
```
with:
```tsx
        later($, async () => {
          const prompt = talkPrompt(message, await talkMemoryLines($, buddy.journal), await duckTalk($))
          await soothe($, { kind: 'talk' }, buddy, prompt)
        })
```

- [ ] **Step 4: Run the tests**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy 2>&1 | tail -20
```
Expected: 374 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add buddy/hooks/duck.ts buddy/types/index.d.ts buddy/hooks/voice.ts buddy/hooks/sprites.ts buddy/hooks/look.ts buddy/hooks/register.tsx buddy/hooks/duck.test.ts buddy/hooks/voice.test.ts buddy/hooks/sprites.test.ts buddy/hooks/look.test.ts buddy/hooks/buddy.test.tsx
git commit -F - <<'EOF'
feat: the rubber duck: an offer when one tool keeps failing, then rubber-duck talk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Type-check, version, README, and record what shipped

**Files:**
- Modify: `buddy/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-10-08-buddy-interaction-design.md` (status line)

**Interfaces:**
- Consumes: the finished Interaction build.
- Produces: a type-checked mod at version 0.6.0, a README that says what it saves and does, and an accurate spec status.

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
- `Dressed` against `Bones`: a function that takes `Bones` and is now handed a buddy in its worn hat needs `Dressed` (Task 2 changed the card and layout ones)
- `{ hat: _, ...rest }` in `applyChange`'s `hat` case
- the `snack` and `duckTool` atoms' `null` initial values

- [ ] **Step 2: Bump the version**

In `buddy/.claude-plugin/plugin.json`, replace:
```json
  "version": "0.5.0",
```
with:
```json
  "version": "0.6.0",
```

- [ ] **Step 3: Update the README**

In `README.md`, replace:
```
| `/buddy pet` | Hearts, then a reply |
```
with:
```
| `/buddy pet` | Hearts, then a reply |
| `/buddy feed` | A snack, then a reply; it counts as a pet. Fed again within 10 minutes, it's full |
| `/buddy play [game]` | Dice, a coin toss or rock-paper-scissors: `dice`, `coin`, `rps`, or a pick like `rock` or `heads`. With no game named, one at random. It counts as a pet |
```

In `README.md`, replace:
```
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
```
with:
```
| `/buddy swap <who>` | Bring a buddy back from the dex, by name or number; the one here now retires |
| `/buddy rename <name>` | A new name: one word, letters only, at most 12 characters |
| `/buddy hat [hat]` | The hats it can wear, or put one on: the one it rolled, any you've earned, or `none` |
```

In `README.md`, replace:
```
and six of them unlock a hat no roll gives. Choosing one to wear comes in a later update. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.
```
with:
```
and six of them unlock a hat no roll gives, which `/buddy hat` puts on it. `/buddy dex` lists every buddy you've had, and `/buddy swap` brings one back.

It notices how you're doing. When one tool fails three times across two turns, it offers to be your rubber duck, and for 15 minutes after, talking to it gets questions that help you say what you expected and what happened, not guesses at a fix. After 90 minutes of turns with no break longer than 10 minutes, it yawns and suggests one.
```

In `README.md`, replace:
```
- **Model calls.** It calls Haiku on your account for four things:
  - once when it hatches
  - when you pet it or talk to it
  - once when a swap brings a buddy back, to say hello
  - for a comment after a turn, at most one every 3 minutes (longer for a patient buddy)

  Moods, reactions, holidays, the journal, levels, achievements and the line it says when a tool fails need no model call.
```
with:
```
- **Model calls.** It calls Haiku on your account for five things:
  - once when it hatches
  - when you pet it, feed it, play with it, rename it, change its hat or talk to it
  - once when a swap brings a buddy back, to say hello
  - for a comment after a turn, at most one every 3 minutes (longer for a patient buddy)
  - to offer to talk it through when a tool keeps failing, at most twice an hour

  Moods, reactions, holidays, the journal, levels, achievements, game results, break nudges and the line it says when a tool fails need no model call.
```

In `README.md`, replace:
```
It never sees your prompt, Claude's answer, file contents or command arguments.
```
with:
```
It never sees your prompt, Claude's answer, file contents or command arguments. The rubber-duck offer sees only the name of the tool that keeps failing and how often it failed.
```

In `README.md`, replace:
```
its seed, name, personality, hatch date, the time it was retired,
```
with:
```
its seed, name, personality, hatch date, the time it was retired, the hat you chose for it,
```

In `README.md`, replace:
```
These are point-in-time records: each spec's status line lists what changed during its build.
```
with:
```
Feeding, games, renaming, hats, the rubber duck and break nudges come from [`docs/specs/2026-10-08-buddy-interaction-design.md`](docs/specs/2026-10-08-buddy-interaction-design.md) and its plan, [`docs/specs/2026-10-08-buddy-interaction-plan.md`](docs/specs/2026-10-08-buddy-interaction-plan.md). These are point-in-time records: each spec's status line lists what changed during its build.
```

- [ ] **Step 4: Record what shipped**

```bash
sed -i "s|^\*\*Status:\*\* designed 2026-10-08; not built yet\.$|**Status:** built $(date +%F); live check pending. Plan: [\`2026-10-08-buddy-interaction-plan.md\`](2026-10-08-buddy-interaction-plan.md); its \"Deliberate deviations\" section lists ten small departures from this spec.|" docs/specs/2026-10-08-buddy-interaction-design.md
head -3 docs/specs/2026-10-08-buddy-interaction-design.md
```
Expected: the third line is the new status line with today's date.

- [ ] **Step 5: Final full run**

```bash
CC="$(ls "$(cygpath -u "$APPDATA")"/Claude/claude-code/*/*/claude.exe | sort -V | tail -1)"
"$CC" plugin test ./buddy && "$CC" plugin validate ./buddy
```
Expected: 374 pass, 0 fail. Validation passes, and its `state writes:` and `state reads:` lines include `buddy.snack`, `buddy.lastFedAt`, `buddy.duckUntil`, `buddy.duckTool` and `buddy.lastNudgeAt`. The two `gating hook without .catch` notes were there before this build.

- [ ] **Step 6: Commit**

```bash
git add buddy/.claude-plugin/plugin.json README.md docs/specs/2026-10-08-buddy-interaction-design.md
git commit -F - <<'EOF'
chore: buddy 0.6.0, with Interaction recorded as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: See it live**

The installed buddy runs the copy cached from GitHub, so it only picks up the change from `main`. Ask the person before pushing or merging. Once it's on `main`:
```bash
claude plugin update buddy@buddy-mods
```
Then, in a session, in the terminal and in the Desktop Code tab:
1. Run `/reload-plugins`.
2. Run `/buddy feed`: a snack on the hat row, crumbs, then the hat, and a reply. Run it again: a "full" line and no reply from the model.
3. Run `/buddy play`, `/buddy play rock` and `/buddy play coin heads`: each answers with its result at once, and a buddy win throws confetti.
4. Run `/buddy rename` with a new name, then talk to it by that name. Run `/buddy rename` with the old name to change it back.
5. Run `/buddy hat` to see what it can wear, put on an earned hat if you have one, and look at the band, `/buddy card` and `/buddy dex`. Then run `/buddy hat none` and put back the hat it rolled.
6. Ask Claude to run a command that fails three times, such as `ls /nope` three times over two turns. Expect the rubber-duck offer, then the duck beside the buddy once the bubble has gone. Talk to the buddy and expect a question back.
7. For a break nudge without waiting 90 minutes, set `STRETCH_MS` in `buddy/hooks/breaks.ts` to `2 * 60_000` in a local copy, load that copy, and take a few turns over 2 minutes. Expect a yawn and a break line. Put the value back afterwards.
8. Close each pane with Escape.

Report what was seen. Once it checks out:
- Change the spec's status line from `live check pending` to `live-checked` with the date, and commit that.
- Close issues #15, #16 and #17 with a pointer to the merge.
- Tick them in the roadmap issue, #18.
