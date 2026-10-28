import { PageHeader } from '../components/PageHeader'

// Sections that get their screens in later phases; each will move to its own file when built.

/** The signed-in user's hazard reports. */
export function MyReportsPage() {
  return <PageHeader title="My reports" subtitle="Hazards you have reported and what happened to them." />
}

/** Report a hazard on the map. */
export function ReportPage() {
  return <PageHeader title="Report a hazard" subtitle="Mark a blocked or damaged road for moderators to check." />
}
