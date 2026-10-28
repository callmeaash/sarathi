import { type ReactNode, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { buttonClass } from '../components/form/buttonStyles'
import { BaseLayers } from '../map/BaseLayers'
import { inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { focusOn } from '../map/focus'
import { MapLayers } from '../map/MapLayers'
import { PinMarker } from '../map/PinMarker'
import { useNearestRoad } from '../map/roads'

const MAX_REPORT_DISTANCE_M = 150  // the API only accepts hazards this close to a road

/** Read and check the pin position from the address. */
function usePin() {
  const [params] = useSearchParams()
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const valid = params.has('lat') && params.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  return valid ? { lat, lon } : null
}

/** An action row: icon, title, explanation, and a chevron when it leads somewhere. */
function ActionRow({ icon, tint, title, sub, to, onClick, disabled }: {
  icon: string; tint: string; title: ReactNode; sub: ReactNode; to?: string; onClick?: () => void; disabled?: boolean
}) {
  const body = (
    <>
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tint}`}><Icon name={icon} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-title-md">{title}</span>
        <span className="block text-body-sm text-text-secondary">{sub}</span>
      </span>
      {!disabled && <Icon name="chevron_right" className="text-on-surface-variant" />}
    </>
  )
  const style = `flex w-full items-center gap-3 rounded-xl bg-surface-container-low p-3 text-left ${
    disabled ? 'opacity-60' : 'hover:bg-surface-container'}`
  if (to && !disabled) return <Link to={to} className={style}>{body}</Link>
  return <button type="button" onClick={onClick} disabled={disabled} className={style}>{body}</button>
}

/** Screen 6: a dropped pin and what can be done from that spot. */
export function PinPage() {
  const pin = usePin()
  const navigate = useNavigate()
  const { map, showNotice } = useAppMap()
  const inside = pin !== null && inDistrict(pin.lat, pin.lon)
  const { data: road, isPending: roadPending } = useNearestRoad(inside ? pin : null)
  const shownOnce = useRef(false)

  useEffect(() => {  // a pin opened from a link may be off-screen; bring it into view once
    if (!map || !pin || shownOnce.current) return
    shownOnce.current = true
    if (!map.getBounds().contains([pin.lat, pin.lon])) focusOn(map, [pin.lat, pin.lon], Math.max(map.getZoom(), 15))
  }, [map, pin])

  if (!pin) {
    return (
      <div className="py-8 text-center">
        <title>No pin · Sarathi</title>
        <h1 className="text-headline-sm">No pin to show</h1>
        <p className="mt-2 text-body-md text-text-secondary">Press and hold the map to drop one.</p>
        <Link to="/" className={`${buttonClass('primary')} mt-6`}>Back to the map</Link>
      </div>
    )
  }

  const { lat, lon } = pin
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  const here = `${lat.toFixed(6)},${lon.toFixed(6)}`
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`
  const move = (newLat: number, newLon: number) =>
    navigate(`/pin?lat=${newLat.toFixed(6)}&lon=${newLon.toFixed(6)}`, { replace: true })
  const nearRoad = road && road.distance_m <= MAX_REPORT_DISTANCE_M

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coords)
      showNotice('Coordinates copied.')
    } catch {
      showNotice("Couldn't copy the coordinates.")
    }
  }
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'Location', text: coords, url: osmUrl }).catch(() => undefined)
    else {
      try {
        await navigator.clipboard.writeText(`${coords} ${osmUrl}`)
        showNotice('Location link copied.')
      } catch {
        showNotice("Couldn't copy the location.")
      }
    }
  }

  let place: ReactNode = 'Finding the nearest road…'
  if (!inside) place = 'Outside Kathmandu District'
  else if (!roadPending) place = road ? `Near ${road.road_name ?? 'an unnamed road'}` : 'No road nearby'

  return (
    <>
      <title>Dropped pin · Sarathi</title>
      <BaseLayers />
      <MapLayers><PinMarker lat={lat} lon={lon} onMove={move} /></MapLayers>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-headline-md text-on-surface">Dropped pin</h1>
          <p className="mt-1 flex items-center gap-1.5 text-body-md text-text-secondary">
            <Icon name="location_on" className="text-[18px]" />
            <span>{place} · <span className="tabular-nums">{coords}</span></span>
          </p>
        </div>
        <button type="button" onClick={() => navigate('/')} aria-label="Remove pin"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container hover:bg-surface-container-high">
          <Icon name="close" />
        </button>
      </div>

      {inside ? (
        <div className="mt-5 flex gap-2 overflow-x-auto [scrollbar-width:none] *:shrink-0">
          <Link to={`/directions?to=${here}&name=${encodeURIComponent('Dropped pin')}`} className={buttonClass('primary')}>
            <Icon name="directions" className="text-[20px]" /> Directions
          </Link>
          <Link to={`/directions?from=${here}`} className={buttonClass('secondary')}>
            <Icon name="navigation" className="text-[20px]" /> Start here
          </Link>
          <Link to={`/nearby?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`} className={buttonClass('secondary')}>
            <Icon name="local_hospital" className="text-[20px] text-facility-hospital-pink" /> Nearest hospital
          </Link>
        </div>
      ) : (
        <div className="mt-5">
          <Alert>This spot is outside Kathmandu District. Sarathi has road data for the district only.</Alert>
        </div>
      )}

      <div className="mt-5 space-y-2 border-t border-border-muted pt-5">
        {inside && (
          <ActionRow icon="add_location_alt" tint="bg-error-container text-hazard-closure-red"
            title={<span className="text-hazard-closure-red">Report a hazard here</span>}
            sub={nearRoad || roadPending ? 'Flood, landslide, accident or blocked road'
              : `Move the pin onto a road first (within ${MAX_REPORT_DISTANCE_M} m)`}
            to={`/report?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`} disabled={!roadPending && !nearRoad} />
        )}
        <ActionRow icon="share" tint="bg-surface-tint-medium text-primary" title="Share location"
          sub="Send this spot in a message or chat" onClick={share} />
        <ActionRow icon="content_copy" tint="bg-surface-container text-on-surface-variant" title="Copy coordinates"
          sub={coords} onClick={copy} />
      </div>
      <p className="mt-4 text-body-sm text-text-secondary">Drag the pin to adjust the spot.</p>
    </>
  )
}
