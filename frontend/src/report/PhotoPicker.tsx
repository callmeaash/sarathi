import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from '../components/Icon'
import { MAX_PHOTOS, PHOTO_TYPES, photoProblem } from './photos'

type PhotoPickerProps = { photos: File[]; onChange: (photos: File[]) => void; disabled?: boolean }

/** Up to three photos for a report: small previews with a remove button, and a tile to add more. */
export function PhotoPicker({ photos, onChange, disabled = false }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo)), [photos])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])  // free the old previews

  const add = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])]
    event.target.value = ''  // so choosing the same file again still counts as a change
    const bad = chosen.map(photoProblem).find(Boolean)
    const room = MAX_PHOTOS - photos.length
    const usable = chosen.filter((file) => !photoProblem(file))
    setProblem(bad ?? (usable.length > room ? `A report can have up to ${MAX_PHOTOS} photos.` : null))
    if (usable.length) onChange([...photos, ...usable.slice(0, room)])
  }

  return (
    <div className="mt-5">
      <p className="mb-2 flex items-baseline justify-between text-title-md text-on-surface">
        <span>Photos <span className="text-body-sm font-normal text-text-secondary">(optional)</span></span>
        <span className="text-body-sm font-normal text-text-secondary tabular-nums">{photos.length}/{MAX_PHOTOS}</span>
      </p>
      <ul aria-label="Photos" className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <li key={previews[index]} className="relative aspect-square overflow-hidden rounded-md border border-border-muted bg-surface-container">
            <img src={previews[index]} alt={`Photo ${index + 1}: ${photo.name}`} className="size-full object-cover" />
            <button type="button" disabled={disabled} aria-label={`Remove photo ${index + 1}`}
              onClick={() => { setProblem(null); onChange(photos.filter((_, i) => i !== index)) }}
              className="absolute top-1 right-1 grid size-7 place-items-center rounded-md bg-on-surface/75 text-white hover:bg-on-surface disabled:opacity-60">
              <Icon name="close" className="text-[16px]" />
            </button>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li>
            <button type="button" disabled={disabled} onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-outline-variant bg-surface-container-low text-label-lg text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-60">
              <Icon name="add_a_photo" />
              Add photo
            </button>
          </li>
        )}
      </ul>
      {/* On phones this offers the camera as well as the gallery. */}
      <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} multiple onChange={add} aria-label="Add photos"
        className="sr-only" tabIndex={-1} />
      {problem
        ? <p role="alert" className="mt-2 text-body-sm text-error">{problem}</p>
        : <p className="mt-2 text-body-sm text-text-secondary">A photo helps moderators confirm the hazard faster. Location details saved inside photos are removed.</p>}
    </div>
  )
}
