import createClient from 'openapi-fetch'

import type { components, paths } from './schema'

export type Schemas = components['schemas']

/** Typed client for the Sarathi API; paths and bodies are checked against the backend's OpenAPI schema. */
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
  // Look fetch up on each call so tests can replace it.
  fetch: (request) => globalThis.fetch(request),
})

/** An error response from the API, with the message meant for the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type FastApiError = { detail?: string | { msg?: string }[] }

/** The user-facing message in a FastAPI error body. */
export function errorMessage(status: number, body: unknown): string {
  const detail = (body as FastApiError | undefined)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  return status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${status})`
}

/** Unwrap an openapi-fetch result: the data on success, an ApiError otherwise. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call
  if (error !== undefined || !response.ok) throw new ApiError(response.status, errorMessage(response.status, error))
  return data as T
}
