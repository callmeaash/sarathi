import { useEffect, useRef } from 'react'

import { Icon } from '../components/Icon'
import { Button } from '../components/form/Button'
import { formatDistance } from '../lib/format'
import { inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { focusOn } from '../map/focus'
import { MapLayers } from '../map/MapLayers'
import { useNearestRoad } from '../map/roads'
import { useDebounced } from '../search/api'
import { PlaceSearch } from '../search/PlaceSearch'
import { CenterPin, type LatLon } from './CenterPin'

export const MAX_ROAD_DISTANCE_M = 150  // the API only accepts hazards this close to a road
const PIN_ZOOM = 17

type LocationStepProps = {
  point: LatLon | null
  start: LatLon | null  // where to put the map when the step opens (a dropped pin, or the user)
  onMove: (point: LatLon) => void
  onNext: () => void
}

/** Step 1 (screen 11): move the map until the pin sits on the road where the hazard is. */
export function LocationStep({ point, start, onMove, onNext }: LocationStepProps) {
  const { map, locate, locateStatus } = useAppMap()
  const centred = useRef(false)
  const settled = useDebounced(point, 300)  // ask for the road once the map stops, not on every frame
  const inside = settled !== null && inDistrict(settled.lat, settled.lon)
  const { data: road, isFetching } = useNearestRoad(inside ? settled : null)

  useEffect(() => {  // bring the starting spot into the middle of the visible map, once
    if (!map || !start || centred.current) return
    centred.current = true
    focusOn(map, [start.lat, start.lon], Math.max(map.getZoom(), PIN_ZOOM))
  }, [map, start])

  const onRoad = road != null && road.distance_m <= MAX_ROAD_DISTANCE_M
  let status: { icon: string; text: string; tone: 'ok' | 'warn' | 'muted' }
  if (!point) status = { icon: 'pan_tool', text: 'Move the map to place the pin', tone: 'muted' }
  else if (!inside) status = { icon: 'wrong_location', text: 'Outside Kathmandu District', tone: 'warn' }
  else if (isFetching && !road) status = { icon: 'more_horiz', text: 'Finding the nearest road…', tone: 'muted' }
  else if (!onRoad) status = { icon: 'wrong_location', text: `Move the pin onto a road (within ${MAX_ROAD_DISTANCE_M} m)`, tone: 'warn' }
  else status = { icon: 'check_circle', text: road.distance_m < 10 ? 'Pin is on the road' : `The report will snap to this road (${formatDistance(road.distance_m)} away)`, tone: 'ok' }

  return (
    <>
      <MapLayers><CenterPin onMove={onMove} /></MapLayers>
      <p className="mb-1 text-label-md tracking-[0.08em] text-on-surface-variant uppercase">Step 1 of 2 · Where is it?</p>
      <h1 className="text-headline-md text-on-surface">{onRoad ? road.road_name ?? 'Unnamed road' : 'Place the pin'}</h1>
      <p className={`mt-1 flex items-center gap-1.5 text-body-md ${
        status.tone === 'ok' ? 'text-tertiary' : status.tone === 'warn' ? 'text-hazard-accident-orange' : 'text-text-secondary'}`}>
        <Icon name={status.icon} className="text-[18px]" /> {status.text}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="tonal" icon="my_location" onClick={() => locate()} loading={locateStatus === 'locating'} className="h-11 min-w-0 px-3">
          My location
        </Button>
        <PlaceSearch
          label="Search a place"
          placeholder="Search a place"
          clearOnSelect
          onSelect={(hit) => map && focusOn(map, [hit.lat, hit.lon], PIN_ZOOM)}
          boxClassName="flex h-11 items-center gap-2 rounded-full bg-surface-container px-4 focus-within:ring-2 focus-within:ring-primary"
        />
      </div>

      {point && (
        <p className="mt-3 text-body-sm text-text-secondary tabular-nums">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</p>
      )}
      <p className="mt-1 text-body-sm text-text-secondary">Move the map so the pin sits on the road where the hazard is.</p>

      <Button full icon="arrow_forward" disabled={!onRoad || settled !== point} onClick={onNext} className="mt-5">Next</Button>
    </>
  )
}
