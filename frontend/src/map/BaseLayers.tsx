import { FacilitiesLayer } from '../facilities/FacilitiesLayer'
import { HazardsLayer } from '../hazards/HazardsLayer'
import { MapLayers } from './MapLayers'

type BaseLayersProps = { facilityId?: number; hazardId?: number; facilities?: boolean; compact?: boolean }

/** What map pages show: facilities, closed roads and hazards, with an optional highlighted one. */
export function BaseLayers({ facilityId, hazardId, facilities = true, compact = false }: BaseLayersProps) {
  return (
    <MapLayers>
      {facilities && <FacilitiesLayer selectedId={facilityId} compact={compact} />}
      <HazardsLayer selectedId={hazardId} />
    </MapLayers>
  )
}
