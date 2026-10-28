import type { KeyboardEvent, PointerEvent } from 'react'

type SheetHandleProps = {
  expanded: boolean
  handle: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
}

/**
 * Grab strip at the top of the phone's bottom sheet: drag it to any height (it snaps to the nearest resting
 * height), tap it to step up, or use the arrow keys.
 */
export function SheetHandle({ expanded, handle }: SheetHandleProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
      aria-keyshortcuts="ArrowUp ArrowDown"
      {...handle}
      className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing lg:hidden"
    >
      <span className="h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
    </div>
  )
}
