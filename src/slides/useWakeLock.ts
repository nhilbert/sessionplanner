import { useEffect } from 'react'

/** Keeps the screen on while the page is open (presenting, a phone as remote); the browser drops the lock when the page is hidden, so it is asked again on return. */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const request = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (l) => (gone ? void l.release() : (lock = l)),
        () => undefined,
      )
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [])
}
