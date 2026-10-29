import type { ServerEvent } from '../src/domain/ops.ts'

type Listener = (event: ServerEvent) => void

/** Passes changes to every open window of a workshop (server-sent events, docs/concept.md section 7). */
export class Hub {
  private listeners = new Map<string, Set<Listener>>()

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
    for (const listener of this.listeners.get(workshopId) ?? []) listener(event)
  }
}
