import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { setSession } from '../auth/session'
import { reloadKinds } from '../facilities/filter'

// The whole app renders in every test, map included; give async checks room when the suite runs in parallel.
configure({ asyncUtilTimeout: 3000 })

beforeEach(() => {
  window.localStorage.setItem('sarathi.welcomed', '1')  // most tests start on the map, not the welcome screen
})

afterEach(() => {
  cleanup()
  setSession(null)
  window.localStorage.clear()
  reloadKinds()  // back to showing every kind of facility
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
