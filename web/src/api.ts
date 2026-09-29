import type { CapacityData } from './capacity'

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (init.signal?.aborted) throw err // a cancelled request is not an error to show
    throw new ApiError('Could not reach the server.')
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body?.error === 'string') message = body.error
    } catch {
      /* body wasn't JSON; keep the generic message */
    }
    throw new ApiError(message, res.status)
  }
  return res
}

export async function fetchCapacity(from: string, to: string, signal?: AbortSignal): Promise<CapacityData> {
  const res = await request(`/api/capacity?from=${from}&to=${to}`, { signal })
  const data = await res.json()
  if (!Array.isArray(data?.weeks) || !Array.isArray(data?.people)) {
    throw new ApiError('The server sent an unexpected response.')
  }
  return data as CapacityData
}

export type SavedPerson = { id: number; name: string; weeklyHours: number }

export async function updateWeeklyHours(id: number, weeklyHours: number): Promise<SavedPerson> {
  const res = await request(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
  return (await res.json()) as SavedPerson
}
