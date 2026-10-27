import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { mightHaveSession } from '../../auth/session'
import { hasBeenWelcomed } from './welcomed'

/** Show the welcome screen once, to people who have never signed in on this browser. */
export function FirstVisit({ children }: { children: ReactNode }) {
  if (!hasBeenWelcomed() && !mightHaveSession()) return <Navigate to="/welcome" replace />
  return children
}
