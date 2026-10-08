export type Mode = 'on' | 'muted' | 'off'

export type Soul = { name: string; personality: string; hatchedAt: string }

// The schema 1 record (base spec section 3), read only to migrate it.
export type SavedV1 = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
}

export type ToolGroup = 'shell' | 'edit' | 'read' | 'web' | 'agent' | 'mcp' | 'other'

// One buddy's lifetime counts. Main-conversation events only.
export type Counts = {
  turns: number
  failedTurns: number
  longestTurnMs: number
  calls: Record<ToolGroup, number>
  failedCalls: number
  pets: number
  talks: number
}

// The person's own data: it carries across rerolls.
export type You = {
  lastDay: string | null
  streak: number
  bestStreak: number
  days: number
}

// A buddy's mood (Alive spec section 2): failures push the meter toward anxious, long clean
// turns toward smug, and days away leave a sulk. `at` is the time decay is measured from.
export type Mood = {
  meter: number
  sulk: number
  at: string
}

export type MoodEvent = 'fail' | 'clean' | 'longClean' | 'soothe'

// A notable moment in a buddy's life (Memory spec section 2), kept as data: its words are made
// when it is shown, so they can change without touching saves.
export type MomentKind = 'failRun' | 'longTurn' | 'busyTurn' | 'turns' | 'calls' | 'comeback' | 'away'

export type Moment = {
  // When the save or visit that wrote it happened.
  at: string
  kind: MomentKind
  // What the kind counts: the run, the minutes, the calls, the mark, the rough turns, the days.
  n: number
  // failRun only, when the whole run was in one group.
  group?: ToolGroup
}

// Records past the ones `counts` keeps: the longest run of failed calls in one turn and the most
// calls in one turn. They track the largest seen, whether or not it was logged.
export type Bests = {
  failRun: number
  calls: number
}

// One finished main turn, as the journal reads it (Memory spec section 3).
export type TurnFacts = {
  reason: 'answer' | 'aborted' | 'refusal' | 'error'
  durationMs: number
  // Tool calls that ran: a denied call never did.
  calls: number
  // The turn's longest run of consecutive failed calls, and its group; null when it spanned groups.
  failRun: number
  failRunGroup: ToolGroup | null
  // Rough turns in a row just before this one, in this session.
  afterRough: number
}

export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  // Missing reads as neutral.
  mood?: Mood
  // Oldest first, at most 20. Missing reads as empty.
  journal?: Moment[]
  // Missing reads as zeros.
  bests?: Bests
}

// The `$.store` key `buddy` (Foundation spec section 1).
export type Saved = {
  schema: 2
  mode: Mode
  rerolls: number
  active: string
  buddies: Buddy[]
  you: You
}

export type Bubble = { text: string; fromTick: number; untilTick: number }

declare module 'claude-code' {
  interface PluginState {
    buddy: {
      record: Saved | null
      unsaved: boolean
      hatching: boolean
      tick: number
      bubble: Bubble | null
      heartsUntilTick: number
      // The tick /buddy debug started its tour on; null when no tour has run.
      tourStartTick: number | null
      lastQuipAt: number
      lastReplyAt: number
      // Counts not yet saved, by buddy seed (Foundation spec section 2).
      pending: Record<string, Counts>
      // A flinch or celebrate and the tick it ends on (Alive spec section 4).
      pose: { kind: 'flinch' | 'celebrate'; untilTick: number } | null
      // The tick of the last activity, for idle sleep.
      lastActiveTick: number
      // Mood events not yet saved, by buddy seed (Alive spec section 2).
      pendingMood: Record<string, MoodEvent[]>
      // Finished main turns not yet saved, by buddy seed (Memory spec section 3).
      pendingTurns: Record<string, TurnFacts[]>
    }
  }
}
