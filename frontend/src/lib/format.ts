/** "450 m", "2.8 km", "14 km". */
export function formatDistance(metres: number): string {
  const rounded = Math.max(10, Math.round(metres / 10) * 10)
  if (rounded < 1000) return `${rounded} m`
  const km = metres / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/** "1 min", "9 min", "1 h 5 min"; rounds up, since arriving later than promised is worse. */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** OpenStreetMap's most common opening_hours values in words; anything else is shown as written. */
export function formatOpeningHours(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '24/7') return 'Open 24 hours'
  return trimmed.replace(/;\s*/g, ' · ')
}
