import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMap, useMapEvents } from 'react-leaflet'

import { coveredBottom, coveredTop } from '../map/focus'

export type LatLon = { lat: number; lon: number }

/**
 * A pin fixed in the middle of the visible map (above the phone's sheet); moving the map moves the spot under it.
 * Reports the spot whenever the map stops moving or the sheet changes height.
 */
export function CenterPin({ onMove }: { onMove: (point: LatLon) => void }) {
  const map = useMap()

  const report = useCallback(() => {
    const size = map.getSize()
    if (!size.x || !size.y) return  // not laid out yet
    const top = coveredTop(map)
    const spot = map.containerPointToLatLng([size.x / 2, top + (size.y - top - coveredBottom(map)) / 2])
    onMove({ lat: spot.lat, lon: spot.lng })
  }, [map, onMove])

  useMapEvents({ moveend: report })

  useEffect(() => {
    report()
    const sheet = document.querySelector('[data-map-sheet]')
    if (!sheet || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(report)
    observer.observe(sheet)
    return () => observer.disconnect()
  }, [report])

  return createPortal(
    <div className="report-center-pin" aria-hidden>
      <span className="icon icon-filled">location_on</span>
      <span className="report-center-pin__dot" />
    </div>,
    map.getContainer(),
  )
}
