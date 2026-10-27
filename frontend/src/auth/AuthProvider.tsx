import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { logOut } from './actions'
import { AuthContext, type AuthState } from './context'
import { getSession, mightHaveSession, refreshSession, subscribe } from './session'

/** Restores the session on load and shares the signed-in user with the app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSession)
  const queryClient = useQueryClient()
  const [restoring, setRestoring] = useState(() => !getSession() && mightHaveSession())

  useEffect(() => {
    if (!restoring) return
    refreshSession()
      .catch(() => null)  // offline: stay signed out for now; the hint stays, so the next load tries again
      .finally(() => setRestoring(false))
  }, [restoring])

  const signOut = useCallback(async () => {
    await logOut().catch(() => undefined)
    queryClient.clear()  // drop anything loaded for this user
  }, [queryClient])

  const value = useMemo<AuthState>(() => ({
    status: session ? 'signed-in' : restoring ? 'loading' : 'signed-out',
    user: session?.user ?? null,
    signOut,
  }), [session, restoring, signOut])

  return <AuthContext value={value}>{children}</AuthContext>
}
