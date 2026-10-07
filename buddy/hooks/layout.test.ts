import { expect, test } from 'claude-code/testing'

import { SHIMMER, bandRows, bubbleRows, cardLines, compactLine, isCompact, nameLine, spriteTint, wrap } from './layout'
import { rollBones } from './roll'

const SPRITE = ['a', 'b', 'c', 'd', 'e'].map(s => s.padEnd(12))
const SOUL = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T12:00:00.000Z' }

test('wrap keeps short text on one line', () => {
  expect(wrap('Three retries. Bold strategy.', 30, 3)).toEqual(['Three retries. Bold strategy.'])
})

test('wrap breaks on words and cuts the third line with an ellipsis', () => {
  expect(wrap('one two three four five six', 9, 3)).toEqual(['one two', 'three', 'four fiv…'])
})

test('wrap hard-splits a word longer than a line and never exceeds the width', () => {
  const lines = wrap('x'.repeat(200), 10, 3)
  expect(lines).toHaveLength(3)
  expect(lines.every(l => l.length <= 10)).toBe(true)
  expect(lines[2]?.endsWith('…')).toBe(true)
})

test('every bubble row is the same width, with the tail on the first text line', () => {
  const rows = bubbleRows('word '.repeat(40), 30)
  expect(rows).toHaveLength(5)
  expect(rows.every(r => r.length === rows[0]!.length && r.length <= 30)).toBe(true)
  expect(rows[1]?.startsWith('< ')).toBe(true)
})

test('a short line gets a box that fits it, not the widest box', () => {
  const rows = bubbleRows('hi there', 40)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.length === 'hi there'.length + 4)).toBe(true)
})

test('the bubble grows with the pane up to 80 columns', () => {
  const long = 'x'.repeat(300)
  expect(bandRows(SPRITE, long, 60).bubble[0]).toHaveLength(46)
  expect(bandRows(SPRITE, long, 200).bubble[0]).toHaveLength(80)
})

test('a full-length reply fits the widest bubble without being cut', () => {
  const say = 'Three retries, two stack traces and a semicolon that was never the problem. Bold strategy, friend. I would have read the error message first, but who am I?'
  expect(say.length).toBeLessThanOrEqual(160)
  const rows = bubbleRows(say, 80)
  expect(rows.join('\n')).not.toContain('…')
  expect(rows.slice(1, -1).map(r => r.slice(2, -2).trim()).join(' ')).toBe(say)
})

test('compact below 6 rows or 44 columns', () => {
  expect(isCompact(5, 80)).toBe(true)
  expect(isCompact(6, 43)).toBe(true)
  expect(isCompact(6, 44)).toBe(false)
})

test('the band is always 5 sprite rows beside 5 bubble rows', () => {
  const quiet = bandRows(SPRITE, null, 80)
  expect(quiet.sprite).toHaveLength(5)
  expect(quiet.bubble).toEqual(['', '', '', '', ''])
  const talking = bandRows(SPRITE, 'Hello there.', 80)
  expect(talking.bubble).toHaveLength(5)
  expect(talking.bubble[1]).toContain('Hello there.')
})

test('name line, compact line and card', () => {
  const bones = rollBones('layout-seed')
  const { label, stars } = nameLine('Pip', bones)
  expect(label).toContain(`Pip  ${bones.rarity} ${bones.species}`)
  expect(stars.length).toBeGreaterThanOrEqual(1)
  expect(compactLine('<(·)', 'Pip', null)).toBe('<(·)  Pip')
  expect(compactLine('<(·)', 'Pip', 'Hi.')).toBe('<(·)  Pip: Hi.')
  const card = cardLines(SOUL, bones, 2)
  expect(card.length).toBeLessThanOrEqual(12)
  expect(card[0]).toMatch(/^Pip, /)
  expect(card.join('\n')).toContain('Rerolls: 2')
  expect(card.join('\n')).toContain('Hatched 2026-10-07')
})

test('wrap returns nothing for a degenerate width or line count', () => {
  expect(wrap('hello', 0, 3)).toEqual([])
  expect(wrap('hello', -5, 3)).toEqual([])
  expect(wrap('hello', 10, 0)).toEqual([])
})

test('the sprite takes its rarity color, and a common keeps the text color', () => {
  const at = (rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary') => spriteTint({ rarity, shiny: false }, 0)
  expect(at('common')).toEqual({ color: undefined, bold: false })
  expect(at('uncommon')).toEqual({ color: 'green', bold: false })
  expect(at('rare')).toEqual({ color: 'blue', bold: false })
  expect(at('epic')).toEqual({ color: 'yellow', bold: false })
  expect(at('legendary')).toEqual({ color: 'magenta', bold: false })
})

test('a shiny sprite is bold and shimmers through every color, one per tick', () => {
  const tints = SHIMMER.map((_, tick) => spriteTint({ rarity: 'legendary', shiny: true }, tick))
  expect(tints.map(t => t.color)).toEqual([...SHIMMER])
  expect(tints.every(t => t.bold)).toBe(true)
  expect(spriteTint({ rarity: 'common', shiny: true }, SHIMMER.length)).toEqual(tints[0])
})
