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
  it('shows the route, what it follows, the algorithm comparison and the roads', async () => {
    const fetch = mockApi(API)
    const { container } = renderApp(TRIP)
    const summary = await screen.findByRole('region', { name: 'Route summary' })
    expect(summary).toHaveTextContent('11 min (5.8 km)')
    expect(summary).toHaveTextContent('Fastest open route via University Path and Kathmandu Ringroad')
    expect(panel().getByRole('combobox', { name: 'Start' })).toHaveValue('Kuleshwor')
    expect(panel().getByRole('combobox', { name: 'Destination' })).toHaveValue('Patan Hospital')

    const table = await panel().findByRole('table')
    await waitFor(() => expect(within(table).getByRole('row', { name: /Dijkstra/ })).toHaveTextContent('7,727'))
    expect(within(table).getByRole('row', { name: /A\*/ })).toHaveTextContent('1,710')
    expect(panel().getByText(/A\* searched 78% fewer junctions/)).toBeInTheDocument()
    const roads = panel().getByRole('heading', { name: /Roads on this route/ }).closest('section')!
    expect(within(roads).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Unnamed road180 m', '2University Path1.3 km', '3Kathmandu Ringroad2.5 km', '4Dhasikhel Marga520 m',
    ])

    const calls = await sent(fetch, 'GET', '/api/route')
    expect(calls.map((call) => new URL(call.request.url).searchParams.get('algorithm')).sort()).toEqual(['astar', 'dijkstra'])
    expect(new URL(calls[0].request.url).searchParams.get('from_lat')).toBe('27.6935')
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path').length).toBeGreaterThanOrEqual(2))
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
    expect(await screen.findByText(/Starts at the nearest road junction, 120 m from your start/)).toBeInTheDocument()
  })
})
