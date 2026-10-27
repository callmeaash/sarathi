import { PageHeader } from '../components/PageHeader'
import { ClearedSection, HazardSections } from '../hazards/HazardList'
import { BaseLayers } from '../map/BaseLayers'

/** Every verified closure and unverified report in the district, plus recently cleared ones. */
export function HazardsPage() {
  return (
    <>
      <BaseLayers />
      <PageHeader title="Hazards" subtitle="Road closures and reports across Kathmandu District." />
      <HazardSections />
      <ClearedSection />
    </>
  )
}
