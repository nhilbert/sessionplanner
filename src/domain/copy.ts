import { newId } from './ops.ts'
import { newSlides } from './slides.ts'
import type { Group, Item, ItemContent, LibraryEntry } from './types.ts'

/** Library entries and copies (docs/concept.md, section 9): content only, never a place or files. Slides are content and come along. */

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
  slides: item.slides,
  categoryId: item.categoryId,
  color: item.color,
})

/** New records for a library entry: one item, or a group with its items. Positions of members are 1, 2, 3 …; the caller places the top entry. */
export function fromLibrary(entry: LibraryEntry, workshopId: string, dayId: string | null, groupId: string | null, position: number): { group: Group | null; items: Item[] } {
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
    attachmentIds: [],
  })
  if (entry.kind === 'item') return { group: null, items: [item(entry.data, groupId, position)] }
  const group: Group = { id: newId(), workshopId, dayId, position, title: entry.title }
  return { group, items: entry.data.items.map((c, i) => item(c, group.id, i + 1)) }
}
