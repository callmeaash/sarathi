import { useState } from 'react'
import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { SectionHeading } from '../components/SectionHeading'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { formatDistance, formatDuration } from '../lib/format'
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
          {route.start.distance_m > SNAP_NOTE_FROM_M && `Starts at the nearest road junction, ${formatDistance(route.start.distance_m)} from your start. `}
          {route.end.distance_m > SNAP_NOTE_FROM_M && `Ends ${formatDistance(route.end.distance_m)} from the destination, at the nearest road junction.`}
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
