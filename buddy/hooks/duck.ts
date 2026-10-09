// The rubber duck (Interaction spec section 4): when one tool keeps failing, the buddy offers to
// talk it through, and for a while after, talking to it gets rubber-duck questions. Pure: no $.
import type { Mode } from '../types'

// Failures of one tool across a turn and the one before it that make a nudge due.
export const DUCK_FAILS = 3
// The least time between two nudges, and how long duck mode lasts after a nudge or a talk.
export const NUDGE_GAP_MS = 30 * 60_000
export const DUCK_MS = 15 * 60_000

// A nudge to make: the tool, and how often it failed across this turn and the one before.
export type DuckDue = { tool: string; n: number }

// A turn's failed calls, by tool name.
export function failsByTool(failed: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tool of failed) counts[tool] = (counts[tool] ?? 0) + 1
  return counts
}

// The tool to nudge about once a main turn ends, with how often it failed across this turn and the
// one before; null when none is due. A tool is due once it has failed DUCK_FAILS times across the
// two, at least once in this turn. Of two due, the one that failed more wins, then the one that
// failed last. `failed` is this turn's failed calls in order.
export function duckDue(prevFails: Readonly<Record<string, number>>, failed: readonly string[]): DuckDue | null {
  let best: (DuckDue & { last: number }) | null = null
  for (const [tool, here] of Object.entries(failsByTool(failed))) {
    const n = here + (prevFails[tool] ?? 0)
    const last = failed.lastIndexOf(tool)
    if (n >= DUCK_FAILS && (!best || n > best.n || (n === best.n && last > best.last))) best = { tool, n, last }
  }
  return best && { tool: best.tool, n: best.n }
}

// Whether a due nudge may be said now: on, no model call in flight, no announcement up, and 30
// minutes since the last one.
export function shouldNudge(o: {
  mode: Mode
  inFlight: boolean
  newsUp: boolean
  now: number
  lastNudgeAt: number
}): boolean {
  return o.mode === 'on' && !o.inFlight && !o.newsUp && o.now - o.lastNudgeAt >= NUDGE_GAP_MS
}

// A tool's name as the buddy says it: an MCP tool without its `mcp__server__` prefix. An MCP
// server names its own tools, and the name goes into the model's prompt, so it keeps only letters,
// digits, `_`, `.` and `-`, at most 40 of them.
export function toolName(tool: string): string {
  const bare = tool.startsWith('mcp__') ? tool.split('__').slice(2).join('__') : ''
  return (bare || tool).replace(/[^\w.-]/g, '').slice(0, 40) || 'tool'
}

export function duckPrompt(name: string, tool: string, n: number): string {
  return [
    `Claude just failed the tool "${toolName(tool)}" ${n} times over its last two turns, and the developer may be stuck.`,
    `Offer, in one line, to be their rubber duck: they can talk it through with you by starting a message with "${name},".`,
  ].join('\n')
}

// The offer when the model doesn't answer.
export function duckFallback(name: string, tool: string, n: number): string {
  return `${n} failed ${toolName(tool)} calls. Want to talk it through? Start with "${name},".`
}

// The line a talk's prompt carries while duck mode lasts.
export function duckLine(tool: string): string {
  return (
    `You're the developer's rubber duck: the tool "${toolName(tool)}" kept failing. Ask one short question ` +
    "that helps them say what they expected and what happened instead. Don't guess at a fix; you can't see their code."
  )
}
