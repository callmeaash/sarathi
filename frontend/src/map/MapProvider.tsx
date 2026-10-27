import type { Map as LeafletMap } from 'leaflet'
import { type ReactNode, useCallback, useMemo, useState } from 'react'

import { DISTRICT_BOUNDS, LOCATE_ZOOM, inDistrict } from './config'
import { type LocateStatus, MapContext, type MapState, type UserLocation } from './context'
import { LOCATE_OPTIONS, NO_GEOLOCATION, OUTSIDE_DISTRICT, locationErrorMessage } from './locate'

/** Holds the one Leaflet map the app shares between pages, plus the user's location. */
export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locateStatus, setLocateStatus] = useState<LocateStatus>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocateStatus('error')
      setNotice(NO_GEOLOCATION)
      return
    }
    setLocateStatus('locating')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const found = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }
        setLocation(found)
        setLocateStatus('found')
        if (inDistrict(found.lat, found.lon)) {
          setNotice(null)
          map?.flyTo([found.lat, found.lon], Math.max(map.getZoom(), LOCATE_ZOOM))
        } else {
          setNotice(OUTSIDE_DISTRICT)
          map?.fitBounds(DISTRICT_BOUNDS)
        }
      },
      (error) => {
        setLocateStatus('error')
        setNotice(locationErrorMessage(error.code))
      },
      LOCATE_OPTIONS,
    )
  }, [map])

  const value = useMemo<MapState>(() => ({
    map, setMap, location, locateStatus, locate, notice, showNotice: setNotice,
  }), [map, location, locateStatus, locate, notice])

  return <MapContext value={value}>{children}</MapContext>
}
