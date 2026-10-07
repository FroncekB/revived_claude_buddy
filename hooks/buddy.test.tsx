import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

// The world beneath the plugin: a clock, a store, the command registry, session
// start, and a stand-in for the engine's own band so a pass-through is visible.
// A null store leaves $.store to the test, which answers store.get and store.set itself.
function world(on: On, store: Record<string, unknown> | null = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  if (store) mock.store(on, store)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
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

test("before hatching, the band is the engine's own", async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  expect(await runner($)('pet')).toBe('No buddy yet. Run /buddy to hatch one.')
})

test('hatching names the buddy and draws it on terminal and desktop', async ($, on) => {
  const clock = world(on)
  model(on, '{"name": "Pip", "personality": "Counts semicolons."}', 'Hello there.')
  await $.session.start(START)
  expect(await runner($)('')).toMatch(/^Pip, a .* hatched\.$/)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'buddy', surface, ...band() })
    expect(await ui.find({ text: /Pip/ })).toBeDefined()
    expect(await ui.find({ text: /Hello there\./ })).toBeDefined()
  }
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

test('card shows name, stats and rerolls', async ($, on) => {
  world(on, { buddy: RECORD })
  await $.session.start(START)
  const card = (await runner($)('card')) ?? ''
  expect(card).toMatch(/^Pip, /)
  expect(card).toMatch(/DEBUGGING/)
  expect(card).toMatch(/Rerolls: 0/)
})

test('reroll asks first, then replaces the buddy and counts the reroll', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This replaces Pip, .* for good\. Run \/buddy reroll confirm\.$/)
  expect(await run('card')).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, a /)
  const card = (await run('card')) ?? ''
  expect(card).toMatch(/^Bix, /)
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

test('a record from a newer schema is never touched', async ($, on) => {
  world(on, { buddy: { schema: 2, seed: 'future' } })
  await $.session.start(START)
  const run = runner($)
  for (const args of ['', 'pet', 'reroll confirm']) {
    expect(await run(args)).toBe('Saved buddy uses schema 2; this mod knows 1.')
  }
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
})

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
  expect(await run('card')).toMatch(/^Pip, /)
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
  expect(await run('card')).toMatch(/^Bix, /)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Bix/ })).toBeDefined()
  await run('mute')
  expect(shared.row).toMatchObject({ seed: 'other-seed', mode: 'muted' })
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
  expect(await run('card')).toMatch(/^Pip, /)
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
