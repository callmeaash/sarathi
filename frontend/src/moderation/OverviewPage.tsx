import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'

import { useClosures } from '../api/closures'
import { Icon } from '../components/Icon'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { formatDuration } from '../lib/format'
import { dateTime } from '../lib/time'
import { useAudit, useQueue, useStats } from './api'
import { type MapPoint, ModMap } from './ModMap'
import { ActionChip, Card, Empty, HazardIcon, PanelHeader, StatCard } from './shared'
import { auditDetail, auditSubject, waited } from './text'

const SHOWN = 4

/** Today's date as "Friday, 13 November 2026". */
function today(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** The moderators' home: what needs attention now, where it is, and what was done lately. */
export function OverviewPage() {
  const navigate = useNavigate()
  const { data: stats, isError } = useStats()
  const { data: queue } = useQueue()
  const { data: closures } = useClosures()
  const audit = useAudit(null)
  const recent = audit.data?.pages[0]?.slice(0, SHOWN) ?? []

  const points = useMemo<MapPoint[]>(() => [
    ...(queue ?? []).map((report) => ({
      id: report.id, lat: report.lat, lon: report.lon, kind: report.kind, status: 'pending',
      title: `${hazardInfo(report.kind).label} · ${roadLabel(report.road_name)} (pending)`,
      onClick: () => navigate(`/moderation/reports/${report.id}`),
    })),
    ...(closures ?? []).map((closure) => ({
      id: closure.incident_id, lat: closure.lat, lon: closure.lon, kind: closure.kind, status: 'verified',
      title: `${hazardInfo(closure.kind).label} · ${roadLabel(closure.road_name)} (road closed)`,
      onClick: () => navigate(`/moderation/reports/${closure.incident_id}?tab=verified`),
    })),
  ], [queue, closures, navigate])
  const lines = (closures ?? []).filter((closure) => closure.geometry)
    .map((closure) => ({ key: `closure-${closure.incident_id}`, geometry: closure.geometry!, tone: 'closed' as const }))

  return (
    <>
      <PanelHeader title="Overview" subtitle={today()} />
      {isError && <p role="alert" className="mb-4 text-body-md text-error">Couldn't load the latest numbers. Check your connection.</p>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Pending reports" icon="hourglass_top" tone="amber" value={stats?.pending ?? '–'}
          detail={stats?.oldest_pending_at ? `Oldest waiting ${waited(stats.oldest_pending_at)}` : 'Nothing waiting'} />
        <StatCard label="Active closures" icon="block" tone={stats?.active_closures ? 'red' : 'neutral'}
          value={stats?.active_closures ?? '–'}
          detail={stats ? `${stats.closed_edges} road ${stats.closed_edges === 1 ? 'segment' : 'segments'} closed` : undefined} />
        <StatCard label="Reports today" icon="flag" value={stats?.reports_today ?? '–'}
          detail={stats ? `${stats.verified_today} verified, ${stats.rejected_today} rejected` : undefined} />
        <StatCard label="Median time to verify" icon="schedule" tone="green"
          value={stats?.median_verify_s != null ? formatDuration(stats.median_verify_s) : '–'} detail="Last 7 days" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card title="Hazards and closures" aside={
          <span className="flex gap-3 text-body-sm text-text-secondary">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-hazard-closure-red" aria-hidden />Closed roads</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-pending-amber" aria-hidden />Pending</span>
          </span>}>
          <div className="p-4">
            <ModMap points={points} lines={lines} focusKey={points.length ? 'loaded' : 'empty'} className="h-72 xl:h-[26rem]" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Waiting longest" aside={<Link to="/moderation/reports" className="text-label-lg text-primary">Open queue</Link>}>
            {queue && queue.length === 0 && <Empty icon="check_circle" title="The queue is empty">Every report has been reviewed.</Empty>}
            <ul className="p-2">
              {(queue ?? []).slice(0, SHOWN).map((report) => (
                <li key={report.id}>
                  <Link to={`/moderation/reports/${report.id}`} className="flex items-center gap-3 rounded-md p-2 hover:bg-surface">
                    <HazardIcon kind={report.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label-lg text-on-surface">{hazardInfo(report.kind).label}</span>
                      <span className="block truncate text-body-sm text-text-secondary">{roadLabel(report.road_name)}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[#fffbeb] px-2.5 py-0.5 text-[12px] font-medium text-[#92400e] tabular-nums">{waited(report.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {queue && queue.length > SHOWN && (
              <p className="border-t border-border-muted px-4 py-2.5 text-body-sm text-text-secondary">
                {queue.length - SHOWN} more waiting
              </p>
            )}
          </Card>

          <Card title="Recent activity" aside={<Link to="/moderation/audit" className="text-label-lg text-primary">Audit log</Link>}>
            {audit.data && recent.length === 0 && <p className="px-4 py-6 text-body-md text-text-secondary">No moderator actions yet.</p>}
            <ul className="divide-y divide-border-muted px-4 pt-1">
              {recent.map((entry) => {
                const subject = auditSubject(entry)
                return (
                  <li key={entry.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <ActionChip action={entry.action} />
                      <time dateTime={entry.created_at} className="text-body-sm text-text-secondary">{dateTime(entry.created_at)}</time>
                    </div>
                    <p className="mt-1.5 truncate text-label-lg text-on-surface">{subject.title}{subject.detail && subject.reportId ? ` · ${subject.detail}` : ''}</p>
                    <p className="truncate text-body-sm text-text-secondary">{auditDetail(entry)} · {entry.actor_name ?? 'Deleted account'}</p>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Link to="/" className="mt-4 inline-flex items-center gap-1.5 text-label-lg text-primary lg:hidden">
        <Icon name="map" className="text-[18px]" /> Open the public map
      </Link>
    </>
  )
}
