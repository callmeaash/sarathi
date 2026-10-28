import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { api, unwrap, type Schemas } from '../api/client'

export type SearchHit = Schemas['SearchResult']

export const MIN_QUERY_LENGTH = 2

/** The value, but only after it has stopped changing for `ms`, so typing doesn't send a request per key. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

// About 100 m: moving a little shouldn't re-run the same search.
const round = (value: number) => Math.round(value * 1000) / 1000

/** Facilities and roads matching a query, with distances from a point when one is given. */
export function useSearch(query: string, near: { lat: number; lon: number } | null) {
  const q = query.trim()
  const point = near ? { lat: round(near.lat), lon: round(near.lon) } : {}
  return useQuery({
    queryKey: ['search', q.toLowerCase(), point],
    queryFn: () => unwrap(api.GET('/api/search', { params: { query: { q, ...point } } })),
    enabled: q.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,  // keep the last results on screen while the next ones load
    staleTime: 5 * 60_000,
  })
}
