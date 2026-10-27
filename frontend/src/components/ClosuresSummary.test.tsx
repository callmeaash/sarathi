import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HEALTHY, mockApi, renderApp } from '../test/render'

const closure = (id: number, road: string | null) => ({
  incident_id: id, kind: 'landslide', road_name: road, radius_m: 30, verified_at: '2026-10-27T08:00:00Z',
  lon: 85.29, lat: 27.68, edges: 2, geometry: null,
})

describe('closures summary on the log-in screen', () => {
  it('counts the closed roads and names a few', async () => {
    mockApi({
      '/api/health': HEALTHY,
      '/api/closures': { body: [closure(1, 'Ring Road'), closure(2, 'Ring Road'), closure(3, 'Kalimati Marg'),
        closure(4, 'Bagmati Corridor'), closure(5, null)] },
    })
    renderApp('/login')
    const card = await screen.findByRole('link', { name: /5 roads closed right now/ })
    expect(card).toHaveTextContent('Ring Road · Kalimati Marg and 1 more')
    expect(card).toHaveAttribute('href', '/hazards')
    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  it('says when every road is open', async () => {
    mockApi({ '/api/health': HEALTHY, '/api/closures': { body: [] } })
    renderApp('/login')
    expect(await screen.findByText('No verified road closures')).toBeInTheDocument()
  })

  it('stays out of the way when the server is unreachable', async () => {
    mockApi({})
    renderApp('/login')
    expect(await screen.findByText('Offline')).toBeInTheDocument()
    expect(screen.queryByText(/closed right now|No verified road closures/)).not.toBeInTheDocument()
  })
})
