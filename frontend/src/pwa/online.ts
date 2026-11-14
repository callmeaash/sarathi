import { useSyncExternalStore } from 'react'

/** Be told when the device goes online or offline. */
function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** What the browser says about the connection; "online" when it can't say. */
function isOnline(): boolean {
  try {
    return navigator.onLine !== false
  } catch {
    return true
  }
}

/** Whether the device has a network connection at all. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline)
}
