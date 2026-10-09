import { expect, test } from 'claude-code/testing'

import type { Buddy, You } from '../types'
import { zeroCounts } from './ledger'
import { bonesFor } from './progress'
import {
  FULL_LINES, FULL_MS, HAT_NAME, PLAY_FALLBACKS, SNACKS, THROWS, dressed, feedFallback, feedPrompt, fullLine, hatChoice,
  hatFallback, hatList, hatPrompt, isFull, play, playFallback, playPrompt, renameFallback, renamePrompt, renameRefusal,
  snackOf, wearable, woreLine, wornHat,
} from './toys'

test('a rename is refused with its reason, or allowed, a change of case included', () => {
  expect(renameRefusal('Mochi', 'Pip')).toBeNull()
  expect(renameRefusal('pip', 'Pip')).toBeNull()
  expect(renameRefusal('Pip', 'Pip')).toBe('Pip is already its name.')
  expect(renameRefusal('Claude', 'Pip')).toBe('Claude starts too many prompts to be a name.')
  expect(renameRefusal('FIX', 'Pip')).toBe('FIX starts too many prompts to be a name.')
  // A heading a prompt opens with would swallow that prompt too.
  expect(renameRefusal('Summary', 'Pip')).toBe('Summary starts too many prompts to be a name.')
  expect(renameRefusal('Sir Pip', 'Pip')).toBe('A name is one word of letters, at most 12.')
  expect(renameRefusal('Abcdefghijklm', 'Pip')).toBe('A name is one word of letters, at most 12.')
  expect(renamePrompt('Pip', 'Mochi')).toBe('The developer just renamed you from Pip to Mochi. React in one line.')
  expect(renameFallback('Mochi')).toBe('Mochi. I like it.')
})

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
