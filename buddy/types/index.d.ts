export type Mode = 'on' | 'muted' | 'off'

export type Soul = { name: string; personality: string; hatchedAt: string }

export type BuddyRecord = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
}

export type Bubble = { text: string; fromTick: number; untilTick: number }

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
