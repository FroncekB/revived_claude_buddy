// The desktop band's art as one SVG: the desktop's Text is proportional and
// its Code is colored by the engine, so the rows are monospace SVG text whose
// fill the mod picks. Pure: no $.
import type { Run } from './layout'

export const FONT_PX = 13
export const CHAR_PX = 8
export const LINE_PX = 16

// Terminal color name -> [light theme fill, dark theme fill]; `ink` is the text color.
export const SVG_COLORS: Record<string, readonly [string, string]> = {
  ink: ['#1f1f1f', '#e6e6e6'],
  red: ['#c62828', '#ff6b6b'],
  yellow: ['#a87b00', '#f5c518'],
  green: ['#2e7d32', '#5fd068'],
  cyan: ['#00838f', '#4dd0e1'],
  blue: ['#1565c0', '#64a8ff'],
  magenta: ['#8e24aa', '#d685f0'],
}

// Bubble text comes from the model: nothing it says may become markup.
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// `right` is the column beside the sprite, a row of runs per sprite row (layout's rightRuns).
export function bandSvg(o: {
  sprite: readonly string[]
  right: readonly (readonly Run[])[]
  color: string | undefined
  bold: boolean
}): { source: string; width: number; height: number } {
  const ink = SVG_COLORS.ink!
  const fill = SVG_COLORS[o.color ?? 'ink'] ?? ink
  const rows = o.sprite.map((sprite, i) => ({ sprite, right: o.right[i] ?? [] }))
  const width =
    Math.max(...rows.map(r => r.sprite.length + r.right.reduce((n, run) => n + run.text.length, 0))) * CHAR_PX + 4
  const height = rows.length * LINE_PX + 4
  // A painted prop's colors, each a `paint-<color>` class with a light and a dark fill.
  const painted = [...new Set(rows.flatMap(r => r.right.map(run => run.color)))].filter(
    (c): c is string => c !== undefined && SVG_COLORS[c] !== undefined,
  )
  const light = painted.map(c => `.paint-${c}{fill:${SVG_COLORS[c]![0]}}`).join('')
  const dark = painted.map(c => `.paint-${c}{fill:${SVG_COLORS[c]![1]}}`).join('')
  const style =
    `text{font-family:ui-monospace,Menlo,Consolas,"Courier New",monospace;font-size:${FONT_PX}px;white-space:pre}` +
    `.ink{fill:${ink[0]}}.sprite{fill:${fill[0]}${o.bold ? ';font-weight:bold' : ''}}${light}` +
    `@media (prefers-color-scheme:dark){.ink{fill:${ink[1]}}.sprite{fill:${fill[1]}}${dark}}`
  const span = (run: Run) =>
    `<tspan class="${run.color && SVG_COLORS[run.color] ? `paint-${run.color}` : 'ink'}">${esc(run.text)}</tspan>`
  const lines = rows.map(
    (r, i) =>
      `<text x="0" y="${(i + 1) * LINE_PX - 3}" xml:space="preserve">` +
      `<tspan class="sprite">${esc(r.sprite)}</tspan>${r.right.map(span).join('')}</text>`,
  )
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>${style}</style>${lines.join('')}</svg>`
  return { source, width, height }
}
