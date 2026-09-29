import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, fetchCapacity } from './api'
import type { CapacityData } from './capacity'

export type CapacityState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CapacityData; refreshing: boolean; refreshError: string | null }

/**
 * Loads capacity for a range and keeps it correct as the range changes and
 * as people are edited.
 *
 * Only the most recent request may write state: starting a load aborts the
 * previous one, so a slow response for last week's range can never land on
 * top of this week's grid, and a refetch started after a save can't be
 * overwritten by a read that began before the save committed.
 */
export function useCapacity(from: string, to: string) {
  const [state, setState] = useState<CapacityState>({ kind: 'loading' })
  const inflight = useRef<AbortController | null>(null)

  const load = useCallback(
    (mode: 'initial' | 'background') => {
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl

      if (mode === 'initial') {
        setState({ kind: 'loading' })
      } else {
        setState((s) => (s.kind === 'ready' ? { ...s, refreshing: true, refreshError: null } : s))
      }

      fetchCapacity(from, to, ctrl.signal).then(
        (data) => {
          if (ctrl.signal.aborted) return
          setState({ kind: 'ready', data, refreshing: false, refreshError: null })
        },
        (err) => {
          if (ctrl.signal.aborted) return
          const message = errorMessage(err)
          // A failed background refresh keeps the numbers we have, and says so.
          setState((s) =>
            s.kind === 'ready' ? { ...s, refreshing: false, refreshError: message } : { kind: 'error', message },
          )
        },
      )
    },
    [from, to],
  )

  useEffect(() => {
    load('initial')
    return () => inflight.current?.abort()
  }, [load])

  const reload = useCallback(() => load('initial'), [load])
  /** Refetch without blanking the grid. Used after a save to reconcile. */
  const revalidate = useCallback(() => load('background'), [load])

  /** Adopt the server-confirmed weekly hours for one person, in place. */
  const patchPerson = useCallback((id: number, weeklyHours: number) => {
    setState((s) =>
      s.kind === 'ready'
        ? {
            ...s,
            data: {
              ...s.data,
              people: s.data.people.map((p) => (p.id === id ? { ...p, weeklyHours } : p)),
            },
          }
        : s,
    )
  }, [])

  return { state, reload, revalidate, patchPerson }
}
