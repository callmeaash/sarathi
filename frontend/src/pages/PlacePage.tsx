import { type ReactNode, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { ApiError, type Schemas } from '../api/client'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { buttonClass } from '../components/form/buttonStyles'
import { useFacility } from '../facilities/api'
import { kindInfo } from '../facilities/kinds'
import { formatDistance, formatDuration, formatOpeningHours } from '../lib/format'
import { LOCATE_ZOOM, inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { focusOn, showAll } from '../map/focus'
import { BaseLayers } from '../map/BaseLayers'

type Facility = Schemas['FacilityDetail']

/** One row of details: an icon, a main line, a secondary line, and an optional action on the right. */
function Row({ icon, children, sub, action }: { icon: string; children: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant">
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-title-md text-on-surface">{children}</div>
        {sub && <div className="text-body-md text-text-secondary">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/** Road distance from the user, or a way to get it. */
function RoadDistance({ facility, loading, onLocate }: { facility: Facility; loading: boolean; onLocate: () => void }) {
  const { location, locateStatus } = useAppMap()
  if (!location || !inDistrict(location.lat, location.lon)) {
    return (
      <Row icon="directions_car" sub="See how far it is by road from where you are.">
        <button type="button" onClick={onLocate} disabled={locateStatus === 'locating'}
          className="text-label-lg text-primary disabled:opacity-60">
          {locateStatus === 'locating' ? 'Finding you…' : 'Show distance from me'}
        </button>
      </Row>
    )
  }
  if (loading && !facility.road) return <Row icon="directions_car">Working out the road distance…</Row>
  if (!facility.road) {
    return <Row icon="block" sub="Closed roads may be cutting it off.">No open road route from your location</Row>
  }
  const { distance_m, duration_s, straight_line_m } = facility.road
  return (
    <Row icon="directions_car" sub={`${formatDistance(straight_line_m)} in a straight line`}>
      {formatDistance(distance_m)} · {formatDuration(duration_s)} by road
    </Row>
  )
}

/** Copy text to the clipboard, saying so on the map. */
function useCopy() {
  const { showNotice } = useAppMap()
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showNotice(`${what} copied.`)
    } catch {
      showNotice(`Couldn't copy the ${what.toLowerCase()}.`)
    }
  }
}

/** The place's details once loaded. */
function Details({ facility, loadingDistance, onLocate }: { facility: Facility; loadingDistance: boolean; onLocate: () => void }) {
  const copy = useCopy()
  const info = kindInfo(facility.kind)
  const name = facility.name ?? info.label
  const otherName = [facility.name_en, facility.name_ne].find((n) => n && n !== name)
  const osmUrl = facility.osm_type && facility.osm_id
    ? `https://www.openstreetmap.org/${facility.osm_type}/${facility.osm_id}` : null

  const share = async () => {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined)
    else await copy(url, 'Link')
  }

  return (
    <>
      <title>{`${name} · Sarathi`}</title>
      <h1 className="text-headline-md text-on-surface">{name}</h1>
      {otherName && <p className="text-body-md text-text-secondary">{otherName}</p>}
      <p className="mt-1 text-body-lg text-text-secondary">
        {[info.label, facility.address].filter(Boolean).join(' · ')}
      </p>
      {facility.emergency && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-tertiary-fixed/50 px-3 py-1 text-label-lg text-tertiary">
          <span className="size-2 rounded-full bg-open-green" aria-hidden /> Emergency services
        </p>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        <Link to={`/directions?to=${facility.lat},${facility.lon}&name=${encodeURIComponent(name)}`}
          className={buttonClass('primary')}>
          <Icon name="directions" className="text-[20px]" /> Directions
        </Link>
        {facility.phone && (
          <a href={`tel:${facility.phone.split(/[;,/]/)[0].replace(/[^\d+]/g, '')}`} className={buttonClass('tonal')}>
            <Icon name="call" className="text-[20px]" /> Call
          </a>
        )}
        <button type="button" onClick={share} className={buttonClass('tonal')}>
          <Icon name="share" className="text-[20px]" /> Share
        </button>
      </div>

      <div className="mt-4 divide-y divide-border-muted border-t border-border-muted">
        <RoadDistance facility={facility} loading={loadingDistance} onLocate={onLocate} />
        {facility.phone && (
          <Row icon="call" sub="Phone"
            action={<button type="button" onClick={() => copy(facility.phone!, 'Phone number')}
              className="pt-1 text-label-lg text-primary">Copy</button>}>
            {facility.phone}
          </Row>
        )}
        {facility.opening_hours && (
          <Row icon="schedule" sub="Opening hours">{formatOpeningHours(facility.opening_hours)}</Row>
        )}
        {osmUrl ? (
          <Row icon="public" sub={`From OpenStreetMap · ${facility.osm_type} ${facility.osm_id}`}
            action={<a href={osmUrl} target="_blank" rel="noreferrer" aria-label="Open in OpenStreetMap"
              className="grid size-10 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container">
              <Icon name="open_in_new" className="text-[20px]" />
            </a>}>
            OpenStreetMap
          </Row>
        ) : (
          <Row icon="verified" sub="Added by Sarathi">Sarathi</Row>
        )}
      </div>
    </>
  )
}

/** Screen 10: a facility's details, with the map centred on it. */
export function PlacePage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { map, location, locate } = useAppMap()
  const from = location && inDistrict(location.lat, location.lon) ? location : null
  const { data, error, isPending, isFetching } = useFacility(id, from)
  const centredOn = useRef<number | null>(null)

  useEffect(() => {  // centre the map on the place once per place, then leave the user free to pan
    if (!map || !data || data.id !== id || centredOn.current === id) return
    focusOn(map, [data.lat, data.lon], Math.max(map.getZoom(), LOCATE_ZOOM))
    centredOn.current = id
  }, [map, data, id])

  // After "Show distance from me", fit both the user and the place in view rather than flying to the user.
  const showBoth = useRef(false)
  const locateFromHere = () => {
    showBoth.current = true
    locate({ moveMap: false })
  }
  useEffect(() => {
    if (!showBoth.current || !map || !data || !from) return
    showBoth.current = false
    showAll(map, [[from.lat, from.lon], [data.lat, data.lon]], LOCATE_ZOOM)
  }, [map, data, from])

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))
  const notFound = !Number.isInteger(id) || (error instanceof ApiError && error.status === 404)

  return (
    <>
      <BaseLayers facilityId={id} />
      <button type="button" onClick={back}
        className="-ml-2 mb-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-label-lg text-primary hover:bg-surface-tint-light">
        <Icon name="arrow_back" className="text-[20px]" /> Back
      </button>
      {notFound ? (
        <div className="py-8 text-center">
          <title>Place not found · Sarathi</title>
          <h1 className="text-headline-sm">Place not found</h1>
          <p className="mt-2 text-body-md text-text-secondary">It may have been removed from the map data.</p>
        </div>
      ) : isPending ? (
        <Spinner label="Loading place" />
      ) : error || !data ? (
        <p role="alert" className="py-6 text-body-md text-error">Couldn't load this place. Check your connection.</p>
      ) : (
        <Details facility={data} loadingDistance={isFetching} onLocate={locateFromHere} />
      )}
    </>
  )
}
