import type { ServerEvent } from '../src/domain/ops.ts'

/** An event, and the revision of its workshop once it happened (src/store/usePlanner.ts puts both in order). */
type Listener = (event: ServerEvent, revision?: number) => void

/** Passes changes to every open window of a workshop (server-sent events, docs/concept.md section 7). */
export class Hub {
  private listeners = new Map<string, Set<Listener>>()
  private revisionOf?: (workshopId: string) => number | undefined

  constructor(revisionOf?: (workshopId: string) => number | undefined) {
    this.revisionOf = revisionOf
  }

  subscribe(workshopId: string, listener: Listener): () => void {
    let set = this.listeners.get(workshopId)
    if (!set) this.listeners.set(workshopId, (set = new Set()))
    set.add(listener)
    return () => {
      set.delete(listener)
      if (!set.size) this.listeners.delete(workshopId)
    }
  }

  publish(workshopId: string, event: ServerEvent): void {
    const set = this.listeners.get(workshopId)
    if (!set) return
    const revision = this.revisionOf?.(workshopId)
    for (const listener of set) listener(event, revision)
  }
}
