import type { Map as LeafletMap } from 'leaflet'

// Drawing order for route pages. Leaflet draws lines at z-index 400 and markers at 600, so a route line would sit
// under the facility badges. These panes put the line above the badges (it ignores clicks, so badges under it
// still work) and the route's own markers (start, end, numbered results) above that, below "you are here" (650).
export const ROUTE_LINE_PANE = 'route-line'
export const ROUTE_MARKER_PANE = 'route-markers'

/** Make sure the route panes exist on the map (created once, then reused by every route page). */
export function ensureRoutePanes(map: LeafletMap): void {
  if (!map.getPane(ROUTE_LINE_PANE)) {
    const line = map.createPane(ROUTE_LINE_PANE)
    line.style.zIndex = '610'
    line.style.pointerEvents = 'none'
  }
  if (!map.getPane(ROUTE_MARKER_PANE)) map.createPane(ROUTE_MARKER_PANE).style.zIndex = '640'
}
