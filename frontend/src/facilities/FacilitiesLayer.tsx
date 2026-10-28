import L from 'leaflet'
import { useMemo, useState } from 'react'
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useNavigate } from 'react-router'

import { useLayers } from '../map/layers'
import { useAllFacilities } from './api'
import { useShownKinds } from './filter'
import { kindInfo } from './kinds'

const icons = new Map<string, L.DivIcon>()

/** Small coloured dot for a facility, with a larger invisible area so it's still easy to tap. */
function dotIcon(kind: string): L.DivIcon {
  const key = `dot:${kind}`
  let icon = icons.get(key)
  if (!icon) {
    icon = L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      html: `<span class="facility-dot facility-pin--${kind}"></span>` })
    icons.set(key, icon)
  }
  return icon
}

/** Round coloured badge for a facility (the design gives facilities circles and hazards squares). */
function facilityIcon(kind: string, selected: boolean): L.DivIcon {
  const key = `${kind}:${selected}`
  let icon = icons.get(key)
  if (!icon) {
    const size = selected ? 40 : 28
    icon = L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span class="facility-pin facility-pin--${kind}${selected ? ' is-selected' : ''}">`
        + `<span class="icon icon-filled">${kindInfo(kind).icon}</span></span>`,
    })
    icons.set(key, icon)
  }
  return icon
}

const VIEW_PADDING = 0.25  // also draw markers a little beyond the edges, so panning doesn't show gaps
// Zoomed out, keep one marker of each kind per small square of screen, so the city isn't buried under badges.
const SHOW_ALL_FROM_ZOOM = 16
const CELL_PX = 60
// Below street level facilities are small dots, thinned to one per square of this size (any kind).
const BADGE_FROM_ZOOM = 15
const DOT_CELL_PX = 28
// Which kind keeps a crowded spot: hospitals first.
const KIND_ORDER: Record<string, number> = { hospital: 0, fire_station: 1, police: 2, pharmacy: 3 }

/** Facility markers for the shown kinds, drawn only around the visible area; tapping one opens its details. */
export function FacilitiesLayer({ selectedId, compact = false }: { selectedId?: number; compact?: boolean }) {
  const map = useMap()
  const navigate = useNavigate()
  const { data } = useAllFacilities()
  const kinds = useShownKinds()
  const { facilities: layerOn } = useLayers()
  const [view, setView] = useState(() => ({ bounds: map.getBounds().pad(VIEW_PADDING), zoom: map.getZoom() }))
  useMapEvents({ moveend: () => setView({ bounds: map.getBounds().pad(VIEW_PADDING), zoom: map.getZoom() }) })

  // Named places first, so they are the ones kept when markers are thinned out.
  const ordered = useMemo(() => [...(data ?? [])].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    || Number(!a.name) - Number(!b.name) || a.id - b.id), [data])
  // Dots on route pages (so the route stands out) and whenever the map is zoomed out.
  const dots = compact || view.zoom < BADGE_FROM_ZOOM

  const visible = useMemo(() => {
    const sized = map.getSize().x > 0  // before the map has a size every point would count as off-screen
    const taken = new Set<string>()
    return ordered.filter((facility) => {
      if (facility.id === selectedId) return true
      const shown = layerOn && (kinds as string[]).includes(facility.kind) && view.zoom >= kindInfo(facility.kind).minZoom
      if (!shown || (sized && !view.bounds.contains([facility.lat, facility.lon]))) return false
      if (!dots && view.zoom >= SHOW_ALL_FROM_ZOOM) return true
      const point = map.project([facility.lat, facility.lon], view.zoom)
      const cell = dots
        ? `${Math.floor(point.x / DOT_CELL_PX)}:${Math.floor(point.y / DOT_CELL_PX)}`
        : `${facility.kind}:${Math.floor(point.x / CELL_PX)}:${Math.floor(point.y / CELL_PX)}`
      if (taken.has(cell)) return false
      taken.add(cell)
      return true
    })
  }, [ordered, kinds, layerOn, view, selectedId, map, dots])

  return visible.map((facility) => {
    const selected = facility.id === selectedId
    const name = facility.name ?? kindInfo(facility.kind).label
    return (
      <Marker
        key={`${facility.id}:${selected}:${dots}`}
        position={[facility.lat, facility.lon]}
        icon={dots && !selected ? dotIcon(facility.kind) : facilityIcon(facility.kind, selected)}
        title={name}
        alt={name}
        zIndexOffset={selected ? 1000 : 0}
        eventHandlers={{ click: () => navigate(`/place/${facility.id}`) }}
      >
        <Tooltip direction="right" offset={[selected ? 22 : dots ? 10 : 16, 0]} permanent={selected} className="facility-label">
          {name}
        </Tooltip>
      </Marker>
    )
  })
}
