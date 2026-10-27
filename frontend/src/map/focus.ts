import L from 'leaflet'

const EDGE_PX = 48

/** How many pixels at the bottom of the map are hidden behind the phone's bottom sheet (0 on desktop). */
export function coveredBottom(map: L.Map): number {
  const sheet = document.querySelector<HTMLElement>('[data-map-sheet]')
  if (!sheet) return 0
  const mapBox = map.getContainer().getBoundingClientRect()
  const sheetBox = sheet.getBoundingClientRect()
  const sameColumn = sheetBox.left < mapBox.right && sheetBox.right > mapBox.left  // desktop: panel is beside the map
  return sameColumn && sheetBox.top > mapBox.top && sheetBox.top < mapBox.bottom ? mapBox.bottom - sheetBox.top : 0
}

/** Centre a point in the part of the map the user can actually see. */
export function focusOn(map: L.Map, point: L.LatLngExpression, zoom: number): void {
  const shifted = map.project(point, zoom).add([0, coveredBottom(map) / 2])
  const center = map.unproject(shifted, zoom)
  // Animating needs the map's size; before it has one, just jump.
  if (map.getSize().x > 0) map.flyTo(center, zoom)
  else map.setView(center, zoom)
}

/** Fit several points into the visible part of the map. */
export function showAll(map: L.Map, points: L.LatLngExpression[], maxZoom: number): void {
  if (map.getSize().x === 0) return
  map.flyToBounds(L.latLngBounds(points), {
    paddingTopLeft: [EDGE_PX, EDGE_PX + 40],  // room for the filters along the top on phones
    paddingBottomRight: [EDGE_PX, coveredBottom(map) + EDGE_PX],
    maxZoom,
  })
}
