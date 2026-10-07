import { expect, test } from 'claude-code/testing'

import { EYES, HATS, SPECIES } from './roll'
import {
  BLANK, CONFETTI, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W, SPRITE_W, ZZZ, bodyRows,
  eggRows, faceFor, fillEyes, frameAt, spriteRows, topRow,
} from './sprites'
import type { Prop } from './sprites'

test('every species frame is 4 body rows of at most 12 columns for every eye', () => {
  const over: string[] = []
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = bodyRows(species, frame)
      if (rows.length !== 4) over.push(`${species} frame ${frame}: ${rows.length} rows`)
      for (const eye of [...EYES, '-']) {
        for (const row of rows) {
          const drawn = fillEyes(row, eye)
          if (drawn.length > SPRITE_W) over.push(`${species} frame ${frame}: "${drawn}"`)
        }
      }
    }
  }
  expect(over).toEqual([])
})

test('a drawn sprite is exactly 5 rows of 12 columns with the hat row on top', () => {
  for (const species of SPECIES) {
    for (const frame of [0, 1, 2] as const) {
      const rows = spriteRows({ species, eye: '·', frame, top: BLANK })
      expect(rows).toHaveLength(5)
      expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
      expect(rows[0]).toBe(BLANK)
    }
  }
})

test('hats, hearts and egg frames fit the same 12-column box', () => {
  for (const hat of HATS) expect(HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
  for (const row of HEARTS) expect(row.length).toBeLessThanOrEqual(SPRITE_W)
  for (const frame of [0, 1, 2] as const) {
    const egg = eggRows(frame)
    expect(egg).toHaveLength(5)
    expect(egg.every(r => r.length === SPRITE_W)).toBe(true)
  }
})

test('every compact face is at most 6 columns', () => {
  for (const species of SPECIES) expect(faceFor(species, '·').length).toBeLessThanOrEqual(6)
})

test('hearts beat the hat, and the hat beats the sparkle', () => {
  expect(topRow({ hat: 'crown', heartsFrame: 0, sparkle: 0 })).toContain('♥')
  expect(topRow({ hat: 'crown', heartsFrame: null, sparkle: 0 })).toBe(HAT_ART.crown.padEnd(SPRITE_W))
  expect(topRow({ hat: 'none', heartsFrame: null, sparkle: 0 }).trim()).toBe('*')
  expect(topRow({ hat: 'none', heartsFrame: null, sparkle: null })).toBe(BLANK)
})

test('the 16-tick cycle rests, fidgets twice and blinks once', () => {
  const cycle = Array.from({ length: 16 }, (_, t) => frameAt(t))
  expect(cycle.filter(f => f.frame === 1)).toHaveLength(1)
  expect(cycle.filter(f => f.frame === 2)).toHaveLength(1)
  expect(cycle.filter(f => f.blink)).toHaveLength(1)
  expect(frameAt(16)).toEqual(frameAt(0))
})

test('every species has a flinch, celebrate and sleep frame of 4 rows within 12 columns, each with an eye', () => {
  const bad: string[] = []
  for (const species of SPECIES) {
    for (const pose of POSES) {
      const rows = bodyRows(species, pose)
      if (rows.length !== 4) bad.push(`${species} ${pose}: ${rows.length} rows`)
      if (!rows.some(row => row.includes('{E}'))) bad.push(`${species} ${pose}: no eye`)
      for (const row of rows) {
        const drawn = fillEyes(row, POSE_EYE[pose])
        if (drawn.length > SPRITE_W) bad.push(`${species} ${pose}: "${drawn}"`)
      }
    }
  }
  expect(bad).toEqual([])
})

test('a posed sprite is 5 rows of 12 with the hat row on top, and differs from the rest frame', () => {
  for (const species of SPECIES) {
    const rest = spriteRows({ species, eye: '·', frame: 0, top: BLANK })
    for (const pose of POSES) {
      const rows = spriteRows({ species, eye: POSE_EYE[pose], frame: pose, top: BLANK })
      expect(rows).toHaveLength(5)
      expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
      expect(rows[0]).toBe(BLANK)
      expect(rows).not.toEqual(rest)
    }
  }
})

test('the pose eyes are none of the rolled eyes', () => {
  for (const pose of POSES) expect(EYES as readonly string[]).not.toContain(POSE_EYE[pose])
})

test('holiday hats fit the hat row, and every prop fits 5 rows by 10 columns with its paint inside it', () => {
  for (const hat of Object.values(HOLIDAY_HATS) as string[]) expect([hat, hat.length <= SPRITE_W]).toEqual([hat, true])
  for (const [id, prop] of Object.entries(PROPS) as [string, Prop][]) {
    expect([id, prop.art.length <= PROP_ROWS]).toEqual([id, true])
    for (const row of prop.art) expect([id, row, row.length <= PROP_W]).toEqual([id, row, true])
    const paint = prop.paint ?? []
    expect([id, paint.length <= prop.art.length]).toEqual([id, true])
    paint.forEach((row, i) => {
      expect([id, row, row.length <= prop.art[i]!.length]).toEqual([id, row, true])
      expect([id, row, /^[rygcbm ]*$/.test(row)]).toEqual([id, row, true])
    })
  }
})

test('the hat row: hearts, then confetti, then zZ, then a holiday hat, then the rolled hat', () => {
  const all = { hat: 'crown' as const, heartsFrame: 0, sparkle: 0, confetti: 0, zzz: 0, holidayHat: HOLIDAY_HATS.halloween! }
  expect(topRow(all)).toContain('♥')
  expect(topRow({ ...all, heartsFrame: null })).toBe(CONFETTI[0])
  expect(topRow({ ...all, heartsFrame: null, confetti: null })).toBe(ZZZ[0])
  expect(topRow({ ...all, heartsFrame: null, confetti: null, zzz: null })).toBe(HOLIDAY_HATS.halloween!.padEnd(SPRITE_W))
  expect(topRow({ ...all, heartsFrame: null, confetti: null, zzz: null, holidayHat: null })).toBe(
    HAT_ART.crown.padEnd(SPRITE_W),
  )
})

test('confetti alternates each tick and the z rises every 2 ticks', () => {
  const confetti = (t: number) => topRow({ hat: 'none', heartsFrame: null, sparkle: null, confetti: t })
  expect(confetti(0)).not.toBe(confetti(1))
  expect(confetti(0)).toBe(confetti(2))
  expect(CONFETTI.every(row => row.length === SPRITE_W)).toBe(true)
  const z = (t: number) => topRow({ hat: 'none', heartsFrame: null, sparkle: null, zzz: t }).trim()
  expect([0, 1, 2, 3, 4, 5, 6].map(z)).toEqual(['z', 'z', 'zZ', 'zZ', 'zZz', 'zZz', 'z'])
})
