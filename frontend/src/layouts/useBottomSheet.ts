import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'

// Resting heights of the phone's bottom sheet, as fractions of the space below the header:
// low (just the title), half, and nearly full (a strip of map stays visible to drag back down to).
export const SNAPS = [0.22, 0.48, 0.88]
const START_SNAP = 1
const TOP_GAP_PX = 8  // the sheet stops this far below a floating header
const TAP_PX = 6            // a press that moves less than this is a tap
const FLICK_PX_PER_MS = 0.5 // a release faster than this goes to the next height in that direction
const MIN_PX = 64           // never drag smaller than the handle and a line of the title

type DragStart = { y: number; height: number; time: number }

export type SheetLevel = 'low' | 'half' | 'full'
const LEVELS: Record<SheetLevel, number> = { low: 0, half: 1, full: 2 }
const EVENT = 'sarathi:sheet'

/** Ask the phone's bottom sheet to move to a height (it does nothing on desktop). */
export function requestSheet(level: SheetLevel): void {
  window.dispatchEvent(new CustomEvent<SheetLevel>(EVENT, { detail: level }))
}

/** Phone bottom sheet that follows the finger and snaps to three heights; resets when `resetKey` changes. */
export function useBottomSheet(resetKey: string, startLevel: SheetLevel = 'half', topInset = 0) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)  // the area the sheet sits in
  const [area, setArea] = useState(0)
  const start = LEVELS[startLevel]
  const [snap, setSnap] = useState(start)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [key, setKey] = useState(resetKey)
  const drag = useRef<DragStart | null>(null)

  if (key !== resetKey) {  // each new page starts at its own height
    setKey(resetKey)
    setSnap(start)
  }

  /** Remember the area the sheet sits in, and its height right away. */
  const attachArea = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
    if (node) setArea(node.clientHeight)
  }, [])

  useEffect(() => {  // a page asked for a different height
    const onRequest = (event: Event) => setSnap(LEVELS[(event as CustomEvent<SheetLevel>).detail] ?? START_SNAP)
    window.addEventListener(EVENT, onRequest)
    return () => window.removeEventListener(EVENT, onRequest)
  }, [])

  useEffect(() => {  // snap heights follow the space available (rotation, browser bars appearing)
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setArea(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  const tallest = Math.max(area - topInset - TOP_GAP_PX, 0)  // never under the floating header
  const heights = SNAPS.map((fraction) => Math.min(Math.round(fraction * area), tallest))
  const height = dragHeight ?? heights[snap]
  const last = SNAPS.length - 1

  /** The resting height closest to a height. */
  const nearest = (value: number) =>
    heights.reduce((best, h, index) => (Math.abs(h - value) < Math.abs(heights[best] - value) ? index : best), 0)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    drag.current = { y: event.clientY, height, time: performance.now() }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return
    const moved = drag.current.y - event.clientY
    if (dragHeight === null && Math.abs(moved) < TAP_PX) return
    setDragHeight(Math.min(Math.max(drag.current.height + moved, MIN_PX), tallest))
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const begun = drag.current
    drag.current = null
    if (!begun) return
    const moved = begun.y - event.clientY
    if (Math.abs(moved) < TAP_PX) {
      setDragHeight(null)
      setSnap((current) => (current === last ? 1 : current + 1))  // tap: one step up, or back to half from the top
      return
    }
    const speed = moved / Math.max(performance.now() - begun.time, 1)
    const here = nearest(begun.height + moved)
    if (speed > FLICK_PX_PER_MS) setSnap(Math.min(Math.max(here, nearest(begun.height) + 1), last))
    else if (speed < -FLICK_PX_PER_MS) setSnap(Math.max(Math.min(here, nearest(begun.height) - 1), 0))
    else setSnap(here)
    setDragHeight(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowUp') setSnap((current) => Math.min(current + 1, last))
    else if (event.key === 'ArrowDown') setSnap((current) => Math.max(current - 1, 0))
    else if (event.key === 'Enter' || event.key === ' ') setSnap((current) => (current === last ? 1 : current + 1))
    else return
    event.preventDefault()
  }

  return {
    attachArea,
    height,
    dragging: dragHeight !== null,
    expanded: dragHeight === null ? snap === last : dragHeight > heights[1] + (heights[last] - heights[1]) / 2,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  }
}
