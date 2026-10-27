import { FacilitiesLayer } from '../facilities/FacilitiesLayer'
import { HazardsLayer } from '../hazards/HazardsLayer'
import { MapLayers } from './MapLayers'

type BaseLayersProps = { facilityId?: number; hazardId?: number }

/** What every map page shows: facilities, closed roads and hazards, with an optional highlighted one. */
export function BaseLayers({ facilityId, hazardId }: BaseLayersProps) {
  return (
    <MapLayers>
      <FacilitiesLayer selectedId={facilityId} />
      <HazardsLayer selectedId={hazardId} />
    </MapLayers>
  )
}
