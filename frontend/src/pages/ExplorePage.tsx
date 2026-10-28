import { Icon } from '../components/Icon'
import { LiveStatusChip } from '../components/LiveStatusChip'
import { SectionHeading } from '../components/SectionHeading'
import { ServerStatus } from '../components/ServerStatus'
import { FacilityCards, FacilityChips } from '../facilities/FacilityChips'
import { HazardSections } from '../hazards/HazardList'
import { BaseLayers } from '../map/BaseLayers'
import { HeaderExtras } from '../map/MapOverlay'

/** How to drop a pin, which has no button of its own. */
function PinTip() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-surface-tint-light px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-white">
        <Icon name="touch_app" className="text-[18px]" />
      </span>
      <div>
        <p className="text-label-lg text-on-surface">Drop a pin</p>
        <p className="text-body-sm text-text-secondary">
          Press and hold the map (right-click on a computer) for directions or to report there.
        </p>
      </div>
    </div>
  )
}

/** Home: the map with facilities and hazards, and the latest closures and reports. */
export function ExplorePage() {
  // Desktop: the panel fills the full height. Buttons and cards grow with the window and the sections are spread
  // evenly from top to bottom. Phones keep the natural, compact layout in the bottom sheet.
  return (
    <div className="flex flex-col gap-5 lg:min-h-full lg:justify-between lg:gap-4">
      <title>Explore · Sarathi</title>
      <BaseLayers />
      {/* Phones: facility filters sit in the header, under the search bar. */}
      <HeaderExtras><FacilityChips /></HeaderExtras>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-on-surface">Explore</h1>
          <p className="mt-0.5 flex items-center gap-1 text-body-md text-text-secondary">
            <Icon name="location_on" className="text-[18px]" />
            Kathmandu District <span lang="ne" className="font-devanagari">(काठमाडौं जिल्ला)</span>
          </p>
        </div>
        <div className="pt-0.5"><LiveStatusChip /></div>
      </header>
      <ServerStatus />

      <section className="hidden lg:block">
        <SectionHeading title="Emergency & services" />
        <FacilityCards />
      </section>
      <HazardSections limit={2} fill />
      <PinTip />
    </div>
  )
}
