import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent, type Reply } from '../test/render'

const BIR = { type: 'facility', id: 7, name: 'Bir Hospital', kind: 'hospital', address: 'Kanti Path', lon: 85.3132,
  lat: 27.7045, distance_m: null }
const BIRTHING = { ...BIR, id: 8, name: 'Hamro Birthing Centre', address: null }
const RING = { type: 'road', id: null, name: 'Ring Road', kind: null, address: null, lon: 85.2988, lat: 27.6847,
  distance_m: null }

/** Answer searches by the query text; with a point, add distances. */
function searchReply(request: Request): Reply {
  const params = new URL(request.url).searchParams
  const q = params.get('q')!.toLowerCase()
  const hits = [BIR, BIRTHING, RING].filter((hit) => hit.name.toLowerCase().includes(q))
  const near = params.has('lat')
  return { body: hits.map((hit) => ({ ...hit, distance_m: near ? 1234 : null })) }
}

const API = {
  '/api/health': HEALTHY, '/api/facilities': { body: { type: 'FeatureCollection', features: [] } },
  '/api/closures': { body: [] }, '/api/incidents': { body: [] }, '/api/search': searchReply,
  '/api/facilities/7': { body: { ...BIR, name_en: null, name_ne: null, phone: null, opening_hours: null,
    emergency: null, source: 'osm', osm_type: 'node', osm_id: 1, road: null } },
  '/api/roads/nearest': { body: { road_name: 'Ring Road', distance_m: 0, lon: 85.2988, lat: 27.6847 } },
}

// Both headers have a search box (CSS hides one per screen size); use the desktop one.
const searchBox = () => screen.getAllByRole('combobox', { name: 'Search places and roads' })[0]

describe('header search', () => {
  it('suggests matching places and roads as you type', async () => {
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/')
    await user.type(searchBox(), 'bir')
    const list = await screen.findByRole('listbox', { name: 'Search places and roads suggestions' })
    const options = await within(list).findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'local_hospitalBir HospitalHospital · Kanti Path', 'local_hospitalHamro Birthing CentreHospital',
    ])
    expect(within(options[0]).getByText('Bir').tagName).toBe('STRONG')  // the matched part stands out
    // Typing quickly sends one request, not one per letter.
    expect((await sent(fetch, 'GET', '/api/search')).map((call) => new URL(call.request.url).searchParams.get('q')))
      .toEqual(['bir'])
  })

  it('opens a place chosen with the mouse', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp('/')
    await user.type(searchBox(), 'bir hosp')
    await user.click(await screen.findByRole('option', { name: /Bir Hospital/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/place/7'))
    expect(searchBox()).toHaveValue('')
  })

  it('drops a pin on a road chosen with the keyboard', async () => {
    mockApi(API)
    const user = userEvent.setup()
    const { router } = renderApp('/')
    await user.type(searchBox(), 'ring')
    await screen.findByRole('option', { name: /Ring Road/ })
    await user.keyboard('{ArrowDown}')
    expect(searchBox()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /Ring Road/ }).id)
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/pin'))
    expect(router.state.location.search).toBe('?lat=27.684700&lon=85.298800')
  })

  it('closes with Escape', async () => {
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/')
    await user.type(searchBox(), 'bir')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false')
  })

  it('says when nothing matches, or when search is down', async () => {
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/')
    await user.type(searchBox(), 'zzz')
    expect(await screen.findByText('No places or roads match “zzz”.')).toBeInTheDocument()

    mockApi({ ...API, '/api/search': { status: 500, body: {} } })
    await user.clear(searchBox())
    await user.type(searchBox(), 'qqq')
    expect(await screen.findByText(/Search isn.t available right now/)).toBeInTheDocument()
  })

  it('waits for two characters before searching', async () => {
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/')
    await user.type(searchBox(), 'b')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await sent(fetch, 'GET', '/api/search')).toHaveLength(0)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows distances once the user has shared their location', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
      geolocation: { getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 27.69, longitude: 85.29, accuracy: 20 } } as GeolocationPosition) },
    }))
    const fetch = mockApi(API)
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Show my location' }))
    await user.type(searchBox(), 'bir')
    expect(await screen.findByRole('option', { name: /Bir Hospital.*1\.2 km/ })).toBeInTheDocument()
    const [call] = await sent(fetch, 'GET', '/api/search')
    expect(new URL(call.request.url).search).toBe('?q=bir&lat=27.69&lon=85.29')
  })

  it('jumps to the search box with Ctrl K', async () => {
    mockApi(API)
    const user = userEvent.setup()
    renderApp('/hazards')
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getAllByRole('combobox', { name: 'Search places and roads' })).toContain(document.activeElement)
  })
})
