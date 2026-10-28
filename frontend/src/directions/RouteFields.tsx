import { Icon } from '../components/Icon'
import { requestSheet } from '../layouts/useBottomSheet'
import { type ExtraOption, PlaceSearch } from '../search/PlaceSearch'
import { type Point, type Side, pointValue } from './params'

type RouteFieldsProps = {
  from: Point | null          // null: start from the user's location
  to: Point | null
  here: Point | null          // the user's location, when known and inside the district
  onChange: (side: Side, point: Point | null) => void
  onSwap: () => void
  onPickOnMap: (side: Side) => void
}

const BOX = 'flex h-11 items-center gap-2 rounded-lg bg-surface-container-lowest px-3 ring-1 ring-border-muted focus-within:ring-2 focus-within:ring-primary'

/** Start and destination search fields with a swap button, as in the route planner designs. */
export function RouteFields({ from, to, here, onChange, onSwap, onPickOnMap }: RouteFieldsProps) {
  const extras = (side: Side): ExtraOption[] => [
    ...(here || side === 'from' ? [{
      key: 'here', icon: 'my_location', label: 'Your location',
      sub: here ? undefined : 'Asks the browser for your position',
      onSelect: () => onChange(side, side === 'from' ? null : here),
    }] : []),
    { key: 'map', icon: 'map', label: 'Choose on map', sub: 'Tap the spot on the map', onSelect: () => onPickOnMap(side) },
  ]

  const field = (side: Side, point: Point | null, label: string, placeholder: string) => (
    <PlaceSearch
      // A new key when the point changes from outside (swap, map pick) so the box shows the new name.
      key={point ? `${pointValue(point)}:${point.name}` : `${side}:empty`}
      label={label}
      placeholder={placeholder}
      text={point?.name ?? (side === 'from' ? 'Your location' : '')}
      extras={extras(side)}
      onSelect={(hit) => onChange(side, { lat: hit.lat, lon: hit.lon, name: hit.name })}
      leading={<span aria-hidden />}
      onFocusInput={() => requestSheet('full')}  // on phones, room for the suggestions
      boxClassName={BOX}
    />
  )

  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-container-low p-3">
      <div aria-hidden className="flex flex-col items-center self-stretch py-4">
        <span className="size-3 rounded-full border-[3px] border-primary bg-white" />
        <span className="my-1 w-px flex-1 border-l-2 border-dotted border-outline-variant" />
        <Icon name="location_on" filled className="text-[18px] text-on-surface" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {field('from', from, 'Start', 'Choose a start')}
        {field('to', to, 'Destination', 'Where to?')}
      </div>
      <button type="button" onClick={onSwap} aria-label="Swap start and destination"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container-lowest text-on-surface-variant ring-1 ring-border-muted hover:bg-surface-container">
        <Icon name="swap_vert" />
      </button>
    </div>
  )
}
