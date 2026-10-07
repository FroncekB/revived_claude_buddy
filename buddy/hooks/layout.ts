// The band's text layout: bubble wrapping, full and compact rows, and the card.
import type { Soul } from '../types'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'

export const MIN_FULL_ROWS = 6
export const MIN_FULL_COLS = 44
export const MAX_BUBBLE_LINES = 3
export const MAX_BUBBLE_W = 64

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

// A box exactly `width` wide: " .---." / "< text |" / "| text |" / " '---'". Text past
// MAX_BUBBLE_LINES turns pages, `at` (0 to 1) of the way through the bubble's life; a
// paged box keeps its height and numbers the page in its bottom edge.
export function bubbleRows(text: string, width: number, at: number): string[] {
  const inner = width - 4
  const lines = wrap(text, inner)
  const count = Math.max(1, Math.ceil(lines.length / MAX_BUBBLE_LINES))
  const page = pageAt(count, at)
  const shown = lines.slice(page * MAX_BUBBLE_LINES, (page + 1) * MAX_BUBBLE_LINES)
  const mark = count > 1 ? ` ${page + 1}/${count} ` : ''
  if (mark) while (shown.length < MAX_BUBBLE_LINES) shown.push('')
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
