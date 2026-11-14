import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { api, describeError, unwrap } from '../../api/client'
import { logOutEverywhere } from '../../auth/actions'
import { useAuth } from '../../auth/context'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons'
import { SectionHeading } from '../../components/SectionHeading'
import { Button } from '../../components/form/Button'

/** How many hazards the user has reported and how many were verified. */
function useSummary() {
  return useQuery({ queryKey: ['account-summary'], queryFn: () => unwrap(api.GET('/api/me/summary')) })
}

/** "October 2026" for the month an account was created. */
function memberSince(created: string): string {
  return new Date(created).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** The three report counts; each number is "–" until loaded or if it can't be. */
function Stats() {
  const { data } = useSummary()
  const stats = [
    { label: 'Reports', value: data?.reports, colour: 'text-primary' },
    { label: 'Verified', value: data?.verified, colour: 'text-open-green' },
    { label: 'Under review', value: data?.pending, colour: 'text-[#b45309]' },
  ]
  return (
    <Link to="/reports" aria-label="My reports"
      className="mt-5 grid grid-cols-3 divide-x divide-border-muted rounded-xl border border-border-muted bg-surface-container-lowest py-3 hover:bg-surface">
      {stats.map(({ label, value, colour }) => (
        <span key={label} className="px-2 text-center">
          <span className={`block text-headline-md tabular-nums ${colour}`}>{value ?? '–'}</span>
          <span className="block text-body-sm text-text-secondary">{label}</span>
        </span>
      ))}
    </Link>
  )
}

/** One line in a settings list: an icon, a title, what it is now, and where it leads. */
function Row({ icon, title, detail, to, danger = false }: {
  icon: IconName; title: string; detail: ReactNode; to: string; danger?: boolean
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
        <span className={`grid size-9 shrink-0 place-items-center rounded-md ${
          danger ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant'}`}>
          <Icon name={icon} className="text-[20px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-label-lg ${danger ? 'text-error' : 'text-on-surface'}`}>{title}</span>
          <span className="block truncate text-body-sm text-text-secondary">{detail}</span>
        </span>
        <Icon name="chevron_right" className="text-[20px] text-text-secondary" />
      </Link>
    </li>
  )
}

const LIST = 'divide-y divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface-container-lowest'

/** Signs out of every device after a second, confirming tap. */
function SignOutEverywhere() {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await logOutEverywhere()  // the sign-in guard then shows the map
      queryClient.clear()  // drop anything loaded for this user
    } catch (failure) {
      setError(describeError(failure))
      setBusy(false)
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-container text-on-surface-variant">
          <Icon name="devices" className="text-[20px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-label-lg text-on-surface">Log out of all devices</span>
          <span className="block text-body-sm text-text-secondary">Ends every session, including this one.</span>
        </span>
        {!confirming && (
          <button type="button" onClick={() => setConfirming(true)}
            className="h-9 shrink-0 rounded-md border border-border-muted px-3 text-label-lg text-on-surface hover:bg-surface">
            Log out all
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-md bg-surface p-3">
          <p className="text-body-md text-on-surface">You'll need to log in again on every phone and computer.</p>
          {error && <p role="alert" className="mt-2 text-body-sm text-error">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="danger" loading={busy} onClick={run} className="h-9 px-4">Log out everywhere</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)} className="h-9 px-4">Cancel</Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Screen 15: who is signed in, what they've reported, and their account settings. */
export function AccountPage() {
  const { user, signOut } = useAuth()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const logOut = async () => {
    setBusy(true)
    await signOut()  // the sign-in guard then shows the map
  }

  return (
    <div className="mx-auto max-w-xl">
      <title>Account · Sarathi</title>
      <h1 className="sr-only">Account</h1>
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      <section aria-label="Profile" className="text-center">
        <span className="relative mx-auto grid size-20 place-items-center rounded-full bg-primary text-display-lg-mobile text-white">
          <span aria-hidden>{user.full_name.trim()[0]?.toUpperCase()}</span>
          {user.email_verified && (
            <span className="absolute -right-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full bg-open-green text-white ring-2 ring-surface">
              <Icon name="check" filled className="text-[16px]" label="Email verified" />
            </span>
          )}
        </span>
        <p className="mt-3 truncate text-headline-md text-on-surface">{user.full_name}</p>
        <p className="truncate text-body-md text-text-secondary">{user.email}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {!user.email_verified && (
            <Link to={`/verify?email=${encodeURIComponent(user.email)}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 text-label-md text-[#92400e]">
              <Icon name="error" className="text-[16px]" /> Verify your email
            </Link>
          )}
          {user.role === 'moderator' && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-fixed px-3 text-label-md text-on-primary-fixed">
              <Icon name="shield_person" className="text-[16px]" /> Moderator
            </span>
          )}
          <span className="inline-flex h-7 items-center rounded-full bg-surface-container px-3 text-label-md text-on-surface-variant">
            Member since {memberSince(user.created_at)}
          </span>
        </div>
        <Stats />
      </section>

      {user.role === 'moderator' && (
        <section className="mt-6">
          <SectionHeading title="Moderation" />
          <ul className={LIST}>
            <Row icon="shield_person" title="Moderator panel" detail="Review reports, closures and accounts" to="/moderation" />
          </ul>
        </section>
      )}

      <section className="mt-6">
        <SectionHeading title="Account" />
        <ul className={LIST}>
          <Row icon="person" title="Name" detail={user.full_name} to="/account/name" />
          <Row icon="lock" title="Password" detail="Change your password" to="/account/password" />
        </ul>
      </section>

      <section className="mt-6">
        <SectionHeading title="Security" />
        <ul className={LIST}>
          <SignOutEverywhere />
        </ul>
      </section>

      <section className="mt-6">
        <SectionHeading title="About" />
        <div className="rounded-xl border border-border-muted bg-surface-container-lowest p-4 text-body-md text-text-secondary">
          <p>Roads and places come from OpenStreetMap contributors. Road closures are checked by Sarathi moderators before they change any route.</p>
        </div>
      </section>

      <Button variant="secondary" full icon="logout" loading={busy} onClick={logOut} className="mt-6">Log out</Button>

      <section className="mt-6">
        <ul className={LIST}>
          <Row icon="delete" title="Delete account" detail="Remove your account for good" to="/account/delete" danger />
        </ul>
      </section>
    </div>
  )
}
