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

/** Dijkstra and A* side by side for this route: same answer, how much work each did. */
export function AlgorithmComparison({ astar, dijkstra }: { astar: Route; dijkstra: Route | undefined }) {
  const cost = (route: Route) => (route.weight === 'length' ? formatDistance(route.distance_m) : formatDuration(route.duration_s))
  const rows: [string, Route | undefined][] = [['Dijkstra', dijkstra], ['A*', astar]]
  const saved = dijkstra && dijkstra.visited_nodes > 0
    ? Math.round((1 - astar.visited_nodes / dijkstra.visited_nodes) * 100) : null
  return (
    <section className="mt-6">
      <SectionHeading title="Algorithm comparison" />
      <table className="w-full overflow-hidden rounded-xl text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-md text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Algorithm</th>
            <th scope="col" className="px-3 py-2 font-medium">Cost</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Junctions searched</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map(([name, route]) => (
            <tr key={name} className={`border-t border-border-muted ${name === 'A*' ? 'bg-surface-tint-light' : ''}`}>
              <th scope="row" className="px-3 py-2 font-medium">
                {name} {name === 'A*' && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-label-sm text-white">Used</span>}
              </th>
              <td className="px-3 py-2">{route ? cost(route) : '…'}</td>
              <td className="px-3 py-2 text-right">{route ? route.visited_nodes.toLocaleString('en') : '…'}</td>
              <td className="px-3 py-2 text-right">{route ? `${Math.max(1, Math.round(route.runtime_ms))} ms` : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {saved !== null && (
        <p className="mt-2 text-body-sm text-text-secondary">
          Both find a route of the same cost. A* searched {saved > 0 ? `${saved}% fewer` : 'as many'} junctions by
          heading towards the destination.
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
