import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'

import { api, describeError, unwrap } from '../api/client'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { buttonClass } from '../components/form/buttonStyles'
import type { Incident } from '../hazards/api'
import { hazardInfo, passableText, roadLabel } from '../hazards/kinds'
import { dateTime, timeAgo } from '../lib/time'

const MAX_REPORTS = 100

/** The signed-in user's reports, newest first. */
function useMyReports() {
  return useQuery({
    queryKey: ['my-reports'],
    queryFn: () => unwrap(api.GET('/api/incidents/mine', { params: { query: { limit: MAX_REPORTS } } })),
    refetchInterval: 60_000,  // see a moderator's decision without reloading
  })
}

type Status = 'pending' | 'verified' | 'cleared' | 'rejected' | 'merged'

const STATUS: Record<Status, { label: string; filter: string; badge: string; icon: string; dot: string }> = {
  pending: { label: 'Under review', filter: 'Pending', badge: 'bg-[#fff1d6] text-[#7a5200]', icon: 'hourglass_top', dot: 'bg-pending-amber' },
  verified: { label: 'Road closed', filter: 'Verified', badge: 'bg-error-container text-on-error-container', icon: 'block', dot: 'bg-hazard-closure-red' },
  cleared: { label: 'Cleared', filter: 'Cleared', badge: 'bg-tertiary-fixed/50 text-tertiary', icon: 'check_circle', dot: 'bg-open-green' },
  rejected: { label: 'Rejected', filter: 'Rejected', badge: 'bg-surface-container text-on-surface-variant', icon: 'cancel', dot: 'bg-outline' },
  merged: { label: 'Duplicate', filter: 'Duplicates', badge: 'bg-surface-container text-on-surface-variant', icon: 'call_merge', dot: 'bg-outline' },
}
const ORDER: Status[] = ['pending', 'verified', 'cleared', 'rejected', 'merged']
const PUBLIC: Status[] = ['pending', 'verified', 'cleared']  // the hazard page shows only these

const statusOf = (report: Incident): Status => (report.status in STATUS ? report.status as Status : 'pending')

/** A tinted strip under a report explaining its state. */
function Note({ icon, tone = 'muted', children }: { icon: string; tone?: 'muted' | 'red' | 'green'; children: ReactNode }) {
  const tones = { muted: 'bg-surface-container-low text-on-surface', red: 'bg-error-container/60 text-on-error-container',
    green: 'bg-tertiary-fixed/30 text-on-surface' }
  return (
    <div className={`mt-3 flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-body-sm ${tones[tone]}`}>
      <Icon name={icon} className="mt-px text-[18px]" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** What happened to a report, in words. */
function Outcome({ report }: { report: Incident }) {
  switch (statusOf(report)) {
    case 'pending':
      return <Note icon="schedule">Waiting for a moderator to check it. It doesn't change routes until then.</Note>
    case 'verified':
      return (
        <Note icon="alt_route" tone="red">
          Verified{report.reviewed_at ? ` ${timeAgo(report.reviewed_at)}` : ''}. Roads within {Math.round(report.closure_radius_m ?? 0)} m
          are closed and routes go around them.
        </Note>
      )
    case 'cleared':
      return <Note icon="check_circle" tone="green">Cleared{report.cleared_at ? ` ${timeAgo(report.cleared_at)}` : ''}: the roads are open again.</Note>
    case 'rejected':
      return (
        <Note icon="info">
          <span className="block text-label-md text-on-surface-variant">Moderator's note</span>
          {report.review_note ?? 'No reason given.'}
        </Note>
      )
    case 'merged':
      return (
        <Note icon="call_merge">
          Someone had already reported this hazard, so yours was added to theirs.
          {report.merged_into_id && <> <Link to={`/hazards/${report.merged_into_id}`} className="font-semibold text-primary">See it</Link></>}
        </Note>
      )
  }
}

/** One report: what, where, when, its status, and what happened. */
function ReportCard({ report }: { report: Incident }) {
  const { label, icon, tint } = hazardInfo(report.kind)
  const status = STATUS[statusOf(report)]
  const passable = passableText(report.passable)
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tint}`}><Icon name={icon} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-title-md text-on-surface">{label}</p>
          <p className="truncate text-body-sm text-on-surface-variant">{roadLabel(report.road_name)}</p>
          <p className="text-body-sm text-text-secondary">Reported {dateTime(report.created_at)}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-label-md ${status.badge}`}>
          <Icon name={status.icon} className="text-[16px]" /> {status.label}
        </span>
      </div>
      {(report.note || passable) && (
        <p className="mt-2 text-body-sm text-text-secondary">
          {[passable, report.note && `“${report.note}”`].filter(Boolean).join(' · ')}
        </p>
      )}
      <Outcome report={report} />
    </>
  )
  const card = 'block rounded-xl border border-border-muted bg-surface-container-lowest p-4'
  return (
    <li>
      {PUBLIC.includes(statusOf(report))
        ? <Link to={`/hazards/${report.id}`} className={`${card} hover:bg-surface-tint-light`}>{body}</Link>
        : <div className={card}>{body}</div>}
    </li>
  )
}

/** Screen 14: everything the user has reported and what happened to each. */
export function MyReportsPage() {
  const { data, isPending, isError, error } = useMyReports()
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const counts = Object.fromEntries(ORDER.map((s) => [s, (data ?? []).filter((r) => statusOf(r) === s).length])) as Record<Status, number>
  const shown = (data ?? []).filter((report) => filter === 'all' || statusOf(report) === filter)

  return (
    <>
      <title>My reports · Sarathi</title>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-on-surface">My reports</h1>
          <p className="mt-0.5 text-body-md text-text-secondary">Hazards you reported and what happened to them.</p>
        </div>
        {data && data.length > 0 && (
          <span className="mt-1 shrink-0 rounded-full bg-surface-container px-3 py-1 text-label-md text-on-surface-variant">
            {data.length} {data.length === 1 ? 'report' : 'reports'}
          </span>
        )}
      </header>

      {isPending && <div className="mt-5 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-container" />)}</div>}
      {isError && <div className="mt-5"><Alert tone="error">{describeError(error)}</Alert></div>}

      {data && data.length === 0 && (
        <div className="mt-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-tint-medium text-primary">
            <Icon name="campaign" className="text-[28px]" />
          </span>
          <h2 className="mt-4 text-headline-sm">No reports yet</h2>
          <p className="mx-auto mt-2 max-w-xs text-body-md text-text-secondary">
            Seen a flood, landslide or blocked road? Report it and a moderator will check it.
          </p>
          <Link to="/report" className={`${buttonClass('danger')} mt-5`}>
            <Icon name="add_location_alt" className="text-[20px]" /> Report a hazard
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Show" className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] *:shrink-0">
            {(['all', ...ORDER.filter((s) => counts[s] > 0)] as const).map((value) => {
              const on = filter === value
              return (
                <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setFilter(value)}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-label-lg ${
                    on ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                  {value !== 'all' && <span className={`size-2 rounded-full ${STATUS[value].dot}`} aria-hidden />}
                  {value === 'all' ? 'All' : STATUS[value].filter} ({value === 'all' ? data.length : counts[value]})
                </button>
              )
            })}
          </div>
          <ul className="mt-4 space-y-3" aria-label="Reports">
            {shown.map((report) => <ReportCard key={report.id} report={report} />)}
          </ul>
        </>
      )}
    </>
  )
}
