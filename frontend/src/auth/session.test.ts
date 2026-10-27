import { describe, expect, it } from 'vitest'

import { api } from '../api/client'
import { makeUser, mockApi, sent, sessionReply } from '../test/render'
import { getSession, mightHaveSession, refreshSession, setSession } from './session'

const me = (request: Request) => (request.headers.get('Authorization') === 'Bearer new'
  ? { body: makeUser() }
  : { status: 401, body: { detail: 'token has expired' } })

describe('session', () => {
  it('sends the access token with API calls', async () => {
    setSession(sessionReply(makeUser(), 'new').body as never)
    const fetch = mockApi({ '/api/me': me })
    const { data } = await api.GET('/api/me')
    expect(data?.email).toBe('ramesh.k@example.com')
    const [call] = await sent(fetch, 'GET', '/api/me')
    expect(call.request.headers.get('Authorization')).toBe('Bearer new')
  })

  it('renews an expired token once and retries, even for several calls at once', async () => {
    setSession(sessionReply(makeUser(), 'old').body as never)
    const fetch = mockApi({ '/api/me': me, 'POST /api/auth/refresh': sessionReply(makeUser(), 'new') })
    const [first, second] = await Promise.all([api.GET('/api/me'), api.GET('/api/me')])
    expect(first.data?.id).toBe(1)
    expect(second.data?.id).toBe(1)
    expect(await sent(fetch, 'POST', '/api/auth/refresh')).toHaveLength(1)
    expect(getSession()?.accessToken).toBe('new')
  })

  it('renews a token that is about to expire before using it', async () => {
    setSession({ ...(sessionReply(makeUser(), 'old').body as object), expires_in: 5 } as never)
    const fetch = mockApi({ '/api/me': me, 'POST /api/auth/refresh': sessionReply(makeUser(), 'new') })
    expect((await api.GET('/api/me')).data?.id).toBe(1)
    expect(await sent(fetch, 'GET', '/api/me')).toHaveLength(1)  // no failed first attempt
  })

  it('retries once when another tab refreshed at the same moment', async () => {
    let calls = 0
    mockApi({
      'POST /api/auth/refresh': () => (++calls === 1 ? { status: 409, body: { detail: 'just refreshed' } }
        : sessionReply(makeUser(), 'new')),
    })
    const session = await refreshSession()
    expect(session?.accessToken).toBe('new')
    expect(calls).toBe(2)
  })

  it('ends the session when the cookie is no longer valid', async () => {
    setSession(sessionReply().body as never)
    expect(mightHaveSession()).toBe(true)
    mockApi({ 'POST /api/auth/refresh': { status: 401, body: { detail: 'this session has ended' } } })
    expect(await refreshSession()).toBeNull()
    expect(getSession()).toBeNull()
    expect(mightHaveSession()).toBe(false)
  })

  it('gives up on a refused call when renewal fails', async () => {
    setSession(sessionReply(makeUser(), 'old').body as never)
    mockApi({ '/api/me': me, 'POST /api/auth/refresh': { status: 401 } })
    const { response } = await api.GET('/api/me')
    expect(response.status).toBe(401)
    expect(getSession()).toBeNull()
  })

  it('keeps the session through a network failure while renewing', async () => {
    setSession(sessionReply().body as never)
    mockApi({})
    await expect(refreshSession()).rejects.toThrow()
    expect(mightHaveSession()).toBe(true)  // try again next time
  })
})
