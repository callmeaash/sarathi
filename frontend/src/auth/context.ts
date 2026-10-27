import { createContext, useContext } from 'react'

import type { User } from './session'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export type AuthState = {
  status: AuthStatus
  user: User | null
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

/** The current user and sign-in status. */
export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}

/** A safe place to go after signing in: only paths inside this app. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
