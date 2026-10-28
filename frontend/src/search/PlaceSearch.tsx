import { type KeyboardEvent, type ReactNode, type Ref, useId, useState } from 'react'

import { Icon } from '../components/Icon'
import { kindInfo } from '../facilities/kinds'
import { formatDistance } from '../lib/format'
import { inDistrict } from '../map/config'
import { useAppMap } from '../map/context'
import { MIN_QUERY_LENGTH, type SearchHit, useDebounced, useSearch } from './api'

/** A fixed choice listed above the search results, e.g. "Your location" or "Choose on map". */
export type ExtraOption = { key: string; icon: string; label: string; sub?: string; onSelect: () => void }

type PlaceSearchProps = {
  label: string                     // read by screen readers
  placeholder: string
  onSelect: (hit: SearchHit) => void
  extras?: ExtraOption[]
  text?: string                     // starting text (e.g. a place already chosen)
  clearOnSelect?: boolean           // the header search empties itself; route fields show the chosen name
  inputRef?: Ref<HTMLInputElement>
  leading?: ReactNode
  trailing?: ReactNode
  boxClassName: string              // the look of the input box (header, phone header, route field)
  autoFocus?: boolean
}

/** The matched part of a name in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}<strong className="font-semibold text-primary">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  )
}

/** One search result: icon by kind, name, what it is, and distance. */
function HitRow({ hit, query }: { hit: SearchHit; query: string }) {
  const facility = hit.type === 'facility' ? kindInfo(hit.kind ?? '') : null
  return (
    <>
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${
        facility ? `${facility.badge} text-white` : 'bg-surface-container text-on-surface-variant'}`}>
        <Icon name={facility ? facility.icon : 'route'} filled={!!facility} className="text-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-md text-on-surface"><Highlight text={hit.name} query={query} /></span>
        <span className="block truncate text-body-sm text-text-secondary">
          {facility ? [facility.label, hit.address].filter(Boolean).join(' · ') : 'Road'}
        </span>
      </span>
      {hit.distance_m !== null && (
        <span className="shrink-0 text-label-md text-text-secondary tabular-nums">{formatDistance(hit.distance_m)}</span>
      )}
    </>
  )
}

/**
 * Search box with suggestions (the ARIA combobox pattern): type to see matching places and roads, use the arrow
 * keys and Enter, or click. Fixed options such as "Your location" can sit above the results.
 */
export function PlaceSearch({ label, placeholder, onSelect, extras = [], text: initial = '', clearOnSelect = false,
  inputRef, leading, trailing, boxClassName, autoFocus }: PlaceSearchProps) {
  const [text, setText] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const { location } = useAppMap()
  const query = useDebounced(text.trim())
  const near = location && inDistrict(location.lat, location.lon) ? location : null
  const searching = query.length >= MIN_QUERY_LENGTH
  const { data, isFetching, isError } = useSearch(query, near)
  const hits = searching ? data ?? [] : []
  const options = [...extras.map((extra) => ({ extra })), ...hits.map((hit) => ({ hit }))]
  const showList = open && (options.length > 0 || searching)

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    if ('extra' in option) {
      setText('')
      option.extra.onSelect()
    } else {
      setText(clearOnSelect ? '' : option.hit.name)
      onSelect(option.hit)
    }
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, -1))
    } else if (event.key === 'Enter' && open && options.length) {
      event.preventDefault()
      choose(active >= 0 ? active : extras.length < options.length ? extras.length : 0)  // default: first result
    } else if (event.key === 'Escape') {
      if (open) event.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  const optionId = (index: number) => `${listId}-${index}`
  return (
    <div className="relative w-full">
      <div className={boxClassName}>
        {leading ?? <Icon name="search" className="text-[20px] text-text-secondary" />}
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="h-full min-w-0 flex-1 bg-transparent text-body-md text-on-surface outline-none placeholder:text-text-secondary"
        />
        {isFetching && searching && (
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        )}
        {trailing}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          onMouseDown={(event) => event.preventDefault()}  // keep focus in the input while clicking an option
          className="absolute inset-x-0 top-full z-[1200] mt-2 max-h-[min(24rem,60dvh)] overflow-y-auto rounded-xl border border-border-muted bg-surface-container-lowest py-1.5 text-on-surface shadow-[0_8px_24px_rgb(27_28_30/0.18)]"
        >
          {options.map((option, index) => (
            <li
              key={'extra' in option ? `extra:${option.extra.key}` : `${option.hit.type}:${option.hit.id ?? option.hit.name}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${index === active ? 'bg-surface-tint-light' : ''}`}
            >
              {'extra' in option ? (
                <>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-tint-medium text-primary">
                    <Icon name={option.extra.icon} className="text-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-md text-primary">{option.extra.label}</span>
                    {option.extra.sub && <span className="block text-body-sm text-text-secondary">{option.extra.sub}</span>}
                  </span>
                </>
              ) : (
                <HitRow hit={option.hit} query={query} />
              )}
            </li>
          ))}
          {searching && !hits.length && !isFetching && (
            <li role="presentation" className="px-4 py-3 text-body-md text-text-secondary">
              {isError ? "Search isn't available right now. Check your connection." : `No places or roads match “${query}”.`}
            </li>
          )}
          {searching && !hits.length && isFetching && (
            <li role="presentation" className="px-4 py-3 text-body-md text-text-secondary">Searching…</li>
          )}
        </ul>
      )}
    </div>
  )
}
