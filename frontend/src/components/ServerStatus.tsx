import { useHealth } from '../api/health'
import { Icon } from './Icon'

/** Warning with a retry button when the Sarathi server can't be reached; nothing otherwise (the Live chip covers that). */
export function ServerStatus() {
  const { isError, isFetching, refetch } = useHealth()
  if (!isError) return null
  return (
    <div role="alert" className="mt-4 flex items-center gap-3 rounded-md bg-error-container px-3 py-2 text-on-error-container">
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
