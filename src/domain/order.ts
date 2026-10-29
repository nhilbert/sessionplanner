import type { Day, Item } from './types.ts'

/** Ordering by fractional positions (docs/concept.md, section 11). */

const MIN_GAP = 1e-6

export const byPosition = <T extends { position: number }>(a: T, b: T): number => a.position - b.position

/** The items of one day (or of the parking lot when dayId is null), in agenda order. */
export function itemsIn(items: Item[], dayId: string | null): Item[] {
  return items.filter((i) => i.dayId === dayId).sort(byPosition)
}

export const sortedDays = (days: Day[]): Day[] => [...days].sort(byPosition)

/** All items placed in a day, days in order, items in agenda order (the parking lot left out). */
export function agendaOrder(days: Day[], items: Item[]): Item[] {
  return sortedDays(days).flatMap((d) => itemsIn(items, d.id))
}

/**
 * New positions for putting `id` at `index` among `siblings` (the target list without `id`, in order).
 * Usually only the moved entry changes; when two neighbours sit too close together the whole list is renumbered.
 */
export function placeAt(siblings: { id: string; position: number }[], id: string, index: number): { id: string; position: number }[] {
  const at = Math.max(0, Math.min(index, siblings.length))
  const before = siblings[at - 1]?.position
  const after = siblings[at]?.position
  let position: number
  if (before === undefined && after === undefined) position = 1
  else if (before === undefined) position = after! - 1
  else if (after === undefined) position = before + 1
  else position = (before + after) / 2
  if (before === undefined || after === undefined || (after - before) / 2 > MIN_GAP) return [{ id, position }]
  const ids = [...siblings.slice(0, at).map((s) => s.id), id, ...siblings.slice(at).map((s) => s.id)]
  return ids.map((x, i) => ({ id: x, position: i + 1 }))
}

/** Position after the last of `siblings`. */
export const positionAtEnd = (siblings: { position: number }[]): number => (siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 1)
