import { useSyncExternalStore } from 'react'

import { storage } from '../lib/storage'
import { FACILITY_KINDS, type FacilityKind } from './kinds'

// Which kinds of facility the map shows; shared by every page and remembered between visits.
const KEY = 'sarathi.facilityKinds'
const listeners = new Set<() => void>()

/** The saved choice, or every kind if nothing valid was saved. */
function load(): FacilityKind[] {
  try {
    const saved = JSON.parse(storage.get(KEY) ?? 'null')
    if (Array.isArray(saved)) return FACILITY_KINDS.filter((kind) => saved.includes(kind))
  } catch {
    // ignore broken data
  }
  return [...FACILITY_KINDS]
}

let shown = load()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Show or hide one kind of facility. */
export function toggleKind(kind: FacilityKind): void {
  shown = shown.includes(kind) ? shown.filter((k) => k !== kind) : FACILITY_KINDS.filter((k) => k === kind || shown.includes(k))
  storage.set(KEY, JSON.stringify(shown))
  listeners.forEach((listener) => listener())
}

/** Reload the choice from storage (used by tests). */
export function reloadKinds(): void {
  shown = load()
  listeners.forEach((listener) => listener())
}

/** The kinds of facility currently shown on the map. */
export function useShownKinds(): FacilityKind[] {
  return useSyncExternalStore(subscribe, () => shown)
}
