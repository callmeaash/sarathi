import { Icon } from '../components/Icon'
import { useAppMap } from '../map/context'
import { toggleKind, useShownKinds } from './filter'
import { FACILITY_KINDS, type FacilityKind, KINDS } from './kinds'

/** Show or hide a kind, and say so if it's switched on while zoomed too far out to see it. */
function useToggle() {
  const shown = useShownKinds()
  const { map, showNotice } = useAppMap()
  const toggle = (kind: FacilityKind) => {
    const turningOn = !shown.includes(kind)
    toggleKind(kind)
    const { minZoom, plural } = KINDS[kind]
    if (turningOn && map && map.getZoom() < minZoom) showNotice(`Zoom in to see ${plural.toLowerCase()} on the map.`)
  }
  return { shown, toggle }
}

/** Phones: a row of toggle chips laid over the top of the map. */
export function FacilityChips() {
  const { shown, toggle } = useToggle()
  return (
    <div role="group" aria-label="Show on map" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
      {FACILITY_KINDS.map((kind) => {
        const on = shown.includes(kind)
        const { plural, icon, chip } = KINDS[kind]
        return (
          <button key={kind} type="button" aria-pressed={on} onClick={() => toggle(kind)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-label-lg transition-colors ${
              on ? chip : 'border-border-muted bg-surface-container-lowest text-on-surface-variant'}`}>
            <Icon name={on ? icon : 'add'} filled={on} className="text-[18px]" />
            {plural}
          </button>
        )
      })}
    </div>
  )
}

/** Desktop panel: a 2 × 2 grid of toggle cards, one per kind of facility. */
export function FacilityCards() {
  const { shown, toggle } = useToggle()
  return (
    <div role="group" aria-label="Show on map" className="grid grid-cols-2 gap-2">
      {FACILITY_KINDS.map((kind) => {
        const on = shown.includes(kind)
        const { plural, icon, chip, badge } = KINDS[kind]
        return (
          <button key={kind} type="button" aria-pressed={on} onClick={() => toggle(kind)}
            className={`flex h-11 items-center gap-2.5 rounded-lg border bg-surface-container-lowest px-2 text-left lg:h-[clamp(2.75rem,7dvh,4.5rem)] transition-colors hover:bg-surface-container-low ${
              on ? `${chip.split(' ')[0]} text-on-surface` : 'border-border-muted text-text-secondary'}`}>
            <span className={`grid size-7 shrink-0 place-items-center rounded-md text-white ${on ? badge : 'bg-outline-variant'}`}>
              <Icon name={icon} filled className="text-[16px]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-label-lg">{plural}</span>
          </button>
        )
      })}
    </div>
  )
}
