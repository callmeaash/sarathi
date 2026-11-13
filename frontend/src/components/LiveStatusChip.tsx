import { useHealth } from '../api/health'

/** Small pill saying whether live road data is reachable. */
export function LiveStatusChip() {
  const { isPending, isError } = useHealth()
  if (isPending) return null
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${
        isError ? 'bg-surface-container text-on-surface-variant' : 'bg-[#f0fdf4] text-open-green'
      }`}
    >
      <span className={`size-1.5 rounded-full ${isError ? 'bg-outline' : 'bg-open-green'}`} aria-hidden />
      {isError ? 'Offline' : 'Live'}
    </span>
  )
}
