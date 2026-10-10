// The saved record and the /buddy subcommands. Pure: no $.
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, Stage, TurnFacts } from '../types'
import { earn } from './achievements'
import {
  BREED_DEX, HATCH_TURNS, dueEgg, eggStatus, mulliganOpen, neverActive, readEgg, startEgg, withEggCount,
} from './eggs'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'
import { bornBones } from './breed'
import { ADULT_LEVEL, STAGES, grewMoments, levelOf } from './progress'
import type { Worn } from './sprites'
import { readPlay, wearable, wornHat } from './toys'
import type { Game, Side, Throw } from './toys'

export const STORE_KEY = 'buddy'
export const USAGE =
  'Usage: /buddy [pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | breed <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]'

// What the store holds, as this build reads it (Foundation spec section 1).
export type Stored =
  | { kind: 'none' }
  | { kind: 'ok'; saved: Saved }
  | { kind: 'damaged' }
  | { kind: 'foreign'; schema: string }

export function classify(raw: unknown): Stored {
  if (raw === undefined || raw === null) return { kind: 'none' }
  const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
  if (schema === 1) return { kind: 'ok', saved: printable(migrate(raw as SavedV1)) }
  if (schema === 2) {
    const saved = raw as Saved
    const intact = Array.isArray(saved.buddies) && saved.buddies.some(b => b.seed === saved.active)
    return intact ? { kind: 'ok', saved: printable(saved) } : { kind: 'damaged' }
  }
  return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
}

// C0 and C1 control characters, which a terminal acts on rather than shows.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g

// The record with every buddy's name and personality fit to show. A hatch never saves a control
// character, so only a store edited by hand carries one; it is dropped, and a name left empty
// reads as "Buddy". Returns `saved` itself when nothing needed it.
function printable(saved: Saved): Saved {
  let changed = false
  const buddies = saved.buddies.map(b => {
    const soul: unknown = b.soul
    if (typeof soul !== 'object' || soul === null) return b
    const { name, personality } = soul as Partial<Soul>
    const clean = {
      name: typeof name === 'string' ? name.replace(CONTROL, '') || 'Buddy' : name,
      personality: typeof personality === 'string' ? personality.replace(CONTROL, '') : personality,
    }
    if (clean.name === name && clean.personality === personality) return b
    changed = true
    return { ...b, soul: { ...b.soul, ...clean } as Soul }
  })
  return changed ? { ...saved, buddies } : saved
}

function fresh(seed: string, soul: Soul, rerolls: number): Saved {
  return {
    schema: 2,
    mode: 'on',
    rerolls,
    active: seed,
    buddies: [{ seed, soul, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, eggs: 0 },
  }
}

export function migrate(v1: SavedV1): Saved {
  return { ...fresh(v1.seed, v1.soul, v1.rerolls), mode: v1.mode }
}

// `classify` answers ok only when the active seed has an entry, and every change keeps it so.
export function activeBuddy(saved: Saved): Buddy {
  return saved.buddies.find(b => b.seed === saved.active)!
}

export type Change =
  // A first hatch, or the one mulligan (Breeding spec section 2).
  | { kind: 'hatch' | 'reroll'; seed: string; soul: Soul }
  | { kind: 'mode'; mode: Mode }
  | {
      kind: 'flush'
      pending: Readonly<Record<string, Counts>>
      // Mood events by seed, replayed in order (Alive spec section 2).
      mood?: Readonly<Record<string, readonly MoodEvent[]>>
      // Finished main turns by seed, for the journal (Memory spec section 3).
      turns?: Readonly<Record<string, readonly TurnFacts[]>>
      // The seed an owed egg starts from, if one starts (Breeding spec section 2).
      eggSeed?: string
    }
  | { kind: 'visit' }
  // A retired buddy made active again (Progression spec section 7).
  | { kind: 'swap'; seed: string }
  // A new name for one buddy, and the hat it wears (Interaction spec section 2).
  | { kind: 'rename'; seed: string; name: string }
  | { kind: 'hat'; seed: string; hat: Worn }
  // The active buddy and `partner` brooding the egg incubating (Breeding spec section 4).
  | { kind: 'breed'; partner: string }
  // The egg hatching into the dex, with the parents its soul was made for (Breeding spec section 3).
  | { kind: 'hatchEgg'; seed: string; parents: [string, string] | null; soul: Soul; eggSeed?: string }

// Today's visit (Foundation spec section 3). A new day after two or more missed ones leaves the
// active buddy sulking (Alive spec section 2), and after three or more it goes in that buddy's
// journal (Memory spec section 3). Returns `saved` itself when the day is not new.
function arrive(saved: Saved, now: number): Saved {
  const today = localDay(now)
  const you = visit(saved.you, today)
  if (you === saved.you) return saved
  const sulk = sulkFor(saved.you.lastDay, today)
  const away = awayMoment(saved.you.lastDay, today, now)
  const buddies =
    sulk > 0 || away
      ? saved.buddies.map(b =>
          b.seed === saved.active
            ? {
                ...b,
                ...(sulk > 0 ? { mood: withSulk(b.mood, sulk, now) } : {}),
                ...(away ? { journal: addMoments(b.journal, [away]) } : {}),
              }
            : b,
        )
      : saved.buddies
  return { ...saved, you, buddies }
}

// A retired buddy coming back (Progression spec section 7): out of retirement, sulking for the
// days it was left, and with "away" in its journal after three or more missed days, as a visit
// gives. A retirement time that doesn't parse leaves neither. A hatchling never yet active,
// retired the moment it hatched, waited for nobody, so it gets neither (Breeding spec section 3).
function welcomeBack(b: Buddy, today: string, now: number): Buddy {
  if (neverActive(b)) return { ...b, retiredAt: null }
  const left = b.retiredAt !== null && Number.isFinite(Date.parse(b.retiredAt)) ? localDay(Date.parse(b.retiredAt)) : null
  const sulk = sulkFor(left, today)
  const away = awayMoment(left, today, now)
  return {
    ...b,
    retiredAt: null,
    ...(sulk > 0 ? { mood: withSulk(b.mood, sulk, now) } : {}),
    ...(away ? { journal: addMoments(b.journal, [away]) } : {}),
  }
}

// One change, made on the stored object itself so fields a newer build wrote are kept.
// Null means there is nothing to write.
export function applyChange(saved: Saved | null, change: Change, now: number): Saved | null {
  const today = localDay(now)
  switch (change.kind) {
    case 'hatch':
    case 'reroll': {
      const counted = change.kind === 'reroll' ? 1 : 0
      if (!saved) {
        const born = fresh(change.seed, change.soul, counted)
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
    case 'mode':
      return saved && { ...saved, mode: change.mode }
    case 'flush': {
      if (!saved) return null
      // The visit comes first: it may set a sulk, and a pet in this same flush must ease that
      // sulk, not be undone by it.
      const arrived = arrive(saved, now)
      let added = false
      const buddies = arrived.buddies.map(b => {
        const more = change.pending[b.seed]
        const felt = change.mood?.[b.seed] ?? []
        const facts = change.turns?.[b.seed] ?? []
        if (!more && felt.length === 0 && facts.length === 0) return b
        added = true
        // Records are judged against what is stored, before this save's counts are added.
        const counts = more ? addCounts(b.counts, more) : b.counts
        const noticed = noticeTurns(facts, bestsOf(b), b.counts.longestTurnMs, now)
        const moments = [...noticed.moments, ...milestones(b.counts, counts, now), ...grewMoments(b.counts, counts, now)]
        return {
          ...b,
          ...(more ? { counts } : {}),
          ...(felt.length > 0 ? { mood: applyMood(b.mood, felt, now) } : {}),
          ...(facts.length > 0 ? { bests: { ...b.bests, ...noticed.bests } } : {}),
          ...(moments.length > 0 ? { journal: addMoments(b.journal, moments) } : {}),
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
      if (!saved) return null
      const arrived = arrive(saved, now)
      return arrived !== saved ? earn(arrived, now) : null
    }
    case 'swap': {
      if (!saved || change.seed === saved.active || !saved.buddies.some(b => b.seed === change.seed)) return null
      // The visit comes first, so a sulk from days away lands on the buddy left alone. It earns
      // nothing, as a hatch earns nothing: news isn't told across a change of buddy, so a streak
      // achievement this visit meets is earned, and announced, at the next flush.
      const arrived = arrive(saved, now)
      const retiredAt = new Date(now).toISOString()
      return {
        ...arrived,
        mode: 'on',
        active: change.seed,
        buddies: arrived.buddies.map(b =>
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
      // Judged on the fresh record: a hat it can wear, and a change from what it wears.
      if (!saved || !b || !wearable(b, saved).includes(change.hat) || wornHat(b, saved) === change.hat) return null
      const rolled = bornBones(saved.buddies, b.seed).hat
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
  }
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
  return a === undefined || b === null ? a === undefined && b === null : a[0] === b[0] && a[1] === b[1]
}

type Plain =
  'show' | 'pet' | 'feed' | 'dex' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug-off' | 'usage'
export type Sub = Plain | 'card' | 'journal' | 'swap' | 'breed' | 'debug' | 'rename' | 'hat' | 'play'

// A /buddy command as parsed: the subcommand, and what it was given (Progression spec section 7).
export type Parsed =
  | { sub: Plain }
  | { sub: 'card' | 'journal'; target?: string }
  | { sub: 'swap' | 'breed'; target: string }
  | { sub: 'debug'; stage?: Stage }
  // Everything after `rename`, as typed: validName refuses more than one word.
  | { sub: 'rename'; name: string }
  // The hat's words as typed; none lists the hats.
  | { sub: 'hat'; hat?: string }
  // No game picks one at random; no pick lets the game pick for you.
  | { sub: 'play'; game?: Game; pick?: Throw | Side }

const SIMPLE: readonly string[] = ['pet', 'feed', 'dex', 'mute', 'unmute', 'off']
// Subcommands that can name one buddy after them.
const TARGETED: readonly string[] = ['card', 'journal']

// Subcommand words match in any case; anything after them keeps the case it was typed in.
export function parseSub(args: string): Parsed {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.toLowerCase()
  const second = words[1]?.toLowerCase()
  if (first === undefined) return { sub: 'show' }
  if (first === 'reroll') {
    if (words.length === 1) return { sub: 'reroll' }
    return { sub: words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage' }
  }
  // Hidden: left out of USAGE, the argument hint and the README on purpose.
  if (first === 'debug') {
    if (words.length === 1) return { sub: 'debug' }
    if (words.length !== 2 || second === undefined) return { sub: 'usage' }
    if (second === 'off') return { sub: 'debug-off' }
    const stage = STAGES.find(s => s === second)
    return stage ? { sub: 'debug', stage } : { sub: 'usage' }
  }
  if (first === 'swap') return words.length === 2 ? { sub: 'swap', target: words[1]! } : { sub: 'usage' }
  if (first === 'breed') return words.length === 2 ? { sub: 'breed', target: words[1]! } : { sub: 'usage' }
  if (first === 'rename') return words.length >= 2 ? { sub: 'rename', name: words.slice(1).join(' ') } : { sub: 'usage' }
  if (first === 'hat') return words.length === 1 ? { sub: 'hat' } : { sub: 'hat', hat: words.slice(1).join(' ') }
  if (first === 'play') {
    const chosen = readPlay(words.slice(1).map(w => w.toLowerCase()))
    return chosen ? { sub: 'play', ...chosen } : { sub: 'usage' }
  }
  if (TARGETED.includes(first)) {
    const sub = first as 'card' | 'journal'
    if (words.length === 1) return { sub }
    return words.length === 2 ? { sub, target: words[1]! } : { sub: 'usage' }
  }
  return { sub: words.length === 1 && SIMPLE.includes(first) ? (first as Plain) : 'usage' }
}

// A buddy asked for by name, in any case, or by its dex number: "#5" or "5".
export type Found = { kind: 'one'; seed: string } | { kind: 'many'; numbers: number[] } | { kind: 'none' }

const NUMBER = /^#?(\d+)$/

export function findBuddy(saved: Saved, who: string): Found {
  const number = NUMBER.exec(who)
  if (number) {
    const b = saved.buddies[Number(number[1]) - 1]
    return b ? { kind: 'one', seed: b.seed } : { kind: 'none' }
  }
  const name = who.toLowerCase()
  const numbers = saved.buddies.flatMap((b, i) => (b.soul.name.toLowerCase() === name ? [i + 1] : []))
  if (numbers.length > 1) return { kind: 'many', numbers }
  const one = numbers[0]
  return one === undefined ? { kind: 'none' } : { kind: 'one', seed: saved.buddies[one - 1]!.seed }
}

// The answer when `who` names no one buddy, with `command` in the hint.
export function notFound(saved: Saved, who: string, found: Exclude<Found, { kind: 'one' }>, command: string): string {
  if (found.kind === 'none') {
    const number = NUMBER.exec(who)
    return number ? `No buddy #${Number(number[1])} in the dex.` : `No buddy named ${who} in the dex.`
  }
  const each = found.numbers.map(n => `#${n} ${bornBones(saved.buddies, saved.buddies[n - 1]!.seed).species}`)
  const name = saved.buddies[found.numbers[0]! - 1]!.soul.name
  return `${found.numbers.length} buddies are named ${name}: ${each.join(', ')}. Run /buddy ${command} #${found.numbers.at(-1)}.`
}

// What a card or journal asks to show: null for the active buddy, which a pane then follows
// through a swap, or the line to answer with when `who` names no one buddy.
export function targetOf(
  saved: Saved,
  who: string | undefined,
  command: string,
): { seed: string | null } | { reply: string } {
  if (who === undefined) return { seed: null }
  const found = findBuddy(saved, who)
  if (found.kind !== 'one') return { reply: notFound(saved, who, found, command) }
  return { seed: found.seed === saved.active ? null : found.seed }
}

// The buddy a pane shows: the one with `seed`, or the active one when that is null or gone.
export function shownBuddy(saved: Saved, seed: string | null): Buddy {
  return saved.buddies.find(b => b.seed === seed) ?? activeBuddy(saved)
}
