import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BuddyRecord } from '../types'
import { bandRows, cardLines, compactLine, isCompact, nameLine } from './layout'
import { STORE_KEY, USAGE, classifyRecord, newRecord, parseSub } from './record'
import type { Sub } from './record'
import { RARITY, rollBones } from './roll'
import type { Bones } from './roll'
import { eggRows, faceFor, frameAt, spriteRows, topRow } from './sprites'
import type { Frame } from './sprites'
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
} from './voice'
import type { TurnSummary } from './voice'

const record = atom({ plugin: 'buddy', key: 'record' } as const, null)
const hatching = atom({ plugin: 'buddy', key: 'hatching' } as const, false)
const tick = atom({ plugin: 'buddy', key: 'tick' } as const, 0)
const bubble = atom({ plugin: 'buddy', key: 'bubble' } as const, null)
const heartsUntil = atom({ plugin: 'buddy', key: 'heartsUntilTick' } as const, 0)
const lastQuipAt = atom({ plugin: 'buddy', key: 'lastQuipAt' } as const, 0)
const lastReplyAt = atom({ plugin: 'buddy', key: 'lastReplyAt' } as const, 0)

type Look = {
  sprite: string[]
  face: string
  name: string
  label: string
  stars: string
  starColor: string | undefined
  spriteColor: string | undefined
  say: string | null
}

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
    void update($, tick, n => n + 1)
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

async function save($: EngineInterface, rec: BuddyRecord): Promise<string | null> {
  await update($, record, () => rec)
  if (rec.mode === 'off') stopTimer()
  else if (!timer) startTimer($)
  try {
    await $.store.set(STORE_KEY, rec)
    return null
  } catch {
    return 'Could not save your buddy; it lives for this session only.'
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
  rec: BuddyRecord,
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
      { model: 'haiku', system: personaSystem(rec.soul, bones), prompt, maxTokens: 60, timeoutMs: 8000 },
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
async function reply($: EngineInterface, rec: BuddyRecord, prompt: string) {
  const bones = rollBones(rec.seed)
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, rec, bones, prompt, 'reply')
  await showBubble($, text ?? cannedLine(bones, cannedCount++))
}

// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is pending.
async function react($: EngineInterface, summary: TurnSummary) {
  const rec = await read($, record)
  if (!rec) return
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: rec.mode,
    inFlight: inFlight !== null,
    now,
    lastQuipAt: await read($, lastQuipAt),
    summary,
    roll: Math.random(),
  })
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const text = await ask($, rec, rollBones(rec.seed), reactionPrompt(summary), 'react')
  if (text) await showBubble($, text)
}

async function hatch($: EngineInterface, rerolls: number): Promise<string> {
  const seed = crypto.randomUUID()
  const bones = rollBones(seed)
  await update($, hatching, () => true)
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
  const rec = newRecord(seed, { ...soul, hatchedAt }, rerolls)
  const note = await save($, rec)
  await update($, hatching, () => false)
  await update($, bubble, () => null)
  later($, () => reply($, rec, HELLO_PROMPT))
  return note ?? `${soul.name}, a ${bones.rarity}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
}

async function runBuddy($: EngineInterface, sub: Sub): Promise<string | undefined> {
  if (sub === 'usage') return USAGE
  const loaded = classifyRecord(await $.store.get(STORE_KEY))
  if (loaded.kind === 'foreign') return `Saved buddy uses schema ${loaded.schema}; this mod knows 1.`
  // $.state is never older than the store: session.start loads it from there, and save() writes
  // it first. So after a failed write the session carries on from state, not the stale store.
  const rec = (await read($, record)) ?? (loaded.kind === 'ok' ? loaded.record : null)
  if (!rec) {
    return sub === 'show' ? hatch($, 0) : 'No buddy yet. Run /buddy to hatch one.'
  }
  const bones = rollBones(rec.seed)
  const who = `${rec.soul.name}, ${bones.rarity} ${bones.species}`
  const hidden = `${rec.soul.name} is hidden. Run /buddy to bring it back.`
  switch (sub) {
    case 'show': {
      const shown: BuddyRecord = { ...rec, mode: 'on' }
      const note = await save($, shown)
      later($, () => reply($, shown, HELLO_PROMPT))
      return note ?? `${who}, is here.`
    }
    case 'pet': {
      if (rec.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => reply($, rec, PET_PROMPT))
      return undefined
    }
    case 'card':
      return cardLines(rec.soul, bones, rec.rerolls).join('\n')
    case 'mute':
      return (await save($, { ...rec, mode: 'muted' })) ?? `${rec.soul.name} will stay quiet unless spoken to.`
    case 'unmute':
      return (await save($, { ...rec, mode: 'on' })) ?? `${rec.soul.name} can talk again.`
    case 'off':
      return (await save($, { ...rec, mode: 'off' })) ?? hidden
    case 'reroll':
      return `This replaces ${who}, for good. Run /buddy reroll confirm.`
    case 'reroll-confirm':
      return hatch($, rec.rerolls + 1)
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
    say: null,
  }
}

async function buddyLook($: EngineInterface, rec: BuddyRecord, t: number): Promise<Look> {
  const bones = rollBones(rec.seed)
  const { frame, blink } = frameAt(t)
  const eye = blink ? '-' : bones.eye
  const heartsUntilTick = await read($, heartsUntil)
  const top = topRow({
    hat: bones.hat,
    heartsFrame: t < heartsUntilTick ? t : null,
    sparkle: bones.shiny ? t : null,
  })
  const said = await read($, bubble)
  const { label, stars } = nameLine(rec.soul.name, bones)
  return {
    sprite: spriteRows({ species: bones.species, eye, frame, top }),
    face: faceFor(bones.species, eye),
    name: rec.soul.name,
    label,
    stars,
    starColor: RARITY[bones.rarity].color,
    spriteColor: bones.shiny ? 'yellow' : undefined,
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
      const loaded = classifyRecord(await $.store.get(STORE_KEY))
      const rec = loaded.kind === 'ok' ? loaded.record : null
      await update($, record, () => rec)
      if (rec && rec.mode !== 'off') startTimer($)
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
      tally[e.tool] = (tally[e.tool] ?? 0) + 1
      if (ran.deny === undefined && ran.isError === true) failedTools.push(e.tool)
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
      const rec = await read($, record)
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      const message = rec && rec.mode !== 'off' && fromPerson ? matchAddress(rec.soul.name, e.text) : null
      if (rec && message !== null) {
        later($, () => reply($, rec, talkPrompt(message)))
        return { drop: `(to ${rec.soul.name})` }
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

      const { Box, Code, Text } = $.ui.resolve(e)
      const t = await read($, tick)
      const view = isHatching || !rec ? eggLook(frameAt(t).frame) : await buddyLook($, rec, t)

      if (isCompact(e.props.maxRows, e.props.bodyColumns)) {
        return <Text wrap="truncate-end">{compactLine(view.face, view.name, view.say)}</Text>
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns)
      const nameRow = (
        <Box>
          <Text dimColor>{view.label}</Text>
          <Text {...tint(view.starColor)}>{view.stars}</Text>
        </Box>
      )

      if (e.surface === 'desktop') {
        const source = rows.sprite.map((row, i) => (row + ' ' + (rows.bubble[i] ?? '')).trimEnd()).join('\n')
        return (
          <Box flexDirection="column">
            <Code source={source} />
            {nameRow}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          {rows.sprite.map((row, i) => (
            <Box>
              <Text {...tint(view.spriteColor)} bold={view.spriteColor !== undefined}>
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
}
