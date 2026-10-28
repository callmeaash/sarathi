import type { Route } from './api'

export type Flag = { id: number; lat: number; lon: number; text: string; tone: 'closed' | 'unverified' }
export type Avoided = { line: number[][]; flags: Flag[] } | null

/**
 * What the shown route goes around, to draw as a dashed line with labels on the hazards: the usual route when
 * verified closures make it longer, or the route through unverified reports when the user chose to go around them.
 */
export function avoidedFor(shown: Route | undefined, through: Route | undefined, goingAround: boolean): Avoided {
  if (!shown) return null
  if (goingAround && through && through !== shown && through.unverified?.length) {
    return {
      line: through.geometry.coordinates,
      flags: through.unverified.map((r) => ({ id: r.incident_id, lat: r.lat, lon: r.lon, text: 'Unverified', tone: 'unverified' })),
    }
  }
  if (shown.detour) {
    return {
      line: shown.detour.usual_geometry.coordinates,
      flags: shown.detour.closures.map((c) => ({ id: c.incident_id, lat: c.lat, lon: c.lon, text: 'Closed', tone: 'closed' })),
    }
  }
  return null
}

/** The point halfway along a line (by distance), as [lat, lon]. */
export function midpoint(line: [number, number][]): [number, number] | null {
  if (line.length < 2) return line[0] ?? null
  const lengths = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], (p[1] - line[i][1]) * Math.cos((p[0] * Math.PI) / 180)))
  let half = lengths.reduce((sum, size) => sum + size, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i]) {
      const t = lengths[i] ? half / lengths[i] : 0
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t]
    }
    half -= lengths[i]
  }
  return line[line.length - 1]
}
