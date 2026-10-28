import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'

import { hitPath } from './hitPath'
import { PlaceSearch } from './PlaceSearch'

/** Ctrl K on Windows and Linux, ⌘K on a Mac. */
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent)

const BOX = {
  desktop: 'flex h-11 items-center gap-3 rounded-xl bg-surface-container-lowest px-4 shadow-[0_2px_8px_rgb(0_0_0/0.15)] focus-within:ring-2 focus-within:ring-white/60',
  phone: 'flex h-11 items-center gap-2 px-2',  // sits inside the floating pill, which has the background
}

/** The search box in the header; Ctrl K / ⌘K jumps to it from anywhere. */
export function HeaderSearch({ variant }: { variant: 'desktop' | 'phone' }) {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {  // both headers listen; only the one on screen takes focus
    const onKey = (event: KeyboardEvent) => {
      const box = input.current
      const onScreen = box && (box.checkVisibility?.() ?? true)
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && box && onScreen) {
        event.preventDefault()
        box.focus()
        box.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PlaceSearch
      label="Search places and roads"
      placeholder={variant === 'desktop'
        ? 'Search places, roads, hospitals, and police posts in Kathmandu…'
        : 'Search hospitals, police, roads…'}
      onSelect={(hit) => {
        input.current?.blur()
        navigate(hitPath(hit))
      }}
      clearOnSelect
      inputRef={input}
      boxClassName={BOX[variant]}
      trailing={variant === 'desktop' && (
        <kbd aria-hidden className="shrink-0 rounded-md border border-border-muted bg-surface-container-low px-1.5 py-0.5 font-sans text-label-sm text-on-surface-variant">
          {IS_MAC ? '⌘K' : 'Ctrl K'}
        </kbd>
      )}
    />
  )
}
