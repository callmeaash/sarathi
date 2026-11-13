import { BASE_MAPS, setBaseMap, useBaseMap } from './baseMap'

/** "Street | Satellite" buttons that choose the map background. */
export function BaseMapSwitch({ className = '' }: { className?: string }) {
  const base = useBaseMap()
  return (
    <div role="group" aria-label="Base map"
      className={`gap-0.5 rounded-md border border-border-muted bg-surface-container-lowest p-[3px] ${className}`}>
      {BASE_MAPS.map(({ key, label }) => (
        <button key={key} type="button" aria-pressed={base === key} onClick={() => setBaseMap(key)}
          className={`h-7 flex-1 rounded-sm px-3 text-[13px] font-medium ${
            base === key ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
