import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useAppMap } from './context'

/** Places page controls in the strip along the top of the shared map. */
export function MapOverlay({ children }: { children: ReactNode }) {
  const { overlay } = useAppMap()
  return overlay ? createPortal(children, overlay) : null
}
