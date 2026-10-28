import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent, type Reply } from '../test/render'

const result = (id: number, name: string | null, distance: number, straight: number, kind = 'hospital') => ({
  facility: { id, kind, name, lon: 85.30 + id / 1000, lat: 27.69 },
  distance_m: distance, duration_s: distance / 6, straight_line_m: straight,
  geometry: { type: 'LineString', coordinates: [[85.2975, 27.6935], [85.30 + id / 1000, 27.69]] },
})

const HOSPITALS = [
  result(1, 'Teku Hospital', 920, 260), result(2, 'Shree Jyoti Hospital', 970, 560),
  result(3, 'Chest Hospital', 1300, 400),  // closer in a straight line than #2, further by road
]

function nearestReply(results = HOSPITALS) {
  return (request: Request): Reply => {
    const kind = new URL(request.url).searchParams.get('kind')
    return { body: { kind, weight: 'time', start: { node_id: 1, distance_m: 10 },
      results: kind === 'hospital' ? results : [result(9, 'Teku Police', 700, 500, 'police')] } }
  }
}

const API = {
  '/api/health': HEALTHY, '/api/closures': { body: [] }, '/api/incidents': { body: [] },
  '/api/facilities': { body: { type: 'FeatureCollection', features: [] } }, '/api/nearest': nearestReply(),
}

const panel = () => within(screen.getByRole('main'))

function shareLocation() {
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
    geolocation: { getCurrentPosition: (ok: PositionCallback) =>
      ok({ coords: { latitude: 27.6935, longitude: 85.2975, accuracy: 20 } } as GeolocationPosition) },
  }))
}

describe('nearby', () => {
  it('ranks hospitals by road from the user and flags straight-line surprises', async () => {
    shareLocation()
    const fetch = mockApi(API)
    const user = userEvent.setup()
    const { container } = renderApp('/nearby')
    await user.click(panel().getByRole('button', { name: 'Use my location' }))
    const list = await panel().findByRole('list', { name: 'Nearest hospitals' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => within(item).getAllByRole('button')[0].textContent)).toEqual([
      '1Teku HospitalNearest920 m · 3 min by road260 mstraight',
      '2Shree Jyoti Hospital970 m · 3 min by road560 mstraight',
      '3Chest Hospital1.3 km · 4 min by road400 mstraight',
    ])
    expect(within(items[2]).getByText('Closer in a straight line, but further by road')).toBeInTheDocument()
    expect(within(items[1]).queryByText(/Closer in a straight line/)).not.toBeInTheDocument()
    expect(panel().getByText('From you')).toBeInTheDocument()
    const [call] = await sent(fetch, 'GET', '/api/nearest')
    expect(new URL(call.request.url).search).toBe('?lat=27.6935&lon=85.2975&kind=hospital&limit=5')
    expect(screen.getByTitle('1. Teku Hospital')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path').length).toBeGreaterThanOrEqual(2))
  })

  it('selects another result and offers directions and details for it', async () => {
    shareLocation()
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/nearby')
    await user.click(panel().getByRole('button', { name: 'Use my location' }))
    const list = await panel().findByRole('list', { name: 'Nearest hospitals' })
    const second = within(list).getAllByRole('listitem')[1]
    await user.click(within(second).getAllByRole('button')[0])
    expect(within(second).getByRole('link', { name: /Directions/ }))
      .toHaveAttribute('href', '/directions?to=27.690000,85.302000&name=Shree%20Jyoti%20Hospital')
    expect(within(second).getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/place/2')
    expect(within(within(list).getAllByRole('listitem')[0]).queryByRole('link', { name: /Directions/ })).not.toBeInTheDocument()
  })

  it('searches from a dropped pin and routes from it', async () => {
    const fetch = mockApi(API)
    renderApp('/nearby?lat=27.70&lon=85.31')
    const list = await panel().findByRole('list', { name: 'Nearest hospitals' })
    expect(panel().getByText('From pin')).toBeInTheDocument()
    expect(within(list).getAllByRole('link', { name: /Directions/ })[0]).toHaveAttribute('href',
      '/directions?from=27.700000,85.310000&fromName=Dropped%20pin&to=27.690000,85.301000&name=Teku%20Hospital')
    const [call] = await sent(fetch, 'GET', '/api/nearest')
    expect(new URL(call.request.url).searchParams.get('lat')).toBe('27.7')
  })

  it('switches the kind of place', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp('/nearby?lat=27.70&lon=85.31')
    await panel().findByRole('list', { name: 'Nearest hospitals' })
    await user.click(panel().getByRole('radio', { name: /Police/ }))
    expect(router.state.location.search).toContain('kind=police')
    const list = await panel().findByRole('list', { name: 'Nearest police' })
    expect(list).toHaveTextContent('Teku Police')
  })

  it('says when nothing can be reached', async () => {
    mockApi({ ...API, '/api/nearest': nearestReply([]) })
    renderApp('/nearby?lat=27.70&lon=85.31')
    expect(await panel().findByText('No hospitals can be reached by road from here right now.')).toBeInTheDocument()
  })

  it('explains a spot far from roads, or outside the district', async () => {
    mockApi({ ...API, '/api/nearest': { status: 422, body: { detail: 'no road within 1000 m' } } })
    const first = renderApp('/nearby?lat=27.70&lon=85.31')
    expect(await panel().findByText(/too far from any road/)).toBeInTheDocument()
    first.unmount()

    const fetch = mockApi(API)
    renderApp('/nearby?lat=28.2096&lon=83.9856')
    expect(await panel().findByText(/outside Kathmandu District/)).toBeInTheDocument()
    expect(await sent(fetch, 'GET', '/api/nearest')).toHaveLength(0)
  })

  it('asks for a location when there is none', () => {
    mockApi(API)
    renderApp('/nearby')
    expect(panel().getByText(/Share your location to find what is nearest to you/)).toBeInTheDocument()
  })
})
