import { useSyncExternalStore } from 'react'

import { storage } from '../lib/storage'

// Which map layers are switched on (the "Map layers" panel); remembered between visits.
export const LAYERS = [
  { key: 'closures', label: 'Closed roads', dot: 'bg-hazard-closure-red' },
  { key: 'reports', label: 'Unverified reports', dot: 'bg-pending-amber' },
  { key: 'facilities', label: 'Facilities', dot: 'bg-open-green' },
] as const

export type LayerKey = (typeof LAYERS)[number]['key']
type LayerState = Record<LayerKey, boolean>

const KEY = 'sarathi.mapLayers'
const ALL_ON: LayerState = { closures: true, reports: true, facilities: true }
const listeners = new Set<() => void>()

/** The saved switches, with anything missing switched on. */
function load(): LayerState {
  try {
    const saved = JSON.parse(storage.get(KEY) ?? '{}')
    return Object.fromEntries(Object.entries(ALL_ON).map(([key, on]) => [key, saved[key] ?? on])) as LayerState
  } catch {
    return { ...ALL_ON }
  }
}

let state = load()

/** Switch a layer on or off. */
export function setLayer(key: LayerKey, on: boolean): void {
  state = { ...state, [key]: on }
  storage.set(KEY, JSON.stringify(state))
  listeners.forEach((listener) => listener())
}

/** Reload the switches from storage (used by tests). */
export function reloadLayers(): void {
  state = load()
  listeners.forEach((listener) => listener())
}

/** Which layers are on. */
export function useLayers(): LayerState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => state)
}
