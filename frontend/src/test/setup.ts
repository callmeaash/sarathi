import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { setSession } from '../auth/session'

beforeEach(() => {
  window.localStorage.setItem('sarathi.welcomed', '1')  // most tests start on the map, not the welcome screen
})

afterEach(() => {
  cleanup()
  setSession(null)
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
