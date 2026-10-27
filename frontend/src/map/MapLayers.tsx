import { LeafletContext, createLeafletContext } from '@react-leaflet/core'
import { type ReactNode, useMemo } from 'react'

import { useAppMap } from './context'

/**
 * Lets a page draw on the shared map: react-leaflet layers placed inside appear on it and are removed when the page
 * closes. Layers draw onto the map itself, so where this sits in the page's markup doesn't matter.
 */
export function MapLayers({ children }: { children: ReactNode }) {
  const { map } = useAppMap()
  const context = useMemo(() => (map ? createLeafletContext(map) : null), [map])
  if (!context) return null
  return <LeafletContext value={context}>{children}</LeafletContext>
}
