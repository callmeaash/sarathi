import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '../../api/client'
import { changePassword, deleteAccount, updateName } from '../../auth/actions'
import { useAuth } from '../../auth/context'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/form/Button'
import { buttonClass } from '../../components/form/buttonStyles'
import { PasswordField } from '../../components/form/PasswordField'
import { TextField } from '../../components/form/TextField'
import { type FieldErrors, errorsFrom, waitWording } from '../auth/fieldErrors'

const MIN_PASSWORD = 8

/** Frame for a settings form: a way back to the account, a heading and a line of explanation. */
function SettingsPage({ title, children, intro }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl">
      <title>{`${title} · Sarathi`}</title>
      <Link to="/account" className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-label-lg text-primary hover:bg-surface-container">
        <Icon name="arrow_back" className="text-[20px]" /> Account
      </Link>
      <h1 className="text-headline-md text-on-surface">{title}</h1>
      <p className="mt-1 mb-5 text-body-md text-text-secondary">{intro}</p>
      {children}
    </div>
  )
}

/** The message for a failed settings request: a rate limit gets its own wording. */
function failure<F extends string>(error: unknown, fields: Partial<Record<F, RegExp>>): FieldErrors<F> {
  if (error instanceof ApiError && error.status === 429) {
    return { form: `Too many wrong passwords. Try again ${waitWording(error.retryAfter)}.` } as FieldErrors<F>
  }
  return errorsFrom<F>(error, fields)
}

/** Change the name shown on the account. */
export function EditNamePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.full_name ?? '')
  const [errors, setErrors] = useState<FieldErrors<'name'>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setErrors({ name: 'Enter your name.' })
    setBusy(true)
    try {
      await updateName(name.trim())
      navigate('/account', { state: { notice: 'Your name was updated.' } })
    } catch (error) {
      setErrors(failure<'name'>(error, { name: /name/i }))
      setBusy(false)
    }
    return undefined
  }

  return (
    <SettingsPage title="Name" intro="Shown to moderators next to your reports. Other users never see it.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <TextField label="Full name" icon="person" autoComplete="name" value={name} maxLength={100}
          onChange={(e) => setName(e.target.value)} error={errors.name} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={name.trim() === user?.full_name}>Save</Button>
          <Link to="/account" className={buttonClass('secondary')}>Cancel</Link>
        </div>
      </form>
    </SettingsPage>
  )
}

type PasswordFieldName = 'current' | 'next' | 'confirm'

/** Change the password; the current one is asked for, and other devices are signed out. */
export function ChangePasswordPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors<PasswordFieldName>>({})
  const [busy, setBusy] = useState(false)

  const check = (): FieldErrors<PasswordFieldName> => ({
    ...(!current && { current: 'Enter your current password.' }),
    ...(next.length < MIN_PASSWORD && { next: `Use at least ${MIN_PASSWORD} characters.` }),
    ...(next.length >= MIN_PASSWORD && next === current && { next: 'Choose a password different from the current one.' }),
    ...(confirm !== next && { confirm: "The two passwords don't match." }),
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = check()
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await changePassword(current, next)
      navigate('/account', { state: { notice: 'Your password was changed. Other devices have been logged out.' } })
    } catch (error) {
      setErrors(failure<PasswordFieldName>(error, { current: /current password/i, next: /password/i }))
      setBusy(false)
    }
  }

  return (
    <SettingsPage title="Password" intro="Changing it logs you out of your other phones and computers. This one stays logged in.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {/* Lets password managers file the new password under the right account. */}
        <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <div>
          <PasswordField label="Current password" icon="lock" autoComplete="current-password" value={current}
            maxLength={128} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
          <p className="mt-1.5 text-body-sm">
            <Link to={`/forgot-password?email=${encodeURIComponent(user?.email ?? '')}`} className="font-semibold text-primary">
              Forgot your password?
            </Link>
          </p>
        </div>
        <PasswordField label="New password" icon="lock" autoComplete="new-password" value={next} maxLength={128}
          onChange={(e) => setNext(e.target.value)} error={errors.next} hint={`At least ${MIN_PASSWORD} characters.`} />
        <PasswordField label="Confirm new password" icon="lock" autoComplete="new-password" value={confirm}
          maxLength={128} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>Change password</Button>
          <Link to="/account" className={buttonClass('secondary')}>Cancel</Link>
        </div>
      </form>
    </SettingsPage>
  )
}

/** Delete the account for good, after entering the password. */
export function DeleteAccountPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'password'>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password) return setErrors({ password: 'Enter your password to confirm.' })
    setBusy(true)
    try {
      await deleteAccount(password)  // the sign-in guard then shows the map
      queryClient.clear()  // drop anything loaded for this user
    } catch (error) {
      setErrors(failure<'password'>(error, { password: /password/i }))
      setBusy(false)
    }
    return undefined
  }

  return (
    <SettingsPage title="Delete account" intro={<>This removes <strong className="text-on-surface">{user?.email}</strong> from Sarathi for good.</>}>
      <ul className="mb-5 space-y-2 rounded-xl border border-[#fecaca] bg-error-container p-4 text-body-md text-on-error-container">
        <li className="flex gap-2"><Icon name="error" className="mt-px text-[20px]" /> You won't be able to log in or get the account back.</li>
        <li className="flex gap-2"><Icon name="info" className="mt-px text-[20px]" /> Hazards you reported stay on the map, with their photos, so routes stay safe for others. They are no longer linked to you.</li>
      </ul>
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <PasswordField label="Your password" icon="lock" autoComplete="current-password" value={password}
          maxLength={128} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" icon="delete" loading={busy}>Delete my account</Button>
          <Link to="/account" className={buttonClass('secondary')}>Keep my account</Link>
        </div>
      </form>
    </SettingsPage>
  )
}
