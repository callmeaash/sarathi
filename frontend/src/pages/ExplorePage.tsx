import { PageHeader } from '../components/PageHeader'
import { ServerStatus } from '../components/ServerStatus'

/** Home: the map with facilities, hazards and closures (filled in during the map phase). */
export function ExplorePage() {
  return (
    <>
      <PageHeader title="Explore" subtitle="Kathmandu District" />
      <ServerStatus />
    </>
  )
}
