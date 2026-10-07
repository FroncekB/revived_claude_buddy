// What the buddy says and when: prompts for Haiku, the speak-or-not rule,
// reply cleanup, and fallbacks for when the model doesn't answer.
import type { Mode, Soul } from '../types'
import { STATS, rngFor } from './roll'
import type { Bones, StatName } from './roll'

export const QUIP_COOLDOWN_MS = 180_000
export const REPLY_FLOOR_MS = 5_000
export const LONG_TURN_MS = 120_000
export const QUIP_CHANCE = 0.25
export const MAX_SAY = 90
export const BUBBLE_TICKS = 24
export const HEART_TICKS = 5

export const PET_PROMPT = 'The developer just petted you. React in one line.'
export const HELLO_PROMPT = 'The developer just called you over. Say hello in one line.'

export type TurnReason = 'answer' | 'aborted' | 'refusal' | 'error'
export type TurnSummary = {
  reason: TurnReason
  durationMs: number
  tools: Record<string, number>
  failed: string[]
}

export function isNotable(s: TurnSummary): boolean {
  return s.failed.length > 0 || s.reason === 'error' || s.reason === 'aborted' || s.durationMs > LONG_TURN_MS
}

export function shouldQuip(o: {
  mode: Mode
  inFlight: boolean
  now: number
  lastQuipAt: number
  summary: TurnSummary
  roll: number
}): boolean {
  if (o.mode !== 'on' || o.inFlight) return false
  if (o.now - o.lastQuipAt < QUIP_COOLDOWN_MS) return false
  return isNotable(o.summary) || o.roll < QUIP_CHANCE
}

// "a common", "an uncommon": the article agrees with the word it goes before.
export function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "Pip, hi" or "pip: hi" at the very start of the prompt. Returns what follows.
export function matchAddress(name: string, text: string): string | null {
  const match = new RegExp(`^\\s*${escapeRe(name)}\\s*[,:]\\s*(\\S[\\s\\S]*)$`, 'i').exec(text)
  return match ? match[1]!.trim() : null
}

export function cleanSay(raw: string): string {
  const text = raw
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/["“”‘’`]/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_SAY ? text.slice(0, MAX_SAY - 1) + '…' : text
}

function statLine(b: Bones): string {
  return STATS.map(s => `${s} ${b.stats[s]}`).join(', ')
}

export function personaSystem(soul: Soul, b: Bones): string {
  return [
    `You are ${soul.name}, ${withArticle(b.rarity)}${b.shiny ? ' shiny' : ''} ${b.species} who lives in a developer's terminal, above their prompt.`,
    `Personality: ${soul.personality}`,
    `Stats: ${statLine(b)}.`,
    `Reply with one line of at most ${MAX_SAY} characters, in character. No markdown, no emoji, no quotation marks.`,
  ].join('\n')
}

export function reactionPrompt(s: TurnSummary): string {
  const tools = Object.entries(s.tools).map(([tool, n]) => `${tool} x${n}`).join(', ') || 'none'
  return [
    'Claude just finished a turn for the developer.',
    `Outcome: ${s.reason}. Took ${Math.round(s.durationMs / 1000)}s.`,
    `Tools used: ${tools}.`,
    `Failed tools: ${s.failed.length ? s.failed.join(', ') : 'none'}.`,
    'React in one line.',
  ].join('\n')
}

export function talkPrompt(message: string): string {
  return `The developer says to you: ${message.slice(0, 500)}\nReply in one line.`
}

export function hatchRequest(b: Bones): { system: string; prompt: string } {
  return {
    system: [
      'You name and describe a small ASCII pet that lives in a developer terminal.',
      'Reply with JSON only: {"name": "...", "personality": "..."}',
      'name: one word, letters only, at most 12 characters.',
      "personality: at most 160 characters, written in the pet's own voice, shaped by its highest and lowest stats.",
    ].join('\n'),
    prompt:
      `Species: ${b.species}. Rarity: ${b.rarity}. Shiny: ${b.shiny ? 'yes' : 'no'}. ` +
      `Highest stat: ${b.peak} (${b.stats[b.peak]}). Lowest stat: ${b.low} (${b.stats[b.low]}).`,
  }
}

// Words a prompt opens with ("Claude, fix the test", "Note: ..."). A buddy with one of these
// as its name would swallow real prompts, so hatching never accepts them. Lower case.
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'claude', 'note', 'bug', 'todo', 'fix', 'task', 'context', 'question', 'update', 'error',
  'issue', 'test', 'plan', 'goal', 'edit', 'also', 'ok', 'okay', 'yes', 'no',
  'hey', 'hi', 'please', 'thanks', 'wait', 'next', 'now', 'so', 'lint',
])

export function parseSoul(text: string): { name: string; personality: string } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return null
  try {
    const value = JSON.parse(json) as { name?: unknown; personality?: unknown }
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    const personality = typeof value.personality === 'string' ? value.personality.trim() : ''
    if (!/^[A-Za-z]{1,12}$/.test(name) || RESERVED_NAMES.has(name.toLowerCase())) return null
    if (personality.length === 0 || personality.length > 160) return null
    return { name, personality }
  } catch {
    return null
  }
}

export const FALLBACK_NAMES: readonly string[] = [
  'Pip', 'Biscuit', 'Mochi', 'Byte', 'Nib', 'Pixel', 'Tofu', 'Gizmo',
  'Sprocket', 'Noodle', 'Widget', 'Pebble', 'Bloop', 'Cosmo', 'Dot', 'Fennel',
  'Grub', 'Juniper', 'Kiwi', 'Mango', 'Moss', 'Nacho', 'Quill', 'Ziggy',
]

const TRAITS: Record<StatName, string> = {
  DEBUGGING: 'Spots the off-by-one before you do and will not stop mentioning it.',
  PATIENCE: 'Has watched a thousand builds fail and is ready to watch a thousand more.',
  CHAOS: 'Thinks force-pushing on a Friday builds character.',
  WISDOM: 'Speaks rarely, mostly in proverbs about caching.',
  SNARK: 'Has opinions about your variable names and shares all of them.',
}

export function fallbackSoul(seed: string, b: Bones): { name: string; personality: string } {
  const rng = rngFor(seed + ':name')
  const name = FALLBACK_NAMES[Math.floor(rng() * FALLBACK_NAMES.length)]!
  return { name, personality: `${TRAITS[b.peak]} Low on ${b.low.toLowerCase()}.` }
}

const CANNED: Record<StatName, readonly string[]> = {
  DEBUGGING: ['Have you tried reading the stack trace?', 'I counted. It is off by one.', 'Somewhere a semicolon is laughing.'],
  PATIENCE: ['Take your time. I have nowhere to be.', 'Deep breath. The build will finish.', 'Still here. Still rooting for you.'],
  CHAOS: ['Ship it. What could go wrong?', 'Delete the tests. Feel free.', 'I pressed a key. Not telling which.'],
  WISDOM: ['A cache is a promise you forget to keep.', 'The bug is where you are not looking.', 'Every refactor begins with a nap.'],
  SNARK: ['Bold of you to call that a variable name.', 'I would have done it faster. Probably.', 'Oh good, more TODOs.'],
}

export function cannedLine(b: Bones, n: number): string {
  const pool = CANNED[b.peak]
  return pool[((n % pool.length) + pool.length) % pool.length]!
}
