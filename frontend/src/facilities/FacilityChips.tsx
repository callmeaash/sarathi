import { Icon } from '../components/Icon'
import { useAppMap } from '../map/context'
import { toggleKind, useShownKinds } from './filter'
import { FACILITY_KINDS, type FacilityKind, KINDS } from './kinds'

/** Toggle chips for which facilities the map shows. `floating` is the version laid over the map on phones. */
export function FacilityChips({ floating = false }: { floating?: boolean }) {
  const shown = useShownKinds()
  const { map, showNotice } = useAppMap()

  const toggle = (kind: FacilityKind) => {
    const turningOn = !shown.includes(kind)
    toggleKind(kind)
    const { minZoom, plural } = KINDS[kind]
    if (turningOn && map && map.getZoom() < minZoom) showNotice(`Zoom in to see ${plural.toLowerCase()} on the map.`)
  }

  return (
    <div role="group" aria-label="Show on map" className="flex gap-2 overflow-x-auto [scrollbar-width:none] lg:flex-wrap">
      {FACILITY_KINDS.map((kind) => {
        const on = shown.includes(kind)
        const { plural, icon, chip } = KINDS[kind]
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(kind)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-label-lg transition-colors ${
              on ? chip : 'border-border-muted bg-surface-container-lowest text-on-surface-variant'
            } ${floating ? 'shadow-float' : ''}`}
          >
            <Icon name={on ? icon : 'add'} filled={on} className="text-[18px]" />
            {plural}
          </button>
        )
      })}
    </div>
  )
}
