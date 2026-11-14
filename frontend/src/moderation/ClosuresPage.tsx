import { useState } from 'react'
import { Link } from 'react-router'

import { describeError } from '../api/client'
import { useClosures } from '../api/closures'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { dateTime, timeAgo } from '../lib/time'
import { useDecision } from './api'
import { Card, Empty, HazardIcon, PanelHeader, StatCard } from './shared'
import { roadLength, waited } from './text'

const STALE_HOURS = 72  // closures older than this are flagged for another look

/** Whether a closure has been in place long enough to deserve a second look. */
function isStale(verifiedAt: string): boolean {
  return Date.now() - new Date(verifiedAt).getTime() > STALE_HOURS * 3_600_000
}

/** "Mark cleared", which asks once more before reopening the road. */
function ClearButton({ id, road }: { id: number; road: string }) {
  const [confirming, setConfirming] = useState(false)
  const decision = useDecision()
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-muted bg-surface-container-lowest px-3 text-label-lg text-on-surface hover:bg-surface">
        <Icon name="check_circle" className="text-[18px] text-open-green" /> Mark cleared
      </button>
    )
  }
  return (
    <div className="text-right">
      <p className="text-body-sm text-on-surface">Reopen {road}?</p>
      {decision.isError && <p role="alert" className="text-body-sm text-error">{describeError(decision.error)}</p>}
      <div className="mt-1.5 flex justify-end gap-2">
        <button type="button" disabled={decision.isPending} onClick={() => decision.mutate({ action: 'clear', id })}
          className="h-8 rounded-md bg-open-green px-3 text-label-lg text-white hover:brightness-110 disabled:opacity-60">
          {decision.isPending ? 'Reopening…' : 'Yes, reopen'}
        </button>
        <button type="button" disabled={decision.isPending} onClick={() => setConfirming(false)}
          className="h-8 rounded-md border border-border-muted px-3 text-label-lg text-on-surface hover:bg-surface">Cancel</button>
      </div>
    </div>
  )
}

/** Every road closed right now, with the hazard behind it and a way to reopen it. */
export function ClosuresPage() {
  const { data, isPending, isError } = useClosures()
  const closures = data ?? []
  const total = closures.reduce((sum, closure) => sum + closure.length_m, 0)
  const oldest = closures.reduce<string | null>((first, c) => (!first || c.verified_at < first ? c.verified_at : first), null)
  const stale = closures.filter((closure) => isStale(closure.verified_at))

  return (
    <>
      <PanelHeader title="Active closures"
        tag={closures.length > 0 && <span className="rounded-full bg-hazard-closure-red px-2.5 py-0.5 text-[12px] font-semibold text-white">{closures.length} live</span>}
        subtitle="Roads closed by verified hazards. Routes and nearest-facility results go around them until they are cleared." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Closures" icon="block" tone={closures.length ? 'red' : 'neutral'} value={data ? closures.length : '–'}
          detail={data ? `${closures.reduce((sum, c) => sum + c.edges, 0)} road segments` : undefined} />
        <StatCard label="Road closed" icon="straighten" value={data ? roadLength(total) : '–'} detail="Counting two-way roads once" />
        <StatCard label="Oldest closure" icon="schedule" tone={stale.length ? 'amber' : 'neutral'} value={oldest ? waited(oldest) : '–'}
          detail={stale.length ? `${stale.length} older than ${STALE_HOURS} hours` : oldest ? 'None older than 72 hours' : 'No active closures'} />
      </div>

      <Card className="mt-4 overflow-hidden">
        {isPending && <div className="p-8"><Spinner label="Loading closures" /></div>}
        {isError && <p role="alert" className="p-6 text-body-md text-error">Couldn't load the closures. Check your connection.</p>}
        {data && closures.length === 0 && <Empty icon="check_circle" title="All roads are open">No verified hazard is closing a road right now.</Empty>}
        {closures.length > 0 && (
          <ul aria-label="Active closures" className="divide-y divide-border-muted">
            {closures.map((closure) => {
              const road = roadLabel(closure.road_name)
              const old = isStale(closure.verified_at)
              return (
                <li key={closure.incident_id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${old ? 'bg-[#fffbeb]' : ''}`}>
                  <HazardIcon kind={closure.kind} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 text-title-md text-on-surface">
                      {road}
                      {old && <span className="rounded-sm bg-pending-amber px-1.5 py-0.5 text-[11px] font-semibold text-on-surface uppercase">Check again</span>}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {hazardInfo(closure.kind).label} · {roadLength(closure.length_m)} closed within {Math.round(closure.radius_m)} m
                    </p>
                  </div>
                  <div className="basis-36 text-body-sm">
                    <p className="text-on-surface">Closed {timeAgo(closure.verified_at)}</p>
                    <p className={old ? 'text-[#b45309]' : 'text-text-secondary'}>{dateTime(closure.verified_at)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Link to={`/moderation/reports/${closure.incident_id}?tab=verified`}
                      className="inline-flex h-9 items-center rounded-md px-3 text-label-lg text-primary hover:bg-surface-container">Report</Link>
                    <ClearButton id={closure.incident_id} road={road} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
