export type Mode = 'on' | 'muted' | 'off'

export type Soul = { name: string; personality: string; hatchedAt: string }

export type BuddyRecord = {
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

export type Bubble = { text: string; untilTick: number }

declare module 'claude-code' {
  interface PluginState {
    buddy: {
      record: BuddyRecord | null
      unsaved: boolean
      hatching: boolean
      tick: number
      bubble: Bubble | null
      heartsUntilTick: number
      // The tick /buddy debug started its tour on; null when no tour has run.
      tourStartTick: number | null
      lastQuipAt: number
      lastReplyAt: number
    }
  }
}
