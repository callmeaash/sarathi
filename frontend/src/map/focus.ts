import L from 'leaflet'

const EDGE_PX = 48

/** How many pixels at the bottom of the map are hidden behind the phone's bottom sheet (0 on desktop). */
export function coveredBottom(map: L.Map): number {
  const sheet = document.querySelector<HTMLElement>('[data-map-sheet]')
  if (!sheet) return 0
  const mapBox = map.getContainer().getBoundingClientRect()
  const sheetBox = sheet.getBoundingClientRect()
  const sameColumn = sheetBox.left < mapBox.right && sheetBox.right > mapBox.left  // desktop: panel is beside the map
  if (!sameColumn) return 0
  // The height the sheet is settling at, not its height part-way through an animation (a page that has just
  // opened centres its place while the sheet is still sliding up).
  const area = sheet.closest<HTMLElement>('[data-sheet]')
  const target = area ? parseFloat(getComputedStyle(area).getPropertyValue('--sheet-height')) : NaN
  if (Number.isFinite(target) && target > 0) return Math.min(target, mapBox.height)
  return sheetBox.top > mapBox.top && sheetBox.top < mapBox.bottom ? mapBox.bottom - sheetBox.top : 0
}

/** Whether a point sits comfortably inside the visible part of the map (not under the sheet or at an edge). */
export function inView(map: L.Map, point: L.LatLngExpression): boolean {
  const size = map.getSize()
  const { x, y } = map.latLngToContainerPoint(point)
  return x > EDGE_PX && x < size.x - EDGE_PX && y > coveredTop(map) + EDGE_PX && y < size.y - coveredBottom(map) - EDGE_PX
}

/** How many pixels at the top of the map are under the phone's floating header (0 on desktop). */
export function coveredTop(map: L.Map): number {
  const header = document.querySelector<HTMLElement>('[data-map-header]')
  if (!header) return 0
  const box = header.getBoundingClientRect()
  const mapBox = map.getContainer().getBoundingClientRect()
  return box.height > 0 && box.bottom > mapBox.top ? Math.min(box.bottom - mapBox.top, mapBox.height) : 0
}

/** Centre a point in the part of the map the user can actually see. */
export function focusOn(map: L.Map, point: L.LatLngExpression, zoom: number): void {
  const shifted = map.project(point, zoom).add([0, (coveredBottom(map) - coveredTop(map)) / 2])
  const center = map.unproject(shifted, zoom)
  // Animating needs the map's size; before it has one, just jump.
  if (map.getSize().x > 0) map.flyTo(center, zoom)
  else map.setView(center, zoom)
}

/** Fit several points into the visible part of the map. */
export function showAll(map: L.Map, points: L.LatLngExpression[], maxZoom: number): void {
  if (map.getSize().x === 0) return
  map.flyToBounds(L.latLngBounds(points), {
    paddingTopLeft: [EDGE_PX, EDGE_PX + coveredTop(map)],
    paddingBottomRight: [EDGE_PX, coveredBottom(map) + EDGE_PX],
    maxZoom,
  })
}
