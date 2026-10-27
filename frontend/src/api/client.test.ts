import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/render'
import { ApiError, api, describeError, errorMessage, sentence, unwrap } from './client'

describe('errorMessage', () => {
  it('turns the API detail into a sentence', () => {
    expect(errorMessage(409, { detail: 'an account with this email already exists' }))
      .toBe('An account with this email already exists.')
  })

  it('uses the first validation problem', () => {
    expect(errorMessage(422, { detail: [{ msg: 'Field required' }, { msg: 'Other' }] })).toBe('Field required.')
  })

  it('falls back to a general message', () => {
    expect(errorMessage(500, undefined)).toBe('Something went wrong on our side. Please try again.')
    expect(errorMessage(418, { unexpected: true })).toBe('Request failed (418).')
  })
})

describe('sentence', () => {
  it('keeps existing punctuation and handles blanks', () => {
    expect(sentence('done!')).toBe('Done!')
    expect(sentence('  ')).toBe('')
  })
})

describe('unwrap', () => {
  it('returns the data of a successful call', async () => {
    mockApi({ '/api/facilities/7': { body: { id: 7, name: 'Bir Hospital' } } })
    const facility = await unwrap(api.GET('/api/facilities/{facility_id}', { params: { path: { facility_id: 7 } } }))
    expect(facility.name).toBe('Bir Hospital')
  })

  it('throws an ApiError with the status, message and wait time', async () => {
    mockApi({ '/api/facilities/7': { status: 429, body: { detail: 'slow down' }, headers: { 'Retry-After': '90' } } })
    const call = unwrap(api.GET('/api/facilities/{facility_id}', { params: { path: { facility_id: 7 } } }))
    await expect(call).rejects.toMatchObject({ status: 429, message: 'Slow down.', retryAfter: 90 })
    await expect(call).rejects.toBeInstanceOf(ApiError)
  })
})

describe('describeError', () => {
  it('explains network failures', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/Check your connection/)
    expect(describeError(new ApiError(404, 'Not here.'))).toBe('Not here.')
  })
})
