import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'

import { forgotPassword, resetPassword } from '../../auth/actions'
import { setSession } from '../../auth/session'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/form/Button'
import { CODE_LENGTH, CodeInput } from '../../components/form/CodeInput'
import { PasswordField } from '../../components/form/PasswordField'
import { describeError } from '../../api/client'
import { AuthHeading } from './AuthHeading'
import { type FieldErrors, errorsFrom } from './fieldErrors'
import { clock, useCountdown } from './useCountdown'
import { RESEND_SECONDS } from './VerifyEmailPage'

type Field = 'code' | 'password'

/** Enter the emailed reset code and a new password. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const codeSent = (useLocation().state as { codeSent?: boolean } | null)?.codeSent
  const email = params.get('email')?.trim() ?? ''
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<Field>>({})
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)
  const { left, restart } = useCountdown(codeSent ? RESEND_SECONDS : 0)

  if (!email) return <Navigate to="/forgot-password" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: FieldErrors<Field> = {
      ...(code.length !== CODE_LENGTH && { code: 'Enter the 6-digit code from the email.' }),
      ...(password.length < 8 && { password: 'Use at least 8 characters.' }),
    }
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await resetPassword(email, code, password)
      setSession(null)  // every session ends when the password changes
      navigate(`/login?email=${encodeURIComponent(email)}`, { replace: true, state: { passwordChanged: true } })
    } catch (caught) {
      const found = errorsFrom<Field>(caught, { password: /password/i })
      // A wrong or expired code comes back as a 400 about the code.
      setErrors(found.form && /code/i.test(found.form) ? { code: found.form } : found)
      setBusy(false)
    }
  }

  const resend = async () => {
    try {
      await forgotPassword(email)
      setNotice('A new code is on its way.')
      restart(RESEND_SECONDS)
    } catch (caught) {
      setErrors({ form: describeError(caught) })
    }
  }

  return (
    <>
      <AuthHeading title="Set a new password" icon="lock_reset">
        If <strong className="font-semibold text-on-surface">{email}</strong> has an account, we've sent it a code.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <div>
          <CodeInput value={code} onChange={setCode} invalid={!!errors.code} />
          {errors.code && <p role="alert" className="mt-2 text-body-md text-error">{errors.code}</p>}
        </div>
        <PasswordField label="New password" icon="lock" autoComplete="new-password" value={password} maxLength={128}
          onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters" />
        <Button type="submit" full loading={busy}>Change password</Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-body-md">
        <button type="button" onClick={resend} disabled={left > 0}
          className="font-semibold text-primary disabled:text-text-secondary disabled:opacity-70">Resend code</button>
        {left > 0 && <span className="text-text-secondary">You can resend in {clock(left)}</span>}
      </div>
      <p className="mt-6 text-center text-body-md text-text-secondary">
        <Link to="/login" className="font-semibold text-primary">Back to log in</Link>
      </p>
    </>
  )
}
