import { useQuery } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'
import type { FacilityKind } from '../facilities/kinds'

export type Nearby = Schemas['NearestOut']
export type NearbyResult = Schemas['NearbyOut']

export const RESULTS = 5

// About ten metres: GPS jitter shouldn't re-run the search.
const round = (value: number) => Math.round(value * 10_000) / 10_000

/** The closest facilities of a kind by road from a point, around verified closures; refreshed every minute. */
export function useNearest(origin: { lat: number; lon: number } | null, kind: FacilityKind) {
  const point = origin ? { lat: round(origin.lat), lon: round(origin.lon) } : null
  return useQuery({
    queryKey: ['nearest', point, kind],
    queryFn: () => unwrap(api.GET('/api/nearest', { params: { query: { ...point!, kind, limit: RESULTS } } })),
    enabled: point !== null,
    refetchInterval: 60_000,
    retry: false,
  })
}
