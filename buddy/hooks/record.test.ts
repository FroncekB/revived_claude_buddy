import { expect, test } from 'claude-code/testing'

import { USAGE, classifyRecord, newRecord, parseSub } from './record'

const SOUL = { name: 'Pip', personality: 'x', hatchedAt: '2026-10-07T00:00:00.000Z' }

test('records are classified, and only schema 1 is ours', () => {
  expect(classifyRecord(undefined)).toEqual({ kind: 'none' })
  expect(classifyRecord(null)).toEqual({ kind: 'none' })
  const rec = newRecord('s', SOUL, 0)
  expect(classifyRecord(rec)).toEqual({ kind: 'ok', record: rec })
  expect(classifyRecord({ schema: 2, seed: 'x' })).toEqual({ kind: 'foreign', schema: '2' })
  expect(classifyRecord('junk')).toEqual({ kind: 'foreign', schema: 'unknown' })
})

test('a new record starts on, with the rerolls it is given', () => {
  expect(newRecord('s', SOUL, 3)).toEqual({ schema: 1, seed: 's', soul: SOUL, mode: 'on', rerolls: 3 })
})

test('subcommands', () => {
  expect(parseSub('')).toBe('show')
  expect(parseSub('  pet ')).toBe('pet')
  expect(parseSub('CARD')).toBe('card')
  expect(parseSub('mute')).toBe('mute')
  expect(parseSub('unmute')).toBe('unmute')
  expect(parseSub('off')).toBe('off')
  expect(parseSub('reroll')).toBe('reroll')
  expect(parseSub('reroll confirm')).toBe('reroll-confirm')
  expect(parseSub('reroll now')).toBe('usage')
  expect(parseSub('pet twice')).toBe('usage')
  expect(parseSub('dance')).toBe('usage')
})

test('debug is a subcommand the usage line never mentions', () => {
  expect(parseSub('debug')).toBe('debug')
  expect(parseSub(' DEBUG off ')).toBe('debug-off')
  expect(parseSub('debug now')).toBe('usage')
  expect(USAGE).not.toMatch(/debug/)
})
