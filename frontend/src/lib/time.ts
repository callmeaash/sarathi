const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "12 min ago", "3 h ago", "2 days ago", then "on 21 Oct". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  const elapsed = Math.max(0, now - then)
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY)
    return days === 1 ? 'yesterday' : `${days} days ago`
  }
  return `on ${new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

/** "21 Oct, 14:05" in local time, for exact timestamps. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
