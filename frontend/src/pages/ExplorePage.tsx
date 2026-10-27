import { PageHeader } from '../components/PageHeader'
import { ServerStatus } from '../components/ServerStatus'
import { FacilitiesLayer } from '../facilities/FacilitiesLayer'
import { FacilityChips } from '../facilities/FacilityChips'
import { MapLayers } from '../map/MapLayers'
import { MapOverlay } from '../map/MapOverlay'

/** Home: the map with facilities; hazards and closures join it in the next step. */
export function ExplorePage() {
  return (
    <>
      <MapLayers><FacilitiesLayer /></MapLayers>
      {/* Phones: filters float over the top of the map. Desktop: they sit in the panel. */}
      <MapOverlay>
        <div className="px-3 pt-3 lg:hidden"><FacilityChips floating /></div>
      </MapOverlay>
      <PageHeader title="Explore" subtitle="Kathmandu District" />
      <ServerStatus />
      <div className="mt-5 hidden lg:block"><FacilityChips /></div>
    </>
  )
}
