import type { Item, PackingState } from './types.ts'

/** The packing list of a workshop (docs/concept.md, section 5). */

export interface PackingLine {
  key: string
  label: string
  /** Largest quantity of any single item: two steps with two flipcharts each need two flipcharts. */
  suggested: number
  /** What to pack: the override when set, otherwise the suggestion. */
  qty: number
  itemIds: string[]
  links: string[]
  state: PackingState
}

export const packingKey = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ')

/** `items` in agenda order (placed items only); the list follows the order in which things are first needed. */
export function packingList(items: Item[], packing: Record<string, PackingState>): PackingLine[] {
  const lines = new Map<string, PackingLine>()
  for (const item of items) {
    for (const m of item.materials) {
      const key = packingKey(m.label)
      if (!key) continue
      let line = lines.get(key)
      if (!line) {
        line = { key, label: m.label.trim(), suggested: 0, qty: 0, itemIds: [], links: [], state: packing[key] ?? {} }
        lines.set(key, line)
      }
      line.suggested = Math.max(line.suggested, m.qty || 1)
      if (!line.itemIds.includes(item.id)) line.itemIds.push(item.id)
      if (m.link && !line.links.includes(m.link)) line.links.push(m.link)
    }
  }
  for (const line of lines.values()) line.qty = line.state.qty ?? line.suggested
  return [...lines.values()]
}
