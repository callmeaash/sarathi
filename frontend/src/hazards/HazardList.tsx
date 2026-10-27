import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { timeAgo } from '../lib/time'
import { type Incident, useIncidents } from './api'
import { hazardInfo, roadLabel } from './kinds'

const BADGES: Record<string, { text: string; style: string }> = {
  verified: { text: 'Closed', style: 'bg-error-container text-on-error-container' },
  pending: { text: 'Pending', style: 'bg-[#fff1d6] text-[#7a5200]' },
  cleared: { text: 'Cleared', style: 'bg-tertiary-fixed/50 text-tertiary' },
}

/** When something last happened to a hazard, in words. */
function when(incident: Incident): string {
  if (incident.status === 'cleared' && incident.cleared_at) return `cleared ${timeAgo(incident.cleared_at)}`
  if (incident.status === 'verified' && incident.reviewed_at) return `verified ${timeAgo(incident.reviewed_at)}`
  return `reported ${timeAgo(incident.created_at)}`
}

/** One hazard as a card linking to its details. */
export function HazardCard({ incident }: { incident: Incident }) {
  const { label, icon, tint } = hazardInfo(incident.kind)
  const badge = BADGES[incident.status] ?? BADGES.pending
  return (
    <Link to={`/hazards/${incident.id}`}
      className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface-container-lowest p-3 hover:bg-surface-tint-light">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tint}`}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-md text-on-surface">{roadLabel(incident.road_name)}</span>
        <span className="block truncate text-body-sm text-text-secondary">{label} · {when(incident)}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-label-md ${badge.style}`}>{badge.text}</span>
    </Link>
  )
}

type SectionProps = { title: string; incidents: Incident[]; empty: string; limit?: number; more?: string }

/** A titled list of hazards, optionally cut short with a "View all" link. */
function Section({ title, incidents, empty, limit, more }: SectionProps) {
  const shown = limit ? incidents.slice(0, limit) : incidents
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-title-md text-on-surface">{title} <span className="text-text-secondary">({incidents.length})</span></h2>
        {more && incidents.length > shown.length && <Link to={more} className="text-label-lg text-primary">View all</Link>}
      </div>
      {shown.length === 0
        ? <p className="rounded-xl bg-surface-container-low px-4 py-3 text-body-md text-text-secondary">{empty}</p>
        : <ul className="space-y-2">{shown.map((incident) => <li key={incident.id}><HazardCard incident={incident} /></li>)}</ul>}
    </section>
  )
}

/** Verified closures and reports waiting for review; `limit` shortens each list for the home panel. */
export function HazardSections({ limit }: { limit?: number }) {
  const { data, isPending, isError } = useIncidents(['pending', 'verified'])
  if (isPending) return <div className="mt-6 h-32 animate-pulse rounded-xl bg-surface-container" aria-hidden />
  if (isError) return <p className="mt-6 text-body-md text-text-secondary">Couldn't load hazards. Check your connection.</p>

  const closed = data.filter((incident) => incident.status === 'verified')
  const pending = data.filter((incident) => incident.status === 'pending')
  return (
    <>
      <Section title="Road closures" incidents={closed} limit={limit} more="/hazards"
        empty="No verified road closures right now." />
      <Section title="Unverified reports" incidents={pending} limit={limit} more="/hazards"
        empty="No reports waiting for review." />
      <p className="mt-3 text-body-sm text-text-secondary">
        Unverified reports don't change routes until a moderator checks them.
      </p>
    </>
  )
}

/** Hazards that were cleared recently. */
export function ClearedSection() {
  const { data } = useIncidents(['cleared'])
  if (!data?.length) return null
  return <Section title="Recently cleared" incidents={data.slice(0, 10)} empty="" />
}
