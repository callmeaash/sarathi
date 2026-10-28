import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useAppMap } from './context'

/** Places page controls in the strip along the top of the shared map. */
export function MapOverlay({ children }: { children: ReactNode }) {
  const { overlay } = useAppMap()
  return overlay ? createPortal(children, overlay) : null
}

/** Places page controls under the search bar in the phone header (the header hides on desktop). */
export function HeaderExtras({ children }: { children: ReactNode }) {
  const { headerSlot } = useAppMap()
  return headerSlot ? createPortal(children, headerSlot) : null
}
