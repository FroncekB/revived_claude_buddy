export type Mode = 'on' | 'muted' | 'off'

export type Soul = { name: string; personality: string; hatchedAt: string }

export type BuddyRecord = {
  schema: 1
  seed: string
  soul: Soul
  mode: Mode
  rerolls: number
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
      lastQuipAt: number
      lastReplyAt: number
    }
  }
}
