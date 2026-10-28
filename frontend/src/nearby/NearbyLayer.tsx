import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { CircleMarker, Marker, Polyline, useMap } from 'react-leaflet'

import { showAll } from '../map/focus'
import type { NearbyResult } from './api'

const icons = new Map<string, L.DivIcon>()

/** A numbered badge in the facility kind's colour; the selected one is larger. */
function rankIcon(rank: number, kind: string, selected: boolean): L.DivIcon {
  const key = `${rank}:${kind}:${selected}`
  let icon = icons.get(key)
  if (!icon) {
    const size = selected ? 38 : 30
    icon = L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span class="facility-pin facility-pin--${kind} rank-pin${selected ? ' is-selected' : ''}">${rank}</span>`,
    })
    icons.set(key, icon)
  }
  return icon
}

const CASING = { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round' as const, lineJoin: 'round' as const }
const LINE = { color: '#1f55e0', weight: 5, opacity: 0.95, lineCap: 'round' as const, lineJoin: 'round' as const }

type NearbyLayerProps = {
  origin: { lat: number; lon: number }
  results: NearbyResult[]
  selected: number
  onSelect: (index: number) => void
}

/** The search origin, numbered result badges and the selected result's road route; fits them in view once. */
export function NearbyLayer({ origin, results, selected, onSelect }: NearbyLayerProps) {
  const map = useMap()
  const fitted = useRef<string | null>(null)
  const key = `${origin.lat},${origin.lon}:${results.map((result) => result.facility.id).join(',')}`

  useEffect(() => {  // fit each new set of results once
    if (!results.length || fitted.current === key) return
    fitted.current = key
    showAll(map, [[origin.lat, origin.lon], ...results.map((r) => [r.facility.lat, r.facility.lon] as [number, number])], 16)
  }, [key, map, origin, results])

  const route = results[selected]?.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]) ?? []
  return (
    <>
      {route.length > 1 && <Polyline positions={route} pathOptions={CASING} interactive={false} />}
      {route.length > 1 && <Polyline positions={route} pathOptions={LINE} interactive={false} />}
      <CircleMarker center={[origin.lat, origin.lon]} radius={8} interactive={false}
        pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1f55e0', fillOpacity: 1 }} />
      {results.map((result, index) => (
        <Marker
          key={`${result.facility.id}:${index === selected}`}
          position={[result.facility.lat, result.facility.lon]}
          icon={rankIcon(index + 1, result.facility.kind, index === selected)}
          title={`${index + 1}. ${result.facility.name ?? 'Unnamed'}`}
          zIndexOffset={index === selected ? 2000 : 1000 - index}
          eventHandlers={{ click: () => onSelect(index) }}
        />
      ))}
    </>
  )
}
