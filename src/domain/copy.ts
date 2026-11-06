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

/**
 * An entry with the files of the stored one. Files change through their own routes, so a save decides nothing about
 * them; it only says which item is which, as items have no ids of their own. An item keeps the files it names, of those
 * the entry really has, wherever it moved to. A file it does not name was added meanwhile, and goes to the saved item
 * that is that stored item: the one sharing a file with it, else the one with its title, else the one in its place when
 * the number of items is the same. A stored item that is none of them was taken out, and its files are let go.
 */
export function withFilesOf<E extends Pick<LibraryEntry, 'kind' | 'data'>>(entry: E, stored: LibraryEntry): E {
  const held = entryItems(stored)
  const saved = entryItems(entry)
  const unclaimed = new Set(held.flatMap((c) => c.attachmentIds))
  const files = saved.map((c) => c.attachmentIds.filter((id) => unclaimed.delete(id)))
  const free = new Set(saved.keys())
  const same = (found: (n: number, c: ItemContent) => boolean, ways: ItemContent[]) => {
    const pairs = new Map<ItemContent, number>()
    for (const c of ways) {
      const n = [...free].find((x) => found(x, c))
      if (n === undefined) continue
      free.delete(n)
      pairs.set(c, n)
    }
    return pairs
  }
  const byFile = same((n, c) => files[n].some((id) => c.attachmentIds.includes(id)), held)
  const rest = held.filter((c) => !byFile.has(c))
  const byTitle = same((n, c) => saved[n].title === c.title, rest)
  const byPlace = saved.length === held.length ? same((n, c) => n === held.indexOf(c), rest.filter((c) => !byTitle.has(c))) : new Map<ItemContent, number>()
  for (const [c, n] of [...byFile, ...byTitle, ...byPlace]) files[n].push(...c.attachmentIds.filter((id) => unclaimed.delete(id)))
  const items = saved.map((c, n) => ({ ...c, attachmentIds: files[n] }))
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
