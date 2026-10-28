import { Icon } from '../components/Icon'
import { LiveStatusChip } from '../components/LiveStatusChip'
import { SectionHeading } from '../components/SectionHeading'
import { ServerStatus } from '../components/ServerStatus'
import { FacilityCards, FacilityChips } from '../facilities/FacilityChips'
import { HazardSections } from '../hazards/HazardList'
import { BaseLayers } from '../map/BaseLayers'
import { MapOverlay } from '../map/MapOverlay'

/** How to drop a pin, which has no button of its own. */
function PinTip() {
  return (
    <div className="mt-7 flex items-start gap-3 rounded-xl border border-primary/15 bg-surface-tint-light p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
        <Icon name="touch_app" className="text-[20px]" />
      </span>
      <div>
        <p className="text-label-lg text-on-surface">Drop a pin</p>
        <p className="mt-0.5 text-body-sm text-text-secondary">
          Press and hold any road on the map (right-click on a computer) to get directions from there, find the
          nearest hospital, or report a hazard.
        </p>
      </div>
    </div>
  )
}

/** Home: the map with facilities and hazards, and the latest closures and reports. */
export function ExplorePage() {
  return (
    <>
      <title>Explore · Sarathi</title>
      <BaseLayers />
      {/* Phones: facility filters float over the top of the map. */}
      <MapOverlay>
        <div className="px-3 pt-3 lg:hidden"><FacilityChips /></div>
      </MapOverlay>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-on-surface">Explore</h1>
          <p className="mt-1 flex items-center gap-1 text-body-md text-text-secondary">
            <Icon name="location_on" className="text-[18px]" />
            Kathmandu District <span lang="ne" className="font-devanagari">(काठमाडौं जिल्ला)</span>
          </p>
        </div>
        <div className="pt-1.5"><LiveStatusChip /></div>
      </header>
      <ServerStatus />

      <section className="mt-7 hidden lg:block">
        <SectionHeading title="Emergency & services" />
        <FacilityCards />
      </section>
      <HazardSections limit={3} />
      <PinTip />
    </>
  )
}
