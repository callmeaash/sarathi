import { useSyncExternalStore } from 'react'

import { storage } from '../lib/storage'

// Which map background is shown: the street map or satellite photos; remembered between visits.
export const BASE_MAPS = [
  { key: 'street', label: 'Street' },
  { key: 'satellite', label: 'Satellite' },
] as const

export type BaseMap = (typeof BASE_MAPS)[number]['key']

const KEY = 'sarathi.baseMap'
const listeners = new Set<() => void>()

/** The saved choice; the street map unless satellite was chosen. */
function load(): BaseMap {
  return storage.get(KEY) === 'satellite' ? 'satellite' : 'street'
}

let state = load()

/** Switch the map background. */
export function setBaseMap(base: BaseMap): void {
  state = base
  storage.set(KEY, base)
  listeners.forEach((listener) => listener())
}

/** Reload the choice from storage (used by tests). */
export function reloadBaseMap(): void {
  state = load()
  listeners.forEach((listener) => listener())
}

/** The map background in use. */
export function useBaseMap(): BaseMap {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => state)
}
