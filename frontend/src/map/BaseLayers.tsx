import { FacilitiesLayer } from '../facilities/FacilitiesLayer'
import { HazardsLayer } from '../hazards/HazardsLayer'
import { MapLayers } from './MapLayers'

type BaseLayersProps = { facilityId?: number; hazardId?: number; facilities?: boolean }

/** What map pages show: facilities, closed roads and hazards, with an optional highlighted one. */
export function BaseLayers({ facilityId, hazardId, facilities = true }: BaseLayersProps) {
  return (
    <MapLayers>
      {facilities && <FacilitiesLayer selectedId={facilityId} />}
      <HazardsLayer selectedId={hazardId} />
    </MapLayers>
  )
}
