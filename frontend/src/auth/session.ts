import type { Middleware } from 'openapi-fetch'

import { ApiError, api, errorMessage, type Schemas } from '../api/client'
import { storage } from '../lib/storage'

export type User = Schemas['UserOut']
export type Session = { accessToken: string; expiresAt: number; user: User }

// The access token lives only in memory; the refresh token is an httpOnly cookie the page cannot read.
// This flag is just a hint that a cookie may exist, so first-time visitors don't make a pointless refresh call.
const SIGNED_IN_HINT = 'sarathi.signedIn'
const REFRESH_EARLY_MS = 30_000  // renew a little before the access token expires
const RACE_RETRY_MS = 400
const AUTH_PATHS = '/api/auth/'

let current: Session | null = null
const listeners = new Set<() => void>()

/** The signed-in session, or null. */
export function getSession(): Session | null {
  return current
}

/** Be told whenever the session changes; returns the unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Start a session from an API response, or end it with null. */
export function setSession(body: Schemas['SessionOut'] | null): void {
  current = body
    ? { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, user: body.user }
    : null
  if (current) storage.set(SIGNED_IN_HINT, '1')
  else storage.remove(SIGNED_IN_HINT)
  listeners.forEach((listener) => listener())
}

/** Whether this browser may still have a session cookie from an earlier visit. */
export function mightHaveSession(): boolean {
  return storage.get(SIGNED_IN_HINT) === '1'
}

/** Run fn while holding a lock shared by all tabs, so two tabs never swap the same cookie at once. */
function acrossTabs<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('sarathi-session-refresh', fn) : fn()
}

/** Ask the API for a new access token using the session cookie. */
async function requestRefresh(): Promise<Session | null> {
  for (let attempt = 0; ; attempt++) {
    const { data, error, response } = await api.POST('/api/auth/refresh')
    if (data) {
      setSession(data)
      return current
    }
    // 409: another tab swapped the cookie a moment ago; the browser now has the new one, so try once more.
    if (response.status === 409 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, RACE_RETRY_MS))
      continue
    }
    if ([401, 403, 409].includes(response.status)) {
      setSession(null)
      return null
    }
    throw new ApiError(response.status, errorMessage(response.status, error))
  }
}

let refreshing: Promise<Session | null> | null = null

/** Renew the session; concurrent callers share one request. Resolves to null when signed out. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= acrossTabs(requestRefresh).finally(() => {
    refreshing = null
  })
  return refreshing
}

const retryCopies = new Map<string, Request>()

/** Adds the access token to API calls, renewing it when it is about to expire or has just been refused. */
export const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath, id }) {
    if (schemaPath.startsWith(AUTH_PATHS)) return undefined
    let session = current
    if (session && session.expiresAt - Date.now() < REFRESH_EARLY_MS) {
      session = await refreshSession().catch(() => current)
    }
    if (!session) return undefined
    request.headers.set('Authorization', `Bearer ${session.accessToken}`)
    retryCopies.set(id, request.clone())  // a body can only be read once, so keep a copy in case of a retry
    return request
  },
  async onResponse({ response, id }) {
    const copy = retryCopies.get(id)
    retryCopies.delete(id)
    if (response.status !== 401 || !copy) return undefined
    const session = await refreshSession().catch(() => null)
    if (!session) return undefined
    copy.headers.set('Authorization', `Bearer ${session.accessToken}`)
    return globalThis.fetch(copy)
  },
  onError({ id }) {
    retryCopies.delete(id)
  },
}

api.use(authMiddleware)
