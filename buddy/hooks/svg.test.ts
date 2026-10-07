import { expect, test } from 'claude-code/testing'

import { SHIMMER } from './layout'
import { RARITIES, RARITY } from './roll'
import { CHAR_PX, LINE_PX, SVG_COLORS, bandSvg } from './svg'

const SPRITE = ['     *      ', '    __      ', '  <(· )___  ', '   ( ._> /  ', "    '---'   "]
const NO_BUBBLE = ['', '', '', '', '']

test('each row is one text line with its spaces kept and markup characters escaped', () => {
  const { source } = bandSvg({ sprite: SPRITE, bubble: NO_BUBBLE, color: undefined, bold: false })
  expect(source.match(/<text /g)).toHaveLength(5)
  expect(source).toContain('xml:space="preserve"')
  expect(source).toContain('>     *      <')
  expect(source).toContain('>  &lt;(· )___  <')
  expect(source).toContain('>   ( ._&gt; /  <')
  expect(source).toContain(">    &#39;---&#39;   <")
})

test("the model's bubble text cannot inject markup", () => {
  const bubble = ['', '< <script>&"hi" |', '', '', '']
  const { source } = bandSvg({ sprite: SPRITE, bubble, color: undefined, bold: false })
  expect(source).not.toContain('<script>')
  expect(source).toContain('&lt;script&gt;&amp;&quot;hi&quot;')
})

test('the sprite fill follows its color in light and dark themes, bold when asked', () => {
  const { source } = bandSvg({ sprite: SPRITE, bubble: NO_BUBBLE, color: 'green', bold: true })
  const [light, dark] = SVG_COLORS.green!
  expect(source).toContain(`.sprite{fill:${light};font-weight:bold}`)
  expect(source).toContain(`@media (prefers-color-scheme:dark){.ink{fill:${SVG_COLORS.ink![1]}}.sprite{fill:${dark}}}`)
  expect(bandSvg({ sprite: SPRITE, bubble: NO_BUBBLE, color: undefined, bold: false }).source).toContain(
    `.sprite{fill:${SVG_COLORS.ink![0]}}`,
  )
})

test('every color the band can ask for has a light and a dark fill', () => {
  const asked = [...SHIMMER, ...RARITIES.map(r => RARITY[r].color).filter(c => c !== undefined)]
  for (const color of asked) expect(SVG_COLORS[color]).toHaveLength(2)
})

test('the box fits the longest row and all five lines', () => {
  const bubble = ['', '< a longer line from the buddy |', '', '', '']
  const { width, height } = bandSvg({ sprite: SPRITE, bubble, color: undefined, bold: false })
  expect(width).toBeGreaterThanOrEqual((12 + 1 + bubble[1]!.length) * CHAR_PX)
  expect(height).toBeGreaterThanOrEqual(5 * LINE_PX)
})
