import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { describeError } from '../../api/client'
import { forgotPassword } from '../../auth/actions'
import { Button } from '../../components/form/Button'
import { TextField } from '../../components/form/TextField'
import { AuthHeading } from './AuthHeading'
import { looksLikeEmail } from './fieldErrors'

/** Ask for a password reset code by email. */
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!looksLikeEmail(email)) return setError('Enter a valid email address.')
    setBusy(true)
    try {
      await forgotPassword(email.trim())
      navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`, { state: { codeSent: true } })
    } catch (caught) {
      setError(describeError(caught))
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Reset your password" icon="lock_reset">
        Enter your account's email and we'll send you a code to set a new password.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label="Email" icon="mail" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" full loading={busy}>Send code</Button>
      </form>
      <p className="mt-6 text-center text-body-md text-text-secondary">
        Remembered it? <Link to="/login" className="font-semibold text-primary">Log in</Link>
      </p>
    </>
  )
}
