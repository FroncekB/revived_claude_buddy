// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
import type { Buddy, Saved, Snack } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME, earnedHats } from './achievements'
import { bornBones } from './breed'
import { bonesFor } from './progress'
import { HATS } from './roll'
import { EARNED_HATS } from './sprites'
import type { Dressed, Wearable, Worn } from './sprites'
import { RESERVED_NAMES, nth, validName } from './voice'

// The answer to /buddy rename when `name` can't be the buddy's new name; null when it can. A
// change of case alone is a rename.
export function renameRefusal(name: string, current: string): string | null {
  if (RESERVED_NAMES.has(name.toLowerCase())) return `${name} starts too many prompts to be a name.`
  if (!validName(name)) return 'A name is one word of letters, at most 12.'
  return name === current ? `${current} is already its name.` : null
}

export function renamePrompt(from: string, to: string): string {
  return `The developer just renamed you from ${from} to ${to}. React in one line.`
}

export function renameFallback(to: string): string {
  return `${to}. I like it.`
}

// What each hat is called in a sentence.
export const HAT_NAME: Record<Wearable, string> = {
  crown: 'a crown',
  tophat: 'a top hat',
  propeller: 'a propeller cap',
  halo: 'a halo',
  wizard: 'a wizard hat',
  beanie: 'a beanie',
  tinyduck: 'a tiny duck',
  ...EARNED_HAT_NAME,
}

const WEARABLES: readonly Wearable[] = [...HATS, ...EARNED_HATS]
const isEarned = (hat: Worn) => (EARNED_HATS as readonly string[]).includes(hat)

// What a hat is judged against: your achievements, and the dex, where a bred buddy's parents are.
export type Kin = Pick<Saved, 'you' | 'buddies'>

// What `buddy` can wear: its own rolled hat if it rolled one, every hat you've earned in table
// order, then none. Never another buddy's rolled hat, so a tiny duck still means legendary. A
// bred buddy's rolled hat is the one its bred bones give (Breeding spec section 4).
export function wearable(buddy: Pick<Buddy, 'seed'>, kin: Kin): Worn[] {
  const rolled = bornBones(kin.buddies, buddy.seed).hat
  return [...(rolled === 'none' ? [] : [rolled]), ...earnedHats(kin.you), 'none']
}

// The hat `buddy` wears: its saved choice when it can wear that, else the hat it rolled. A choice
// it can't wear (unknown, not earned, another buddy's, or not a string) stays saved but unseen.
export function wornHat(buddy: Pick<Buddy, 'seed' | 'hat'>, kin: Kin): Worn {
  const choice: unknown = buddy.hat
  return wearable(buddy, kin).find(h => h === choice) ?? bornBones(kin.buddies, buddy.seed).hat
}

// A buddy's bones as the band, card and dex draw them: grown by its counts, in the hat it wears.
export function dressed(buddy: Pick<Buddy, 'seed' | 'counts' | 'hat'>, kin: Kin): Dressed {
  return { ...bonesFor(buddy, kin.buddies), hat: wornHat(buddy, kin) }
}

// The answer to /buddy hat with no hat named.
export function hatList(name: string, worn: Worn, can: readonly Worn[]): string {
  const now = worn === 'none' ? `${name} has no hat on.` : `${name} is wearing ${HAT_NAME[worn]}.`
  return `${now} It can wear: ${can.join(', ')}.${can.some(isEarned) ? '' : ' Achievements unlock more.'}`
}

// What /buddy hat <words> does: the hat to wear, or the line refusing it. A hat is named by its
// id, in any case, with spaces dropped: "flower crown" is flowercrown.
export function hatChoice(o: {
  name: string
  words: string
  worn: Worn
  can: readonly Worn[]
}): { wear: Worn } | { reply: string } {
  const id = o.words.toLowerCase().replace(/\s+/g, '')
  const hat = id === 'none' ? 'none' : WEARABLES.find(h => h === id)
  if (hat === undefined) return { reply: `No hat called ${o.words}. ${o.name} can wear: ${o.can.join(', ')}.` }
  if (hat === o.worn) {
    return { reply: hat === 'none' ? `${o.name} has no hat on.` : `${o.name} is already wearing ${HAT_NAME[hat]}.` }
  }
  if (hat === 'none' || o.can.includes(hat)) return { wear: hat }
  const unlock = ACHIEVEMENTS.find(a => a.hat === hat)
  if (unlock) return { reply: `Earn ${unlock.title} to unlock ${HAT_NAME[hat]}.` }
  return { reply: `Only a buddy that rolled ${HAT_NAME[hat]} can wear one.` }
}

// The answer once the hat is on.
export function woreLine(name: string, hat: Worn): string {
  return hat === 'none' ? `${name} took its hat off.` : `${name} is wearing ${HAT_NAME[hat]}.`
}

export function hatPrompt(hat: Worn): string {
  return hat === 'none'
    ? 'The developer just took your hat off. React in one line.'
    : `The developer just put ${HAT_NAME[hat]} on you. React in one line.`
}

export function hatFallback(hat: Worn): string {
  return hat === 'none' ? 'Cooler up here.' : 'How do I look?'
}

// Snacks for /buddy feed, and what the prompt calls each.
export const SNACKS: readonly Snack[] = ['cookie', 'apple', 'fish', 'cheese', 'berries', 'donut']
const CALLED: Record<Snack, string> = {
  cookie: 'a cookie',
  apple: 'an apple',
  fish: 'a fish',
  cheese: 'some cheese',
  berries: 'some berries',
  donut: 'a donut',
}

// How long a buddy that ate stays full, and what it says when fed again before then.
export const FULL_MS = 10 * 60_000
export const FULL_LINES: readonly string[] = ['Still full, thanks.', 'One more bite and I pop.', 'Ask me again in a bit.']

// The item of `list` a roll from 0 to 1 lands on.
function pickFrom<T>(list: readonly T[], roll: number): T {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(roll * list.length)))]!
}

// The snack for a roll from 0 to 1.
export function snackOf(roll: number): Snack {
  return pickFrom(SNACKS, roll)
}

// `lastFedAt` is 0 for a buddy this session never fed.
export function isFull(lastFedAt: number, now: number): boolean {
  return lastFedAt > 0 && now - lastFedAt < FULL_MS
}

export function fullLine(n: number): string {
  return nth(FULL_LINES, n)
}

export function feedPrompt(snack: Snack): string {
  return `The developer just fed you ${CALLED[snack]}. React in one line.`
}

export function feedFallback(snack: Snack): string {
  return `Mm. Thanks for the ${snack}.`
}

// The games /buddy play knows, and the picks that name one.
export type Game = 'dice' | 'coin' | 'rps'
export type Throw = 'rock' | 'paper' | 'scissors'
export type Side = 'heads' | 'tails'
export const GAMES: readonly Game[] = ['dice', 'coin', 'rps']
export const THROWS: readonly Throw[] = ['rock', 'paper', 'scissors']
export const SIDES: readonly Side[] = ['heads', 'tails']
// What each throw beats.
const BEATS: Record<Throw, Throw> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
const GAME_NAME: Record<Game, string> = { dice: 'dice', coin: 'a coin toss', rps: 'rock-paper-scissors' }

// How a game went, from the buddy's side.
export type Outcome = 'win' | 'lose' | 'draw'
const TOLD: Record<Outcome, string> = { win: 'You won.', lose: 'They won.', draw: 'A draw.' }

export type Played = {
  game: Game
  outcome: Outcome
  // The command's answer.
  line: string
  // What happened, as the buddy is told it.
  told: string
}

const pickGame = (word: string): Game | undefined =>
  (THROWS as readonly string[]).includes(word) ? 'rps' : (SIDES as readonly string[]).includes(word) ? 'coin' : undefined

// The words after `play`, lower-cased: a game, a pick that names its game, or a game and a pick
// that fits it. Null for anything else.
export function readPlay(words: readonly string[]): { game?: Game; pick?: Throw | Side } | null {
  const [first, second, ...rest] = words
  if (first === undefined) return {}
  if (rest.length > 0) return null
  if (second === undefined) {
    if ((GAMES as readonly string[]).includes(first)) return { game: first as Game }
    const game = pickGame(first)
    return game ? { game, pick: first as Throw | Side } : null
  }
  const game = pickGame(second)
  return game !== undefined && game === first ? { game, pick: second as Throw | Side } : null
}

// One game, decided by `roll`, which gives a number from 0 to 1 each time it is called: the game
// when none was named, then each side's die, call, flip or throw in the order the game needs them.
// `dev…` is the developer's side and `buddy…` the buddy's; `told` speaks to the buddy, so there the
// developer is "they".
export function play(o: { name: string; game?: Game; pick?: Throw | Side; roll: () => number }): Played {
  const game = o.game ?? pickFrom(GAMES, o.roll())
  const done = (outcome: Outcome, line: string, what: string): Played => ({
    game,
    outcome,
    line,
    told: `You just played ${GAME_NAME[game]} with the developer: ${what}. ${TOLD[outcome]}`,
  })
  const winner = (outcome: Outcome) => (outcome === 'win' ? `${o.name} wins.` : 'You win.')
  if (game === 'dice') {
    const devRoll = 1 + Math.floor(o.roll() * 6)
    const buddyRoll = 1 + Math.floor(o.roll() * 6)
    const what = `they rolled ${devRoll}, you rolled ${buddyRoll}`
    if (devRoll === buddyRoll) return done('draw', `You both rolled ${devRoll}. A draw.`, what)
    const outcome = buddyRoll > devRoll ? 'win' : 'lose'
    return done(outcome, `You rolled ${devRoll}; ${o.name} rolled ${buddyRoll}. ${winner(outcome)}`, what)
  }
  if (game === 'coin') {
    // You call it when you named a side; otherwise the buddy does.
    const youCall = o.pick === 'heads' || o.pick === 'tails'
    const call = youCall ? (o.pick as Side) : pickFrom(SIDES, o.roll())
    const flip = pickFrom(SIDES, o.roll())
    const outcome = (flip === call) === youCall ? 'lose' : 'win'
    const caller = youCall ? 'You' : o.name
    const what = `${youCall ? 'they' : 'you'} called ${call}, and it came up ${flip}`
    return done(outcome, `${caller} called ${call}. ${flip === 'heads' ? 'Heads' : 'Tails'}. ${winner(outcome)}`, what)
  }
  const pickedForYou = !(THROWS as readonly (string | undefined)[]).includes(o.pick)
  const devThrow = pickedForYou ? pickFrom(THROWS, o.roll()) : (o.pick as Throw)
  const buddyThrow = pickFrom(THROWS, o.roll())
  const what = `they threw ${devThrow}, you threw ${buddyThrow}`
  if (devThrow === buddyThrow) {
    return done('draw', `You both threw ${devThrow}${pickedForYou ? ' (yours picked for you)' : ''}. A draw.`, what)
  }
  const outcome = BEATS[buddyThrow] === devThrow ? 'win' : 'lose'
  const devLine = `You threw ${devThrow}${pickedForYou ? ' (picked for you)' : ''}`
  return done(outcome, `${devLine}; ${o.name} threw ${buddyThrow}. ${winner(outcome)}`, what)
}

export function playPrompt(played: Played): string {
  return `${played.told} React in one line.`
}

export const PLAY_FALLBACKS: Record<Outcome, readonly string[]> = {
  win: ['Ha! Again?', 'Undefeated. Mostly.'],
  lose: ['Best two out of three.', 'I let you win.'],
  draw: ['A draw. Suspicious.', 'Again. Now.'],
}

export function playFallback(outcome: Outcome, n: number): string {
  return nth(PLAY_FALLBACKS[outcome], n)
}
