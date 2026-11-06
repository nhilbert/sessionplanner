/**
 * Saves of the same record, one after the other: each waits for the one before, so the server stores them in the
 * order they were made, and only the answer to the latest save is taken over (an earlier answer arriving late would
 * show text that was typed over since).
 */
const chains = new Map<string, Promise<unknown>>()
const latest = new Map<string, number>()
let counter = 0

export function inOrder<T>(key: string, run: () => Promise<T>): { result: Promise<T>; isLatest: () => boolean } {
  const n = ++counter
  latest.set(key, n)
  const result = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(run)
  chains.set(key, result)
  void result.finally(() => {
    if (chains.get(key) === result) chains.delete(key)
  }).catch(() => undefined)
  return { result, isLatest: () => latest.get(key) === n }
}
