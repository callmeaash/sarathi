import { useState } from 'react'
import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { SectionHeading } from '../components/SectionHeading'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { formatDistance, formatDuration } from '../lib/format'
import { timeAgo } from '../lib/time'
import type { Route } from './api'
import type { UnverifiedChoice } from './params'
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
  around: Route | undefined      // the route keeping clear of them (fetched as soon as there are any)
  noRouteAround: boolean         // no route keeps clear of them
  choice: UnverifiedChoice
  onChoose: (choice: UnverifiedChoice) => void
}

/** "+3 min, +800 m" between two routes, or a note that the second is no longer. */
function difference(longer: Route, shorter: Route): string {
  const seconds = longer.duration_s - shorter.duration_s
  const metres = longer.distance_m - shorter.distance_m
  if (seconds < 30 && metres < 50) return 'about the same time and distance'
  return `+${formatDuration(Math.max(seconds, 0))}, +${formatDistance(Math.max(metres, 0))}`
}

const plural = (count: number) => (count === 1 ? 'report' : 'reports')

/** The reports, linked to their pages, with how long ago each was made. */
function ReportList({ route }: { route: Route }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-body-md">
      {(route.unverified ?? []).map((report) => (
        <li key={report.incident_id}>
          <Link to={`/hazards/${report.incident_id}`} className="underline underline-offset-2">
            {hazardInfo(report.kind).label} on {roadLabel(report.road_name)}
          </Link>
          <span className="text-text-secondary"> · reported {timeAgo(report.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}

const BOX = 'mt-4 rounded-xl border border-pending-amber/50 bg-[#fff8e6] p-4 text-on-surface'

/**
 * Unverified reports on the route: asks whether to go around them (with what that costs), then shows the
 * answer with a way to change it. Reports waiting for review never reroute anyone on their own.
 */
export function UnverifiedReports({ through, around, noRouteAround, choice, onChoose }: UnverifiedProps) {
  const count = through.unverified?.length ?? 0
  if (!count && choice !== 'around') return null

  if (choice === 'around' && around) {
    return (
      <div role="status" className={BOX}>
        <p className="flex items-center gap-2 text-label-lg">
          <Icon name="alt_route" className="text-[20px] text-[#7a5200]" />
          Going around {count || 'the'} unverified {plural(count)}
        </p>
        <p className="mt-1 text-body-sm text-text-secondary">
          This route is {difference(around, through)} compared with the route through {count === 1 ? 'it' : 'them'}.
        </p>
        <button type="button" onClick={() => onChoose('through')} className="mt-2 text-label-lg text-primary">
          Take the route through {count === 1 ? 'it' : 'them'} instead
        </button>
      </div>
    )
  }

  if (choice === 'through' || noRouteAround) {
    return (
      <div className={BOX}>
        <p className="flex items-center gap-2 text-label-lg">
          <Icon name="warning" className="text-[20px] text-[#7a5200]" />
          Passes {count} unverified {plural(count)}
        </p>
        <ReportList route={through} />
        {noRouteAround ? (
          <p className="mt-1.5 text-body-sm text-text-secondary">No route goes around {count === 1 ? 'it' : 'them'}, so take care there.</p>
        ) : (
          <button type="button" onClick={() => onChoose('around')} className="mt-2 text-label-lg text-primary">
            Go around {count === 1 ? 'it' : 'them'} instead
          </button>
        )}
      </div>
    )
  }

  return (
    <section aria-label="Unverified reports on this route" className={BOX}>
      <p className="flex items-center gap-2 text-label-lg">
        <Icon name="warning" className="text-[20px] text-[#7a5200]" />
        {count === 1 ? 'Unverified report on your route' : `${count} unverified reports on your route`}
      </p>
      <ReportList route={through} />
      <p className="mt-1.5 text-body-sm text-text-secondary">A moderator hasn't checked {count === 1 ? 'it' : 'them'} yet.</p>
      <p className="mt-3 text-title-md">
        Take a route around {count === 1 ? 'it' : 'them'}?
        {around && <span className="font-normal text-text-secondary"> It's {difference(around, through)}.</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChoose('around')} disabled={!around}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-on-surface px-4 text-label-lg text-white hover:bg-inverse-surface disabled:opacity-60">
          {around ? <Icon name="alt_route" className="text-[18px]" />
            : <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />}
          Go around
        </button>
        <button type="button" onClick={() => onChoose('through')}
          className="inline-flex h-10 items-center rounded-full border border-border-muted bg-surface-container-lowest px-4 text-label-lg text-on-surface hover:bg-surface-container-low">
          Keep this route
        </button>
      </div>
    </section>
  )
}
