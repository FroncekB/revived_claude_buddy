// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
import type { Buddy, Snack, You } from '../types'
import { ACHIEVEMENTS, EARNED_HAT_NAME, earnedHats } from './achievements'
import { bonesFor } from './progress'
import { HATS, rollBones } from './roll'
import type { Bones } from './roll'
import { EARNED_HATS } from './sprites'
import type { Wearable } from './sprites'
import { RESERVED_NAMES, validName } from './voice'

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

// A hat on a buddy's head, or none.
export type Worn = Wearable | 'none'

// A buddy's grown bones with the hat it wears in place of the one it rolled.
export type Dressed = Omit<Bones, 'hat'> & { hat: Worn }

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

// What `buddy` can wear: its own rolled hat if it rolled one, every hat you've earned in table
// order, then none. Never another buddy's rolled hat, so a tiny duck still means legendary.
export function wearable(buddy: Pick<Buddy, 'seed'>, you: You): Worn[] {
  const rolled = rollBones(buddy.seed).hat
  return [...(rolled === 'none' ? [] : [rolled]), ...earnedHats(you), 'none']
}

// The hat `buddy` wears: its saved choice when it can wear that, else the hat it rolled. A choice
// it can't wear (unknown, not earned, another buddy's, or not a string) stays saved but unseen.
export function wornHat(buddy: Pick<Buddy, 'seed' | 'hat'>, you: You): Worn {
  const choice: unknown = buddy.hat
  return wearable(buddy, you).find(h => h === choice) ?? rollBones(buddy.seed).hat
}

// A buddy's bones as the band, card and dex draw them: grown by its counts, in the hat it wears.
export function dressed(buddy: Pick<Buddy, 'seed' | 'counts' | 'hat'>, you: You): Dressed {
  return { ...bonesFor(buddy), hat: wornHat(buddy, you) }
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

// The snack for a roll from 0 to 1.
export function snackOf(roll: number): Snack {
  return SNACKS[Math.min(SNACKS.length - 1, Math.max(0, Math.floor(roll * SNACKS.length)))]!
}

// `lastFedAt` is 0 for a buddy this session never fed.
export function isFull(lastFedAt: number, now: number): boolean {
  return lastFedAt > 0 && now - lastFedAt < FULL_MS
}

export function fullLine(n: number): string {
  return FULL_LINES[((n % FULL_LINES.length) + FULL_LINES.length) % FULL_LINES.length]!
}

export function feedPrompt(snack: Snack): string {
  return `The developer just fed you ${CALLED[snack]}. React in one line.`
}

export function feedFallback(snack: Snack): string {
  return `Mm. Thanks for the ${snack}.`
}
