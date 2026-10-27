import { storage } from '../../lib/storage'

const WELCOMED = 'sarathi.welcomed'

/** Remember that this browser has seen the welcome screen. */
export function markWelcomed(): void {
  storage.set(WELCOMED, '1')
}

/** Whether this browser has seen the welcome screen. */
export function hasBeenWelcomed(): boolean {
  return storage.get(WELCOMED) === '1'
}
