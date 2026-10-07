import { expect, test } from 'claude-code/testing'

import { cardAlt, cardSvg, meter, radarPoint, statAlt } from './card'
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
