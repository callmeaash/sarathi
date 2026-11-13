import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'

import { Spinner } from '../components/Spinner'
import { safeNext, useAuth } from './context'
import { forgetSignOut, signedOutOnPurpose } from './session'

/**
 * Pages for signed-in users only; others are sent to log in and brought back afterwards. Someone who just
 * signed out here on purpose goes to the map instead.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (status === 'signed-out') forgetSignOut()  // acted on below; later visits ask to log in as usual
  }, [status])
  if (status === 'loading') return <Spinner label="Checking your session" />
  if (status === 'signed-out') {
    if (signedOutOnPurpose()) return <Navigate to="/" replace />
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}

/**
 * Log-in and sign-up pages. Once someone is signed in (including just now, from the log-in form) they move on:
 * to the email check if their address isn't confirmed yet, otherwise to where they were going.
 */
export function GuestOnly() {
  const { status, user } = useAuth()
  const [params] = useSearchParams()
  if (status !== 'signed-in' || !user) return <Outlet />
  const next = safeNext(params.get('next'))
  if (!user.email_verified) {
    const verify = `/verify?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(next)}`
    return <Navigate to={verify} replace state={{ reason: 'unverified' }} />
  }
  return <Navigate to={next} replace />
}
