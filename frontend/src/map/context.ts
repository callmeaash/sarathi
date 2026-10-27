import type { Map as LeafletMap } from 'leaflet'
import { createContext, useContext } from 'react'

export type UserLocation = { lat: number; lon: number; accuracy: number }

export type LocateStatus = 'idle' | 'locating' | 'found' | 'error'

export type MapState = {
  map: LeafletMap | null
  setMap: (map: LeafletMap | null) => void
  location: UserLocation | null
  locateStatus: LocateStatus
  locate: () => void
  notice: string | null
  showNotice: (message: string | null) => void
}

export const MapContext = createContext<MapState | null>(null)

/** The shared map, the user's location and map notices. */
export function useAppMap(): MapState {
  const state = useContext(MapContext)
  if (!state) throw new Error('useAppMap must be used inside MapProvider')
  return state
}
