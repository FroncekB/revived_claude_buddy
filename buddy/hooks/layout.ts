// The band's text layout: bubble wrapping, full and compact rows, and the card.
import type { Soul } from '../types'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'

export const MIN_FULL_ROWS = 6
export const MIN_FULL_COLS = 44
export const MAX_BUBBLE_LINES = 3
export const MAX_BUBBLE_W = 50

export function isCompact(maxRows: number, bodyColumns: number): boolean {
  return maxRows < MIN_FULL_ROWS || bodyColumns < MIN_FULL_COLS
}

export function bubbleWidth(bodyColumns: number): number {
  return Math.min(bodyColumns - 14, MAX_BUBBLE_W)
}

export function wrap(text: string, width: number, maxLines: number): string[] {
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

// A box exactly `width` wide: " .---." / "< text |" / "| text |" / " '---'".
export function bubbleRows(text: string, width: number): string[] {
  const inner = width - 4
  const lines = wrap(text, inner, MAX_BUBBLE_LINES)
  return [
    ' .' + '-'.repeat(width - 3) + '.',
    ...lines.map((line, i) => (i === 0 ? '< ' : '| ') + line.padEnd(inner) + ' |'),
    " '" + '-'.repeat(width - 3) + "'",
  ]
}

export function bandRows(
  sprite: readonly string[],
  say: string | null,
  bodyColumns: number,
): { sprite: string[]; bubble: string[] } {
  const box = say ? bubbleRows(say, bubbleWidth(bodyColumns)) : []
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

export function compactLine(face: string, name: string, say: string | null): string {
  return say ? `${face}  ${name}: ${say}` : `${face}  ${name}`
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
