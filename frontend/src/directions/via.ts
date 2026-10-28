import type { Route } from './api'

/** "via A and B": the two longest named roads, in the order the route uses them. */
export function viaRoads(route: Route): string | null {
  const named = route.steps.filter((step) => step.road_name)
  if (!named.length) return null
  const longest = [...named].sort((a, b) => b.distance_m - a.distance_m).slice(0, 2)
  const inOrder = named.filter((step) => longest.includes(step)).map((step) => step.road_name)
  return [...new Set(inOrder)].join(' and ')
}
