// The band's text layout: bubble wrapping, full and compact rows, and the card.
import type { Buddy, Counts, Moment, Saved, Soul, Stage, You } from '../types'
import { ACHIEVEMENTS, earnedOf, knownEarned } from './achievements'
import { ageText, momentText, readable } from './journal'
import { RARITY, STATS } from './roll'
import type { Bones } from './roll'
import { totalCalls, withCommas } from './ledger'
import { levelOf, nextLevelXp, stageOf, xpOf } from './progress'
import { PAINT, faceFor } from './sprites'
import type { Dressed, Prop } from './sprites'
import { dressed } from './toys'

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

// The band's name line, with the level when there is one (the debug tour shows none).
export function nameLine(
  name: string,
  bones: Pick<Bones, 'rarity' | 'species' | 'shiny'>,
  level: number | null = null,
): { label: string; stars: string } {
  return {
    label: `  ${name}  ${level === null ? '' : `Lv ${level}  `}${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}  `,
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

// The shown buddy's growth and your achievements, for the card (Progression spec section 6).
export type CardProgress = {
  level: number
  stage: Stage
  xp: number
  // Earned achievement titles, newest first.
  earned: readonly string[]
  // When the shown buddy was retired; null for the active one.
  retiredAt: string | null
}

export function cardProgress(saved: Saved, buddy: Buddy): CardProgress {
  const level = levelOf(buddy.counts)
  const had = earnedOf(saved.you)
  const when = (id: string) => String(had[id])
  // Newest first; the sort is stable, so two earned together keep table order.
  const earned = knownEarned(saved.you)
    .sort((a, b) => (when(b.id) > when(a.id) ? 1 : when(b.id) < when(a.id) ? -1 : 0))
    .map(a => a.title)
  return { level, stage: stageOf(level), xp: xpOf(buddy.counts), earned, retiredAt: buddy.retiredAt }
}

// "Lv 12 adult · 12,345 / 14,400 xp": the XP so far over the XP for the next level.
export function levelText(p: Pick<CardProgress, 'level' | 'stage' | 'xp'>): string {
  const next = nextLevelXp(p.level)
  return `Lv ${p.level} ${p.stage} · ${withCommas(p.xp)}${next !== null ? ` / ${withCommas(next)}` : ''} xp`
}

export function achievementsText(earned: number): string {
  return `Achievements: ${earned} of ${ACHIEVEMENTS.length}`
}

export function cardLines(soul: Soul, bones: Dressed, rerolls: number, progress?: CardProgress): string[] {
  const bar = (v: number) => '#'.repeat(Math.round(v / 5)).padEnd(20, '-')
  const retired = progress?.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
  return [
    `${soul.name}, ${bones.rarity} ${bones.species} ${'★'.repeat(RARITY[bones.rarity].stars)}${bones.shiny ? ' (shiny)' : ''}`,
    ...(progress ? [levelText(progress)] : []),
    `Hat: ${bones.hat}   Eyes: ${bones.eye}`,
    soul.personality,
    ...STATS.map(s => `${s.padEnd(10)} ${bar(bones.stats[s])} ${String(bones.stats[s]).padStart(3)}`),
    `Hatched ${soul.hatchedAt.slice(0, 10)}   Rerolls: ${rerolls}${retired}`,
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

// One journal row: how long ago, padded to the widest, and what happened.
export type JournalRow = { age: string; text: string }

export const journalHeader = (name: string) => `${name}'s journal`
export const emptyJournal = (name: string) => `Nothing in ${name}'s journal yet.`

// A journal's moments newest first, with their ages padded to the widest (Memory spec section 5).
export function journalRows(journal: readonly Moment[] | undefined, now: number): JournalRow[] {
  const rows = readable(journal)
    .reverse()
    .map(m => ({ age: ageText(m.at, now), text: momentText(m) }))
  const width = Math.max(0, ...rows.map(r => r.age.length))
  return rows.map(r => ({ ...r, age: r.age.padEnd(width) }))
}

// The journal as text, where no pane is placed: the header and the newest `limit` moments, inside
// the 12 lines the card's text keeps to.
export function journalLines(name: string, journal: readonly Moment[] | undefined, now: number, limit = 10): string[] {
  const rows = journalRows(journal, now).slice(0, limit)
  if (rows.length === 0) return [journalHeader(name), emptyJournal(name)]
  return [journalHeader(name), ...rows.map(r => `${r.age}   ${r.text}`)]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-07T12:00:00.000Z" as "Oct 7, 2026", read off the string so no time zone moves the day.
export function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`
}

// "Oct 7", with its year only when that isn't `year`.
export function shortDate(iso: string, year: number): string {
  const [y, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}${y === year ? '' : `, ${y}`}`
}

// One buddy in the dex (Progression spec section 6).
export type DexRow = {
  // Its place in `buddies`, from 1. `buddies` only grows, so the number never changes.
  number: number
  name: string
  // Grown and in the hat it wears, for the portrait, the face, the rarity and the species.
  bones: Dressed
  level: number
  stage: Stage
  // "Oct 7 – Nov 2", or "Oct 7 – now" for the active buddy.
  dates: string
  active: boolean
}

export const DEX_TEXT_ROWS = 10

export function dexRows(saved: Saved, now: number): DexRow[] {
  const year = new Date(now).getFullYear()
  return saved.buddies.map((b, i) => {
    const level = levelOf(b.counts)
    const active = b.seed === saved.active
    const end = active || b.retiredAt === null ? 'now' : shortDate(b.retiredAt, year)
    return {
      number: i + 1,
      name: b.soul.name,
      bones: dressed(b, saved.you),
      level,
      stage: stageOf(level),
      dates: `${shortDate(b.soul.hatchedAt, year)} – ${end}`,
      active,
    }
  })
}

// One dex row as text, its number padded to `numberWidth`:
// "#1  (×vv×)  Pip           Lv 30 elder common dragon ★  Oct 7 – Nov 2".
export function dexText(row: DexRow, numberWidth: number): string {
  const b = row.bones
  return [
    `#${row.number}`.padEnd(numberWidth),
    faceFor(b.species, b.eye).padEnd(6),
    row.name.padEnd(12),
    `Lv ${row.level} ${row.stage} ${b.rarity} ${b.species} ${'★'.repeat(RARITY[b.rarity].stars)}`,
    row.dates,
  ].join('  ')
}

// The dex as text, where no pane is placed: the count, a note of any older ones, then the newest
// ten in dex order, inside the 12 lines the card's text keeps to.
export function dexLines(saved: Saved, now: number): string[] {
  const rows = dexRows(saved, now)
  const width = `#${rows.length}`.length
  const shown = rows.slice(-DEX_TEXT_ROWS)
  const earlier = rows.length - shown.length
  return [
    `Buddydex: ${rows.length} ${rows.length === 1 ? 'buddy' : 'buddies'}`,
    ...(earlier > 0 ? [`…${earlier} earlier`] : []),
    ...shown.map(row => dexText(row, width)),
  ]
}
