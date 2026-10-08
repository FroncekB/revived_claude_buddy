import { expect, test } from 'claude-code/testing'

import { HOLIDAYS, dayInfo, easter, hatchYears, holidayOn, isNight, lastWeekday, nthWeekday } from './calendar'

// Hatched at local noon on 2020-07-15, so no test date below is its anniversary.
const HATCHED = new Date(2020, 6, 15, 12).toISOString()
const on = (day: string) => holidayOn(day, HATCHED)?.id ?? null

test('every holiday lands on its 2026 and 2027 dates', () => {
  const cases: [string, string][] = [
    ['2026-01-01', 'newyear'], ['2026-12-31', 'newyear'],
    ['2026-01-19', 'mlk'], ['2027-01-18', 'mlk'],
    ['2026-02-16', 'presidents'], ['2027-02-15', 'presidents'],
    ['2026-04-05', 'easter'], ['2027-03-28', 'easter'],
    ['2026-04-01', 'aprilfools'],
    ['2026-05-25', 'memorial'], ['2027-05-31', 'memorial'],
    ['2026-06-19', 'juneteenth'],
    ['2026-07-04', 'july4'],
    ['2026-09-07', 'labor'], ['2027-09-06', 'labor'],
    ['2026-10-12', 'columbus'], ['2027-10-11', 'columbus'],
    ['2026-11-11', 'veterans'],
    ['2026-11-26', 'thanksgiving'], ['2027-11-25', 'thanksgiving'],
  ]
  for (const [day, id] of cases) expect([day, on(day)]).toEqual([day, id])
})

test('the days around each one-day holiday are plain days', () => {
  const plain = ['2026-01-18', '2026-01-20', '2026-04-04', '2026-04-06', '2026-07-03', '2026-07-05', '2026-11-25', '2026-11-27', '2026-10-07']
  for (const day of plain) expect([day, on(day)]).toEqual([day, null])
})

test('Halloween and the winter holidays include both ends of their ranges', () => {
  expect(on('2026-10-24')).toBeNull()
  expect(on('2026-10-25')).toBe('halloween')
  expect(on('2026-10-31')).toBe('halloween')
  expect(on('2026-11-01')).toBeNull()
  expect(on('2026-12-19')).toBeNull()
  expect(on('2026-12-20')).toBe('winter')
  expect(on('2026-12-26')).toBe('winter')
  expect(on('2026-12-27')).toBeNull()
  expect(on('2026-12-30')).toBeNull()
  expect(on('2027-01-02')).toBeNull()
})

test('Easter beats April Fools when they share a day', () => {
  expect(easter(2029)).toEqual([4, 1])
  expect(on('2029-04-01')).toBe('easter')
})

test('weekday rules count from the start or the end of the month', () => {
  expect(nthWeekday(2026, 1, 1, 3)).toBe(19)
  expect(nthWeekday(2026, 11, 4, 4)).toBe(26)
  expect(lastWeekday(2027, 5, 1)).toBe(31)
  expect(lastWeekday(2026, 5, 1)).toBe(25)
})

test('a hatch day comes each year after the first, and beats a holiday', () => {
  const july4 = new Date(2025, 6, 4, 12).toISOString()
  expect(hatchYears(july4, '2025-07-04')).toBeNull()
  expect(hatchYears(july4, '2026-07-04')).toBe(1)
  expect(holidayOn('2026-07-04', july4)).toEqual({
    id: 'hatchday',
    name: 'Hatch day',
    line: 'Today is your hatch day: you are 1 year old.',
  })
  expect(holidayOn('2028-07-04', july4)?.line).toBe('Today is your hatch day: you are 3 years old.')
  const leapling = new Date(2024, 1, 29, 12).toISOString()
  expect(hatchYears(leapling, '2025-02-28')).toBe(1)
  expect(hatchYears(leapling, '2025-03-01')).toBeNull()
  expect(hatchYears(leapling, '2028-02-29')).toBe(4)
  expect(hatchYears(leapling, '2028-02-28')).toBeNull()
  expect(hatchYears('not a date', '2026-07-04')).toBeNull()
})

test('night runs from midnight to six in the morning, local time', () => {
  expect(isNight(new Date(2026, 9, 7, 0, 0).getTime())).toBe(true)
  expect(isNight(new Date(2026, 9, 7, 5, 59).getTime())).toBe(true)
  expect(isNight(new Date(2026, 9, 7, 6, 0).getTime())).toBe(false)
  expect(isNight(new Date(2026, 9, 7, 23, 59).getTime())).toBe(false)
  expect(dayInfo(new Date(2026, 6, 4, 0, 30).getTime(), HATCHED)).toEqual({
    holiday: { id: 'july4', name: 'Independence Day', line: 'Today is Independence Day.' },
    night: true,
  })
})

test('every holiday has a name and a persona line', () => {
  expect(HOLIDAYS).toHaveLength(14)
  for (const h of HOLIDAYS) {
    expect(h.name.length).toBeGreaterThan(0)
    expect(h.line).toMatch(/^(Today is|It is) .+\.$/)
  }
})

test("New Year's reads as a range, since the persona hears it on Dec 31 too", () => {
  expect(holidayOn('2026-12-31', HATCHED)?.line).toBe("It is New Year's.")
})
