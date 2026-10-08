import { expect, test } from 'claude-code/testing'

import type { Moment, Saved } from '../types'
import {
  MAX_BUBBLE_W, MIN_FULL_COLS, SHIMMER, achievementsText, bandRows, bubbleRows, bubbleWidth, cardLines, cardProgress,
  compactLine, dexLines, dexRows, dexText, isCompact, journalLines, journalRows, levelText, longDate, nameLine, pageAt,
  paintRuns, rightRuns, shortDate, spriteTint, streakLine, wrap,
} from './layout'
import { zeroCounts } from './ledger'
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

test('every bubble row is exactly the box width, with the tail on the first text line', () => {
  const rows = bubbleRows('hi there', 20, 0)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.length === 'hi there'.length + 4)).toBe(true)
  expect(rows[1]?.startsWith('< ')).toBe(true)
  expect(rows[2]).toBe(" '" + '-'.repeat(9) + "'")
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

test('the bubble widens to 80 columns where the band has room', () => {
  expect(MAX_BUBBLE_W).toBe(80)
  expect(bubbleWidth(94)).toBe(80)
  expect(bubbleWidth(200)).toBe(80)
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

test('every bubble row is the same width, with the tail on the first text line', () => {
  const rows = bubbleRows('word '.repeat(40), 30, 0)
  expect(rows).toHaveLength(5)
  expect(rows.every(r => r.length === rows[0]!.length && r.length <= 30)).toBe(true)
  expect(rows[1]?.startsWith('< ')).toBe(true)
})

test('a short line gets a box that fits it, not the widest box', () => {
  const rows = bubbleRows('hi there', 40, 0)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.length === 'hi there'.length + 4)).toBe(true)
})

test('the bubble grows with the pane up to 80 columns', () => {
  const long = 'x'.repeat(300)
  expect(bandRows(SPRITE, long, 60, 0).bubble[0]).toHaveLength(46)
  expect(bandRows(SPRITE, long, 200, 0).bubble[0]).toHaveLength(80)
})

test('a full-length reply fits the widest bubble without being cut', () => {
  const say = 'Three retries, two stack traces and a semicolon that was never the problem. Bold strategy, friend. I would have read the error message first, but who am I?'
  expect(say.length).toBeLessThanOrEqual(160)
  const rows = bubbleRows(say, 80, 0)
  expect(rows.join('\n')).not.toContain('…')
  expect(rows.slice(1, -1).map(r => r.slice(2, -2).trim()).join(' ')).toBe(say)
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
  // 'layout-seed' rolls a common cactus.
  expect(nameLine('Pip', bones, 12).label).toBe('  Pip  Lv 12  common cactus  ')
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

test('the streak line counts with commas, agrees in number, and keeps the text card short', () => {
  const many = { ...zeroCounts(), turns: 340, calls: { ...zeroCounts().calls, shell: 2_000, read: 104 } }
  const twelve = { lastDay: '2026-10-07', streak: 12, bestStreak: 30, days: 40 }
  expect(streakLine(twelve, many)).toBe('Streak 12 days (best 30) · 340 turns · 2,104 tool calls')
  const one = { ...zeroCounts(), turns: 1, calls: { ...zeroCounts().calls, edit: 1 } }
  expect(streakLine({ lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }, one)).toBe(
    'Streak 1 day (best 1) · 1 turn · 1 tool call',
  )
  expect(streakLine(twelve, { ...zeroCounts(), turns: 1_234_567 })).toContain('1,234,567 turns')
  const card = [...cardLines(SOUL, rollBones('layout-seed'), 2), streakLine(twelve, many)]
  expect(card.length).toBeLessThanOrEqual(12)
})

test('a painted row splits into runs by color, and unpainted columns keep the text color', () => {
  expect(paintRuns('|*:*==', ' bbbrr')).toEqual([{ text: '|' }, { text: '*:*', color: 'blue' }, { text: '==', color: 'red' }])
  expect(paintRuns('|----', ' bb')).toEqual([{ text: '|' }, { text: '--', color: 'blue' }, { text: '--' }])
  expect(paintRuns('plain')).toEqual([{ text: 'plain' }])
})

test('the right-hand column: the bubble when there is one, else the prop after a 2-column gap', () => {
  const prop = { art: ['|*=', '|='], paint: [' br'] }
  const quiet = rightRuns(['', '', '', '', ''], prop)
  expect(quiet[0]).toEqual([{ text: '  ' }, { text: '|' }, { text: '*', color: 'blue' }, { text: '=', color: 'red' }])
  expect(quiet[1]).toEqual([{ text: '  ' }, { text: '|=' }])
  expect(quiet[2]).toEqual([{ text: ' ' }])
  const talking = bandRows(SPRITE, 'Hello there.', 80, 0)
  expect(rightRuns(talking.bubble, prop).map(row => row.map(r => r.text).join(''))).toEqual(
    talking.bubble.map(row => ' ' + row),
  )
  expect(rightRuns(['', '', '', '', ''], null)).toEqual(Array.from({ length: 5 }, () => [{ text: ' ' }]))
})

test('the journal reads newest first with ages padded, and its text form keeps to 11 lines', () => {
  const noon = new Date(2026, 9, 7, 12).getTime()
  const daysAgo = (d: number) => new Date(2026, 9, 7 - d, 12).toISOString()
  const journal: Moment[] = [
    { at: daysAgo(120), kind: 'away', n: 9 },
    { at: daysAgo(15), kind: 'failRun', n: 18, group: 'shell' },
    { at: daysAgo(1), kind: 'comeback', n: 4 },
  ]
  expect(journalRows(journal, noon)).toEqual([
    { age: 'yesterday   ', text: 'a clean turn after 4 rough ones' },
    { age: '2 weeks ago ', text: 'Claude failed 18 shell commands in a row' },
    { age: '4 months ago', text: 'back after 9 days away' },
  ])
  expect(journalLines('Pip', journal, noon)).toEqual([
    "Pip's journal",
    'yesterday      a clean turn after 4 rough ones',
    '2 weeks ago    Claude failed 18 shell commands in a row',
    '4 months ago   back after 9 days away',
  ])
  expect(journalLines('Pip', undefined, noon)).toEqual(["Pip's journal", "Nothing in Pip's journal yet."])
  const full: Moment[] = Array.from({ length: 20 }, (_, i) => ({ at: daysAgo(1), kind: 'turns' as const, n: i }))
  const text = journalLines('Pip', full, noon)
  expect(text).toHaveLength(11)
  expect(text[1]).toBe('yesterday   19 turns together')
})

test('the level reads with the XP for the next one, and the text card keeps to 12 lines with it', () => {
  expect(levelText({ level: 12, stage: 'adult', xp: 13_250 })).toBe('Lv 12 adult · 13,250 / 14,400 xp')
  expect(levelText({ level: 99, stage: 'elder', xp: 1_034_500 })).toBe('Lv 99 elder · 1,034,500 xp')
  expect(achievementsText(7)).toBe('Achievements: 7 of 17')
  const progress = { level: 12, stage: 'adult' as const, xp: 13_250, earned: [], retiredAt: '2026-10-09T08:00:00.000Z' }
  const you = { lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 }
  const card = [...cardLines(SOUL, rollBones('layout-seed'), 2, progress), streakLine(you, zeroCounts()), achievementsText(0)]
  expect(card).toHaveLength(12)
  expect(card[1]).toBe('Lv 12 adult · 13,250 / 14,400 xp')
  expect(card[9]).toBe('Hatched 2026-10-07   Rerolls: 2   Retired 2026-10-09')
})

test("a card's progress: the level from the buddy's own counts, and your achievements newest first", () => {
  const buddy = { seed: 'layout-seed', soul: SOUL, retiredAt: null, counts: { ...zeroCounts(), turns: 1_210 } }
  const saved: Saved = {
    schema: 2,
    mode: 'on',
    rerolls: 0,
    active: 'layout-seed',
    buddies: [buddy],
    you: {
      lastDay: '2026-10-07',
      streak: 1,
      bestStreak: 1,
      days: 1,
      earned: {
        marathon: '2026-10-05T12:00:00.000Z',
        survivor: '2026-10-06T12:00:00.000Z',
        shell: '2026-10-06T12:00:00.000Z',
        party: '2026-10-07T12:00:00.000Z',
      },
    },
  }
  // Two earned the same day keep table order; a newer build's id is left out.
  expect(cardProgress(saved, buddy)).toEqual({
    level: 12,
    stage: 'adult',
    xp: 12_100,
    earned: ['Shell regular', 'Survivor', 'Marathon'],
    retiredAt: null,
  })
})

// Pip, a common dragon ('swap-1') retired on Nov 2 at level 30, and Mochi, a common axolotl
// ('swap-2') here now at level 12.
const DEX_RECORD: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 1,
  active: 'swap-2',
  buddies: [
    { seed: 'swap-1', soul: SOUL, retiredAt: '2026-11-02T12:00:00.000Z', counts: { ...zeroCounts(), turns: 8_410 } },
    {
      seed: 'swap-2',
      soul: { ...SOUL, name: 'Mochi', hatchedAt: '2026-11-02T12:00:00.000Z' },
      retiredAt: null,
      counts: { ...zeroCounts(), turns: 1_210 },
    },
  ],
  you: { lastDay: '2026-11-03', streak: 1, bestStreak: 1, days: 1 },
}
const NOV3 = new Date(2026, 10, 3, 12).getTime()

test('dates read off the string, with the year only when it is not this one', () => {
  expect(longDate('2026-10-07T23:30:00.000Z')).toBe('Oct 7, 2026')
  expect(shortDate('2026-10-07T23:30:00.000Z', 2026)).toBe('Oct 7')
  expect(shortDate('2025-12-31T09:00:00.000Z', 2026)).toBe('Dec 31, 2025')
})

test('the dex lists every buddy in the order you had them, each at its own level and stage', () => {
  const rows = dexRows(DEX_RECORD, NOV3)
  expect(rows.map(r => [r.number, r.name, r.level, r.stage, r.dates, r.active])).toEqual([
    [1, 'Pip', 30, 'elder', 'Oct 7 – Nov 2', false],
    [2, 'Mochi', 12, 'adult', 'Nov 2 – now', true],
  ])
  expect(dexText(rows[0]!, 2)).toBe(`#1  (×vv×)  ${'Pip'.padEnd(12)}  Lv 30 elder common dragon ★  Oct 7 – Nov 2`)
  expect(dexText(rows[1]!, 3)).toBe(`#2   }◉.◉{   ${'Mochi'.padEnd(12)}  Lv 12 adult common axolotl ★  Nov 2 – now`)
})

test('the text dex is a count, a note of any older ones, then at most the newest ten', () => {
  const many = (count: number): Saved => ({
    ...DEX_RECORD,
    active: `b${count - 1}`,
    buddies: Array.from({ length: count }, (_, i) => ({ ...DEX_RECORD.buddies[1]!, seed: `b${i}` })),
  })
  expect(dexLines(many(1), NOV3)[0]).toBe('Buddydex: 1 buddy')
  expect(dexLines(many(10), NOV3)).toHaveLength(11)
  const lines = dexLines(many(14), NOV3)
  expect(lines).toHaveLength(12)
  expect(lines.slice(0, 2)).toEqual(['Buddydex: 14 buddies', '…4 earlier'])
  expect(lines[2]).toMatch(/^#5 {3}/)
  expect(lines[11]).toMatch(/^#14 {2}.* – now$/)
})
