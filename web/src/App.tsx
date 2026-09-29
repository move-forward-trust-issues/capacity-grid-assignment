import { useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { addDays, formatFullDay, isValidISODate, mondayOf, weekCount } from './dates'

// The range the grid opens on. Widen it if you want to see more.
const INITIAL_FROM = '2025-12-29'
const INITIAL_TO = '2026-01-16'

// Two years is the most history the page is meant to show; the API enforces its own ceiling.
const MAX_WEEKS = 104

type Range = { from: string; to: string }

function rangeProblem({ from, to }: Range): string | null {
  if (!isValidISODate(from) || !isValidISODate(to)) return 'Pick a start and an end date.'
  if (to < from) return 'The end date must be on or after the start date.'
  if (weekCount(from, to) > MAX_WEEKS) return `Choose at most ${MAX_WEEKS} weeks.`
  return null
}

export function App() {
  // `range` is what the grid loads; `draft` is what the date inputs hold, which
  // can be temporarily invalid (half-typed, end before start) without reloading anything.
  const [range, setRange] = useState<Range>({ from: INITIAL_FROM, to: INITIAL_TO })
  const [draft, setDraft] = useState<Range>(range)

  const problem = rangeProblem(draft)

  function edit(next: Range) {
    setDraft(next)
    if (rangeProblem(next) === null) setRange(next)
  }

  function shiftWeeks(n: number) {
    const next = { from: addDays(range.from, 7 * n), to: addDays(range.to, 7 * n) }
    setDraft(next)
    setRange(next)
  }

  return (
    <main>
      <h1>Team capacity</h1>
      <p className="range">
        Weeks of {formatFullDay(mondayOf(range.from))} – {formatFullDay(addDays(mondayOf(range.to), 6))}
      </p>

      <div className="toolbar">
        <button type="button" onClick={() => shiftWeeks(-1)}>
          ← Previous week
        </button>
        <button type="button" onClick={() => shiftWeeks(1)}>
          Next week →
        </button>
        <label>
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => edit({ ...draft, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input type="date" value={draft.to} min={draft.from} onChange={(e) => edit({ ...draft, to: e.target.value })} />
        </label>
      </div>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}

      <CapacityGrid from={range.from} to={range.to} />
    </main>
  )
}
