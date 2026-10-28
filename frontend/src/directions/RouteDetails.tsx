import { useState } from 'react'
import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { SectionHeading } from '../components/SectionHeading'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { formatDistance, formatDuration } from '../lib/format'
import { timeAgo } from '../lib/time'
import type { Route } from './api'
import { viaRoads } from './via'

const SNAP_NOTE_FROM_M = 40  // mention when a route starts or ends this far from the chosen point

/** Time and distance, what the route follows, closures it goes around, and where it meets the road. */
export function RouteSummary({ route }: { route: Route }) {
  const via = viaRoads(route)
  const { detour } = route
  return (
    <section aria-label="Route summary">
      <p className="text-headline-lg text-tertiary">
        {formatDuration(route.duration_s)} <span className="text-headline-sm font-normal text-text-secondary">({formatDistance(route.distance_m)})</span>
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-body-md text-on-surface">
        <Icon name="verified" className="text-[18px] text-tertiary" />
        {route.weight === 'length' ? 'Shortest' : 'Fastest'} open route{via ? ` via ${via}` : ''}
      </p>

      {detour && (
        <div className="mt-4 rounded-xl bg-error-container p-4 text-on-error-container">
          <p className="flex items-center gap-2 text-label-lg">
            <Icon name="warning" className="text-[20px]" />
            Avoids {detour.closures.length} closed {detour.closures.length === 1 ? 'road' : 'roads'}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-body-md">
            {detour.closures.map((closure) => (
              <li key={closure.incident_id}>
                <Link to={`/hazards/${closure.incident_id}`} className="underline underline-offset-2">
                  {hazardInfo(closure.kind).label} on {roadLabel(closure.road_name)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-body-sm">
            The usual route is {formatDistance(detour.usual_distance_m)}, {formatDuration(detour.usual_duration_s)}.
          </p>
        </div>
      )}

      {(route.start.distance_m > SNAP_NOTE_FROM_M || route.end.distance_m > SNAP_NOTE_FROM_M) && (
        <p className="mt-3 flex items-start gap-1.5 text-body-sm text-text-secondary">
          <Icon name="info" className="text-[16px]" />
          {route.start.distance_m > SNAP_NOTE_FROM_M && `Starts on the nearest road, ${formatDistance(route.start.distance_m)} from your start. `}
          {route.end.distance_m > SNAP_NOTE_FROM_M && `Ends on the nearest road, ${formatDistance(route.end.distance_m)} from the destination.`}
        </p>
      )}
    </section>
  )
}

const ROADS_SHOWN = 6

/** The roads the route follows, in order, with how far along each. */
export function RouteRoads({ route }: { route: Route }) {
  const [all, setAll] = useState(false)
  if (!route.steps.length) return null
  const shown = all ? route.steps : route.steps.slice(0, ROADS_SHOWN)
  return (
    <section className="mt-6">
      <SectionHeading title="Roads on this route" count={route.steps.length} />
      <ol className="space-y-1">
        {shown.map((step, index) => (
          <li key={index} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-tint-medium text-label-sm text-primary">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">{roadLabel(step.road_name)}</span>
            <span className="shrink-0 text-body-sm text-text-secondary tabular-nums">{formatDistance(step.distance_m)}</span>
          </li>
        ))}
      </ol>
      {route.steps.length > ROADS_SHOWN && (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-1 px-2 text-label-lg text-primary">
          {all ? 'Show fewer' : `Show all ${route.steps.length} roads`}
        </button>
      )}
    </section>
  )
}

type UnverifiedProps = {
  through: Route                 // the normal route, which may pass unverified reports
  avoiding: Route | undefined    // the route keeping clear of them, when asked for
  avoidOn: boolean
  noAvoidingRoute: boolean       // asked to avoid them, but no route does
  onToggle: (on: boolean) => void
}

/** "+3 min, +800 m" between two routes, or a note that the second is no longer. */
function difference(longer: Route, shorter: Route): string {
  const seconds = longer.duration_s - shorter.duration_s
  const metres = longer.distance_m - shorter.distance_m
  if (seconds < 30 && metres < 50) return 'About the same time and distance as the route through them.'
  return `+${formatDuration(Math.max(seconds, 0))}, +${formatDistance(Math.max(metres, 0))} compared with the route through them.`
}

/** Warns about reports waiting for review along the route, and offers a route that keeps clear of them. */
export function UnverifiedReports({ through, avoiding, avoidOn, noAvoidingRoute, onToggle }: UnverifiedProps) {
  const reports = through.unverified ?? []
  if (!reports.length && !avoidOn) return null
  if (avoidOn && avoiding && !noAvoidingRoute) {
    return (
      <div className="mt-4 rounded-xl border border-pending-amber/50 bg-[#fff8e6] p-4 text-on-surface">
        <p className="flex items-center gap-2 text-label-lg">
          <Icon name="alt_route" className="text-[20px] text-[#7a5200]" />
          Avoiding {reports.length || 'any'} unverified {reports.length === 1 ? 'report' : 'reports'}
        </p>
        <p className="mt-1 text-body-sm text-text-secondary">{difference(avoiding, through)}</p>
        <button type="button" onClick={() => onToggle(false)} className="mt-2 text-label-lg text-primary">
          Show the route through them
        </button>
      </div>
    )
  }
  return (
    <div className="mt-4 rounded-xl border border-pending-amber/50 bg-[#fff8e6] p-4 text-on-surface">
      <p className="flex items-center gap-2 text-label-lg">
        <Icon name="warning" className="text-[20px] text-[#7a5200]" />
        Passes {reports.length} unverified {reports.length === 1 ? 'report' : 'reports'}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-body-md">
        {reports.map((report) => (
          <li key={report.incident_id}>
            <Link to={`/hazards/${report.incident_id}`} className="underline underline-offset-2">
              {hazardInfo(report.kind).label} on {roadLabel(report.road_name)}
            </Link>
            <span className="text-text-secondary"> · reported {timeAgo(report.created_at)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        {noAvoidingRoute
          ? 'No route keeps clear of them, so this route goes through them.'
          : "Not checked by a moderator yet, so routes don't avoid them on their own."}
      </p>
      {!noAvoidingRoute && (
        <button type="button" onClick={() => onToggle(true)}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-on-surface px-4 text-label-lg text-white hover:bg-inverse-surface">
          <Icon name="alt_route" className="text-[18px]" /> Avoid unverified reports
        </button>
      )}
    </div>
  )
}
