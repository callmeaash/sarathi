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
  readonly retryAfter: number | null  // seconds, for rate limits

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

type FastApiError = { detail?: string | { msg?: string }[] }

/** Capitalise and end with a full stop: the API's messages are lower-case fragments. */
export function sentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const capitalised = trimmed[0].toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`
}

/** The user-facing message in a FastAPI error body. */
export function errorMessage(status: number, body: unknown): string {
  const detail = (body as FastApiError | undefined)?.detail
  if (typeof detail === 'string') return sentence(detail)
  if (Array.isArray(detail) && detail[0]?.msg) return sentence(detail[0].msg)
  return status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${status}).`
}

/** Unwrap an openapi-fetch result: the data on success, an ApiError otherwise. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call
  if (error !== undefined || !response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || null
    throw new ApiError(response.status, errorMessage(response.status, error), retryAfter)
  }
  return data as T
}

/** A message for any error thrown by an API call, including network failures. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return "Can't reach Sarathi. Check your connection and try again."
}
