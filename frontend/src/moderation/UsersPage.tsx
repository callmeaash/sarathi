import { type FormEvent, useEffect, useState } from 'react'

import { describeError } from '../api/client'
import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { type ManagedUser, type Role, USERS_PAGE, type UserStatus, useUserAction, useUsers } from './api'
import { Card, Empty, PanelHeader, StatCard } from './shared'

const SEARCH_DELAY_MS = 300
const MIN_REASON = 3

/** A value that follows another after a short pause, so typing doesn't send a request per key. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Sep 2026"; written out by hand because browsers disagree on short month names. */
function joined(iso: string): string {
  const date = new Date(iso)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** Share of a user's reviewed reports that were verified, as a small bar; nothing until one is reviewed. */
function Reliability({ user }: { user: ManagedUser }) {
  const reviewed = user.verified + user.rejected
  if (!reviewed) return <span className="text-body-sm text-text-secondary">No reviewed reports</span>
  const share = Math.round((user.verified / reviewed) * 100)
  const colour = share >= 75 ? 'bg-open-green' : share >= 40 ? 'bg-pending-amber' : 'bg-error'
  return (
    <span className="block w-28">
      <span className="text-body-sm text-on-surface tabular-nums">{share}% <span className="text-text-secondary">({user.verified} of {reviewed})</span></span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-container" aria-hidden>
        <span className={`block h-full rounded-full ${colour}`} style={{ width: `${Math.max(share, 4)}%` }} />
      </span>
    </span>
  )
}

/** An account's standing as a pill. */
function Standing({ user }: { user: ManagedUser }) {
  const [label, style] = user.status === 'suspended' ? ['Suspended', 'bg-error-container text-on-error-container']
    : !user.email_verified ? ['Email not confirmed', 'bg-[#fffbeb] text-[#92400e]']
      : ['Active', 'bg-[#f0fdf4] text-open-green']
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap ${style}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />{label}
    </span>
  )
}

const ACTION_BUTTON = 'h-8 rounded-md border border-border-muted px-2.5 text-[13px] font-medium text-on-surface hover:bg-surface disabled:opacity-60'

/** What a moderator can do to an account: suspend it (with a reason), reinstate it, or change its role. */
function Actions({ user }: { user: ManagedUser }) {
  const { user: me } = useAuth()
  const change = useUserAction()
  const [mode, setMode] = useState<'idle' | 'suspend' | 'role'>('idle')
  const [reason, setReason] = useState('')
  if (user.id === me?.id) return <span className="text-body-sm text-text-secondary">This is you</span>

  const done = { onSuccess: () => { setMode('idle'); setReason('') } }
  const error = change.isError && <p role="alert" className="mt-1 text-body-sm text-error">{describeError(change.error)}</p>
  const newRole: Role = user.role === 'moderator' ? 'user' : 'moderator'

  if (mode === 'suspend') {
    const submit = (event: FormEvent) => {
      event.preventDefault()
      if (reason.trim().length >= MIN_REASON) change.mutate({ action: 'suspend', id: user.id, reason: reason.trim() }, done)
    }
    return (
      <form onSubmit={submit} className="min-w-56">
        <label className="text-body-sm text-on-surface">
          Reason for suspending {user.full_name}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus
            className="mt-1 block h-8 w-full rounded-md border border-border-muted bg-surface-container-lowest px-2 text-body-md outline-none focus:border-primary" />
        </label>
        {error}
        <span className="mt-1.5 flex gap-1.5">
          <button type="submit" disabled={change.isPending || reason.trim().length < MIN_REASON}
            className="h-8 rounded-md bg-hazard-closure-red px-2.5 text-[13px] font-medium text-white disabled:opacity-50">Suspend</button>
          <button type="button" onClick={() => setMode('idle')} className={ACTION_BUTTON}>Cancel</button>
        </span>
      </form>
    )
  }
  if (mode === 'role') {
    return (
      <div className="min-w-56">
        <p className="text-body-sm text-on-surface">
          {newRole === 'moderator' ? `Let ${user.full_name} review reports and manage accounts?` : `Remove ${user.full_name}'s moderator access?`}
        </p>
        {error}
        <span className="mt-1.5 flex gap-1.5">
          <button type="button" disabled={change.isPending} onClick={() => change.mutate({ action: 'role', id: user.id, role: newRole }, done)}
            className="h-8 rounded-md bg-primary px-2.5 text-[13px] font-medium text-white disabled:opacity-50">
            {newRole === 'moderator' ? 'Make moderator' : 'Make user'}
          </button>
          <button type="button" onClick={() => setMode('idle')} className={ACTION_BUTTON}>Cancel</button>
        </span>
      </div>
    )
  }
  return (
    <div>
      <span className="flex flex-wrap gap-1.5">
        {user.status === 'suspended'
          ? <button type="button" disabled={change.isPending} onClick={() => change.mutate({ action: 'reinstate', id: user.id }, done)} className={ACTION_BUTTON}>Reinstate</button>
          : user.role !== 'moderator' && <button type="button" onClick={() => setMode('suspend')} className={ACTION_BUTTON}>Suspend</button>}
        {(user.role === 'moderator' || (user.status === 'active' && user.email_verified)) && (
          <button type="button" onClick={() => setMode('role')} className={ACTION_BUTTON}>
            {user.role === 'moderator' ? 'Make user' : 'Make moderator'}
          </button>
        )}
      </span>
      {error}
    </div>
  )
}

const FIELD = 'h-10 rounded-md border border-border-muted bg-surface-container-lowest px-3 text-body-md text-on-surface outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15'

/** Accounts: search and filter them, see each one's record, and suspend, reinstate or change roles. */
export function UsersPage() {
  const [text, setText] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [status, setStatus] = useState<UserStatus | null>(null)
  const [page, setPage] = useState(0)
  const q = useDebounced(text.trim(), SEARCH_DELAY_MS)
  const users = useUsers({ q, role, status, page: q === text.trim() ? page : 0 })
  const total = users.data?.total ?? 0
  const counts = users.data?.counts
  const first = page * USERS_PAGE + 1
  const last = Math.min(total, (page + 1) * USERS_PAGE)

  return (
    <>
      <PanelHeader title="Users" subtitle="Everyone with an account, with how their reports have turned out." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Accounts" icon="group" value={counts?.users ?? '–'} />
        <StatCard label="Moderators" icon="shield_person" value={counts?.moderators ?? '–'} tone="green" />
        <StatCard label="Email not confirmed" icon="mark_email_unread" value={counts?.unverified ?? '–'} tone="amber" />
        <StatCard label="Suspended" icon="block" value={counts?.suspended ?? '–'} tone={counts?.suspended ? 'red' : 'neutral'} />
      </div>

      <Card className="mt-4 flex flex-wrap items-center gap-2 p-3">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Search name or email</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-text-secondary" />
          <input type="search" value={text} placeholder="Search name or email" className={`${FIELD} w-full pl-9`}
            onChange={(e) => { setText(e.target.value); setPage(0) }} />
        </label>
        <select aria-label="Role" value={role ?? ''} className={FIELD}
          onChange={(e) => { setRole((e.target.value || null) as Role | null); setPage(0) }}>
          <option value="">All roles</option>
          <option value="user">Users</option>
          <option value="moderator">Moderators</option>
        </select>
        <select aria-label="Status" value={status ?? ''} className={FIELD}
          onChange={(e) => { setStatus((e.target.value || null) as UserStatus | null); setPage(0) }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="unverified">Email not confirmed</option>
          <option value="suspended">Suspended</option>
        </select>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {users.isPending && <div className="p-8"><Spinner label="Loading accounts" /></div>}
        {users.isError && <p role="alert" className="p-6 text-body-md text-error">Couldn't load the accounts. Check your connection.</p>}
        {users.data && total === 0 && <Empty icon="group" title="No accounts match">Try a different search or filter.</Empty>}
        {users.data && total > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-body-md">
              <thead className="border-b border-border-muted bg-surface text-[11px] font-semibold tracking-[0.07em] text-text-secondary uppercase">
                <tr>
                  {['Name', 'Role', 'Reports', 'Verified', 'Status', 'Joined', 'Actions'].map((heading) => (
                    <th key={heading} scope="col" className="px-4 py-2.5 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {users.data.items.map((user) => (
                  <tr key={user.id} className={`align-middle ${user.status === 'suspended' ? 'bg-error-container/40' : ''}`}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      <span className="flex items-center gap-3">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-label-lg text-white">
                          {user.full_name.trim()[0]?.toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-label-lg text-on-surface">{user.full_name}</span>
                          <span className="block truncate text-body-sm text-text-secondary">{user.email}</span>
                        </span>
                      </span>
                    </th>
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-6 items-center rounded-sm px-2 text-[12px] font-medium ${
                        user.role === 'moderator' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant'}`}>
                        {user.role === 'moderator' ? 'Moderator' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface tabular-nums">{user.reports}</td>
                    <td className="px-4 py-3"><Reliability user={user} /></td>
                    <td className="px-4 py-3"><Standing user={user} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">{joined(user.created_at)}</td>
                    <td className="px-4 py-3"><Actions user={user} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border-muted px-4 py-3 text-body-md text-text-secondary">
            <span>{first}–{last} of {total} {total === 1 ? 'account' : 'accounts'}</span>
            <span className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={`${ACTION_BUTTON} h-9 px-3`}>Previous</button>
              <button type="button" disabled={last >= total} onClick={() => setPage(page + 1)} className={`${ACTION_BUTTON} h-9 px-3`}>Next</button>
            </span>
          </div>
        )}
      </Card>
    </>
  )
}
