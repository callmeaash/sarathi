import { useSearchParams } from 'react-router'

import { inDistrict } from '../map/config'

export type Point = { lat: number; lon: number; name: string }
export type Weight = 'time' | 'length'
export type Side = 'from' | 'to'
export type UnverifiedChoice = 'ask' | 'around' | 'through'

// Address format: /directions?from=27.69,85.29&fromName=Kuleshwor&to=27.66,85.31&name=Patan%20Hospital&weight=time
// A missing "from" means "your location". The "to" name is called "name" so other pages can link with ?to=…&name=…
const NAME_KEY: Record<Side, string> = { from: 'fromName', to: 'name' }

/** "lat,lon" from the address as a point, or null if missing or not a real coordinate. */
export function parsePoint(value: string | null, name: string | null, fallbackName: string): Point | null {
  if (!value) return null
  const [lat, lon] = value.split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon, name: name?.trim() || fallbackName }
}

/** A point as it goes in the address. */
export function pointValue(point: { lat: number; lon: number }): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`
}

/** Whether the point is somewhere Sarathi has roads. */
export function isServed(point: { lat: number; lon: number }): boolean {
  return inDistrict(point.lat, point.lon)
}

/** The route's ends and options, read from and written to the address so a route can be shared as a link. */
export function useDirectionsParams() {
  const [params, setParams] = useSearchParams()
  const from = parsePoint(params.get('from'), params.get(NAME_KEY.from), 'Chosen start')
  const to = parsePoint(params.get('to'), params.get(NAME_KEY.to), 'Chosen destination')
  const weight: Weight = params.get('weight') === 'length' ? 'length' : 'time'
  const avoid = params.get('avoid')
  // Unverified reports on the route: 'ask' until the user answers, then 'around' or 'through'.
  const unverifiedChoice: UnverifiedChoice = avoid === 'unverified' ? 'around' : avoid === 'none' ? 'through' : 'ask'

  const update = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params)
    change(next)
    setParams(next, { replace: true })
  }

  const setPoint = (side: Side, point: Point | null) => update((next) => {
    if (point) {
      next.set(side, pointValue(point))
      next.set(NAME_KEY[side], point.name)
    } else {
      next.delete(side)
      next.delete(NAME_KEY[side])
    }
  })

  /** Swap the ends; `here` stands in for a start of "your location" so it can become the destination. */
  const swap = (here: Point | null) => update((next) => {
    const newFrom = to
    const newTo = from ?? here
    for (const [side, point] of [['from', newFrom], ['to', newTo]] as [Side, Point | null][]) {
      if (point) {
        next.set(side, pointValue(point))
        next.set(NAME_KEY[side], point.name)
      } else {
        next.delete(side)
        next.delete(NAME_KEY[side])
      }
    }
  })

  const setWeight = (value: Weight) => update((next) => {
    if (value === 'time') next.delete('weight')
    else next.set('weight', value)
  })

  const setUnverifiedChoice = (choice: UnverifiedChoice) => update((next) => {
    if (choice === 'around') next.set('avoid', 'unverified')
    else if (choice === 'through') next.set('avoid', 'none')
    else next.delete('avoid')
  })

  return { from, to, weight, unverifiedChoice, setPoint, swap, setWeight, setUnverifiedChoice }
}
