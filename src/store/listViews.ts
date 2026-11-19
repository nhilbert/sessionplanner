/**
 * What a list showed, per entry of the browser's history (`location.key`): the way back to the list finds it as it was
 * left (search, place, what was open), and a fresh visit starts fresh. Kept while the app is open, for the last few.
 */
export function historyViews<T>(keep = 30): { get: (key: string) => T | undefined; set: (key: string, view: T) => void } {
  const views = new Map<string, T>()
  return {
    get: (key) => views.get(key),
    set: (key, view) => {
      views.delete(key)
      views.set(key, view)
      if (views.size > keep) views.delete(views.keys().next().value as string)
    },
  }
}
