import { type FormEvent, useId, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'

import { describeError } from '../../api/client'
import { resendCode, verifyEmail } from '../../auth/actions'
import { safeNext, useAuth } from '../../auth/context'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/form/Button'
import { CODE_LENGTH, CodeInput } from '../../components/form/CodeInput'
import { TextField } from '../../components/form/TextField'
import { AuthHeading } from './AuthHeading'
import { looksLikeEmail } from './fieldErrors'
import { clock, useCountdown } from './useCountdown'

export const RESEND_SECONDS = 60

type VerifyState = { codeSent?: boolean; reason?: 'unverified' } | null

/** Without an email in the address: ask for it and send a code. */
function AskForEmail() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!looksLikeEmail(email)) return setError('Enter a valid email address.')
    setBusy(true)
    try {
      await resendCode(email.trim())
      navigate(`/verify?email=${encodeURIComponent(email.trim())}`, { replace: true, state: { codeSent: true } })
    } catch (caught) {
      setError(describeError(caught))
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Verify your email" icon="mark_email_unread">
        Enter the email you signed up with and we'll send you a code.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label="Email" icon="mail" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" full loading={busy}>Send code</Button>
      </form>
    </>
  )
}

/** Screen 3 / 25: enter the 6-digit code; success signs the user in. */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const state = useLocation().state as VerifyState
  const { status, user } = useAuth()
  const email = params.get('email')?.trim() ?? ''
  const next = safeNext(params.get('next'))
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const { left, restart } = useCountdown(state?.codeSent ? RESEND_SECONDS : 0)
  const errorId = useId()

  if (status === 'signed-in' && user?.email_verified) return <Navigate to={next} replace />
  if (!email) return <AskForEmail />

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await verifyEmail(email, value)  // signs in; the check above then moves on
    } catch (caught) {
      setError(describeError(caught))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setError(undefined)
    try {
      await resendCode(email)
      setNotice('A new code is on its way. It can take a minute; check your spam folder too.')
      setCode('')
      restart(RESEND_SECONDS)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <AuthHeading title="Verify your email" icon="mark_email_unread">
        Enter the 6-digit code we sent to <strong className="font-semibold text-on-surface">{email}</strong>
      </AuthHeading>
      {state?.reason === 'unverified' && (
        <div className="mb-5">
          <Alert>Your email isn't verified yet. Enter the code from your sign-up email, or send a new one.</Alert>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(code) }} noValidate className="space-y-5">
        <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} invalid={!!error}
          describedBy={error ? errorId : undefined} />
        {error && <p id={errorId} role="alert" className="text-body-md text-error">{error}</p>}
        {notice && !error && <Alert tone="success">{notice}</Alert>}
        <Button type="submit" full loading={busy} disabled={code.length !== CODE_LENGTH}>Verify</Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-body-md">
        <button type="button" onClick={resend} disabled={left > 0 || resending}
          className="font-semibold text-primary disabled:text-text-secondary disabled:opacity-70">
          {resending ? 'Sending…' : 'Resend code'}
        </button>
        {left > 0 && (
          <span className="text-text-secondary" aria-live="off">
            You can resend in <strong className="font-semibold text-on-surface tabular-nums">{clock(left)}</strong>
          </span>
        )}
      </div>
      <div className="mt-8 rounded-lg bg-surface-tint-light p-4 text-body-md text-on-surface">
        You can use the map now. Verify your email before you report a hazard.
        <Link to="/" className="mt-2 block font-semibold text-primary">Continue to map</Link>
      </div>
      <p className="mt-6 text-center text-body-md text-text-secondary">
        Wrong address? <Link to="/signup" className="font-semibold text-primary">Sign up again</Link>
      </p>
    </>
  )
}
