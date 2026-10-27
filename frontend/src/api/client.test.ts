import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/render'
import { ApiError, api, errorMessage, unwrap } from './client'

describe('errorMessage', () => {
  it('uses the API detail when it is a sentence', () => {
    expect(errorMessage(409, { detail: 'an account with this email already exists' }))
      .toBe('an account with this email already exists')
  })

  it('uses the first validation problem', () => {
    expect(errorMessage(422, { detail: [{ msg: 'Field required' }, { msg: 'Other' }] })).toBe('Field required')
  })

  it('falls back to a general message', () => {
    expect(errorMessage(500, undefined)).toBe('Something went wrong on our side. Please try again.')
    expect(errorMessage(418, { unexpected: true })).toBe('Request failed (418)')
  })
})

describe('unwrap', () => {
  it('returns the data of a successful call', async () => {
    mockApi({ '/api/facilities/7': { body: { id: 7, name: 'Bir Hospital' } } })
    const facility = await unwrap(api.GET('/api/facilities/{facility_id}', { params: { path: { facility_id: 7 } } }))
    expect(facility.name).toBe('Bir Hospital')
  })

  it('throws an ApiError with the status and message', async () => {
    mockApi({ '/api/facilities/7': { status: 404, body: { detail: 'facility 7 not found' } } })
    const call = unwrap(api.GET('/api/facilities/{facility_id}', { params: { path: { facility_id: 7 } } }))
    await expect(call).rejects.toEqual(new ApiError(404, 'facility 7 not found'))
    await expect(call).rejects.toHaveProperty('status', 404)
  })
})
