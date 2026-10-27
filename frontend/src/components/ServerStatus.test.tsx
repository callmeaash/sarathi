import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent } from '../test/render'

describe('server status', () => {
  it('shows live when the API answers', async () => {
    mockApi({ '/api/health': HEALTHY })
    renderApp('/')
    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  it('warns when the API cannot be reached and recovers on retry', async () => {
    const fetch = mockApi({})
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the Sarathi server")

    mockApi({ '/api/health': HEALTHY })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Live')).toBeInTheDocument()
    expect(await sent(fetch, 'GET', '/api/health')).toHaveLength(1)  // the first try; the retry used the new mock
  })

  it('treats a server error as offline', async () => {
    mockApi({ '/api/health': { status: 503, body: { detail: 'starting up' } } })
    renderApp('/')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
