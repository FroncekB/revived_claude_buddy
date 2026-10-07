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

export type Buddy = {
  seed: string
  soul: Soul
  retiredAt: string | null
  counts: Counts
  // Missing reads as neutral.
  mood?: Mood
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
    }
  }
}
