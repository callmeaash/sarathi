import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getSession, setSession } from '../../auth/session'
import { HEALTHY, makeUser, mockApi, renderApp, sent, sessionReply } from '../../test/render'

const SUMMARY = { body: { reports: 12, pending: 2, verified: 9 } }
const API = { '/api/health': HEALTHY, '/api/me/summary': SUMMARY }
const signIn = (overrides = {}) => setSession(sessionReply(makeUser(overrides)).body as never)
const page = () => within(screen.getByRole('main'))

describe('account overview', () => {
  it('shows who is signed in and what they have reported', async () => {
    signIn()
    mockApi(API)
    renderApp('/account')
    const profile = within(page().getByRole('region', { name: 'Profile' }))
    expect(profile.getByText('Ramesh Karki')).toBeInTheDocument()
    expect(profile.getByText('ramesh.k@example.com')).toBeInTheDocument()
    expect(profile.getByRole('img', { name: 'Email verified' })).toBeInTheDocument()
    expect(profile.getByText('Member since October 2026')).toBeInTheDocument()
    const stats = profile.getByRole('link', { name: 'My reports' })
    expect(stats).toHaveAttribute('href', '/reports')
    await waitFor(() => expect(stats).toHaveTextContent('12Reports9Verified2Under review'))
  })

  it('still shows the account when the report counts cannot be loaded', async () => {
    signIn()
    mockApi({ '/api/health': HEALTHY })
    renderApp('/account')
    expect(page().getByRole('link', { name: 'My reports' })).toHaveTextContent('–Reports–Verified–Under review')
    expect(page().getByRole('link', { name: /Name/ })).toHaveAttribute('href', '/account/name')
    expect(page().getByRole('link', { name: /Password/ })).toHaveAttribute('href', '/account/password')
    expect(page().getByRole('link', { name: /Delete account/ })).toHaveAttribute('href', '/account/delete')
  })

  it('logs out of every device after a confirmation', async () => {
    signIn()
    const fetch = mockApi({ ...API, 'POST /api/auth/logout-all': { status: 204 } })
    const user = userEvent.setup()
    const { router } = renderApp('/account')
    await user.click(page().getByRole('button', { name: 'Log out all' }))
    expect(await sent(fetch, 'POST', '/api/auth/logout-all')).toHaveLength(0)  // nothing until confirmed
    await user.click(page().getByRole('button', { name: 'Cancel' }))
    await user.click(page().getByRole('button', { name: 'Log out all' }))
    await user.click(page().getByRole('button', { name: 'Log out everywhere' }))
    await waitFor(() => expect(getSession()).toBeNull())
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Log in' })).toHaveLength(2))
    expect(router.state.location.pathname).toBe('/')  // on the map, not sent to the log-in screen
    const [call] = await sent(fetch, 'POST', '/api/auth/logout-all')
    expect(call.request.headers.get('Authorization')).toBe('Bearer access-1')  // the server needs to know who
  })

  it('stays signed in if logging out everywhere fails', async () => {
    signIn()
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/account')
    await user.click(page().getByRole('button', { name: 'Log out all' }))
    await user.click(page().getByRole('button', { name: 'Log out everywhere' }))
    expect(await page().findByRole('alert')).toHaveTextContent("Can't reach Sarathi")
    expect(getSession()).not.toBeNull()
  })
})

describe('changing the name', () => {
  it('saves the new name and shows it on the account', async () => {
    signIn()
    const fetch = mockApi({ ...API, 'PATCH /api/me': { body: makeUser({ full_name: 'Ramesh B. Karki' }) } })
    const user = userEvent.setup()
    const { router } = renderApp('/account/name')
    const field = page().getByLabelText('Full name')
    expect(field).toHaveValue('Ramesh Karki')
    expect(page().getByRole('button', { name: 'Save' })).toBeDisabled()  // nothing changed yet
    await user.clear(field)
    await user.type(field, '  Ramesh B. Karki ')
    await user.click(page().getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
    expect((await sent(fetch, 'PATCH', '/api/me'))[0].body).toEqual({ full_name: 'Ramesh B. Karki' })
    expect(await page().findByText('Your name was updated.')).toBeInTheDocument()
    expect(within(page().getByRole('region', { name: 'Profile' })).getByText('Ramesh B. Karki')).toBeInTheDocument()
  })

  it('needs a name', async () => {
    signIn()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/account/name')
    await user.clear(page().getByLabelText('Full name'))
    await user.click(page().getByRole('button', { name: 'Save' }))
    expect(page().getByText('Enter your name.')).toBeInTheDocument()
    expect(await sent(fetch, 'PATCH', '/api/me')).toHaveLength(0)
  })
})

describe('changing the password', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) => {
    if (current) await user.type(page().getByLabelText('Current password'), current)
    await user.type(page().getByLabelText('New password'), next)
    await user.type(page().getByLabelText('Confirm new password'), confirm)
    await user.click(page().getByRole('button', { name: 'Change password' }))
  }

  it('changes it and says other devices were logged out', async () => {
    signIn()
    const fetch = mockApi({ ...API, 'POST /api/auth/change-password': { status: 204 } })
    const user = userEvent.setup()
    const { router } = renderApp('/account/password')
    await fill(user, 'correct horse battery', 'a brand new passphrase')
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
    const [call] = await sent(fetch, 'POST', '/api/auth/change-password')
    expect(call.body).toEqual({ current_password: 'correct horse battery', new_password: 'a brand new passphrase' })
    expect(call.request.headers.get('Authorization')).toBe('Bearer access-1')
    expect(await page().findByText(/Other devices have been logged out\./)).toBeInTheDocument()
    expect(getSession()).not.toBeNull()
  })

  it('checks the form before sending anything', async () => {
    signIn()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/account/password')
    await fill(user, '', 'short', 'different')
    expect(page().getByText('Enter your current password.')).toBeInTheDocument()
    expect(page().getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(page().getByText("The two passwords don't match.")).toBeInTheDocument()
    expect(await sent(fetch, 'POST', '/api/auth/change-password')).toHaveLength(0)
  })

  it('puts a wrong current password next to its field', async () => {
    signIn()
    mockApi({ ...API, 'POST /api/auth/change-password': { status: 422, body: { detail: 'current password is incorrect' } } })
    const user = userEvent.setup()
    renderApp('/account/password')
    await fill(user, 'not my password', 'a brand new passphrase')
    expect(await page().findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(page().getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('explains the wait after too many wrong passwords', async () => {
    signIn()
    mockApi({ ...API, 'POST /api/auth/change-password': {
      status: 429, body: { detail: 'too many failed attempts; try again later' }, headers: { 'Retry-After': '840' } } })
    const user = userEvent.setup()
    renderApp('/account/password')
    await fill(user, 'not my password', 'a brand new passphrase')
    expect(await page().findByRole('alert')).toHaveTextContent('Too many wrong passwords. Try again in 14 minutes.')
  })
})

describe('deleting the account', () => {
  it('deletes it after the password is entered and returns to the map signed out', async () => {
    signIn()
    const fetch = mockApi({ ...API, 'POST /api/me/delete': { status: 204 } })
    const user = userEvent.setup()
    const { router } = renderApp('/account/delete')
    expect(page().getByText('ramesh.k@example.com')).toBeInTheDocument()
    await user.click(page().getByRole('button', { name: 'Delete my account' }))
    expect(page().getByText('Enter your password to confirm.')).toBeInTheDocument()
    expect(await sent(fetch, 'POST', '/api/me/delete')).toHaveLength(0)

    await user.type(page().getByLabelText('Your password'), 'correct horse battery')
    await user.click(page().getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(getSession()).toBeNull())
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Log in' })).toHaveLength(2))
    expect(router.state.location.pathname).toBe('/')  // on the map, not sent to the log-in screen
    const [call] = await sent(fetch, 'POST', '/api/me/delete')
    expect(call.body).toEqual({ password: 'correct horse battery' })
    expect(call.request.headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('keeps the account when the password is wrong', async () => {
    signIn()
    mockApi({ ...API, 'POST /api/me/delete': { status: 422, body: { detail: 'current password is incorrect' } } })
    const user = userEvent.setup()
    const { router } = renderApp('/account/delete')
    await user.type(page().getByLabelText('Your password'), 'not my password')
    await user.click(page().getByRole('button', { name: 'Delete my account' }))
    expect(await page().findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/account/delete')
    expect(getSession()).not.toBeNull()
    expect(page().getByRole('link', { name: 'Keep my account' })).toHaveAttribute('href', '/account')
  })
})

describe('account settings need an account', () => {
  it.each(['/account/name', '/account/password', '/account/delete'])('%s sends visitors to log in', async (path) => {
    mockApi({ '/api/health': HEALTHY })
    const { router } = renderApp(path)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
