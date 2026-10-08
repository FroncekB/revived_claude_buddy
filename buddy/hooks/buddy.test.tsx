import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Moment, Saved } from '../types'
import { SHIMMER } from './layout'
import { zeroCounts } from './ledger'
import { HAT_ART, bodyRows, fillEyes, headRow } from './sprites'
import { TOUR_TICKS } from './tour'
import { FAIL_PLAIN, FAIL_SNARKY, FALLBACK_NAMES } from './voice'

const ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ok = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: ZERO })
const failed = (): ModelCompleteResult => ({ isAnswered: false, reason: 'empty-reply', usage: ZERO })

const RECORD = {
  schema: 1,
  seed: 'test-seed',
  soul: { name: 'Pip', personality: 'Counts semicolons.', hatchedAt: '2026-10-07T00:00:00.000Z' },
  mode: 'on',
  rerolls: 0,
}
const START = { cwd: '.', surface: 'terminal' as const, isInteractive: true }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

const band = (maxRows = 10, bodyColumns = 80) => ({
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows,
    bodyColumns,
    scroll: { offset: 0, bodyRows: maxRows - 1 },
    view: {},
  },
})

const pane = (bodyColumns = 60) => ({
  component: 'Pane' as const,
  requestId: 'card',
  props: {
    title: 'Buddy',
    isFocused: false,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
})

// Local noon on Wednesday 2026-10-07 in any time zone: not a holiday and not night, so the
// band's calendar stays out of every test that doesn't ask for it.
const NOON = new Date(2026, 9, 7, 12).getTime()

// The world beneath the plugin: a clock, a store, the command registry, session
// start, a pane placer, and a stand-in for the engine's own band so a pass-through is visible.
// A null store leaves $.store to the test, which answers store.get and store.set itself.
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true, now = NOON) {
  const clock = mock.clock(on, { now })
  if (store) mock.store(on, store)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', async () => ({
    value: placesPanes ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'no surface places panes' },
  }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  return clock
}

// Answers $.model.complete: hatch requests get `soul`, everything else gets
// `say`; null answers as a failure. Returns the prompts the plugin sent.
function model(on: On, soul: string | null, say: string | null): string[] {
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    const text = e.system?.includes('JSON only') ? soul : say
    return { value: text === null ? failed() : ok(text) }
  })
  return prompts
}

const runner = ($: Engine) => async (args: string) =>
  (await $.command.run({ command: 'buddy', args, ...RUN })).text

// A store this test can look into and turn off, for writes or for reads: one row under `buddy`,
// as another session sharing it would see it.
function sharedStore(on: On, row: unknown) {
  const shared = { row, writes: 0, refuse: false, refuseReads: false }
  on('store.get', async () => (shared.refuseReads ? { deny: 'disk offline' } : { value: shared.row }))
  on('store.set', async (_$, e) => {
    if (shared.refuse) return { deny: 'disk full' }
    shared.row = e.value
    shared.writes++
    return { value: undefined }
  })
  return shared
}

// The active buddy's entry in a stored row.
function activeOf(row: unknown) {
  const saved = row as Saved
  return saved.buddies.find(b => b.seed === saved.active)
}

// What the card pane shows on the terminal once /buddy card opened it, which prints nothing.
async function cardText($: Engine): Promise<string> {
  expect(await runner($)('card')).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await ui.unmount()
  return text
}

test("before hatching, the band is the engine's own", async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  expect(await runner($)('pet')).toBe('No buddy yet. Run /buddy to hatch one.')
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  expect(await card.find({ text: 'No buddy yet. Run /buddy to hatch one.' })).toBeDefined()
})

test('hatching names the buddy and draws it on terminal and desktop', async ($, on) => {
  const clock = world(on)
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  expect(await runner($)('')).toMatch(/^Pip, (a (common|rare|legendary)|an (uncommon|epic)) .* hatched\.$/)
  await clock.settle()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await terminal.find({ text: /Pip/ })).toBeDefined()
  expect(await terminal.find({ text: /Hello there\./ })).toBeDefined()
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band() })
  expect(await desktop.find({ text: /Pip/ })).toBeDefined()
  expect(String((await desktop.find({ type: 'Svg' }))?.props.source)).toContain('Hello there.')
})

test('a failing model still hatches, with a fallback name', async ($, on) => {
  world(on)
  model(on, null, null)
  await $.session.start(START)
  const text = (await runner($)('')) ?? ''
  expect(FALLBACK_NAMES).toContain(text.split(',')[0])
})

test('the full band is six rows on the terminal; a short band is one line', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const full = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  const drawn = (await full.drawn()) as unknown as { children: unknown[] }
  expect(drawn.children).toHaveLength(6)
  for (const surface of ['terminal', 'desktop'] as const) {
    const short = await $.ui.mount({ plugin: 'buddy', surface, ...band(3, 80) })
    const texts = await short.findAll({ type: 'Text' })
    expect(texts).toHaveLength(1)
    expect(texts[0]?.text).toMatch(/Pip/)
  }
})

// The sprite rows a terminal band drew: the Text elements carrying a `bold` prop.
const spriteTexts = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text' })).filter(t => 'bold' in t.props)

test('a sprite is drawn in its rarity color on the terminal', async ($, on) => {
  // 'tint-11' rolls a plain rare penguin.
  world(on, { buddy: { ...RECORD, seed: 'tint-11' } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  const rows = await spriteTexts(ui)
  expect(rows).toHaveLength(5)
  expect(rows.every(t => t.props.color === 'blue' && t.props.bold === false)).toBe(true)
})

test('a shiny sprite shimmers on the terminal: five bold rows that change color each tick', async ($, on) => {
  // 'shiny-10' rolls a shiny common dragon.
  const clock = world(on, { buddy: { ...RECORD, seed: 'shiny-10' } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  const colors = async () => new Set((await spriteTexts(ui)).filter(t => t.props.bold === true).map(t => t.props.color))
  const before = await colors()
  expect(before.size).toBe(1)
  expect(SHIMMER as readonly unknown[]).toContain([...before][0])
  await clock.advance(500)
  const after = await colors()
  expect(after.size).toBe(1)
  expect([...after][0]).not.toBe([...before][0])
})

test('the desktop draws the art as one Svg and keeps only the name row as Text', async ($, on) => {
  world(on, { buddy: { ...RECORD, seed: 'shiny-10' } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band(10, 80) })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.alt).toMatch(/^Pip/)
  expect(String(svg?.props.source)).toContain('font-weight:bold')
  expect(await ui.findAll({ type: 'Text' })).toHaveLength(2)
})

test("a survey takes the band even with a buddy on screen", async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const asked = band()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...asked, props: { ...asked.props, hasSurvey: true } })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  expect(await ui.find({ text: /Pip/ })).toBeUndefined()
})

test('petting shows hearts then a reply; a second pet inside 5 s gets a canned line', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  const prompts = model(on, null, 'Purr.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('pet')).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /♥/ })).toBeDefined()
  await clock.settle()
  expect(await ui.find({ text: /Purr\./ })).toBeDefined()
  await run('pet')
  await clock.settle()
  expect(prompts.filter(p => p.includes('petted'))).toHaveLength(1)
  await clock.advance(3_000)
  expect(await ui.find({ text: /♥/ })).toBeUndefined()
})

test('a long reply in a narrow band turns pages until every word has shown, then goes', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  const reply = 'Three retries and a green build. I am choosing to believe that was all part of the plan, mostly.'
  model(on, null, reply)
  await $.session.start(START)
  await runner($)('pet')
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 44) })
  const pages: string[] = []
  for (let i = 0; i < 40; i++) {
    const lines = (await ui.findAll({ type: 'Text' }))
      .map(t => t.text)
      .filter(text => /^ [<|] /.test(text))
      .map(text => text.slice(3, -2).trim())
    const page = lines.filter(Boolean).join(' ')
    if (pages.at(-1) !== page) pages.push(page)
    await clock.advance(500)
  }
  expect(pages.length).toBeGreaterThan(2)
  expect(pages.at(-1)).toBe('')
  expect(pages.filter(Boolean).join(' ')).toBe(reply)
})

test('card opens a pane with the name, personality, rerolls and streak, and prints nothing', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await clock.settle()
  const card = await cardText($)
  expect(card).toMatch(/^Pip\b/m)
  expect(card).toMatch(/Counts semicolons\./)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/^Streak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/m)
})

test('the card pane is one drawn card on desktop and meters on the terminal', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  expect(await runner($)('card')).toBeUndefined()
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const cards = await desktop.findAll({ type: 'Svg' })
  expect(cards).toHaveLength(1)
  expect(cards[0]?.props.alt).toMatch(/^Pip, .*"Counts semicolons\." .*Stats: DEBUGGING \d+/)
  expect(cards[0]?.props.alt).toMatch(/Rerolls 0\. Streak \d+ days? \(best \d+\) · 0 turns · 0 tool calls\.$/)
  expect(String(cards[0]?.props.source)).toContain('>0 turns · 0 tool calls</text>')
  expect(await desktop.findAll({ type: 'Text' })).toHaveLength(0)
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ text: /DEBUGGING/ })).toBeDefined()
  expect(await terminal.find({ text: /█/ })).toBeDefined()
})

test('where no pane can be placed, card prints the text card with the streak', async ($, on) => {
  const clock = world(on, { buddy: RECORD }, false)
  await $.session.start(START)
  await clock.settle()
  const card = (await runner($)('card')) ?? ''
  expect(card).toMatch(/^Pip, /)
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17$/)
})

test('reroll asks first, then replaces the buddy and counts the reroll', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This retires Pip, \w+ \w+\. Run \/buddy reroll confirm\.$/)
  expect(await cardText($)).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, an? /)
  const card = await cardText($)
  expect(card).toMatch(/^Bix\b/m)
  expect(card).toMatch(/Rerolls: 1/)
})

test('off hides the buddy and /buddy brings it back', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  model(on, null, 'Back again.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('off')).toBe('Pip is hidden. Run /buddy to bring it back.')
  const hidden = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await hidden.find({ text: 'engine band' })).toBeDefined()
  expect(await run('pet')).toBe('Pip is hidden. Run /buddy to bring it back.')
  expect(await run('')).toMatch(/^Pip, .*, is here\.$/)
  await clock.settle()
  const shown = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await shown.find({ text: /Back again\./ })).toBeDefined()
})

const UNTOUCHABLE = [
  ['a record from a newer schema is never touched', { schema: 3, seed: 'future' }, 'Saved buddy uses schema 3; this mod knows 1 and 2.'],
  ['a damaged record is never touched', { schema: 2, active: 'gone', buddies: [] }, "Saved buddy is damaged; this mod won't overwrite it."],
] as const

for (const [name, row, line] of UNTOUCHABLE) {
  test(name, async ($, on) => {
    const shared = sharedStore(on, row)
    const clock = world(on, null)
    engineBelow(on)
    model(on, null, null)
    await $.session.start(START)
    const run = runner($)
    for (const args of ['', 'pet', 'card', 'reroll confirm', 'debug']) {
      expect(await run(args)).toBe(line)
    }
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete(TURN)
    await clock.settle()
    expect(shared.writes).toBe(0)
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })
}

test('a failed store write keeps the buddy alive for the session', async ($, on) => {
  // A store that reads empty and refuses every write.
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ deny: 'disk full' }))
  const clock = world(on, null)
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('')).toBe('Could not save your buddy; it lives for this session only.')
  await clock.settle()
  expect(await cardText($)).toMatch(/^Pip\b/m)
  expect(await run('pet')).toBeUndefined()
})

test('a failed save after a stored record keeps the new mode', async ($, on) => {
  // The store still holds RECORD (mode on) and refuses every write.
  on('store.get', async () => ({ value: RECORD }))
  on('store.set', async () => ({ deny: 'disk full' }))
  world(on, null)
  await $.session.start(START)
  const run = runner($)
  expect(await run('off')).toBe('Could not save your buddy; it lives for this session only.')
  expect(await run('pet')).toBe('Pip is hidden. Run /buddy to bring it back.')
})

test("another session's reroll is not overwritten", async ($, on) => {
  // The store is shared: another session can replace the row under this one.
  const shared: { row: unknown } = { row: RECORD }
  on('store.get', async () => ({ value: shared.row }))
  on('store.set', async (_$, e) => {
    shared.row = e.value
    return { value: undefined }
  })
  world(on, null)
  await $.session.start(START)
  shared.row = { ...RECORD, seed: 'other-seed', soul: { ...RECORD.soul, name: 'Bix' } }
  const run = runner($)
  expect(await cardText($)).toMatch(/^Bix\b/m)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Bix/ })).toBeDefined()
  await run('mute')
  expect(shared.row).toMatchObject({ schema: 2, active: 'other-seed', mode: 'muted' })
})

test('a reload after a failed write keeps the session-only buddy', async ($, on) => {
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ deny: 'disk full' }))
  const clock = world(on, null)
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('')).toBe('Could not save your buddy; it lives for this session only.')
  await clock.settle()
  await $.session.start(START)
  expect(await cardText($)).toMatch(/^Pip\b/m)
})

test("a schema 1 copy left in state by a 0.1.x session's failed write is migrated, not trusted", async ($, on) => {
  // A 0.1.x session whose last write failed holds its v1 record in state, marked unsaved, and a
  // reload runs session.start again over it. The first session here stands in for that one: its
  // writes of the record into state are rewritten to the v1 shape.
  const shared = sharedStore(on, RECORD)
  shared.refuse = true
  let legacy = true
  on('state.set', { plugin: 'buddy', key: 'record' }, async (_$, e, next) =>
    next(legacy ? { ...e, value: RECORD as unknown as Saved } : e),
  )
  const clock = world(on, null)
  await $.session.start(START)
  const run = runner($)
  expect(await run('off')).toBe('Could not save your buddy; it lives for this session only.')
  legacy = false
  shared.refuse = false
  await $.session.start(START)
  await clock.settle()
  expect(await run('mute')).toBe('Pip will stay quiet unless spoken to.')
  expect(shared.row).toMatchObject({ schema: 2, mode: 'muted' })
  expect(activeOf(shared.row)?.soul.name).toBe('Pip')
})

test('a refused command registration still loads the buddy', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { buddy: RECORD })
  on('command.register', async () => ({ deny: 'name taken' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
})

test('a hatch that dies midway still clears the egg', async ($, on) => {
  world(on, { buddy: RECORD })
  // The model call is rejected, then saving the new buddy into state fails: the egg is out by then.
  let broken = false
  on('model.complete', async () => {
    broken = true
    return { deny: 'model offline' }
  })
  on('state.set', { plugin: 'buddy', key: 'record' }, async (_$, e, next) =>
    broken ? { deny: 'state offline' } : next(e),
  )
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toBe('Your buddy hit a snag. Try again.')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /hatching/ })).toBeUndefined()
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
})

test('a reload in the middle of a hatch clears the egg', async ($, on) => {
  world(on, {})
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const hatched = runner($)('')
  // Wait for the egg to appear, then reload while the model call is still out.
  for (let i = 0; i < 100 && !(await ui.find({ text: /hatching/ })); i++) await Promise.resolve()
  expect(await ui.find({ text: /hatching/ })).toBeDefined()
  await $.session.start(START)
  expect(await ui.find({ text: /hatching/ })).toBeUndefined()
  release()
  await hatched
})

const TURN = { answer: 'done', durationMs: 4_000, isAborted: false, turnId: 't1', reason: 'answer' as const }

// Beneath the plugin: Bash fails, turns and prompts pass straight through.
function engineBelow(on: On) {
  on('tool.call', async () => ({ isError: true as const, result: 'boom' }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
}

test('a turn with a failed tool gets one reaction, then the cooldown holds', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Ouch.')
  await $.session.start(START)
  const reactions = () => prompts.filter(p => p.includes('Failed tools'))
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(reactions()).toHaveLength(1)
  expect(reactions()[0]).toContain('Failed tools: Bash.')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Ouch\./ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(reactions()).toHaveLength(1)
})

test('subagent turns and a muted buddy stay quiet', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Ouch.')
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await clock.settle()
  expect(prompts).toHaveLength(0)
  await runner($)('mute')
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts).toHaveLength(0)
})

test('tool results pass through unchanged', async ($, on) => {
  world(on, { buddy: RECORD })
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny' ? { deny: 'not here' } : { isError: true as const, result: 'boom' },
  )
  await $.session.start(START)
  expect(await $.tool.call({ tool: 'Bash', command: 'false' })).toMatchObject({ isError: true, result: 'boom' })
  expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'deny' }))).toContain('not here')
})

test('the name label is truncated, never wrapped', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const texts = await ui.findAll({ type: 'Text' })
  const label = texts.find(t => /Pip {2}\w+ \w+/.test(t.text ?? ''))
  expect(label?.props).toMatchObject({ wrap: 'truncate-end' })
})

test('a prompt with attachments goes to Claude even when it starts with the name', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Hi.')
  await $.session.start(START)
  const passed = await $.prompt.submit({
    text: 'Pip, what is in this screenshot?',
    attachments: [{ type: 'image', mediaType: 'image/png' }],
    wait: false,
    origin: { kind: 'composer' },
  })
  expect(passed).toMatchObject({ text: 'Pip, what is in this screenshot?' })
  await clock.settle()
  expect(prompts).toHaveLength(0)
})

test('no reaction while the egg is out', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  // Hatch requests wait for the test; every other model prompt is recorded.
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const others: string[] = []
  on('model.complete', async (_$, e) => {
    if (e.system?.includes('JSON only')) {
      await gate
      return { value: failed() }
    }
    others.push(e.prompt)
    return { value: ok('Ouch.') }
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const hatched = runner($)('reroll confirm')
  for (let i = 0; i < 100 && !(await ui.find({ text: /hatching/ })); i++) await Promise.resolve()
  expect(await ui.find({ text: /hatching/ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.advance(10)
  expect(others).toHaveLength(0)
  release()
  await hatched
})

test('a prompt addressed to the buddy is answered by it and never reaches Claude', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Doing great.')
  await $.session.start(START)
  const asked = await $.prompt.submit({ text: 'Pip, how are you?', wait: false, origin: { kind: 'composer' } })
  expect(asked).toEqual({ drop: '(to Pip)' })
  await clock.settle()
  expect(prompts[0]).toContain('how are you?')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Doing great\./ })).toBeDefined()
  const passed = await $.prompt.submit({ text: 'Pipeline, run it', wait: false, origin: { kind: 'composer' } })
  expect(passed).toMatchObject({ text: 'Pipeline, run it' })
})

test('when the buddy is off, even its name goes to Claude', async ($, on) => {
  world(on, { buddy: RECORD })
  engineBelow(on)
  await $.session.start(START)
  await runner($)('off')
  const passed = await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  expect(passed).toMatchObject({ text: 'Pip, hi' })
})

test('prompts from other origins are never intercepted', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Hi.')
  await $.session.start(START)
  const notice = await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'task-notification' } })
  expect(notice).toMatchObject({ text: 'Pip, hi' })
  const peer = await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'plugin', name: 'other' } })
  expect(peer).toMatchObject({ text: 'Pip, hi' })
  await clock.settle()
  expect(prompts).toHaveLength(0)
})

test("a subagent's failed tool doesn't leak into the main turn's reaction", async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  const prompts = model(on, null, 'Ouch.')
  await $.session.start(START)
  // ToolCallReserved omits agentId, so a fresh literal fails the excess-property check; a hoisted const does not.
  const fromSubagent = { tool: 'Bash', command: 'false', agentId: 'a1' } as const
  await $.tool.call(fromSubagent)
  await $.turn.complete({ ...TURN, durationMs: 130_000 })
  await clock.settle()
  const reactions = prompts.filter(p => p.includes('Failed tools'))
  expect(reactions).toHaveLength(1)
  expect(reactions[0]).toContain('Failed tools: none.')
})

// One tour step is 28 ticks at 500 ms a tick: 4 s plain, 4 s shiny, then 6 s of poses.
const HALF_STEP_MS = 4_000
const STEP_MS = 14_000

test('the debug tour shows each species plain, shiny, then flinching, and never writes the store', async ($, on) => {
  const writes: unknown[] = []
  on('store.get', async () => ({ value: RECORD }))
  on('store.set', async (_$, e) => {
    writes.push(e.value)
    return { value: undefined }
  })
  const clock = world(on, null)
  await $.session.start(START)
  // The session's visit is its own write; the tour adds none.
  await clock.settle()
  const visits = writes.length
  expect(await runner($)('debug')).toBe(
    'Touring all 18 species as adults with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const shimmering = async () => (await spriteTexts(ui)).every(t => t.props.bold === true)
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck  $/ })).toBeDefined()
  expect(await shimmering()).toBe(false)
  await clock.advance(HALF_STEP_MS)
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck \(shiny\)  $/ })).toBeDefined()
  expect(await shimmering()).toBe(true)
  await clock.advance(HALF_STEP_MS)
  // The duck's flinch, wide-eyed.
  expect(await ui.find({ type: 'Text', text: /<\(O \)___/ })).toBeDefined()
  await clock.advance(STEP_MS - 2 * HALF_STEP_MS)
  expect(await ui.find({ type: 'Text', text: /tour 2\/18  uncommon goose  $/ })).toBeDefined()
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band() })
  expect(await desktop.find({ type: 'Text', text: /tour 2\/18/ })).toBeDefined()
  expect(writes).toHaveLength(visits)
})

test('debug off ends the tour', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const run = runner($)
  await run('debug')
  expect(await run('debug off')).toBe('Back to Pip.')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Pip/ })).toBeDefined()
})

test('the tour ends by itself after the last mood', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(TOUR_TICKS * 500 - 500)
  expect(await ui.find({ type: 'Text', text: /tour: sulky/ })).toBeDefined()
  await clock.advance(500)
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Pip/ })).toBeDefined()
})

test('a reroll ends the tour', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  await run('debug')
  await run('reroll confirm')
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Bix/ })).toBeDefined()
})

test('the tour needs a buddy on screen', async ($, on) => {
  world(on, { buddy: { ...RECORD, mode: 'off' } })
  await $.session.start(START)
  expect(await runner($)('debug')).toBe('Pip is hidden. Run /buddy to bring it back.')
})

test('the card pane shows the real buddy even mid-tour', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const before = await cardText($)
  await runner($)('debug')
  expect(await cardText($)).toBe(before)
})

test("the card pane's terminal sprite takes its rarity color without bold", async ($, on) => {
  // 'tint-11' rolls a plain rare penguin.
  world(on, { buddy: { ...RECORD, seed: 'tint-11' } })
  await $.session.start(START)
  expect(await runner($)('card')).toBeUndefined()
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  const blue = (await card.findAll({ type: 'Text' })).filter(t => t.props.color === 'blue' && 'bold' in t.props)
  expect(blue).toHaveLength(5)
  expect(blue.every(t => t.props.bold === false)).toBe(true)
})

test('a schema 1 record is upgraded by the first save', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  await $.session.start(START)
  expect(shared.writes).toBe(0)
  await runner($)('mute')
  expect(shared.row).toMatchObject({
    schema: 2,
    mode: 'muted',
    rerolls: 0,
    active: 'test-seed',
    buddies: [{ seed: 'test-seed', soul: { name: 'Pip' }, retiredAt: null }],
  })
})

test('a reroll retires the old buddy and keeps it', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toMatch(/^Bix, an? /)
  const saved = shared.row as Saved
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Pip', 'Bix'])
  expect(typeof saved.buddies[0]?.retiredAt).toBe('string')
  expect(saved.buddies[1]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: saved.buddies[1]?.seed, rerolls: 1, mode: 'on' })
})

test('a record that turns damaged during a hatch is not written over, and nobody says hello', async ($, on) => {
  const shared = sharedStore(on, undefined)
  const clock = world(on, null)
  const asked: string[] = []
  on('model.complete', async (_$, e) => {
    asked.push(e.prompt)
    // Another session writes a bad record while the hatch waits for the model.
    shared.row = { schema: 2, active: 'gone', buddies: [] }
    return { value: ok('{"name": "Bix", "personality": "New here."}') }
  })
  await $.session.start(START)
  expect(await runner($)('')).toBe("Saved buddy is damaged; this mod won't overwrite it.")
  await clock.settle()
  expect(asked).toHaveLength(1)
  expect(shared.writes).toBe(0)
  expect(shared.row).toEqual({ schema: 2, active: 'gone', buddies: [] })
})

const SAVED: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: 'test-seed',
  buddies: [{ seed: 'test-seed', soul: RECORD.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: '2026-10-06', streak: 3, bestStreak: 3, days: 3 },
}

// RECORD's buddy grown to exactly level 10, the first adult level, so the tests below that read
// sprite rows read the adult art. A common's floor at level 10 is 4, under every stat 'test-seed'
// rolled, so its stats stay as rolled; Grown up is already earned, so nothing is announced.
const ADULT: Saved = {
  ...SAVED,
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 810 } }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { grownUp: '2026-10-01T12:00:00.000Z' } },
}
// ADULT, with another seed's buddy.
const adultAs = (seed: string): Saved => ({ ...ADULT, active: seed, buddies: [{ ...ADULT.buddies[0]!, seed }] })

test('a main turn saves its counts when it completes; a denied call is not counted', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny' ? { deny: 'not here' } : { isError: true as const, result: 'boom' },
  )
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await $.tool.call({ tool: 'Bash', command: 'deny' })
  await $.turn.complete({ ...TURN, durationMs: 7_000 })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({
    turns: 1,
    longestTurnMs: 7_000,
    failedCalls: 2,
    calls: { shell: 1, read: 1 },
  })
})

test("another session's changes survive this session's save", async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  // Mid-turn, another session mutes the buddy and saves five turns of its own.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.mode = 'muted'
  theirs.buddies[0]!.counts.turns = 5
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(shared.row).toMatchObject({ mode: 'muted' })
  expect(activeOf(shared.row)?.counts).toMatchObject({ turns: 6, failedCalls: 1 })
})

test('a failed write keeps the counts for the next save', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(0)
  shared.refuse = false
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({ turns: 2, failedCalls: 1 })
})

test('pets and talks are counted and saved', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, 'Hi.')
  await $.session.start(START)
  expect(await runner($)('pet')).toBeUndefined()
  await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(activeOf(shared.row)?.counts).toMatchObject({ pets: 1, talks: 1 })
})

test('the first session of a new day greets the streak; the next one that day does not', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null, true, NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Day 4 together\./ })).toBeDefined()
  expect((shared.row as Saved).you).toEqual({ lastDay: '2026-10-07', streak: 4, bestStreak: 4, days: 4 })
  await clock.advance(13_000)
  expect(await ui.find({ text: /together/ })).toBeUndefined()
  await $.session.start(START)
  await clock.settle()
  expect(await ui.find({ text: /together/ })).toBeUndefined()
})

test('a buddy that is off counts nothing and records no visit', async ($, on) => {
  const shared = sharedStore(on, { ...RECORD, mode: 'off' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(shared.writes).toBe(0)
})

// A shared store whose reads can be held back after they have read, so a save that is slow to
// finish writes from what it saw before another save wrote: the overlap two sessions would have.
function heldStore(on: On, row: unknown) {
  const shared = { row, held: false }
  const parked: (() => void)[] = []
  on('store.get', async () => {
    const value = shared.row
    if (shared.held) await new Promise<void>(resolve => parked.push(resolve))
    return { value }
  })
  on('store.set', async (_$, e) => {
    shared.row = e.value
    return { value: undefined }
  })
  return {
    shared,
    release: () => {
      shared.held = false
      for (const resolve of parked.splice(0)) resolve()
    },
  }
}

// Long enough for every save that can start to have reached the store.
async function idle() {
  for (let i = 0; i < 100; i++) await Promise.resolve()
}

test('saves in one session run one at a time: a mute is not lost to a turn-end save', async ($, on) => {
  const store = heldStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  // The turn's save reads the store and is held there; the mute starts meanwhile.
  store.shared.held = true
  await $.turn.complete(TURN)
  await clock.settle()
  await idle()
  store.shared.held = false
  const muted = runner($)('mute')
  await idle()
  store.release()
  await Promise.all([muted, clock.settle()])
  expect(store.shared.row).toMatchObject({ mode: 'muted' })
  expect(activeOf(store.shared.row)?.counts).toMatchObject({ turns: 1, failedCalls: 1 })
})

test('saves in one session run one at a time: two turns in a row both keep their counts', async ($, on) => {
  const store = heldStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  store.shared.held = true
  await $.turn.complete(TURN)
  await clock.settle()
  await idle()
  store.shared.held = false
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  await idle()
  store.release()
  await clock.settle()
  await idle()
  expect(activeOf(store.shared.row)?.counts.turns).toBe(2)
})

// A terminal band's elements, as much of them as these tests read.
type Drawn = { findAll: (q: { type: string }) => Promise<{ text?: string; props: Record<string, unknown> }[]> }

// The five sprite rows a terminal band drew, as text: the Text elements carrying a `bold` prop.
const drawnSprite = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Text' })).filter(t => 'bold' in t.props).map(t => t.text ?? '')

// Local noon on Independence Day 2026.
const JULY4_NOON = new Date(2026, 6, 4, 12).getTime()

test('on the Fourth of July a quiet buddy wears the hat and holds the flag; a bubble takes its place', async ($, on) => {
  const clock = world(on, { buddy: ADULT }, true, JULY4_NOON)
  model(on, null, 'Fireworks later?')
  await $.session.start(START)
  await clock.settle()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(terminal))[0]).toContain('_|**|_')
  expect((await terminal.find({ type: 'Text', text: /^\*:\*:$/ }))?.props.color).toBe('blue')
  expect((await terminal.find({ type: 'Text', text: /^=====$/ }))?.props.color).toBe('red')
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band() })
  expect(String((await desktop.find({ type: 'Svg' }))?.props.source)).toContain('<tspan class="paint-blue">*:*:</tspan>')
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  expect((await short.findAll({ type: 'Text' })).map(t => t.text).join('')).not.toContain('*:*:')
  await runner($)('pet')
  await clock.settle()
  expect(await terminal.find({ type: 'Text', text: /Fireworks later\?/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /^\*:\*:$/ })).toBeUndefined()
})

test('the card keeps the rolled hat on a holiday', async ($, on) => {
  // 'tint-11' rolls a rare penguin in a wizard hat.
  const clock = world(on, { buddy: adultAs('tint-11') }, true, JULY4_NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui))[0]).toContain('_|**|_')
  const card = await cardText($)
  expect(card).toContain('/*\\')
  expect(card).not.toContain('_|**|_')
})

test('a buddy left alone for 10 minutes falls asleep, and a prompt wakes it', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
  engineBelow(on)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(599_000)
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
  await clock.advance(1_000)
  expect((await drawnSprite(ui))[0]).toMatch(/z$/)
  // The ghost's sleep frame, eyes shut.
  expect((await drawnSprite(ui)).join('\n')).toContain('/ -  - \\')
  await $.prompt.submit({ text: 'run the tests', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
})

test('at night the buddy dozes off after a minute', async ($, on) => {
  const clock = world(on, { buddy: ADULT }, true, new Date(2026, 9, 7, 0, 30).getTime())
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(59_500)
  expect((await drawnSprite(ui))[0]).not.toMatch(/z$/)
  await clock.advance(500)
  expect((await drawnSprite(ui))[0]).toMatch(/z$/)
})

test('the tour dresses the real buddy for each holiday, then shows each mood', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // Independence Day is the eighth decoration.
  await clock.advance((18 * 28 + 7 * 8) * 500)
  expect(await ui.find({ type: 'Text', text: /tour: Independence Day  common ghost/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^\*:\*:$/ }))?.props.color).toBe('blue')
  await clock.advance(8 * 8 * 500)
  expect(await ui.find({ type: 'Text', text: /tour: anxious/ })).toBeDefined()
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ;  ; \\')
})

// The bubble's words on a terminal band, '' when there is none.
const bubbleOf = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Text' }))
    .map(t => t.text ?? '')
    .filter(text => /^ [<|] /.test(text))
    .map(text => text.slice(3, -2).trim())
    .filter(Boolean)
    .join(' ')

test('a failed tool call makes the buddy flinch for 2 seconds', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  // The ghost's flinch frame, wide-eyed.
  expect((await drawnSprite(ui)).join('\n')).toContain(' / O  O  \\')
  await clock.advance(2_000)
  expect((await drawnSprite(ui)).join('\n')).not.toContain('O  O')
})

test('two failed turns make the buddy anxious, and the turn-end save keeps the mood', async ($, on) => {
  const shared = sharedStore(on, ADULT)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete({ ...TURN, reason: 'error' })
  await clock.settle()
  // A record from before this build had no mood; the first save with events gives it one.
  expect(activeOf(shared.row)?.mood).toEqual({ meter: -1, sulk: 0, at: new Date(NOON).toISOString() })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'error' })
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.meter).toBe(-2)
  // Past the flinch, the ghost's eyes are anxious.
  await clock.advance(2_000)
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ;  ; \\')
})

test('a long clean turn makes the buddy celebrate under confetti', async ($, on) => {
  const clock = world(on, { buddy: ADULT })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete({ ...TURN, durationMs: 130_000 })
  await clock.settle()
  const rows = await drawnSprite(ui)
  expect([' *  .  *  . ', ' .  *  .  * ']).toContain(rows[0])
  expect(rows.join('\n')).toContain('\\ / ^  ^ \\ /')
  await clock.advance(3_000)
  expect((await drawnSprite(ui))[0]?.trim()).toBe('')
})

test("another session's mood survives this session's save", async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  // Mid-turn, another session saves a run of failures of its own.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.mood = { meter: -3, sulk: 0, at: new Date(NOON).toISOString() }
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.meter).toBe(-4)
})

test('back after days away, the buddy sulks until it is petted', async ($, on) => {
  // 2026-10-04 to 2026-10-07 misses two days: sulk 1.
  const shared = sharedStore(on, { ...ADULT, you: { ...ADULT.you, lastDay: '2026-10-04' } })
  const clock = world(on, null)
  model(on, null, 'Hmph.')
  await $.session.start(START)
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.sulk).toBe(1)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui)).join('\n')).toContain('/ =  = \\')
  await runner($)('pet')
  await clock.settle()
  expect(activeOf(shared.row)?.mood?.sulk).toBe(0)
  expect((await drawnSprite(ui)).join('\n')).toContain('/ ✦  ✦ \\')
})

// 'debug-142' rolls an epic mushroom with DEBUGGING 100.
const KEEN = { ...RECORD, seed: 'debug-142' }

test('a buddy with DEBUGGING 100 speaks up once a turn when a tool fails, never when muted, and calls no model', async ($, on) => {
  const clock = world(on, { buddy: KEEN })
  engineBelow(on)
  const prompts = model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const lines = [...FAIL_PLAIN, ...FAIL_SNARKY]
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(lines).toContain(await bubbleOf(ui))
  // Once that bubble is gone, a second failure in the same turn stays quiet.
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // A new turn may speak again.
  await $.turn.complete(TURN)
  await clock.settle()
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(lines).toContain(await bubbleOf(ui))
  // Muted, it says nothing.
  await runner($)('mute')
  await $.turn.complete({ ...TURN, turnId: 't3' })
  await clock.settle()
  await clock.advance(13_000)
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // The only model calls were turn-end reactions.
  expect(prompts.filter(p => !p.startsWith('Claude just finished a turn'))).toEqual([])
})

test("the persona hears the buddy's mood and the day", async ($, on) => {
  const clock = world(on, { buddy: RECORD }, true, JULY4_NOON)
  engineBelow(on)
  const systems: string[] = []
  on('model.complete', async (_$, e) => {
    systems.push(e.system ?? '')
    return { value: ok('Boom.') }
  })
  await $.session.start(START)
  await clock.settle()
  await $.turn.complete({ ...TURN, reason: 'error' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'error' })
  await clock.settle()
  await runner($)('pet')
  await clock.settle()
  const pet = systems.at(-1) ?? ''
  expect(pet).toContain('Mood: anxious, after a run of failures. Let it color the line.')
  expect(pet).toContain('Today is Independence Day.')
})

// A pet and a talk each take one step off the sulk before the buddy answers.
const SOOTHERS: [string, ($: Engine) => Promise<unknown>][] = [
  ['a pet', $ => runner($)('pet')],
  ['a talk', $ => $.prompt.submit({ text: 'Pip, sorry I was away.', wait: false, origin: { kind: 'composer' } })],
]

for (const [what, soothe] of SOOTHERS) {
  test(`the answer to ${what} hears the sulk it eased, even while its save is slow`, async ($, on) => {
    // 2026-10-04 to 2026-10-07 misses two days: sulk 1, which one soothe takes away.
    const store = heldStore(on, { ...SAVED, you: { ...SAVED.you, lastDay: '2026-10-04' } })
    const clock = world(on, null)
    engineBelow(on)
    const systems: string[] = []
    on('model.complete', async (_$, e) => {
      systems.push(e.system ?? '')
      return { value: ok('Fine.') }
    })
    await $.session.start(START)
    await clock.settle()
    await soothe($)
    // The save the soothe starts is held at the store, as a slow disk would hold it.
    store.shared.held = true
    await clock.settle()
    await idle()
    store.release()
    await clock.settle()
    await idle()
    expect(activeOf(store.shared.row)?.mood?.sulk).toBe(0)
    expect(systems).toHaveLength(1)
    expect(systems[0]).not.toContain('Mood: sulky')
  })
}

test('a reply cancels a reaction still waiting on the model, and the reaction never shows', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  engineBelow(on)
  // Reactions wait for the test; replies answer at once.
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    if (!e.prompt.startsWith('Claude just finished a turn')) return { value: ok('Hello there.') }
    await gate
    return { value: ok('Ouch.') }
  })
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.advance(10)
  for (let i = 0; i < 100 && prompts.length === 0; i++) await Promise.resolve()
  expect(prompts).toHaveLength(1)
  await $.prompt.submit({ text: 'Pip, how are you?', wait: false, origin: { kind: 'composer' } })
  await clock.advance(10)
  for (let i = 0; i < 100 && prompts.length === 1; i++) await Promise.resolve()
  release()
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Hello there\./ })).toBeDefined()
  expect(await ui.find({ text: /Ouch\./ })).toBeUndefined()
  expect(prompts.filter(p => p.startsWith('Claude just finished a turn'))).toHaveLength(1)
})

// Six days before the test clock's noon.
const LAST_WEEK = new Date(2026, 9, 1, 12).toISOString()

// SAVED, with a journal on its buddy.
const remembering = (journal: Moment[]): Saved => ({ ...SAVED, buddies: [{ ...SAVED.buddies[0]!, journal }] })

// Beneath the plugin: Read succeeds, a `deny` command is refused, and every other call fails.
function mixedEngine(on: On) {
  on('tool.call', async (_$, e) =>
    e.tool === 'Bash' && e.command === 'deny'
      ? { deny: 'not here' }
      : e.tool === 'Read'
        ? { result: 'ok' }
        : { isError: true as const, result: 'boom' },
  )
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
}

test('five failed shell calls in a row go in the journal once, on a record from before the journal', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (const turnId of ['t1', 't2']) {
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId })
    await clock.settle()
  }
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
  expect(activeOf(shared.row)?.bests).toEqual({ failRun: 5, calls: 5, rough: 0 })
})

test('a denied call leaves a run of failures going, a success ends it, and a subagent is no part of it', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  mixedEngine(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const fail = () => $.tool.call({ tool: 'Bash', command: 'false' })
  // ToolCallReserved omits agentId, so a fresh literal fails the excess-property check; a hoisted const does not.
  const fromSubagent = { tool: 'Bash', command: 'false', agentId: 'a1' } as const
  // Three failures, a success, then four more with a subagent's failure among them: the main
  // conversation's run is four, and reaches five only if the subagent's failure counted.
  for (let i = 0; i < 3; i++) await fail()
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await fail()
  await fail()
  await $.tool.call(fromSubagent)
  await fail()
  await fail()
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  // Three failures, a denied call, two more: a run of five.
  for (let i = 0; i < 3; i++) await fail()
  await $.tool.call({ tool: 'Bash', command: 'deny' })
  await fail()
  await fail()
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
})

test('three rough turns, then a clean one, go in the journal as a comeback, even muted', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, mode: 'muted' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (const turnId of ['t1', 't2', 't3']) {
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId })
  }
  await $.turn.complete({ ...TURN, turnId: 't4' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'comeback', n: 3 }])
})

test('turn 100 goes in the journal once, even when another session got there first', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 99 } }] })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // Mid-turn, another session saves turn 100 and its milestone.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.counts.turns = 100
  theirs.buddies[0]!.journal = [{ at: new Date(NOON).toISOString(), kind: 'turns', n: 100 }]
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(101)
  expect(activeOf(shared.row)?.journal).toHaveLength(1)
})

test('a quip after a failed call remembers the worst run, and calls the model no more than before', async ($, on) => {
  const clock = world(on, { buddy: remembering([{ at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' }]) })
  engineBelow(on)
  const prompts = model(on, null, 'Not again.')
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('\nA memory (6 days ago): Claude failed 18 shell commands in a row. ')
  expect(prompts[0]?.endsWith('\nReact in one line.')).toBe(true)
})

test('a quip does not carry the same memory twice within the hour', async ($, on) => {
  const clock = world(on, { buddy: remembering([{ at: LAST_WEEK, kind: 'failRun', n: 17, group: 'edit' }]) })
  engineBelow(on)
  const prompts = model(on, null, 'Not again.')
  await $.session.start(START)
  await clock.settle()
  const failedTurn = async (turnId: string) => {
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId })
    await clock.settle()
  }
  await failedTurn('t1')
  // Ten minutes on, past the quip cooldown: the same memory is the only one, and it was just used.
  await clock.advance(10 * 60_000)
  await failedTurn('t2')
  // An hour after the first recall, it is eligible again.
  await clock.advance(50 * 60_000)
  await failedTurn('t3')
  expect(prompts.map(p => p.includes('A memory (6 days ago): Claude failed 17 edits in a row.'))).toEqual([true, false, true])
})

// Math.random can't be stubbed in a test, so the WISDOM roll is checked by its odds. WISDOM 100
// gives this seed a 0.30 chance, and PATIENCE 27 a quip cooldown under 4 minutes.
const WISE_SEED = 'wise-45'

test('a quip with nothing to echo remembers some of the time, never every time', { timeoutMs: 30_000 }, async ($, on) => {
  // Twenty memories, so the ones recalled in the last hour always leave others eligible.
  const journal: Moment[] = Array.from({ length: 20 }, (_, i) => ({ at: LAST_WEEK, kind: 'away', n: i + 4 }))
  const wise: Saved = { ...SAVED, active: WISE_SEED, buddies: [{ ...SAVED.buddies[0]!, seed: WISE_SEED, journal }] }
  const clock = world(on, { buddy: wise })
  engineBelow(on)
  const prompts = model(on, null, 'Hm.')
  await $.session.start(START)
  await clock.settle()
  // Errored turns with no calls: each gets a quip, and none echoes a kind of memory.
  for (let i = 0; i < 60; i++) {
    await $.turn.complete({ ...TURN, turnId: `t${i}`, reason: 'error' })
    await clock.settle()
    await clock.advance(4 * 60_000)
  }
  expect(prompts).toHaveLength(60)
  // At 0.30, no memory in 60 quips comes about once in two billion runs, and one in all 60 never.
  const remembered = prompts.filter(p => p.includes('\nA memory (')).length
  expect(remembered).toBeGreaterThan(0)
  expect(remembered).toBeLessThan(60)
})

test("a talk's prompt carries the three newest memories", async ($, on) => {
  const clock = world(on, {
    buddy: remembering([
      { at: LAST_WEEK, kind: 'away', n: 9 },
      { at: LAST_WEEK, kind: 'turns', n: 100 },
      { at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' },
      { at: LAST_WEEK, kind: 'comeback', n: 4 },
    ]),
  })
  engineBelow(on)
  const prompts = model(on, null, 'I remember.')
  await $.session.start(START)
  await clock.settle()
  await $.prompt.submit({ text: 'Pip, remember anything?', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(prompts).toEqual([
    [
      'The developer says to you: remember anything?',
      'Your memories, newest first:',
      '- 6 days ago: a clean turn after 4 rough ones',
      '- 6 days ago: Claude failed 18 shell commands in a row',
      '- 6 days ago: 100 turns together',
      'Mention one only if it fits what they said.',
      'Reply in one line.',
    ].join('\n'),
  ])
})

test('rough turns do not carry across "off", or over to a rerolled buddy', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  let n = 0
  const turn = async (rough: boolean) => {
    if (rough) await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId: `t${++n}` })
    await clock.settle()
  }
  // Two rough turns, one while off, then a clean one: three in a row only if "off" kept the count.
  await turn(true)
  await turn(true)
  await run('off')
  await turn(true)
  await run('')
  await turn(false)
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  // Two more, a reroll, one rough turn for the new buddy, and a clean one.
  await turn(true)
  await turn(true)
  await run('reroll confirm')
  await turn(true)
  await turn(false)
  expect(activeOf(shared.row)?.journal).toBeUndefined()
})

test('rough turns do not carry across "off" with no turn while off, or to a buddy another session hatched', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  let n = 0
  const turn = async (rough: boolean) => {
    if (rough) await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.turn.complete({ ...TURN, turnId: `t${++n}` })
    await clock.settle()
  }
  // Three rough turns, off and straight back on, then a clean one.
  for (let i = 0; i < 3; i++) await turn(true)
  await run('off')
  await run('')
  await turn(false)
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  // Three more, then another session rerolls. This session's next turn still counts for the old
  // buddy, and its save shows the new one: a clean turn after that is the new buddy's first.
  for (let i = 0; i < 3; i++) await turn(true)
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.retiredAt = new Date(NOON).toISOString()
  theirs.buddies.push({ seed: 'their-seed', soul: { ...RECORD.soul, name: 'Mo' }, retiredAt: null, counts: zeroCounts() })
  theirs.active = 'their-seed'
  shared.row = theirs
  await turn(true)
  await turn(false)
  expect(activeOf(shared.row)?.seed).toBe('their-seed')
  expect(activeOf(shared.row)?.journal).toBeUndefined()
})

test('a buddy that is off keeps no journal, even once it is back', async ($, on) => {
  const shared = sharedStore(on, { ...SAVED, mode: 'off' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  await runner($)('')
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(1)
  expect(activeOf(shared.row)?.journal).toBeUndefined()
})

test('a failed write keeps a new moment for the next save', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toBeUndefined()
  shared.refuse = false
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
})

test('a save that fails before it writes puts the turn back, and the next save keeps its moment', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // The save can't read the store, so nothing reaches this session's copy either.
  shared.refuseReads = true
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  shared.refuseReads = false
  expect(activeOf(shared.row)?.counts.turns).toBe(0)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(2)
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'failRun', n: 5, group: 'shell' }])
})

test('a 10-minute turn goes in the journal, even when another save lands while its facts are queued', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  // The turn's write to the facts queue is held until the test lets it go.
  let hold = false
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('state.set', { plugin: 'buddy', key: 'pendingTurns' }, async (_$, e, next) => {
    if (hold) {
      hold = false
      await gate
    }
    return next(e)
  })
  await $.session.start(START)
  await clock.settle()
  hold = true
  await $.turn.complete({ ...TURN, durationMs: 10 * 60_000 })
  await clock.settle()
  await idle()
  // A pet's save runs meanwhile. Had the turn's counts gone first, it would save the turn's
  // length without its facts, and the facts would no longer beat the longest turn.
  expect(await runner($)('pet')).toBeUndefined()
  await clock.settle()
  await idle()
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  release()
  await clock.settle()
  await idle()
  expect(activeOf(shared.row)?.counts).toMatchObject({ turns: 1, pets: 1, longestTurnMs: 600_000 })
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'longTurn', n: 10 }])
})

const journalPane = () => ({ ...pane(), requestId: 'journal', props: { ...pane().props, title: 'Journal' } })

test('journal opens a pane listing the moments newest first, even while the buddy is off, and prints nothing', async ($, on) => {
  const saved = remembering([
    { at: LAST_WEEK, kind: 'away', n: 9 },
    { at: LAST_WEEK, kind: 'failRun', n: 18, group: 'shell' },
  ])
  const clock = world(on, { buddy: { ...saved, mode: 'off' } })
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('journal')).toBeUndefined()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  const text = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(text).toMatch(/^Pip's journal\|6 days ago *\|Claude failed 18 shell commands in a row\|6 days ago *\|back after 9 days away$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...journalPane() })
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  expect(svgs[0]?.props.alt).toBe(
    "Pip's journal. 6 days ago: Claude failed 18 shell commands in a row. 6 days ago: back after 9 days away.",
  )
  expect(String(svgs[0]?.props.source)).toContain('>back after 9 days away</text>')
})

test('where no pane can be placed, journal prints its header and the newest ten', async ($, on) => {
  const journal: Moment[] = Array.from({ length: 12 }, (_, i) => ({ at: LAST_WEEK, kind: 'turns' as const, n: i + 1 }))
  const clock = world(on, { buddy: remembering(journal) }, false)
  await $.session.start(START)
  await clock.settle()
  const lines = ((await runner($)('journal')) ?? '').split('\n')
  expect(lines).toHaveLength(11)
  expect(lines[0]).toBe("Pip's journal")
  expect(lines[1]).toBe('6 days ago   12 turns together')
  expect(lines[10]).toBe('6 days ago   3 turns together')
})

test('an empty journal says so, as text and on the pane', async ($, on) => {
  const clock = world(on, { buddy: SAVED }, false)
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('journal')).toBe("Pip's journal\nNothing in Pip's journal yet.")
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  expect(await terminal.find({ text: "Nothing in Pip's journal yet." })).toBeDefined()
})

// SAVED's buddy with counts worth exactly 152,100 XP: level 40.
const ELDERLY: Saved = { ...SAVED, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 15_210 } }] }

test('the level shows on the name line, and the persona hears the stats the buddy grew into', async ($, on) => {
  const clock = world(on, { buddy: ELDERLY })
  const systems: string[] = []
  on('model.complete', async (_$, e) => {
    systems.push(e.system ?? '')
    return { value: ok('Hm.') }
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 40  common ghost  ' })).toBeDefined()
  await runner($)('pet')
  await clock.settle()
  // 'test-seed' rolled DEBUGGING 7, PATIENCE 30, CHAOS 31 and SNARK 9; level 40 lifts each to 34.
  expect(systems.at(-1)).toContain('Stats: DEBUGGING 34, PATIENCE 34, CHAOS 34, WISDOM 59, SNARK 34.')
})

// SAVED's buddy one turn short of level 10, on its first visit, so no streak greeting takes the bubble.
const NEARLY: Saved = {
  ...SAVED,
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
}
const CONFETTI_ROWS = [' *  .  *  . ', ' .  *  .  * ']
const NEWS_10 = 'Level 10! I grew into an adult. Earned Grown up.'

test('the turn that reaches level 10 is announced once, under confetti, and saved as growing up', async ($, on) => {
  const shared = sharedStore(on, NEARLY)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  expect(CONFETTI_ROWS).toContain((await drawnSprite(ui))[0])
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 10  common ghost  ' })).toBeDefined()
  expect(activeOf(shared.row)?.journal).toEqual([{ at: new Date(NOON).toISOString(), kind: 'grew', n: 1 }])
  expect((shared.row as Saved).you.earned).toEqual({ grownUp: new Date(NOON).toISOString() })
  // The next turn crosses nothing and says nothing.
  await clock.advance(30_000)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
})

test('muted, an announcement is confetti with no words', async ($, on) => {
  const shared = sharedStore(on, { ...NEARLY, mode: 'muted' })
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  expect(CONFETTI_ROWS).toContain((await drawnSprite(ui))[0])
  expect((shared.row as Saved).you.earned).toEqual({ grownUp: new Date(NOON).toISOString() })
})

test('a level another session reached is not announced here', async ($, on) => {
  const shared = sharedStore(on, NEARLY)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // Another session saves the turn that reaches level 10, and what it earned.
  const theirs = JSON.parse(JSON.stringify(shared.row)) as Saved
  theirs.buddies[0]!.counts.turns = 810
  theirs.you.earned = { grownUp: new Date(NOON).toISOString() }
  shared.row = theirs
  await $.turn.complete(TURN)
  await clock.settle()
  expect(activeOf(shared.row)?.counts.turns).toBe(811)
  expect(await bubbleOf(ui)).toBe('')
  expect(CONFETTI_ROWS).not.toContain((await drawnSprite(ui))[0])
})

test('a quip that comes back over an announcement is dropped; a pet reply is not', async ($, on) => {
  const clock = world(on, { buddy: NEARLY })
  engineBelow(on)
  const prompts = model(on, null, 'Nice.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  // Past the failed call's flinch, whose frame has a row that reads like a bubble row.
  await clock.advance(2_000)
  // The failed call made the turn notable, so a quip was asked for; the news kept the bubble.
  expect(prompts.filter(p => p.startsWith('Claude just finished a turn'))).toHaveLength(1)
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  await runner($)('pet')
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Nice.')
})

test('a visit that earns something says so in place of the streak greeting', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, you: { lastDay: '2026-10-06', streak: 6, bestStreak: 6, days: 6 } } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Earned Regular.')
})

test('the card shows the level, the XP to the next one, and your achievements, on every surface', async ($, on) => {
  // 500 turns and 7,100 MCP calls are 12,100 XP, level 12, with no turn or call achievement.
  const grown: Saved = {
    ...SAVED,
    buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 500, calls: { ...zeroCounts().calls, mcp: 7_100 } } }],
    you: { ...SAVED.you, earned: { grownUp: '2026-10-04T12:00:00.000Z', marathon: '2026-10-05T12:00:00.000Z' } },
  }
  const clock = world(on, { buddy: grown })
  await $.session.start(START)
  await clock.settle()
  const text = await cardText($)
  expect(text).toContain('\nLv 12 adult · 12,100 / 14,400 xp\n')
  expect(text).toMatch(/\nAchievements: 2 of 17\nMarathon · Grown up$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toContain('. Level 12, adult, 12,100 of 14,400 XP. 2 of 17 achievements: Marathon, Grown up. Hatched')
  expect(String(svg?.props.source)).toContain('>Lv 12 adult</text>')
})

// Pip, a common dragon ('swap-1') retired two days ago, and Mochi, a common axolotl ('swap-2'), here now.
const TWO: Saved = {
  ...SAVED,
  rerolls: 1,
  active: 'swap-2',
  buddies: [
    {
      seed: 'swap-1',
      soul: { ...RECORD.soul, hatchedAt: '2026-10-01T12:00:00.000Z' },
      retiredAt: '2026-10-05T12:00:00.000Z',
      counts: zeroCounts(),
    },
    {
      seed: 'swap-2',
      soul: { ...RECORD.soul, name: 'Mochi', hatchedAt: '2026-10-05T12:00:00.000Z' },
      retiredAt: null,
      counts: zeroCounts(),
    },
  ],
}
const dexPane = () => ({ ...pane(), requestId: 'dex', props: { ...pane().props, title: 'Buddydex' } })

test('dex opens a pane listing every buddy oldest first, the active one in bold, even while off', async ($, on) => {
  const clock = world(on, { buddy: { ...TWO, mode: 'off' } })
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('dex')).toBeUndefined()
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...dexPane() })
  const texts = await terminal.findAll({ type: 'Text' })
  expect(texts.map(t => t.text)).toEqual([
    'Buddydex',
    `#1  (×vv×)  ${'Pip'.padEnd(12)}  Lv 1 hatchling common dragon ★  Oct 1 – Oct 5`,
    `#2  }◉.◉{   ${'Mochi'.padEnd(12)}  Lv 1 hatchling common axolotl ★  Oct 5 – now`,
  ])
  expect(texts.map(t => t.props.bold)).toEqual([true, false, true])
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...dexPane() })
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  expect(svgs[0]?.props.alt).toBe(
    'Buddydex, 2 buddies. Number 1, Pip, level 1 hatchling common dragon, Oct 1 to Oct 5. ' +
      'Number 2, Mochi, level 1 hatchling common axolotl, Oct 5 to now.',
  )
})

test('where no pane can be placed, dex prints a count and the newest ten', async ($, on) => {
  const many: Saved = {
    ...SAVED,
    active: 'b13',
    buddies: Array.from({ length: 14 }, (_, i) => ({
      ...SAVED.buddies[0]!,
      seed: `b${i}`,
      retiredAt: i === 13 ? null : '2026-10-06T12:00:00.000Z',
    })),
  }
  const clock = world(on, { buddy: many }, false)
  await $.session.start(START)
  await clock.settle()
  const lines = ((await runner($)('dex')) ?? '').split('\n')
  expect(lines).toHaveLength(12)
  expect(lines.slice(0, 2)).toEqual(['Buddydex: 14 buddies', '…4 earlier'])
  expect(lines[2]).toMatch(/^#5 /)
  expect(lines[11]).toMatch(/^#14 .* – now$/)
})

test('card and journal show a retired buddy by number or by name, and the active one again with neither', async ($, on) => {
  const pip = { ...TWO.buddies[0]!, journal: [{ at: LAST_WEEK, kind: 'away' as const, n: 9 }] }
  const clock = world(on, { buddy: { ...TWO, buddies: [pip, TWO.buddies[1]!] } })
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('card #1')).toBeUndefined()
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  const text = (await card.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await card.unmount()
  expect(text).toMatch(/^Pip$/m)
  expect(text).toContain('Hatched 2026-10-01   Rerolls: 1   Retired 2026-10-05')
  expect(await run('journal pip')).toBeUndefined()
  const journal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  expect(await journal.find({ text: "Pip's journal" })).toBeDefined()
  expect(await journal.find({ text: 'back after 9 days away' })).toBeDefined()
  expect(await cardText($)).toMatch(/^Mochi$/m)
})

test('a name two buddies share gets their numbers, and a name nobody has is answered', async ($, on) => {
  const twins = { ...TWO, buddies: [TWO.buddies[0]!, { ...TWO.buddies[1]!, soul: { ...TWO.buddies[1]!.soul, name: 'Pip' } }] }
  const clock = world(on, { buddy: twins }, false)
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('card pip')).toBe('2 buddies are named Pip: #1 dragon, #2 axolotl. Run /buddy card #2.')
  expect(await run('journal Rex')).toBe('No buddy named Rex in the dex.')
  expect((await run('card #1')) ?? '').toMatch(/^Pip, common dragon ★\nLv 1 hatchling · 0 \/ 100 xp\n/)
})

test('swap brings a retired buddy back by name, says hello once, and draws it', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  const prompts = model(on, null, 'Missed you.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('swap pip')).toBe('Pip is back.')
  await clock.settle()
  expect(shared.row).toMatchObject({ active: 'swap-1', rerolls: 1, mode: 'on' })
  expect((shared.row as Saved).buddies.map(b => b.retiredAt)).toEqual([null, new Date(NOON).toISOString()])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 1  common dragon  ' })).toBeDefined()
  expect(await ui.find({ text: /Missed you\./ })).toBeDefined()
  expect(prompts.filter(p => p.includes('called you over'))).toHaveLength(1)
})

test('swap by number; the buddy already here, a stranger and a bare swap are answered without one', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('swap #2')).toBe('Mochi is already here.')
  expect(await run('swap Rex')).toBe('No buddy named Rex in the dex.')
  expect(await run('swap')).toMatch(/^Usage: /)
  expect(await run('swap 1')).toBe('Pip is back.')
  expect(await run('swap mochi')).toBe('Mochi is back.')
})

test('a swap hands the card and journal back to the active buddy, so they follow the next swap', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('card Pip')).toBeUndefined()
  expect(await run('journal Pip')).toBeUndefined()
  expect(await run('swap Pip')).toBe('Pip is back.')
  expect(await run('swap Mochi')).toBe('Mochi is back.')
  // Mount the panes as they stand: running /buddy card again would reset the target itself.
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...pane() })
  expect(await card.find({ text: 'Mochi' })).toBeDefined()
  expect(await card.find({ text: 'Pip' })).toBeUndefined()
  await card.unmount()
  const journal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...journalPane() })
  expect(await journal.find({ text: "Mochi's journal" })).toBeDefined()
  expect(await journal.find({ text: "Pip's journal" })).toBeUndefined()
  await journal.unmount()
})

test('calls counted before a swap land on the buddy that made them, and the turn after on the one back', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.settle()
  expect(await runner($)('swap Pip')).toBe('Pip is back.')
  await $.turn.complete(TURN)
  await clock.settle()
  const [pip, mochi] = (shared.row as Saved).buddies
  expect(mochi?.counts).toMatchObject({ turns: 0, failedCalls: 1, calls: { shell: 1 } })
  expect(pip?.counts).toMatchObject({ turns: 1, failedCalls: 0 })
})

test('debug can tour the hatchlings or the elders, and says which', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('debug hatchling')).toBe(
    'Touring all 18 species as hatchlings with their reactions, then the holidays and moods. Run /buddy debug off to stop.',
  )
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck  $/ })).toBeDefined()
  expect(await run('debug elder')).toMatch(/ as elders with /)
  expect(await run('debug baby')).toMatch(/^Usage: /)
})

// The body rows a sprite should show under its top row, eyes filled and padded as the band pads them.
const bodyBelowHead = (rest: string[], eye: string) => rest.slice(headRow(rest)).map(r => fillEyes(r, eye).padEnd(12))

test('a new buddy is a hatchling, its hat just above its head, and the tour can show the hatchlings', async ($, on) => {
  // 'tint-11' rolls a rare penguin with ° eyes in a wizard hat; with no counts it is a hatchling.
  const clock = world(on, { buddy: { ...RECORD, seed: 'tint-11' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const rest = bodyRows('penguin', 'hatchling', 0)
  const head = headRow(rest)
  const rows = await drawnSprite(ui)
  expect(head).toBeGreaterThan(0)
  expect(rows.slice(0, head).every(r => r.trim() === '')).toBe(true)
  expect(rows[head]).toBe(HAT_ART.wizard.padEnd(12))
  expect(rows.slice(head + 1)).toEqual(bodyBelowHead(rest, '°'))
  // The tour's first step is a plain common duck with · eyes.
  await runner($)('debug hatchling')
  const duck = bodyRows('duck', 'hatchling', 0)
  expect((await drawnSprite(ui)).slice(headRow(duck) + 1)).toEqual(bodyBelowHead(duck, '·'))
})

test('a buddy at level 30 is drawn as its elder, on the band and on the card', async ($, on) => {
  // 8,410 turns are 84,100 XP: level 30. What that earns is already earned, so nothing is announced.
  const elder: Saved = {
    ...ADULT,
    buddies: [{ ...ADULT.buddies[0]!, counts: { ...zeroCounts(), turns: 8_410 } }],
    you: {
      ...ADULT.you,
      earned: {
        grownUp: '2026-10-01T12:00:00.000Z',
        elder: '2026-10-02T12:00:00.000Z',
        thousandTurns: '2026-10-02T12:00:00.000Z',
      },
    },
  }
  const clock = world(on, { buddy: elder })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // 'test-seed' rolls a common ghost with ✦ eyes.
  const rest = bodyRows('ghost', 'elder', 0)
  const body = bodyBelowHead(rest, '✦')
  expect((await drawnSprite(ui)).slice(headRow(rest) + 1)).toEqual(body)
  expect(await cardText($)).toContain(body.join('\n'))
})
