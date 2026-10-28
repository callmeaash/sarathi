import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'

export type IncidentIn = Schemas['IncidentIn']
export type HazardKind = IncidentIn['kind']
export type Passable = IncidentIn['passable']

/** Send a hazard report; on success the map's hazard lists refresh so the new report shows straight away. */
export function useReportHazard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: IncidentIn) => unwrap(api.POST('/api/incidents', { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['my-reports'] })
    },
  })
}
