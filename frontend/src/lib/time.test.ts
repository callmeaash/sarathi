import { describe, expect, it } from 'vitest'

import { timeAgo } from './time'

const NOW = Date.parse('2026-10-28T12:00:00Z')
const before = (ms: number) => new Date(NOW - ms).toISOString()

describe('timeAgo', () => {
  it.each([
    [20_000, 'just now'],
    [25 * 60_000, '25 min ago'],
    [3 * 3_600_000 + 5 * 60_000, '3 h ago'],
    [30 * 3_600_000, 'yesterday'],
    [3 * 86_400_000, '3 days ago'],
    [9 * 86_400_000, 'on 19 Oct'],
  ])('%d ms ago reads "%s"', (ms, text) => expect(timeAgo(before(ms), NOW)).toBe(text))

  it('treats clock skew from the server as just now', () => {
    expect(timeAgo(new Date(NOW + 30_000).toISOString(), NOW)).toBe('just now')
  })
})
