import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Buddy, Counts, Moment, MoodEvent, Saved, Stage, TurnFacts } from '../types'
import { newsOf } from './achievements'
import { breakDue, breakLine, nextStretch } from './breaks'
import type { Stretch } from './breaks'
import { dayInfo } from './calendar'
import { cardAlt, cardSvg, dexAlt, dexSvg, journalAlt, journalSvg, meter } from './card'
import { DUCK_MS, duckDue, duckFallback, duckLine, duckPrompt, failsByTool, shouldNudge } from './duck'
import type { DuckDue } from './duck'
import {
  MAX_QUEUED_TURNS, addCall, isRough, memoryLine, momentKey, noCalls, recall, talkMemories, turnFacts,
} from './journal'
import {
  achievementsText, bandRows, cardLines, cardProgress, compactLine, dexLines, dexRows, dexText, emptyJournal, isCompact,
  journalHeader, journalLines, journalRows, levelText, nameLine, rightRuns, spriteTint, streakLine,
} from './layout'
import { addCounts, countEvent, mergePending, toolGroup, zeroCounts } from './ledger'
import type { CountEvent } from './ledger'
import { CELEBRATE_TICKS, FLINCH_TICKS, SNACK_TICKS, YAWN_TICKS, draw, portrait } from './look'
import type { Scene } from './look'
import { MAX_QUEUED_MOOD, applyMood, moodLine, moodOf, turnMood } from './mood'
import type { MoodName } from './mood'
import { bonesFor, levelOf, stageOf } from './progress'
import { mergeQueues, queueNewest } from './queue'
import {
  STORE_KEY, USAGE, activeBuddy, applyChange, classify, findBuddy, notFound, parseSub, shownBuddy, targetOf,
} from './record'
import type { Change, Parsed, Stored } from './record'
import { RARITY, STATS, rollBones } from './roll'
import type { Bones } from './roll'
import { eggRows, frameAt } from './sprites'
import type { Frame, Prop } from './sprites'
import { bandSvg } from './svg'
import { TOUR_STEPS, tourAt } from './tour'
import {
  dressed, feedFallback, feedPrompt, fullLine, hatChoice, hatFallback, hatList, hatPrompt, isFull, play, playFallback,
  playPrompt, renameFallback, renamePrompt, renameRefusal, snackOf, wearable, woreLine, wornHat,
} from './toys'
import {
  HEART_TICKS,
  HELLO_PROMPT,
  PET_PROMPT,
  REPLY_FLOOR_MS,
  bubbleTicks,
  cannedLine,
  cleanSay,
  failLine,
  fallbackSoul,
  hatchRequest,
  matchAddress,
  newsLine,
  parseSoul,
  personaSystem,
  reactionPrompt,
  shouldFlag,
  shouldGreet,
  shouldQuip,
  streakGreeting,
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
const pending = atom({ plugin: 'buddy', key: 'pending' } as const, {})
const posing = atom({ plugin: 'buddy', key: 'pose' } as const, null)
const lastActive = atom({ plugin: 'buddy', key: 'lastActiveTick' } as const, 0)
const pendingMood = atom({ plugin: 'buddy', key: 'pendingMood' } as const, {})
const pendingTurns = atom({ plugin: 'buddy', key: 'pendingTurns' } as const, {})
const cardSeed = atom({ plugin: 'buddy', key: 'cardSeed' } as const, null)
const journalSeed = atom({ plugin: 'buddy', key: 'journalSeed' } as const, null)
const tourStage = atom({ plugin: 'buddy', key: 'tourStage' } as const, 'adult')
const snackShown = atom({ plugin: 'buddy', key: 'snack' } as const, null)
const lastFedAt = atom({ plugin: 'buddy', key: 'lastFedAt' } as const, 0)
const duckUntil = atom({ plugin: 'buddy', key: 'duckUntil' } as const, 0)
const duckTool = atom({ plugin: 'buddy', key: 'duckTool' } as const, null)
const lastNudgeAt = atom({ plugin: 'buddy', key: 'lastNudgeAt' } as const, 0)

const CARD = 'card'
const JOURNAL = 'journal'
const DEX = 'dex'
const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'
const EGG = 'Wait for the egg to hatch.'
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
  // How far through its life the bubble is, 0 to 1: which page a long one is on.
  sayAt: number
  // A holiday prop beside the sprite, while nothing is said.
  prop: Prop | null
}

// The part of a buddy that speaks: its seed and counts, for its grown bones, its soul, and its
// saved mood. A buddy just hatched has no counts yet, so it is level 1.
type Who = Pick<Buddy, 'seed' | 'soul' | 'mood'> & { counts?: Counts }

const tint = (color: string | undefined) => (color ? { color } : {})

// Module variables start over on a hot reload; nothing here needs to survive one. The cost: the
// old module's last commit can overlap the new one's first, or a flush cut off midway can lose
// a turn's counts. Both are accepted losses, and a reload also frees a stuck commit chain.
let timer: { cancel: () => void } | null = null
let inFlight: { controller: AbortController; kind: 'react' | 'reply' } | null = null
let cannedCount = 0
// The current main turn's tool tally; reset when that turn completes.
let tally: Record<string, number> = {}
let failedTools: string[] = []
// The current main turn's calls for the journal, and the rough turns in a row before it (Memory
// spec section 3).
let turnCalls = noCalls()
let roughTurns = 0
// When each journal memory was last recalled in a quip, by moment key (Memory spec section 4).
// Lost on a reload, which is acceptable: at worst a memory comes back sooner.
let recalled: Record<string, number> = {}
// Main turns completed in this module's life, and the last one the DEBUGGING line spoke in: a
// failed call's line can run after its turn has ended, so it carries its turn's number.
let turnNo = 0
let flaggedTurn = -1
// The run of main turns a break nudge watches (Interaction spec section 5). Lost on a reload, which
// starts it over: at worst a nudge comes later.
let stretch: Stretch | null = null
// The last main turn's failed calls by tool, for the rubber duck (Interaction spec section 4).
let prevFails: Record<string, number> = {}
// The last commit this session started. The next one waits for it to settle.
let lastCommit: Promise<unknown> = Promise.resolve()

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

// Make `saved` the session's buddy: into state, and the timer to match its mode. A run of rough
// turns never crosses "off" or a new buddy, whichever session made the change (Memory spec
// section 3).
async function adopt($: EngineInterface, saved: Saved) {
  const before = await read($, record)
  await update($, record, () => saved)
  if (saved.mode === 'off' || saved.active !== before?.active) roughTurns = 0
  // Duck mode belongs to the buddy that offered it (Interaction spec section 4).
  if (saved.active !== before?.active) await update($, duckUntil, () => 0)
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
  if (mine && (await read($, unsaved))) {
    // The copy may be from before a reload: a 0.1.x session leaves a schema 1 record here.
    const own = classify(mine)
    if (own.kind === 'ok') return own
  }
  return stored
}

// The line a command answers with when the store holds a record this build must not touch.
function refusal(stored: Stored): string | null {
  if (stored.kind === 'foreign') return `Saved buddy uses schema ${stored.schema}; this mod knows 1 and 2.`
  if (stored.kind === 'damaged') return "Saved buddy is damaged; this mod won't overwrite it."
  return null
}

// The only writer of the store: read fresh, make one change, write (Foundation spec section 2).
// Returns null when it wrote, or had nothing to write. A record it must not touch comes back
// as its refusal line, and a failed write, which leaves the result in state marked unsaved, as
// SAVE_FAILED.
//
// Commits in one session run one at a time. Two that overlapped would both build on the same
// stored record, and the later write would undo the earlier one: a mute lost to a turn's save,
// or one batch of counts lost to another. A commit that throws still hands over to the next,
// and its caller still sees the throw. Nothing inside `commitNow` may call `commit`, which
// would wait on itself.
function commit($: EngineInterface, change: Change): Promise<string | null> {
  const run = lastCommit.then(() => commitNow($, change))
  lastCommit = run.catch(() => undefined)
  return run
}

async function commitNow($: EngineInterface, change: Change): Promise<string | null> {
  const base = await current($)
  const refused = refusal(base)
  if (refused) return refused
  const before = base.kind === 'ok' ? base.saved : null
  const saved = applyChange(before, change, await $.clock.now())
  if (!saved) return null
  await adopt($, saved)
  // Only the session whose commit made the change announces it, whether or not the write lands.
  await announce($, before, saved)
  try {
    await $.store.set(STORE_KEY, saved)
    await update($, unsaved, () => false)
    return null
  } catch {
    await update($, unsaved, () => true)
    return SAVE_FAILED
  }
}

// The active buddy's seed while events count; null with no buddy, while the egg is out, or while
// the buddy is off.
async function countedSeed($: EngineInterface): Promise<string | null> {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off' || (await read($, hatching))) return null
  return saved.active
}

// Adds one event to this session's unsaved counts for the active buddy.
async function count($: EngineInterface, event: CountEvent) {
  const seed = await countedSeed($)
  if (seed === null) return
  await update($, pending, p => ({ ...p, [seed]: countEvent(p[seed] ?? zeroCounts(), event) }))
}

const POSE_TICKS = { flinch: FLINCH_TICKS, celebrate: CELEBRATE_TICKS, yawn: YAWN_TICKS } as const

// Queues mood events for the active buddy and strikes a pose, under the rules for counting
// (Alive spec sections 2 and 4). A celebration never cuts a flinch short, and a yawn never cuts
// either short.
async function feel($: EngineInterface, events: readonly MoodEvent[], kind: 'flinch' | 'celebrate' | 'yawn' | null) {
  const seed = await countedSeed($)
  if (seed === null) return
  if (events.length > 0) await update($, pendingMood, p => ({ ...p, [seed]: queueNewest(p[seed], events, MAX_QUEUED_MOOD) }))
  if (kind === null) return
  const now = await read($, tick)
  const untilTick = now + POSE_TICKS[kind]
  await update($, posing, p => {
    const running = p !== null && now < p.untilTick
    return running && (kind === 'yawn' || (kind === 'celebrate' && p.kind === 'flinch')) ? p : { kind, untilTick }
  })
}

// Queues a finished main turn for the journal, under the rules for counting (Memory spec section 3).
async function queueTurn($: EngineInterface, facts: TurnFacts) {
  const seed = await countedSeed($)
  if (seed === null) {
    // A turn nobody is counting breaks the run of rough ones.
    roughTurns = 0
    return
  }
  await update($, pendingTurns, p => ({ ...p, [seed]: queueNewest(p[seed], [facts], MAX_QUEUED_TURNS) }))
}

// Saves the unsaved counts, mood events and turns with today's visit. A failed store write has
// already taken them into this session's copy (commit adopts before it writes), so they go back
// only when the commit failed before that.
async function flush($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  // Each taken and cleared in one update, so an event landing in between is never erased.
  let taken: Record<string, Counts> = {}
  let felt: Record<string, MoodEvent[]> = {}
  let turns: Record<string, TurnFacts[]> = {}
  await update($, pending, p => {
    taken = p
    return {}
  })
  await update($, pendingMood, p => {
    felt = p
    return {}
  })
  await update($, pendingTurns, p => {
    turns = p
    return {}
  })
  try {
    await commit($, { kind: 'flush', pending: taken, mood: felt, turns })
  } catch {
    await update($, pending, p => mergePending(taken, p))
    await update($, pendingMood, p => mergeQueues(felt, p, MAX_QUEUED_MOOD))
    await update($, pendingTurns, p => mergeQueues(turns, p, MAX_QUEUED_TURNS))
  }
}

async function countAndFlush(
  $: EngineInterface,
  event: CountEvent,
  events: readonly MoodEvent[] = [],
  kind: 'flinch' | 'celebrate' | null = null,
  facts: TurnFacts | null = null,
) {
  // Queued before the counts: a flush landing between the two awaits would otherwise save this
  // turn's longestTurnMs without its facts, and the next flush would lose the long-turn moment.
  if (facts) await queueTurn($, facts)
  await count($, event)
  await feel($, events, kind)
  await flush($)
}

// A failed main-conversation tool call in turn `turn`, said out loud at once when DEBUGGING
// says so: a canned line, no model call (Alive spec section 3).
async function speakUp($: EngineInterface, turn: number) {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const bones = bonesFor(activeBuddy(saved), saved.buddies)
  const t = await read($, tick)
  const said = await read($, bubble)
  const say = shouldFlag({
    mode: saved.mode,
    bubbleUp: said !== null && t < said.untilTick,
    flagged: flaggedTurn === turn,
    roll: Math.random(),
    stats: bones.stats,
  })
  if (!say) return
  flaggedTurn = turn
  await showBubble($, failLine(bones, cannedCount++, Math.random()))
}

// The mood a buddy shows now: its saved mood with this session's unsaved events, decayed to now.
// The saved mood is read afresh, since a save may have moved it after `who` was read.
async function moodNow($: EngineInterface, who: Who, now: number): Promise<MoodName> {
  const saved = (await read($, record))?.buddies.find(b => b.seed === who.seed)
  const queued = (await read($, pendingMood))[who.seed] ?? []
  return moodOf(applyMood(saved ? saved.mood : who.mood, queued, now), now)
}

// The persona prompt's context: the mood with this session's unsaved events, and the day.
async function contextLines($: EngineInterface, who: Who): Promise<string[]> {
  const now = await $.clock.now()
  const mood = moodLine(await moodNow($, who, now))
  const holiday = dayInfo(now, who.soul.hatchedAt).holiday
  return [mood, holiday?.line ?? null].filter((line): line is string => line !== null)
}

// A buddy's lifetime counts with this session's unsaved ones added, for the card.
async function countsOf($: EngineInterface, buddy: Buddy): Promise<Counts> {
  const waiting = (await read($, pending))[buddy.seed]
  return waiting ? addCounts(buddy.counts, waiting) : buddy.counts
}

// Activity: the buddy wakes, and idle sleep counts from now (Alive spec section 4).
async function stir($: EngineInterface) {
  const now = await read($, tick)
  await update($, lastActive, () => now)
}

// `news` is the announcement the bubble carries, if any.
async function showBubble($: EngineInterface, text: string, news?: string) {
  const now = await read($, tick)
  await update($, bubble, () => ({ text, fromTick: now, untilTick: now + bubbleTicks(text), ...(news ? { news } : {}) }))
}

// The announcement still showing, if one is.
async function newsShowing($: EngineInterface): Promise<string | null> {
  const said = await read($, bubble)
  return said?.news !== undefined && (await read($, tick)) < said.untilTick ? said.news : null
}

// What a commit changed worth saying (Progression spec section 4): a celebration, and a canned
// line unless muted. A throw costs only the announcement; the card shows the news either way.
async function announce($: EngineInterface, before: Saved | null, after: Saved) {
  try {
    const news = newsOf(before, after)
    if (!news || after.mode === 'off') return
    await feel($, [], 'celebrate')
    if (after.mode !== 'on') return
    const line = newsLine(news)
    await showBubble($, line, line)
  } catch {
    // Nothing to undo.
  }
}

// The session's visit (spec section 3), greeting the streak on the first session of a new day.
async function visitToday($: EngineInterface) {
  const saved = await read($, record)
  if (!saved || saved.mode === 'off') return
  const dayBefore = saved.you.lastDay
  await commit($, { kind: 'visit' })
  const after = await read($, record)
  // A visit that earned something has already said so.
  if (after && shouldGreet({ mode: after.mode, dayBefore, you: after.you }) && (await newsShowing($)) === null) {
    await showBubble($, streakGreeting(after.you.streak))
  }
}

// One model call at a time: a reply cancels a pending reaction; a reaction
// never starts while anything is pending.
async function ask(
  $: EngineInterface,
  who: Who,
  bones: Bones,
  prompt: string,
  kind: 'react' | 'reply',
): Promise<string | null> {
  if (kind === 'react' && inFlight) return null
  if (kind === 'reply') inFlight?.controller.abort()
  const mine = { controller: new AbortController(), kind }
  inFlight = mine
  try {
    const system = personaSystem(who.soul, bones, await contextLines($, who))
    // A reply may have aborted this call while the context lines were read.
    if (mine.controller.signal.aborted) return null
    const result = await $.model.complete(
      { model: 'haiku', system, prompt, maxTokens: 80, timeoutMs: 8000 },
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

// Talk, pet, hello and the toys: answered even when muted, at most one model call per 5 s. A reply
// that lands on an announcement follows it in the same bubble, so a pet that earns Good friend
// still says so (Progression spec section 4). `fallback` is said when the model isn't asked or
// doesn't answer; without one, a canned line is.
async function reply($: EngineInterface, who: Who, prompt: string, fallback?: string) {
  const bones = bonesFor(who, (await read($, record))?.buddies ?? [])
  const now = await $.clock.now()
  const last = await read($, lastReplyAt)
  await update($, lastReplyAt, () => now)
  const text = now - last < REPLY_FLOOR_MS ? null : await ask($, who, bones, prompt, 'reply')
  await sayAfterNews($, text ?? fallback ?? cannedLine(bones, cannedCount++, Math.random()))
}

// Says `line`, after an announcement still showing, in the same bubble (Progression spec section 4).
async function sayAfterNews($: EngineInterface, line: string) {
  const news = await newsShowing($)
  await showBubble($, news === null ? line : `${news} ${line}`, news ?? undefined)
}

// A pet or a talk: counted and saved before the reply is asked for. A save in progress holds the
// soothe in neither the queue nor the record, so a reply asked for meanwhile would hear the old mood.
async function soothe($: EngineInterface, event: CountEvent, who: Who, prompt: string, fallback?: string) {
  try {
    await countAndFlush($, event, ['soothe'])
  } finally {
    await reply($, who, prompt, fallback)
  }
}

// The journal line a quip carries, if any (Memory spec section 4), noted in `recalled` so the
// same memory isn't carried again within the hour. A throw costs the memory, never the quip.
function quipMemory(journal: readonly Moment[] | undefined, facts: TurnFacts, now: number, bones: Bones): string | null {
  try {
    const m = recall({ journal, facts, now, stats: bones.stats, roll: Math.random(), pick: Math.random(), recalled })
    if (!m) return null
    recalled = { ...recalled, [momentKey(m)]: now }
    return memoryLine(m, now)
  } catch {
    return null
  }
}

// The journal lines a talk carries (Memory spec section 4). A throw costs the memories, never the reply.
async function talkMemoryLines($: EngineInterface, journal: readonly Moment[] | undefined): Promise<string[]> {
  try {
    return talkMemories(journal, await $.clock.now())
  } catch {
    return []
  }
}

// Carries the stretch on past a finished main turn, and says whether a break is now due. A throw
// costs the watch, never the reaction.
async function watchStretch($: EngineInterface, durationMs: number): Promise<boolean> {
  try {
    const end = await $.clock.now()
    stretch = nextStretch(stretch, end - durationMs, end)
    return breakDue(stretch, end)
  } catch {
    return false
  }
}

// The reaction slot a finished main turn has (Interaction spec section 6): the rubber duck when a
// tool keeps failing, else a break nudge when one is due, else a quip. A turn with a nudge to make
// waits for its own save first, which may announce something: the nudge then sees the announcement
// and stays due, instead of being spent on a line the announcement replaces. `flushed` settles
// whether the save worked or threw. Any other turn's quip goes at once. `ended` is the turn's
// number, as turnNo counted it.
async function respond(
  $: EngineInterface,
  summary: TurnSummary,
  facts: TurnFacts,
  duck: DuckDue | null,
  flushed: Promise<void>,
  ended: number,
) {
  const breakIsDue = await watchStretch($, summary.durationMs)
  if (duck || breakIsDue) await flushed
  if (duck && (await nudgeDuck($, duck, ended))) return
  if (await nudgeBreak($)) return
  await react($, summary, facts)
}

// The rubber-duck offer (Interaction spec section 4): one Haiku call in the turn's reaction slot,
// ignoring the quip cooldown but at most once in 30 minutes, and then duck mode. Returns whether
// it took the turn's reaction slot.
async function nudgeDuck($: EngineInterface, duck: DuckDue, ended: number): Promise<boolean> {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return false
  const now = await $.clock.now()
  const say = shouldNudge({
    mode: saved.mode,
    inFlight: inFlight !== null,
    newsUp: (await newsShowing($)) !== null,
    now,
    lastNudgeAt: await read($, lastNudgeAt),
  })
  if (!say) return false
  // The same failures never nudge twice, and the next quip waits out a full cooldown. A turn that
  // ended while this one's save was slow has put its own failures in prevFails; those stay.
  if (turnNo === ended) prevFails = {}
  await update($, lastNudgeAt, () => now)
  await update($, lastQuipAt, () => now)
  const buddy = activeBuddy(saved)
  const name = buddy.soul.name
  const replied = await read($, lastReplyAt)
  const text = await ask($, buddy, bonesFor(buddy, saved.buddies), duckPrompt(name, duck.tool, duck.n), 'react')
  // A reply that came in meanwhile wins, whether it cut the call short or, inside its 5 s floor,
  // asked nothing; so does a swap, which the offer was not for. An answer that comes back over an
  // announcement is dropped.
  if ((await read($, lastReplyAt)) !== replied) return true
  if ((await read($, record))?.active !== saved.active) return true
  if ((await newsShowing($)) !== null) return true
  await showBubble($, text ?? duckFallback(name, duck.tool, duck.n))
  const shown = await $.clock.now()
  await update($, duckTool, () => duck.tool)
  await update($, duckUntil, () => shown + DUCK_MS)
  return true
}

// The duck line a talk carries while duck mode lasts; the talk keeps duck mode for 15 minutes
// more (Interaction spec section 4). Null once it has run out. A throw costs the line, never the
// reply.
async function duckTalk($: EngineInterface): Promise<string | null> {
  try {
    const now = await $.clock.now()
    const tool = await read($, duckTool)
    if (tool === null || now >= (await read($, duckUntil))) return null
    await update($, duckUntil, () => now + DUCK_MS)
    return duckLine(tool)
  } catch {
    return null
  }
}

// A break nudge, once the stretch has run long enough (Interaction spec section 5): a yawn and a
// canned line, no model call, only when on. One that can't be said now, with an announcement up or
// a model call in flight, stays due. Returns whether it took the turn's reaction slot.
async function nudgeBreak($: EngineInterface): Promise<boolean> {
  const saved = await read($, record)
  const now = await $.clock.now()
  const run = stretch
  if (!saved || saved.mode !== 'on' || (await read($, hatching)) || !run || !breakDue(run, now)) return false
  if (inFlight !== null || (await newsShowing($)) !== null) return false
  // A turn that ended meanwhile has carried the stretch on, so the mark goes on the current one, if
  // it is still this run.
  if (stretch?.start === run.start) stretch = { ...stretch, nudgedAt: now }
  await feel($, [], 'yawn')
  await showBubble($, breakLine(cannedCount++, now - run.start))
  return true
}

// A finished main turn: speak only when shouldQuip says so, never muted, never while a call is
// pending. A quip may call back to a journal moment.
async function react($: EngineInterface, summary: TurnSummary, facts: TurnFacts) {
  const saved = await read($, record)
  if (!saved || (await read($, hatching))) return
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy, saved.buddies)
  const now = await $.clock.now()
  const speak = shouldQuip({
    mode: saved.mode,
    inFlight: inFlight !== null,
    now,
    lastQuipAt: await read($, lastQuipAt),
    summary,
    roll: Math.random(),
    stats: bones.stats,
  })
  if (!speak) return
  await update($, lastQuipAt, () => now)
  const memory = quipMemory(buddy.journal, facts, now, bones)
  const text = await ask($, buddy, bones, reactionPrompt(summary, memory), 'react')
  // An announcement keeps the bubble: a quip that comes back over one is dropped.
  if (text && (await newsShowing($)) === null) await showBubble($, text)
}

async function hatch($: EngineInterface, kind: 'hatch' | 'reroll'): Promise<string> {
  const seed = crypto.randomUUID()
  const bones = rollBones(seed)
  await update($, hatching, () => true)
  try {
    // A new buddy is shown as itself, not mid-tour. Adopting it clears the rough turns.
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
    // Refused: nothing was written or adopted, so there is no buddy to say hello.
    if (note !== null && note !== SAVE_FAILED) return note
    await update($, bubble, () => null)
    later($, () => reply($, born, HELLO_PROMPT))
    return note ?? `${soul.name}, ${withArticle(bones.rarity)}${bones.shiny ? ' shiny' : ''} ${bones.species}, hatched.`
  } finally {
    // The egg never stays out, whatever went wrong above.
    await update($, hatching, () => false)
  }
}

async function runBuddy($: EngineInterface, parsed: Parsed): Promise<string | undefined> {
  if (parsed.sub === 'usage') return USAGE
  const stored = await current($)
  if (stored.kind === 'none') return parsed.sub === 'show' ? hatch($, 'hatch') : NO_BUDDY
  if (stored.kind !== 'ok') return refusal(stored) ?? undefined
  const saved = stored.saved
  // Another session may have changed the store since this one last looked.
  await adopt($, saved)
  const buddy = activeBuddy(saved)
  const bones = bonesFor(buddy, saved.buddies)
  const name = buddy.soul.name
  const who = `${name}, ${bones.rarity} ${bones.species}`
  const hidden = `${name} is hidden. Run /buddy to bring it back.`
  switch (parsed.sub) {
    case 'show': {
      const note = await commit($, { kind: 'mode', mode: 'on' })
      later($, () => reply($, buddy, HELLO_PROMPT))
      return note ?? `${who}, is here.`
    }
    case 'pet': {
      if (saved.mode === 'off') return hidden
      const now = await read($, tick)
      await update($, heartsUntil, () => now + HEART_TICKS)
      later($, () => soothe($, { kind: 'pet' }, buddy, PET_PROMPT))
      return undefined
    }
    case 'feed': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const now = await $.clock.now()
      // Fed in the last 10 minutes: a canned no-thanks, with nothing eaten or counted.
      if (isFull(await read($, lastFedAt), now)) {
        await sayAfterNews($, fullLine(cannedCount++))
        return undefined
      }
      const snack = snackOf(Math.random())
      const t = await read($, tick)
      await update($, lastFedAt, () => now)
      await update($, snackShown, () => ({ kind: snack, untilTick: t + SNACK_TICKS }))
      // Care, like a pet: counted, it eases a sulk, then the reply.
      later($, () => soothe($, { kind: 'pet' }, buddy, feedPrompt(snack), feedFallback(snack)))
      return undefined
    }
    case 'play': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const played = play({ name, game: parsed.game, pick: parsed.pick, roll: Math.random })
      if (played.outcome === 'win') await feel($, [], 'celebrate')
      // Care, like a pet: counted, it eases a sulk, then the buddy has its say about the game.
      later($, () => soothe($, { kind: 'pet' }, buddy, playPrompt(played), playFallback(played.outcome, cannedCount++)))
      return played.line
    }
    case 'card': {
      const target = targetOf(saved, parsed.target, 'card')
      if ('reply' in target) return target.reply
      await update($, cardSeed, () => target.seed)
      const opened = await $.ui.open({ id: CARD, title: 'Buddy', closeOnEscape: true })
      // A surface that places no panes gets the card as text instead.
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      const progress = cardProgress(saved, shown)
      return [
        ...cardLines(shown.soul, dressed(shown, saved), saved.rerolls, progress),
        streakLine(saved.you, await countsOf($, shown)),
        achievementsText(progress.earned.length),
      ].join('\n')
    }
    case 'journal': {
      const target = targetOf(saved, parsed.target, 'journal')
      if ('reply' in target) return target.reply
      await update($, journalSeed, () => target.seed)
      const opened = await $.ui.open({ id: JOURNAL, title: 'Journal', closeOnEscape: true })
      // A surface that places no panes gets the newest ten as text instead.
      if (opened.isPlaced) return undefined
      const shown = shownBuddy(saved, target.seed)
      return journalLines(shown.soul.name, shown.journal, await $.clock.now()).join('\n')
    }
    case 'dex': {
      const opened = await $.ui.open({ id: DEX, title: 'Buddydex', closeOnEscape: true })
      // A surface that places no panes gets the count and the newest ten as text instead.
      if (opened.isPlaced) return undefined
      return dexLines(saved, await $.clock.now()).join('\n')
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
    case 'swap': {
      if (await read($, hatching)) return EGG
      const found = findBuddy(saved, parsed.target)
      if (found.kind !== 'one') return notFound(saved, parsed.target, found, 'swap')
      if (found.seed === saved.active) return `${name} is already here.`
      // The returning buddy is shown as itself, not mid-tour.
      await update($, tourStart, () => null)
      const note = await commit($, { kind: 'swap', seed: found.seed })
      // Refused: nothing was written or adopted, so nobody is back to say hello.
      if (note !== null && note !== SAVE_FAILED) return note
      const back = shownBuddy((await read($, record)) ?? saved, found.seed)
      // A card or journal that was pinned to this buddy now follows the active one, as targetOf
      // answers null for it, so the next swap carries the panes along.
      await update($, cardSeed, seed => (seed === found.seed ? null : seed))
      await update($, journalSeed, seed => (seed === found.seed ? null : seed))
      await update($, bubble, () => null)
      later($, () => reply($, back, HELLO_PROMPT))
      return note ?? `${back.soul.name} is back.`
    }
    case 'rename': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const refused = renameRefusal(parsed.name, name)
      if (refused) return refused
      const note = await commit($, { kind: 'rename', seed: buddy.seed, name: parsed.name })
      // Refused: nothing was written or adopted.
      if (note !== null && note !== SAVE_FAILED) return note
      const renamed = shownBuddy((await read($, record)) ?? saved, buddy.seed)
      later($, () => reply($, renamed, renamePrompt(name, parsed.name), renameFallback(parsed.name)))
      return note ?? `${name} is now ${parsed.name}.`
    }
    case 'hat': {
      if (await read($, hatching)) return EGG
      if (saved.mode === 'off') return hidden
      const can = wearable(buddy, saved)
      const worn = wornHat(buddy, saved)
      if (parsed.hat === undefined) return hatList(name, worn, can)
      const choice = hatChoice({ name, words: parsed.hat, worn, can })
      if ('reply' in choice) return choice.reply
      const hat = choice.wear
      const note = await commit($, { kind: 'hat', seed: buddy.seed, hat })
      // Refused: nothing was written or adopted.
      if (note !== null && note !== SAVE_FAILED) return note
      later($, () => reply($, buddy, hatPrompt(hat), hatFallback(hat)))
      return note ?? woreLine(name, hat)
    }
    case 'debug': {
      if (saved.mode === 'off') return hidden
      const stage = parsed.stage ?? 'adult'
      const now = await read($, tick)
      await update($, tourStage, () => stage)
      await update($, tourStart, () => now)
      return `Touring all ${TOUR_STEPS} species as ${stage}s with their reactions, then the holidays and moods. Run /buddy debug off to stop.`
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
    sayAt: 0,
    prop: null,
  }
}

// The moment as it really is: the mood with this session's unsaved events, a pose still running,
// idle time, and what the clock says about night and holidays.
async function liveScene(
  $: EngineInterface,
  buddy: Buddy,
  bones: Scene['bones'],
  stage: Stage,
  t: number,
  heartsFrame: number | null,
  saying: boolean,
): Promise<Scene> {
  const now = await $.clock.now()
  const day = dayInfo(now, buddy.soul.hatchedAt)
  const posed = await read($, posing)
  return {
    bones,
    stage,
    tick: t,
    snack: await read($, snackShown),
    duck: now < (await read($, duckUntil)),
    mood: await moodNow($, buddy, now),
    pose: posed && t < posed.untilTick ? posed.kind : null,
    idleTicks: t - (await read($, lastActive)),
    night: day.night,
    holiday: day.holiday,
    heartsFrame,
    saying,
  }
}

async function buddyLook($: EngineInterface, saved: Saved, t: number): Promise<Look> {
  const buddy = activeBuddy(saved)
  // A running /buddy debug tour dresses the real buddy up; nothing saved changes.
  const started = await read($, tourStart)
  const tour = started === null ? null : tourAt(t - started, await read($, tourStage))
  const own = bonesFor(buddy, saved.buddies)
  const bones = tour ? { ...own, ...tour.look } : own
  // The tour draws the stage it was asked for; otherwise the buddy is drawn at its own.
  const stage = tour ? tour.stage : stageOf(levelOf(buddy.counts))
  const name = tour ? tour.name : buddy.soul.name
  const animTick = tour ? tour.tick : t
  const heartsUntilTick = await read($, heartsUntil)
  const heartsFrame = t < heartsUntilTick ? t : null
  const said = await read($, bubble)
  const saying = said !== null && t < said.untilTick
  const scene: Scene = tour
    ? {
        bones,
        stage,
        tick: animTick,
        mood: tour.mood,
        pose: tour.pose,
        idleTicks: 0,
        night: false,
        holiday: tour.holiday,
        heartsFrame,
        saying,
      }
    : await liveScene($, buddy, { ...own, hat: wornHat(buddy, saved) }, stage, t, heartsFrame, saying)
  const drawn = draw(scene)
  const { label, stars } = nameLine(name, bones, tour ? null : levelOf(buddy.counts))
  const sprite = spriteTint(bones, animTick)
  return {
    sprite: drawn.sprite,
    face: drawn.face,
    name,
    label,
    stars,
    starColor: RARITY[bones.rarity].color,
    spriteColor: sprite.color,
    spriteBold: sprite.bold,
    say: saying ? said.text : null,
    sayAt: saying ? (t - said.fromTick) / (said.untilTick - said.fromTick) : 0,
    prop: drawn.prop,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'buddy',
        description: 'Hatch, pet, or manage your terminal buddy',
        argumentHint:
          '[pet | feed | play [game] | card [who] | journal [who] | dex | swap <who> | rename <name> | hat [hat] | mute | unmute | off | reroll [confirm]]',
        immediate: true,
      })
    } catch {
      // A refused registration costs the slash command, not the buddy on screen.
    }
    try {
      // A reload in the middle of a hatch leaves the egg flag set with nobody to clear it.
      await update($, hatching, () => false)
      // A session start is activity: a session never opens on a sleeping buddy.
      await stir($)
      // A write that failed before a reload left the only copy in state: current() keeps it.
      const stored = await current($)
      const saved = stored.kind === 'ok' ? stored.saved : null
      await update($, record, () => saved)
      if (saved && saved.mode !== 'off') {
        startTimer($)
        later($, () => visitToday($))
      }
    } catch {
      // The buddy never holds up a session.
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    try {
      await stir($)
      return { text: await runBuddy($, parseSub(e.args)) }
    } catch {
      return { text: 'Your buddy hit a snag. Try again.' }
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      // Any tool call is activity, a subagent's included: the session is busy either way.
      later($, () => stir($))
      // Main conversation only: a subagent's calls never reach the buddy's reactions or counts.
      if (e.agentId === undefined) {
        tally[e.tool] = (tally[e.tool] ?? 0) + 1
        const failed = ran.deny === undefined && ran.isError === true
        if (failed) failedTools.push(e.tool)
        // A denied call never ran, so it isn't counted, and it neither extends nor ends a run.
        if (ran.deny === undefined) {
          turnCalls = addCall(turnCalls, toolGroup(e.tool), failed)
          later($, () => count($, { kind: 'call', tool: e.tool, failed }))
        }
        if (failed) {
          const turn = turnNo
          later($, () => feel($, ['fail'], 'flinch'))
          later($, () => speakUp($, turn))
        }
      }
    } catch {
      // Counting never changes a tool call.
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      later($, () => stir($))
      if (e.agentId === undefined) {
        const summary: TurnSummary = { reason: e.reason, durationMs: e.durationMs, tools: tally, failed: failedTools }
        const facts = turnFacts(e.reason, e.durationMs, turnCalls, roughTurns)
        // Judged before this turn's failures take the last turn's place (Interaction spec section 4).
        const duck = duckDue(prevFails, failedTools)
        prevFails = failsByTool(failedTools)
        tally = {}
        failedTools = []
        turnCalls = noCalls()
        roughTurns = isRough(facts) ? roughTurns + 1 : 0
        const ended = ++turnNo
        const turn: CountEvent = { kind: 'turn', reason: e.reason, durationMs: e.durationMs }
        const felt = turnMood(e.reason, e.durationMs, summary.failed.length)
        const kind = e.reason === 'error' ? 'flinch' : felt === 'longClean' ? 'celebrate' : null
        // Settles when the save has finished, whether it worked or threw (`later` swallows the throw).
        const flushed = new Promise<void>(done => {
          later($, () => countAndFlush($, turn, felt ? [felt] : [], kind, facts).finally(done))
        })
        later($, () => respond($, summary, facts, duck, flushed, ended))
      }
    } catch {
      // A reaction is never worth breaking a turn over.
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      later($, () => stir($))
      const saved = await read($, record)
      const buddy = saved && saved.mode !== 'off' ? activeBuddy(saved) : null
      const fromPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      // A prompt carrying images or files is a request for Claude, whatever it starts with.
      const bare = !e.attachments || e.attachments.length === 0
      const message = buddy && fromPerson && bare ? matchAddress(buddy.soul.name, e.text) : null
      if (buddy && message !== null) {
        later($, async () => {
          const prompt = talkPrompt(message, await talkMemoryLines($, buddy.journal), await duckTalk($))
          await soothe($, { kind: 'talk' }, buddy, prompt)
        })
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
        return <Text wrap="truncate-end">{compactLine(view.face, view.name, view.say, e.props.bodyColumns, view.sayAt)}</Text>
      }

      const rows = bandRows(view.sprite, view.say, e.props.bodyColumns, view.sayAt)
      const right = rightRuns(rows.bubble, view.prop)
      const nameRow = (
        <Box>
          <Text dimColor wrap="truncate-end">{view.label}</Text>
          <Text {...tint(view.starColor)}>{view.stars}</Text>
        </Box>
      )

      // The desktop's Text is proportional, so its art is monospace SVG text instead.
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        const art = bandSvg({ sprite: rows.sprite, right, color: view.spriteColor, bold: view.spriteBold })
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
              {(right[i] ?? []).map(run => (
                <Text {...tint(run.color)}>{run.text}</Text>
              ))}
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

      const buddy = shownBuddy(saved, await read($, cardSeed))
      const bones = dressed(buddy, saved)
      const progress = cardProgress(saved, buddy)
      const history = { you: saved.you, counts: await countsOf($, buddy) }
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return (
          <Svg
            source={cardSvg(buddy.soul, bones, saved.rerolls, history, progress)}
            alt={cardAlt(buddy.soul, bones, saved.rerolls, history, progress)}
          />
        )
      }

      // The card is the buddy as it rolled: no pose, sleep, mood, hearts or holiday.
      const t = await read($, tick)
      const sprite = spriteTint(bones, t)
      const starColor = RARITY[bones.rarity].color
      const { stars } = nameLine(buddy.soul.name, bones)
      const header = (
        <Box flexDirection="column">
          <Box>
            <Text bold>{buddy.soul.name}</Text>
            <Text {...tint(starColor)}>{'  ' + stars}</Text>
          </Box>
          <Text>{levelText(progress)}</Text>
          <Text dimColor>
            {`${bones.rarity} ${bones.species}${bones.shiny ? ' (shiny)' : ''}   Hat: ${bones.hat}   Eyes: ${bones.eye}`}
          </Text>
          <Text>{buddy.soul.personality}</Text>
        </Box>
      )
      const retired = progress.retiredAt ? `   Retired ${progress.retiredAt.slice(0, 10)}` : ''
      const footer = (
        <Text dimColor>{`Hatched ${buddy.soul.hatchedAt.slice(0, 10)}   Rerolls: ${saved.rerolls}${retired}`}</Text>
      )
      const cells = Math.max(8, Math.min(30, e.props.bodyColumns - 18))
      return (
        <Box flexDirection="column">
          {portrait(bones, progress.stage, t).map(row => (
            <Text {...tint(sprite.color)} bold={sprite.bold}>
              {row}
            </Text>
          ))}
          {header}
          <Text> </Text>
          {STATS.map(s => (
            <Box>
              <Text dimColor={s === bones.low}>{s.padEnd(10) + ' '}</Text>
              <Text {...tint(starColor)}>{meter(bones.stats[s], cells)}</Text>
              <Text bold={s === bones.peak} dimColor={s === bones.low}>
                {' ' + String(bones.stats[s]).padStart(3) + (s === bones.peak ? ' ★' : '')}
              </Text>
            </Box>
          ))}
          <Text> </Text>
          {footer}
          <Text dimColor>{streakLine(history.you, history.counts)}</Text>
          <Text dimColor>{achievementsText(progress.earned.length)}</Text>
          {progress.earned.length > 0 ? [<Text>{progress.earned.join(' · ')}</Text>] : []}
        </Box>
      )
    } catch {
      return next(e)
    }
  })

  // The journal pane (Memory spec section 5): the shown buddy's saved moments, newest first.
  on('ui.render', { component: 'Pane', requestId: JOURNAL }, async ($, e, next) => {
    try {
      const { Box, Text } = $.ui.resolve(e)
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const buddy = shownBuddy(saved, await read($, journalSeed))
      const name = buddy.soul.name
      const rows = journalRows(buddy.journal, await $.clock.now())
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={journalSvg(name, bonesFor(buddy, saved.buddies), rows)} alt={journalAlt(name, rows)} />
      }

      return (
        <Box flexDirection="column">
          <Text bold>{journalHeader(name)}</Text>
          {rows.length === 0
            ? [<Text dimColor>{emptyJournal(name)}</Text>]
            : rows.map(row => (
                <Box>
                  <Text dimColor>{row.age + '   '}</Text>
                  <Text>{row.text}</Text>
                </Box>
              ))}
        </Box>
      )
    } catch {
      return next(e)
    }
  })

  // The dex pane (Progression spec section 6): every buddy you've had, oldest first.
  on('ui.render', { component: 'Pane', requestId: DEX }, async ($, e, next) => {
    try {
      const { Box, Text } = $.ui.resolve(e)
      const saved = await read($, record)
      if (!saved) return <Text dimColor>{NO_BUDDY}</Text>

      const rows = dexRows(saved, await $.clock.now())
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={dexSvg(rows)} alt={dexAlt(rows)} />
      }

      const width = `#${rows.length}`.length
      return (
        <Box flexDirection="column">
          <Text bold>Buddydex</Text>
          {rows.map(row => (
            <Text bold={row.active}>{dexText(row, width)}</Text>
          ))}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
