// Toys (Interaction spec section 2): feed, play, rename and hat. What each does and says, worked
// out here from the rolls it is given. Pure: no $.
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
