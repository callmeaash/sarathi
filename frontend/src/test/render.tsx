import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { vi } from 'vitest'

import { routes } from '../app/routes'

/** Render the whole app at a path, with a fresh cache that does not retry. */
export function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router }
}

type Reply = { status?: number; body?: unknown } | Error

/** Replace fetch: each request gets the reply for the first matching path, or a network error. */
export function mockApi(replies: Record<string, Reply>) {
  const fetch = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname
    const reply = replies[path]
    if (!reply || reply instanceof Error) throw reply ?? new TypeError('Failed to fetch')
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export const HEALTHY = { body: { status: 'ok', nodes: 32613, edges: 79676, closed_edges: 0, loaded_at: '2026-10-27T10:00:00Z' } }
