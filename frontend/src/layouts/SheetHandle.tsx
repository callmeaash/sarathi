import { type PointerEvent, useRef } from 'react'

export type SheetState = 'peek' | 'expanded'

const DRAG_THRESHOLD_PX = 30

type SheetHandleProps = {
  state: SheetState
  onChange: (state: SheetState) => void
}

/** Grab handle of the phone's bottom sheet: tap to expand or collapse, or drag it up or down. */
export function SheetHandle({ state, onChange }: SheetHandleProps) {
  const startY = useRef<number | null>(null)
  const dragged = useRef(false)

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    startY.current = event.clientY
    dragged.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const up = (event: PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null) return
    const moved = event.clientY - startY.current
    startY.current = null
    if (Math.abs(moved) < DRAG_THRESHOLD_PX) return
    dragged.current = true  // the click that follows a drag shouldn't toggle it back
    onChange(moved < 0 ? 'expanded' : 'peek')
  }

  const click = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onChange(state === 'peek' ? 'expanded' : 'peek')
  }

  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onClick={click}
      aria-expanded={state === 'expanded'}
      aria-label={state === 'peek' ? 'Expand panel' : 'Collapse panel'}
      className="flex h-6 w-full shrink-0 touch-none items-center justify-center lg:hidden"
    >
      <span className="h-1 w-8 rounded-full bg-outline-variant" aria-hidden />
    </button>
  )
}
