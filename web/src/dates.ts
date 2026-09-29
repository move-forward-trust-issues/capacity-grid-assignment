// Dates in this app are plain calendar days ("YYYY-MM-DD"), never instants.
// All arithmetic happens in UTC so the browser's time zone (and DST) can't
// shift a day: `new Date('2026-01-05')` is UTC midnight, and local-time
// getters on it would report Jan 4 west of Greenwich.

const DAY_MS = 24 * 60 * 60 * 1000

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday of the week containing `iso` (weeks run Monday to Sunday). */
export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(iso, -((day + 6) % 7))
}

/** How many Monday-Sunday weeks the inclusive range touches. */
export function weekCount(from: string, to: string): number {
  const a = new Date(`${mondayOf(from)}T00:00:00Z`).getTime()
  const b = new Date(`${mondayOf(to)}T00:00:00Z`).getTime()
  return Math.round((b - a) / (7 * DAY_MS)) + 1
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDay(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`))
}

export function formatFullDay(iso: string): string {
  return dayMonthYear.format(new Date(`${iso}T00:00:00Z`))
}
