import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent, type Reply } from '../test/render'

const route = (overrides: object = {}) => ({
  distance_m: 5821, duration_s: 650, weight: 'time', algorithm: 'astar', visited_nodes: 1710, runtime_ms: 9.4,
  start: { node_id: 1, distance_m: 12 }, end: { node_id: 2, distance_m: 8 }, edge_ids: [10, 11, 12],
  geometry: { type: 'LineString', coordinates: [[85.2975, 27.6935], [85.30, 27.68], [85.3185, 27.6683]] },
  steps: [
    { road_name: null, distance_m: 180, duration_s: 20 },
    { road_name: 'University Path', distance_m: 1258, duration_s: 140 },
    { road_name: 'Kathmandu Ringroad', distance_m: 2526, duration_s: 260 },
    { road_name: 'Dhasikhel Marga', distance_m: 516, duration_s: 70 },
  ],
  detour: null, ...overrides,
})

/** Answer /api/route per algorithm and weight, recording nothing else. */
function routeReply(extra: object = {}) {
  return (request: Request): Reply => {
    const params = new URL(request.url).searchParams
    const dijkstra = params.get('algorithm') === 'dijkstra'
    return { body: route({ algorithm: params.get('algorithm'), weight: params.get('weight'),
      visited_nodes: dijkstra ? 7727 : 1710, runtime_ms: dijkstra ? 38 : 9.4, ...extra }) }
  }
}

const API = {
  '/api/health': HEALTHY, '/api/facilities': { body: { type: 'FeatureCollection', features: [] } },
  '/api/closures': { body: [] }, '/api/incidents': { body: [] }, '/api/route': routeReply(),
  '/api/search': { body: [{ type: 'facility', id: 7, name: 'Bir Hospital', kind: 'hospital', address: null,
    lon: 85.3132, lat: 27.7045, distance_m: null }] },
}

const TRIP = '/directions?from=27.6935,85.2975&fromName=Kuleshwor&to=27.6683,85.3185&name=Patan%20Hospital'
const panel = () => within(screen.getByRole('main'))

function shareLocation(lat = 27.69, lon = 85.29) {
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
    geolocation: { getCurrentPosition: (ok: PositionCallback) =>
      ok({ coords: { latitude: lat, longitude: lon, accuracy: 20 } } as GeolocationPosition) },
  }))
}

describe('directions', () => {
  it('shows the route, what it follows and the roads', async () => {
    const fetch = mockApi(API)
    const { container } = renderApp(TRIP)
    const summary = await screen.findByRole('region', { name: 'Route summary' })
    expect(summary).toHaveTextContent('11 min (5.8 km)')
    expect(summary).toHaveTextContent('Fastest open route via University Path and Kathmandu Ringroad')
    expect(panel().getByRole('combobox', { name: 'Start' })).toHaveValue('Kuleshwor')
    expect(panel().getByRole('combobox', { name: 'Destination' })).toHaveValue('Patan Hospital')

    // End users see routes, not how they were computed.
    expect(panel().queryByText(/Dijkstra|A\*|algorithm/i)).not.toBeInTheDocument()
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    const roads = panel().getByRole('heading', { name: /Roads on this route/ }).closest('section')!
    expect(within(roads).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Unnamed road180 m', '2University Path1.3 km', '3Kathmandu Ringroad2.5 km', '4Dhasikhel Marga520 m',
    ])

    const calls = await sent(fetch, 'GET', '/api/route')
    expect(calls).toHaveLength(1)  // one route request; the server picks the search method
    expect(new URL(calls[0].request.url).search)
      .toBe('?from_lat=27.6935&from_lon=85.2975&to_lat=27.6683&to_lon=85.3185&weight=time')
    await waitFor(() => expect(container.querySelectorAll('.leaflet-route-line-pane path').length).toBeGreaterThanOrEqual(2))
  })

  it('explains the closures a route goes around', async () => {
    mockApi({ ...API, '/api/route': routeReply({ distance_m: 6064, detour: { usual_distance_m: 5821,
      usual_duration_s: 650, closures: [{ incident_id: 8, kind: 'flood', road_name: 'Kathmandu Ringroad' }] } }) })
    renderApp(TRIP)
    expect(await panel().findByText('Avoids 1 closed road')).toBeInTheDocument()
    expect(panel().getByRole('link', { name: 'Flooding on Kathmandu Ringroad' })).toHaveAttribute('href', '/hazards/8')
    expect(panel().getByText('The usual route is 5.8 km, 11 min.')).toBeInTheDocument()
  })

  it('switches to the shortest route', async () => {
    const fetch = mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp(TRIP)
    await screen.findByRole('region', { name: 'Route summary' })
    await user.click(panel().getByRole('radio', { name: /Shortest/ }))
    expect(router.state.location.search).toContain('weight=length')
    expect(await screen.findByText(/Shortest open route/)).toBeInTheDocument()
    expect((await sent(fetch, 'GET', '/api/route')).some((call) =>
      new URL(call.request.url).searchParams.get('weight') === 'length')).toBe(true)
  })

  it('swaps the start and destination', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp(TRIP)
    await screen.findByRole('region', { name: 'Route summary' })
    await user.click(panel().getByRole('button', { name: 'Swap start and destination' }))
    const params = new URLSearchParams(router.state.location.search)
    expect([params.get('from'), params.get('fromName'), params.get('to'), params.get('name')])
      .toEqual(['27.668300,85.318500', 'Patan Hospital', '27.693500,85.297500', 'Kuleshwor'])
    expect(panel().getByRole('combobox', { name: 'Start' })).toHaveValue('Patan Hospital')
  })

  it('starts from the user once they share their location', async () => {
    shareLocation()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/directions?to=27.6683,85.3185&name=Patan%20Hospital')
    expect(await panel().findByText(/Share your location to start from where you are/)).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('region', { name: 'Route summary' })).toBeInTheDocument()
    const [call] = await sent(fetch, 'GET', '/api/route')
    expect(new URL(call.request.url).searchParams.get('from_lat')).toBe('27.69')
  })

  it('sets the destination from a search', async () => {
    shareLocation()
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp('/directions')
    await user.type(panel().getByRole('combobox', { name: 'Destination' }), 'bir')
    await user.click(await screen.findByRole('option', { name: /Bir Hospital/ }))
    const params = new URLSearchParams(router.state.location.search)
    expect([params.get('to'), params.get('name')]).toEqual(['27.704500,85.313200', 'Bir Hospital'])
  })

  it('lets people choose a point on the map', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { router, container } = renderApp('/directions?to=27.6683,85.3185')
    await user.click(panel().getByRole('combobox', { name: 'Start' }))
    await user.click(await screen.findByRole('option', { name: /Choose on map/ }))
    expect(screen.getByText('Tap the map to set the start.')).toBeInTheDocument()
    fireEvent.click(container.querySelector('.leaflet-container')!, { clientX: 5, clientY: 5 })
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('fromName')).toBe('Chosen start'))
    expect(screen.queryByText('Tap the map to set the start.')).not.toBeInTheDocument()
  })

  it.each([
    [404, 'closed roads cut off every route between these points', 'Verified closures cut off every route'],
    [404, 'no open route between these points', 'No open road connects these points.'],
    [422, 'no road within 1000 m of (85.1, 27.9)', 'One of the points is too far from any road.'],
  ])('explains a %d: %s', async (status, detail, message) => {
    mockApi({ ...API, '/api/route': { status, body: { detail } } })
    renderApp(TRIP)
    expect(await panel().findByRole('alert')).toHaveTextContent(message)
  })

  it('refuses points outside the district without asking the server', async () => {
    const fetch = mockApi(API)
    renderApp('/directions?from=27.6935,85.2975&to=28.2096,83.9856&name=Pokhara')
    expect(await panel().findByText(/Sarathi has roads for Kathmandu District only/)).toBeInTheDocument()
    expect(await sent(fetch, 'GET', '/api/route')).toHaveLength(0)
  })

  it('says how far the route starts from the chosen point when it is not on a road', async () => {
    mockApi({ ...API, '/api/route': routeReply({ start: { node_id: 1, distance_m: 120 } }) })
    renderApp(TRIP)
    expect(await screen.findByText(/Starts on the nearest road, 120 m from your start/)).toBeInTheDocument()
  })

  it('asks whether to go around unverified reports, saying what it costs', async () => {
    const pending = { incident_id: 21, kind: 'road_works', road_name: 'Teku Road', created_at: new Date(Date.now() - 20 * 60_000).toISOString() }
    mockApi({ ...API, '/api/route': (request: Request) => {
      const avoid = new URL(request.url).searchParams.get('avoid_unverified') === 'true'
      return { body: route(avoid
        ? { distance_m: 6600, duration_s: 830, unverified: [], avoids_unverified: true,
            steps: [{ road_name: 'Bagmati Path', distance_m: 6600, duration_s: 830 }] }
        : { unverified: [pending], avoids_unverified: false }) }
    } })
    const user = userEvent.setup()
    const { router } = renderApp(TRIP)
    const question = await panel().findByRole('region', { name: 'Unverified reports on this route' })
    expect(question).toHaveTextContent('Unverified report on your route')
    expect(within(question).getByRole('link', { name: 'Road works on Teku Road' })).toHaveAttribute('href', '/hazards/21')
    expect(question).toHaveTextContent('reported 20 min ago')
    expect(await within(question).findByText(/It's \+3 min, \+780 m\./)).toBeInTheDocument()
    // Until answered, the route shown is still the one through it.
    expect(panel().getByRole('region', { name: 'Route summary' })).toHaveTextContent('11 min (5.8 km)')

    await user.click(within(question).getByRole('button', { name: /Go around/ }))
    expect(router.state.location.search).toContain('avoid=unverified')
    expect(await panel().findByText('Going around 1 unverified report')).toBeInTheDocument()
    expect(panel().getByText('This route is +3 min, +780 m compared with the route through it.')).toBeInTheDocument()
    expect(panel().getByRole('region', { name: 'Route summary' })).toHaveTextContent('14 min (6.6 km)')

    await user.click(panel().getByRole('button', { name: 'Take the route through it instead' }))
    expect(router.state.location.search).toContain('avoid=none')
    expect(await panel().findByText('Passes 1 unverified report')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Go around it instead' })).toBeInTheDocument()
    expect(panel().queryByRole('region', { name: 'Unverified reports on this route' })).not.toBeInTheDocument()
  })

  it('keeps the route when asked, and remembers the answer', async () => {
    const pending = { incident_id: 21, kind: 'flood', road_name: 'Teku Road', created_at: new Date().toISOString() }
    mockApi({ ...API, '/api/route': (request: Request) => ({ body: route(
      new URL(request.url).searchParams.has('avoid_unverified') ? { distance_m: 6000 } : { unverified: [pending] }) }) })
    const user = userEvent.setup()
    const { router } = renderApp(TRIP)
    await user.click(await panel().findByRole('button', { name: 'Keep this route' }))
    expect(router.state.location.search).toContain('avoid=none')
    expect(panel().getByText('Passes 1 unverified report')).toBeInTheDocument()
    expect(panel().getByRole('region', { name: 'Route summary' })).toHaveTextContent('11 min (5.8 km)')
  })

  it('does not ask when no route goes around them', async () => {
    const pending = { incident_id: 21, kind: 'flood', road_name: 'Teku Road', created_at: new Date().toISOString() }
    mockApi({ ...API, '/api/route': (request: Request) => (new URL(request.url).searchParams.has('avoid_unverified')
      ? { status: 404, body: { detail: 'no route avoids the unverified reports between these points' } }
      : { body: route({ unverified: [pending] }) }) })
    renderApp(TRIP)
    expect(await panel().findByText('No route goes around it, so take care there.')).toBeInTheDocument()
    expect(panel().queryByRole('button', { name: /Go around/ })).not.toBeInTheDocument()
    expect(panel().getByRole('region', { name: 'Route summary' })).toHaveTextContent('11 min (5.8 km)')
  })

  it('shows nothing extra when the route passes no unverified reports', async () => {
    mockApi(API)
    renderApp(TRIP)
    await screen.findByRole('region', { name: 'Route summary' })
    expect(panel().queryByText(/unverified report/)).not.toBeInTheDocument()
  })
})
