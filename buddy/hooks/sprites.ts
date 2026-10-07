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
     )|
   _(  )_
   ^^  ^^
~
    ({E}O
     )|
   _(  )_
    ^^ ^^
`,
  blob: String.raw`
  .------.
 ( {E}    {E} )
 (   ~~   )
  '------'
~

 .--------.
( {E}    {E}  )
 '--------'
`,
  cat: String.raw`
  /\_/\
 ( {E} {E} )
 =\ w /=
  (")(")~
~
  /\_/\
 ( {E} {E} )
 =\ w /=
  (")(")_
`,
  dragon: String.raw`
  /)    (\
 (  {E}  {E}  )
  \  vv  /
   \____/
~
  /)    (\
 (  {E}  {E}  )
  \  ~~  /
   \____/~
`,
  octopus: String.raw`
   ,----,
  ( {E}  {E} )
  (  __  )
  //||||\\
~
   ,----,
  ( {E}  {E} )
  (  __  )
  \\||||//
`,
  owl: String.raw`
  /\____/\
 ( ({E})({E}) )
 (   \/   )
  '------'
~
  /\____/\
 ( ({E})(-) )
 (   \/   )
  '------'
`,
  penguin: String.raw`
   .--.
  ({E} v {E})
 /(    )\
   ^  ^
~
   .--.
  ({E} v {E})
 \(    )/
   ^  ^
`,
  turtle: String.raw`
   .-==-.
  ( {E}  {E} )
 /[_/\/\_]\
  ''    ''
~
   .-==-.
  ( {E}  {E} )
 /[_/\/\_]\
 ''      ''
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
   .-''-.
  / {E}  {E} \
  |   o  |
  |/\/\/\|
~
   .-''-.
  / {E}  {E} \
  |   O  |
  |\/\/\/|
`,
  axolotl: String.raw`
} ,----, {
}( {E} . {E} ){
  ( '--' )~
   ^    ^
~
{ ,----, }
{( {E} . {E} )}
  ( '--' )~
   ^    ^
`,
  capybara: String.raw`
  o______o
 ( {E}    {E} )
 (  (oo)  )
  '------'
~
  o______o
 ( {E}    {E} )
 (  (..)  )
  '------'
`,
  cactus: String.raw`
 n  .--.  n
 | | {E}{E} | |
 '-|    |-'
   |____|
~
 n  .*-.  n
 | | {E}{E} | |
 '-|    |-'
   |____|
`,
  robot: String.raw`
    _||_
  |[{E}][{E}]|
  | -==- |
  d[____]b
~
    _|*_
  |[{E}][{E}]|
  | -==- |
  d[____]b
`,
  rabbit: String.raw`
   (\  /)
  ( {E}  {E} )
 =(  w  )=
  (")-(")
~
   (\  _)
  ( {E}  {E} )
 =(  w  )=
  (")-(")
`,
  mushroom: String.raw`
  .-o--o-.
 (________)
   | {E}{E} |
   (____)
~
  .-o--o-. .
 (________)
   | {E}{E} |
   (____)
`,
  chonk: String.raw`
  /\____/\
 (  {E}  {E}  )
 (   ww   )
  (______)
~
  /\____/\
 (  {E}  {E}  )
 (   ww   )~
  (______)
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
  dragon: '({E}vv{E})',
  octopus: '({E}{E})/',
  owl: '({E})({E})',
  penguin: '<{E}v{E}>',
  turtle: '[{E}_{E}]',
  snail: '@_{E}{E}',
  ghost: '/{E}o{E}\\',
  axolotl: '}{E}.{E}{',
  capybara: '({E}oo{E})',
  cactus: '|{E}{E}|',
  robot: '[{E}][{E}]',
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
