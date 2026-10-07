// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12
// columns, row 0 kept for a hat, {E} marking each eye.
import type { Hat, Species } from './roll'

export const SPRITE_W = 12
export const BLANK = ' '.repeat(SPRITE_W)
export type Frame = 0 | 1 | 2
// The reaction poses (Alive spec section 4), drawn for every species.
export type Pose = 'flinch' | 'celebrate' | 'sleep'
export const POSES: readonly Pose[] = ['flinch', 'celebrate', 'sleep']
// Each pose fills {E} with its own eye. None is a rolled eye.
export const POSE_EYE: Record<Pose, string> = { flinch: 'O', celebrate: '^', sleep: '-' }

// Each entry: five sections of four body rows, split by lines holding only "~": rest,
// fidget B, flinch, celebrate, sleep. Lines start at column 0. Rest rows stay within 11
// columns so fidget A (rest nudged one column right) still fits; the others may use all 12.
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
~
    __  !
  <({E} )___
  \( ._> /\
    '---'
~
  \ __
  <({E} )___/
   ( ._> /
    '---'
~

    __
  <({E} )____
   (_.__>_/
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
~
  ! ({E}>
    ( |
   _(  )_
   ^^  ^^
~
    ({E}>
  \  )|  /
   _(  )_
   ^^  ^^
~

    _____
   _( {E}<)_
   ^^  ^^
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
~
 .-------. !
( {E}    {E}  )
 (   oo   )
  '------'
~
  .------.
\( {E}    {E} )/
 (   \/   )
  '------'
~

  .------.
 ( {E}    {E} )
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
~
  /\_/\  !
 ( {E} {E} )
 =\ o /=
 /(")(")\
~
  /\_/\
 ( {E} {E} )
\=\ w /=/
  (")(")~
~

  /\_/\___
 ( {E} {E}    )~
  (")(")___)
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
~
  /)    (\ !
 (  {E}  {E}  )
  \  ^^  /
   \____/~
~
  /)    (\
 (  {E}  {E}  )
  \  vv  /~*
   \____/
~

  /)____(\
 (  {E}  {E}  )
  \______/
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
~
   ,----, !
  ( {E}  {E} )
  (  oo  )
 /// || \\\
~
\\ ,----, //
 \( {E}  {E} )/
  (  \/  )
   /||||\
~

   ,----,
  ( {E}  {E} )
 ~~||||||~~
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
~
  /\____/\ !
 ( ({E})({E}) )
 (   <>   )
 /'------'\
~
  /\____/\
\( ({E})({E}) )/
 (   \/   )
  '------'
~

  /\____/\
 ( ({E})({E}) )
 (___\/___)
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
~
   .--.  !
  ({E} o {E})
 -(    )-
   ^  ^
~
 \ .--. /
  ({E} v {E})
   (    )
  ^    ^
~

   .--.
  ({E} v {E})
 _(____)_
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
~
   .-==-. !
  ( {E}  {E} )
  [_/\/\_]
   ''  ''
~
   .-==-.
 \( {E}  {E} )/
 /[_/\/\_]\
  ''    ''
~

   .-==-.
  [_/{E}{E}\_]
  ''    ''
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
~
  !   .--.
 {E}{E}  ( @ )
  \_\_)__/
   ~~~~~~
~
 {E}   {E} .--.
  \ / ( @ )
  \_\_)__/
   ~~~~~~
~

      .--.
  {E}{E} ( @ )
  \__)__/
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
~
  .-''-.  !
 / {E}  {E}  \
 |   O   |
 |\/\/\/\|
~
   .-''-.
\ / {E}  {E} \ /
  |   v  |
  |/\/\/\|
~

   .-''-.
  / {E}  {E} \
  '~~~~~~'
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
~
}},----,{{ !
}( {E} . {E} ){
  ( 'oo' )~
   ^    ^
~
{ ,----, }
{( {E} . {E} )}
 \( '--' )/
   ^    ^
~

} ,----, {
}( {E} . {E} ){
 ~( ____ )~
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
~
  o______o !
 ( {E}    {E} )
 (  (OO)  )
 /'------'\
~
  o______o
\( {E}    {E} )/
 (  (oo)  )
  '------'
~

  o______o
 ( {E}    {E} )
 (__(..)__)
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
~
 n *.--.* n
 | | {E}{E} | |
 '-|  o |-'
   |____|
~
\n  .*-.  n/
 | | {E}{E} | |
 '-|    |-'
   |____|
~
    .--.
   | {E}{E} |
 .-|    |-.
 U |____| U
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
~
  * _||_ *
  |[{E}][{E}]|
  | -!!- |
  d[____]b
~
    _||_
\ |[{E}][{E}]| /
  | \__/ |
  d[____]b
~
    _||_
  |[{E}][{E}]|
  | .... |
 _d[____]b_
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
~
   ||  || !
  ( {E}  {E} )
 =(  o  )=
  (")-(")
~
   (\  /)
 \( {E}  {E} )/
 =(  w  )=
  ('')('')
~

  __    __
  ( {E}  {E} )
 =(__w__)=
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
~
 .-o--o-. .
(________) !
   | {E}{E} |
   (____)
~
  .-o--o-.
 (________)
 \ | {E}{E} | /
   (____)
~

  .-o--o-.
 (________)
   (_{E}{E}_)
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
~
  /\____/\ !
 (  {E}  {E}  )
 (   oo   )
 /(______)\
~
  /\____/\
\(  {E}  {E}  )/
 (   ww   )
  (______)
~

  /\____/\
 (  {E}  {E}  )
 (________)~
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

// An art string's sections, split at its "~" lines.
function parseArt(art: string): string[][] {
  const sections: string[][] = [[]]
  for (const line of art.replace(/\r/g, '').split('\n').slice(1, -1)) {
    if (line === '~') sections.push([])
    else sections[sections.length - 1]!.push(line)
  }
  return sections
}

// Pads only. A row that overflows stays long so the tests catch it.
function fit(row: string): string {
  return row.padEnd(SPRITE_W)
}

export function fillEyes(row: string, eye: string): string {
  return row.split('{E}').join(eye)
}

// Where each frame after the rest frame sits in a species' art.
const SECTION: Record<2 | Pose, number> = { 2: 1, flinch: 2, celebrate: 3, sleep: 4 }

export function bodyRows(species: Species, frame: Frame | Pose): string[] {
  const sections = parseArt(ART[species])
  const rest = sections[0]!
  if (frame === 0) return rest
  if (frame === 1) return rest.map(row => ' ' + row)
  return sections[SECTION[frame]]!
}

export function spriteRows(o: { species: Species; eye: string; frame: Frame | Pose; top: string }): string[] {
  return [o.top, ...bodyRows(o.species, o.frame).map(row => fillEyes(row, o.eye))].map(fit)
}

export function topRow(o: { hat: Hat | 'none'; heartsFrame: number | null; sparkle: number | null }): string {
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.hat !== 'none') return fit(HAT_ART[o.hat])
  if (o.sparkle !== null) return fit(o.sparkle % 2 === 0 ? '*' : ' '.repeat(SPRITE_W - 1) + '*')
  return BLANK
}

export function eggRows(frame: Frame): string[] {
  const [whole, cracked] = parseArt(EGG) as [string[], string[]]
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
