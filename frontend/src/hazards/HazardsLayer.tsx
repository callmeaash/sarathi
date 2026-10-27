import L from 'leaflet'
import { Marker, Polyline } from 'react-leaflet'
import { useNavigate } from 'react-router'

import { useClosures } from '../api/closures'
import { useLayers } from '../map/layers'
import { useIncidents } from './api'
import { hazardInfo, roadLabel } from './kinds'

const icons = new Map<string, L.DivIcon>()

/** Rounded-square badge for a hazard: red when verified, amber while waiting for review. */
function hazardIcon(kind: string, status: string, selected: boolean): L.DivIcon {
  const key = `${kind}:${status}:${selected}`
  let icon = icons.get(key)
  if (!icon) {
    const size = selected ? 42 : 30
    icon = L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span class="hazard-pin hazard-pin--${status}${selected ? ' is-selected' : ''}">`
        + `<span class="icon icon-filled">${hazardInfo(kind).icon}</span></span>`,
    })
    icons.set(key, icon)
  }
  return icon
}

type LineGeometry = { type: 'LineString'; coordinates: number[][] } | { type: 'MultiLineString'; coordinates: number[][][] }

/** Leaflet positions ([lat, lon]) for a GeoJSON line or set of lines. */
function linePositions(geometry: LineGeometry): [number, number][][] {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
  return lines.map((line) => line.map(([lon, lat]) => [lat, lon] as [number, number]))
}

const CLOSED_ROAD = { color: '#c62828', weight: 8, opacity: 0.9, lineCap: 'round' as const }
const CLOSED_DASH = { color: '#ffffff', weight: 3, opacity: 0.95, dashArray: '6 10', lineCap: 'butt' as const }

/** Closed roads as red-and-white dashed lines, and hazard badges; tapping a badge opens the hazard. */
export function HazardsLayer({ selectedId }: { selectedId?: number }) {
  const layers = useLayers()
  const navigate = useNavigate()
  const { data: closures } = useClosures()
  const { data: incidents } = useIncidents(['pending', 'verified'])

  const shownIncidents = (incidents ?? []).filter((incident) => incident.id === selectedId
    || (incident.status === 'verified' ? layers.closures : layers.reports))

  return (
    <>
      {layers.closures && (closures ?? []).filter((closure) => closure.geometry).map((closure) => {
        const positions = linePositions(closure.geometry as LineGeometry)
        return [
          <Polyline key={`${closure.incident_id}:road`} positions={positions} pathOptions={CLOSED_ROAD} interactive={false} />,
          <Polyline key={`${closure.incident_id}:dash`} positions={positions} pathOptions={CLOSED_DASH} interactive={false} />,
        ]
      })}
      {shownIncidents.map((incident) => {
        const selected = incident.id === selectedId
        const title = `${hazardInfo(incident.kind).label} · ${roadLabel(incident.road_name)}`
        return (
          <Marker
            key={`${incident.id}:${incident.status}:${selected}`}
            position={[incident.lat, incident.lon]}
            icon={hazardIcon(incident.kind, incident.status, selected)}
            title={title}
            alt={title}
            zIndexOffset={selected ? 2000 : 500}  // hazards above facilities
            eventHandlers={{ click: () => navigate(`/hazards/${incident.id}`) }}
          />
        )
      })}
    </>
  )
}
