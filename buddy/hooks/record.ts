// The saved record and the /buddy subcommands. Pure: no $.
import type { Buddy, Counts, Mode, MoodEvent, Saved, SavedV1, Soul, TurnFacts } from '../types'
import { addMoments, awayMoment, bestsOf, milestones, noticeTurns } from './journal'
import { addCounts, localDay, visit, zeroCounts } from './ledger'
import { applyMood, sulkFor, withSulk } from './mood'

export const STORE_KEY = 'buddy'
export const USAGE = 'Usage: /buddy [pet | card | journal | mute | unmute | off | reroll [confirm]]'

// What the store holds, as this build reads it (Foundation spec section 1).
export type Stored =
  | { kind: 'none' }
  | { kind: 'ok'; saved: Saved }
  | { kind: 'damaged' }
  | { kind: 'foreign'; schema: string }

export function classify(raw: unknown): Stored {
  if (raw === undefined || raw === null) return { kind: 'none' }
  const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
  if (schema === 1) return { kind: 'ok', saved: migrate(raw as SavedV1) }
  if (schema === 2) {
    const saved = raw as Saved
    const intact = Array.isArray(saved.buddies) && saved.buddies.some(b => b.seed === saved.active)
    return intact ? { kind: 'ok', saved } : { kind: 'damaged' }
  }
  return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
}

function fresh(seed: string, soul: Soul, rerolls: number): Saved {
  return {
    schema: 2,
    mode: 'on',
    rerolls,
    active: seed,
    buddies: [{ seed, soul, retiredAt: null, counts: zeroCounts() }],
    you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
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
  | { kind: 'hatch' | 'reroll'; seed: string; soul: Soul }
  | { kind: 'mode'; mode: Mode }
  | {
      kind: 'flush'
      pending: Readonly<Record<string, Counts>>
      // Mood events by seed, replayed in order (Alive spec section 2).
      mood?: Readonly<Record<string, readonly MoodEvent[]>>
      // Finished main turns by seed, for the journal (Memory spec section 3).
      turns?: Readonly<Record<string, readonly TurnFacts[]>>
    }
  | { kind: 'visit' }

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
      // The visit comes first, so a sulk from days away lands on the buddy that was left alone,
      // never on the new one (Alive spec section 2).
      const arrived = arrive(saved, now)
      const retiredAt = new Date(now).toISOString()
      return {
        ...arrived,
        mode: 'on',
        rerolls: arrived.rerolls + counted,
        active: change.seed,
        buddies: [
          ...arrived.buddies.map(b => (b.seed === arrived.active ? { ...b, retiredAt } : b)),
          { seed: change.seed, soul: change.soul, retiredAt: null, counts: zeroCounts() },
        ],
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
        const moments = [...noticed.moments, ...milestones(b.counts, counts, now)]
        return {
          ...b,
          ...(more ? { counts } : {}),
          ...(felt.length > 0 ? { mood: applyMood(b.mood, felt, now) } : {}),
          ...(facts.length > 0 ? { bests: { ...b.bests, ...noticed.bests } } : {}),
          ...(moments.length > 0 ? { journal: addMoments(b.journal, moments) } : {}),
        }
      })
      return added || arrived !== saved ? { ...arrived, buddies } : null
    }
    case 'visit': {
      if (!saved) return null
      const arrived = arrive(saved, now)
      return arrived !== saved ? arrived : null
    }
  }
}

export type Sub =
  | 'show' | 'pet' | 'card' | 'journal' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug' | 'debug-off'
  | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'journal', 'mute', 'unmute', 'off']

export function parseSub(args: string): Sub {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [first, second] = words
  if (first === undefined) return 'show'
  if (first === 'reroll') {
    if (words.length === 1) return 'reroll'
    return words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage'
  }
  // Hidden: left out of USAGE, the argument hint and the README on purpose.
  if (first === 'debug') {
    if (words.length === 1) return 'debug'
    return words.length === 2 && second === 'off' ? 'debug-off' : 'usage'
  }
  return words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage'
}
