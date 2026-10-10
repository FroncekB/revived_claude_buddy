import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Moment, Saved } from '../types'
import { duckLine, duckPrompt } from './duck'
import { SHIMMER } from './layout'
import { zeroCounts } from './ledger'
import { CRUMBS, EARNED_HAT_ART, HAT_ART, HOLIDAY_HATS, SNACK_ART, bodyRows, fillEyes, headRow } from './sprites'
import { FULL_LINES, PLAY_FALLBACKS, SNACKS, feedPrompt } from './toys'
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

// Answers every $.model.complete with `say`. Returns each call's system and prompt, for a test
// that checks who the persona says the buddy is.
function modelCalls(on: On, say: string): { system: string; prompt: string }[] {
  const calls: { system: string; prompt: string }[] = []
  on('model.complete', async (_$, e) => {
    calls.push({ system: e.system ?? '', prompt: e.prompt })
    return { value: ok(say) }
  })
  return calls
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
  expect(await runner($)('')).toMatch(
    /^Pip, (a (common|rare|legendary)|an (uncommon|epic)) .* hatched\. Not the one\? \/buddy reroll works once, before level 2\.$/,
  )
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
  expect(card).toMatch(/^Streak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17 · Next egg 0 \/ 8,100 xp$/m)
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
  expect(card).toMatch(/\nStreak 1 day \(best 1\) · 0 turns · 0 tool calls\nAchievements: 0 of 17 · Next egg 0 \/ 8,100 xp$/)
})

test('reroll asks first, then replaces the buddy and counts the reroll, once', async ($, on) => {
  world(on, { buddy: RECORD })
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  const run = runner($)
  expect(await run('reroll')).toMatch(/^This replaces Pip, an? \w+ \w+, for good\. Run \/buddy reroll confirm\.$/)
  expect(await cardText($)).toMatch(/Rerolls: 0/)
  expect(await run('reroll confirm')).toMatch(/^Bix, an? [^.]* hatched\.$/)
  const card = await cardText($)
  expect(card).toMatch(/^Bix\b/m)
  expect(card).toMatch(/Rerolls: 1/)
  expect(await run('reroll')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(await run('reroll confirm')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
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

test('the tour ends by itself after its egg hatches', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await runner($)('debug')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await clock.advance(TOUR_TICKS * 500 - 500)
  expect(await ui.find({ type: 'Text', text: /tour: egg hatching/ })).toBeDefined()
  // The tour's egg, shaking, though this buddy carries none.
  expect(await ui.find({ text: /\(\\\/\\\)/ })).toBeDefined()
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

test('the mulligan replaces buddy #1 in place, adding nobody to the dex', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  model(on, '{"name": "Bix", "personality": "New here."}', 'Hi.')
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toMatch(/^Bix, an? /)
  const saved = shared.row as Saved
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Bix'])
  expect(saved.buddies[0]?.retiredAt).toBeNull()
  expect(saved).toMatchObject({ active: saved.buddies[0]?.seed, rerolls: 1, mode: 'on' })
})

test('a mulligan whose window another session shut writes nothing and says so', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  world(on, null)
  on('model.complete', async () => {
    // Another session rerolls while this one waits for the model.
    shared.row = { ...RECORD, rerolls: 1 }
    return { value: ok('{"name": "Bix", "personality": "New here."}') }
  })
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toBe('No more rerolls. Your next egg comes in 8,100 xp.')
  expect(shared.row).toMatchObject({ rerolls: 1, seed: 'test-seed' })
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
})

test('a hatch that finds another session hatched first keeps that buddy', async ($, on) => {
  const shared = sharedStore(on, undefined)
  world(on, null)
  on('model.complete', async () => {
    shared.row = { ...RECORD, soul: { ...RECORD.soul, name: 'Rex' } }
    return { value: ok('{"name": "Bix", "personality": "New here."}') }
  })
  await $.session.start(START)
  expect(await runner($)('')).toBe('Rex is already here.')
  expect(shared.writes).toBe(0)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /Rex/ })).toBeDefined()
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

test('a turn that carries your XP to 8,100 starts an egg', async ($, on) => {
  // RECORD's buddy one turn short of 8,100 XP, with no egg started yet.
  const near: Saved = {
    ...SAVED,
    you: { ...SAVED.you, eggs: 0 },
    buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }],
  }
  const shared = sharedStore(on, near)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  const saved = shared.row as Saved
  expect(saved.you.eggs).toBe(1)
  expect(saved.egg).toMatchObject({ fromTurns: 810 })
  expect(typeof saved.egg?.seed).toBe('string')
  expect(await runner($)('reroll')).toBe('No more rerolls. An egg is on the way: 0 of 150 turns.')
})

test('a record from before eggs has its mulligan spent, and its first save starts the egg clock', async ($, on) => {
  // 2,000 turns is 20,000 XP: two eggs' worth, none owed.
  const old: Saved = { ...SAVED, rerolls: 2, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 2_000 } }] }
  const shared = sharedStore(on, old)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  model(on, null, null)
  await $.session.start(START)
  expect(await runner($)('reroll confirm')).toBe('No more rerolls. Your next egg comes in 4,300 xp.')
  await $.turn.complete(TURN)
  await clock.settle()
  expect((shared.row as Saved).you.eggs).toBe(2)
  expect((shared.row as Saved).egg).toBeUndefined()
})

// RECORD's buddy at 959 turns, carrying an egg one turn from its hatch, already visited today so
// no streak greeting takes the bubble.
const NEARLY_HATCHED: Saved = {
  ...SAVED,
  you: { ...SAVED.you, lastDay: '2026-10-07', eggs: 1, earned: { grownUp: '2026-10-01T12:00:00.000Z' } },
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 959 } }],
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 810 },
}

// Answers $.model.complete, keeping the hatch calls apart from the rest: a hatch gets `soul`.
function hatchCalls(on: On, soul: string, onHatch: () => void = () => undefined) {
  const calls = { hatch: [] as string[], other: [] as string[] }
  on('model.complete', async (_$, e) => {
    if (e.system?.includes('JSON only')) {
      calls.hatch.push(e.prompt)
      onHatch()
      return { value: ok(soul) }
    }
    calls.other.push(e.prompt)
    return { value: failed() }
  })
  return calls
}

test('the turn that carries the egg to 150 hatches it into the dex, and the buddy here stays', async ($, on) => {
  const shared = sharedStore(on, NEARLY_HATCHED)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await clock.settle()
  expect(calls.hatch).toHaveLength(0)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  const saved = shared.row as Saved
  expect(saved.egg).toBeUndefined()
  expect(saved.active).toBe('test-seed')
  expect(saved.buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
  expect(saved.buddies[1]?.retiredAt).toBe(saved.buddies[1]?.soul.hatchedAt)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toMatch(/^The egg hatched! Meet Sprout, an? [a-z ]+\. Run \/buddy swap Sprout\.$/)
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
  // No hello: the hatchling isn't here.
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
})

test('a muted hatch celebrates without a bubble', async ($, on) => {
  const shared = sharedStore(on, { ...NEARLY_HATCHED, mode: 'muted' })
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies).toHaveLength(2)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('')
})

test('an egg another session hatched first is not hatched again, and nothing is announced', async ($, on) => {
  const shared = sharedStore(on, NEARLY_HATCHED)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  // The other session's hatch lands while this one waits for the model.
  const theirs = () => {
    const now = shared.row as Saved
    const { egg: _, ...rest } = now
    const rex = { ...now.buddies[0]!, seed: 'egg-seed', soul: { ...now.buddies[0]!.soul, name: 'Rex' } }
    shared.row = { ...rest, buddies: [...now.buddies, rex] }
  }
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}', theirs)
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Rex'])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('')
})

test('an egg left due hatches when a session starts', async ($, on) => {
  const due: Saved = { ...NEARLY_HATCHED, buddies: [{ ...NEARLY_HATCHED.buddies[0]!, counts: { ...zeroCounts(), turns: 960 } }] }
  const shared = sharedStore(on, due)
  const clock = world(on, null)
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect((shared.row as Saved).buddies.map(b => b.soul.name)).toEqual(['Pip', 'Sprout'])
})

// Five in the dex: Pip, here, and Mochi, retired, adults at 810 turns each, and three hatchlings;
// an egg 149 turns along with no parents yet.
const ADULT_COUNTS = { ...zeroCounts(), turns: 810 }
const BROODY: Saved = {
  ...SAVED,
  you: { ...SAVED.you, lastDay: '2026-10-07', eggs: 2, earned: { grownUp: '2026-10-01T12:00:00.000Z', collector: '2026-10-01T12:00:00.000Z' } },
  buddies: [
    { ...SAVED.buddies[0]!, counts: ADULT_COUNTS },
    { seed: 'swap-1', soul: { ...RECORD.soul, name: 'Mochi', personality: 'Naps on the stack.' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: ADULT_COUNTS },
    { seed: 'young-1', soul: { ...RECORD.soul, name: 'Nib' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
    { seed: 'young-2', soul: { ...RECORD.soul, name: 'Dot' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
    { seed: 'young-3', soul: { ...RECORD.soul, name: 'Moss' }, retiredAt: '2026-10-05T12:00:00.000Z', counts: zeroCounts() },
  ],
  egg: { seed: 'egg-seed', startedAt: '2026-10-05T12:00:00.000Z', fromTurns: 1_471 },
}

test('the band carries the egg in a gutter beside the buddy, on the terminal and the desktop', async ($, on) => {
  world(on, { buddy: BROODY })
  model(on, null, 'Hi.')
  await $.session.start(START)
  const terminal = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  // 149 of 150 turns: cracked.
  expect(await terminal.find({ text: /\(\\\/\\\)/ })).toBeDefined()
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...band(10, 80) })
  expect(String((await desktop.find({ type: 'Svg' }))?.props.source)).toContain('.-.')
  // The compact band has no room for it.
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  expect(await short.find({ text: /\.-\./ })).toBeUndefined()
})

test('an egg that cannot be drawn costs only the egg, never the band', async ($, on) => {
  world(on, { buddy: BROODY })
  // Once the session has started, the egg's hatching flag can't be read.
  let broken = false
  on('state.get', { plugin: 'buddy', key: 'eggHatching' }, async (_$, e, next) =>
    broken ? { deny: 'state offline' } : next(e),
  )
  await $.session.start(START)
  broken = true
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /Pip/ })).toBeDefined()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('a swap mid-egg keeps the egg in the band, and the buddy swapped in carries it to its hatch', async ($, on) => {
  const shared = sharedStore(on, BROODY)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Fresh out."}')
  await $.session.start(START)
  expect(await runner($)('swap mochi')).toBe('Mochi is back.')
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /\.-\./ })).toBeDefined()
  // Mochi's turn is the 150th since the egg started.
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  const saved = shared.row as Saved
  expect(saved.active).toBe('swap-1')
  expect(saved.buddies.at(-1)?.soul.name).toBe('Sprout')
})

test('with no egg out the band has no gutter', async ($, on) => {
  const { egg: _, ...none } = BROODY
  world(on, { buddy: none })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test('the egg shakes, cracked, while its soul call is out', async ($, on) => {
  const due: Saved = { ...BROODY, egg: { ...BROODY.egg!, fromTurns: 1_400 } }
  const clock = world(on, { buddy: due })
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  for (let i = 0; i < 20; i++) await clock.advance(0)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(10, 80) })
  // The egg's middle row; the ghost's hem zigzags too, but never inside brackets.
  const middle = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').find(text => text.includes('(\\/\\)'))
  const first = await middle()
  await clock.advance(500)
  expect(await middle()).not.toBe(first)
  release()
  await clock.settle()
  expect(await ui.find({ text: /\.-\./ })).toBeUndefined()
})

test("the text card folds in a bred buddy's parents and the egg on its way, within 12 lines", async ($, on) => {
  const sprout = {
    seed: 'young-4',
    soul: { ...RECORD.soul, name: 'Sprout', hatchedAt: '2026-10-06T12:00:00.000Z' },
    retiredAt: '2026-10-06T12:00:00.000Z',
    counts: zeroCounts(),
    parents: ['test-seed', 'swap-1'] as [string, string],
  }
  const saved: Saved = { ...BROODY, buddies: [...BROODY.buddies, sprout] }
  world(on, { buddy: saved }, false)
  await $.session.start(START)
  const run = runner($)
  const card = (await run('card sprout')) ?? ''
  expect(card.split('\n').length).toBeLessThanOrEqual(12)
  expect(card).toMatch(/^Hatched 2026-10-06 from #1 Pip and #2 Mochi   Rerolls: 0$/m)
  expect(card).toContain('Achievements: 2 of 17 · Egg 149 / 150 turns')
  expect(await run('dex')).toContain('Sprout        Lv 1 hatchling')
  expect(await run('dex')).toContain('hatched Oct 6')
})

test('breed is refused below five in the dex, with the count to go', async ($, on) => {
  world(on, { buddy: TWO })
  await $.session.start(START)
  expect(await runner($)('breed pip')).toBe('Breeding unlocks at 5 buddies in the dex: 3 to go.')
})

test('breed sets the parents with no model call, and the hatch hears about both', async ($, on) => {
  const shared = sharedStore(on, BROODY)
  const clock = world(on, null)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const calls = hatchCalls(on, '{"name": "Sprout", "personality": "Takes after both."}')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  expect(await run('breed mochi')).toBe('Pip and Mochi are brooding the egg. It hatches in 1 turn.')
  expect(calls.hatch.length + calls.other.length).toBe(0)
  expect((shared.row as Saved).egg?.parents).toEqual(['test-seed', 'swap-1'])
  expect(await run('breed mochi')).toBe('Pip and Mochi are already brooding this egg.')
  await $.turn.complete(TURN)
  await clock.settle()
  expect(calls.hatch).toHaveLength(1)
  expect(calls.hatch[0]).toContain('Parents: Pip, ')
  expect(calls.hatch[0]).toContain(', and Mochi, ')
  expect(calls.hatch[0]).toContain('("Naps on the stack.")')
  const saved = shared.row as Saved
  expect(saved.buddies.at(-1)).toMatchObject({ soul: { name: 'Sprout' }, parents: ['test-seed', 'swap-1'] })
})

test('breed while the egg is hatching is told to wait', async ($, on) => {
  const due: Saved = { ...BROODY, egg: { ...BROODY.egg!, fromTurns: 1_470 } }
  const clock = world(on, { buddy: due })
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  for (let i = 0; i < 20; i++) await clock.advance(0)
  expect(await runner($)('breed mochi')).toBe('The egg is hatching.')
  release()
  await clock.settle()
})

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
  ['a feed', $ => runner($)('feed')],
  ['a game', $ => runner($)('play dice')],
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
  // Errored turns with no calls: each gets a quip, and none echoes a kind of memory. Four minutes
  // apart they are one long stretch, so the turns 92 and 184 minutes in get a break nudge instead.
  for (let i = 0; i < 60; i++) {
    await $.turn.complete({ ...TURN, turnId: `t${i}`, reason: 'error' })
    await clock.settle()
    await clock.advance(4 * 60_000)
  }
  expect(prompts).toHaveLength(58)
  // At 0.30, no memory in 58 quips comes about once in a billion runs, and one in all 58 never.
  const remembered = prompts.filter(p => p.includes('\nA memory (')).length
  expect(remembered).toBeGreaterThan(0)
  expect(remembered).toBeLessThan(58)
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

test('a quip hears the stats the buddy grew into, too', async ($, on) => {
  const clock = world(on, { buddy: ELDERLY })
  engineBelow(on)
  const asked: { prompt: string; system: string }[] = []
  on('model.complete', async (_$, e) => {
    asked.push({ prompt: e.prompt, system: e.system ?? '' })
    return { value: ok('Hm.') }
  })
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete(TURN)
  await clock.settle()
  const quip = asked.find(a => a.prompt.startsWith('Claude just finished a turn'))
  expect(quip?.system).toContain('Stats: DEBUGGING 34, PATIENCE 34, CHAOS 34, WISDOM 59, SNARK 34.')
})

// SAVED's buddy one turn short of level 10, on its first visit, so no streak greeting takes the bubble.
const NEARLY: Saved = {
  ...SAVED,
  buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), turns: 809 } }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0 },
}
const CONFETTI_ROWS = [' *  .  *  . ', ' .  *  .  * ']
// Its 8,100 XP also earn the first egg (Breeding spec section 2).
const NEWS_10 = 'Level 10! I grew into an adult. An egg! It hatches in 150 turns. Earned Grown up.'

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

test('a quip that comes back over an announcement is dropped; a pet reply follows it', async ($, on) => {
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
  expect(await bubbleOf(ui)).toBe(`${NEWS_10} Nice.`)
})

test('once an announcement has gone, a quip shows again', async ($, on) => {
  const clock = world(on, { buddy: NEARLY })
  engineBelow(on)
  model(on, null, 'Nice.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // Aborted turns are notable, so each asks for a quip, and no failed call can put up a fail line.
  await $.turn.complete({ ...TURN, reason: 'aborted' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  // Past the bubble and the quip cooldown: 180 s, and 1.8 s for each of Pip's 30 PATIENCE.
  await clock.advance(300_000)
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'aborted' })
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Nice.')
})

test('a pet that earns Good friend says so, then answers, in one bubble', async ($, on) => {
  const fond: Saved = { ...SAVED, buddies: [{ ...SAVED.buddies[0]!, counts: { ...zeroCounts(), pets: 99 } }] }
  const clock = world(on, { buddy: fond })
  model(on, null, 'Purr.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await runner($)('pet')
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Earned Good friend, and a flower crown. Purr.')
})

test('an announcement shows even when its save fails', async ($, on) => {
  const shared = sharedStore(on, NEARLY)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  expect(activeOf(shared.row)?.counts.turns).toBe(809)
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
  expect(text).toMatch(/\nAchievements: 2 of 17 · Next egg 4,000 \/ 8,100 xp\nMarathon · Grown up$/)
  const desktop = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toContain(
    '. Level 12, adult, 12,100 of 14,400 XP. 2 of 17 achievements: Marathon, Grown up. Next egg at 4,000 of 8,100 XP. Hatched',
  )
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

test('a swap while the egg is out is told to wait, and swaps nobody', async ($, on) => {
  // The mulligan is the one hatch a record can still make (Breeding spec section 2).
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const run = runner($)
  const rerolled = run('reroll confirm')
  for (let i = 0; i < 100 && !(await ui.find({ text: /hatching/ })); i++) await Promise.resolve()
  expect(await run('swap pip')).toBe('Wait for the egg to hatch.')
  release()
  await rerolled
  await clock.settle()
  // Only the mulligan wrote: the dex is its one new buddy.
  const saved = shared.row as Saved
  expect(saved.buddies).toHaveLength(1)
  expect(saved.active).not.toBe('test-seed')
})

test('a swap ends a running tour, so the buddy back is drawn as itself', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  await run('debug')
  expect(await run('swap pip')).toBe('Pip is back.')
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: /tour/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 1  common dragon  ' })).toBeDefined()
})

test("a swap clears the bubble, so the hello never follows the last buddy's news", async ($, on) => {
  // TWO, with Mochi one turn short of level 10 and no visit yet, so no greeting takes the bubble.
  const nearlyTwo: Saved = {
    ...TWO,
    buddies: [TWO.buddies[0]!, { ...TWO.buddies[1]!, counts: { ...zeroCounts(), turns: 809 } }],
    you: NEARLY.you,
  }
  const clock = world(on, { buddy: nearlyTwo })
  engineBelow(on)
  model(on, null, 'Missed you.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await bubbleOf(ui)).toBe(NEWS_10)
  expect(await runner($)('swap pip')).toBe('Pip is back.')
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('Missed you.')
})

test('a swap the store will not take lasts the session, and still says hello', async ($, on) => {
  const shared = sharedStore(on, TWO)
  const clock = world(on, null)
  const prompts = model(on, null, 'Missed you.')
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  expect(await runner($)('swap pip')).toBe('Could not save your buddy; it lives for this session only.')
  await clock.settle()
  expect(activeOf(shared.row)?.seed).toBe('swap-2')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ type: 'Text', text: '  Pip  Lv 1  common dragon  ' })).toBeDefined()
  expect(await bubbleOf(ui)).toBe('Missed you.')
  expect(prompts.filter(p => p.includes('called you over'))).toHaveLength(1)
})

test('a swap onto a record another session made unreadable is refused, and nobody says hello', async ($, on) => {
  let row: unknown = TWO
  let laterReadsForeign = false
  on('store.get', async () => {
    const value = row
    if (laterReadsForeign) row = { schema: 3 }
    return { value }
  })
  on('store.set', async (_$, e) => {
    row = e.value
    return { value: undefined }
  })
  const clock = world(on, null)
  const prompts = model(on, null, 'Missed you.')
  await $.session.start(START)
  await clock.settle()
  // A newer build writes its record between the command's read and the swap's.
  laterReadsForeign = true
  expect(await runner($)('swap pip')).toBe('Saved buddy uses schema 3; this mod knows 1 and 2.')
  await clock.settle()
  expect(row).toEqual({ schema: 3 })
  expect(prompts).toEqual([])
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

test('a plain debug after an elder tour tours the adults again', async ($, on) => {
  const clock = world(on, { buddy: RECORD })
  await $.session.start(START)
  await clock.settle()
  const run = runner($)
  await run('debug elder')
  expect(await run('debug')).toMatch(/ as adults with /)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const duck = bodyRows('duck', 'adult', 0)
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

test('a rename is saved and answered, and the buddy then answers to its new name only', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  engineBelow(on)
  const calls = modelCalls(on, 'Mochi it is.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('rename Mochi')).toBe('Pip is now Mochi.')
  await clock.settle()
  expect(activeOf(shared.row)?.soul.name).toBe('Mochi')
  expect(calls.map(c => c.prompt)).toEqual(['The developer just renamed you from Pip to Mochi. React in one line.'])
  // The reply comes from the buddy under its new name.
  expect(calls[0]?.system).toMatch(/^You are Mochi, /)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Mochi it is.')
  expect(await ui.find({ text: /^ {2}Mochi {2}Lv 1 / })).toBeDefined()
  expect(await $.prompt.submit({ text: 'Mochi, hi', wait: false, origin: { kind: 'composer' } })).toEqual({
    drop: '(to Mochi)',
  })
  expect(await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })).toMatchObject({
    text: 'Pip, hi',
  })
})

test('a rename the name rules refuse says why and writes nothing; a hidden buddy is not renamed', async ($, on) => {
  const shared = sharedStore(on, SAVED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Hi.')
  await $.session.start(START)
  await clock.settle()
  const writes = shared.writes
  expect(await runner($)('rename Sir Pip')).toBe('A name is one word of letters, at most 12.')
  expect(await runner($)('rename claude')).toBe('claude starts too many prompts to be a name.')
  expect(await runner($)('rename Pip')).toBe('Pip is already its name.')
  expect(await runner($)('rename')).toMatch(/^Usage: /)
  await clock.settle()
  expect(shared.writes).toBe(writes)
  await runner($)('off')
  expect(await runner($)('rename Mochi')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(activeOf(shared.row)?.soul.name).toBe('Pip')
  expect(prompts).toEqual([])
})

// 'hat-10' rolls an uncommon capybara in a crown. Good friend has earned the flower crown. A first
// visit, so no streak greeting takes the bubble.
const CROWNED: Saved = {
  ...SAVED,
  active: 'hat-10',
  buddies: [{ ...SAVED.buddies[0]!, seed: 'hat-10' }],
  you: { lastDay: null, streak: 0, bestStreak: 0, days: 0, earned: { goodFriend: '2026-10-01T12:00:00.000Z' } },
}

test('a hat you have earned is saved and worn in the band, on the card and in the dex', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Fancy.')
  await $.session.start(START)
  await clock.settle()
  expect(await runner($)('hat')).toBe('Pip is wearing a crown. It can wear: crown, flowercrown, none.')
  expect(await runner($)('hat flower crown')).toBe('Pip is wearing a flower crown.')
  await clock.settle()
  expect(activeOf(shared.row)?.hat).toBe('flowercrown')
  expect(prompts).toEqual(['The developer just put a flower crown on you. React in one line.'])
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await bubbleOf(ui)).toBe('Fancy.')
  const sprite = (await drawnSprite(ui)).join('\n')
  expect(sprite).toContain(EARNED_HAT_ART.flowercrown)
  expect(sprite).not.toContain(HAT_ART.crown)
  expect(await cardText($)).toContain('Hat: flowercrown')
  const card = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...pane() })
  expect(String((await card.find({ type: 'Svg' }))?.props.source)).toContain('>Flower crown<')
  expect(await runner($)('dex')).toBeUndefined()
  const dex = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', ...dexPane() })
  expect(String((await dex.find({ type: 'Svg' }))?.props.source)).toContain(EARNED_HAT_ART.flowercrown)
  expect(await runner($)('hat none')).toBe('Pip took its hat off.')
  await clock.settle()
  expect(activeOf(shared.row)?.hat).toBe('none')
})

test('a hat not earned, or rolled by another buddy, is refused with the reason and nothing is saved', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Fancy.')
  await $.session.start(START)
  await clock.settle()
  const writes = shared.writes
  expect(await runner($)('hat hardhat')).toBe('Earn Shell regular to unlock a hard hat.')
  expect(await runner($)('hat halo')).toBe('Only a buddy that rolled a halo can wear one.')
  expect(await runner($)('hat crown')).toBe('Pip is already wearing a crown.')
  expect(await runner($)('hat jetpack')).toBe('No hat called jetpack. Pip can wear: crown, flowercrown, none.')
  await clock.settle()
  expect(shared.writes).toBe(writes)
  expect(prompts).toEqual([])
})

test('on a holiday the band wears the holiday hat and the card keeps the hat it chose', async ($, on) => {
  const chose: Saved = { ...CROWNED, buddies: [{ ...CROWNED.buddies[0]!, hat: 'flowercrown' }] }
  const clock = world(on, { buddy: chose }, true, JULY4_NOON)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const sprite = (await drawnSprite(ui)).join('\n')
  expect(sprite).toContain(HOLIDAY_HATS.july4!)
  expect(sprite).not.toContain(EARNED_HAT_ART.flowercrown)
  expect(await cardText($)).toContain('Hat: flowercrown')
})

test('a saved hat the buddy cannot wear, from an old or edited record, draws the hat it rolled', async ($, on) => {
  const odd: Saved = { ...CROWNED, buddies: [{ ...CROWNED.buddies[0]!, hat: 'laurel' }] }
  const clock = world(on, { buddy: odd })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect((await drawnSprite(ui)).join('\n')).toContain(HAT_ART.crown)
})

test('a rename or a hat the store will not take lasts the session, and is still answered', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const calls = modelCalls(on, 'Noted.')
  await $.session.start(START)
  await clock.settle()
  shared.refuse = true
  expect(await runner($)('rename Mochi')).toBe('Could not save your buddy; it lives for this session only.')
  await clock.settle()
  expect(activeOf(shared.row)?.soul.name).toBe('Pip')
  expect(calls.map(c => c.prompt)).toEqual(['The developer just renamed you from Pip to Mochi. React in one line.'])
  expect(calls[0]?.system).toMatch(/^You are Mochi, /)
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await ui.find({ text: /^ {2}Mochi {2}Lv 1 / })).toBeDefined()
  // Past the reply floor, so the hat's answer asks the model too.
  await clock.advance(6_000)
  expect(await runner($)('hat flower crown')).toBe('Could not save your buddy; it lives for this session only.')
  await clock.settle()
  expect(activeOf(shared.row)?.hat).toBeUndefined()
  expect(calls.at(-1)?.prompt).toBe('The developer just put a flower crown on you. React in one line.')
  expect((await drawnSprite(ui)).join('\n')).toContain(EARNED_HAT_ART.flowercrown)
})

test('a feed shows its snack, then crumbs, counts as a pet and asks once; fed again soon, the buddy is full', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Crunchy.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await runner($)('feed')).toBeUndefined()
  await clock.settle()
  const snack = SNACKS.find(s => prompts[0] === feedPrompt(s))
  expect(snack).toBeDefined()
  expect((await drawnSprite(ui)).join('\n')).toContain(SNACK_ART[snack!])
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  expect(await bubbleOf(ui)).toBe('Crunchy.')
  await clock.advance(1_500)
  expect((await drawnSprite(ui)).join('\n')).toContain(CRUMBS)
  await clock.advance(1_000)
  expect((await drawnSprite(ui)).join('\n')).toContain(HAT_ART.crown)
  // Fed again inside 10 minutes: a canned no-thanks, nothing counted, no model call.
  expect(await runner($)('feed')).toBeUndefined()
  await clock.settle()
  expect(FULL_LINES).toContain(await bubbleOf(ui))
  expect(prompts).toHaveLength(1)
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  await clock.advance(10 * 60_000)
  await runner($)('feed')
  await clock.settle()
  expect(prompts).toHaveLength(2)
  expect(activeOf(shared.row)?.counts.pets).toBe(2)
})

test('a hidden buddy is not fed', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, mode: 'off' } })
  const prompts = model(on, null, 'Crunchy.')
  await $.session.start(START)
  expect(await runner($)('feed')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(prompts).toEqual([])
})

test('a game answers its result at once, counts as a pet and asks once; inside 5 s its fallback is about the game', async ($, on) => {
  const shared = sharedStore(on, CROWNED)
  const clock = world(on, null)
  const prompts = model(on, null, 'Rematch.')
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  expect(await runner($)('play rps rock')).toMatch(
    /^(You threw rock; Pip threw (paper|scissors)\. (Pip wins|You win)\.|You both threw rock\. A draw\.)$/,
  )
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toMatch(/^You just played rock-paper-scissors with the developer: they threw rock, you threw \w+\. /)
  expect(prompts[0]).toMatch(/\. (You won|They won|A draw)\. React in one line\.$/)
  expect(activeOf(shared.row)?.counts.pets).toBe(1)
  expect(await bubbleOf(ui)).toBe('Rematch.')
  expect(await runner($)('play coin')).toMatch(/^Pip called (heads|tails)\. (Heads|Tails)\. (Pip wins|You win)\.$/)
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(Object.values(PLAY_FALLBACKS).flat()).toContain(await bubbleOf(ui))
  expect(activeOf(shared.row)?.counts.pets).toBe(2)
})

// Math.random can't be stubbed in a test, so this plays until it has seen a win and a game that
// wasn't one. The buddy wins a game of dice 15 times in 36, so 40 games miss either about once in
// a few billion runs.
test('the buddy celebrates a game it wins, and only one it wins', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const seen = new Set<boolean>()
  for (let i = 0; i < 40 && seen.size < 2; i++) {
    const won = ((await runner($)('play dice')) ?? '').endsWith('Pip wins.')
    await clock.settle()
    const sprite = (await drawnSprite(ui)).join('\n')
    expect([i, CONFETTI_ROWS.some(row => sprite.includes(row))]).toEqual([i, won])
    seen.add(won)
    // Past the celebration's 3 seconds.
    await clock.advance(4_000)
  }
  expect(seen.size).toBe(2)
})

test('a hidden buddy does not play', async ($, on) => {
  const clock = world(on, { buddy: { ...SAVED, mode: 'off' } })
  const prompts = model(on, null, 'Rematch.')
  await $.session.start(START)
  expect(await runner($)('play')).toBe('Pip is hidden. Run /buddy to bring it back.')
  await clock.settle()
  expect(prompts).toEqual([])
})

test('a feed, game, rename or hat while the egg is out is told to wait, and changes nobody', async ($, on) => {
  const shared = sharedStore(on, RECORD)
  const clock = world(on, null)
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('model.complete', async () => {
    await gate
    return { value: failed() }
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const run = runner($)
  const rerolled = run('reroll confirm')
  for (let i = 0; i < 100 && !(await ui.find({ text: /hatching/ })); i++) await Promise.resolve()
  for (const args of ['feed', 'play dice', 'rename Rex', 'hat none']) {
    expect([args, await run(args)]).toEqual([args, 'Wait for the egg to hatch.'])
  }
  release()
  await rerolled
  await clock.settle()
  // Nobody was renamed, dressed, fed or played with.
  const buddies = (shared.row as Saved).buddies
  const changed = buddies.filter(b => b.soul.name === 'Rex' || b.hat !== undefined || b.counts.pets > 0)
  expect(changed).toEqual([])
})

// A main turn `minutes` long, ending now.
const turnOf = (minutes: number, turnId = 't1') => ({ ...TURN, turnId, durationMs: minutes * 60_000 })
// Every break line opens with a yawn, and nothing else the buddy says does.
const isBreakLine = (text: string) => text.startsWith('*yawn* ')
// The bubble's words now, from a band mounted just to look: a band left mounted redraws on every
// tick, which makes an advance of an hour or more slow.
async function saidNow($: Engine): Promise<string> {
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const said = await bubbleOf(ui)
  await ui.unmount()
  return said
}
// CROWNED, with Marathon and Ultramarathon already earned, so a long turn announces nothing.
const EARNED_AT = '2026-10-01T12:00:00.000Z'
const LONG_DONE: Saved = {
  ...CROWNED,
  you: { ...CROWNED.you, earned: { goodFriend: EARNED_AT, marathon: EARNED_AT, ultramarathon: EARNED_AT } },
}

test('after 90 minutes of turns with no long gap the buddy yawns and suggests a break, in place of a quip', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  const prompts = model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  const face = async () => (await short.findAll({ type: 'Text' }))[0]?.text ?? ''
  // 85 minutes: not yet.
  await $.turn.complete(turnOf(85))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  // A 4-minute gap, then 1 more: 90 minutes since the stretch began.
  await clock.advance(5 * 60_000)
  const asked = prompts.length
  await $.turn.complete(turnOf(1, 't2'))
  await clock.settle()
  const said = await bubbleOf(ui)
  expect(isBreakLine(said)).toBe(true)
  expect(said).toContain('90 minutes')
  expect(prompts).toHaveLength(asked)
  // 'hat-10' rolls a capybara with · eyes: closed for the yawn, with no zZ, then open again.
  expect(await face()).toMatch(/^\(-oo-\) {2}Pip/)
  expect(await face()).not.toContain('zZ')
  await clock.advance(2_000)
  expect(await face()).toMatch(/^\(·oo·\) {2}Pip/)
})

test('a gap of more than 10 minutes starts the stretch over', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  // 85 minutes, then 11 minutes away: the 96 minutes since it began are two stretches.
  await $.turn.complete(turnOf(85))
  await clock.advance(11 * 60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
})

test('a stretch that runs on is nudged again 90 minutes after the last nudge, and not before', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // One turn of 90 minutes is due at its end.
  await $.turn.complete(turnOf(90))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
  await clock.advance(30 * 60_000)
  await $.turn.complete(turnOf(29, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(false)
  await clock.advance(60 * 60_000)
  await $.turn.complete(turnOf(59, 't3'))
  await clock.settle()
  const said = await saidNow($)
  expect(isBreakLine(said)).toBe(true)
  expect(said).toContain('3 hours')
})

test('a break due while muted waits, and comes at the first turn end after unmuting', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  await runner($)('mute')
  await $.turn.complete(turnOf(95))
  await clock.settle()
  expect(await bubbleOf(ui)).toBe('')
  await runner($)('unmute')
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await bubbleOf(ui))).toBe(true)
})

test('a break due on a turn whose slow save announces something waits for the announcement, and stays due', async ($, on) => {
  // CROWNED has earned no long turn yet, so a 90-minute one announces Marathon and Ultramarathon.
  const store = heldStore(on, CROWNED)
  const clock = world(on, null)
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  // The turn's save is held at the store while its break comes due.
  store.shared.held = true
  await $.turn.complete(turnOf(90))
  await clock.settle()
  await idle()
  store.release()
  await clock.settle()
  // The announcement has the bubble, and the nudge was not spent on a line it replaced.
  const news = await saidNow($)
  expect(news).toContain('Marathon')
  expect(isBreakLine(news)).toBe(false)
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
})

test('a break due while a reply is at the model stays due, and comes at the next turn end', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    await gate
    return { value: ok('Purr.') }
  })
  await $.session.start(START)
  await clock.settle()
  // A pet's reply is out at the model when the 90-minute turn ends: the line it will land is
  // not to be spent on a break line.
  await runner($)('pet')
  await clock.advance(10)
  for (let i = 0; i < 100 && prompts.length === 0; i++) await Promise.resolve()
  expect(prompts).toHaveLength(1)
  await $.turn.complete(turnOf(90))
  await clock.advance(10)
  await idle()
  release()
  await clock.settle()
  expect(await saidNow($)).toBe('Purr.')
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
})

test("a break's yawn never cuts the turn's flinch short: the break line shows under the flinch", async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, null)
  await $.session.start(START)
  await clock.settle()
  const short = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band(3, 80) })
  const face = async () => (await short.findAll({ type: 'Text' }))[0]?.text ?? ''
  // A 90-minute turn that errored: it flinches, and its break comes due.
  await $.turn.complete({ ...turnOf(90), reason: 'error' as const })
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
  // 'hat-10' rolls a capybara: wide-eyed for the flinch, not closed for a yawn.
  expect(await face()).toMatch(/^\(OooO\) {2}Pip/)
})

const OFFER = 'Want to talk it through?'
// The rubber duck's yellow body in the band's prop column.
const duckDrawn = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', ...band() })
  const body = await ui.find({ type: 'Text', text: /^\(\.\)__$/ })
  await ui.unmount()
  return body?.props.color === 'yellow'
}
const fail = async ($: Engine, times: number) => {
  for (let i = 0; i < times; i++) await $.tool.call({ tool: 'Bash', command: 'false' })
}

test('a tool that fails 3 times across two turns gets one rubber-duck offer in place of a quip, then the duck stands by', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const quips = () => prompts.filter(p => p.startsWith('Claude just finished a turn'))
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  await fail($, 2)
  await $.turn.complete(TURN)
  await clock.settle()
  expect([quips().length, offers().length]).toEqual([1, 0])
  // Past the quip cooldown, so this turn would quip if the offer didn't take its place.
  await clock.advance(7 * 60_000)
  await fail($, 1)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3)])
  expect(quips()).toHaveLength(1)
  expect(await saidNow($)).toBe(OFFER)
  expect(await duckDrawn($)).toBe(false)
  // Once the bubble has gone, the duck stands beside the buddy until duck mode runs out.
  await clock.advance(13_000)
  expect(await duckDrawn($)).toBe(true)
  await clock.advance(15 * 60_000)
  expect(await duckDrawn($)).toBe(false)
})

test('an offer the model leaves unanswered is canned; talk inside duck mode is rubber-ducked and keeps it going', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    return { value: e.prompt.startsWith('Claude just failed') ? failed() : ok('Walk me through it.') }
  })
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await saidNow($)).toBe('3 failed Bash calls. Want to talk it through? Start with "Pip,".')
  const talk = async () => {
    await $.prompt.submit({ text: 'Pip, the build keeps failing', wait: false, origin: { kind: 'composer' } })
    await clock.settle()
    return prompts.at(-1) ?? ''
  }
  // 10 minutes on, a talk carries the duck line and keeps duck mode 15 minutes from then.
  await clock.advance(10 * 60_000)
  expect(await talk()).toContain(duckLine('Bash'))
  await clock.advance(14 * 60_000)
  expect(await talk()).toContain(duckLine('Bash'))
  // 16 minutes after the last talk, it has run out.
  await clock.advance(16 * 60_000)
  expect(await talk()).not.toContain('rubber duck')
})

test('a second run of failures inside 30 minutes gets no offer; one after 30 does', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  const quips = () => prompts.filter(p => p.startsWith('Claude just finished a turn'))
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(offers()).toHaveLength(1)
  await clock.advance(10 * 60_000)
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(offers()).toHaveLength(1)
  // The offer it couldn't make leaves the slot to a quip, past the cooldown and with failures to note.
  expect(quips()).toHaveLength(1)
  // Not nudged, the last turn's 3 count with this one's.
  await clock.advance(21 * 60_000)
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't3' })
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3), duckPrompt('Pip', 'Bash', 6)])
})

test('a muted or hidden buddy makes no offer and calls no model', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await runner($)('mute')
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  await runner($)('off')
  await fail($, 3)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(prompts).toEqual([])
})

test('a swap ends duck mode: the buddy back gets no duck line', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts.filter(p => p.startsWith('Claude just failed'))).toEqual([duckPrompt('Mochi', 'Bash', 3)])
  expect(await runner($)('swap Pip')).toBe('Pip is back.')
  await clock.advance(60_000)
  await $.prompt.submit({ text: 'Pip, hi', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(prompts.at(-1)).toContain('The developer says to you: hi')
  expect(prompts.at(-1)).not.toContain('rubber duck')
  expect(await duckDrawn($)).toBe(false)
})

test('a duck offer and a break due at one turn end: the offer, then the break at the next turn end', async ($, on) => {
  const clock = world(on, { buddy: LONG_DONE })
  engineBelow(on)
  model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(turnOf(90))
  await clock.settle()
  expect(await saidNow($)).toBe(OFFER)
  await clock.advance(60_000)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(isBreakLine(await saidNow($))).toBe(true)
})

// Answers every model call at once, except the rubber-duck offer, which waits for `release`.
function heldOffer(on: On) {
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const prompts: string[] = []
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    if (!e.prompt.startsWith('Claude just failed')) return { value: ok('Hello there.') }
    await gate
    return { value: ok(OFFER) }
  })
  return { prompts, release }
}
// Long enough for the model call a timer just started to have reached the model.
const reached = async (prompts: string[], n: number) => {
  for (let i = 0; i < 100 && prompts.length < n; i++) await Promise.resolve()
}

test('a talk that cuts an offer short wins: its reply shows, with no offer and no duck mode', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const held = heldOffer(on)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.advance(10)
  await reached(held.prompts, 1)
  expect(held.prompts).toEqual([duckPrompt('Pip', 'Bash', 3)])
  await $.prompt.submit({ text: 'Pip, how are you?', wait: false, origin: { kind: 'composer' } })
  await clock.advance(10)
  await reached(held.prompts, 2)
  held.release()
  await clock.settle()
  expect(await saidNow($)).toBe('Hello there.')
  // Once the bubble has gone, no duck stands by.
  await clock.advance(13_000)
  expect(await duckDrawn($)).toBe(false)
})

test('a talk inside the 5 s reply floor wins too: its canned line shows, with no offer and no duck mode', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const held = heldOffer(on)
  await $.session.start(START)
  await clock.settle()
  // A pet just now, so the talk comes inside the floor and never asks the model.
  await runner($)('pet')
  await clock.settle()
  expect(held.prompts).toHaveLength(1)
  await clock.advance(1_000)
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.advance(10)
  await reached(held.prompts, 2)
  expect(held.prompts.at(-1)).toBe(duckPrompt('Pip', 'Bash', 3))
  await $.prompt.submit({ text: 'Pip, how are you?', wait: false, origin: { kind: 'composer' } })
  await clock.advance(10)
  await idle()
  held.release()
  await clock.settle()
  expect(held.prompts).toHaveLength(2)
  const said = await saidNow($)
  expect([OFFER, 'Hello there.', '']).not.toContain(said)
  await clock.advance(13_000)
  expect(await duckDrawn($)).toBe(false)
})

test('a swap while an offer is being asked for drops it: the buddy back is not put in duck mode', async ($, on) => {
  const clock = world(on, { buddy: TWO })
  engineBelow(on)
  const held = heldOffer(on)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.advance(10)
  await reached(held.prompts, 1)
  expect(held.prompts).toEqual([duckPrompt('Mochi', 'Bash', 3)])
  expect(await runner($)('swap Pip')).toBe('Pip is back.')
  // The offer comes back before Pip's hello has had its turn.
  held.release()
  for (let i = 0; i < 300; i++) await Promise.resolve()
  expect(await saidNow($)).toBe('')
  await clock.settle()
  expect(await saidNow($)).toBe('Hello there.')
  await clock.advance(13_000)
  expect(await duckDrawn($)).toBe(false)
})

test('the failures an offer was made for never count toward the next one', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(offers()).toHaveLength(1)
  // Past the 30 minutes, one more failure: the 3 offered for are spent, so nothing is due.
  await clock.advance(31 * 60_000)
  await fail($, 1)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  expect(offers()).toHaveLength(1)
})

test('an offer makes the next quip wait out a full cooldown', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const quips = () => prompts.filter(p => p.startsWith('Claude just finished a turn'))
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(prompts).toEqual([duckPrompt('Pip', 'Bash', 3)])
  // An errored turn always gets a quip once the cooldown allows: not a minute after the offer.
  await clock.advance(60_000)
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'error' as const })
  await clock.settle()
  expect(quips()).toHaveLength(0)
  await clock.advance(7 * 60_000)
  await $.turn.complete({ ...TURN, turnId: 't3', reason: 'error' as const })
  await clock.settle()
  expect(quips()).toHaveLength(1)
})

test("a turn that ends while an offer waits on its slow save keeps its own failures for the next offer", async ($, on) => {
  const store = heldStore(on, CROWNED)
  const clock = world(on, null)
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  const failRead = () => $.tool.call({ tool: 'Read', file_path: '/x' })
  // Bash fails 3 times, and the turn's save is held, so its offer waits for it.
  await fail($, 3)
  store.shared.held = true
  await $.turn.complete(TURN)
  await clock.settle()
  // Meanwhile the next turn ends with 2 failed reads.
  await failRead()
  await failRead()
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.settle()
  await idle()
  store.release()
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3)])
  // Past the 30 minutes, one more failed read makes 3 with the 2 the offer left alone.
  await clock.advance(31 * 60_000)
  await failRead()
  await $.turn.complete({ ...TURN, turnId: 't3' })
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 3), duckPrompt('Pip', 'Read', 3)])
})

test('an offer due on a turn whose slow save announces something waits for the announcement, and stays due', async ($, on) => {
  // CROWNED has earned no long turn yet, so an 11-minute one announces Marathon; no break is due.
  const store = heldStore(on, CROWNED)
  const clock = world(on, null)
  engineBelow(on)
  const prompts = model(on, null, OFFER)
  await $.session.start(START)
  await clock.settle()
  const offers = () => prompts.filter(p => p.startsWith('Claude just failed'))
  await fail($, 3)
  store.shared.held = true
  await $.turn.complete(turnOf(11))
  await clock.settle()
  await idle()
  // Nothing is asked while the turn's save is out.
  expect(offers()).toEqual([])
  store.release()
  await clock.settle()
  // The announcement has the bubble, and the offer was not spent on a line it replaced.
  expect(await saidNow($)).toContain('Marathon')
  expect(offers()).toEqual([])
  await clock.advance(60_000)
  expect(await duckDrawn($)).toBe(false)
  // The next failing turn makes the offer, counting the 3 before.
  await fail($, 1)
  await $.turn.complete(turnOf(0.5, 't2'))
  await clock.settle()
  expect(offers()).toEqual([duckPrompt('Pip', 'Bash', 4)])
  expect(await saidNow($)).toBe(OFFER)
})

test('an offer whose answer comes back over an announcement is dropped, with no duck mode', async ($, on) => {
  const clock = world(on, { buddy: CROWNED })
  engineBelow(on)
  const held = heldOffer(on)
  await $.session.start(START)
  await clock.settle()
  await fail($, 3)
  await $.turn.complete(TURN)
  await clock.advance(10)
  await reached(held.prompts, 1)
  expect(held.prompts).toEqual([duckPrompt('Pip', 'Bash', 3)])
  // While the offer is at the model, an 11-minute turn ends and its save announces Marathon.
  await $.turn.complete(turnOf(11, 't2'))
  await clock.advance(10)
  for (let i = 0; i < 20 && !(await saidNow($)).includes('Marathon'); i++) await idle()
  expect(await saidNow($)).toContain('Marathon')
  held.release()
  await clock.settle()
  expect(await saidNow($)).toContain('Marathon')
  await clock.advance(60_000)
  expect(await duckDrawn($)).toBe(false)
  await $.prompt.submit({ text: 'Pip, any ideas?', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(held.prompts.at(-1)).toContain('The developer says to you: any ideas?')
  expect(held.prompts.at(-1)).not.toContain('rubber duck')
})
