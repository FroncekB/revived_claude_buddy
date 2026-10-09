// What the buddy says and when: prompts for Haiku, the speak-or-not rule,
// reply cleanup, and fallbacks for when the model doesn't answer.
import type { Mode, Soul, TurnReason, You } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME } from './achievements'
import type { News } from './achievements'
import { STATS, rngFor } from './roll'
import type { Bones, StatName, Stats } from './roll'

// The shortest quip cooldown: PATIENCE only ever lengthens it (Alive spec section 3).
export const QUIP_COOLDOWN_MS = 180_000
export const REPLY_FLOOR_MS = 5_000
export const LONG_TURN_MS = 120_000
// The length the model is asked for, and the most cleanup keeps: models overshoot a
// length they are asked for, and the bubble pages whatever it cannot fit at once.
export const SAY_GOAL = 90
export const MAX_SAY = 160
export const BUBBLE_TICKS = 24
// Reading pace for a long bubble: 5 characters a tick, 10 a second.
export const SAY_CHARS_PER_TICK = 5
export const HEART_TICKS = 5

export const PET_PROMPT = 'The developer just petted you. React in one line.'
export const HELLO_PROMPT = 'The developer just called you over. Say hello in one line.'

export type TurnSummary = {
  reason: TurnReason
  durationMs: number
  tools: Record<string, number>
  failed: string[]
}

export function isNotable(s: TurnSummary): boolean {
  return s.failed.length > 0 || s.reason === 'error' || s.reason === 'aborted' || s.durationMs > LONG_TURN_MS
}

// CHAOS 1 to 100 gives a chance from 0.1525 to 0.40 that an ordinary turn gets a quip.
export function quipChance(stats: Stats): number {
  return 0.15 + (0.25 * stats.CHAOS) / 100
}

// PATIENCE 1 to 100 stretches the cooldown from 3 minutes to 6, so reactions stay at 20 an hour at most.
export function quipCooldownMs(stats: Stats): number {
  return QUIP_COOLDOWN_MS + 1_800 * stats.PATIENCE
}

export function shouldQuip(o: {
  mode: Mode
  inFlight: boolean
  now: number
  lastQuipAt: number
  summary: TurnSummary
  roll: number
  stats: Stats
}): boolean {
  if (o.mode !== 'on' || o.inFlight) return false
  if (o.now - o.lastQuipAt < quipCooldownMs(o.stats)) return false
  return isNotable(o.summary) || o.roll < quipChance(o.stats)
}

// A failed tool call said out loud at once, with no model call: never over a bubble, at most
// once a turn, and as often as DEBUGGING says.
export function shouldFlag(o: { mode: Mode; bubbleUp: boolean; flagged: boolean; roll: number; stats: Stats }): boolean {
  return o.mode === 'on' && !o.bubbleUp && !o.flagged && o.roll < o.stats.DEBUGGING / 100
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
  if (text.length <= MAX_SAY) return text
  // Over the cap: end at the last whole sentence if that keeps at least half, else at the last whole word.
  const room = text.slice(0, MAX_SAY + 1)
  const sentence = Math.max(...['. ', '! ', '? '].map(end => room.lastIndexOf(end))) + 1
  if (sentence > MAX_SAY / 2) return text.slice(0, sentence)
  const word = text.lastIndexOf(' ', MAX_SAY - 1)
  return (word > 0 ? text.slice(0, word).replace(/[,;:-]+$/, '') : text.slice(0, MAX_SAY - 1)) + '…'
}

export function bubbleTicks(text: string): number {
  return Math.max(BUBBLE_TICKS, Math.ceil(text.length / SAY_CHARS_PER_TICK))
}

function statLine(b: Bones): string {
  return STATS.map(s => `${s} ${b.stats[s]}`).join(', ')
}

// `extra` carries the moment: the mood and holiday lines (Alive spec sections 2 and 5).
export function personaSystem(soul: Soul, b: Bones, extra: readonly string[] = []): string {
  return [
    `You are ${soul.name}, ${withArticle(b.rarity)}${b.shiny ? ' shiny' : ''} ${b.species} who lives in a developer's terminal, above their prompt.`,
    `Personality: ${soul.personality}`,
    `Stats: ${statLine(b)}.`,
    ...extra,
    `Reply with one line of at most ${SAY_GOAL} characters, in character. No markdown, no emoji, no quotation marks.`,
  ].join('\n')
}

// `memory` is a journal line the quip may call back to (Memory spec section 4).
export function reactionPrompt(s: TurnSummary, memory: string | null = null): string {
  const tools = Object.entries(s.tools).map(([tool, n]) => `${tool} x${n}`).join(', ') || 'none'
  return [
    'Claude just finished a turn for the developer.',
    `Outcome: ${s.reason}. Took ${Math.round(s.durationMs / 1000)}s.`,
    `Tools used: ${tools}.`,
    `Failed tools: ${s.failed.length ? s.failed.join(', ') : 'none'}.`,
    ...(memory ? [memory] : []),
    'React in one line.',
  ].join('\n')
}

// `memories` are the journal lines a talk may draw on (Memory spec section 4), and `duck` the
// rubber-duck line while duck mode lasts (Interaction spec section 4).
export function talkPrompt(message: string, memories: readonly string[] = [], duck: string | null = null): string {
  const lines = [`The developer says to you: ${message.slice(0, 500)}`, ...memories, ...(duck ? [duck] : [])]
  return [...lines, 'Reply in one line.'].join('\n')
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

// A name a buddy can have (base spec section 5): one word, letters only, at most 12 characters,
// and not a word prompts open with. Hatching and /buddy rename both hold to it.
export function validName(name: string): boolean {
  return /^[A-Za-z]{1,12}$/.test(name) && !RESERVED_NAMES.has(name.toLowerCase())
}

export function parseSoul(text: string): { name: string; personality: string } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return null
  try {
    const value = JSON.parse(json) as { name?: unknown; personality?: unknown }
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    const personality = typeof value.personality === 'string' ? value.personality.trim() : ''
    if (!validName(name)) return null
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

function nth(pool: readonly string[], n: number): string {
  return pool[((n % pool.length) + pool.length) % pool.length]!
}

// A talk or pet fallback: the SNARK pool when the roll comes in under SNARK, else the peak stat's.
export function cannedLine(b: Bones, n: number, roll: number): string {
  return nth(CANNED[roll < b.stats.SNARK / 100 ? 'SNARK' : b.peak], n)
}

export const FAIL_PLAIN: readonly string[] = [
  "That one didn't take.",
  'A tool just failed. Noted.',
  'Error spotted. Worth a look at the trace.',
  'That call came back red.',
]
export const FAIL_SNARKY: readonly string[] = [
  'Red text. Bold choice.',
  'Ah, the error path. Classic.',
  'That went great, for the error.',
  'Failed. I am not saying anything. Much.',
]

// Said the moment a tool fails (shouldFlag): snarky when the roll comes in under SNARK.
export function failLine(b: Bones, n: number, roll: number): string {
  return nth(roll < b.stats.SNARK / 100 ? FAIL_SNARKY : FAIL_PLAIN, n)
}

const STREAK_LINES: readonly string[] = [
  'Day {n} together.',
  "{n} days in a row. Not that I'm counting.",
  "Back again. That's {n} days.",
  "{n}-day streak. Don't make it weird.",
]

// Said without a model call when the first session of a new day extends a streak.
export function streakGreeting(streak: number): string {
  return STREAK_LINES[streak % STREAK_LINES.length]!.replace('{n}', String(streak))
}

export function shouldGreet(o: { mode: Mode; dayBefore: string | null; you: You }): boolean {
  return o.mode === 'on' && o.you.lastDay !== o.dayBefore && o.you.streak >= 2
}

// "a", "a and b", "a, b and c".
function listOf(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

// An announcement, said with no model call (Progression spec section 4): the level, the stage it
// brought, then what was earned and any hats it unlocked.
export function newsLine(news: News): string {
  const parts: string[] = []
  if (news.level !== null) parts.push(`Level ${news.level}!`)
  if (news.stage === 'adult') parts.push('I grew into an adult.')
  if (news.stage === 'elder') parts.push("I'm an elder now.")
  const got = ACHIEVEMENTS.filter(a => news.earned.includes(a.id))
  if (got.length > 0) {
    const hats = got.flatMap(a => (a.hat ? [EARNED_HAT_NAME[a.hat]] : []))
    parts.push(`Earned ${listOf(got.map(a => a.title))}${hats.length > 0 ? `, and ${listOf(hats)}` : ''}.`)
  }
  return parts.join(' ')
}
