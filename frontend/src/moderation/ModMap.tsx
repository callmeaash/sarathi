import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import {
  AttributionControl, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, useMap,
} from 'react-leaflet'

import { iconHtml } from '../components/icons'
import { hazardInfo } from '../hazards/kinds'
import { MAX_ZOOM, MIN_ZOOM, PANNING_BOUNDS, START_VIEW, TILES } from '../map/config'

export type MapPoint = {
  id: number; lat: number; lon: number; kind: string; status: string; title: string; selected?: boolean
  onClick?: () => void
}
type Lines = { key: string; geometry: object; tone: 'closed' | 'preview' }

type ModMapProps = {
  points: MapPoint[]
  lines?: Lines[]
  dropped?: { lat: number; lon: number; snapped: { lat: number; lon: number } }  // where the reporter put the pin
  focusKey: string  // the map re-centres on its contents when this changes
  className?: string
}

const icons = new Map<string, L.DivIcon>()

/** The same hazard badge as the public map: red when verified, amber while pending, grey once decided. */
function badge(kind: string, status: string, selected: boolean): L.DivIcon {
  const key = `${kind}:${status}:${selected}`
  let icon = icons.get(key)
  if (!icon) {
    const size = selected ? 40 : 30
    const tone = status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : 'done'
    icon = L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<span class="hazard-pin hazard-pin--${tone}${selected ? ' is-selected' : ''}">${iconHtml(hazardInfo(kind).icon)}</span>`,
    })
    icons.set(key, icon)
  }
  return icon
}

/** Moves the view to show everything on the map whenever the subject changes. */
function Fit({ points, focusKey }: { points: MapPoint[]; focusKey: string }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const chosen = points.filter((point) => point.selected)
    const bounds = L.latLngBounds((chosen.length ? chosen : points).map((point) => [point.lat, point.lon]))
    if (chosen.length) map.setView(bounds.getCenter(), 17, { animate: false })
    else map.fitBounds(bounds.pad(0.2), { maxZoom: 15, animate: false })
    // Only when the subject changes: the moderator stays free to pan and zoom while data refreshes.
  }, [map, focusKey])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

const LINE_STYLE = {
  closed: { color: '#dc2626', weight: 6, opacity: 0.9 },
  preview: { color: '#dc2626', weight: 6, opacity: 0.85, dashArray: '2 10', lineCap: 'round' as const },
}

/** A small map for the moderator panel: hazard badges, the roads a closure covers, and the reporter's pin. */
export function ModMap({ points, lines = [], dropped, focusKey, className = '' }: ModMapProps) {
  const sorted = useMemo(() => [...points].sort((a, b) => Number(a.selected ?? false) - Number(b.selected ?? false)), [points])
  return (
    <div data-base-map="street" className={`relative isolate overflow-hidden rounded-xl border border-border-muted ${className}`}>
      <MapContainer center={START_VIEW.center} zoom={START_VIEW.zoom} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
        maxBounds={PANNING_BOUNDS} scrollWheelZoom={false} attributionControl={false} className="size-full">
        <AttributionControl position="bottomright" prefix={false} />
        <TileLayer url={TILES.url} attribution={TILES.attribution} maxZoom={MAX_ZOOM} />
        <ScaleControl position="bottomleft" imperial={false} />
        <Fit points={points} focusKey={focusKey} />
        {lines.map((line) => (
          <GeoJSON key={line.key} data={line.geometry as GeoJSON.GeoJsonObject} style={LINE_STYLE[line.tone]} interactive={false} />
        ))}
        {dropped && (
          <>
            <Polyline positions={[[dropped.lat, dropped.lon], [dropped.snapped.lat, dropped.snapped.lon]]}
              pathOptions={{ color: '#0f172a', weight: 2, dashArray: '4 6' }} interactive={false} />
            <CircleMarker center={[dropped.lat, dropped.lon]} radius={6}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0f172a', fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -6]}>Where the reporter put the pin</Tooltip>
            </CircleMarker>
          </>
        )}
        {sorted.map((point) => (
          <Marker key={point.id} position={[point.lat, point.lon]} icon={badge(point.kind, point.status, !!point.selected)}
            title={point.title} zIndexOffset={point.selected ? 1000 : 0}
            eventHandlers={point.onClick ? { click: point.onClick } : undefined} />
        ))}
      </MapContainer>
    </div>
  )
}
