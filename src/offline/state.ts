import { create } from 'zustand'

/**
 * Whether the app is showing the offline copy (docs/offline.md): the time the last answer from the copy was stored,
 * or null once the server answers again. Set by the API client (src/api.ts) from the header the service worker adds.
 * `enabled`: whether the switch is on in this browser; `pins`: the workshops pinned on it (src/offline/client.ts).
 */
export const useOffline = create<{ since: string | null; enabled: boolean; pins: string[] }>(() => ({ since: null, enabled: false, pins: [] }))

const stamps = new WeakMap<object, string>()

/** Notes that `value` came from the copy, stored at `at`. */
export function markOffline(value: unknown, at: string): void {
  const when = at || new Date().toISOString()
  if (value && typeof value === 'object') stamps.set(value, when)
  useOffline.setState({ since: when })
}

/** The server answered. */
export function markOnline(): void {
  if (useOffline.getState().since !== null) useOffline.setState({ since: null })
}

/** When `value` was stored, if it came from the offline copy; null when the server sent it. */
export const offlineStamp = (value: unknown): string | null => (value && typeof value === 'object' ? (stamps.get(value) ?? null) : null)
