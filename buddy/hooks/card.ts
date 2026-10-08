// The card pane's drawings: the whole card as one SVG where the surface draws SVG,
// solid stat meters on the terminal.

import type { Counts, Soul, You } from '../types'
import { countsText, emptyJournal, journalHeader, streakLine, streakText, wrap } from './layout'
import type { JournalRow } from './layout'
import { RARITY, STATS } from './roll'
import type { Bones, Hat, Rarity } from './roll'
import { spriteRows, topRow } from './sprites'

// The person's streak and the buddy's counts, for the card's last row.
export type CardHistory = { you: You; counts: Counts }

// The radar, in its own box.
const CX = 200
const CY = 150
const RADIUS = 100
const LABEL_AT = 122
const RINGS = [20, 40, 60, 80, 100]
const EIGHTHS = ' ▏▎▍▌▋▊▉'

// The card around it.
const W = 420
const MID = W / 2
const PAD = 24
const QUOTE_WIDTH = 44
// The journal's rows: the age at the left pad, the words 100 px in, 22 px apart.
const JOURNAL_TOP = 76
const JOURNAL_ROW = 22
const JOURNAL_WORDS_X = PAD + 100
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HAT_LABEL: Record<Hat, string> = {
  crown: 'Crown',
  tophat: 'Top hat',
  propeller: 'Propeller hat',
  halo: 'Halo',
  wizard: 'Wizard hat',
  beanie: 'Beanie',
  tinyduck: 'Tiny duck',
}

// The SVG is drawn as an image, blind to the theme: mid-tones that read on light and dark.
const INK = '#8b8f98'
const FILL: Record<Rarity, string> = {
  common: '#8b8f98',
  uncommon: '#3fa66b',
  rare: '#4a86e8',
  epic: '#c99a12',
  legendary: '#b45bd1',
}
// A still card cannot shimmer, so a shiny portrait is gold.
const SHINY = '#c99a12'

// The first stat straight up, the rest clockwise.
const angleOf = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / STATS.length

// Stat `index` at `value` (0-100) on the chart.
export function radarPoint(index: number, value: number): [number, number] {
  const angle = angleOf(index)
  const r = (RADIUS * value) / 100
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

const xy = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`

function label(bones: Bones, index: number): string {
  const stat = STATS[index]!
  const [x, y] = radarPoint(index, LABEL_AT)
  const anchor = Math.abs(x - CX) < 1 ? 'middle' : x > CX ? 'start' : 'end'
  // Two lines, name over value, nudged up at the top and down at the bottom.
  const top = y - 6 + 10 * Math.sin(angleOf(index))
  const star = stat === bones.peak ? `<tspan fill="${FILL[bones.rarity]}">★ </tspan>` : ''
  const opacity = stat === bones.low ? ' opacity="0.7"' : ''
  return (
    `<text x="${x.toFixed(1)}" y="${top.toFixed(1)}" text-anchor="${anchor}"${opacity}>` +
    `${star}<tspan font-size="11" letter-spacing="0.5" fill="${INK}">${stat}</tspan>` +
    `<tspan x="${x.toFixed(1)}" dy="16" font-size="15" font-weight="700" fill="${FILL[bones.rarity]}">${bones.stats[stat]}</tspan>` +
    `</text>`
  )
}

// The radar's marks in its own 400 by 280 box.
function statChart(bones: Bones): string {
  const color = FILL[bones.rarity]
  const ring = (value: number) => STATS.map((_, i) => xy(radarPoint(i, value))).join(' ')
  const grid = RINGS.map(v => `<polygon points="${ring(v)}" fill="none" stroke="${INK}" stroke-opacity="0.3"/>`)
  const spokes = STATS.map((_, i) => {
    const [x, y] = radarPoint(i, 100)
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${INK}" stroke-opacity="0.3"/>`
  })
  const corners = STATS.map((s, i) => radarPoint(i, bones.stats[s]))
  const shape = `<polygon points="${corners.map(xy).join(' ')}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`
  const dots = corners.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"/>`)
  const labels = STATS.map((_, i) => label(bones, i))
  return [...grid, ...spokes, shape, ...dots, ...labels].join('')
}

// Name, personality and sprite rows go into markup as text.
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "2026-10-07T12:00:00.000Z" as "Oct 7, 2026", read off the string so no time zone moves the day.
function hatchDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`
}

function chips(bones: Bones): string[] {
  return [
    ...(bones.hat === 'none' ? [] : [HAT_LABEL[bones.hat]]),
    `${bones.eye} eyes`,
    ...(bones.shiny ? ['Shiny'] : []),
  ]
}

// The whole card, top to bottom: name and stars, kind, portrait, quote, chips, radar, history.
export function cardSvg(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory): string {
  const color = FILL[bones.rarity]
  const marks: string[] = [
    `<text x="${PAD}" y="44" font-size="22" font-weight="700" fill="${color}">${esc(soul.name)}</text>`,
    `<text x="${W - PAD}" y="44" text-anchor="end" font-size="16" letter-spacing="2" fill="${color}">${'★'.repeat(RARITY[bones.rarity].stars)}</text>`,
    `<text x="${PAD}" y="66" font-size="13" fill="${color}">${capital(bones.rarity)} ${bones.species}</text>`,
    `<rect x="${PAD}" y="80" width="${W - 2 * PAD}" height="104" rx="10" fill="${color}" fill-opacity="0.1"/>`,
  ]

  // A still portrait: the resting frame, hat on, eyes open.
  const top = topRow({ hat: bones.hat, heartsFrame: null, sparkle: null })
  spriteRows({ species: bones.species, eye: bones.eye, frame: 0, top }).forEach((row, i) =>
    marks.push(
      `<text x="${MID}" y="${101 + i * 18}" text-anchor="middle" xml:space="preserve" ` +
        `font-family="ui-monospace, Consolas, monospace" font-size="15" fill="${bones.shiny ? SHINY : INK}">${esc(row)}</text>`,
    ),
  )

  const lines = wrap(soul.personality, QUOTE_WIDTH, 3)
  lines.forEach((line, i) => {
    const quoted = `${i === 0 ? '“' : ''}${line}${i === lines.length - 1 ? '”' : ''}`
    marks.push(
      `<text x="${MID}" y="${214 + i * 20}" text-anchor="middle" font-family="Georgia, serif" ` +
        `font-style="italic" font-size="14" fill="${INK}">${esc(quoted)}</text>`,
    )
  })

  const chipTop = 214 + Math.max(0, lines.length - 1) * 20 + 16
  const labels = chips(bones)
  const widths = labels.map(text => text.length * 7 + 20)
  let x = MID - (widths.reduce((sum, w) => sum + w, 0) + 8 * (labels.length - 1)) / 2
  labels.forEach((text, i) => {
    const w = widths[i]!
    marks.push(
      `<rect x="${x.toFixed(1)}" y="${chipTop}" width="${w}" height="22" rx="11" fill="${color}" fill-opacity="0.15"/>`,
      `<text x="${(x + w / 2).toFixed(1)}" y="${chipTop + 15}" text-anchor="middle" font-size="12" fill="${color}">${esc(text)}</text>`,
    )
    x += w + 8
  })

  const chartTop = chipTop + 42
  const foot = chartTop + 280
  marks.push(
    `<g transform="translate(10 ${chartTop})">${statChart(bones)}</g>`,
    `<line x1="${PAD}" y1="${foot}" x2="${W - PAD}" y2="${foot}" stroke="${INK}" stroke-opacity="0.3"/>`,
    `<text x="${PAD}" y="${foot + 22}" font-size="12" fill="${INK}">Hatched ${hatchDay(soul.hatchedAt)}</text>`,
    `<text x="${W - PAD}" y="${foot + 22}" text-anchor="end" font-size="12" fill="${INK}">Rerolls ${rerolls}</text>`,
  )

  if (history) {
    marks.push(
      `<text x="${PAD}" y="${foot + 42}" font-size="12" fill="${INK}">${esc(streakText(history.you))}</text>`,
      `<text x="${W - PAD}" y="${foot + 42}" text-anchor="end" font-size="12" fill="${INK}">${esc(countsText(history.counts))}</text>`,
    )
  }

  return framed(color, foot + (history ? 58 : 38), marks)
}

// The card's frame around `marks`: a rounded border in the rarity color, `h` px tall.
function framed(color: string, h: number, marks: readonly string[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" ` +
    `font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="14" fill="${color}" fill-opacity="0.04" stroke="${color}" stroke-width="2"/>` +
    marks.join('') +
    `</svg>`
  )
}

// The journal pane as one SVG in the card's frame (Memory spec section 5): the header in the
// rarity color, then a row per moment, newest first.
export function journalSvg(name: string, bones: Bones, rows: readonly JournalRow[]): string {
  const color = FILL[bones.rarity]
  const marks = [
    `<text x="${PAD}" y="44" font-size="22" font-weight="700" fill="${color}">${esc(journalHeader(name))}</text>`,
  ]
  if (rows.length === 0) {
    marks.push(`<text x="${PAD}" y="${JOURNAL_TOP}" font-size="12" fill="${INK}">${esc(emptyJournal(name))}</text>`)
  }
  rows.forEach((row, i) => {
    const y = JOURNAL_TOP + i * JOURNAL_ROW
    marks.push(
      `<text x="${PAD}" y="${y}" font-size="12" fill="${INK}" fill-opacity="0.7">${esc(row.age.trim())}</text>`,
      `<text x="${JOURNAL_WORDS_X}" y="${y}" font-size="12" fill="${INK}">${esc(row.text)}</text>`,
    )
  })
  return framed(color, JOURNAL_TOP + (Math.max(1, rows.length) - 1) * JOURNAL_ROW + 24, marks)
}

export function journalAlt(name: string, rows: readonly JournalRow[]): string {
  if (rows.length === 0) return emptyJournal(name)
  return `${journalHeader(name)}. ${rows.map(r => `${capital(r.age.trim())}: ${r.text}.`).join(' ')}`
}

export function cardAlt(soul: Soul, bones: Bones, rerolls: number, history?: CardHistory): string {
  const stars = RARITY[bones.rarity].stars
  return (
    `${soul.name}, ${bones.rarity} ${bones.species}, ${stars} star${stars === 1 ? '' : 's'}. ` +
    `"${soul.personality}" ${chips(bones).join(', ')}. ${statAlt(bones)}. ` +
    `Hatched ${hatchDay(soul.hatchedAt)}. Rerolls ${rerolls}.` +
    (history ? ` ${streakLine(history.you, history.counts)}.` : '')
  )
}

export function statAlt(bones: Bones): string {
  const each = STATS.map(s => {
    const note = s === bones.peak ? ' (highest)' : s === bones.low ? ' (lowest)' : ''
    return `${s} ${bones.stats[s]}${note}`
  })
  return `Stats: ${each.join(', ')}`
}

// `value` (0-100) as solid blocks across `cells`, the last cell in eighths, padded with spaces.
export function meter(value: number, cells: number): string {
  const eighths = Math.round((Math.max(0, Math.min(100, value)) / 100) * cells * 8)
  const part = eighths % 8
  return ('█'.repeat(Math.floor(eighths / 8)) + (part ? EIGHTHS[part] : '')).padEnd(cells, ' ')
}
