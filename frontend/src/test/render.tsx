import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { vi } from 'vitest'

import { AppProviders } from '../app/AppProviders'
import { routes } from '../app/routes'
import type { Schemas } from '../api/client'

type Entry = string | { pathname: string; search?: string; state?: unknown }

/** Render the whole app at a path, with a fresh cache that does not retry. */
export function renderApp(entry: Entry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, router }
}

export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> }
type Handler = Reply | Error | ((request: Request) => Reply | Promise<Reply>)

/**
 * Replace fetch. Keys are "METHOD /path" or just "/path"; values are a reply, an error to throw,
 * or a function of the request. Unmatched requests fail like a network error.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const fetch = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname
    const handler = handlers[`${request.method} ${path}`] ?? handlers[path]
    if (!handler || handler instanceof Error) throw handler ?? new TypeError('Failed to fetch')
    const reply = typeof handler === 'function' ? await handler(request) : handler
    const status = reply.status ?? 200
    const body = status === 204 ? null : JSON.stringify(reply.body ?? {})
    return new Response(body, { status, headers: { 'Content-Type': 'application/json', ...reply.headers } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** Requests the mock received for a method and path, with their JSON bodies. */
export async function sent(fetch: ReturnType<typeof mockApi>, method: string, path: string) {
  const requests = fetch.mock.calls.map(([request]) => request as Request)
    .filter((request) => request.method === method && new URL(request.url).pathname === path)
  return Promise.all(requests.map(async (request) => ({
    request,
    body: request.method === 'GET' ? undefined : await request.clone().json().catch(() => undefined),
  })))
}

export const HEALTHY: Reply = {
  body: { status: 'ok', nodes: 32613, edges: 79676, closed_edges: 0, loaded_at: '2026-10-27T10:00:00Z' },
}

export function makeUser(overrides: Partial<Schemas['UserOut']> = {}): Schemas['UserOut'] {
  return { id: 1, email: 'ramesh.k@example.com', full_name: 'Ramesh Karki', role: 'user', email_verified: true,
    created_at: '2026-10-01T10:00:00Z', ...overrides }
}

export function sessionReply(user = makeUser(), token = 'access-1'): Reply {
  return { body: { access_token: token, token_type: 'bearer', expires_in: 1800, user } }
}
