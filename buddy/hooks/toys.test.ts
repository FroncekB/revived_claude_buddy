import { expect, test } from 'claude-code/testing'

import type { Buddy, You } from '../types'
import { zeroCounts } from './ledger'
import { bonesFor } from './progress'
import {
  HAT_NAME, dressed, hatChoice, hatFallback, hatList, hatPrompt, renameFallback, renamePrompt, renameRefusal, wearable,
  woreLine, wornHat,
} from './toys'

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
