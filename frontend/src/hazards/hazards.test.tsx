import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { HEALTHY, mockApi, renderApp, type Reply } from '../test/render'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const incident = (id: number, overrides: object = {}) => ({
  id, kind: 'flood', passable: 'no', note: null, status: 'verified', lon: 85.2988, lat: 27.6847,
  road_name: 'Ring Road', snap_distance_m: 2, closure_radius_m: 30, created_at: minutesAgo(90),
  reviewed_at: minutesAgo(25), review_note: null, cleared_at: null, merged_into_id: null, ...overrides,
})

const FLOOD = incident(1, { note: 'Water over the bridge' })
const SLIDE = incident(2, { kind: 'landslide', road_name: 'Kirtipur-Chobhar Road', lon: 85.28, lat: 27.67 })
const CRASH = incident(3, { kind: 'accident', status: 'pending', passable: 'partly', road_name: 'Tripureshwor Marg',
  closure_radius_m: null, reviewed_at: null, created_at: minutesAgo(12), lon: 85.31, lat: 27.695 })
const OLD = incident(4, { kind: 'road_works', status: 'cleared', road_name: 'Gaushala', cleared_at: minutesAgo(600) })

const CLOSURES: Reply = { body: [{
  incident_id: 1, kind: 'flood', road_name: 'Ring Road', radius_m: 30, verified_at: minutesAgo(25), lon: 85.2988,
  lat: 27.6847, edges: 2, geometry: { type: 'MultiLineString', coordinates: [[[85.2985, 27.6845], [85.2991, 27.6849]]] },
}] }

/** Answer the incidents list by the statuses asked for. */
function incidentsReply(request: Request): Reply {
  const statuses = new URL(request.url).searchParams.getAll('status')
  return { body: [CRASH, FLOOD, SLIDE, OLD].filter((item) => statuses.includes(item.status)) }
}

const API = {
  '/api/health': HEALTHY, '/api/facilities': { body: { type: 'FeatureCollection', features: [] } },
  '/api/closures': CLOSURES, '/api/incidents': incidentsReply,
}

describe('hazards on the home panel', () => {
  it('lists verified closures and unverified reports with when they happened', async () => {
    mockApi(API)
    renderApp('/')
    const closures = (await screen.findByRole('heading', { name: /Road closures/ })).closest('section')!
    expect(within(closures).getByRole('heading')).toHaveTextContent(/^Road closures\s*2$/)
    expect(within(closures).getByRole('link', { name: /Ring Road/ })).toHaveTextContent('Flooding · verified 25 min ago')
    expect(within(closures).getByRole('link', { name: /Ring Road/ })).toHaveAttribute('href', '/hazards/1')
    const reports = screen.getByRole('heading', { name: /Unverified reports/ }).closest('section')!
    expect(within(reports).getByRole('link', { name: /Tripureshwor Marg/ })).toHaveTextContent('Accident · reported 12 min ago')
    expect(within(reports).getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/don't change routes until a moderator checks them/)).toBeInTheDocument()
  })

  it('says when nothing is closed or waiting', async () => {
    mockApi({ ...API, '/api/incidents': { body: [] }, '/api/closures': { body: [] } })
    renderApp('/')
    expect(await screen.findByText('No verified road closures right now.')).toBeInTheDocument()
    expect(screen.getByText('All roads open')).toBeInTheDocument()
    expect(screen.getByText('No reports waiting for review')).toBeInTheDocument()
  })

  it('shortens long lists and links to the full page', async () => {
    const many = Array.from({ length: 5 }, (_, i) => incident(10 + i, { road_name: `Road ${i}` }))
    mockApi({ ...API, '/api/incidents': (request: Request) =>
      ({ body: new URL(request.url).searchParams.getAll('status').includes('verified') ? many : [] }) })
    renderApp('/')
    const closures = (await screen.findByRole('heading', { name: /Road closures/ })).closest('section')!
    expect(within(closures).getAllByRole('listitem')).toHaveLength(3)
    expect(within(closures).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/hazards')
  })
})

describe('hazards on the map', () => {
  it('draws closed roads and a badge for each hazard', async () => {
    mockApi(API)
    const { container } = renderApp('/')
    expect(await screen.findByTitle('Flooding · Ring Road')).toBeInTheDocument()
    expect(screen.getByTitle('Accident · Tripureshwor Marg')).toBeInTheDocument()
    expect(screen.queryByTitle('Road works · Gaushala')).not.toBeInTheDocument()  // cleared: not on the map
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2))  // line + dash
  })

  it('opens a hazard when its badge is tapped', async () => {
    mockApi({ ...API, '/api/incidents/1': { body: FLOOD } })
    const { router } = renderApp('/')
    fireEvent.click(await screen.findByTitle('Flooding · Ring Road'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/hazards/1'))
  })

  it('hides layers from the map layers panel and remembers the choice', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { container } = renderApp('/')
    await screen.findByTitle('Accident · Tripureshwor Marg')
    await user.click(screen.getByRole('button', { name: 'Map layers' }))
    const panel = screen.getByRole('group', { name: 'Map layers' })

    await user.click(within(panel).getByRole('switch', { name: 'Unverified reports' }))
    expect(screen.queryByTitle('Accident · Tripureshwor Marg')).not.toBeInTheDocument()
    expect(screen.getByTitle('Flooding · Ring Road')).toBeInTheDocument()

    await user.click(within(panel).getByRole('switch', { name: 'Closed roads' }))
    expect(screen.queryByTitle('Flooding · Ring Road')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0)
    expect(JSON.parse(window.localStorage.getItem('sarathi.mapLayers')!))
      .toEqual({ closures: false, reports: false, facilities: true })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Map layers' })).not.toBeInTheDocument()
  })
})

describe('hazard details', () => {
  it('explains a verified closure', async () => {
    mockApi({ ...API, '/api/incidents/1': { body: FLOOD } })
    renderApp('/hazards/1')
    expect(await screen.findByRole('heading', { name: 'Flooding' })).toBeInTheDocument()
    expect(screen.getByText('Verified closure')).toBeInTheDocument()
    expect(screen.getByText(/Routes and nearest-facility results avoid the roads around it/)).toBeInTheDocument()
    expect(screen.getByText('“Water over the bridge”')).toBeInTheDocument()
    expect(screen.getByText('Vehicles cannot pass')).toBeInTheDocument()
    expect(screen.getByText('Roads closed within 30 m')).toBeInTheDocument()
    expect(screen.getByText(/Verified 25 min ago/)).toBeInTheDocument()
    expect(document.title).toBe('Flooding · Ring Road · Sarathi')
  })

  it('says an unverified report does not change routes yet', async () => {
    mockApi({ ...API, '/api/incidents/3': { body: CRASH } })
    renderApp('/hazards/3')
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument()
    expect(screen.getByText(/doesn't change routes until a moderator checks it/)).toBeInTheDocument()
    expect(screen.getByText('Partly passable')).toBeInTheDocument()
    expect(screen.queryByText(/closed within/)).not.toBeInTheDocument()
  })

  it('says when a hazard is not public or gone', async () => {
    mockApi({ ...API, '/api/incidents/9': { status: 404, body: { detail: 'report 9 not found' } } })
    renderApp('/hazards/9')
    expect(await screen.findByRole('heading', { name: 'Hazard not found' })).toBeInTheDocument()
  })
})

describe('hazards page', () => {
  it('also lists recently cleared hazards', async () => {
    mockApi(API)
    renderApp('/hazards')
    const cleared = (await screen.findByRole('heading', { name: /Recently cleared/ })).closest('section')!
    expect(within(cleared).getByRole('link', { name: /Gaushala/ })).toHaveTextContent('Road works · cleared 10 h ago')
  })
})
