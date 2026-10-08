import { expect, test } from 'claude-code/testing'

import { ACHIEVEMENTS } from './achievements'
import { cardAlt, cardSvg, journalAlt, journalSvg, meter, radarPoint, statAlt } from './card'
import type { CardProgress } from './layout'
import { zeroCounts } from './ledger'
import type { Bones } from './roll'

const BONES: Bones = {
  rarity: 'uncommon',
  species: 'mushroom',
  eye: '✦',
  hat: 'propeller',
  shiny: false,
  stats: { DEBUGGING: 18, PATIENCE: 22, CHAOS: 35, WISDOM: 94, SNARK: 21 },
  peak: 'WISDOM',
  low: 'DEBUGGING',
}
const SOUL = { name: 'Nib', personality: 'Speaks rarely, mostly in proverbs.', hatchedAt: '2026-10-07T12:00:00.000Z' }
const LONG =
  'Speaks rarely, mostly in proverbs about caching, and when it does speak it goes on and on about eviction policies until everyone has left the room.'

const distance = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => Math.hypot(x2 - x1, y2 - y1)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('a radar point moves out from the center in proportion to its stat', () => {
  const center = radarPoint(0, 0)
  for (let i = 0; i < 5; i++) {
    expect(radarPoint(i, 0)).toEqual(center)
    expect(near(distance(center, radarPoint(i, 50)) * 2, distance(center, radarPoint(i, 100)))).toBe(true)
  }
})

test('the first stat points straight up and the rest go clockwise', () => {
  const [cx, cy] = radarPoint(0, 0)
  const [x0, y0] = radarPoint(0, 100)
  expect(near(x0, cx)).toBe(true)
  expect(y0).toBeLessThan(cy)
  const [x1, y1] = radarPoint(1, 100)
  expect(x1).toBeGreaterThan(cx)
  expect(y1).toBeLessThan(cy)
  const [x4] = radarPoint(4, 100)
  expect(x4).toBeLessThan(cx)
})

test("the card's chart labels every stat with its value and stars the peak", () => {
  const svg = cardSvg(SOUL, BONES, 0)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('<polygon')
  for (const [name, value] of Object.entries(BONES.stats)) {
    expect(svg).toContain(`>${name}<`)
    expect(svg).toContain(`>${value}<`)
  }
  // A star sits in a stat's label when no </text> comes between it and the name: only the peak's.
  const starred = (stat: string) => new RegExp(`★(?:(?!</text>).)*>${stat}<`, 's').test(svg)
  expect(Object.keys(BONES.stats).filter(starred)).toEqual(['WISDOM'])
})

test('the chart alt text reads out every stat, the peak and the low', () => {
  expect(statAlt(BONES)).toBe('Stats: DEBUGGING 18 (lowest), PATIENCE 22, CHAOS 35, WISDOM 94 (highest), SNARK 21')
})

test('the card names the buddy and carries its kind, personality, traits and history', () => {
  const svg = cardSvg(SOUL, BONES, 1)
  expect(svg).toContain('>Nib<')
  expect(svg).toContain('>★★<')
  expect(svg).toContain('>Uncommon mushroom<')
  expect(svg).toContain('Speaks rarely, mostly in proverbs.')
  expect(svg).toContain('>Propeller hat<')
  expect(svg).toContain('>✦ eyes<')
  expect(svg).not.toContain('Shiny')
  expect(svg).toContain('>Hatched Oct 7, 2026<')
  expect(svg).toContain('>Rerolls 1<')
})

test('a long personality wraps to three quoted lines', () => {
  const svg = cardSvg({ ...SOUL, personality: LONG }, BONES, 0)
  expect(svg.split('font-style="italic"')).toHaveLength(4)
  expect(svg.split('“')).toHaveLength(2)
  expect(svg.split('”')).toHaveLength(2)
  expect(svg).toContain('…')
})

test('a bare head gets no hat chip, and a shiny buddy gets one of its own', () => {
  const svg = cardSvg(SOUL, { ...BONES, hat: 'none', shiny: true }, 0)
  expect(svg).not.toMatch(/hat</i)
  expect(svg).toContain('>Shiny<')
})

test('the model-written name and personality are escaped', () => {
  const svg = cardSvg({ ...SOUL, name: 'A<b>&"c', personality: 'Uses <script> & "quotes".' }, BONES, 0)
  expect(svg).toContain('A&lt;b&gt;&amp;&quot;c')
  expect(svg).toContain('Uses &lt;script&gt; &amp; &quot;quotes&quot;.')
  expect(svg).not.toContain('<b>')
  expect(svg).not.toContain('<script>')
})

test('the card alt text reads out the whole card', () => {
  expect(cardAlt(SOUL, BONES, 1)).toBe(
    'Nib, uncommon mushroom, 2 stars. "Speaks rarely, mostly in proverbs." Propeller hat, ✦ eyes. ' +
      `${statAlt(BONES)}. Hatched Oct 7, 2026. Rerolls 1.`,
  )
})

test('a meter fills in eighths of a cell and pads to its width', () => {
  expect(meter(0, 20)).toBe(' '.repeat(20))
  expect(meter(100, 20)).toBe('█'.repeat(20))
  expect(meter(50, 20)).toBe('█'.repeat(10) + ' '.repeat(10))
  expect(meter(18, 20)).toBe('███▋' + ' '.repeat(16))
  expect(meter(94, 20)).toBe('█'.repeat(18) + '▊' + ' ')
})

test('the card colors epic gold and legendary purple, like the band', () => {
  const fillOf = (rarity: Bones['rarity']) => /font-size="22" font-weight="700" fill="(#[0-9a-f]{6})"/.exec(cardSvg(SOUL, { ...BONES, rarity }, 0))?.[1]
  expect(fillOf('epic')).toBe('#c99a12')
  expect(fillOf('legendary')).toBe('#b45bd1')
})

test("a shiny buddy's portrait stays gold whatever its rarity", () => {
  for (const rarity of ['common', 'legendary'] as const) {
    expect(cardSvg(SOUL, { ...BONES, rarity, shiny: true }, 0)).toContain('font-size="15" fill="#c99a12"')
  }
})

test('given the history, the card adds a streak row 20 px lower and the alt text ends with it', () => {
  const history = {
    you: { lastDay: '2026-10-07', streak: 12, bestStreak: 30, days: 40 },
    counts: { ...zeroCounts(), turns: 340, calls: { ...zeroCounts().calls, shell: 2_104 } },
  }
  const svg = cardSvg(SOUL, BONES, 0, history)
  expect(svg).toContain('>Streak 12 days (best 30)</text>')
  expect(svg).toContain('>340 turns · 2,104 tool calls</text>')
  const plain = cardSvg(SOUL, BONES, 0)
  expect(plain).not.toContain('Streak')
  const height = (s: string) => Number(/height="(\d+)"/.exec(s)?.[1])
  expect(height(svg)).toBe(height(plain) + 20)
  expect(cardAlt(SOUL, BONES, 0, history)).toBe(
    `${cardAlt(SOUL, BONES, 0)} Streak 12 days (best 30) · 340 turns · 2,104 tool calls.`,
  )
})

test("the journal is drawn in the card's frame, a row per moment, growing with them; its alt reads them out", () => {
  const rows = [
    { age: 'yesterday  ', text: 'a clean turn after 4 rough ones' },
    { age: '2 weeks ago', text: 'Claude failed <18> shell commands in a row' },
  ]
  const svg = journalSvg('Nib', BONES, rows)
  expect(svg).toContain('>Nib&#39;s journal</text>')
  expect(svg).toContain('>yesterday</text>')
  expect(svg).toContain('>Claude failed &lt;18&gt; shell commands in a row</text>')
  expect(svg).toContain('width="420" height="122"')
  expect(journalSvg('Nib', BONES, Array.from({ length: 20 }, () => rows[0]!))).toContain('width="420" height="518"')
  const empty = journalSvg('Nib', BONES, [])
  expect(empty).toContain('width="420" height="100"')
  expect(empty).toContain('>Nothing in Nib&#39;s journal yet.</text>')
  expect(journalAlt('Nib', rows)).toBe(
    "Nib's journal. Yesterday: a clean turn after 4 rough ones. 2 weeks ago: Claude failed <18> shell commands in a row.",
  )
  expect(journalAlt('Nib', [])).toBe("Nothing in Nib's journal yet.")
})

const PROGRESS: CardProgress = { level: 12, stage: 'adult', xp: 13_250, earned: ['Marathon', 'Shell regular'], retiredAt: null }
const heightOf = (svg: string) => Number(/height="(\d+)"/.exec(svg)?.[1])

test('given its progress, the card shows the level, an XP bar part full, and the achievements', () => {
  const svg = cardSvg(SOUL, BONES, 0, undefined, PROGRESS)
  expect(svg).toContain('>Lv 12 adult</text>')
  expect(svg).toContain('>13,250 / 14,400 xp</text>')
  // 13,250 is 1,150 of the 2,300 XP from level 12 to 13: half of the 372 px bar.
  expect(svg).toContain('width="186.0" height="6"')
  expect(svg).toContain('>Achievements 2 of 17</text>')
  expect(svg.indexOf('>Marathon</text>')).toBeLessThan(svg.indexOf('>Shell regular</text>'))
  expect(cardAlt(SOUL, BONES, 0, undefined, PROGRESS)).toBe(
    'Nib, uncommon mushroom, 2 stars. "Speaks rarely, mostly in proverbs." Propeller hat, ✦ eyes. ' +
      `${statAlt(BONES)}. Level 12, adult, 13,250 of 14,400 XP. 2 of 17 achievements: Marathon, Shell regular. ` +
      'Hatched Oct 7, 2026. Rerolls 0.',
  )
})

test('the XP bar is empty at the start of a level, and full at 99 with no next level', () => {
  expect(cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, xp: 12_100 })).toContain('width="0.0" height="6"')
  const top = { ...PROGRESS, level: 99, stage: 'elder' as const, xp: 1_034_500, earned: [] }
  const svg = cardSvg(SOUL, BONES, 0, undefined, top)
  expect(svg).toContain('>1,034,500 xp</text>')
  expect(svg).toContain('width="372.0" height="6"')
  expect(cardAlt(SOUL, BONES, 0, undefined, top)).toContain('Level 99, elder, 1,034,500 XP. 0 of 17 achievements. Hatched')
})

test('a retired buddy says when it retired, and achievement titles are escaped', () => {
  const retired = { ...PROGRESS, earned: ['<b>'], retiredAt: '2026-10-09T08:00:00.000Z' }
  const svg = cardSvg(SOUL, BONES, 0, undefined, retired)
  expect(svg).toContain('>Retired Oct 9, 2026</text>')
  expect(svg).toContain('>&lt;b&gt;</text>')
  expect(cardAlt(SOUL, BONES, 0, undefined, retired)).toContain('Hatched Oct 7, 2026. Retired Oct 9, 2026. Rerolls 0.')
})

test('the card grows with its chips, and progress adds 70 px under the last row', () => {
  const none = cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, earned: [] })
  const all = cardSvg(SOUL, BONES, 0, undefined, { ...PROGRESS, earned: ACHIEVEMENTS.map(a => a.title) })
  expect(heightOf(all)).toBeGreaterThan(heightOf(none) + 60)
  expect(heightOf(none)).toBe(heightOf(cardSvg(SOUL, BONES, 0)) + 70)
})
