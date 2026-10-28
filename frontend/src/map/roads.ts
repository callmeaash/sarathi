import { useQuery } from '@tanstack/react-query'

import { ApiError, api, unwrap } from '../api/client'

// Rounded to about a metre, so dragging a pin by a hair doesn't refetch.
const round = (value: number) => Math.round(value * 100_000) / 100_000

/** The road nearest a point, or null when there's none within 500 m. */
export function useNearestRoad(point: { lat: number; lon: number } | null) {
  const lat = point ? round(point.lat) : 0
  const lon = point ? round(point.lon) : 0
  return useQuery({
    queryKey: ['nearest-road', lat, lon],
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/roads/nearest', { params: { query: { lat, lon } } }))
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    enabled: point !== null,
    staleTime: Infinity,  // roads only change when map data is re-imported
  })
}
