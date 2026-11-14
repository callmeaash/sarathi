import { type FormEvent, type ReactNode, useState } from 'react'
import { Link } from 'react-router'

import { describeError } from '../api/client'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/icons'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/form/Button'
import { hazardInfo, passableText, roadLabel } from '../hazards/kinds'
import { PhotoStrip } from '../hazards/PhotoStrip'
import { dateTime, timeAgo } from '../lib/time'
import {
  DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M, type Report, useClosurePreview, useDecision, useReport,
} from './api'
import { type MapPoint, ModMap } from './ModMap'
import { HazardIcon, StatusChip } from './shared'
import { roadLength } from './text'

const QUICK_REASONS = ['Could not confirm this hazard', 'The road is open', 'Not a road hazard', 'Reported in the wrong place']
const MIN_REASON = 3

/** One fact about a report, in its own small card. */
function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border-muted bg-surface-container-lowest p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-container text-on-surface-variant">
        <Icon name={icon} className="text-[20px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.07em] text-text-secondary uppercase">{label}</p>
        {children}
      </div>
    </div>
  )
}

/** The reporter's track record in words. */
function record(report: Report): string {
  if (!report.reporter) return 'This account was deleted'
  const { verified_reports: verified, reviewed_reports: reviewed } = report.reporter
  if (!reviewed) return 'No reviewed reports yet'
  return `${verified} of ${reviewed} past ${reviewed === 1 ? 'report' : 'reports'} verified`
}

/** Reject form: a reason the reporter will see, with common ones a tap away. */
function RejectForm({ onReject, onCancel, busy }: { onReject: (reason: string) => void; onCancel: () => void; busy: boolean }) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const short = reason.trim().length < MIN_REASON
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (!short) onReject(reason.trim())
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-border-muted bg-surface p-4">
      <label htmlFor="reject-reason" className="text-label-lg text-on-surface">Why is this report being rejected?</label>
      <p className="text-body-sm text-text-secondary">The reporter sees this in My reports.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((quick) => (
          <button key={quick} type="button" onClick={() => setReason(quick)}
            className="h-7 rounded-full border border-border-muted bg-surface-container-lowest px-2.5 text-[12.5px] text-on-surface-variant hover:border-primary hover:text-primary">
            {quick}
          </button>
        ))}
      </div>
      <textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300}
        aria-invalid={tried && short ? true : undefined}
        className="mt-2 block w-full resize-none rounded-md border border-border-muted bg-surface-container-lowest p-2.5 text-body-md text-on-surface outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15" />
      {tried && short && <p role="alert" className="mt-1 text-body-sm text-error">Give a short reason.</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="danger" loading={busy} className="h-9 px-4">Reject report</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel} className="h-9 px-4">Cancel</Button>
      </div>
    </form>
  )
}

/** Everything a moderator needs to decide on one report, and the buttons to decide. */
export function ReportReview({ id, onDecided }: { id: number; onDecided: (message: string) => void }) {
  const { data: report, isPending, isError } = useReport(id)
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M)
  const [rejecting, setRejecting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const decision = useDecision()
  const pending = report?.status === 'pending'
  const verified = report?.status === 'verified'
  const shownRadius = pending ? radius : report?.closure_radius_m ?? DEFAULT_RADIUS_M
  const preview = useClosurePreview(id, shownRadius, !!report && (pending || verified))

  if (isPending) return <div className="p-10"><Spinner label="Loading report" /></div>
  if (isError || !report) return <p role="alert" className="p-6 text-body-md text-error">Couldn't load this report. It may have been removed.</p>

  const { label } = hazardInfo(report.kind)
  const road = roadLabel(report.road_name)
  const passable = passableText(report.passable)
  const busy = decision.isPending
  const act = (change: Parameters<typeof decision.mutate>[0], message: string) =>
    decision.mutate(change, { onSuccess: () => onDecided(message) })

  const points: MapPoint[] = [{
    id: report.id, lat: report.lat, lon: report.lon, kind: report.kind, status: report.status, selected: true,
    title: `${label} · ${road}`,
  }]
  const lines = preview.data?.geometry
    ? [{ key: `preview-${id}-${shownRadius}`, geometry: preview.data.geometry, tone: pending ? 'preview' as const : 'closed' as const }]
    : []
  const closes = preview.data
    ? `${roadLength(preview.data.length_m)} of ${preview.data.roads.length ? preview.data.roads.join(', ') : 'unnamed road'}`
    : null

  return (
    <article aria-label={`Report ${report.id}`} className="space-y-4 p-4 lg:p-6">
      <header>
        <div className="flex flex-wrap items-start gap-3">
          <HazardIcon kind={report.kind} size="size-12" />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline-md text-on-surface">{label} on {road}</h2>
            <p className="text-body-sm text-text-secondary">
              Report #{report.id} · {dateTime(report.created_at)} ({timeAgo(report.created_at)}) ·{' '}
              <span className="tabular-nums">{report.lat.toFixed(5)}, {report.lon.toFixed(5)}</span>
            </p>
          </div>
          <StatusChip status={report.status} />
        </div>
      </header>

      <ModMap points={points} lines={lines} focusKey={`report-${id}`} className="h-64 lg:h-80"
        dropped={{ lat: report.reported_lat, lon: report.reported_lon, snapped: { lat: report.lat, lon: report.lon } }} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Fact icon="person" label="Reported by">
          <p className="truncate text-title-md text-on-surface">{report.reporter?.name ?? 'Deleted account'}</p>
          <p className="text-body-sm text-text-secondary">{record(report)}</p>
        </Fact>
        <Fact icon="route" label="Attached to road">
          <p className="truncate text-title-md text-on-surface">{road}</p>
          <p className="text-body-sm text-text-secondary">{Math.round(report.snap_distance_m)} m from where the pin was dropped</p>
        </Fact>
        <Fact icon="directions_car" label="Can vehicles get through?">
          <p className="text-title-md text-on-surface">{passable ?? 'Reporter was not sure'}</p>
        </Fact>
        <Fact icon="call_merge" label="Open reports nearby">
          <p className="text-title-md text-on-surface">{report.nearby.length ? `${report.nearby.length} within 150 m` : 'None within 150 m'}</p>
        </Fact>
      </div>

      {report.note && (
        <blockquote className="rounded-xl border-l-4 border-outline-variant bg-surface-container-low px-4 py-3 text-body-md text-on-surface">
          “{report.note}”
          <footer className="mt-1 text-body-sm text-text-secondary">Note from the reporter</footer>
        </blockquote>
      )}

      {report.photos.length > 0 && (
        <section aria-label="Photos from the reporter">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.07em] text-text-secondary uppercase">
            {report.photos.length === 1 ? '1 photo' : `${report.photos.length} photos`} from the reporter
          </p>
          <PhotoStrip photos={report.photos} />
        </section>
      )}

      {report.nearby.length > 0 && (
        <section aria-label="Open reports nearby" className="rounded-xl border border-border-muted">
          <p className="border-b border-border-muted px-4 py-2.5 text-label-lg text-on-surface">Open reports nearby</p>
          <ul className="divide-y divide-border-muted">
            {report.nearby.map((other) => (
              <li key={other.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <HazardIcon kind={other.kind} size="size-8" />
                <div className="min-w-0 flex-1">
                  <Link to={`/moderation/reports/${other.id}${other.status === 'verified' ? '?tab=verified' : ''}`}
                    className="text-label-lg text-primary">Report #{other.id}: {hazardInfo(other.kind).label}</Link>
                  <p className="text-body-sm text-text-secondary">{Math.round(other.distance_m)} m away · {timeAgo(other.created_at)}</p>
                </div>
                <StatusChip status={other.status} />
                {pending && (
                  <button type="button" disabled={busy}
                    onClick={() => act({ action: 'merge', id, intoId: other.id }, `Report #${id} was merged into report #${other.id}.`)}
                    className="h-8 rounded-md border border-border-muted px-3 text-label-lg text-on-surface hover:bg-surface disabled:opacity-60">
                    Same hazard: merge
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {decision.isError && <Alert tone="error">{describeError(decision.error)}</Alert>}

      {pending && !rejecting && (
        <section aria-label="Decision" className="rounded-xl border border-border-muted bg-surface p-4">
          <label htmlFor="closure-radius" className="flex items-baseline justify-between text-label-lg text-on-surface">
            Close roads within <span className="text-title-md tabular-nums">{radius} m</span>
          </label>
          <input id="closure-radius" type="range" min={MIN_RADIUS_M} max={MAX_RADIUS_M} step={5} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))} className="mt-2 w-full accent-primary" />
          <p className="mt-1 flex items-start gap-2 text-body-md text-on-surface-variant" aria-live="polite">
            <Icon name="info" className="mt-px text-[18px]" />
            {closes ? <span>Verifying closes <strong className="text-on-surface">{closes}</strong>. Routes will go around it straight away.</span>
              : preview.isError ? 'The roads this would close could not be worked out.' : 'Working out which roads this closes…'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="danger" icon="check" loading={busy}
              onClick={() => act({ action: 'verify', id, radiusM: radius }, `Report #${id} was verified and the road is closed.`)}>
              Verify and close road
            </Button>
            <Button variant="secondary" icon="close" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
          </div>
        </section>
      )}
      {pending && rejecting && (
        <RejectForm busy={busy} onCancel={() => setRejecting(false)}
          onReject={(reason) => act({ action: 'reject', id, reason }, `Report #${id} was rejected.`)} />
      )}

      {verified && (
        <section aria-label="Decision" className="rounded-xl border border-[#fecaca] bg-error-container p-4">
          <p className="text-body-md text-on-error-container">
            <strong>{closes ?? 'Roads'}</strong> closed within {Math.round(report.closure_radius_m ?? 0)} m
            {report.reviewed_at && <> since {dateTime(report.reviewed_at)}</>}{report.reviewer_name && <>, verified by {report.reviewer_name}</>}.
          </p>
          {clearing ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-body-md text-on-surface">Is the hazard gone? This reopens the road.</span>
              <Button loading={busy} className="h-9 px-4"
                onClick={() => act({ action: 'clear', id }, `Report #${id} was cleared and the road is open again.`)}>Yes, reopen</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setClearing(false)} className="h-9 px-4">Cancel</Button>
            </div>
          ) : (
            <Button variant="secondary" icon="check_circle" onClick={() => setClearing(true)} className="mt-3">Mark cleared</Button>
          )}
        </section>
      )}

      {!pending && !verified && (
        <section aria-label="Decision" className="rounded-xl border border-border-muted bg-surface p-4 text-body-md text-on-surface-variant">
          {report.status === 'rejected' && <p><strong className="text-on-surface">Rejected</strong>{report.reviewer_name && ` by ${report.reviewer_name}`}{report.reviewed_at && ` on ${dateTime(report.reviewed_at)}`}. Reason: {report.review_note ?? 'none given'}</p>}
          {report.status === 'cleared' && <p><strong className="text-on-surface">Cleared</strong>{report.cleared_at && ` on ${dateTime(report.cleared_at)}`}: the road is open again. It was verified{report.reviewer_name && ` by ${report.reviewer_name}`}{report.reviewed_at && ` on ${dateTime(report.reviewed_at)}`}.</p>}
          {report.status === 'merged' && <p><strong className="text-on-surface">Duplicate</strong>{report.reviewer_name && `, merged by ${report.reviewer_name}`}{report.merged_into_id && <> into <Link to={`/moderation/reports/${report.merged_into_id}?tab=verified`} className="font-semibold text-primary">report #{report.merged_into_id}</Link></>}.</p>}
        </section>
      )}
    </article>
  )
}
