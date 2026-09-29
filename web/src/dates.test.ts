import { describe, expect, it } from 'vitest'
import { addDays, isValidISODate, mondayOf, weekCount } from './dates'

describe('mondayOf', () => {
  it('maps every day of a week to its Monday, including Sunday', () => {
    // 2026-01-05 is a Monday; Sunday 2026-01-04 belongs to the week before it.
    expect(mondayOf('2026-01-05')).toBe('2026-01-05')
    expect(mondayOf('2026-01-11')).toBe('2026-01-05')
    expect(mondayOf('2026-01-04')).toBe('2025-12-29')
  })

  it('crosses month and year boundaries', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29')
    expect(mondayOf('2026-03-01')).toBe('2026-02-23')
  })
})

describe('addDays', () => {
  it('is unaffected by DST changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-01-05', -7)).toBe('2025-12-29')
  })
})

describe('weekCount', () => {
  it('counts the weeks a range touches, not the days in it', () => {
    expect(weekCount('2025-12-29', '2026-01-16')).toBe(3)
    expect(weekCount('2026-01-04', '2026-01-05')).toBe(2) // Sun + Mon
    expect(weekCount('2026-01-05', '2026-01-05')).toBe(1)
  })
})

describe('isValidISODate', () => {
  it('rejects impossible and malformed dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false)
    expect(isValidISODate('2026-1-5')).toBe(false)
    expect(isValidISODate('')).toBe(false)
    expect(isValidISODate('2026-02-28')).toBe(true)
  })
})
