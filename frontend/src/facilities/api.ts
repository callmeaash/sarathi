import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api, unwrap } from '../api/client'
import { DISTRICT } from '../map/config'

export type FacilityPoint = { id: number; kind: string; name: string | null; lon: number; lat: number }

type Feature = { geometry: { coordinates: [number, number] }; properties: { id: number; kind: string; name: string | null } }

const DISTRICT_BBOX = `${DISTRICT.west},${DISTRICT.south},${DISTRICT.east},${DISTRICT.north}`
const HOUR = 60 * 60 * 1000

/** Every facility in the district, loaded once: about a thousand points, small enough to filter in the browser. */
export function useAllFacilities() {
  return useQuery({
    queryKey: ['facilities', 'district'],
    queryFn: async (): Promise<FacilityPoint[]> => {
      const collection = await unwrap(api.GET('/api/facilities', { params: { query: { bbox: DISTRICT_BBOX } } }))
      return (collection.features as Feature[]).map(({ geometry, properties }) => ({
        id: properties.id, kind: properties.kind, name: properties.name,
        lon: geometry.coordinates[0], lat: geometry.coordinates[1],
      }))
    },
    staleTime: HOUR,  // facilities change only when OpenStreetMap data is re-imported
  })
}

// Positions are rounded (about 10 m) so small GPS jitter doesn't refetch the road distance.
const round = (value: number) => Math.round(value * 10_000) / 10_000

/** One facility's details, with the road distance from a point when one is given. */
export function useFacility(id: number, from: { lat: number; lon: number } | null) {
  const origin = from ? { from_lat: round(from.lat), from_lon: round(from.lon) } : {}
  return useQuery({
    queryKey: ['facility', id, origin],
    queryFn: () => unwrap(api.GET('/api/facilities/{facility_id}', {
      params: { path: { facility_id: id }, query: origin },
    })),
    enabled: Number.isInteger(id) && id > 0,
    placeholderData: keepPreviousData,  // keep showing the place while the distance updates
  })
}
