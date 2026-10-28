import { useState } from 'react'

import { ApiError, describeError } from '../api/client'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { Button } from '../components/form/Button'
import { useRoute } from '../directions/api'
import { type Point, type Side, type Weight, isServed, useDirectionsParams } from '../directions/params'
import { RouteFields } from '../directions/RouteFields'
import { RouteRoads, RouteSummary, UnverifiedReports } from '../directions/RouteDetails'
import { MapPick, RouteLayer } from '../directions/RouteLayer'
import { BaseLayers } from '../map/BaseLayers'
import { useAppMap } from '../map/context'
import { MapLayers } from '../map/MapLayers'

const WEIGHTS: { value: Weight; label: string; icon: string }[] = [
  { value: 'time', label: 'Fastest', icon: 'bolt' },
  { value: 'length', label: 'Shortest', icon: 'straighten' },
]

/** Why there's no route, in words. */
function routeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 422 && /no road within/i.test(error.message)) {
    return 'One of the points is too far from any road. Choose a spot on or near a road.'
  }
  if (error instanceof ApiError && error.status === 404) {
    return /cut off/i.test(error.message)
      ? 'Verified closures cut off every route between these points right now.'
      : 'No open road connects these points.'
  }
  return describeError(error)
}

/** Screens 7, 8 and 17: plan a route around closed roads. */
export function DirectionsPage() {
  const { from: fromParam, to, weight, avoidUnverified, setPoint, swap, setWeight, setAvoidUnverified } = useDirectionsParams()
  const { location, locate, locateStatus, showNotice } = useAppMap()
  const [picking, setPicking] = useState<Side | null>(null)

  const here: Point | null = location && isServed(location) ? { lat: location.lat, lon: location.lon, name: 'Your location' } : null
  const from = fromParam ?? here
  const outside = [from, to].some((point) => point && !isServed(point))
  const ready = from && to && !outside
  const through = useRoute(ready ? from : null, ready ? to : null, weight)
  const avoiding = useRoute(ready ? from : null, ready ? to : null, weight, true, avoidUnverified)
  const noAvoidingRoute = avoidUnverified && avoiding.error instanceof ApiError && avoiding.error.status === 404
  // The route on show: the one keeping clear of unverified reports when asked for and one exists.
  const best = avoidUnverified && !noAvoidingRoute && (avoiding.data || avoiding.isPending) ? avoiding : through

  const change = (side: Side, point: Point | null) => {
    if (side === 'from' && !point && !location) locate({ moveMap: false })  // "your location" not known yet
    setPoint(side, point)
  }

  const pick = (lat: number, lon: number) => {
    if (!picking) return
    setPoint(picking, { lat, lon, name: picking === 'from' ? 'Chosen start' : 'Chosen destination' })
    setPicking(null)
  }

  const share = async () => {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: 'Route on Sarathi', url }).catch(() => undefined)
    else {
      try {
        await navigator.clipboard.writeText(url)
        showNotice('Route link copied.')
      } catch {
        showNotice("Couldn't copy the link.")
      }
    }
  }

  return (
    <>
      <title>Directions · Sarathi</title>
      <BaseLayers />
      <MapLayers>
        <RouteLayer route={best.data} from={from} to={to} />
        {picking && <MapPick onPick={pick} />}
      </MapLayers>

      <h1 className="mb-3 text-headline-md text-on-surface">Directions</h1>
      <RouteFields from={fromParam} to={to} here={here} onChange={change} onSwap={() => swap(here)}
        onPickOnMap={setPicking} />

      {picking && (
        <div role="status" className="mt-3 flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white">
          <Icon name="touch_app" />
          <p className="flex-1 text-body-md">Tap the map to set the {picking === 'from' ? 'start' : 'destination'}.</p>
          <button type="button" onClick={() => setPicking(null)} className="text-label-lg underline">Cancel</button>
        </div>
      )}

      <div role="radiogroup" aria-label="Route preference" className="mt-3 grid grid-cols-2 gap-2">
        {WEIGHTS.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={weight === option.value}
            onClick={() => setWeight(option.value)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-label-lg ${
              weight === option.value ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
            <Icon name={option.icon} className="text-[18px]" /> {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {!fromParam && !here && (
          <Alert>
            {locateStatus === 'locating' ? 'Finding your location…' : 'Share your location to start from where you are, or choose a start.'}
            {locateStatus !== 'locating' && (
              <button type="button" onClick={() => locate({ moveMap: false })} className="mt-1 block text-label-lg text-primary">
                Use my location
              </button>
            )}
          </Alert>
        )}
        {outside && <Alert tone="error">Sarathi has roads for Kathmandu District only. Choose points inside it.</Alert>}
        {from && !to && !outside && (
          <p className="text-body-md text-text-secondary">Choose where you're going: search above, or pick a spot on the map.</p>
        )}
        {ready && best.isPending && <div className="h-28 animate-pulse rounded-xl bg-surface-container" aria-label="Finding a route" />}
        {ready && best.isError && <Alert tone="error">{routeError(best.error)}</Alert>}
        {ready && best.data && (
          <>
            <RouteSummary route={best.data} />
            {through.data && (
              <UnverifiedReports through={through.data} avoiding={avoiding.data} avoidOn={avoidUnverified}
                noAvoidingRoute={noAvoidingRoute} onToggle={setAvoidUnverified} />
            )}
            <Button variant="secondary" icon="share" onClick={share} className="mt-4">Share route</Button>
            <RouteRoads route={best.data} />
          </>
        )}
      </div>
    </>
  )
}
