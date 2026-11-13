import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'
import { uploadPhoto } from './photos'

export type IncidentIn = Schemas['IncidentIn']
export type HazardKind = IncidentIn['kind']
export type Passable = IncidentIn['passable']

/**
 * Send a hazard report, then its photos one by one. A photo that fails doesn't undo the report: the result says
 * how many didn't make it. On success the map's hazard lists refresh so the new report shows straight away.
 */
export function useReportHazard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ report, photos }: { report: IncidentIn; photos: File[] }) => {
      const incident = await unwrap(api.POST('/api/incidents', { body: report }))
      let photosFailed = 0
      for (const photo of photos) {
        await uploadPhoto(incident.id, photo).catch(() => { photosFailed += 1 })
      }
      return { incident, photosFailed }
    },
    onSuccess: ({ incident }) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['incident', incident.id] })
      queryClient.invalidateQueries({ queryKey: ['my-reports'] })
    },
  })
}
