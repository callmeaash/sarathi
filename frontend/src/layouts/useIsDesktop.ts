import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 1024px)'  // Tailwind's lg breakpoint, where the panel sits beside the map

/** Whether the desktop layout is showing; follows window resizes. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const media = window.matchMedia(QUERY)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches,
  )
}
