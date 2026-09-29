import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'
import type { CapacityData } from './capacity'

const RANGE = { from: '2026-01-05', to: '2026-01-12' }

function fixture(deeHours = 40): CapacityData {
  return {
    weeks: ['2026-01-05', '2026-01-12'],
    people: [
      { id: 1, name: 'Ana', weeklyHours: 40, allocated: [32, 40] },
      { id: 4, name: 'Dee', weeklyHours: deeHours, allocated: [45, 40] },
      { id: 5, name: 'Eli', weeklyHours: 0, allocated: [20, 0] },
    ],
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const cell = (name: string, week: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name}, week of ${week}`) })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const fetchMock = () => vi.mocked(fetch)

function editHours(name: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit weekly hours for ${name}` }))
  fireEvent.change(screen.getByLabelText(`Weekly hours for ${name}`), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: `Save weekly hours for ${name}` }))
}

describe('CapacityGrid', () => {
  it('flags over-allocation, including work against zero capacity', async () => {
    fetchMock().mockResolvedValueOnce(json(fixture()))
    render(<CapacityGrid {...RANGE} />)

    await screen.findByRole('grid')
    expect(cell('Dee', '5 Jan 2026')).toHaveTextContent('+5h')
    expect(cell('Dee', '12 Jan 2026')).not.toHaveTextContent('+') // exactly at capacity is not over
    expect(cell('Ana', '5 Jan 2026')).toHaveAccessibleName(/8h free/)
    expect(cell('Eli', '5 Jan 2026')).toHaveTextContent('+20h')
    expect(screen.getByText('2 over-allocated')).toBeInTheDocument()
  })

  it('shows a saved edit at once, then reconciles with the server', async () => {
    const patch = deferred<Response>()
    fetchMock()
      .mockResolvedValueOnce(json(fixture(40))) // initial load
      .mockReturnValueOnce(patch.promise) // PATCH, held open
      .mockResolvedValueOnce(json(fixture(50))) // background refetch
    render(<CapacityGrid {...RANGE} />)
    await screen.findByRole('grid')

    editHours('Dee', '50')

    // Optimistic: the number and the derived over-allocation are already right.
    expect(await screen.findByText('Saving…')).toBeInTheDocument()
    expect(cell('Dee', '5 Jan 2026')).toHaveAccessibleName(/45 of 50 hours, 5h free/)
    expect(screen.getByText('1 over-allocated')).toBeInTheDocument() // only Eli now

    patch.resolve(json({ id: 4, name: 'Dee', weeklyHours: 50 }))
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument())

    const [url, init] = fetchMock().mock.calls[1]
    expect(url).toBe('/api/people/4')
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ weeklyHours: 50 }) })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(3))
    expect(cell('Dee', '5 Jan 2026')).toHaveAccessibleName(/45 of 50 hours/)
  })

  it('rolls back and says so when a save fails', async () => {
    fetchMock()
      .mockResolvedValueOnce(json(fixture(40)))
      .mockResolvedValueOnce(json({ error: 'weeklyHours must be between 0 and 168' }, 422))
    render(<CapacityGrid {...RANGE} />)
    await screen.findByRole('grid')

    editHours('Dee', '50')

    const alert = await screen.findByText(/Couldn’t save 50h\/week for/)
    expect(alert).toHaveTextContent('weeklyHours must be between 0 and 168')
    // The grid went back to what the server last confirmed.
    expect(cell('Dee', '5 Jan 2026')).toHaveAccessibleName(/45 of 40 hours, over by 5h/)
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(fetchMock()).toHaveBeenCalledTimes(2) // no refetch after a failure

    // Retry goes through with the same value.
    fetchMock().mockResolvedValueOnce(json({ id: 4, name: 'Dee', weeklyHours: 50 })).mockResolvedValueOnce(json(fixture(50)))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(cell('Dee', '5 Jan 2026')).toHaveAccessibleName(/45 of 50 hours/))
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument()
  })

  it('rejects invalid hours without calling the server', async () => {
    fetchMock().mockResolvedValueOnce(json(fixture()))
    render(<CapacityGrid {...RANGE} />)
    await screen.findByRole('grid')

    editHours('Ana', '200')

    expect(await screen.findByText('Hours must be between 0 and 168.')).toBeInTheDocument()
    expect(fetchMock()).toHaveBeenCalledTimes(1)
  })

  it('ignores a slow response for a range the user has already left', async () => {
    const stale = deferred<Response>()
    const other: CapacityData = { weeks: ['2026-01-12'], people: [{ id: 9, name: 'Zed', weeklyHours: 40, allocated: [10] }] }
    fetchMock().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(json(other))

    const { rerender } = render(<CapacityGrid {...RANGE} />)
    rerender(<CapacityGrid from="2026-01-12" to="2026-01-12" />)
    await screen.findByText('Zed')

    stale.resolve(json(fixture())) // arrives late
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.getByText('Zed')).toBeInTheDocument()
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when loading fails', async () => {
    fetchMock().mockResolvedValueOnce(json({ error: 'boom' }, 500)).mockResolvedValueOnce(json(fixture()))
    render(<CapacityGrid {...RANGE} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t load capacity.*boom/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('grid')
  })
})
