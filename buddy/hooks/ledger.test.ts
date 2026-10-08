import { expect, test } from 'claude-code/testing'

import type { Counts } from '../types'
import {
  addCounts, countEvent, daysBetween, localDay, mergePending, prevDay, toolGroup, totalCalls, visit, zeroCounts,
} from './ledger'

test('every tool lands in its group', () => {
  const cases: [string, string][] = [
    ['Bash', 'shell'], ['PowerShell', 'shell'],
    ['Edit', 'edit'], ['Write', 'edit'], ['NotebookEdit', 'edit'],
    ['Read', 'read'], ['Grep', 'read'], ['Glob', 'read'], ['LSP', 'read'],
    ['WebFetch', 'web'], ['WebSearch', 'web'],
    ['Agent', 'agent'],
    ['mcp__a__b', 'mcp'],
    ['Frobnicate', 'other'], ['toString', 'other'],
  ]
  for (const [tool, group] of cases) expect(toolGroup(tool)).toBe(group)
})

test('each event adds to its own counts', () => {
  let c = zeroCounts()
  c = countEvent(c, { kind: 'call', tool: 'Bash', failed: true })
  c = countEvent(c, { kind: 'call', tool: 'mcp__x__y', failed: false })
  c = countEvent(c, { kind: 'turn', reason: 'error', durationMs: 9_000 })
  c = countEvent(c, { kind: 'turn', reason: 'answer', durationMs: 4_000 })
  c = countEvent(c, { kind: 'pet' })
  c = countEvent(c, { kind: 'talk' })
  expect(c).toEqual({
    turns: 2,
    failedTurns: 1,
    longestTurnMs: 9_000,
    calls: { shell: 1, edit: 0, read: 0, web: 0, agent: 0, mcp: 1, other: 0 },
    failedCalls: 1,
    pets: 1,
    talks: 1,
  })
  expect(totalCalls(c)).toBe(2)
  expect(countEvent(zeroCounts(), { kind: 'turn', reason: 'aborted', durationMs: 1 }).failedTurns).toBe(1)
})

test('adding counts sums them, except the longest turn, which takes the larger', () => {
  const a: Counts = {
    turns: 3,
    failedTurns: 1,
    longestTurnMs: 5_000,
    calls: { shell: 1, edit: 2, read: 3, web: 4, agent: 5, mcp: 6, other: 7 },
    failedCalls: 2,
    pets: 4,
    talks: 5,
  }
  const b: Counts = {
    turns: 10,
    failedTurns: 20,
    longestTurnMs: 3_000,
    calls: { shell: 10, edit: 20, read: 30, web: 40, agent: 50, mcp: 60, other: 70 },
    failedCalls: 30,
    pets: 40,
    talks: 50,
  }
  expect(addCounts(a, b)).toEqual({
    turns: 13,
    failedTurns: 21,
    longestTurnMs: 5_000,
    calls: { shell: 11, edit: 22, read: 33, web: 44, agent: 55, mcp: 66, other: 77 },
    failedCalls: 32,
    pets: 44,
    talks: 55,
  })
  expect(addCounts(b, a).longestTurnMs).toBe(5_000)
})

test('pending counts merge seed by seed', () => {
  const one = countEvent(zeroCounts(), { kind: 'pet' })
  expect(mergePending({ a: one }, { a: one, b: one })).toEqual({ a: addCounts(one, one), b: one })
})

test('days are local calendar dates', () => {
  expect(localDay(new Date(2026, 9, 7, 0, 5).getTime())).toBe('2026-10-07')
  expect(localDay(new Date(2026, 9, 7, 23, 55).getTime())).toBe('2026-10-07')
  expect(prevDay('2026-10-07')).toBe('2026-10-06')
  expect(prevDay('2026-03-01')).toBe('2026-02-28')
  expect(prevDay('2027-01-01')).toBe('2026-12-31')
})

test('the visit rule', () => {
  const first = visit({ lastDay: null, streak: 0, bestStreak: 0, days: 0 }, '2026-10-07')
  expect(first).toEqual({ lastDay: '2026-10-07', streak: 1, bestStreak: 1, days: 1 })
  expect(visit(first, '2026-10-07')).toBe(first)
  const second = visit(first, '2026-10-08')
  expect(second).toEqual({ lastDay: '2026-10-08', streak: 2, bestStreak: 2, days: 2 })
  expect(visit(second, '2026-10-11')).toEqual({ lastDay: '2026-10-11', streak: 1, bestStreak: 2, days: 3 })
  const yearEnd = { lastDay: '2026-12-31', streak: 4, bestStreak: 4, days: 9 }
  expect(visit(yearEnd, '2027-01-01')).toMatchObject({ streak: 5, bestStreak: 5, days: 10 })
})

test('days between two dates count calendar days, across a month, a year and a clock change', () => {
  expect(daysBetween('2026-10-07', '2026-10-07')).toBe(0)
  expect(daysBetween('2026-10-06', '2026-10-07')).toBe(1)
  expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
})
