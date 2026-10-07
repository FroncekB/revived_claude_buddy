import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Buddy, Saved, Soul } from '../types'
import { cardAlt, cardSvg, meter } from './card'
import { bandRows, cardLines, compactLine, isCompact, nameLine, spriteTint } from './layout'
import { STORE_KEY, USAGE, activeBuddy, applyChange, classify, parseSub } from './record'
import type { Change, Stored, Sub } from './record'
import { RARITY, STATS, rollBones } from './roll'
import type { Bones } from './roll'
import { eggRows, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Frame } from './sprites'
import { bandSvg } from './svg'
import { TOUR_STEPS, tourAt } from './tour'
import {
  BUBBLE_TICKS,
  HEART_TICKS,
  HELLO_PROMPT,
  PET_PROMPT,
  REPLY_FLOOR_MS,
  cannedLine,
  cleanSay,
  fallbackSoul,
  hatchRequest,
  matchAddress,
  parseSoul,
  personaSystem,
  reactionPrompt,
  shouldQuip,
  talkPrompt,
  withArticle,
} from './voice'
import type { TurnSummary } from './voice'

const record = atom({ plugin: 'buddy', key: 'record' } as const, null)
// True while the record in state is newer than the store's: the last write failed.
const unsaved = atom({ plugin: 'buddy', key: 'unsaved' } as const, false)
const hatching = atom({ plugin: 'buddy', key: 'hatching' } as const, false)
const tick = atom({ plugin: 'buddy', key: 'tick' } as const, 0)
const bubble = atom({ plugin: 'buddy', key: 'bubble' } as const, null)
const heartsUntil = atom({ plugin: 'buddy', key: 'heartsUntilTick' } as const, 0)
const tourStart = atom({ plugin: 'buddy', key: 'tourStartTick' } as const, null)
const lastQuipAt = atom({ plugin: 'buddy', key: 'lastQuipAt' } as const, 0)
const lastReplyAt = atom({ plugin: 'buddy', key: 'lastReplyAt' } as const, 0)

const CARD = 'card'
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
const SAVE_FAILED = 'Could not save your buddy; it lives for this session only.'

type Look = {
  sprite: string[]
  face: string
  name: string
  label: string
  stars: string
  starColor: string | undefined
  spriteColor: string | undefined
  spriteBold: boolean
  say: string | null
}

// The part of a buddy that speaks: its seed, for the bones, and its soul.
type Who = Pick<Buddy, 'seed' | 'soul'>

const tint = (color: string | undefined) => (color ? { color } : {})

// Module variables start over on a hot reload; nothing here needs to survive one.
let timer: { cancel: () => void } | null = null
let inFlight: { controller: AbortController; kind: 'react' | 'reply' } | null = null
let cannedCount = 0
// The current main turn's tool tally; reset when that turn completes.
let tally: Record<string, number> = {}
let failedTools: string[] = []

function startTimer($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.every(500, () => {
    void update($, tick, n => n + 1).catch(() => undefined)
  })
}

function stopTimer() {
  timer?.cancel()
  timer = null
}

// Work that must outlive the hook that started it (spec: work meant to outlive
// a dispatch runs on a $.clock timer).
function later($: EngineInterface, work: () => Promise<unknown>) {
  $.clock.after(0, () => {
    void work().catch(() => undefined)
  })
}

// Make `saved` the session's buddy: into state, and the timer to match its mode.
async function adopt($: EngineInterface, saved: Saved) {
  await update($, record, () => saved)
  if (saved.mode === 'off') stopTimer()
  else if (!timer) startTimer($)
}

// What this session builds on. The store is shared between sessions, so it is the truth,
// unless this session's last write failed: then its own copy in state carries on until a
// write succeeds.
async function current($: EngineInterface): Promise<Stored> {
  const stored = classify(await $.store.get(STORE_KEY))
  if (stored.kind === 'damaged' || stored.kind === 'foreign') return stored
  const mine = await read($, record)
  if (mine && (await read($, unsaved))) return { kind: 'ok', saved: mine }
  return stored
}

// The only writer of the store: read fresh, make one change, write (Foundation spec section 2).
// A failed write leaves the result in state, marked unsaved, and returns the note saying so.
async function commit($: EngineInterface, change: Change): Promise<string | null> {
  const base = await current($)
  if (base.kind === 'damaged' || base.kind === 'foreign') return null
  const saved = applyChange(base.kind === 'ok' ? base.saved : null, change, await $.clock.now())
  if (!saved) return null
  await adopt($, saved)
  try {
    await $.store.set(STORE_KEY, saved)
    await update($, unsaved, () => false)
    return null
  } catch {
    await update($, unsaved, () => true)
    return SAVE_FAILED
  }
}

async function showBubble($: EngineInterface, text: string) {
  const now = await read($, tick)
  await update($, bubble, () => ({ text, untilTick: now + BUBBLE_TICKS }))
}

// One model call at a time: a reply cancels a pending reaction; a reaction
// never starts while anything is pending.
async function ask(
  $: EngineInterface,
  soul: Soul,
  bones: Bones,
  prompt: string,
  kind: 'react' | 'reply',
): Promise<string | null> {
  if (kind === 'react' && inFlight) return null
  if (kind === 'reply') inFlight?.controller.abort()
  const mine = { controller: new AbortController(), kind }
  inFlight = mine
  try {
    const result = await $.model.complete(
      { model: 'haiku', system: personaSystem(soul, bones), prompt, maxTokens: 80, timeoutMs: 8000 },
      { signal: mine.controller.signal },
    )
    if (mine.controller.signal.aborted || !result.isAnswered) return null
    return cleanSay(result.text) || null
  } catch {
    return null
  } finally {
    if (inFlight === mine) inFlight = null
  }
}

// Talk, pet and hello: answered even when muted, at most one model call per 5 s.
async function reply($: EngineInterface, who: Who, prompt: string) {
  const bones = rollBones(who.seed)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who.soul, bones, prompt, 'reply')
  await showBubble($, text ?? cannedLine(bones, cannedCount++))
}

// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is pending.
async function react($: EngineInterface, summary: TurnSummary) {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: saved.mode,
    inFlight: inFlight !== null,
    now,
    lastQuipAt: await read($, lastQuipAt),
    summary,
    roll: Math.random(),
  })
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const buddy = activeBuddy(saved)
  const text = await ask($, buddy.soul, rollBones(buddy.seed), reactionPrompt(summary), 'react')
  if (text) await showBubble($, text)
}

async function hatch($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
  const seed = crypto.randomUUID()
  const bones = rollBones(seed)
  await update($, hatching, () => true)
  try {
    // A new buddy is shown as itself, not mid-tour.
    await update($, tourStart, () => null)
    if (!timer) startTimer($)
    let soul = fallbackSoul(seed, bones)
    try {
      const request = hatchRequest(bones)
      const result = await $.model.complete({
        model: 'haiku',
        system: request.system,
        prompt: request.prompt,
        maxTokens: 200,
        timeoutMs: 8000,
      })
      if (result.isAnswered) soul = parseSoul(result.text) ?? soul
    } catch {
      // Keep the fallback soul: hatching never fails.
    }
    const hatchedAt = new Date(await $.clock.now()).toISOString()
    const born: Who = { seed, soul: { ...soul, hatchedAt } }
    const note = await commit($, { kind, ...born })
    await update($, bubble, () => null)
    later($, () => reply($, born, HELLO_PROMPT))
    return note ?? `${soul.name}, ${withArticle(bones.rarity)}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
  } finally {
    // The egg never stays out, whatever went wrong above.
    await update($, hatching, () => false)
  }
}

async function runBuddy($: EngineInterface, sub: Sub): Promise<string | undefined> {
  if (sub === 'usage') return USAGE
  const stored = await current($)
  if (stored.kind === 'foreign') return `Saved buddy uses schema ${stored.schema}; this mod knows 1 and 2.`
  if (stored.kind === 'damaged') return "Saved buddy is damaged; this mod won't overwrite it."
  if (stored.kind === 'none') return sub === 'show' ? hatch($, 'hatch') : NO_BUDDY
  const saved = stored.saved
  // Another session may have changed the store since this one last looked.
  await adopt($, saved)
  const buddy = activeBuddy(saved)
  const bones = rollBones(buddy.seed)
  const name = buddy.soul.name
  const who = `${name}, ${bones.rarity} ${bones.species}`
  const hidden = `${name} is hidden. Run /buddy to bring it back.`
  switch (sub) {
    case 'show': {
      const note = await commit($, { kind: 'mode', mode: 'on' })
      later($, () => reply($, buddy, HELLO_PROMPT))
      return note ?? `${who}, is here.`
    }
    case 'pet': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => reply($, buddy, PET_PROMPT))
      return undefined
    }
    case 'card': {
      const opened = await $.ui.open({ id: CARD, title: 'Buddy', closeOnEscape: true })
      // A surface that places no panes gets the card as text instead.
      return opened.isPlaced ? undefined : cardLines(buddy.soul, bones, saved.rerolls).join('\n')
    }
    case 'mute':
      return (await commit($, { kind: 'mode', mode: 'muted' })) ?? `${name} will stay quiet unless spoken to.`
    case 'unmute':
      return (await commit($, { kind: 'mode', mode: 'on' })) ?? `${name} can talk again.`
    case 'off':
      return (await commit($, { kind: 'mode', mode: 'off' })) ?? hidden
    case 'reroll':
      return `This retires ${who}. Run /buddy reroll confirm.`
    case 'reroll-confirm':
      return hatch($, 'reroll')
    case 'debug': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, tourStart, () => now)
      return `Touring all ${TOUR_STEPS} species, plain then shiny. Run /buddy debug off to stop.`
    }
    case 'debug-off':
      await update($, tourStart, () => null)
      return saved.mode === 'off' ? hidden : `Back to ${name}.`
  }
}

function eggLook(frame: Frame): Look {
  return {
    sprite: eggRows(frame),
    face: '(egg)',
    name: 'hatching...',
    label: '  hatching...',
    stars: '',
    starColor: undefined,
    spriteColor: undefined,
    spriteBold: false,
    say: null,
  }
}

// `withTour` false draws the real buddy whatever the band is touring (the card pane).
async function buddyLook($: EngineInterface, saved: Saved, t: number, withTour = true): Promise<Look> {
  const buddy = activeBuddy(saved)
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = withTour ? await read($, tourStart) : null
  const tour = started === null ? null : tourAt(t - started)
  const bones = tour ? { ...rollBones(buddy.seed), ...tour.look } : rollBones(buddy.seed)
  const name = tour ? `tour ${tour.step + 1}/${TOUR_STEPS}` : buddy.soul.name
  const animTick = tour ? tour.tick : t
  const { frame, blink } = frameAt(animTick)
  const eye = blink ? '-' : bones.eye
  const heartsUntilTick = await read($, heartsUntil)
  const top = topRow({
    hat: bones.hat,
    heartsFrame: t < heartsUntilTick ? t : null,
    sparkle: bones.shiny ? animTick : null,
  })
  const said = await read($, bubble)
  const { label, stars } = nameLine(name, bones)
  const sprite = spriteTint(bones, animTick)
  return {
    sprite: spriteRows({ species: bones.species, eye, frame, top }),
    face: faceFor(bones.species, eye),
    name,
    label,
    stars,
    starColor: RARITY[bones.rarity].color,
    spriteColor: sprite.color,
    spriteBold: sprite.bold,
    say: said && t < said.untilTick ? said.text : null,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'buddy',
        description: 'Hatch, pet, or manage your terminal buddy',
        argumentHint: '[pet | card | mute | unmute | off | reroll [confirm]]',
        immediate: true,
      })
    } catch {
      // A refused registration costs the slash command, not the buddy on screen.
    }
    try {
      // A reload in the middle of a hatch leaves the egg flag set with nobody to clear it.
      await update($, hatching, () => false)
      // A write that failed before a reload left the only copy in state: current() keeps it.
      const stored = await current($)
      const saved = stored.kind === 'ok' ? stored.saved : null
      await update($, record, () => saved)
      if (saved && saved.mode !== 'off') startTimer($)
    } catch {
      // The buddy never holds up a session.
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    try {
      return { text: await runBuddy($, parseSub(e.args)) }
    } catch {
      return { text: 'Your buddy hit a snag. Try again.' }
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      // Main conversation only: a subagent's calls never reach the buddy's reactions.
      if (e.agentId === undefined) {
        tally[e.tool] = (tally[e.tool] ?? 0) + 1
        if (ran.deny === undefined && ran.isError === true) failedTools.push(e.tool)
      }
    } catch {
      // Counting never changes a tool call.
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId === undefined) {
        const summary: TurnSummary = { reason: e.reason, durationMs: e.durationMs, tools: tally, failed: failedTools }
        tally = {}
        failedTools = []
        later($, () => react($, summary))
      }
    } catch {
      // A reaction is never worth breaking a turn over.
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const saved = await read($, record)
      const buddy = saved && saved.mode !== 'off' ? activeBuddy(saved) : null
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      // A prompt carrying images or files is a request for Claude, whatever it starts with.
      const bare = !e.attachments || e.attachments.length === 0
      const message = buddy && fromPerson && bare ? matchAddress(buddy.soul.name, e.text) : null
      if (buddy && message !== null) {
        later($, () => reply($, buddy, talkPrompt(message)))
        return { drop: `(to ${buddy.soul.name})` }
      }
    } catch {
      // Fall through: the prompt goes to Claude.
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const rec = await read($, record)
      const isHatching = await read($, hatching)
      if (e.props.hasSurvey || (!isHatching && (!rec || rec.mode === 'off'))) return next(e)

      const { Box, Text } = $.ui.resolve(e)
      const t = await read($, tick)
      const view = isHatching || !rec ? eggLook(frameAt(t).frame) : await buddyLook($, rec, t)

      if (isCompact(e.props.maxRows, e.props.bodyColumns)) {
        return <Text wrap="truncate-end">{compactLine(view.face, view.name, view.say)}</Text>
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns)
      const nameRow = (
        <Box>
          <Text dimColor wrap="truncate-end">{view.label}</Text>
          <Text {...tint(view.starColor)}>{view.stars}</Text>
        </Box>
      )

      // The desktop's Text is proportional, so its art is monospace SVG text instead.
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        const art = bandSvg({ ...rows, color: view.spriteColor, bold: view.spriteBold })
        return (
          <Box flexDirection="column">
            <Svg
              source={art.source}
              alt={view.say ? `${view.name}: ${view.say}` : view.name}
              width={art.width}
              height={art.height}
            />
            {nameRow}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          {rows.sprite.map((row, i) => (
            <Box>
              <Text {...tint(view.spriteColor)} bold={view.spriteBold}>
                {row}
              </Text>
              <Text>{' ' + (rows.bubble[i] ?? '')}</Text>
            </Box>
          ))}
          {nameRow}
        </Box>
      )
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'Pane', requestId: CARD }, async ($, e, next) => {
    try {
      const { Box, Text } = $.ui.resolve(e)
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = activeBuddy(saved)
      const bones = rollBones(buddy.seed)
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={cardSvg(buddy.soul, bones, saved.rerolls)} alt={cardAlt(buddy.soul, bones, saved.rerolls)} />
      }

      const view = await buddyLook($, saved, await read($, tick), false)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{buddy.soul.name}</Text>
            <Text {...tint(view.starColor)}>{'  ' + view.stars}</Text>
          </Box>
          <Text dimColor>
            {`${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}   Hat: ${bones.hat}   Eyes: ${bones.eye}`}
          </Text>
          <Text>{buddy.soul.personality}</Text>
        </Box>
      )
      const footer = <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}`}</Text>
      const cells = Math.max(8, Math.min(30, e.props.bodyColumns - 18))
      return (
        <Box flexDirection="column">
          {view.sprite.map(row => (
            <Text {...tint(view.spriteColor)} bold={view.spriteBold}>
              {row}
            </Text>
          ))}
          {header}
          <Text> </Text>
          {STATS.map(s => (
            <Box>
              <Text dimColor={s === bones.low}>{s.padEnd(10) + ' '}</Text>
              <Text {...tint(view.starColor)}>{meter(bones.stats[s], cells)}</Text>
              <Text bold={s === bones.peak} dimColor={s === bones.low}>
                {' ' + String(bones.stats[s]).padStart(3) + (s === bones.peak ? ' ★' : '')}
              </Text>
            </Box>
          ))}
          <Text> </Text>
          {footer}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
