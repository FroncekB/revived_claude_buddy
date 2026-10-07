import { expect, test } from 'claude-code/testing'

import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, bandRows, bubbleRows, bubbleWidth, cardLines, compactLine, isCompact, nameLine,
  pageAt, spriteTint, wrap,
} from './layout'
import { rollBones } from './roll'
import { MAX_SAY, cleanSay } from './voice'

const SPRITE = ['a', 'b', 'c', 'd', 'e'].map(s => s.padEnd(12))
const SOUL = { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T12:00:00.000Z' }

test('wrap keeps short text on one line', () => {
  expect(wrap('Three retries. Bold strategy.', 30)).toEqual(['Three retries. Bold strategy.'])
})

test('wrap breaks on words and keeps every one', () => {
  expect(wrap('one two three four five six', 9)).toEqual(['one two', 'three', 'four five', 'six'])
})

test('wrap given a line count cuts the last line it keeps with an ellipsis', () => {
  expect(wrap('one two three four five six', 9, 3)).toEqual(['one two', 'three', 'four fiv…'])
})

test('wrap hard-splits a word longer than a line and never exceeds the width', () => {
  expect(wrap('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  const lines = wrap('x'.repeat(200), 10, 3)
  expect(lines).toHaveLength(3)
  expect(lines.every(l => l.length <= 10)).toBe(true)
  expect(lines[2]?.endsWith('…')).toBe(true)
})

test('every bubble row is exactly the bubble width, with the tail on the first text line', () => {
  const rows = bubbleRows('hi there', 20, 0)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.length === 20)).toBe(true)
  expect(rows[1]?.startsWith('< ')).toBe(true)
  expect(rows[2]).toBe(" '" + '-'.repeat(17) + "'")
  expect(bubbleRows('word '.repeat(40), 30, 0)).toHaveLength(5)
})

// The text lines a bubble shows, without its edges.
const said = (rows: readonly string[]) => rows.filter(r => /^[<|] /.test(r)).map(r => r.slice(2, -2).trimEnd())

test('text past three lines turns pages that keep the box its height and number themselves', () => {
  // Inner width 9: one two / three / four five | six seven / eight / nine ten | eleven
  const text = 'one two three four five six seven eight nine ten eleven'
  const [first, second, third] = [0, 0.5, 0.99].map(at => bubbleRows(text, 13, at))
  expect(said(first!)).toEqual(['one two', 'three', 'four five'])
  expect(said(second!)).toEqual(['six seven', 'eight', 'nine ten'])
  expect(said(third!)).toEqual(['eleven', '', ''])
  expect(first![4]).toBe(" '---- 1/3 -'")
  expect(third![4]).toBe(" '---- 3/3 -'")
  expect([first, second, third].every(rows => rows!.length === 5 && rows!.every(r => r.length === 13))).toBe(true)
})

test('a bubble shows each page for an equal share of its life', () => {
  expect([0, 0.32, 0.34, 0.66, 0.67, 0.999].map(at => pageAt(3, at))).toEqual([0, 0, 1, 1, 2, 2])
  expect(pageAt(3, 1.5)).toBe(2)
  expect(pageAt(3, -1)).toBe(0)
  expect(pageAt(3, Number.NaN)).toBe(0)
  expect(pageAt(1, 0.9)).toBe(0)
})

test('the bubble widens to 64 columns where the band has room', () => {
  expect(MAX_BUBBLE_W).toBe(64)
  expect(bubbleWidth(80)).toBe(64)
  expect(bubbleWidth(200)).toBe(64)
  expect(bubbleWidth(MIN_FULL_COLS)).toBe(MIN_FULL_COLS - 14)
})

// The longest reply cleanup lets through.
const LONGEST = cleanSay('Every refactor begins with a nap, and every nap begins with a flaky test nobody owns, '.repeat(3))

// Everything a band shows over a bubble's life, page by page.
function shown(page: (at: number) => string): string {
  const pages: string[] = []
  for (let i = 0; i < 200; i++) {
    const text = page(i / 200)
    if (pages.at(-1) !== text) pages.push(text)
  }
  return pages.join(' ')
}

test('the longest reply is shown whole at every width the full band is drawn at', () => {
  expect(LONGEST.length).toBeGreaterThan(MAX_SAY - 10)
  for (let cols = MIN_FULL_COLS; cols <= 200; cols++) {
    const bubble = (at: number) => said(bandRows(SPRITE, LONGEST, cols, at).bubble).filter(Boolean).join(' ')
    expect(shown(bubble)).toBe(LONGEST)
  }
})

test('the one-line band pages the longest reply too, and never outgrows its columns', () => {
  for (let cols = 24; cols <= 200; cols++) {
    const line = (at: number) => compactLine('<(·)', 'Pip', LONGEST, cols, at)
    for (let i = 0; i < 200; i++) expect(line(i / 200).length).toBeLessThanOrEqual(cols)
    expect(shown(at => line(at).replace(/^<\(·\)  Pip: /, '').replace(/ …$/, ''))).toBe(LONGEST)
  }
})

test('compact below 6 rows or 44 columns', () => {
  expect(isCompact(5, 80)).toBe(true)
  expect(isCompact(6, 43)).toBe(true)
  expect(isCompact(6, 44)).toBe(false)
})

test('the band is always 5 sprite rows beside 5 bubble rows', () => {
  const quiet = bandRows(SPRITE, null, 80, 0)
  expect(quiet.sprite).toHaveLength(5)
  expect(quiet.bubble).toEqual(['', '', '', '', ''])
  const talking = bandRows(SPRITE, 'Hello there.', 80, 0)
  expect(talking.bubble).toHaveLength(5)
  expect(talking.bubble[1]).toContain('Hello there.')
})

test('name line, compact line and card', () => {
  const bones = rollBones('layout-seed')
  const { label, stars } = nameLine('Pip', bones)
  expect(label).toContain(`Pip  ${bones.rarity} ${bones.species}`)
  expect(stars.length).toBeGreaterThanOrEqual(1)
  expect(compactLine('<(·)', 'Pip', null, 80, 0)).toBe('<(·)  Pip')
  expect(compactLine('<(·)', 'Pip', 'Hi.', 80, 0)).toBe('<(·)  Pip: Hi.')
  const card = cardLines(SOUL, bones, 2)
  expect(card.length).toBeLessThanOrEqual(12)
  expect(card[0]).toMatch(/^Pip, /)
  expect(card.join('\n')).toContain('Rerolls: 2')
  expect(card.join('\n')).toContain('Hatched 2026-10-07')
})

test('wrap returns nothing for a degenerate width or line count', () => {
  expect(wrap('hello', 0)).toEqual([])
  expect(wrap('hello', -5)).toEqual([])
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
