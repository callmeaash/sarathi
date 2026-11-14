import { Icon } from '../components/Icon'
import { useOnline } from './online'

/** A strip across the top while the device is offline, saying what still works. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-2 bg-inverse-surface px-4 py-1.5 pt-safe text-center text-body-sm text-inverse-on-surface">
      <Icon name="cloud_off" className="text-[16px]" />
      You're offline. Closures, routes and reports will update when you're back online.
    </div>
  )
}
