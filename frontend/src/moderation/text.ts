import { hazardInfo } from '../hazards/kinds'
import type { AuditEntry } from './api'

/** How long ago something happened, compactly: "41 min", "3 h", "2 d". */
export function waited(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / 1440)} d`
}

/** A length of road in words: "140 m", "1.2 km". */
export function roadLength(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** What each moderator action is called in the audit log. */
export const ACTION_LABELS: Record<string, string> = {
  verify: 'Verified', reject: 'Rejected', clear: 'Cleared', merge: 'Merged', suspend: 'Suspended',
  reinstate: 'Reinstated', role: 'Role changed',
}

/** What an audit entry was about: a report ("Report #12", "Flooding, Ring Road") or an account. */
export function auditSubject(entry: AuditEntry): { title: string; detail: string; reportId: number | null } {
  if (entry.target_type === 'incident') {
    const kind = entry.incident_kind ? hazardInfo(entry.incident_kind).label : 'Report'
    return { title: `Report #${entry.target_id}`, detail: [kind, entry.incident_road].filter(Boolean).join(', '),
      reportId: entry.target_id }
  }
  const name = entry.user_name ?? (entry.details.name as string | undefined) ?? 'Deleted account'
  return { title: name, detail: 'Account', reportId: null }
}

/** The outcome of an audit entry in a sentence. */
export function auditDetail(entry: AuditEntry): string {
  const details = entry.details as Record<string, string | number | undefined>
  switch (entry.action) {
    case 'verify':
      return `Closed ${plural(Number(details.closed_edges ?? 0), 'road segment')} within ${details.radius_m ?? '?'} m`
    case 'clear':
      return `Reopened ${plural(Number(details.closed_edges ?? 0), 'road segment')}`
    case 'reject':
    case 'suspend':
      return details.reason ? `Reason: ${details.reason}` : 'No reason recorded'
    case 'merge':
      return `Duplicate of report #${details.into ?? '?'}`
    case 'reinstate':
      return 'Account can log in again'
    case 'role':
      return `${details.from ?? '?'} to ${details.to ?? '?'}`
    default:
      return ''
  }
}
