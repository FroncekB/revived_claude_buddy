// Lifetime counts and the visit streak (Foundation spec section 3). Pure: no $.
import type { Counts, ToolGroup, You } from '../types'

export const TOOL_GROUPS: readonly ToolGroup[] = ['shell', 'edit', 'read', 'web', 'agent', 'mcp', 'other']

// A Map, so a tool named like an Object method ("toString") still lands in `other`.
const GROUP_OF: ReadonlyMap<string, ToolGroup> = new Map<string, ToolGroup>([
  ['Bash', 'shell'],
  ['PowerShell', 'shell'],
  ['Edit', 'edit'],
  ['Write', 'edit'],
  ['NotebookEdit', 'edit'],
  ['Read', 'read'],
  ['Grep', 'read'],
  ['Glob', 'read'],
  ['LSP', 'read'],
  ['WebFetch', 'web'],
  ['WebSearch', 'web'],
  ['Agent', 'agent'],
])

export function toolGroup(tool: string): ToolGroup {
  if (tool.startsWith('mcp__')) return 'mcp'
  return GROUP_OF.get(tool) ?? 'other'
}

export function zeroCounts(): Counts {
  return {
    turns: 0,
    failedTurns: 0,
    longestTurnMs: 0,
    calls: { shell: 0, edit: 0, read: 0, web: 0, agent: 0, mcp: 0, other: 0 },
    failedCalls: 0,
    pets: 0,
    talks: 0,
  }
}

export function totalCalls(c: Counts): number {
  return TOOL_GROUPS.reduce((sum, g) => sum + c.calls[g], 0)
}

export type CountEvent =
  | { kind: 'call'; tool: string; failed: boolean }
  | { kind: 'turn'; reason: string; durationMs: number }
  | { kind: 'pet' }
  | { kind: 'talk' }

export function countEvent(c: Counts, e: CountEvent): Counts {
  switch (e.kind) {
    case 'call': {
      const g = toolGroup(e.tool)
      return { ...c, calls: { ...c.calls, [g]: c.calls[g] + 1 }, failedCalls: c.failedCalls + (e.failed ? 1 : 0) }
    }
    case 'turn':
      return {
        ...c,
        turns: c.turns + 1,
        failedTurns: c.failedTurns + (e.reason === 'error' || e.reason === 'aborted' ? 1 : 0),
        longestTurnMs: Math.max(c.longestTurnMs, e.durationMs),
      }
    case 'pet':
      return { ...c, pets: c.pets + 1 }
    case 'talk':
      return { ...c, talks: c.talks + 1 }
  }
}

// Sums every field except longestTurnMs, which keeps the larger. Fields only `a` has are kept.
export function addCounts(a: Counts, b: Counts): Counts {
  const calls = { ...a.calls }
  for (const g of TOOL_GROUPS) calls[g] = a.calls[g] + b.calls[g]
  return {
    ...a,
    turns: a.turns + b.turns,
    failedTurns: a.failedTurns + b.failedTurns,
    longestTurnMs: Math.max(a.longestTurnMs, b.longestTurnMs),
    calls,
    failedCalls: a.failedCalls + b.failedCalls,
    pets: a.pets + b.pets,
    talks: a.talks + b.talks,
  }
}

export function mergePending(
  a: Readonly<Record<string, Counts>>,
  b: Readonly<Record<string, Counts>>,
): Record<string, Counts> {
  const out: Record<string, Counts> = { ...a }
  for (const [seed, counts] of Object.entries(b)) {
    const had = out[seed]
    out[seed] = had ? addCounts(had, counts) : counts
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

export function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  // Noon, so a daylight-saving change can't push the date across midnight.
  return localDay(new Date(y!, m! - 1, d! - 1, 12).getTime())
}

// A new day extends the streak when it follows lastDay, and starts it over otherwise.
// The same day returns `you` itself, so a caller can tell nothing changed.
export function visit(you: You, today: string): You {
  if (you.lastDay === today) return you
  const streak = you.lastDay !== null && prevDay(today) === you.lastDay ? you.streak + 1 : 1
  return { ...you, lastDay: today, streak, bestStreak: Math.max(you.bestStreak, streak), days: you.days + 1 }
}
