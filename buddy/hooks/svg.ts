// The desktop band's art as one SVG: the desktop's Text is proportional and
// its Code is colored by the engine, so the rows are monospace SVG text whose
// fill the mod picks. Pure: no $.

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

export function bandSvg(o: {
  sprite: readonly string[]
  bubble: readonly string[]
  color: string | undefined
  bold: boolean
}): { source: string; width: number; height: number } {
  const ink = SVG_COLORS.ink!
  const fill = SVG_COLORS[o.color ?? 'ink'] ?? ink
  const rows = o.sprite.map((sprite, i) => ({ sprite, say: ' ' + (o.bubble[i] ?? '') }))
  const width = Math.max(...rows.map(r => r.sprite.length + r.say.length)) * CHAR_PX + 4
  const height = rows.length * LINE_PX + 4
  const style =
    `text{font-family:ui-monospace,Menlo,Consolas,"Courier New",monospace;font-size:${FONT_PX}px;white-space:pre}` +
    `.ink{fill:${ink[0]}}.sprite{fill:${fill[0]}${o.bold ? ';font-weight:bold' : ''}}` +
    `@media (prefers-color-scheme:dark){.ink{fill:${ink[1]}}.sprite{fill:${fill[1]}}}`
  const lines = rows.map(
    (r, i) =>
      `<text x="0" y="${(i + 1) * LINE_PX - 3}" xml:space="preserve">` +
      `<tspan class="sprite">${esc(r.sprite)}</tspan><tspan class="ink">${esc(r.say)}</tspan></text>`,
  )
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>${style}</style>${lines.join('')}</svg>`
  return { source, width, height }
}
