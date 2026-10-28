import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent } from '../test/render'

const feature = (id: number, kind: string, name: string | null, lon: number, lat: number) => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id, kind, name },
})

const FACILITIES = {
  body: {
    type: 'FeatureCollection',
    features: [
      feature(7, 'hospital', 'Bir Hospital', 85.3132, 27.7045),
      feature(8, 'police', 'Teku Police', 85.305, 27.695),
      feature(9, 'pharmacy', 'City Pharmacy', 85.31, 27.70),
      feature(10, 'fire_station', null, 85.32, 27.71),
    ],
  },
}

const BIR = {
  id: 7, kind: 'hospital', name: 'Bir Hospital', lon: 85.3132, lat: 27.7045, name_en: 'Bir Hospital',
  name_ne: 'वीर अस्पताल', phone: '01-4221111; 01-4221988', opening_hours: '24/7', address: 'Kanti Path',
  emergency: true, source: 'osm', osm_type: 'way', osm_id: 892104, road: null,
}

afterEach(() => vi.restoreAllMocks())

describe('facilities on the map', () => {
  it('shows hospitals, police and fire stations at the starting zoom, and pharmacies once zoomed in', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES })
    renderApp('/')
    expect(await screen.findByTitle('Bir Hospital')).toBeInTheDocument()
    expect(screen.getByTitle('Teku Police')).toBeInTheDocument()
    expect(screen.getByTitle('Fire station')).toBeInTheDocument()  // unnamed: labelled by its kind
    expect(screen.queryByTitle('City Pharmacy')).not.toBeInTheDocument()
  })

  it('loads the whole district in one request', async () => {
    const fetch = mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES })
    renderApp('/')
    await screen.findByTitle('Bir Hospital')
    const [call] = await sent(fetch, 'GET', '/api/facilities')
    expect(new URL(call.request.url).searchParams.get('bbox')).toBe('85.1701,27.56,85.5914,27.8406')
  })

  it('hides a kind when its chip is switched off, and remembers that', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES })
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByTitle('Bir Hospital')
    const [panelChips] = screen.getAllByRole('group', { name: 'Show on map' })
    await user.click(within(panelChips).getByRole('button', { name: /Hospitals/ }))
    expect(screen.queryByTitle('Bir Hospital')).not.toBeInTheDocument()
    expect(within(panelChips).getByRole('button', { name: /Hospitals/ })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(window.localStorage.getItem('sarathi.facilityKinds')!)).toEqual(['police', 'pharmacy', 'fire_station'])
  })

  it('says to zoom in when switching on a kind that is hidden at this zoom', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES })
    const user = userEvent.setup()
    renderApp('/')
    const [chips] = screen.getAllByRole('group', { name: 'Show on map' })
    await user.click(within(chips).getByRole('button', { name: /Pharmacies/ }))  // off
    await user.click(within(chips).getByRole('button', { name: /Pharmacies/ }))  // on again
    expect(await screen.findByText('Zoom in to see pharmacies on the map.')).toBeInTheDocument()
  })

  it('puts the filters in the phone header and in the panel on desktop', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES })
    renderApp('/')
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Show on map' })).toHaveLength(2))
    const phoneHeader = screen.getAllByRole('banner').find((header) => within(header).queryByPlaceholderText(/Search hospitals/))!
    expect(within(phoneHeader).getByRole('group', { name: 'Show on map' })).toBeInTheDocument()
  })

  it('thins out crowded markers when zoomed out, keeping named places, and shows all close up', async () => {
    const crowded = { body: { type: 'FeatureCollection', features: [
      feature(20, 'hospital', null, 85.3200, 27.7000),
      feature(21, 'hospital', 'Named Clinic', 85.3201, 27.7001),  // about 15 m away
    ] } }
    mockApi({ '/api/health': HEALTHY, '/api/facilities': crowded })
    const first = renderApp('/')
    expect(await screen.findByTitle('Named Clinic')).toBeInTheDocument()
    expect(screen.queryByTitle('Hospital')).not.toBeInTheDocument()
    first.unmount()

    window.localStorage.setItem('sarathi.mapView', JSON.stringify({ lat: 27.7, lon: 85.32, zoom: 17 }))
    renderApp('/')
    expect(await screen.findByTitle('Named Clinic')).toBeInTheDocument()
    expect(screen.getByTitle('Hospital')).toBeInTheDocument()
  })

  it('opens a place when its marker is tapped', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/facilities': FACILITIES, '/api/facilities/7': { body: BIR } })
    const { router } = renderApp('/')
    fireEvent.click(await screen.findByTitle('Bir Hospital'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/place/7'))
    expect(await screen.findByRole('heading', { name: 'Bir Hospital' })).toBeInTheDocument()
  })
})

describe('place details', () => {
  it('shows what the place is and how to reach it', async () => {
    mockApi({ '/api/facilities': FACILITIES, '/api/facilities/7': { body: BIR } })
    renderApp('/place/7')
    expect(await screen.findByRole('heading', { name: 'Bir Hospital' })).toBeInTheDocument()
    expect(screen.getByText('वीर अस्पताल')).toBeInTheDocument()
    expect(screen.getByText('Hospital · Kanti Path')).toBeInTheDocument()
    expect(screen.getByText('Emergency services')).toBeInTheDocument()
    expect(screen.getByText('Open 24 hours')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:014221111')
    expect(within(screen.getByRole('main')).getByRole('link', { name: /Directions/ }))
      .toHaveAttribute('href', '/directions?to=27.7045,85.3132&name=Bir%20Hospital')
    expect(screen.getByRole('link', { name: 'Open in OpenStreetMap' }))
      .toHaveAttribute('href', 'https://www.openstreetmap.org/way/892104')
    expect(screen.getByRole('button', { name: 'Show distance from me' })).toBeInTheDocument()
    expect(document.title).toBe('Bir Hospital · Sarathi')
  })

  it('shows the road distance once the user shares their location', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
      geolocation: { getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 27.69, longitude: 85.29, accuracy: 20 } } as GeolocationPosition) },
    }))
    const fetch = mockApi({
      '/api/facilities': FACILITIES,
      '/api/facilities/7': (request) => (new URL(request.url).searchParams.has('from_lat')
        ? { body: { ...BIR, road: { distance_m: 2849, duration_s: 540, straight_line_m: 2100 } } }
        : { body: BIR }),
    })
    const user = userEvent.setup()
    renderApp('/place/7')
    await user.click(await screen.findByRole('button', { name: 'Show distance from me' }))
    expect(await screen.findByText('2.8 km · 9 min by road')).toBeInTheDocument()
    expect(screen.getByText('2.1 km in a straight line')).toBeInTheDocument()
    const calls = await sent(fetch, 'GET', '/api/facilities/7')
    expect(new URL(calls.at(-1)!.request.url).search).toBe('?from_lat=27.69&from_lon=85.29')
  })

  it('keeps the place in view instead of flying to the user', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
      geolocation: { getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 27.69, longitude: 85.29, accuracy: 20 } } as GeolocationPosition) },
    }))
    mockApi({ '/api/facilities': FACILITIES, '/api/facilities/7': { body: BIR } })
    const setView = vi.spyOn(L.Map.prototype, 'setView')
    const user = userEvent.setup()
    renderApp('/place/7')
    await user.click(await screen.findByRole('button', { name: 'Show distance from me' }))
    await screen.findByText('No open road route from your location')
    const centres = setView.mock.calls.map(([center]) => L.latLng(center))
    expect(centres.some((c) => Math.abs(c.lat - 27.7045) < 1e-4)).toBe(true)   // centred on the place
    expect(centres.some((c) => Math.abs(c.lat - 27.69) < 1e-4)).toBe(false)    // never on the user alone
  })

  it('says when closed roads cut the place off', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
      geolocation: { getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 27.69, longitude: 85.29, accuracy: 20 } } as GeolocationPosition) },
    }))
    mockApi({ '/api/facilities': FACILITIES, '/api/facilities/7': { body: BIR } })
    const user = userEvent.setup()
    renderApp('/place/7')
    await user.click(await screen.findByRole('button', { name: 'Show distance from me' }))
    expect(await screen.findByText('No open road route from your location')).toBeInTheDocument()
  })

  it('says when a place does not exist', async () => {
    mockApi({ '/api/facilities': FACILITIES, '/api/facilities/99': { status: 404, body: { detail: 'not found' } } })
    renderApp('/place/99')
    expect(await screen.findByRole('heading', { name: 'Place not found' })).toBeInTheDocument()
  })

  it('credits places added by Sarathi rather than OpenStreetMap', async () => {
    mockApi({ '/api/facilities': FACILITIES,
      '/api/facilities/7': { body: { ...BIR, source: 'manual', osm_type: null, osm_id: null, phone: null } } })
    renderApp('/place/7')
    expect(await screen.findByText('Added by Sarathi')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument()
  })
})
