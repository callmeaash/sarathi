import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ApiError, describeError } from '../api/client'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { buttonClass } from '../components/form/buttonStyles'
import { FACILITY_KINDS, type FacilityKind, KINDS, kindInfo } from '../facilities/kinds'
import { formatDistance, formatDuration } from '../lib/format'
import { BaseLayers } from '../map/BaseLayers'
import { inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { MapLayers } from '../map/MapLayers'
import { type NearbyResult, useNearest } from '../nearby/api'
import { NearbyLayer } from '../nearby/NearbyLayer'

/** The kind from the address, or hospitals. */
function parseKind(value: string | null): FacilityKind {
  return (FACILITY_KINDS as readonly string[]).includes(value ?? '') ? value as FacilityKind : 'hospital'
}

/** A dropped-pin origin from the address (?lat=&lon=), if any. */
function parseOrigin(params: URLSearchParams) {
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  return params.has('lat') && params.has('lon') && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/** Whether a place ranks lower by road than another that is further away in a straight line. */
function furtherByRoad(results: NearbyResult[], index: number): boolean {
  return results.slice(0, index).some((better) => better.straight_line_m > results[index].straight_line_m)
}

type CardProps = { result: NearbyResult; rank: number; selected: boolean; onSelect: () => void; directions: string }

/** One result: rank, name, road distance and time, straight-line distance, and actions when selected. */
function ResultCard({ result, rank, selected, onSelect, directions, note }: CardProps & { note: boolean }) {
  const info = kindInfo(result.facility.kind)
  const name = result.facility.name ?? info.label
  return (
    <li>
      <div className={`rounded-xl border p-3 ${selected ? 'border-primary/40 bg-surface-tint-light' : 'border-border-muted bg-surface-container-lowest'}`}>
        <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full items-center gap-3 text-left">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full text-label-lg text-white ${info.badge}`}>{rank}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-title-md text-on-surface">{name}</span>
              {rank === 1 && <span className="shrink-0 rounded-full bg-tertiary-fixed/60 px-2 py-0.5 text-label-sm text-tertiary">Nearest</span>}
            </span>
            <span className="block text-body-md text-on-surface tabular-nums">
              {formatDistance(result.distance_m)} · {formatDuration(result.duration_s)} by road
            </span>
          </span>
          <span className="shrink-0 text-right text-body-sm text-text-secondary tabular-nums">
            {formatDistance(result.straight_line_m)}<br />straight
          </span>
        </button>
        {note && (
          <p className="mt-2 flex items-center gap-1.5 text-body-sm text-hazard-accident-orange">
            <Icon name="alt_route" className="text-[16px]" /> Closer in a straight line, but further by road
          </p>
        )}
        {selected && (
          <div className="mt-3 flex gap-2 *:shrink-0">
            <Link to={directions} className={`${buttonClass('primary')} h-10 px-4`}>
              <Icon name="directions" className="text-[18px]" /> Directions
            </Link>
            <Link to={`/place/${result.facility.id}`} className={`${buttonClass('secondary')} h-10 px-4`}>Details</Link>
          </div>
        )}
      </div>
    </li>
  )
}

/** Screen 9: the nearest hospitals, police, pharmacies or fire stations by road, around verified closures. */
export function NearbyPage() {
  const [params, setParams] = useSearchParams()
  const kind = parseKind(params.get('kind'))
  const pin = parseOrigin(params)
  const { location, locate, locateStatus } = useAppMap()
  const here = location && inDistrict(location.lat, location.lon) ? location : null
  const origin = pin ?? here
  const outside = origin !== null && !inDistrict(origin.lat, origin.lon)
  const nearest = useNearest(outside ? null : origin, kind)
  const [selected, setSelected] = useState(0)
  const [shownFor, setShownFor] = useState(nearest.data)
  if (shownFor !== nearest.data) {  // new results: select the nearest again
    setShownFor(nearest.data)
    setSelected(0)
  }

  const setKind = (value: FacilityKind) => {
    const next = new URLSearchParams(params)
    if (value === 'hospital') next.delete('kind')
    else next.set('kind', value)
    setParams(next, { replace: true })
  }

  const results = nearest.data?.results ?? []
  const fromParam = pin ? `from=${pin.lat.toFixed(6)},${pin.lon.toFixed(6)}&fromName=${encodeURIComponent('Dropped pin')}&` : ''
  const directions = (result: NearbyResult) => `/directions?${fromParam}to=${result.facility.lat.toFixed(6)},${
    result.facility.lon.toFixed(6)}&name=${encodeURIComponent(result.facility.name ?? kindInfo(result.facility.kind).label)}`

  return (
    <>
      <title>Nearby · Sarathi</title>
      <BaseLayers compact />
      {origin && !outside && (
        <MapLayers><NearbyLayer origin={origin} results={results} selected={selected} onSelect={setSelected} /></MapLayers>
      )}

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-on-surface">Nearest by road</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-body-sm text-text-secondary">
            <Icon name="verified_user" className="text-[16px] text-tertiary" /> Ranked by real road distance, around verified closures
          </p>
        </div>
        {origin && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-label-md text-on-surface-variant">
            <Icon name={pin ? 'location_on' : 'my_location'} className="text-[16px]" /> {pin ? 'From pin' : 'From you'}
          </span>
        )}
      </header>

      <div role="radiogroup" aria-label="Kind of place" className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] *:shrink-0">
        {FACILITY_KINDS.map((value) => {
          const { plural, icon, chip } = KINDS[value]
          const on = value === kind
          return (
            <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setKind(value)}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-label-lg ${
                on ? chip : 'border-border-muted bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'}`}>
              <Icon name={icon} filled={on} className="text-[18px]" /> {plural}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {!origin && (
          <Alert>
            {locateStatus === 'locating'
              ? 'Finding your location…'
              : 'Share your location to find what is nearest to you, or press and hold the map to drop a pin.'}
            {locateStatus !== 'locating' && (
              <button type="button" onClick={() => locate({ moveMap: false })} className="mt-1 block text-label-lg text-primary">
                Use my location
              </button>
            )}
          </Alert>
        )}
        {outside && <Alert tone="error">This spot is outside Kathmandu District. Sarathi has roads for the district only.</Alert>}
        {origin && !outside && nearest.isPending && (
          <div className="space-y-2" aria-label="Finding the nearest places">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container" />)}
          </div>
        )}
        {nearest.isError && (
          <Alert tone="error">
            {nearest.error instanceof ApiError && nearest.error.status === 422
              ? 'This spot is too far from any road. Choose a point on or near a road.'
              : describeError(nearest.error)}
          </Alert>
        )}
        {nearest.data && !results.length && (
          <Alert>No {KINDS[kind].plural.toLowerCase()} can be reached by road from here right now.</Alert>
        )}
        {results.length > 0 && (
          <ol className="space-y-2" aria-label={`Nearest ${KINDS[kind].plural.toLowerCase()}`}>
            {results.map((result, index) => (
              <ResultCard key={result.facility.id} result={result} rank={index + 1} selected={index === selected}
                onSelect={() => setSelected(index)} directions={directions(result)} note={furtherByRoad(results, index)} />
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
