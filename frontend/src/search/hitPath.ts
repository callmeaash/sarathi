import type { SearchHit } from './api'

/** Where a search result leads: a facility's page, or a pin on the road (with directions and reporting). */
export function hitPath(hit: SearchHit): string {
  if (hit.type === 'facility' && hit.id !== null) return `/place/${hit.id}`
  return `/pin?lat=${hit.lat.toFixed(6)}&lon=${hit.lon.toFixed(6)}`
}
