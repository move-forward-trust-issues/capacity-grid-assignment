export type CapacityPerson = {
  id: number
  name: string
  weeklyHours: number
  /** allocated[i] is the hours allocated in weeks[i]. */
  allocated: number[]
}

export type CapacityData = {
  /** Monday (YYYY-MM-DD) of each week. */
  weeks: string[]
  people: CapacityPerson[]
}

export type CellStatus = 'idle' | 'ok' | 'full' | 'over'

// Allocations are sums of binary fractions (eighths, sixteenths), which floats
// hold exactly, but a tolerance keeps this honest if the data ever isn't.
const EPS = 1e-9

/**
 * over: more work than capacity (including any work at all against 0 capacity)
 * full: exactly at capacity
 * ok:   some work, room left
 * idle: nothing allocated
 */
export function cellStatus(allocated: number, capacity: number): CellStatus {
  if (allocated > capacity + EPS) return 'over'
  if (allocated <= EPS) return 'idle'
  if (Math.abs(allocated - capacity) <= EPS) return 'full'
  return 'ok'
}

/** Utilisation as a fraction, or null when there is no capacity to divide by. */
export function utilization(allocated: number, capacity: number): number | null {
  return capacity > 0 ? allocated / capacity : null
}

export function fmtHours(n: number): string {
  return String(Number(n.toFixed(2)))
}

export type OverStats = {
  /** Number of people over capacity in each week. */
  perWeek: number[]
  /** People over capacity in at least one week of the range. */
  people: number
}

/**
 * Everything derived from capacity is computed here from the current numbers,
 * so an edit to someone's weekly hours can't leave a stale total behind.
 * `capacityOf` lets the caller substitute pending (optimistic) values.
 */
export function overStats(data: CapacityData, capacityOf: (p: CapacityPerson) => number): OverStats {
  const perWeek = data.weeks.map(() => 0)
  let people = 0
  for (const p of data.people) {
    const cap = capacityOf(p)
    let any = false
    for (let i = 0; i < data.weeks.length; i++) {
      if (cellStatus(p.allocated[i] ?? 0, cap) === 'over') {
        perWeek[i]++
        any = true
      }
    }
    if (any) people++
  }
  return { perWeek, people }
}

export function validateWeeklyHours(raw: string): { ok: true; hours: number } | { ok: false; message: string } {
  if (raw.trim() === '') return { ok: false, message: 'Enter a number of hours.' }
  const hours = Number(raw)
  if (!Number.isFinite(hours)) return { ok: false, message: 'Enter a number of hours.' }
  if (hours < 0 || hours > 168) return { ok: false, message: 'Hours must be between 0 and 168.' }
  return { ok: true, hours }
}
