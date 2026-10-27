import { useHealth } from '../api/health'

/** Small pill saying whether live road data is reachable. */
export function LiveStatusChip() {
  const { isPending, isError } = useHealth()
  if (isPending) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm uppercase ${
        isError ? 'bg-surface-container text-text-secondary' : 'bg-surface-tint-medium text-on-primary-fixed'
      }`}
    >
      <span className={`size-2 rounded-full ${isError ? 'bg-outline' : 'bg-open-green'}`} aria-hidden />
      {isError ? 'Offline' : 'Live'}
    </span>
  )
}
