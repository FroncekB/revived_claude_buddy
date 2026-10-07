// Holidays, hatch days and night (Alive spec section 5). Dates are the local calendar's,
// YYYY-MM-DD. Pure: no $.
import { localDay } from './ledger'

export type HolidayId =
  | 'newyear' | 'mlk' | 'presidents' | 'easter' | 'aprilfools' | 'memorial' | 'juneteenth' | 'july4'
  | 'labor' | 'columbus' | 'halloween' | 'veterans' | 'thanksgiving' | 'winter' | 'hatchday'

// `name` labels the debug tour; `line` goes into the persona prompt.
export type Holiday = { id: HolidayId; name: string; line: string }

const MONDAY = 1
const THURSDAY = 4

const weekdayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

// The date of the `n`th `weekday` (0 is Sunday) in month `m` (1 to 12).
export function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  return 1 + ((weekday - weekdayOf(y, m, 1) + 7) % 7) + 7 * (n - 1)
}

export function lastWeekday(y: number, m: number, weekday: number): number {
  const last = daysIn(y, m)
  return last - ((weekdayOf(y, m, last) - weekday + 7) % 7)
}

// Easter Sunday as [month, day], by the anonymous Gregorian algorithm.
export function easter(y: number): [number, number] {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return [Math.floor(n / 31), (n % 31) + 1]
}

type Rule = Holiday & { on: (y: number, m: number, d: number) => boolean }

const on = (month: number, date: number) => (_y: number, m: number, d: number) => m === month && d === date
const from = (month: number, first: number, last: number) => (_y: number, m: number, d: number) =>
  m === month && d >= first && d <= last

// In match order: the first that matches wins, so Easter beats April Fools when they share a day.
export const HOLIDAYS: readonly Rule[] = [
  {
    id: 'newyear', name: "New Year's", line: "Today is New Year's.",
    on: (_y, m, d) => (m === 12 && d === 31) || (m === 1 && d === 1),
  },
  {
    id: 'mlk', name: 'Martin Luther King Jr. Day', line: 'Today is Martin Luther King Jr. Day.',
    on: (y, m, d) => m === 1 && d === nthWeekday(y, 1, MONDAY, 3),
  },
  {
    id: 'presidents', name: "Presidents' Day", line: "Today is Presidents' Day.",
    on: (y, m, d) => m === 2 && d === nthWeekday(y, 2, MONDAY, 3),
  },
  {
    id: 'easter', name: 'Easter', line: 'Today is Easter.',
    on: (y, m, d) => {
      const [month, date] = easter(y)
      return m === month && d === date
    },
  },
  { id: 'aprilfools', name: "April Fools' Day", line: "Today is April Fools' Day.", on: on(4, 1) },
  {
    id: 'memorial', name: 'Memorial Day', line: 'Today is Memorial Day.',
    on: (y, m, d) => m === 5 && d === lastWeekday(y, 5, MONDAY),
  },
  { id: 'juneteenth', name: 'Juneteenth', line: 'Today is Juneteenth.', on: on(6, 19) },
  { id: 'july4', name: 'Independence Day', line: 'Today is Independence Day.', on: on(7, 4) },
  {
    id: 'labor', name: 'Labor Day', line: 'Today is Labor Day.',
    on: (y, m, d) => m === 9 && d === nthWeekday(y, 9, MONDAY, 1),
  },
  {
    id: 'columbus', name: "Columbus Day and Indigenous Peoples' Day",
    line: "Today is Columbus Day and Indigenous Peoples' Day.",
    on: (y, m, d) => m === 10 && d === nthWeekday(y, 10, MONDAY, 2),
  },
  { id: 'halloween', name: 'Halloween', line: 'It is Halloween week.', on: from(10, 25, 31) },
  { id: 'veterans', name: 'Veterans Day', line: 'Today is Veterans Day.', on: on(11, 11) },
  {
    id: 'thanksgiving', name: 'Thanksgiving', line: 'Today is Thanksgiving.',
    on: (y, m, d) => m === 11 && d === nthWeekday(y, 11, THURSDAY, 4),
  },
  { id: 'winter', name: 'Winter holidays', line: 'It is the winter holidays.', on: from(12, 20, 26) },
]

const parse = (day: string) => day.split('-').map(Number) as [number, number, number]
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// How many years old the buddy turns `today`, on each anniversary of the local date it hatched
// from its first on; null on any other day. Feb 29 falls on Feb 28 in other years.
export function hatchYears(hatchedAt: string, today: string): number | null {
  const born = Date.parse(hatchedAt)
  if (!Number.isFinite(born)) return null
  const [hy, hm, hd] = parse(localDay(born))
  const [y, m, d] = parse(today)
  if (y <= hy) return null
  const [month, date] = hm === 2 && hd === 29 && !isLeap(y) ? [2, 28] : [hm, hd]
  return m === month && d === date ? y - hy : null
}

export function hatchDay(years: number): Holiday {
  return {
    id: 'hatchday',
    name: 'Hatch day',
    line: `Today is your hatch day: you are ${years} year${years === 1 ? '' : 's'} old.`,
  }
}

// What `today` is: a hatch day first, then the first holiday that matches.
export function holidayOn(today: string, hatchedAt: string): Holiday | null {
  const years = hatchYears(hatchedAt, today)
  if (years !== null) return hatchDay(years)
  const [y, m, d] = parse(today)
  const rule = HOLIDAYS.find(h => h.on(y, m, d))
  return rule ? { id: rule.id, name: rule.name, line: rule.line } : null
}

// Night is local midnight to 05:59, when the buddy dozes off sooner.
export function isNight(ms: number): boolean {
  return new Date(ms).getHours() < 6
}

export function dayInfo(ms: number, hatchedAt: string): { holiday: Holiday | null; night: boolean } {
  return { holiday: holidayOn(localDay(ms), hatchedAt), night: isNight(ms) }
}
