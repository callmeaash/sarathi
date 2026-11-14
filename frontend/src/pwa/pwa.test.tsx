import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { setSession } from '../auth/session'
import { HEALTHY, mockApi, renderApp, sessionReply } from '../test/render'
import { installState, watchInstall } from './install'

const API = { '/api/health': HEALTHY, '/api/me/summary': { body: { reports: 0, pending: 0, verified: 0 } } }

/** What Chrome sends when the app can be installed. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome }) })
  act(() => { window.dispatchEvent(event) })
  return { prompt, event }
}

beforeAll(watchInstall)

describe('installing the app', () => {
  it('offers nothing until the browser says the app can be installed', () => {
    mockApi(API)
    renderApp('/welcome')
    expect(screen.queryByText('Install Sarathi')).not.toBeInTheDocument()
    expect(installState()).toBe('unavailable')
  })

  it('shows an install button, opens the browser dialog, and goes away once used', async () => {
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/welcome')
    const { prompt, event } = offerInstall()
    expect(event.defaultPrevented).toBe(true)  // the browser's own banner is held back
    expect(screen.getAllByText('Install Sarathi').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Install' })[0])
    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.queryByText('Install Sarathi')).not.toBeInTheDocument()
  })

  it('is offered on the account page too, and disappears once the app is installed', () => {
    setSession(sessionReply().body as never)
    mockApi(API)
    renderApp('/account')
    offerInstall()
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByText('Install Sarathi')).not.toBeInTheDocument()
    expect(installState()).toBe('installed')
  })

  it('tells iPhone users how to add it from the Share menu', () => {
    const agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    vi.stubGlobal('navigator', Object.create(navigator, { userAgent: { value: agent }, maxTouchPoints: { value: 5 } }))
    mockApi(API)
    renderApp('/welcome')
    expect(screen.getAllByText(/Add to Home Screen/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  })
})

describe('going offline', () => {
  const setOnline = (online: boolean) => {
    vi.stubGlobal('navigator', Object.create(navigator, { onLine: { value: online } }))
    act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')) })
  }

  it('says so while offline and stops when back online', () => {
    mockApi(API)
    renderApp('/')
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument()
    setOnline(false)
    expect(screen.getByText(/You're offline\. Closures, routes and reports will update/)).toBeInTheDocument()
    setOnline(true)
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument()
  })
})
