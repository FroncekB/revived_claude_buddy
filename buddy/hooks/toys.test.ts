import { expect, test } from 'claude-code/testing'

import { renameFallback, renamePrompt, renameRefusal } from './toys'

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
