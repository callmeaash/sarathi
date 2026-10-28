import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { HEALTHY, mockApi, renderApp } from '../test/render'

describe('app shell', () => {
  beforeEach(() => {
    mockApi({ '/api/health': HEALTHY })
  })

  it('shows both navigation bars with the current page marked', async () => {
    renderApp('/nearby')
    const [desktop, mobile] = screen.getAllByRole('navigation', { name: 'Main' })
    expect(within(desktop).getByRole('link', { name: /Nearby/ })).toHaveAttribute('aria-current', 'page')
    expect(within(mobile).getByRole('link', { name: /Nearby/ })).toHaveAttribute('aria-current', 'page')
    expect(within(desktop).getByRole('link', { name: /Map/ })).not.toHaveAttribute('aria-current')
    expect(within(mobile).getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['exploreExplore', 'directionsDirections', 'location_onNearby', 'assignmentMy reports', 'account_circleAccount'],
    )
  })

  it('marks the home link only on the home page', async () => {
    renderApp('/')
    const [desktop] = screen.getAllByRole('navigation', { name: 'Main' })
    expect(within(desktop).getByRole('link', { name: /Map/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { level: 1, name: 'Explore' })).toBeInTheDocument()
  })

  it('navigates between sections', async () => {
    const { router } = renderApp('/')
    const [desktop] = screen.getAllByRole('navigation', { name: 'Main' })
    await userEvent.click(within(desktop).getByRole('link', { name: /Directions/ }))
    expect(router.state.location.pathname).toBe('/directions')
    expect(screen.getByRole('heading', { level: 1, name: 'Directions' })).toBeInTheDocument()
  })

  it('links to reporting and the account from the header', () => {
    renderApp('/')
    expect(screen.getByRole('link', { name: /Report hazard/ })).toHaveAttribute('href', '/report')
    expect(screen.getAllByRole('link', { name: /Account/ }).at(-1)).toHaveAttribute('href', '/account')
  })

  it('sets the browser tab title for the page', async () => {
    renderApp('/hazards')
    await screen.findByRole('heading', { level: 1, name: 'Hazards' })
    expect(document.title).toBe('Hazards · Sarathi')
  })

  it('offers to log in when signed out', () => {
    renderApp('/')
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]).toHaveAttribute('href', '/login')
  })

  it('shows a not-found page inside the app frame', () => {
    renderApp('/no/such/page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the map' })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(2)
  })
})
