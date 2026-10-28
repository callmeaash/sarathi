import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { setSession } from '../auth/session'
import { HEALTHY, makeUser, mockApi, renderApp, sessionReply } from '../test/render'

const report = (id: number, overrides: object) => ({
  id, kind: 'flood', passable: 'unsure', note: null, status: 'pending', lon: 85.31, lat: 27.69,
  road_name: 'Tripureshwor Marg', snap_distance_m: 5, closure_radius_m: null, created_at: '2026-10-28T10:42:00Z',
  reviewed_at: null, review_note: null, cleared_at: null, merged_into_id: null, ...overrides,
})

const MINE = [
  report(5, { note: 'Water above knee height', passable: 'no' }),
  report(4, { kind: 'road_works', status: 'verified', road_name: 'Ring Road', closure_radius_m: 30,
    reviewed_at: new Date(Date.now() - 25 * 60_000).toISOString() }),
  report(3, { kind: 'accident', status: 'cleared', road_name: 'Kalanki', cleared_at: new Date(Date.now() - 3 * 3_600_000).toISOString() }),
  report(2, { kind: 'road_blocked', status: 'rejected', road_name: 'New Baneshwor', review_note: 'No blockage found on site.' }),
  report(1, { status: 'merged', merged_into_id: 9 }),
]

const signIn = () => setSession(sessionReply(makeUser()).body as never)
const panel = () => within(screen.getByRole('main'))

describe('my reports', () => {
  it('lists every report with its status and what happened', async () => {
    signIn()
    mockApi({ '/api/health': HEALTHY, '/api/incidents/mine': { body: MINE } })
    renderApp('/reports')
    const list = await panel().findByRole('list', { name: 'Reports' })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(5)
    expect(panel().getByText('5 reports')).toBeInTheDocument()

    expect(cards[0]).toHaveTextContent('Under review')
    expect(cards[0]).toHaveTextContent('Vehicles cannot pass · “Water above knee height”')
    expect(cards[0]).toHaveTextContent("Waiting for a moderator to check it.")
    expect(cards[1]).toHaveTextContent('Road closed')
    expect(cards[1]).toHaveTextContent('Verified 25 min ago. Roads within 30 m are closed')
    expect(cards[2]).toHaveTextContent('Cleared 3 h ago: the roads are open again.')
    expect(cards[3]).toHaveTextContent("Moderator's noteNo blockage found on site.")
    expect(within(cards[4]).getByRole('link', { name: 'See it' })).toHaveAttribute('href', '/hazards/9')
  })

  it('links public reports to their hazard page, but not rejected or merged ones', async () => {
    signIn()
    mockApi({ '/api/health': HEALTHY, '/api/incidents/mine': { body: MINE } })
    renderApp('/reports')
    const cards = within(await panel().findByRole('list', { name: 'Reports' })).getAllByRole('listitem')
    expect(cards[0].querySelector('a')).toHaveAttribute('href', '/hazards/5')
    expect(cards[1].querySelector('a')).toHaveAttribute('href', '/hazards/4')
    expect(cards[3].querySelector('a')).toBeNull()
  })

  it('filters by status, offering only statuses that are present', async () => {
    signIn()
    mockApi({ '/api/health': HEALTHY, '/api/incidents/mine': { body: MINE.slice(0, 2) } })
    const user = userEvent.setup()
    renderApp('/reports')
    const filters = await panel().findByRole('radiogroup', { name: 'Show' })
    expect(within(filters).getAllByRole('radio').map((r) => r.textContent)).toEqual(['All (2)', 'Pending (1)', 'Verified (1)'])
    await user.click(within(filters).getByRole('radio', { name: /Verified/ }))
    const cards = within(panel().getByRole('list', { name: 'Reports' })).getAllByRole('listitem')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Road works')
  })

  it('invites a first report when there are none', async () => {
    signIn()
    mockApi({ '/api/health': HEALTHY, '/api/incidents/mine': { body: [] } })
    renderApp('/reports')
    expect(await panel().findByRole('heading', { name: 'No reports yet' })).toBeInTheDocument()
    expect(panel().getByRole('link', { name: /Report a hazard/ })).toHaveAttribute('href', '/report')
  })
})
