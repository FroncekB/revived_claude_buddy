import { expect, test } from 'claude-code/testing'

import { ADULT } from './art-adult'
import { ELDER } from './art-elder'
import { HATCHLING } from './art-hatchling'
import { STAGES } from './progress'
import { EYES, HATS, SPECIES, fnv1a32 } from './roll'
import {
  BLANK, CONFETTI, EARNED_HATS, EARNED_HAT_ART, HAT_ART, HEARTS, HOLIDAY_HATS, POSES, POSE_EYE, PROPS, PROP_ROWS, PROP_W,
  SPRITE_W, ZZZ, bodyRows, eggRows, faceFor, fillEyes, frameAt, hatArt, headRow, spriteRows, topRow,
} from './sprites'
import type { Prop } from './sprites'

test('every frame at every stage is 4 body rows of at most 12 columns for every eye', () => {
  const over: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const frame of [0, 1, 2] as const) {
        const rows = bodyRows(species, stage, frame)
        if (rows.length !== 4) over.push(`${stage} ${species} frame ${frame}: ${rows.length} rows`)
        for (const eye of [...EYES, '-']) {
          for (const row of rows) {
            const drawn = fillEyes(row, eye)
            if (drawn.length > SPRITE_W) over.push(`${stage} ${species} frame ${frame}: "${drawn}"`)
          }
        }
      }
    }
  }
  expect(over).toEqual([])
})

test('a drawn sprite is exactly 5 rows of 12 columns at every stage', () => {
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const frame of [0, 1, 2] as const) {
        const rows = spriteRows({ species, stage, eye: '·', frame, top: BLANK })
        expect(rows).toHaveLength(5)
        expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
        expect(rows[0]).toBe(BLANK)
      }
    }
  }
})

test('hats, hearts and egg frames fit the same 12-column box', () => {
  for (const hat of HATS) expect(HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
  for (const hat of EARNED_HATS) expect(EARNED_HAT_ART[hat].length).toBeLessThanOrEqual(SPRITE_W)
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

test('every species has a flinch, celebrate and sleep frame at every stage, 4 rows within 12 columns, each with an eye', () => {
  const bad: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      for (const pose of POSES) {
        const rows = bodyRows(species, stage, pose)
        if (rows.length !== 4) bad.push(`${stage} ${species} ${pose}: ${rows.length} rows`)
        if (!rows.some(row => row.includes('{E}'))) bad.push(`${stage} ${species} ${pose}: no eye`)
        for (const row of rows) {
          const drawn = fillEyes(row, POSE_EYE[pose])
          if (drawn.length > SPRITE_W) bad.push(`${stage} ${species} ${pose}: "${drawn}"`)
        }
      }
    }
  }
  expect(bad).toEqual([])
})

test('a posed sprite is 5 rows of 12 at every stage, and differs from its rest frame', () => {
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      const rest = spriteRows({ species, stage, eye: '·', frame: 0, top: BLANK })
      for (const pose of POSES) {
        const rows = spriteRows({ species, stage, eye: POSE_EYE[pose], frame: pose, top: BLANK })
        expect(rows).toHaveLength(5)
        expect(rows.every(r => r.length === SPRITE_W)).toBe(true)
        expect(rows).not.toEqual(rest)
      }
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

test('an earned hat is worn on the hat row like a rolled one, and no roll gives one', () => {
  expect(topRow({ hat: 'hardhat', heartsFrame: null, sparkle: null })).toBe(EARNED_HAT_ART.hardhat.padEnd(SPRITE_W))
  expect(hatArt('crown')).toBe(HAT_ART.crown)
  for (const hat of EARNED_HATS) expect(HATS as readonly string[]).not.toContain(hat)
})

test('the adult art is the art every buddy had before 0.5, moved unchanged', () => {
  expect(fnv1a32(SPECIES.map(s => ADULT[s]).join('\n'))).toBe(0x2e0b7210)
})

test('the top row sits just above the head: row 0 for every adult', () => {
  expect(headRow(['    __', '  <(· )___', '   ( ._> /', "    '---'"])).toBe(0)
  expect(headRow(['', '    ,_', '   (·>', '  (__)'])).toBe(1)
  expect(headRow(['', '', '', ''])).toBe(0)
  for (const species of SPECIES) {
    const rows = spriteRows({ species, stage: 'adult', eye: '·', frame: 0, top: 'HAT' })
    expect([species, rows[0]]).toEqual([species, 'HAT'.padEnd(SPRITE_W)])
  }
})

test('nothing is drawn above the head in any frame, at any stage', () => {
  const bad: string[] = []
  for (const stage of STAGES) {
    for (const species of SPECIES) {
      const head = headRow(bodyRows(species, stage, 0))
      for (const frame of [0, 1, 2, ...POSES] as const) {
        const above = bodyRows(species, stage, frame).slice(0, head)
        if (above.some(row => row.trim() !== '')) bad.push(`${stage} ${species} ${frame}`)
      }
    }
  }
  expect(bad).toEqual([])
})

test('every hatchling drawn is small: at most 3 rows and 9 columns in every frame', () => {
  const bad: string[] = []
  for (const species of SPECIES.filter(s => HATCHLING[s] !== undefined)) {
    // Fidget A, the rest frame a column to the right, may reach 10.
    for (const frame of [0, 2, ...POSES] as const) {
      const rows = bodyRows(species, 'hatchling', frame).map(row => fillEyes(row, '·'))
      if (rows.filter(row => row.trim() !== '').length > 3) bad.push(`${species} ${frame}: over 3 rows`)
      if (rows.some(row => row.trimEnd().length > 9)) bad.push(`${species} ${frame}: over 9 columns`)
    }
  }
  expect(bad).toEqual([])
})

test('every elder drawn is drawn new: no frame is a copy of its adult frame', () => {
  const copied: string[] = []
  for (const species of SPECIES.filter(s => ELDER[s] !== undefined)) {
    for (const frame of [0, 2, ...POSES] as const) {
      const elder = bodyRows(species, 'elder', frame).join('\n')
      if (elder === bodyRows(species, 'adult', frame).join('\n')) copied.push(`${species} ${frame}`)
    }
  }
  expect(copied).toEqual([])
})
