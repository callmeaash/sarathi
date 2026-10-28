import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'

// Extent of the imported road network (Kathmandu District), from the road_nodes table.
export const DISTRICT = { west: 85.1701, south: 27.56, east: 85.5914, north: 27.8406 }

export const DISTRICT_BOUNDS: LatLngBoundsExpression = [[DISTRICT.south, DISTRICT.west], [DISTRICT.north, DISTRICT.east]]
// A little room around the district, so its edges can be centred on screen.
const PAD = 0.06
export const PANNING_BOUNDS: LatLngBoundsExpression = [
  [DISTRICT.south - PAD, DISTRICT.west - PAD], [DISTRICT.north + PAD, DISTRICT.east + PAD],
]

export const START_VIEW = { center: [27.7056, 85.32] as LatLngTuple, zoom: 13 }  // central Kathmandu
export const MIN_ZOOM = 11
export const MAX_ZOOM = 19
export const LOCATE_ZOOM = 16

// The map background: pre-drawn image tiles. Stadia's "OSM Bright" is drawn from OpenStreetMap (the same data as
// Sarathi's roads) with English/Latin labels; OpenStreetMap's own tiles label Nepal in Devanagari only.
// It works on localhost without an account; a deployed site needs a free Stadia key (VITE_STADIA_API_KEY) or its
// domain registered with Stadia. VITE_MAP_TILES_URL replaces the style entirely.
const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY
export const TILES = {
  url: import.meta.env.VITE_MAP_TILES_URL
    ?? `https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png${STADIA_KEY ? `?api_key=${STADIA_KEY}` : ''}`,
  attribution: import.meta.env.VITE_MAP_ATTRIBUTION
    ?? '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> '
    + '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

/** Whether a point is inside the area Sarathi has roads for. */
export function inDistrict(lat: number, lon: number): boolean {
  return lat >= DISTRICT.south && lat <= DISTRICT.north && lon >= DISTRICT.west && lon <= DISTRICT.east
}
