import { useEffect, useState } from 'react'

/** Seconds left on a timer that can be restarted, ticking once a second. */
export function useCountdown(initialSeconds: number) {
  const [left, setLeft] = useState(initialSeconds)
  useEffect(() => {
    if (left <= 0) return undefined
    const timer = setTimeout(() => setLeft((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return { left, restart: setLeft }
}

/** m:ss for a countdown. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
