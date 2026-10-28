import { useQuery } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'
import type { Weight } from './params'

export type Route = Schemas['RouteOut']
type End = { lat: number; lon: number }

// About a metre: tiny GPS jitter shouldn't re-route.
const round = (value: number) => Math.round(value * 100_000) / 100_000

/** A route between two points; refreshed every minute so new closures are picked up. */
export function useRoute(from: End | null, to: End | null, weight: Weight) {
  const ends = from && to
    ? { from_lat: round(from.lat), from_lon: round(from.lon), to_lat: round(to.lat), to_lon: round(to.lon) }
    : null
  return useQuery({
    queryKey: ['route', ends, weight],
    queryFn: () => unwrap(api.GET('/api/route', { params: { query: { ...ends!, weight } } })),
    enabled: ends !== null,
    refetchInterval: 60_000,
    retry: false,
  })
}
