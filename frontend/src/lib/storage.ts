// localStorage can be missing or throw (private windows, blocked site data), so every access is guarded.
// Only small, non-secret preferences and hints are kept here; never tokens.

/** Read a value, or null if storage is unavailable. */
function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Store a value; silently does nothing if storage is unavailable. */
function set(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // not saved: the app still works, it just won't remember this
  }
}

/** Remove a value; silently does nothing if storage is unavailable. */
function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nothing to remove
  }
}

export const storage = { get, set, remove }
