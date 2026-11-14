import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { setSession } from '../auth/session'
import { HEALTHY, makeUser, mockApi, renderApp, sent, sessionReply, type Reply } from '../test/render'

const NOW = Date.now()
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const report = (overrides: Record<string, unknown> = {}) => ({
  id: 457, kind: 'accident', passable: 'partly', note: 'Two vehicles crashed near the junction.', status: 'pending',
  lon: 85.3488, lat: 27.6784, road_name: 'Ring Road', snap_distance_m: 14, closure_radius_m: null,
  created_at: ago(12), reviewed_at: null, review_note: null, cleared_at: null, merged_into_id: null, photos: [],
  reporter: { id: 7, name: 'Ramesh Karki', verified_reports: 9, reviewed_reports: 10 }, similar_reports: 1,
  reported_lon: 85.3489, reported_lat: 27.6785, reviewer_name: null, nearby: [],
  ...overrides,
})
const FLOOD = report({ id: 452, kind: 'flood', road_name: 'Tripureshwor Marg', created_at: ago(41), similar_reports: 0,
  reporter: { id: 8, name: 'Anita Thapa', verified_reports: 0, reviewed_reports: 0 } })
const ACCIDENT = report()
const NEARBY = { id: 460, kind: 'accident', status: 'pending', road_name: 'Ring Road', created_at: ago(5), distance_m: 38.4 }
const PREVIEW = { radius_m: 30, edges: 2, length_m: 184, roads: ['Ring Road'],
  geometry: { type: 'MultiLineString', coordinates: [[[85.348, 27.678], [85.35, 27.679]]] } }
const CLOSURE = { incident_id: 440, kind: 'landslide', road_name: 'Kirtipur–Chobhar road', radius_m: 30, verified_at: ago(60 * 91),
  lon: 85.29, lat: 27.67, edges: 2, length_m: 212, geometry: PREVIEW.geometry }
const STATS = { pending: 2, oldest_pending_at: ago(41), active_closures: 1, closed_edges: 2, reports_today: 23,
  verified_today: 16, rejected_today: 4, median_verify_s: 18 * 60 }
const AUDIT = [
  { id: 3, created_at: ago(5), actor_id: 1, actor_name: 'Sita Maharjan', action: 'verify', target_type: 'incident', target_id: 440,
    details: { radius_m: 30, closed_edges: 2, road: 'Kirtipur–Chobhar road' }, incident_kind: 'landslide',
    incident_road: 'Kirtipur–Chobhar road', user_name: null },
  { id: 2, created_at: ago(30), actor_id: 1, actor_name: 'Sita Maharjan', action: 'reject', target_type: 'incident', target_id: 455,
    details: { reason: 'The road is open' }, incident_kind: 'flood', incident_road: 'Balkhu', user_name: null },
  { id: 1, created_at: ago(90), actor_id: 1, actor_name: 'Sita Maharjan', action: 'suspend', target_type: 'user', target_id: 9,
    details: { name: 'user4471', reason: 'Spam reports' }, incident_kind: null, incident_road: null, user_name: 'user4471' },
]
const account = (overrides: Record<string, unknown> = {}) => ({
  id: 7, full_name: 'Ramesh Karki', email: 'ramesh.k@example.com', role: 'user', email_verified: true, status: 'active',
  created_at: '2026-09-14T08:00:00Z', last_login_at: null, reports: 12, verified: 9, rejected: 1, ...overrides,
})
const ME = account({ id: 1, full_name: 'Sita Maharjan', email: 'sita.m@example.com', role: 'moderator', reports: 0, verified: 0, rejected: 0 })
const USERS = { items: [ME, account(), account({ id: 9, full_name: 'user4471', email: 'u4471@example.com', status: 'suspended', reports: 9, verified: 0, rejected: 9 })],
  total: 3, counts: { users: 3, moderators: 1, suspended: 1, unverified: 0 } }

const API: Record<string, Reply | ((request: Request) => Reply)> = {
  '/api/health': HEALTHY, '/api/moderation/stats': { body: STATS }, '/api/moderation/queue': { body: [FLOOD, ACCIDENT] },
  '/api/closures': { body: [CLOSURE] }, '/api/audit': { body: AUDIT }, '/api/moderation/users': { body: USERS },
  '/api/moderation/incidents/457': { body: { ...ACCIDENT, nearby: [NEARBY] } },
  '/api/moderation/incidents/457/closure-preview': { body: PREVIEW },
}
const decided = (status: string): Reply => ({ body: { incident: { ...ACCIDENT, status }, closed_edges: 2, reopened_edges: 0 } })

const asModerator = () => setSession(sessionReply(makeUser({ id: 1, full_name: 'Sita Maharjan', role: 'moderator' })).body as never)
const page = () => within(screen.getByRole('main'))

describe('who can use the moderator panel', () => {
  it('sends visitors to log in and brings them back', async () => {
    mockApi(API)
    const { router } = renderApp('/moderation/reports')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Fmoderation%2Freports')
  })

  it('tells ordinary users it is for moderators, without loading anything', async () => {
    setSession(sessionReply().body as never)
    const fetch = mockApi(API)
    renderApp('/moderation')
    expect(screen.getByRole('heading', { name: 'This area is for moderators' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the map' })).toHaveAttribute('href', '/')
    expect(await sent(fetch, 'GET', '/api/moderation/stats')).toHaveLength(0)
  })

  it('is linked from the account page for moderators only', () => {
    asModerator()
    mockApi(API)
    renderApp('/account')
    expect(page().getByRole('link', { name: /Moderator panel/ })).toHaveAttribute('href', '/moderation')
  })

  it('is not offered to ordinary users', () => {
    setSession(sessionReply().body as never)
    mockApi(API)
    renderApp('/account')
    expect(page().queryByRole('link', { name: /Moderator panel/ })).not.toBeInTheDocument()
  })
})

describe('overview', () => {
  it('shows what is waiting, what is closed and what was done lately', async () => {
    asModerator()
    mockApi(API)
    renderApp('/moderation')
    expect(await page().findByText('Oldest waiting 41 min')).toBeInTheDocument()
    expect(page().getByText('2 road segments closed')).toBeInTheDocument()
    expect(page().getByText('16 verified, 4 rejected')).toBeInTheDocument()
    expect(page().getByText('18 min')).toBeInTheDocument()

    const waiting = within(page().getByRole('region', { name: 'Waiting longest' }))
    const links = await waiting.findAllByRole('link', { name: /Flooding|Accident/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/moderation/reports/452', '/moderation/reports/457'])

    const activity = within(page().getByRole('region', { name: 'Recent activity' }))
    expect(await activity.findByText('Closed 2 road segments within 30 m · Sita Maharjan')).toBeInTheDocument()
    expect(activity.getByText('Reason: The road is open · Sita Maharjan')).toBeInTheDocument()
    expect(activity.getByText('user4471')).toBeInTheDocument()
  })

  it('shows the queue and closure counts in the navigation', async () => {
    asModerator()
    mockApi(API)
    renderApp('/moderation')
    const nav = within(screen.getAllByRole('navigation', { name: 'Moderator panel' })[0])
    expect(await nav.findByLabelText('2 waiting')).toBeInTheDocument()
    expect(await nav.findByLabelText('1 active')).toBeInTheDocument()
  })
})

describe('reviewing reports', () => {
  it('lists the queue oldest first and opens a report with everything needed to judge it', async () => {
    asModerator()
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/moderation/reports')
    const list = within(await page().findByRole('region', { name: 'Pending reports' }))
    const rows = await list.findAllByRole('link')
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/moderation/reports/452', '/moderation/reports/457'])
    expect(rows[1]).toHaveTextContent('1 similar nearby')

    await user.click(rows[1])
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    expect(review.getByRole('heading', { name: 'Accident on Ring Road' })).toBeInTheDocument()
    expect(review.getAllByText('Pending')).toHaveLength(2)  // this report's status and the nearby report's
    expect(review.getByText('9 of 10 past reports verified')).toBeInTheDocument()
    expect(review.getByText('14 m from where the pin was dropped')).toBeInTheDocument()
    expect(review.getByText('Partly passable')).toBeInTheDocument()
    expect(review.getByText(/Two vehicles crashed near the junction/)).toBeInTheDocument()
    expect(review.getByRole('link', { name: 'Report #460: Accident' })).toHaveAttribute('href', '/moderation/reports/460')
    expect(await review.findByText('180 m of Ring Road')).toBeInTheDocument()
  })

  it('verifies with the chosen radius and moves on to the next report waiting', async () => {
    asModerator()
    const fetch = mockApi({ ...API, 'POST /api/incidents/457/verify': decided('verified') })
    const user = userEvent.setup()
    const { router } = renderApp('/moderation/reports/457')
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    await review.findByText('180 m of Ring Road')
    await user.click(review.getByRole('button', { name: 'Verify and close road' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/moderation/reports/452'))
    expect((await sent(fetch, 'POST', '/api/incidents/457/verify'))[0].body).toEqual({ radius_m: 30 })
    expect(await page().findByText('Report #457 was verified and the road is closed.')).toBeInTheDocument()
  })

  it('asks the preview again when the radius changes', async () => {
    asModerator()
    const fetch = mockApi(API)
    renderApp('/moderation/reports/457')
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    const slider = await review.findByLabelText(/Close roads within/)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '80' } })
    expect(review.getByText('80 m')).toBeInTheDocument()
    await waitFor(async () => {
      const radii = (await sent(fetch, 'GET', '/api/moderation/incidents/457/closure-preview'))
        .map(({ request }) => new URL(request.url).searchParams.get('radius_m'))
      expect(radii).toEqual(['30', '80'])
    })
  })

  it('rejects only with a reason, which can be picked from common ones', async () => {
    asModerator()
    const fetch = mockApi({ ...API, 'POST /api/incidents/457/reject': decided('rejected') })
    const user = userEvent.setup()
    renderApp('/moderation/reports/457')
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    await user.click(await review.findByRole('button', { name: 'Reject' }))
    await user.click(review.getByRole('button', { name: 'Reject report' }))
    expect(review.getByRole('alert')).toHaveTextContent('Give a short reason.')
    expect(await sent(fetch, 'POST', '/api/incidents/457/reject')).toHaveLength(0)

    await user.click(review.getByRole('button', { name: 'The road is open' }))
    await user.click(review.getByRole('button', { name: 'Reject report' }))
    expect(await page().findByText('Report #457 was rejected.')).toBeInTheDocument()
    expect((await sent(fetch, 'POST', '/api/incidents/457/reject'))[0].body).toEqual({ reason: 'The road is open' })
  })

  it('merges a duplicate into a nearby report', async () => {
    asModerator()
    const fetch = mockApi({ ...API, 'POST /api/incidents/457/merge': decided('merged') })
    const user = userEvent.setup()
    renderApp('/moderation/reports/457')
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    await user.click(await review.findByRole('button', { name: 'Same hazard: merge' }))
    expect(await page().findByText('Report #457 was merged into report #460.')).toBeInTheDocument()
    expect((await sent(fetch, 'POST', '/api/incidents/457/merge'))[0].body).toEqual({ into_id: 460 })
  })

  it('keeps the report open and explains when a decision fails', async () => {
    asModerator()
    mockApi({ ...API, 'POST /api/incidents/457/verify': { status: 409, body: { detail: 'only pending reports can be verified; report 457 is rejected' } } })
    const user = userEvent.setup()
    const { router } = renderApp('/moderation/reports/457')
    const review = within(await page().findByRole('article', { name: 'Report 457' }))
    await user.click(await review.findByRole('button', { name: 'Verify and close road' }))
    expect(await review.findByRole('alert')).toHaveTextContent('Only pending reports can be verified; report 457 is rejected.')
    expect(router.state.location.pathname).toBe('/moderation/reports/457')
  })

  it('shows decided reports with who decided and why, and clears a verified one', async () => {
    asModerator()
    const verified = report({ id: 440, kind: 'landslide', road_name: 'Kirtipur–Chobhar road', status: 'verified',
      closure_radius_m: 30, reviewed_at: ago(200), reviewer_name: 'Sita Maharjan' })
    const fetch = mockApi({
      ...API, '/api/moderation/incidents': { body: [verified] }, '/api/moderation/incidents/440': { body: verified },
      '/api/moderation/incidents/440/closure-preview': { body: { ...PREVIEW, roads: ['Kirtipur–Chobhar road'], length_m: 212 } },
      'POST /api/incidents/440/clear': decided('cleared'),
    })
    const user = userEvent.setup()
    renderApp('/moderation/reports?tab=verified')
    expect(page().getByRole('tab', { name: 'Verified' })).toHaveAttribute('aria-selected', 'true')
    await user.click(await within(page().getByRole('region', { name: 'Verified reports' })).findByRole('link'))
    const review = within(await page().findByRole('article', { name: 'Report 440' }))
    expect(await review.findByText(/verified by Sita Maharjan/)).toBeInTheDocument()
    expect(review.getByText('Road closed')).toBeInTheDocument()
    expect(review.queryByRole('button', { name: 'Verify and close road' })).not.toBeInTheDocument()

    await user.click(review.getByRole('button', { name: 'Mark cleared' }))
    expect(await sent(fetch, 'POST', '/api/incidents/440/clear')).toHaveLength(0)  // asks first
    await user.click(review.getByRole('button', { name: 'Yes, reopen' }))
    expect(await page().findByText('Report #440 was cleared and the road is open again.')).toBeInTheDocument()
    const statuses = (await sent(fetch, 'GET', '/api/moderation/incidents'))
      .map(({ request }) => new URL(request.url).searchParams.getAll('status'))
    expect(statuses[0]).toEqual(['verified', 'cleared'])
  })
})

describe('active closures', () => {
  it('lists closed roads, flags old ones, and reopens one after a confirmation', async () => {
    asModerator()
    const fetch = mockApi({ ...API, 'POST /api/incidents/440/clear': decided('cleared') })
    const user = userEvent.setup()
    renderApp('/moderation/closures')
    const row = within((await page().findAllByRole('listitem')).find((item) => item.textContent?.includes('Kirtipur'))!)
    expect(row.getByText('Landslide · 210 m closed within 30 m')).toBeInTheDocument()
    expect(row.getByText('Check again')).toBeInTheDocument()  // closed for more than 72 hours
    expect(page().getByText('1 older than 72 hours')).toBeInTheDocument()
    expect(row.getByRole('link', { name: 'Report' })).toHaveAttribute('href', '/moderation/reports/440?tab=verified')

    await user.click(row.getByRole('button', { name: 'Mark cleared' }))
    expect(row.getByText('Reopen Kirtipur–Chobhar road?')).toBeInTheDocument()
    expect(await sent(fetch, 'POST', '/api/incidents/440/clear')).toHaveLength(0)
    await user.click(row.getByRole('button', { name: 'Yes, reopen' }))
    await waitFor(async () => expect(await sent(fetch, 'POST', '/api/incidents/440/clear')).toHaveLength(1))
  })

  it('says so when every road is open', async () => {
    asModerator()
    mockApi({ ...API, '/api/closures': { body: [] } })
    renderApp('/moderation/closures')
    expect(await page().findByText('All roads are open')).toBeInTheDocument()
  })
})

describe('audit log', () => {
  it('shows who did what to which report or account, and filters by action', async () => {
    asModerator()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/moderation/audit')
    const rows = (await page().findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Sita MaharjanVerifiedReport #440Landslide, Kirtipur–Chobhar roadClosed 2 road segments within 30 m')
    expect(within(rows[0]).getByRole('link', { name: 'Report #440' })).toHaveAttribute('href', '/moderation/reports/440?tab=verified')
    expect(within(rows[1]).getByRole('link', { name: 'Report #455' })).toHaveAttribute('href', '/moderation/reports/455?tab=rejected')
    expect(rows[2]).toHaveTextContent('Suspendeduser4471AccountReason: Spam reports')

    await user.selectOptions(page().getByRole('combobox', { name: 'Show' }), 'Rejected')
    await waitFor(async () => {
      const actions = (await sent(fetch, 'GET', '/api/audit')).map(({ request }) => new URL(request.url).searchParams.get('action'))
      expect(actions).toContain('reject')
    })
  })
})

describe('users', () => {
  it('lists accounts with their record and searches by name or email', async () => {
    asModerator()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/moderation/users')
    const rows = (await page().findAllByRole('row')).slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'SSita Maharjansita.m@example.com', 'RRamesh Karkiramesh.k@example.com', 'Uuser4471u4471@example.com'])
    expect(rows[0]).toHaveTextContent('This is you')
    expect(rows[1]).toHaveTextContent('90% (9 of 10)')
    expect(rows[1]).toHaveTextContent('14 Sep 2026')
    expect(rows[2]).toHaveTextContent('Suspended')
    expect(page().getByText('1–3 of 3 accounts')).toBeInTheDocument()

    await user.type(page().getByRole('searchbox', { name: 'Search name or email' }), 'ramesh')
    await user.selectOptions(page().getByRole('combobox', { name: 'Status' }), 'Suspended')
    await waitFor(async () => {
      const last = (await sent(fetch, 'GET', '/api/moderation/users')).at(-1)!
      const query = new URL(last.request.url).searchParams
      expect([query.get('q'), query.get('status'), query.get('offset')]).toEqual(['ramesh', 'suspended', '0'])
    })
  })

  it('suspends an account with a reason and reinstates a suspended one', async () => {
    asModerator()
    const fetch = mockApi({
      ...API, 'POST /api/moderation/users/7/suspend': { body: account({ status: 'suspended' }) },
      'POST /api/moderation/users/9/reinstate': { body: account({ id: 9, full_name: 'user4471' }) },
    })
    const user = userEvent.setup()
    renderApp('/moderation/users')
    const [, ramesh, spammer] = (await page().findAllByRole('row')).slice(1)
    await user.click(within(ramesh).getByRole('button', { name: 'Suspend' }))
    expect(within(ramesh).getByRole('button', { name: 'Suspend' })).toBeDisabled()  // until a reason is typed
    await user.type(within(ramesh).getByLabelText('Reason for suspending Ramesh Karki'), 'Repeated false reports')
    await user.click(within(ramesh).getByRole('button', { name: 'Suspend' }))
    await waitFor(async () => expect((await sent(fetch, 'POST', '/api/moderation/users/7/suspend'))[0]?.body)
      .toEqual({ reason: 'Repeated false reports' }))

    expect(within(spammer).queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument()
    await user.click(within(spammer).getByRole('button', { name: 'Reinstate' }))
    await waitFor(async () => expect(await sent(fetch, 'POST', '/api/moderation/users/9/reinstate')).toHaveLength(1))
  })

  it('makes someone a moderator after a confirmation', async () => {
    asModerator()
    const fetch = mockApi({ ...API, 'POST /api/moderation/users/7/role': { body: account({ role: 'moderator' }) } })
    const user = userEvent.setup()
    renderApp('/moderation/users')
    const ramesh = (await page().findAllByRole('row'))[2]
    await user.click(within(ramesh).getByRole('button', { name: 'Make moderator' }))
    expect(within(ramesh).getByText('Let Ramesh Karki review reports and manage accounts?')).toBeInTheDocument()
    expect(await sent(fetch, 'POST', '/api/moderation/users/7/role')).toHaveLength(0)
    await user.click(within(ramesh).getByRole('button', { name: 'Make moderator' }))
    await waitFor(async () => expect((await sent(fetch, 'POST', '/api/moderation/users/7/role'))[0]?.body)
      .toEqual({ role: 'moderator' }))
  })
})
