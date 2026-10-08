// The band's text layout: bubble wrapping, full and compact rows, and the card.
import type { Counts, Soul, You } from '../types'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'
import { totalCalls, withCommas } from './ledger'
import { PAINT } from './sprites'
import type { Prop } from './sprites'

// A stretch of one row in one color; no color is the text color.
export type Run = { text: string; color?: string }
// Columns between the sprite and a prop.
export const PROP_GAP = 2

// One art row cut into runs by its paint: a paint letter picks a color, and a space or a
// column past the paint's end keeps the text color.
export function paintRuns(art: string, paint = ''): Run[] {
  const runs: Run[] = []
  for (let i = 0; i < art.length; i++) {
    const color = PAINT[paint.charAt(i)]
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += art.charAt(i)
    else runs.push(color ? { text: art.charAt(i), color } : { text: art.charAt(i) })
  }
  return runs
}

// The band's right-hand column, a row of runs per sprite row: the bubble when it has one, else
// a holiday prop after a 2-column gap, else a space.
export function rightRuns(bubble: readonly string[], prop: Prop | null): Run[][] {
  const quiet = bubble.every(row => !row)
  return bubble.map((row, i) => {
    const art = quiet ? prop?.art[i] : undefined
    return art ? [{ text: ' '.repeat(PROP_GAP) }, ...paintRuns(art, prop?.paint?.[i])] : [{ text: ' ' + row }]
  })
}

export const MIN_FULL_ROWS = 6
export const MIN_FULL_COLS = 44
export const MAX_BUBBLE_LINES = 3
export const MAX_BUBBLE_W = 80

export function isCompact(maxRows: number, bodyColumns: number): boolean {
  return maxRows < MIN_FULL_ROWS || bodyColumns < MIN_FULL_COLS
}

export function bubbleWidth(bodyColumns: number): number {
  return Math.min(bodyColumns - 14, MAX_BUBBLE_W)
}

// Which of `count` pages is up `at` (0 to 1) of the way through a bubble's life: each gets an equal share.
export function pageAt(count: number, at: number): number {
  return at > 0 ? Math.min(count - 1, Math.floor(at * count)) : 0
}

// Every line by default; with `maxLines`, the last one kept ends in "…" when there were more.
export function wrap(text: string, width: number, maxLines = Infinity): string[] {
  if (width < 1 || maxLines < 1) return []
  const lines: string[] = []
  let line = ''
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]!
  kept[maxLines - 1] = (last.length < width ? last : last.slice(0, width - 1)) + '…'
  return kept
}

// A box at most `maxWidth` wide, shrunk to its longest line over every page, so it keeps its
// width as the pages turn: " .---." / "< text |" / "| text |" / " '---'". Text past
// MAX_BUBBLE_LINES turns pages, `at` (0 to 1) of the way through the bubble's life; a paged
// box keeps its height and numbers the page in its bottom edge, which it is never too narrow for.
export function bubbleRows(text: string, maxWidth: number, at: number): string[] {
  const lines = wrap(text, maxWidth - 4)
  const count = Math.max(1, Math.ceil(lines.length / MAX_BUBBLE_LINES))
  const page = pageAt(count, at)
  const shown = lines.slice(page * MAX_BUBBLE_LINES, (page + 1) * MAX_BUBBLE_LINES)
  const mark = count > 1 ? ` ${page + 1}/${count} ` : ''
  if (mark) while (shown.length < MAX_BUBBLE_LINES) shown.push('')
  const longestMark = count > 1 ? ` ${count}/${count} `.length : 0
  const inner = Math.max(longestMark ? longestMark + 1 : 0, ...lines.map(line => line.length))
  const width = inner + 4
  const edge = mark ? '-'.repeat(width - 4 - mark.length) + mark + '-' : '-'.repeat(width - 3)
  return [
    ' .' + '-'.repeat(width - 3) + '.',
    ...shown.map((line, i) => (i === 0 ? '< ' : '| ') + line.padEnd(inner) + ' |'),
    " '" + edge + "'",
  ]
}

export function bandRows(
  sprite: readonly string[],
  say: string | null,
  bodyColumns: number,
  at: number,
): { sprite: string[]; bubble: string[] } {
  const box = say ? bubbleRows(say, bubbleWidth(bodyColumns), at) : []
  return {
    sprite: Array.from({ length: 5 }, (_, i) => sprite[i] ?? ''),
    bubble: Array.from({ length: 5 }, (_, i) => box[i] ?? ''),
  }
}

// A shiny sprite cycles through these, one per tick.
export const SHIMMER = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const

export function spriteTint(bones: Pick<Bones, 'rarity' | 'shiny'>, tick: number): { color: string | undefined; bold: boolean } {
  if (bones.shiny) return { color: SHIMMER[((tick % SHIMMER.length) + SHIMMER.length) % SHIMMER.length], bold: true }
  return { color: RARITY[bones.rarity].color, bold: false }
}

export function nameLine(name: string, bones: Bones): { label: string; stars: string } {
  return {
    label: `  ${name}  ${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}  `,
    stars: '★'.repeat(RARITY[bones.rarity].stars),
  }
}

// One row; a bubble too long for it turns pages like the full one, each but the last ending " …".
export function compactLine(face: string, name: string, say: string | null, columns: number, at: number): string {
  const head = `${face}  ${name}`
  if (!say) return head
  const room = columns - head.length - 2
  const lines = say.length <= room ? [say] : wrap(say, room - 2)
  if (lines.length === 0) return `${head}: ${say}`
  const page = pageAt(lines.length, at)
  return `${head}: ${lines[page]}${page < lines.length - 1 ? ' …' : ''}`
}

export function cardLines(soul: Soul, bones: Bones, rerolls: number): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
    `Hat: ${bones.hat}   Eyes: ${bones.eye}`,
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}`,
  ]
}

const howMany = (n: number, noun: string) => `${withCommas(n)} ${noun}${n === 1 ? '' : 's'}`

// The person's streak: the first half of the card's streak line.
export function streakText(you: You): string {
  return `Streak ${howMany(you.streak, 'day')} (best ${withCommas(you.bestStreak)})`
}

// The active buddy's lifetime counts: the second half.
export function countsText(counts: Counts): string {
  return `${howMany(counts.turns, 'turn')} · ${howMany(totalCalls(counts), 'tool call')}`
}

export function streakLine(you: You, counts: Counts): string {
  return `${streakText(you)} · ${countsText(counts)}`
}
