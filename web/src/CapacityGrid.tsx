import { useEffect, useMemo, useRef, useState } from 'react'
import { errorMessage, updateWeeklyHours } from './api'
import {
  cellStatus,
  fmtHours,
  overStats,
  utilization,
  validateWeeklyHours,
  type CapacityPerson,
} from './capacity'
import { formatDay, formatFullDay, weekCount } from './dates'
import { useCapacity } from './useCapacity'

type Props = {
  from: string
  to: string
}

// Fixed geometry: rows are a constant height so the window of rows to render
// is plain arithmetic, which is what lets a few thousand people scroll smoothly.
const ROW_H = 44
const HEADER_H = 52
const NAME_W = 200
const CAP_W = 140
const WEEK_W = 92
const OVERSCAN = 8
const FALLBACK_VIEWPORT_H = 600 // used until the scroll box has been measured

type Editing = { id: number; draft: string; error: string | null }
type Failure = { name: string; hours: number; message: string }

// CapacityGrid renders one row per person and one column per week, showing
// how allocated each person is and making over-allocation obvious.
//
// Editing a person's weekly hours is optimistic: the new number is shown at
// once (as a pending override layered on top of the fetched data, so a read
// that lands mid-save can't flicker it back), the server's answer replaces it
// on success, and a failure removes the override and says so. After a save the
// range is refetched in the background to pick up anything else that changed.
export function CapacityGrid({ from, to }: Props) {
  const { state, reload, revalidate, patchPerson } = useCapacity(from, to)

  const [pending, setPending] = useState<Record<number, number>>({})
  const [failures, setFailures] = useState<Record<number, Failure>>({})
  const [editing, setEditing] = useState<Editing | null>(null)

  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(FALLBACK_VIEWPORT_H)

  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || FALLBACK_VIEWPORT_H))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state.kind])

  // A different range is a different grid: drop edit UI that referred to the old one.
  useEffect(() => {
    setEditing(null)
    setFailures({})
    setScrollTop(0)
  }, [from, to])

  const data = state.kind === 'ready' ? state.data : null
  const capacityOf = (p: CapacityPerson) => pending[p.id] ?? p.weeklyHours
  const stats = useMemo(
    () => (data ? overStats(data, (p) => pending[p.id] ?? p.weeklyHours) : null),
    [data, pending],
  )

  async function save(id: number, name: string, hours: number) {
    setEditing(null)
    setFailures(({ [id]: _dropped, ...rest }) => rest)
    setPending((p) => ({ ...p, [id]: hours }))
    try {
      const saved = await updateWeeklyHours(id, hours)
      patchPerson(id, saved.weeklyHours)
      setPending(({ [id]: _done, ...rest }) => rest)
      revalidate()
    } catch (err) {
      setPending(({ [id]: _rolledBack, ...rest }) => rest)
      setFailures((f) => ({ ...f, [id]: { name, hours, message: errorMessage(err) } }))
    }
  }

  function submitEdit(person: CapacityPerson) {
    if (!editing) return
    const result = validateWeeklyHours(editing.draft)
    if (!result.ok) {
      setEditing({ ...editing, error: result.message })
      return
    }
    if (result.hours === person.weeklyHours) {
      setEditing(null) // nothing changed; don't spend a request on it
      return
    }
    void save(person.id, person.name, result.hours)
  }

  if (state.kind === 'loading') return <GridSkeleton from={from} to={to} />

  if (state.kind === 'error') {
    return (
      <div className="panel" role="alert">
        <p>
          <strong>Couldn’t load capacity.</strong> {state.message}
        </p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  const { weeks, people } = state.data
  const totalW = NAME_W + CAP_W + weeks.length * WEEK_W
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(people.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
  const visible = people.slice(first, last)
  const failureList = Object.entries(failures)

  return (
    <section className="capacity" aria-label="Team capacity">
      <p className="summary" aria-live="polite">
        {people.length} people · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} ·{' '}
        {stats && stats.people > 0 ? (
          <strong className="over-text">{stats.people} over-allocated</strong>
        ) : (
          'nobody over-allocated'
        )}
        {state.refreshing && <span className="muted"> · refreshing…</span>}
      </p>

      {state.refreshError && (
        <div className="notice" role="alert">
          <span>Couldn’t refresh — the numbers below may be out of date. {state.refreshError}</span>
          <button type="button" onClick={revalidate}>
            Retry
          </button>
        </div>
      )}

      {failureList.length > 0 && (
        <div className="notices">
          {failureList.map(([id, f]) => (
            <div className="notice" role="alert" key={id}>
              <span>
                Couldn’t save {fmtHours(f.hours)}h/week for <strong>{f.name}</strong>: {f.message} The previous value
                is still shown.
              </span>
              <button type="button" onClick={() => void save(Number(id), f.name, f.hours)}>
                Retry
              </button>
              <button
                type="button"
                onClick={() => setFailures(({ [Number(id)]: _dismissed, ...rest }) => rest)}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {people.length === 0 ? (
        <div className="panel">No people to show.</div>
      ) : (
        <div
          className="grid-scroll"
          ref={scroller}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          tabIndex={0}
          aria-label="Capacity grid, scrollable"
        >
          <div role="grid" aria-rowcount={people.length + 1} aria-colcount={weeks.length + 2} style={{ width: totalW }}>
            <div role="row" className="grid-header" style={{ height: HEADER_H }}>
              <div role="columnheader" className="sticky-name head-cell" style={{ width: NAME_W }}>
                Person
              </div>
              <div role="columnheader" className="sticky-cap head-cell" style={{ width: CAP_W, left: NAME_W }}>
                Hours / week
              </div>
              {weeks.map((w, i) => (
                <div
                  role="columnheader"
                  className="head-cell week-head"
                  style={{ width: WEEK_W }}
                  key={w}
                  title={`Week of ${formatFullDay(w)}`}
                >
                  <span>{formatDay(w)}</span>
                  {stats && stats.perWeek[i] > 0 && (
                    <span className="over-badge" aria-label={`${stats.perWeek[i]} over-allocated`}>
                      {stats.perWeek[i]} over
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="grid-body" style={{ height: people.length * ROW_H }}>
              {visible.map((p, k) => {
                const index = first + k
                const cap = capacityOf(p)
                const isPending = p.id in pending
                const isEditing = editing?.id === p.id
                const failed = p.id in failures
                return (
                  <div
                    role="row"
                    aria-rowindex={index + 2}
                    className="grid-row"
                    style={{ top: index * ROW_H, height: ROW_H }}
                    key={p.id}
                  >
                    <div role="rowheader" className="sticky-name name-cell" style={{ width: NAME_W }} title={p.name}>
                      {p.name}
                    </div>
                    <div
                      role="gridcell"
                      className={`sticky-cap cap-cell${failed ? ' failed' : ''}`}
                      style={{ width: CAP_W, left: NAME_W }}
                      aria-busy={isPending}
                    >
                      {isEditing && editing ? (
                        <form
                          className="edit-form"
                          noValidate
                          onSubmit={(e) => {
                            e.preventDefault()
                            submitEdit(p)
                          }}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={168}
                            step="any"
                            autoFocus
                            aria-label={`Weekly hours for ${p.name}`}
                            aria-invalid={editing.error !== null}
                            value={editing.draft}
                            onChange={(e) => setEditing({ ...editing, draft: e.target.value, error: null })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditing(null)
                            }}
                          />
                          <button type="submit" aria-label={`Save weekly hours for ${p.name}`}>
                            ✓
                          </button>
                          <button type="button" aria-label="Cancel" onClick={() => setEditing(null)}>
                            ✕
                          </button>
                          {editing.error && (
                            <span className="field-error" role="alert">
                              {editing.error}
                            </span>
                          )}
                        </form>
                      ) : (
                        <>
                          <span className="cap-value">{fmtHours(cap)}h</span>
                          {isPending ? (
                            <span className="muted">Saving…</span>
                          ) : (
                            <button
                              type="button"
                              className="link"
                              aria-label={`Edit weekly hours for ${p.name}`}
                              onClick={() => setEditing({ id: p.id, draft: String(p.weeklyHours), error: null })}
                            >
                              Edit
                            </button>
                          )}
                          {failed && <span className="over-text">Not saved</span>}
                        </>
                      )}
                    </div>
                    {weeks.map((w, i) => (
                      <Cell key={w} person={p} week={w} allocated={p.allocated[i] ?? 0} capacity={cap} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Cell({
  person,
  week,
  allocated,
  capacity,
}: {
  person: CapacityPerson
  week: string
  allocated: number
  capacity: number
}) {
  const status = cellStatus(allocated, capacity)
  const ratio = utilization(allocated, capacity)
  const fill = ratio === null ? (allocated > 0 ? 1 : 0) : Math.min(ratio, 1)
  const label = {
    over: `over by ${fmtHours(allocated - capacity)}h`,
    full: 'at capacity',
    ok: `${fmtHours(capacity - allocated)}h free`,
    idle: 'not allocated',
  }[status]

  return (
    <div
      role="gridcell"
      className={`cell ${status}`}
      style={{ width: WEEK_W }}
      aria-label={`${person.name}, week of ${formatFullDay(week)}: ${fmtHours(allocated)} of ${fmtHours(capacity)} hours, ${label}`}
      title={ratio === null ? undefined : `${Math.round(ratio * 100)}% allocated`}
    >
      <span className="cell-hours">
        {fmtHours(allocated)} / {fmtHours(capacity)}
      </span>
      {status === 'over' ? (
        <span className="cell-flag">▲ +{fmtHours(allocated - capacity)}h</span>
      ) : (
        <span className="bar" aria-hidden="true">
          <span style={{ width: `${fill * 100}%` }} />
        </span>
      )}
    </div>
  )
}

function GridSkeleton({ from, to }: Props) {
  const weeks = Math.min(weekCount(from, to), 12)
  return (
    <div className="capacity" role="status" aria-busy="true" aria-label="Loading capacity">
      <p className="summary muted">Loading capacity…</p>
      <div className="skeleton">
        {Array.from({ length: 8 }, (_, r) => (
          <div className="skeleton-row" key={r}>
            <span className="skeleton-block" style={{ width: NAME_W - 20 }} />
            {Array.from({ length: weeks }, (_, c) => (
              <span className="skeleton-block" style={{ width: WEEK_W - 16 }} key={c} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
