import { expect, test } from 'claude-code/testing'

import { rollBones } from './roll'
import {
  FALLBACK_NAMES, MAX_SAY, QUIP_COOLDOWN_MS, RESERVED_NAMES, cannedLine, cleanSay, fallbackSoul, hatchRequest,
  matchAddress, parseSoul, personaSystem, reactionPrompt, shouldQuip, withArticle,
} from './voice'
import type { TurnSummary } from './voice'

const CALM: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Read: 2 }, failed: [] }
const ROUGH: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Bash: 2 }, failed: ['Bash'] }
const NOW = 1_000_000
const base = { mode: 'on' as const, inFlight: false, now: NOW, lastQuipAt: 0, summary: CALM, roll: 0.9 }

test('the speak-or-not rule', () => {
  expect(shouldQuip({ ...base, summary: ROUGH })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, reason: 'error' } })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, reason: 'aborted' } })).toBe(true)
  expect(shouldQuip({ ...base, summary: { ...CALM, durationMs: 120_001 } })).toBe(true)
  expect(shouldQuip(base)).toBe(false)
  expect(shouldQuip({ ...base, roll: 0.1 })).toBe(true)
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: NOW - QUIP_COOLDOWN_MS + 1 })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, inFlight: true })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, mode: 'muted' })).toBe(false)
  expect(shouldQuip({ ...base, summary: ROUGH, mode: 'off' })).toBe(false)
})

test('the name matcher', () => {
  expect(matchAddress('Pip', 'Pip, hi')).toBe('hi')
  expect(matchAddress('Pip', '  pip: how are you?')).toBe('how are you?')
  expect(matchAddress('Pip', 'Pipeline, hi')).toBeNull()
  expect(matchAddress('Pip', 'Fix Pip, hi')).toBeNull()
  expect(matchAddress('Pip', 'Pip,')).toBeNull()
})

test('reply cleanup strips quotes, newlines and emoji, and caps the length', () => {
  expect(cleanSay('"Hello!"  \n there \u{1F600}')).toBe('Hello! there')
  expect(cleanSay("'quoted'")).toBe('quoted')
  expect(cleanSay("it's fine")).toBe("it's fine")
  const long = cleanSay('x'.repeat(200))
  expect(long).toHaveLength(MAX_SAY)
  expect(long.endsWith('…')).toBe(true)
  expect(cleanSay('  \n ')).toBe('')
})

test('hatch JSON is validated, with a seeded fallback', () => {
  expect(parseSoul('```json\n{"name": "Pip", "personality": "Counts semicolons."}\n```')).toEqual({
    name: 'Pip',
    personality: 'Counts semicolons.',
  })
  expect(parseSoul('{"name": "R2D2", "personality": "Beeps."}')).toBeNull()
  expect(parseSoul(`{"name": "Pip", "personality": "${'x'.repeat(161)}"}`)).toBeNull()
  expect(parseSoul('no json here')).toBeNull()
  const bones = rollBones('voice-seed')
  const a = fallbackSoul('voice-seed', bones)
  expect(a).toEqual(fallbackSoul('voice-seed', bones))
  expect(FALLBACK_NAMES).toContain(a.name)
  expect(a.personality.length).toBeLessThanOrEqual(160)
  expect(hatchRequest(bones).prompt).toContain(`Species: ${bones.species}.`)
})

test('names that read as prompt openers are rejected, in any case', () => {
  expect(parseSoul('{"name": "Claude", "personality": "x"}')).toBeNull()
  expect(parseSoul('{"name": "fix", "personality": "x"}')).toBeNull()
  expect(parseSoul('{"name": "BUG", "personality": "x"}')).toBeNull()
  expect(parseSoul('{"name": "Pip", "personality": "x"}')).not.toBeNull()
  expect(RESERVED_NAMES.size).toBe(29)
  for (const name of FALLBACK_NAMES) expect(RESERVED_NAMES.has(name.toLowerCase())).toBe(false)
  expect(FALLBACK_NAMES).toHaveLength(24)
})

test('a or an agrees with the word that follows', () => {
  expect(withArticle('common')).toBe('a common')
  expect(withArticle('uncommon')).toBe('an uncommon')
  expect(withArticle('epic')).toBe('an epic')
  expect(withArticle('legendary')).toBe('a legendary')
  const epic = { ...rollBones('voice-seed'), rarity: 'epic' as const, shiny: true }
  const soul = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T00:00:00.000Z' }
  expect(personaSystem(soul, epic)).toContain(`You are Pip, an epic shiny ${epic.species} who lives`)
})

test('the reaction prompt carries the event summary and nothing else', () => {
  const p = reactionPrompt(ROUGH)
  expect(p).toContain('Tools used: Bash x2.')
  expect(p).toContain('Failed tools: Bash.')
  expect(p).toContain('Took 4s.')
})

test('canned lines come from the peak stat pool', () => {
  const bones = rollBones('voice-seed')
  expect(cannedLine(bones, 0).length).toBeGreaterThan(0)
  expect(cannedLine(bones, 3)).toBe(cannedLine(bones, 0))
})
