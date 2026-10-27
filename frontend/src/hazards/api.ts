import { useQuery } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'
import { DISTRICT } from '../map/config'

export type Incident = Schemas['IncidentOut']

const DISTRICT_BBOX = `${DISTRICT.west},${DISTRICT.south},${DISTRICT.east},${DISTRICT.north}`
const REFRESH_MS = 60_000

type Status = 'pending' | 'verified' | 'cleared'

/** Hazard reports with the given statuses across the district, newest first; refreshed every minute. */
export function useIncidents(statuses: Status[]) {
  return useQuery({
    queryKey: ['incidents', statuses],
    queryFn: () => unwrap(api.GET('/api/incidents', { params: { query: { bbox: DISTRICT_BBOX, status: statuses } } })),
    refetchInterval: REFRESH_MS,
  })
}

/** One hazard report. */
export function useIncident(id: number) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => unwrap(api.GET('/api/incidents/{incident_id}', { params: { path: { incident_id: id } } })),
    enabled: Number.isInteger(id) && id > 0,
  })
}
