// The saved record and the /buddy subcommands. Pure: no $.
import type { Buddy, BuddyRecord, Counts, Mode, Saved, SavedV1, Soul } from '../types'
import { addCounts, localDay, visit, zeroCounts } from './ledger'

export const STORE_KEY = 'buddy'
export const USAGE = 'Usage: /buddy [pet | card | mute | unmute | off | reroll [confirm]]'

export type Loaded =
  | { kind: 'none' }
  | { kind: 'ok'; record: BuddyRecord }
  | { kind: 'foreign'; schema: string }

export function classifyRecord(raw: unknown): Loaded {
  if (raw === undefined || raw === null) return { kind: 'none' }
  const schema = typeof raw === 'object' ? (raw as { schema?: unknown }).schema : undefined
  if (schema === 1) return { kind: 'ok', record: raw as BuddyRecord }
  return { kind: 'foreign', schema: schema === undefined ? 'unknown' : String(schema) }
}

export function newRecord(seed: string, soul: Soul, rerolls: number): BuddyRecord {
  return { schema: 1, seed, soul, mode: 'on', rerolls }
}

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
  | { kind: 'flush'; pending: Readonly<Record<string, Counts>> }
  | { kind: 'visit' }

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
      const retiredAt = new Date(now).toISOString()
      return {
        ...saved,
        mode: 'on',
        rerolls: saved.rerolls + counted,
        active: change.seed,
        buddies: [
          ...saved.buddies.map(b => (b.seed === saved.active ? { ...b, retiredAt } : b)),
          { seed: change.seed, soul: change.soul, retiredAt: null, counts: zeroCounts() },
        ],
      }
    }
    case 'mode':
      return saved && { ...saved, mode: change.mode }
    case 'flush': {
      if (!saved) return null
      let added = false
      const buddies = saved.buddies.map(b => {
        const more = change.pending[b.seed]
        if (!more) return b
        added = true
        return { ...b, counts: addCounts(b.counts, more) }
      })
      const you = visit(saved.you, today)
      return added || you !== saved.you ? { ...saved, buddies, you } : null
    }
    case 'visit': {
      if (!saved) return null
      const you = visit(saved.you, today)
      return you !== saved.you ? { ...saved, you } : null
    }
  }
}

export type Sub =
  | 'show' | 'pet' | 'card' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'debug' | 'debug-off' | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'mute', 'unmute', 'off']

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
