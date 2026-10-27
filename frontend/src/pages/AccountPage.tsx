import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/form/Button'

/** Screen 15 (first part): who is signed in, and sign-out. */
export function AccountPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const logOut = async () => {
    setBusy(true)
    // Leave this signed-in-only page first, so the sign-in guard doesn't redirect to the log-in screen.
    navigate('/', { replace: true })
    await signOut()
  }

  return (
    <>
      <PageHeader title="Account" />
      <section className="rounded-xl border border-border-muted bg-surface-container-lowest p-5">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-headline-md text-white">
            {user.full_name.trim()[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-title-md">{user.full_name}</p>
            <p className="truncate text-body-md text-text-secondary">{user.email}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {user.email_verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-fixed/50 px-3 py-1 text-label-md text-tertiary">
              <Icon name="verified" filled className="text-[16px]" /> Email verified
            </span>
          ) : (
            <Link to={`/verify?email=${encodeURIComponent(user.email)}`}
              className="inline-flex items-center gap-1 rounded-full bg-[#fff1d6] px-3 py-1 text-label-md text-on-surface">
              <Icon name="error" className="text-[16px] text-pending-amber" /> Verify your email
            </Link>
          )}
          {user.role === 'moderator' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-3 py-1 text-label-md text-on-primary-fixed">
              <Icon name="shield_person" className="text-[16px]" /> Moderator
            </span>
          )}
        </div>
      </section>
      <section className="mt-4 rounded-xl border border-border-muted bg-surface-container-lowest p-5 text-body-md text-text-secondary">
        <p className="flex items-center gap-2 text-on-surface"><Icon name="info" className="text-[20px]" /> About the data</p>
        <p className="mt-2">Map data © OpenStreetMap contributors. Closures are checked by Sarathi moderators.</p>
      </section>
      <Button variant="secondary" full icon="logout" loading={busy} onClick={logOut} className="mt-6">Log out</Button>
    </>
  )
}
