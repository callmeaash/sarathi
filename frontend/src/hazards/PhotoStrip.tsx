import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Schemas } from '../api/client'
import { Icon } from '../components/Icon'

type Photo = Schemas['PhotoOut']

const API_URL = import.meta.env.VITE_API_URL ?? ''

/** Full address of a photo (the API sends a path). */
function source(photo: Photo): string {
  return `${API_URL}${photo.url}`
}

/** One photo over the whole screen; Escape, the close button or a click outside the photo closes it. */
function Viewer({ photos, index, onMove, onClose }: {
  photos: Photo[]; index: number; onMove: (index: number) => void; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && index < photos.length - 1) onMove(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) onMove(index - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, photos.length, onMove, onClose])

  const arrow = 'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md bg-white/15 text-white hover:bg-white/25'
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${photos.length}`} onClick={onClose}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-on-surface/90 p-4">
      <img src={source(photos[index])} alt={`Photo ${index + 1} of the hazard`} onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-md object-contain" />
      <button type="button" autoFocus onClick={onClose} aria-label="Close photo"
        className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 grid size-11 place-items-center rounded-md bg-white/15 text-white hover:bg-white/25">
        <Icon name="close" />
      </button>
      {index > 0 && (
        <button type="button" aria-label="Previous photo" className={`${arrow} left-3`}
          onClick={(event) => { event.stopPropagation(); onMove(index - 1) }}>
          <Icon name="arrow_back" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button type="button" aria-label="Next photo" className={`${arrow} right-3`}
          onClick={(event) => { event.stopPropagation(); onMove(index + 1) }}>
          <Icon name="arrow_forward" />
        </button>
      )}
    </div>,
    document.body,
  )
}

/** A report's photos as small squares; tapping one shows it large. Nothing when there are none. */
export function PhotoStrip({ photos, className = '' }: { photos?: Photo[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!photos?.length) return null
  return (
    <>
      <ul aria-label="Photos" className={`flex gap-2 ${className}`}>
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button type="button" onClick={() => setOpen(index)} aria-label={`View photo ${index + 1} of ${photos.length}`}
              className="block size-20 overflow-hidden rounded-md border border-border-muted bg-surface-container hover:opacity-90">
              <img src={source(photo)} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Viewer photos={photos} index={open} onMove={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}
