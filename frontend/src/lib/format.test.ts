import { describe, expect, it } from 'vitest'

import { formatDistance, formatDuration, formatOpeningHours } from './format'

describe('formatDistance', () => {
  it.each([
    [3, '10 m'], [447, '450 m'], [999, '1.0 km'], [1000, '1.0 km'], [2849, '2.8 km'], [14_400, '14 km'],
  ])('%d m reads %s', (metres, text) => expect(formatDistance(metres)).toBe(text))
})

describe('formatDuration', () => {
  it.each([
    [5, '1 min'], [61, '2 min'], [540, '9 min'], [3600, '1 h'], [3900, '1 h 5 min'],
  ])('%d s reads %s', (seconds, text) => expect(formatDuration(seconds)).toBe(text))
})

describe('formatOpeningHours', () => {
  it('words the round-the-clock case and tidies lists', () => {
    expect(formatOpeningHours('24/7')).toBe('Open 24 hours')
    expect(formatOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00')).toBe('Mo-Fr 09:00-17:00 · Sa 10:00-14:00')
  })
})
