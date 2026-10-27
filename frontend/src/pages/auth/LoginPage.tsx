import { type FormEvent, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'

import { ApiError, describeError } from '../../api/client'
import { logIn } from '../../auth/actions'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/form/Button'
import { PasswordField } from '../../components/form/PasswordField'
import { TextField } from '../../components/form/TextField'
import { AuthHeading } from './AuthHeading'
import { looksLikeEmail, waitWording } from './fieldErrors'

type LoginState = { passwordChanged?: boolean } | null

/** Why a sign-in failed, in words for the user. */
function loginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Incorrect email or password.'
    if (error.status === 429) return `Too many failed attempts. Try again ${waitWording(error.retryAfter)}.`
  }
  return describeError(error)
}

/** Screen 4 / 23: sign in. Where to go next is decided by GuestOnly once the session exists. */
export function LoginPage() {
  const [params] = useSearchParams()
  const state = useLocation().state as LoginState
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const next = params.get('next')
  const withNext = (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!looksLikeEmail(email) || !password) return setError('Enter your email and password.')
    setBusy(true)
    setError(undefined)
    try {
      await logIn(email.trim(), password)
    } catch (caught) {
      setError(loginError(caught))
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Log in">Welcome back.</AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {state?.passwordChanged && !error && (
          <Alert tone="success">Password changed. Log in with your new password.</Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Email" icon="mail" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" icon="lock" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <div className="flex justify-end">
          <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
            className="text-body-md font-semibold text-primary">Forgot password?</Link>
        </div>
        <Button type="submit" full loading={busy} icon="login">Log in</Button>
      </form>
      <p className="mt-6 text-center text-body-md text-text-secondary">
        New to Sarathi? <Link to={withNext('/signup')} className="font-semibold text-primary">Create account</Link>
      </p>
    </>
  )
}
