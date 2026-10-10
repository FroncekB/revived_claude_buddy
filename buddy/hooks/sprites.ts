// ASCII art drawn fresh for this mod in the original's format: 5 rows x 12 columns, the hat row
// just above the head (row 0 for an adult), {E} marking each eye. The bodies live in
// art-hatchling.ts, art-adult.ts and art-elder.ts, one file per stage.
import type { Snack, Stage } from '../types'
import { ADULT } from './art-adult'
import { ELDER } from './art-elder'
import { HATCHLING } from './art-hatchling'
import type { HolidayId } from './calendar'
import type { Bones, Hat, Species } from './roll'

export const SPRITE_W = 12
export const BLANK = ' '.repeat(SPRITE_W)
export type Frame = 0 | 1 | 2
// The reaction poses (Alive spec section 4), drawn for every species.
export type Pose = 'flinch' | 'celebrate' | 'sleep'
export const POSES: readonly Pose[] = ['flinch', 'celebrate', 'sleep']
// Each pose fills {E} with its own eye. None is a rolled eye.
export const POSE_EYE: Record<Pose, string> = { flinch: 'O', celebrate: '^', sleep: '-' }

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

// Hats an achievement unlocks (Progression spec section 3). No roll gives one, so a tinyduck
// still means legendary. Wearing one is E's /buddy hat.
export const EARNED_HATS = ['hardhat', 'nightcap', 'flowercrown', 'headphones', 'mortarboard', 'laurel'] as const
export type EarnedHat = (typeof EARNED_HATS)[number]
export const EARNED_HAT_ART: Record<EarnedHat, string> = {
  hardhat: '   _/==\\_',
  nightcap: '    __.-*',
  flowercrown: '   @*@*@',
  headphones: '  [=----=]',
  mortarboard: '   _[==]_',
  laurel: '   ~v~v~v~',
}

// A hat a buddy can wear: one it rolled, or one you earned.
export type Wearable = Hat | EarnedHat
// A hat on a buddy's head, or none.
export type Worn = Wearable | 'none'
// A buddy's grown bones with the hat it wears in place of the one it rolled.
export type Dressed = Omit<Bones, 'hat'> & { hat: Worn }
const WEARABLE_ART: Record<Wearable, string> = { ...HAT_ART, ...EARNED_HAT_ART }

export function hatArt(hat: Wearable): string {
  return WEARABLE_ART[hat]
}

// A snack on the hat row while it's eaten, then its crumbs (Interaction spec section 2).
export const SNACK_ART: Record<Snack, string> = {
  cookie: '    (::)',
  apple: '     (@)',
  fish: '   ><(((°>',
  cheese: '    [:::>',
  berries: '     ooo',
  donut: '    ( o )',
}
export const CRUMBS = '    .  . .'

export const HEARTS: readonly string[] = ['   ♥    ♥', '  ♥   ♥  ♥', ' ♥  ♥   ♥']

// Confetti over a celebration: two patterns that alternate each tick.
export const CONFETTI: readonly string[] = [' *  .  *  . ', ' .  *  .  * ']
// A sleeper's z, zZ, zZz, rising a step every 2 ticks.
export const ZZZ: readonly string[] = ['z', 'zZ', 'zZz'].map(z => z.padStart(SPRITE_W))

// Holiday hats replace the rolled hat for the day (Alive spec section 5). The quieter days
// (MLK, Memorial, Juneteenth, Columbus and Indigenous Peoples', Veterans) have none.
export const HOLIDAY_HATS: Readonly<Partial<Record<HolidayId, string>>> = {
  newyear: '  * _|##|_ *',
  presidents: '   _|==|_',
  easter: '    (\\ /)',
  aprilfools: '   o\\/\\/o',
  july4: '   _|**|_',
  labor: '   _.--._',
  halloween: '   __/\\__',
  thanksgiving: '   _[#]_',
  winter: '    /\\__o',
  hatchday: '   ~*/\\*~',
}

// A prop stands to the right of the sprite while no bubble is up. `paint` colors it: a string
// per row, a letter per column from PAINT; a space, or a column past the paint's end, keeps
// the text color.
export type Prop = { art: readonly string[]; paint?: readonly string[] }
export const PROP_ROWS = 5
export const PROP_W = 10
export const PAINT: Readonly<Record<string, string>> = {
  r: 'red',
  y: 'yellow',
  g: 'green',
  c: 'cyan',
  b: 'blue',
  m: 'magenta',
}

// The rubber duck beside the buddy while duck mode lasts (Interaction spec section 4).
export const DUCK_PROP: Prop = {
  art: ['', '    _', '  <(.)__', '   (___/', ''],
  paint: ['', '    y', '  ryyyyy', '   yyyyy', ''],
}

export const PROPS: Readonly<Partial<Record<HolidayId, Prop>>> = {
  newyear: {
    art: ['  \\ | /', ' -- * --', '  / | \\', '     .  *', ' *   .'],
    paint: ['  y y y', ' yy y yy', '  y y y', '     m  m', ' m   m'],
  },
  mlk: {
    art: ['   __', ' >(. \\__', '   \\    )', "    '--'~"],
  },
  easter: {
    art: ['   ___', '  /   \\', ' |o 0 o|', ' |_____|'],
    paint: ['', '', '  m c y'],
  },
  memorial: {
    art: [' .@.', '(@*@)', " '@'", '  |', '  |'],
    paint: [' rrr', 'rrrrr', ' rrr', '  g', '  g'],
  },
  juneteenth: {
    art: ['|=========', '| --*--===', '|=========', '|', '|'],
    paint: [' bbbbbbbbb', '       bbb', ' rrrrrrrrr'],
  },
  july4: {
    art: ['|*:*:=====', '|:*:*-----', '|*:*:=====', '|---------', '|'],
    paint: [' bbbbrrrrr', ' bbbb', ' bbbbrrrrr'],
  },
  columbus: {
    art: ['  _/\\_', ' <    >', '  \\  /', '   \\/', '    \\'],
    paint: ['  yyyy', ' yyyyyy', '  yyyy', '   yy'],
  },
  halloween: {
    art: ['   _|_', " .'^ ^'.", '(  \\_/  )', " '.___.'"],
    paint: ['   ggg', ' yyyyyyy', 'yyyyyyyyy', ' yyyyyyy'],
  },
  veterans: {
    art: ['|*=-=', '|-=-=', '|', '|'],
    paint: [' br r', '  r r'],
  },
  thanksgiving: {
    art: [' \\|||/', '  (o>', ' /(  )\\', '  ^  ^'],
    paint: [' yrrry', '    y'],
  },
  winter: {
    art: ['    *', '   /.\\', '  /o *\\', ' /*_o__\\', '   [_]'],
    paint: ['    y', '   ggg', '  gr yg', ' gygrggg'],
  },
  hatchday: {
    art: ['  i i i', ' _|_|_|_', '|~~~~~~~|', '|_______|'],
    paint: ['  y y y', '  m m m', ' mmmmmmm'],
  },
}

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

// Each stage's bodies, every species drawn at every stage.
const STAGE_ART: Record<Stage, Record<Species, string>> = { hatchling: HATCHLING, adult: ADULT, elder: ELDER }

export function bodyRows(species: Species, stage: Stage, frame: Frame | Pose): string[] {
  const sections = parseArt(STAGE_ART[stage][species])
  const rest = sections[0]!
  if (frame === 0) return rest
  if (frame === 1) return rest.map(row => ' ' + row)
  return sections[SECTION[frame]]!
}

// The body row a stage's head starts on: its rest frame's first row with anything drawn.
export function headRow(rest: readonly string[]): number {
  return Math.max(0, rest.findIndex(row => row.trim() !== ''))
}

// The 5 sprite rows. The top row (hearts, the snack, confetti, zZ, a hat or the sparkle) sits just
// above the head, which is where the stage's rest frame starts, and every row above it is blank
// (Progression spec section 5). Every adult's head starts on its first body row, so its top row is
// row 0. Art keeps the rows above the head blank in every section, so the top row covers nothing.
export function spriteRows(o: { species: Species; stage: Stage; eye: string; frame: Frame | Pose; top: string }): string[] {
  const rows = [BLANK, ...bodyRows(o.species, o.stage, o.frame).map(row => fillEyes(row, o.eye))]
  rows[headRow(bodyRows(o.species, o.stage, 0))] = o.top
  return rows.map(fit)
}

// The hat row, the first that applies: hearts, a snack, confetti, zZ, a holiday hat, the hat, the sparkle.
export function topRow(o: {
  hat: Worn
  heartsFrame: number | null
  sparkle: number | null
  snack?: string | null
  confetti?: number | null
  zzz?: number | null
  holidayHat?: string | null
}): string {
  const confetti = o.confetti ?? null
  const zzz = o.zzz ?? null
  if (o.heartsFrame !== null) return fit(HEARTS[o.heartsFrame % HEARTS.length]!)
  if (o.snack) return fit(o.snack)
  if (confetti !== null) return fit(CONFETTI[confetti % CONFETTI.length]!)
  if (zzz !== null) return fit(ZZZ[Math.floor(zzz / 2) % ZZZ.length]!)
  if (o.holidayHat) return fit(o.holidayHat)
  if (o.hat !== 'none') return fit(hatArt(o.hat))
  if (o.sparkle !== null) return fit(o.sparkle % 2 === 0 ? '*' : ' '.repeat(SPRITE_W - 1) + '*')
  return BLANK
}

// The egg carried beside the buddy (Breeding spec section 6): 3 rows by 5 columns, whole and
// cracked, standing in a gutter 7 columns wide so it can lean a column either way.
export const EGG_GUTTER = 7
export const SMALL_EGG: readonly string[] = [' .-. ', '(   )', " '-' "]
export const SMALL_EGG_CRACKED: readonly string[] = [' .-. ', '(\\/\\)', " '-' "]

// The ticks of the 16-tick cycle a wobble starts on, leaning left, then right on the next: more
// often as the egg nears its hatch.
function wobbleStarts(f: number): readonly number[] {
  if (f >= 0.9) return [0, 4, 8, 12]
  if (f >= 0.5) return [4, 12]
  return [8]
}

// The gutter's 5 rows at `tick`, the egg on the bottom 3, standing on the sprite's ground row. `f`
// is how far along it is, 0 to 1. Cracked from 0.9, and shaking every tick while it hatches; still
// while the buddy sleeps.
export function eggGutterRows(o: { f: number; tick: number; hatching: boolean; still: boolean }): string[] {
  const t = ((o.tick % 16) + 16) % 16
  const starts = wobbleStarts(o.f)
  let lean = 0
  if (o.hatching) lean = t % 2 === 0 ? -1 : 1
  else if (!o.still && starts.includes(t)) lean = -1
  else if (!o.still && starts.includes(t - 1)) lean = 1
  const art = o.hatching || o.f >= 0.9 ? SMALL_EGG_CRACKED : SMALL_EGG
  return ['', '', ...art].map(row => (row ? ' '.repeat(1 + lean) + row : '').padEnd(EGG_GUTTER))
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
