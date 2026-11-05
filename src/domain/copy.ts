import { newId } from './ops.ts'
import { newSlides } from './slides.ts'
import type { Group, Item, ItemContent, LibraryEntry } from './types.ts'

/** Library entries and copies (docs/concept.md, section 9): content only, never a place. Slides are content and come along; files as copies of their own (server/files.ts). */

export const contentOf = (item: Item): ItemContent => ({
  kind: item.kind,
  title: item.title,
  description: item.description,
  duration: item.duration,
  goal: item.goal,
  method: item.method,
  lead: item.lead,
  notes: item.notes,
  materials: item.materials,
  attachmentIds: item.attachmentIds,
  slides: item.slides,
  categoryId: item.categoryId,
  color: item.color,
})

/** The items of an entry: its one item, or a group's. */
export const entryItems = (entry: Pick<LibraryEntry, 'kind' | 'data'>): ItemContent[] => (entry.kind === 'group' ? (entry.data as { items: ItemContent[] }).items : [entry.data as ItemContent])

/** An entry with the file lists of the stored one, item by item: files change through their own routes, so a save made meanwhile cannot drop one. */
export function withFilesOf<E extends Pick<LibraryEntry, 'kind' | 'data'>>(entry: E, stored: LibraryEntry): E {
  const held = entryItems(stored)
  const items = entryItems(entry).map((c, n) => ({ ...c, attachmentIds: held[n]?.attachmentIds ?? [] }))
  return { ...entry, data: entry.kind === 'group' ? { items } : items[0] }
}

/**
 * New records for a library entry: one item, or a group with its items. Positions of members are 1, 2, 3 …; the
 * caller places the top entry. `files` says which attachment of the workshop is the copy of which file of the entry.
 */
export function fromLibrary(entry: LibraryEntry, workshopId: string, dayId: string | null, groupId: string | null, position: number, files: Record<string, string> = {}): { group: Group | null; items: Item[] } {
  const item = (c: ItemContent, gid: string | null, pos: number): Item => ({
    ...c,
    materials: c.materials.map((m) => ({ ...m, id: newId() })),
    slides: newSlides(c.slides ?? [], newId),
    id: newId(),
    workshopId,
    dayId,
    position: pos,
    groupId: gid,
    fixedStart: null,
    attachmentIds: c.attachmentIds.flatMap((id) => (files[id] ? [files[id]] : [])),
  })
  if (entry.kind === 'item') return { group: null, items: [item(entry.data, groupId, position)] }
  const group: Group = { id: newId(), workshopId, dayId, position, title: entry.title }
  return { group, items: entry.data.items.map((c, i) => item(c, group.id, i + 1)) }
}
