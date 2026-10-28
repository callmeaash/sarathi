import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { CircleMarker, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'

import { showAll } from '../map/focus'
import { ROUTE_LINE_PANE, ROUTE_MARKER_PANE, ensureRoutePanes } from '../map/RoutePanes'
import type { Route } from './api'
import type { Point } from './params'

const END_PIN = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 42],
  html: '<span class="drop-pin drop-pin--route"><span class="icon icon-filled">location_on</span></span>',
})

const CASING = { color: '#ffffff', weight: 10, opacity: 0.9, lineCap: 'round' as const, lineJoin: 'round' as const }
const LINE = { color: '#1f55e0', weight: 6, opacity: 0.95, lineCap: 'round' as const, lineJoin: 'round' as const }

type RouteLayerProps = { route: Route | undefined; from: Point | null; to: Point | null }

/** The route line (blue with a white edge), the start dot and the destination pin; fits the route in view once. */
export function RouteLayer({ route, from, to }: RouteLayerProps) {
  const map = useMap()
  ensureRoutePanes(map)  // before the layers below mount into them
  const fitted = useRef<string | null>(null)
  const positions = (route?.geometry.coordinates ?? []).map(([lon, lat]) => [lat, lon] as [number, number])
  const key = route ? `${route.edge_ids.length}:${route.distance_m}` : null

  useEffect(() => {  // fit each new route once; after that the user is free to pan and zoom
    if (!key || fitted.current === key || positions.length < 2) return
    fitted.current = key
    showAll(map, positions, 17)
  }, [key, map, positions])

  return (
    <>
      {positions.length > 1 && (
        <Polyline positions={positions} pathOptions={CASING} interactive={false} pane={ROUTE_LINE_PANE} />
      )}
      {positions.length > 1 && (
        <Polyline positions={positions} pathOptions={LINE} interactive={false} pane={ROUTE_LINE_PANE} />
      )}
      {from && (
        <CircleMarker center={[from.lat, from.lon]} radius={8} interactive={false} pane={ROUTE_MARKER_PANE}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1f55e0', fillOpacity: 1 }} />
      )}
      {to && <Marker position={[to.lat, to.lon]} icon={END_PIN} interactive={false} pane={ROUTE_MARKER_PANE} />}
    </>
  )
}

/** While choosing a point on the map, the next tap sets it. */
export function MapPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) })
  const map = useMap()
  useEffect(() => {  // show a crosshair while picking
    const container = map.getContainer()
    container.style.cursor = 'crosshair'
    return () => { container.style.cursor = '' }
  }, [map])
  return null
}
