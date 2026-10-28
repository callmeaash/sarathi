import { useCallback, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { buttonClass } from '../components/form/buttonStyles'
import { BaseLayers } from '../map/BaseLayers'
import { inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { MapLayers } from '../map/MapLayers'
import { PinMarker } from '../map/PinMarker'
import { useNearestRoad } from '../map/roads'
import type { LatLon } from '../report/CenterPin'
import { DetailsStep } from '../report/DetailsStep'
import { LocationStep } from '../report/LocationStep'

/** A point from the address (?lat=&lon=), if it's a real one. */
function pointFrom(params: URLSearchParams): LatLon | null {
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const valid = params.has('lat') && params.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  return valid ? { lat, lon } : null
}

/** Shown instead of the form until the reporter's email is confirmed. */
function VerifyFirst({ email }: { email: string }) {
  return (
    <div className="py-6 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-fixed text-primary">
        <Icon name="mark_email_unread" className="text-[28px]" />
      </span>
      <h1 className="mt-4 text-headline-sm">Verify your email to report hazards</h1>
      <p className="mx-auto mt-2 max-w-xs text-body-md text-text-secondary">
        Confirmed accounts keep reports trustworthy. Enter the code we emailed you, or ask for a new one.
      </p>
      <Link to={`/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent('/report')}`}
        className={`${buttonClass('primary')} mt-5`}>Verify email</Link>
    </div>
  )
}

/** Screens 11 and 12: report a hazard in two steps; the spot and step live in the address. */
export function ReportPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { location } = useAppMap()
  const chosen = pointFrom(params)
  const details = params.get('step') === 'details' && chosen !== null
  const [point, setPoint] = useState<LatLon | null>(chosen)
  const here = location && inDistrict(location.lat, location.lon) ? location : null
  const [start] = useState<LatLon | null>(() => chosen ?? here)
  const onMove = useCallback((next: LatLon) => setPoint(next), [])
  const { data: road } = useNearestRoad(details ? chosen : null)

  if (user && !user.email_verified) return <><title>Report a hazard · Sarathi</title><VerifyFirst email={user.email} /></>

  const goTo = (step: 'location' | 'details') => {
    const next = new URLSearchParams()
    const spot = step === 'details' ? point : chosen ?? point
    if (spot) {
      next.set('lat', spot.lat.toFixed(6))
      next.set('lon', spot.lon.toFixed(6))
    }
    if (step === 'details') next.set('step', 'details')
    setParams(next, { replace: step === 'location' })
  }

  return (
    <>
      <title>Report a hazard · Sarathi</title>
      <BaseLayers />
      {details && <MapLayers><PinMarker lat={chosen.lat} lon={chosen.lon} onMove={() => goTo('location')} /></MapLayers>}
      {details
        ? <DetailsStep point={chosen} roadName={road?.road_name} onBack={() => goTo('location')}
            onSubmitted={(id) => navigate(`/report/submitted/${id}`, { replace: true })} />
        : <LocationStep point={point} start={start} onMove={onMove} onNext={() => goTo('details')} />}
    </>
  )
}
