import type { Day, Group, Item } from './types.ts'

/**
 * Ordering by fractional positions (docs/concept.md, section 11). A day (or the parking lot) holds groups and
 * ungrouped items in one sequence; a group holds its members in a sequence of their own.
 */

const MIN_GAP = 1e-6

export const byPosition = <T extends { position: number }>(a: T, b: T): number => a.position - b.position

export const sortedDays = (days: Day[]): Day[] => [...days].sort(byPosition)

export type Entry = { type: 'item'; id: string; position: number; item: Item } | { type: 'group'; id: string; position: number; group: Group; items: Item[] }

interface Structure {
  groups: Group[]
  items: Item[]
}

/** The members of a group, in order. */
export function membersOf(items: Item[], groupId: string): Item[] {
  return items.filter((i) => i.groupId === groupId).sort(byPosition)
}

/** Groups and ungrouped items of one day (or of the parking lot when dayId is null), in order. */
export function entriesIn({ groups, items }: Structure, dayId: string | null): Entry[] {
  const groupIds = new Set(groups.map((g) => g.id))
  const entries: Entry[] = [
    ...groups.filter((g) => g.dayId === dayId).map((g): Entry => ({ type: 'group', id: g.id, position: g.position, group: g, items: membersOf(items, g.id) })),
    ...items
      .filter((i) => i.dayId === dayId && !(i.groupId && groupIds.has(i.groupId)))
      .map((i): Entry => ({ type: 'item', id: i.id, position: i.position, item: i })),
  ]
  return entries.sort(byPosition)
}

/** All items of one day (or the parking lot) in agenda order, groups expanded. */
export function itemsIn(structure: Structure, dayId: string | null): Item[] {
  return entriesIn(structure, dayId).flatMap((e) => (e.type === 'item' ? [e.item] : e.items))
}

/** All items placed in a day, days in order, groups expanded (the parking lot left out). */
export function agendaOrder(days: Day[], structure: Structure): Item[] {
  return sortedDays(days).flatMap((d) => itemsIn(structure, d.id))
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
