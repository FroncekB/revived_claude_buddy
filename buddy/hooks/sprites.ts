// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12
// columns, row 0 kept for a hat, {E} marking each eye.
import type { Hat, Species } from './roll'

export const SPRITE_W = 12
export const BLANK = ' '.repeat(SPRITE_W)
export type Frame = 0 | 1 | 2

// Each entry: the rest frame's four body rows, a line holding only "~", then
// the fidget-B frame's four body rows. Lines start at column 0. Rest rows stay
// within 11 columns so fidget A (rest nudged one column right) still fits.
const ART: Record<Species, string> = {
  duck: String.raw`
    __
  <({E} )___
   ( ._> /
    '---'
~
    __
  <({E} )___
   ( ._> \/
    '---'
`,
  goose: String.raw`
   ({E}>
    ) )
  _/  (_
  \____/
~
   ({E}O
    ) )
  _/  (_
  \____/
`,
  blob: String.raw`
   .---.
  ( {E} {E} )
  (  ~  )
   '---'
~

  .-----.
 ( {E}   {E} )
  '-----'
`,
  cat: String.raw`
  /\_/\
 ( {E}.{E} )
  > ^ <
 (_____)~
~
  /\_/\
 ( {E}.{E} )
  > ^ <
 (_____)_
`,
  dragon: String.raw`
  __/\__
 ({E}  {E} )~>
  \ ^^ /
  /_/\_\
~
  __/\__
 ({E}  {E} )~>*
  \ ^^ /
  /_/\_\
`,
  octopus: String.raw`
   .--.
  ( {E}{E} )
  /||||\
  \/\/\/
~
   .--.
  ( {E}{E} )
  \||||/
  /\/\/\
`,
  owl: String.raw`
  /\__/\
 ( {E}  {E} )
 (  vv  )
  '----'
~
  /\__/\
 ( {E}  - )
 (  vv  )
  '----'
`,
  penguin: String.raw`
   .--.
  ({E} v {E})
  /(  )\
   ^  ^
~
   .--.
  ({E} v {E})
  \(  )/
   ^  ^
`,
  turtle: String.raw`
   ____
 _/____\({E}>
 \_____/
  ^   ^
~
   ____
 _/____\{E}>
 \_____/
  ^   ^
`,
  snail: String.raw`
 {E} {E}  .--.
 \ \ ( @ )
  \_\_)__/
   ~~~~~~
~
 {E}  {E} .--.
 | / ( @ )
  \_\_)__/
   ~~~~~~
`,
  ghost: String.raw`
   .--.
  / {E}{E} \
  |  o |
  |/\/\|
~
   .--.
  / {E}{E} \
  |  O |
  |\/\/|
`,
  axolotl: String.raw`
 >\.--./<
  ( {E}{E} )
  ( ww )~
   ^  ^
~
 >/.--.\<
  ( {E}{E} )
  ( ww )~
   ^  ^
`,
  capybara: String.raw`
  ._____.
 ( {E}    \
 (u______)
  ||   ||
~
  ._____.
 ( {E}    \
 (o______)
  ||   ||
`,
  cactus: String.raw`
    .-.
 .-.|{E}{E}|.-.
 '-'|  |'-'
    |__|
~
    .*.
 .-.|{E}{E}|.-.
 '-'|  |'-'
    |__|
`,
  robot: String.raw`
    ||
  [{E}__{E}]
  |[==]|
  d|__|b
~
    |*
  [{E}__{E}]
  |[==]|
  d|__|b
`,
  rabbit: String.raw`
  (\ /)
  (\_/)
  ( {E}.{E})
  c(")(")
~
  (\ -)
  (\_/)
  ( {E}.{E})
  c(")(")
`,
  mushroom: String.raw`
  .-'''-.
 /  o  o \
 '-------'
   |{E}{E}|
~
  .-'''-. .
 /  o  o \
 '-------'
   |{E}{E}|
`,
  chonk: String.raw`
  /\___/\
 (  {E} {E}  )
 (   w   )
  (_____)
~
  /\___/\
 (  {E} {E}  )
 (   w   )~
  (_____)
`,
}

const EGG = String.raw`
    .--.
   /    \
   \    /
    '--'
~
    .--.
   /\/\/\
   \    /
    '--'
`

const FACE: Record<Species, string> = {
  duck: '<({E})',
  goose: '({E}>',
  blob: '({E}{E})',
  cat: '=^{E}^=',
  dragon: '({E}{E})>',
  octopus: '({E}{E})/',
  owl: '({E}v{E})',
  penguin: '<{E}v{E}>',
  turtle: '[]{E}>',
  snail: '@_{E}{E}',
  ghost: '/{E}{E}\\',
  axolotl: '>({E}{E})<',
  capybara: '({E}u)',
  cactus: '|{E}{E}|',
  robot: '[{E}_{E}]',
  rabbit: '({E}.{E})',
  mushroom: '^{E}{E}^',
  chonk: '({E}w{E})',
}

export const HAT_ART: Record<Hat, string> = {
  crown: '   .WWW.',
  tophat: '   _|##|_',
  propeller: '    -=+=-',
  halo: '    (  )',
  wizard: '     /*\\',
  beanie: '    (##)',
  tinyduck: "     <(')",
}

export const HEARTS: readonly string[] = ['   ♥    ♥', '  ♥   ♥  ♥', ' ♥  ♥   ♥']

function parseArt(art: string): [string[], string[]] {
  const lines = art.replace(/\r/g, '').split('\n').slice(1, -1)
  const cut = lines.indexOf('~')
  return [lines.slice(0, cut), lines.slice(cut + 1)]
}

// Pads only. A row that overflows stays long so the tests catch it.
function fit(row: string): string {
  return row.padEnd(SPRITE_W)
}

export function fillEyes(row: string, eye: string): string {
  return row.split('{E}').join(eye)
}

export function bodyRows(species: Species, frame: Frame): string[] {
  const [rest, alt] = parseArt(ART[species])
  if (frame === 1) return rest.map(row => ' ' + row)
  return frame === 0 ? rest : alt
}

export function spriteRows(o: { species: Species; eye: string; frame: Frame; top: string }): string[] {
  return [o.top, ...bodyRows(o.species, o.frame).map(row => fillEyes(row, o.eye))].map(fit)
}

export function topRow(o: { hat: Hat | 'none'; heartsFrame: number | null; sparkle: number | null }): string {
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
  if (o.sparkle !== null) return fit(o.sparkle % 2 === 0 ? '*' : ' '.repeat(SPRITE_W - 1) + '*')
  return BLANK
}

export function eggRows(frame: Frame): string[] {
  const [whole, cracked] = parseArt(EGG)
  const body = frame === 0 ? whole : frame === 1 ? whole.map(row => ' ' + row) : cracked
  return [BLANK, ...body].map(fit)
}

export function faceFor(species: Species, eye: string): string {
  return fillEyes(FACE[species], eye)
}

// 16-tick cycle: rest, fidget A at 5, fidget B at 11, a blink at 14.
export function frameAt(tick: number): { frame: Frame; blink: boolean } {
  const t = ((tick % 16) + 16) % 16
  if (t === 5) return { frame: 1, blink: false }
  if (t === 11) return { frame: 2, blink: false }
  return { frame: 0, blink: t === 14 }
}
