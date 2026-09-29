import { describe, expect, it } from 'vitest'
import { cellStatus, overStats, utilization, validateWeeklyHours, type CapacityData } from './capacity'

describe('cellStatus', () => {
  it('flags only work beyond capacity as over', () => {
    expect(cellStatus(45, 40)).toBe('over')
    expect(cellStatus(40, 40)).toBe('full')
    expect(cellStatus(32, 40)).toBe('ok')
    expect(cellStatus(0, 40)).toBe('idle')
  })

  it('treats any work against zero capacity as over, and nothing as idle', () => {
    expect(cellStatus(20, 0)).toBe('over')
    expect(cellStatus(0, 0)).toBe('idle')
  })
})

describe('utilization', () => {
  it('does not divide by zero capacity', () => {
    expect(utilization(20, 0)).toBeNull()
    expect(utilization(20, 40)).toBe(0.5)
  })
})

describe('overStats', () => {
  const data: CapacityData = {
    weeks: ['2026-01-05', '2026-01-12'],
    people: [
      { id: 1, name: 'A', weeklyHours: 40, allocated: [45, 40] },
      { id: 2, name: 'B', weeklyHours: 20, allocated: [30, 30] },
      { id: 3, name: 'C', weeklyHours: 0, allocated: [0, 5] },
    ],
  }

  it('counts over-allocated people per week and overall', () => {
    expect(overStats(data, (p) => p.weeklyHours)).toEqual({ perWeek: [2, 2], people: 3 })
  })

  it('recomputes from the capacity it is given (a pending edit)', () => {
    // Raising A to 50 and B to 30 clears them; C is still over.
    const pending: Record<number, number> = { 1: 50, 2: 30 }
    expect(overStats(data, (p) => pending[p.id] ?? p.weeklyHours)).toEqual({ perWeek: [0, 1], people: 1 })
  })
})

describe('validateWeeklyHours', () => {
  it('accepts 0 through 168 and rejects everything else', () => {
    expect(validateWeeklyHours('0')).toEqual({ ok: true, hours: 0 })
    expect(validateWeeklyHours(' 32.5 ')).toEqual({ ok: true, hours: 32.5 })
    expect(validateWeeklyHours('')).toMatchObject({ ok: false })
    expect(validateWeeklyHours('abc')).toMatchObject({ ok: false })
    expect(validateWeeklyHours('-1')).toMatchObject({ ok: false })
    expect(validateWeeklyHours('169')).toMatchObject({ ok: false })
  })
})
