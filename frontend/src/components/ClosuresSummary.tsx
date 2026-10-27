import { Link } from 'react-router'

import { useClosures } from '../api/closures'
import { Icon } from './Icon'

const NAMES_SHOWN = 2

/** "3 roads closed right now · Ring Road · Kalanki" card linking to the hazards list; hidden if it can't load. */
export function ClosuresSummary() {
  const { data, isPending, isError } = useClosures()
  if (isError) return null
  if (isPending) return <div className="h-[72px] animate-pulse rounded-xl bg-surface-container" aria-hidden />

  const count = data.length
  const names = [...new Set(data.map((closure) => closure.road_name).filter(Boolean))] as string[]
  const more = names.length - NAMES_SHOWN
  const detail = count === 0
    ? 'Roads across Kathmandu District are open.'
    : names.length
      ? `${names.slice(0, NAMES_SHOWN).join(' · ')}${more > 0 ? ` and ${more} more` : ''}`
      : 'Checked by Sarathi moderators.'

  return (
    <Link
      to="/hazards"
      className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface-container-lowest p-3 hover:bg-surface-tint-light"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${
        count ? 'bg-error-container text-hazard-closure-red' : 'bg-tertiary-fixed/50 text-tertiary'
      }`}>
        <Icon name={count ? 'remove_road' : 'check_circle'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label-lg text-on-surface">
          {count === 0 ? 'No verified road closures' : `${count} ${count === 1 ? 'road' : 'roads'} closed right now`}
        </span>
        <span className="block truncate text-body-sm text-text-secondary">{detail}</span>
      </span>
      <Icon name="chevron_right" className="text-on-surface-variant" />
    </Link>
  )
}
