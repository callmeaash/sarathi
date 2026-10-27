import { useHealth } from '../api/health'
import { Icon } from './Icon'

/** Small live/offline indicator for the connection to the Sarathi server. */
export function ServerStatus() {
  const { isPending, isError, isFetching, refetch } = useHealth()

  if (isPending) {
    return (
      <p role="status" className="text-body-sm text-text-secondary">
        Connecting…
      </p>
    )
  }
  if (isError) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-md bg-error-container px-3 py-2 text-on-error-container">
        <Icon name="cloud_off" className="text-[20px]" />
        <p className="flex-1 text-body-md">Can't reach the Sarathi server. Road data may be out of date.</p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-full px-3 py-1 text-label-lg hover:bg-black/5 disabled:opacity-60"
        >
          {isFetching ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    )
  }
  return (
    <p role="status" className="inline-flex items-center gap-1.5 text-label-md text-open-green">
      <span className="size-2 rounded-full bg-open-green" aria-hidden />
      Live
    </p>
  )
}
