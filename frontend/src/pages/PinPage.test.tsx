import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp, sent } from '../test/render'

const EMPTY = { body: [] }
const BASE = {
  '/api/health': HEALTHY, '/api/facilities': { body: { type: 'FeatureCollection', features: [] } },
  '/api/closures': EMPTY, '/api/incidents': EMPTY,
}
const road = (name: string | null, distance = 12) =>
  ({ body: { road_name: name, distance_m: distance, lon: 85.2996, lat: 27.6984 } })

const panel = () => within(screen.getByRole('main'))

describe('dropping a pin', () => {
  it('opens the pin page from a long press or right-click on the map', async () => {
    mockApi({ ...BASE, '/api/roads/nearest': road('Kalimati Road') })
    const { router, container } = renderApp('/')
    fireEvent.contextMenu(container.querySelector('.leaflet-container')!, { clientX: 5, clientY: 5 })
    await waitFor(() => expect(router.state.location.pathname).toBe('/pin'))
    const params = new URLSearchParams(router.state.location.search)
    expect(Number(params.get('lat'))).not.toBeNaN()
    expect(Number(params.get('lon'))).not.toBeNaN()
  })

  it('tells people how to drop a pin', async () => {
    mockApi(BASE)
    renderApp('/')
    expect(await screen.findByText(/Press and hold any road on the map/)).toBeInTheDocument()
  })
})

describe('pin page', () => {
  it('names the nearest road and offers what to do there', async () => {
    const fetch = mockApi({ ...BASE, '/api/roads/nearest': road('Kalimati Road') })
    renderApp('/pin?lat=27.6984&lon=85.2996')
    expect(await screen.findByText(/Near Kalimati Road/)).toHaveTextContent('Near Kalimati Road · 27.69840, 85.29960')
    expect(screen.getByTitle('Dropped pin (drag to move)')).toBeInTheDocument()
    expect(panel().getByRole('link', { name: /Directions/ }))
      .toHaveAttribute('href', '/directions?to=27.698400,85.299600&name=Dropped%20pin')
    expect(panel().getByRole('link', { name: /Start here/ })).toHaveAttribute('href', '/directions?from=27.698400,85.299600')
    expect(panel().getByRole('link', { name: /Nearest hospital/ })).toHaveAttribute('href', '/nearby?lat=27.698400&lon=85.299600')
    expect(panel().getByRole('link', { name: /Report a hazard here/ })).toHaveAttribute('href', '/report?lat=27.698400&lon=85.299600')
    const [call] = await sent(fetch, 'GET', '/api/roads/nearest')
    expect(new URL(call.request.url).search).toBe('?lat=27.6984&lon=85.2996')
  })

  it('asks for the pin to be moved onto a road before reporting', async () => {
    mockApi({ ...BASE, '/api/roads/nearest': road(null, 320) })
    renderApp('/pin?lat=27.6984&lon=85.2996')
    expect(await screen.findByText(/Near an unnamed road/)).toBeInTheDocument()
    expect(panel().getByRole('button', { name: /Report a hazard here/ })).toBeDisabled()
    expect(screen.getByText('Move the pin onto a road first (within 150 m)')).toBeInTheDocument()
  })

  it('says when there is no road nearby', async () => {
    mockApi({ ...BASE, '/api/roads/nearest': { status: 404, body: { detail: 'no road within 500 m' } } })
    renderApp('/pin?lat=27.6984&lon=85.2996')
    expect(await screen.findByText(/No road nearby/)).toBeInTheDocument()
  })

  it('explains a spot outside the district and only offers sharing', async () => {
    const fetch = mockApi(BASE)
    renderApp('/pin?lat=28.2096&lon=83.9856')
    expect(await screen.findByText(/This spot is outside Kathmandu District/)).toBeInTheDocument()
    expect(panel().queryByRole('link', { name: /Directions/ })).not.toBeInTheDocument()
    expect(panel().queryByText(/Report a hazard here/)).not.toBeInTheDocument()
    expect(panel().getByRole('button', { name: /Share location/ })).toBeInTheDocument()
    expect(await sent(fetch, 'GET', '/api/roads/nearest')).toHaveLength(0)
  })

  it('copies the coordinates', async () => {
    mockApi({ ...BASE, '/api/roads/nearest': road('Kalimati Road') })
    const user = userEvent.setup()  // installs its own clipboard, so replace it afterwards
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderApp('/pin?lat=27.6984&lon=85.2996')
    await user.click(await panel().findByRole('button', { name: /Copy coordinates/ }))
    expect(writeText).toHaveBeenCalledWith('27.69840, 85.29960')
    expect(await screen.findByText('Coordinates copied.')).toBeInTheDocument()
  })

  it('handles a broken link', async () => {
    mockApi(BASE)
    renderApp('/pin?lat=abc')
    expect(await screen.findByRole('heading', { name: 'No pin to show' })).toBeInTheDocument()
  })

  it('removes the pin and returns to the map', async () => {
    mockApi({ ...BASE, '/api/roads/nearest': road('Kalimati Road') })
    const user = userEvent.setup()
    const { router } = renderApp('/pin?lat=27.6984&lon=85.2996')
    await user.click(await screen.findByRole('button', { name: 'Remove pin' }))
    expect(router.state.location.pathname).toBe('/')
  })
})
