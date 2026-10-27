import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'

/** Server-data cache: retry network hiccups once, never retry a request the server rejected. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
      },
      mutations: { retry: false },
    },
  })
}
