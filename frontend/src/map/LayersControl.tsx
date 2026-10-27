import { useEffect, useId, useRef, useState } from 'react'

import { Icon } from '../components/Icon'
import { LAYERS, setLayer, useLayers } from './layers'

/** "Map layers" button with a small panel of on/off switches. */
export function LayersControl({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const layers = useLayers()
  const panelId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {  // close on Escape or a click elsewhere
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    const onClick = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}
        aria-label="Map layers" className={`${buttonClass} rounded-full border border-border-muted shadow-float`}>
        <Icon name="layers" filled={open} />
      </button>
      {open && (
        <div id={panelId} role="group" aria-label="Map layers"
          className="absolute right-0 bottom-full mb-2 w-60 rounded-xl border border-border-muted bg-surface-container-lowest p-4 shadow-float">
          <p className="mb-2 flex items-center gap-2 text-title-md text-on-surface">
            <Icon name="layers" className="text-[20px]" /> Map layers
          </p>
          {LAYERS.map(({ key, label, dot }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 py-2 text-body-md text-on-surface">
              <span className={`size-2.5 rounded-sm ${dot}`} aria-hidden />
              <span className="flex-1">{label}</span>
              <input type="checkbox" role="switch" checked={layers[key]} onChange={(e) => setLayer(key, e.target.checked)}
                className="peer sr-only" />
              <span aria-hidden
                className="relative h-6 w-10 rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
