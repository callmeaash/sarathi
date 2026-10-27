import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { register } from '../../auth/actions'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/form/Button'
import { Checkbox } from '../../components/form/Checkbox'
import { PasswordField } from '../../components/form/PasswordField'
import { TextField } from '../../components/form/TextField'
import { ApiError } from '../../api/client'
import { AuthHeading } from './AuthHeading'
import { type FieldErrors, errorsFrom, looksLikeEmail } from './fieldErrors'

const MIN_PASSWORD = 8
type Field = 'name' | 'email' | 'password' | 'agree'

/** Screen 2 / 24: create an account, then go and enter the emailed code. */
export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<FieldErrors<Field>>({})
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)

  const check = (): FieldErrors<Field> => ({
    ...(!name.trim() && { name: 'Enter your name.' }),
    ...(!looksLikeEmail(email) && { email: 'Enter a valid email address.' }),
    ...(password.length < MIN_PASSWORD && { password: `Use at least ${MIN_PASSWORD} characters.` }),
    ...(!agree && { agree: 'Please confirm to continue.' }),
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = check()
    setErrors(found)
    setEmailTaken(false)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await register(name.trim(), email.trim(), password)
      const next = params.get('next')
      navigate(`/verify?email=${encodeURIComponent(email.trim())}${next ? `&next=${encodeURIComponent(next)}` : ''}`,
        { state: { codeSent: true } })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setEmailTaken(true)
        setErrors({ email: 'An account with this email already exists.' })
      } else {
        setErrors(errorsFrom<Field>(error, { password: /password/i, name: /name/i, email: /email/i }))
      }
    } finally {
      setBusy(false)
    }
  }

  const longEnough = password.length >= MIN_PASSWORD
  return (
    <>
      <AuthHeading title="Create account">You need an account to report hazards.</AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <TextField label="Full name" icon="person" autoComplete="name" value={name} maxLength={100}
          onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField label="Email" icon="mail" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        {emailTaken && (
          <p className="-mt-3 px-4 text-body-sm">
            <Link to={`/login?email=${encodeURIComponent(email.trim())}`} className="font-semibold text-primary">
              Log in instead
            </Link>
          </p>
        )}
        <PasswordField label="Password" icon="lock" autoComplete="new-password" value={password} maxLength={128}
          onChange={(e) => setPassword(e.target.value)} error={errors.password}
          hint={
            <span className={`inline-flex items-center gap-1 ${longEnough ? 'text-open-green' : ''}`}>
              <Icon name={longEnough ? 'check' : 'radio_button_unchecked'} className="text-[16px]" />
              At least {MIN_PASSWORD} characters
            </span>
          } />
        <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} error={errors.agree}
          label="I will report hazards honestly and only what I have seen." />
        <Button type="submit" full loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-body-md text-text-secondary">
        Already have an account?{' '}
        <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
          className="font-semibold text-primary">Log in</Link>
      </p>
    </>
  )
}
