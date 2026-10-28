import { useIncidents } from './api'

/** Whether the Hazards tab needs a dot: 'closed' when roads are closed, 'pending' when only reports wait. */
export function useHazardAlert(): 'closed' | 'pending' | null {
  const { data } = useIncidents(['pending', 'verified'])
  if (data?.some((incident) => incident.status === 'verified')) return 'closed'
  if (data?.some((incident) => incident.status === 'pending')) return 'pending'
  return null
}
