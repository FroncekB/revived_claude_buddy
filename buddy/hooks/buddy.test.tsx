import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Saved } from '../types'
import { SHIMMER } from './layout'
import { zeroCounts } from './ledger'
import { FALLBACK_NAMES } from './voice'

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

// The world beneath the plugin: a clock, a store, the command registry, session
// start, a pane placer, and a stand-in for the engine's own band so a pass-through is visible.
// A null store leaves $.store to the test, which answers store.get and store.set itself.
function world(on: On, store: Record<string, unknown> | null = {}, placesPanes = true, now = 1_000_000) {
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

// A store this test can look into and turn off: one row under `buddy`, as another
// session sharing it would see it.
function sharedStore(on: On, row: unknown) {
  const shared = { row, writes: 0, refuse: false }
  on('store.get', async () => ({ value: shared.row }))
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
  expect(card).toMatch(/Streak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
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
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls$/)
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

// One tour step is a 16-tick animation cycle at 500 ms a tick: 4 s plain, then 4 s shiny.
const HALF_STEP_MS = 4_000

test('the debug tour shows each species plain, then shiny, and never writes the store', async ($, on) => {
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
  expect(await runner($)('debug')).toBe('Touring all 18 species, plain then shiny. Run /buddy debug off to stop.')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const shimmering = async () => (await spriteTexts(ui)).every(t => t.props.bold === true)
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck  $/ })).toBeDefined()
  expect(await shimmering()).toBe(false)
  await clock.advance(HALF_STEP_MS)
  expect(await ui.find({ type: 'Text', text: /tour 1\/18  common duck \(shiny\)  $/ })).toBeDefined()
  expect(await shimmering()).toBe(true)
  await clock.advance(HALF_STEP_MS)
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

test('the tour ends by itself after the last species', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(18 * 2 * HALF_STEP_MS - 500)
  expect(await ui.find({ type: 'Text', text: /tour 18\/18/ })).toBeDefined()
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

// Local noon, so the local date is 2026-10-07 in any time zone.
const NOON = new Date(2026, 9, 7, 12).getTime()

const SAVED: Saved = {
  schema: 2,
  mode: 'on',
  rerolls: 0,
  active: 'test-seed',
  buddies: [{ seed: 'test-seed', soul: RECORD.soul, retiredAt: null, counts: zeroCounts() }],
  you: { lastDay: '2026-10-06', streak: 3, bestStreak: 3, days: 3 },
}

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
