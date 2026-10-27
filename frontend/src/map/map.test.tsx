import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp } from '../test/render'
import { START_VIEW } from './config'
import { NO_GEOLOCATION, OUTSIDE_DISTRICT } from './locate'
import { savedView } from './view'

type Success = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type Failure = (error: { code: number }) => void

/** Make the browser's geolocation answer with a position or an error code. */
function fakeGeolocation(answer: { lat: number; lon: number } | { code: number }) {
  const getCurrentPosition = vi.fn((success: Success, failure: Failure) => {
    if ('code' in answer) failure({ code: answer.code })
    else success({ coords: { latitude: answer.lat, longitude: answer.lon, accuracy: 25 } })
  })
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { getCurrentPosition } }))
  return getCurrentPosition
}

async function pressLocate() {
  mockApi({ '/api/health': HEALTHY })
  renderApp('/')
  await userEvent.click(await screen.findByRole('button', { name: 'Show my location' }))
}

afterEach(() => vi.restoreAllMocks())

describe('locate me', () => {
  it('centres on the user inside the district', async () => {
    // The test map has no size, so it jumps (setView) rather than animating.
    const setView = vi.spyOn(L.Map.prototype, 'setView')
    const geolocation = fakeGeolocation({ lat: 27.7, lon: 85.31 })
    await pressLocate()
    expect(geolocation).toHaveBeenCalledOnce()
    const [center, zoom] = setView.mock.lastCall!
    expect(L.latLng(center).lat).toBeCloseTo(27.7, 5)
    expect(L.latLng(center).lng).toBeCloseTo(85.31, 5)
    expect(zoom).toBe(16)
    expect(screen.queryByText(OUTSIDE_DISTRICT)).not.toBeInTheDocument()
  })

  it('explains when the user is outside Kathmandu District and shows the district instead', async () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis()
    fakeGeolocation({ lat: 28.2, lon: 83.98 })  // Pokhara
    await pressLocate()
    expect(await screen.findByText(OUTSIDE_DISTRICT)).toBeInTheDocument()
    expect(fitBounds).toHaveBeenCalled()
  })

  it('explains a blocked location and can be dismissed', async () => {
    fakeGeolocation({ code: 1 })
    await pressLocate()
    expect(await screen.findByText(/Location is blocked/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Location is blocked/)).not.toBeInTheDocument()
  })

  it('explains a browser without location support', async () => {
    vi.stubGlobal('navigator', { userAgent: 'test', language: 'en' })  // no geolocation at all
    await pressLocate()
    expect(await screen.findByText(NO_GEOLOCATION)).toBeInTheDocument()
  })
})

describe('saved map view', () => {
  it('starts where the map was last time', () => {
    window.localStorage.setItem('sarathi.mapView', JSON.stringify({ lat: 27.68, lon: 85.29, zoom: 15 }))
    expect(savedView()).toEqual({ center: [27.68, 85.29], zoom: 15 })
  })

  it.each([
    ['nothing saved', null],
    ['broken data', '{oops'],
    ['outside the district', JSON.stringify({ lat: 28.2, lon: 83.98, zoom: 14 })],
    ['impossible zoom', JSON.stringify({ lat: 27.7, lon: 85.3, zoom: 40 })],
  ])('falls back to central Kathmandu with %s', (_, saved) => {
    if (saved) window.localStorage.setItem('sarathi.mapView', saved)
    expect(savedView()).toEqual(START_VIEW)
  })
})

describe('phone bottom sheet', () => {
  it('holds map pages and expands, collapses, and resets on a new page', async () => {
    mockApi({ '/api/health': HEALTHY })
    const user = userEvent.setup()
    const { router } = renderApp('/')
    const handle = screen.getByRole('button', { name: 'Expand panel' })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
    await user.click(handle)
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toHaveAttribute('aria-expanded', 'true')
    await router.navigate('/nearby')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument())
  })

  it('is not used for full-screen pages', async () => {
    mockApi({})
    renderApp('/no/such/page')
    expect(screen.queryByRole('button', { name: /panel/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Map' })).toHaveClass('hidden')  // kept loaded, just not shown
  })

  it('keeps a single map across pages', async () => {
    mockApi({ '/api/health': HEALTHY })
    const { router, container } = renderApp('/')
    const map = container.querySelector('.leaflet-container')
    await router.navigate('/hazards')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hazards' })).toBeInTheDocument())
    expect(container.querySelector('.leaflet-container')).toBe(map)
  })
})
