import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from './client'

/** Roads closed right now by verified hazards; refreshed every minute. */
export function useClosures() {
  return useQuery({
    queryKey: ['closures'],
    queryFn: () => unwrap(api.GET('/api/closures')),
    refetchInterval: 60_000,
  })
}
