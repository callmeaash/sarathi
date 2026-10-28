import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'

// Resting heights of the phone's bottom sheet, as fractions of the space below the header:
// low (just the title), half, and nearly full (a strip of map stays visible to drag back down to).
export const SNAPS = [0.22, 0.48, 0.88]
const START_SNAP = 1
const TAP_PX = 6            // a press that moves less than this is a tap
const FLICK_PX_PER_MS = 0.5 // a release faster than this goes to the next height in that direction
const MIN_PX = 64           // never drag smaller than the handle and a line of the title

type DragStart = { y: number; height: number; time: number }

/** Phone bottom sheet that follows the finger and snaps to three heights; resets when `resetKey` changes. */
export function useBottomSheet(resetKey: string) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)  // the area the sheet sits in
  const [area, setArea] = useState(0)
  const [snap, setSnap] = useState(START_SNAP)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [key, setKey] = useState(resetKey)
  const start = useRef<DragStart | null>(null)

  if (key !== resetKey) {  // each new page starts at half height
    setKey(resetKey)
    setSnap(START_SNAP)
  }

  /** Remember the area the sheet sits in, and its height right away. */
  const attachArea = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
    if (node) setArea(node.clientHeight)
  }, [])

  useEffect(() => {  // snap heights follow the space available (rotation, browser bars appearing)
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setArea(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  const heights = SNAPS.map((fraction) => Math.round(fraction * area))
  const height = dragHeight ?? heights[snap]
  const last = SNAPS.length - 1

  /** The resting height closest to a height. */
  const nearest = (value: number) =>
    heights.reduce((best, h, index) => (Math.abs(h - value) < Math.abs(heights[best] - value) ? index : best), 0)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    start.current = { y: event.clientY, height, time: performance.now() }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!start.current) return
    const moved = start.current.y - event.clientY
    if (dragHeight === null && Math.abs(moved) < TAP_PX) return
    setDragHeight(Math.min(Math.max(start.current.height + moved, MIN_PX), area))
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const begun = start.current
    start.current = null
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
