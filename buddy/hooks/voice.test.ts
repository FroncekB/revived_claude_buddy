import { expect, test } from 'claude-code/testing'

import type { News } from './achievements'
import { rollBones } from './roll'
import {
  BUBBLE_TICKS, FAIL_PLAIN, FAIL_SNARKY, FALLBACK_NAMES, MAX_SAY, QUIP_COOLDOWN_MS, RESERVED_NAMES, SAY_GOAL,
  bubbleTicks, cannedLine, cleanSay, failLine, fallbackSoul, hatchRequest, matchAddress, newsLine, parseSoul, personaSystem,
  quipChance, quipCooldownMs, reactionPrompt, shouldFlag, shouldGreet, shouldQuip, streakGreeting, talkPrompt, validName,
  withArticle,
} from './voice'
import type { TurnSummary } from './voice'

const CALM: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Read: 2 }, failed: [] }
const ROUGH: TurnSummary = { reason: 'answer', durationMs: 4_000, tools: { Bash: 2 }, failed: ['Bash'] }
const NOW = 1_000_000
// CHAOS 40 and PATIENCE 0 give the base build's flat 0.25 chance and 3-minute cooldown.
const STATS = { DEBUGGING: 50, PATIENCE: 0, CHAOS: 40, WISDOM: 50, SNARK: 50 }
const base = { mode: 'on' as const, inFlight: false, now: NOW, lastQuipAt: 0, summary: CALM, roll: 0.9, stats: STATS }

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

test('a reply over the goal but within the cap is kept whole', () => {
  const overshoot = 'You renamed that variable four times. I respect the commitment, if not the final choice, honestly.'
  expect(overshoot.length).toBeGreaterThan(SAY_GOAL)
  expect(cleanSay(overshoot)).toBe(overshoot)
})

test('a reply over the cap ends at its last whole sentence, or else its last whole word', () => {
  const sentences =
    'Three retries and a green build. I am choosing to believe that was all part of the plan. ' +
    'Next time, maybe read the error message before the fourth retry, just a thought.'
  expect(cleanSay(sentences)).toBe('Three retries and a green build. I am choosing to believe that was all part of the plan.')
  const cut = cleanSay('word, '.repeat(40))
  expect(cut.length).toBeLessThanOrEqual(MAX_SAY)
  expect(cut).toMatch(/word…$/)
})

test('a bubble stays up long enough to read, and never less than before', () => {
  expect(bubbleTicks('Purr.')).toBe(BUBBLE_TICKS)
  expect(bubbleTicks('x'.repeat(MAX_SAY))).toBe(Math.ceil(MAX_SAY / 5))
  expect(bubbleTicks('x'.repeat(MAX_SAY))).toBeGreaterThan(BUBBLE_TICKS)
})

test('a reply over the limit is cut after its last whole word', () => {
  const words = 'semicolon '.repeat(30).trim()
  const cut = cleanSay(words)
  expect(MAX_SAY).toBe(160)
  expect(cut.length).toBeLessThanOrEqual(MAX_SAY)
  expect(cut.endsWith('semicolon…')).toBe(true)
  expect(words.startsWith(cut.slice(0, -1) + ' ')).toBe(true)
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
  for (const name of ['P', 'Abcdefghijkl', 'mochi']) expect([name, validName(name)]).toEqual([name, true])
  for (const name of ['', 'Abcdefghijklm', 'R2D2', 'Sir Pip', 'Pip!']) {
    expect([name, validName(name)]).toEqual([name, false])
  }
  for (const word of RESERVED_NAMES) {
    expect([word, validName(word)]).toEqual([word, false])
    expect([word, validName(word.toUpperCase())]).toEqual([word, false])
  }
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
  expect(personaSystem(soul, epic)).toContain(`at most ${SAY_GOAL} characters`)
})

test('the reaction prompt carries the event summary and nothing else', () => {
  const p = reactionPrompt(ROUGH)
  expect(p).toContain('Tools used: Bash x2.')
  expect(p).toContain('Failed tools: Bash.')
  expect(p).toContain('Took 4s.')
})

test('canned lines come from the peak stat pool, or the SNARK pool when the roll is under SNARK', () => {
  const rolled = rollBones('voice-seed')
  const bones = { ...rolled, peak: 'WISDOM' as const, stats: { ...rolled.stats, SNARK: 30 } }
  const wise = cannedLine(bones, 0, 0.9)
  expect(wise.length).toBeGreaterThan(0)
  expect(cannedLine(bones, 3, 0.9)).toBe(wise)
  expect(cannedLine(bones, 0, 0.3)).toBe(wise)
  expect(cannedLine(bones, 0, 0.29)).not.toBe(wise)
  expect(cannedLine(bones, 0, 0.29)).toBe(cannedLine({ ...bones, peak: 'SNARK' }, 0, 0.9))
})

test('CHAOS sets the quip chance and PATIENCE the cooldown', () => {
  const at = (n: number) => ({ ...STATS, CHAOS: n, PATIENCE: n })
  expect(quipChance(at(1))).toBe(0.1525)
  expect(quipChance(at(50))).toBe(0.275)
  expect(quipChance(at(100))).toBe(0.4)
  expect(quipCooldownMs(at(1))).toBe(181_800)
  expect(quipCooldownMs(at(50))).toBe(270_000)
  expect(quipCooldownMs(at(100))).toBe(360_000)
  // A chaotic buddy speaks after an ordinary turn on a roll a calm one would not.
  expect(shouldQuip({ ...base, roll: 0.35, stats: { ...STATS, CHAOS: 100 } })).toBe(true)
  expect(shouldQuip({ ...base, roll: 0.35, stats: { ...STATS, CHAOS: 1 } })).toBe(false)
  // A patient one waits longer, even after a notable turn.
  const fourMinutesAgo = NOW - 240_000
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: fourMinutesAgo, stats: { ...STATS, PATIENCE: 1 } })).toBe(true)
  expect(shouldQuip({ ...base, summary: ROUGH, lastQuipAt: fourMinutesAgo, stats: { ...STATS, PATIENCE: 100 } })).toBe(false)
})

test('DEBUGGING decides whether a failed tool call is said out loud at once', () => {
  const flag = { mode: 'on' as const, bubbleUp: false, flagged: false, roll: 0.5, stats: { ...STATS, DEBUGGING: 60 } }
  expect(shouldFlag(flag)).toBe(true)
  expect(shouldFlag({ ...flag, roll: 0.6 })).toBe(false)
  expect(shouldFlag({ ...flag, roll: 0.999, stats: { ...STATS, DEBUGGING: 100 } })).toBe(true)
  expect(shouldFlag({ ...flag, bubbleUp: true })).toBe(false)
  expect(shouldFlag({ ...flag, flagged: true })).toBe(false)
  expect(shouldFlag({ ...flag, mode: 'muted' })).toBe(false)
  expect(shouldFlag({ ...flag, mode: 'off' })).toBe(false)
})

test('failure lines come in a plain half and a snarky half, picked by SNARK', () => {
  expect(FAIL_PLAIN).toHaveLength(4)
  expect(FAIL_SNARKY).toHaveLength(4)
  const bones = { ...rollBones('voice-seed'), stats: { ...STATS, SNARK: 40 } }
  expect(FAIL_SNARKY).toContain(failLine(bones, 0, 0.39))
  expect(FAIL_PLAIN).toContain(failLine(bones, 0, 0.4))
  expect(failLine(bones, 5, 0.9)).toBe(FAIL_PLAIN[1])
})

test('the persona hears the extra lines between the stats and the reply rules', () => {
  const bones = rollBones('voice-seed')
  const soul = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T00:00:00.000Z' }
  const lines = personaSystem(soul, bones, ['Mood: smug.', 'Today is Easter.']).split('\n')
  expect(lines.slice(3, 5)).toEqual(['Mood: smug.', 'Today is Easter.'])
  expect(lines.at(-1)).toMatch(/^Reply with one line/)
  expect(personaSystem(soul, bones).split('\n')).toHaveLength(4)
})

test('the streak greeting comes from a pool of four and greets only a new day of a streak', () => {
  expect(streakGreeting(4)).toBe('Day 4 together.')
  expect(streakGreeting(5)).toBe("5 days in a row. Not that I'm counting.")
  expect(streakGreeting(6)).toBe("Back again. That's 6 days.")
  expect(streakGreeting(7)).toBe("7-day streak. Don't make it weird.")
  const you = { lastDay: '2026-10-07', streak: 2, bestStreak: 2, days: 2 }
  expect(shouldGreet({ mode: 'on', dayBefore: '2026-10-06', you })).toBe(true)
  expect(shouldGreet({ mode: 'muted', dayBefore: '2026-10-06', you })).toBe(false)
  expect(shouldGreet({ mode: 'on', dayBefore: '2026-10-07', you })).toBe(false)
  expect(shouldGreet({ mode: 'on', dayBefore: null, you: { ...you, streak: 1 } })).toBe(false)
})

test('a quip prompt carries its memory just before the ask, and a talk prompt its memories', () => {
  const line = 'A memory (yesterday): back after 9 days away. Bring it up if it fits, as "remember when...", without a date.'
  expect(reactionPrompt(ROUGH)).not.toContain('A memory')
  expect(reactionPrompt(ROUGH, line).split('\n').slice(-2)).toEqual([line, 'React in one line.'])
  expect(talkPrompt('hi')).toBe('The developer says to you: hi\nReply in one line.')
  expect(talkPrompt('hi', ['Your memories, newest first:', '- today: x', 'Mention one only if it fits what they said.'])).toBe(
    'The developer says to you: hi\nYour memories, newest first:\n- today: x\nMention one only if it fits what they said.\nReply in one line.',
  )
})

test('an announcement reads the level, the stage, then what was earned and any hats', () => {
  const news = (o: Partial<News>): News => ({ level: null, stage: null, earned: [], ...o })
  expect(newsLine(news({ level: 12 }))).toBe('Level 12!')
  expect(newsLine(news({ level: 10, stage: 'adult' }))).toBe('Level 10! I grew into an adult.')
  expect(newsLine(news({ level: 30, stage: 'elder' }))).toBe("Level 30! I'm an elder now.")
  expect(newsLine(news({ earned: ['marathon'] }))).toBe('Earned Marathon.')
  expect(newsLine(news({ earned: ['marathon', 'survivor'] }))).toBe('Earned Marathon and Survivor.')
  expect(newsLine(news({ earned: ['marathon', 'survivor', 'comeback'] }))).toBe('Earned Marathon, Survivor and Comeback.')
  expect(newsLine(news({ earned: ['shell'] }))).toBe('Earned Shell regular, and a hard hat.')
  expect(newsLine(news({ earned: ['ultramarathon', 'elder'] }))).toBe(
    'Earned Ultramarathon and Elder, and a nightcap and a laurel.',
  )
  expect(newsLine(news({ level: 10, stage: 'adult', earned: ['grownUp'] }))).toBe(
    'Level 10! I grew into an adult. Earned Grown up.',
  )
})
