import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { setSession } from '../../auth/session'
import { HEALTHY, makeUser, mockApi, renderApp, sent, sessionReply } from '../../test/render'

const EMAIL = 'ramesh.k@example.com'
const verifyAt = (state: object = { codeSent: true }, search = `?email=${encodeURIComponent(EMAIL)}`) =>
  ({ pathname: '/verify', search, state })

async function typeCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByLabelText('Digit 1 of 6'))
  await user.keyboard(code)
}

describe('welcome', () => {
  it('greets first-time visitors once, then lets them straight onto the map', async () => {
    window.localStorage.clear()
    mockApi({ '/api/health': HEALTHY })
    const user = userEvent.setup()
    const { router } = renderApp('/')
    expect(router.state.location.pathname).toBe('/welcome')
    expect(screen.getAllByRole('link', { name: 'Create account' })[0]).toHaveAttribute('href', '/signup')
    await user.click(screen.getAllByRole('link', { name: 'Continue without an account' })[0])
    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
  })
})

describe('sign up', () => {
  it('creates the account and asks for the emailed code', async () => {
    const fetch = mockApi({ 'POST /api/auth/register': { status: 201, body: makeUser({ email_verified: false }) } })
    const user = userEvent.setup()
    const { router } = renderApp('/signup')
    await user.type(screen.getByLabelText('Full name'), 'Ramesh Karki')
    await user.type(screen.getByLabelText('Email'), ` ${EMAIL} `)
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    const [call] = await sent(fetch, 'POST', '/api/auth/register')
    expect(call.body).toEqual({ full_name: 'Ramesh Karki', email: EMAIL, password: 'correct horse battery' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/verify'))
    expect(await screen.findByText(EMAIL)).toBeInTheDocument()
    expect(screen.getByText(/You can resend in/)).toHaveTextContent('1:00')
  })

  it('checks the form before sending it', async () => {
    const fetch = mockApi({})
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('Please confirm to continue.')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers to log in when the email is taken', async () => {
    mockApi({ 'POST /api/auth/register': { status: 409, body: { detail: 'an account with this email already exists' } } })
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('Full name'), 'Ramesh Karki')
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in instead' })).toHaveAttribute('href', `/login?email=${encodeURIComponent(EMAIL)}`)
  })

  it('shows the server\'s password rule next to the password', async () => {
    mockApi({ 'POST /api/auth/register': { status: 422, body: { detail: 'this password is too common' } } })
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('Full name'), 'Ramesh Karki')
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('verify email', () => {
  it('signs in with the right code and goes to the map', async () => {
    const fetch = mockApi({ '/api/health': HEALTHY, 'POST /api/auth/verify-email': sessionReply() })
    const user = userEvent.setup()
    const { router } = renderApp(verifyAt())
    await typeCode(user, '482190')
    const [call] = await sent(fetch, 'POST', '/api/auth/verify-email')
    expect(call.body).toEqual({ email: EMAIL, code: '482190' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findAllByRole('link', { name: 'Account: Ramesh Karki' })).toHaveLength(2)
  })

  it('explains a wrong code and clears the boxes', async () => {
    mockApi({ 'POST /api/auth/verify-email': { status: 400, body: { detail: 'incorrect code; 4 attempts left' } } })
    const user = userEvent.setup()
    renderApp(verifyAt())
    await typeCode(user, '000000')
    expect(await screen.findByText('Incorrect code; 4 attempts left.')).toBeInTheDocument()
    expect((screen.getByLabelText('Digit 1 of 6') as HTMLInputElement).value).toBe('')
  })

  it('waits before allowing a resend, and resends on request', async () => {
    const fetch = mockApi({ 'POST /api/auth/resend-code': { status: 202, body: { message: 'sent' } } })
    const user = userEvent.setup()
    const first = renderApp(verifyAt())
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled()
    first.unmount()

    renderApp(verifyAt({}))  // arrived without a fresh code, e.g. from the account page
    await user.click(screen.getByRole('button', { name: 'Resend code' }))
    expect(await screen.findByText(/A new code is on its way/)).toBeInTheDocument()
    expect((await sent(fetch, 'POST', '/api/auth/resend-code'))[0].body).toEqual({ email: EMAIL })
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled()
  })

  it('asks for the email when the link has none', async () => {
    const fetch = mockApi({ 'POST /api/auth/resend-code': { status: 202, body: { message: 'sent' } } })
    const user = userEvent.setup()
    const { router } = renderApp('/verify')
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(router.state.location.search).toBe(`?email=${encodeURIComponent(EMAIL)}`))
    expect(await sent(fetch, 'POST', '/api/auth/resend-code')).toHaveLength(1)
  })
})

describe('log in', () => {
  async function logIn(user: ReturnType<typeof userEvent.setup>, password = 'correct horse battery') {
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
  }

  it('returns to the page that asked for it', async () => {
    mockApi({ 'POST /api/auth/login': sessionReply() })
    const user = userEvent.setup()
    const { router } = renderApp('/account')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Faccount')
    await logIn(user)
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
    expect(await screen.findByText('Ramesh Karki')).toBeInTheDocument()
  })

  it('sends people with an unconfirmed email to enter their code', async () => {
    mockApi({ 'POST /api/auth/login': sessionReply(makeUser({ email_verified: false })) })
    const user = userEvent.setup()
    const { router } = renderApp('/login')
    await logIn(user)
    await waitFor(() => expect(router.state.location.pathname).toBe('/verify'))
    expect(screen.getByText(/Your email isn't verified yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled()
  })

  it('says when the email or password is wrong', async () => {
    mockApi({ 'POST /api/auth/login': { status: 401, body: { detail: 'incorrect email or password' } } })
    const user = userEvent.setup()
    renderApp('/login')
    await logIn(user, 'wrong password')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
  })

  it('says how long to wait after too many attempts', async () => {
    mockApi({ 'POST /api/auth/login': { status: 429, body: { detail: 'too many' }, headers: { 'Retry-After': '600' } } })
    const user = userEvent.setup()
    renderApp('/login')
    await logIn(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed attempts. Try again in 10 minutes.')
  })

  it('skips the form for someone already signed in', () => {
    mockApi({ '/api/health': HEALTHY })
    setSession(sessionReply().body as never)
    const { router } = renderApp('/login')
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('session on reload', () => {
  it('restores the session from the cookie', async () => {
    window.localStorage.setItem('sarathi.signedIn', '1')
    mockApi({ 'POST /api/auth/refresh': sessionReply() })
    renderApp('/account')
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    expect(await screen.findByText('Ramesh Karki')).toBeInTheDocument()
  })

  it('sends people whose session ended to log in', async () => {
    window.localStorage.setItem('sarathi.signedIn', '1')
    mockApi({ 'POST /api/auth/refresh': { status: 401, body: { detail: 'this session has ended' } } })
    const { router } = renderApp('/account')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(window.localStorage.getItem('sarathi.signedIn')).toBeNull()
  })

  it('does not call the server for visitors who never signed in', async () => {
    const fetch = mockApi({ '/api/health': HEALTHY })
    renderApp('/')
    await screen.findByText('Live')
    expect(await sent(fetch, 'POST', '/api/auth/refresh')).toHaveLength(0)
  })
})

describe('account', () => {
  it('logs out and returns to the map', async () => {
    setSession(sessionReply().body as never)
    const fetch = mockApi({ '/api/health': HEALTHY, 'POST /api/auth/logout': { status: 204 } })
    const user = userEvent.setup()
    const { router } = renderApp('/account')
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await sent(fetch, 'POST', '/api/auth/logout')).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Log in' })).toHaveLength(2))
  })

  it('points unverified users to the code screen and shows the moderator role', () => {
    setSession(sessionReply(makeUser({ email_verified: false, role: 'moderator' })).body as never)
    mockApi({})
    renderApp('/account')
    expect(screen.getByRole('link', { name: /Verify your email/ }))
      .toHaveAttribute('href', `/verify?email=${encodeURIComponent(EMAIL)}`)
    expect(screen.getByText('Moderator')).toBeInTheDocument()
  })
})

describe('password reset', () => {
  it('sends a code, sets the new password and returns to log in', async () => {
    const fetch = mockApi({
      'POST /api/auth/forgot-password': { status: 202, body: { message: 'sent' } },
      'POST /api/auth/reset-password': { body: { message: 'password changed' } },
    })
    const user = userEvent.setup()
    const { router } = renderApp(`/forgot-password?email=${encodeURIComponent(EMAIL)}`)
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/reset-password'))

    await typeCode(user, '135790')
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.getByRole('status')).toHaveTextContent('Password changed.')
    expect(within(screen.getByRole('main')).getByLabelText('Email')).toHaveValue(EMAIL)
    expect((await sent(fetch, 'POST', '/api/auth/reset-password'))[0].body)
      .toEqual({ email: EMAIL, code: '135790', new_password: 'a brand new passphrase' })
  })

  it('shows a wrong code next to the code boxes', async () => {
    mockApi({ 'POST /api/auth/reset-password': { status: 400, body: { detail: 'incorrect code; 4 attempts left' } } })
    const user = userEvent.setup()
    renderApp(`/reset-password?email=${encodeURIComponent(EMAIL)}`)
    await typeCode(user, '000000')
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Incorrect code; 4 attempts left.')).toBeInTheDocument()
  })
})
