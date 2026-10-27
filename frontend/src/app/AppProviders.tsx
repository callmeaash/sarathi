import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { AuthProvider } from '../auth/AuthProvider'
import { MapProvider } from '../map/MapProvider'

/** Server-data cache, sign-in state and the shared map, for the app and its tests. */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MapProvider>{children}</MapProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
