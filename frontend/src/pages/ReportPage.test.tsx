import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { setSession } from '../auth/session'
import { HEALTHY, makeUser, mockApi, renderApp, sent, sessionReply, type Reply } from '../test/render'

const SPOT = '/report?lat=27.695300&lon=85.312800'
const DETAILS = `${SPOT}&step=details`
const road = (name: string | null, distance = 12): Reply => ({
  body: { road_name: name, distance_m: distance, lon: 85.3128, lat: 27.6953 },
})
const created = {
  id: 458, kind: 'flood', passable: 'no', note: 'Water above knee height', status: 'pending', lon: 85.3128,
  lat: 27.6953, road_name: 'Tripureshwor Marg', snap_distance_m: 12, closure_radius_m: null,
  created_at: '2026-10-28T10:42:00Z', reviewed_at: null, review_note: null, cleared_at: null, merged_into_id: null,
}
const API = {
  '/api/health': HEALTHY, '/api/facilities': { body: { type: 'FeatureCollection', features: [] } },
  '/api/closures': { body: [] }, '/api/incidents': { body: [] }, '/api/roads/nearest': road('Tripureshwor Marg'),
  'POST /api/incidents': { status: 201, body: created }, '/api/incidents/458': { body: created },
}

const panel = () => within(screen.getByRole('main'))
const signIn = (verified = true) => setSession(sessionReply(makeUser({ email_verified: verified })).body as never)

describe('report a hazard: where', () => {
  it('needs an account', async () => {
    mockApi(API)
    const { router } = renderApp(SPOT)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('asks unverified users to confirm their email first', () => {
    signIn(false)
    mockApi(API)
    renderApp(SPOT)
    expect(panel().getByRole('heading', { name: 'Verify your email to report hazards' })).toBeInTheDocument()
    expect(panel().getByRole('link', { name: 'Verify email' }))
      .toHaveAttribute('href', '/verify?email=ramesh.k%40example.com&next=%2Freport')
  })

  it('names the road under the pin and moves on to the details', async () => {
    signIn()
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp(SPOT)
    expect(await panel().findByRole('heading', { name: 'Tripureshwor Marg' })).toBeInTheDocument()
    expect(panel().getByText('The report will snap to this road (10 m away)')).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Next' }))
    expect(router.state.location.search).toBe('?lat=27.695300&lon=85.312800&step=details')
  })

  it('will not go on until the pin is on a road', async () => {
    signIn()
    mockApi({ ...API, '/api/roads/nearest': road('Tripureshwor Marg', 320) })
    renderApp(SPOT)
    expect(await panel().findByText('Move the pin onto a road (within 150 m)')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('refuses spots outside the district', async () => {
    signIn()
    const fetch = mockApi(API)
    renderApp('/report?lat=28.2096&lon=83.9856')
    expect(await panel().findByText('Outside Kathmandu District')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(await sent(fetch, 'GET', '/api/roads/nearest')).toHaveLength(0)
  })

  it('asks for a spot when none is known yet', () => {
    signIn()
    mockApi(API)
    renderApp('/report')
    expect(panel().getByText('Move the map to place the pin')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('report a hazard: details', () => {
  it('sends the report and confirms it', async () => {
    signIn()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp(DETAILS)
    expect(await panel().findByText('Tripureshwor Marg')).toBeInTheDocument()
    await user.click(panel().getByRole('radio', { name: /Flooding/ }))
    await user.click(panel().getByRole('radio', { name: /^No$/ }))
    expect(panel().getByText('Nothing can get past, not even motorbikes.')).toBeInTheDocument()
    await user.type(panel().getByRole('textbox'), '  Water above knee height ')
    expect(panel().getByText('26/200')).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Submit report' }))

    const [call] = await sent(fetch, 'POST', '/api/incidents')
    expect(call.body).toEqual({ kind: 'flood', passable: 'no', note: 'Water above knee height', lat: 27.6953, lon: 85.3128 })
    await waitFor(() => expect(router.state.location.pathname).toBe('/report/submitted/458'))
    expect(await panel().findByText('Flooding on Tripureshwor Marg')).toBeInTheDocument()
    expect(panel().getByRole('list', { name: 'What happens next' })).toHaveTextContent('Waiting for reviewNow')
    expect(panel().getByRole('link', { name: 'View my reports' })).toHaveAttribute('href', '/reports')
  })

  it('needs a hazard type', async () => {
    signIn()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp(DETAILS)
    await user.click(await panel().findByRole('button', { name: 'Submit report' }))
    expect(panel().getByRole('alert')).toHaveTextContent("Choose what's happening.")
    expect(await sent(fetch, 'POST', '/api/incidents')).toHaveLength(0)
  })

  it('goes back to move the pin', async () => {
    signIn()
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp(DETAILS)
    await user.click(await panel().findByRole('button', { name: 'Change' }))
    expect(router.state.location.search).toBe('?lat=27.695300&lon=85.312800')
  })

  it.each([
    [409, {}, "You've already reported this hazard; it's waiting for review."],
    [429, { 'Retry-After': '900' }, "You've sent a lot of reports in the last hour. Try again in 15 minutes."],
    [422, {}, 'This spot is too far from a road.'],
  ])('explains a %d', async (status, headers, message) => {
    signIn()
    mockApi({ ...API, 'POST /api/incidents': { status, headers, body: { detail: 'no road within 150 m' } } })
    const user = userEvent.setup()
    renderApp(DETAILS)
    await user.click(await panel().findByRole('radio', { name: /Accident/ }))
    await user.click(panel().getByRole('button', { name: 'Submit report' }))
    expect(await panel().findByRole('alert')).toHaveTextContent(message)
  })
})
