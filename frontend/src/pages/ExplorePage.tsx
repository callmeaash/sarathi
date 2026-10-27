import { PageHeader } from '../components/PageHeader'
import { ServerStatus } from '../components/ServerStatus'
import { FacilityChips } from '../facilities/FacilityChips'
import { HazardSections } from '../hazards/HazardList'
import { BaseLayers } from '../map/BaseLayers'
import { MapOverlay } from '../map/MapOverlay'

/** Home: the map with facilities and hazards, and the latest closures and reports. */
export function ExplorePage() {
  return (
    <>
      <BaseLayers />
      {/* Phones: filters float over the top of the map. Desktop: they sit in the panel. */}
      <MapOverlay>
        <div className="px-3 pt-3 lg:hidden"><FacilityChips floating /></div>
      </MapOverlay>
      <PageHeader title="Explore" subtitle="Kathmandu District" />
      <ServerStatus />
      <div className="mt-5 hidden lg:block"><FacilityChips /></div>
      <HazardSections limit={3} />
    </>
  )
}
