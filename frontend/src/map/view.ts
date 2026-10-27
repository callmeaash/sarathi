import type { LatLngTuple } from 'leaflet'

import { storage } from '../lib/storage'
import { MAX_ZOOM, MIN_ZOOM, START_VIEW, inDistrict } from './config'

const VIEW_KEY = 'sarathi.mapView'

export type MapViewState = { center: LatLngTuple; zoom: number }

/** Where the map was looking last time, if it's still inside the district; otherwise central Kathmandu. */
export function savedView(): MapViewState {
  try {
    const view = JSON.parse(storage.get(VIEW_KEY) ?? '')
    if (inDistrict(view.lat, view.lon) && view.zoom >= MIN_ZOOM && view.zoom <= MAX_ZOOM) {
      return { center: [view.lat, view.lon], zoom: view.zoom }
    }
  } catch {
    // nothing saved, or saved by an older version
  }
  return START_VIEW
}

/** Remember where the map is looking. */
export function saveView(lat: number, lon: number, zoom: number): void {
  storage.set(VIEW_KEY, JSON.stringify({ lat, lon, zoom }))
}
