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
const jpeg = (name: string) => new File(['photo'], name, { type: 'image/jpeg' })
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

  it('sends the chosen photos after the report and shows them', async () => {
    signIn()
    const photo = { id: 9, url: '/api/photos/0123456789abcdef0123456789abcdef.jpg', width: 800, height: 600 }
    const fetch = mockApi({
      ...API,
      'POST /api/incidents/458/photos': () => ({ status: 201, body: { ...created, photos: [photo] } }),
      '/api/incidents/458': () => ({ body: { ...created, photos: [photo] } }),
    })
    const user = userEvent.setup()
    const { router } = renderApp(DETAILS)
    await user.click(await panel().findByRole('radio', { name: /Flooding/ }))
    await user.upload(panel().getByLabelText('Add photos'), [jpeg('flood.jpg'), jpeg('road.jpg')])
    expect(within(panel().getByRole('list', { name: 'Photos' })).getAllByRole('img')).toHaveLength(2)
    expect(panel().getByText('2/3')).toBeInTheDocument()

    await user.click(panel().getByRole('button', { name: 'Remove photo 2' }))
    expect(panel().getByText('1/3')).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/report/submitted/458'))
    // The removed photo is not sent. (The test browser can't read multipart bodies back, so only the call is checked.)
    const uploads = (await sent(fetch, 'POST', '/api/incidents/458/photos')).map(({ request }) => request)
    expect(uploads).toHaveLength(1)
    expect(uploads[0].headers.get('Authorization')).toBe('Bearer access-1')
    expect(uploads[0].headers.get('Content-Type')).not.toBe('application/json')
    expect(await panel().findByRole('button', { name: 'View photo 1 of 1' })).toBeInTheDocument()
    expect(panel().queryByText(/couldn't be uploaded/)).not.toBeInTheDocument()
  })

  it('still sends the report when a photo fails, and says so', async () => {
    signIn()
    mockApi({ ...API, 'POST /api/incidents/458/photos': { status: 422, body: { detail: 'photos must be JPEG, PNG or WebP images' } } })
    const user = userEvent.setup()
    const { router } = renderApp(DETAILS)
    await user.click(await panel().findByRole('radio', { name: /Flooding/ }))
    await user.upload(panel().getByLabelText('Add photos'), jpeg('flood.jpg'))
    await user.click(panel().getByRole('button', { name: 'Submit report' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/report/submitted/458'))
    expect(await panel().findByText(/Your report was sent, but 1 photo couldn't be uploaded/)).toBeInTheDocument()
  })

  it('takes at most three photos and only images', async () => {
    signIn()
    mockApi(API)
    const user = userEvent.setup({ applyAccept: false })  // as when a file is dragged in or the filter is bypassed
    renderApp(DETAILS)
    const input = await panel().findByLabelText('Add photos')
    await user.upload(input, new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }))
    expect(panel().getByRole('alert')).toHaveTextContent("notes.pdf isn't a JPEG, PNG or WebP photo.")
    expect(panel().getByText('0/3')).toBeInTheDocument()

    await user.upload(input, [jpeg('1.jpg'), jpeg('2.jpg'), jpeg('3.jpg'), jpeg('4.jpg')])
    expect(panel().getByText('3/3')).toBeInTheDocument()
    expect(panel().getByRole('alert')).toHaveTextContent('A report can have up to 3 photos.')
    expect(panel().queryByRole('button', { name: /Add photo/ })).not.toBeInTheDocument()
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
