import { expect, test } from 'claude-code/testing'

import { SHIMMER, rightRuns } from './layout'
import { RARITIES, RARITY } from './roll'
import { PAINT } from './sprites'
import { CHAR_PX, LINE_PX, SVG_COLORS, bandSvg } from './svg'

const SPRITE = ['     *      ', '    __      ', '  <(· )___  ', '   ( ._> /  ', "    '---'   "]
const NO_BUBBLE = ['', '', '', '', '']

test('each row is one text line with its spaces kept and markup characters escaped', () => {
  const { source } = bandSvg({ sprite: SPRITE, right: rightRuns(NO_BUBBLE, null), color: undefined, bold: false })
  expect(source.match(/<text /g)).toHaveLength(5)
  expect(source).toContain('xml:space="preserve"')
  expect(source).toContain('>     *      <')
  expect(source).toContain('>  &lt;(· )___  <')
  expect(source).toContain('>   ( ._&gt; /  <')
  expect(source).toContain(">    &#39;---&#39;   <")
})

test("the model's bubble text cannot inject markup", () => {
  const bubble = ['', '< <script>&"hi" |', '', '', '']
  const { source } = bandSvg({ sprite: SPRITE, right: rightRuns(bubble, null),color: undefined, bold: false })
  expect(source).not.toContain('<script>')
  expect(source).toContain('&lt;script&gt;&amp;&quot;hi&quot;')
})

test('the sprite fill follows its color in light and dark themes, bold when asked', () => {
  const { source } = bandSvg({ sprite: SPRITE, right: rightRuns(NO_BUBBLE, null), color: 'green', bold: true })
  const [light, dark] = SVG_COLORS.green!
  expect(source).toContain(`.sprite{fill:${light};font-weight:bold}`)
  expect(source).toContain(`@media (prefers-color-scheme:dark){.ink{fill:${SVG_COLORS.ink![1]}}.sprite{fill:${dark}}}`)
  expect(bandSvg({ sprite: SPRITE, right: rightRuns(NO_BUBBLE, null), color: undefined, bold: false }).source).toContain(
    `.sprite{fill:${SVG_COLORS.ink![0]}}`,
  )
})

test('every color the band can ask for has a light and a dark fill', () => {
  const asked = [...SHIMMER, ...Object.values(PAINT), ...RARITIES.map(r => RARITY[r].color).filter(c => c !== undefined)]
  for (const color of asked) expect(SVG_COLORS[color]).toHaveLength(2)
})

test('the box fits the longest row and all five lines', () => {
  const bubble = ['', '< a longer line from the buddy |', '', '', '']
  const { width, height } = bandSvg({ sprite: SPRITE, right: rightRuns(bubble, null),color: undefined, bold: false })
  expect(width).toBeGreaterThanOrEqual((12 + 1 + bubble[1]!.length) * CHAR_PX)
  expect(height).toBeGreaterThanOrEqual(5 * LINE_PX)
})

test('a painted prop gets its own fills in light and dark themes', () => {
  const right = rightRuns(['', '', '', '', ''], { art: ['|*='], paint: [' br'] })
  const { source } = bandSvg({ sprite: SPRITE, right, color: undefined, bold: false })
  expect(source).toContain('<tspan class="paint-blue">*</tspan><tspan class="paint-red">=</tspan>')
  expect(source).toContain(`.paint-blue{fill:${SVG_COLORS.blue![0]}}`)
  expect(source).toContain(`.paint-red{fill:${SVG_COLORS.red![1]}}}`)
})
