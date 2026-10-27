import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from './client'

/** Whether the API is up and how much of the road network it has loaded; checked every minute. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => unwrap(api.GET('/api/health')),
    refetchInterval: 60_000,
  })
}
