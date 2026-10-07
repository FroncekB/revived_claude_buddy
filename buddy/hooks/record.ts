// The saved record and the /buddy subcommands. Pure: no $.
import type { BuddyRecord, Soul } from '../types'

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

export type Sub = 'show' | 'pet' | 'card' | 'mute' | 'unmute' | 'off' | 'reroll' | 'reroll-confirm' | 'usage'

const SIMPLE: readonly string[] = ['pet', 'card', 'mute', 'unmute', 'off']

export function parseSub(args: string): Sub {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [first, second] = words
  if (first === undefined) return 'show'
  if (first === 'reroll') {
    if (words.length === 1) return 'reroll'
    return words.length === 2 && second === 'confirm' ? 'reroll-confirm' : 'usage'
  }
  return words.length === 1 && SIMPLE.includes(first) ? (first as Sub) : 'usage'
}
