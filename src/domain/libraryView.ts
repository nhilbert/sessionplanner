import type { Category, LibraryEntry } from './types.ts'
import { entryItems } from './copy.ts'
import { durationOf } from './time.ts'
import { hasTag } from './tags.ts'

/**
 * How the library page orders and narrows its entries. The category orders the page: one section per category in the
 * order of the settings, then the items without one, then the groups (a group has no category of its own, its items
 * have). The filters narrow what the sections hold.
 */

/** The section of the items without a category (or with one that is gone). Category ids are UUIDs or plain words, so these cannot be one. */
export const NO_CATEGORY = ':none'
/** The section of the groups. */
export const GROUPS = ':groups'

export type Holds = 'slides' | 'sheets' | 'files'
export const HOLDS: Holds[] = ['slides', 'sheets', 'files']

export interface LibraryFilter {
  /** Sections to show (category ids, NO_CATEGORY, GROUPS); none chosen shows all. */
  sections: string[]
  /** What an entry has to hold: every one of these. */
  holds: Holds[]
  /** Tags an entry has to carry: every one of these. */
  tags: string[]
}

export const NO_FILTER: LibraryFilter = { sections: [], holds: [], tags: [] }

export const filterCount = (f: LibraryFilter): number => f.sections.length + f.holds.length + f.tags.length

export const sectionOf = (entry: LibraryEntry, categories: Category[]): string => {
  if (entry.kind === 'group') return GROUPS
  const id = entry.data.categoryId
  return id && categories.some((c) => c.id === id) ? id : NO_CATEGORY
}

/** How many slides, worksheets and files an entry holds, over all its items. */
export function holdsOf(entry: LibraryEntry): Record<Holds, number> {
  const items = entryItems(entry)
  return {
    slides: items.reduce((n, i) => n + i.slides.length, 0),
    sheets: items.reduce((n, i) => n + (i.worksheets ?? []).length, 0),
    files: entry.attachments.length,
  }
}

export const minutesOf = (entry: LibraryEntry): number => entryItems(entry).reduce((sum, i) => sum + durationOf(i), 0)

type Facet = keyof LibraryFilter

/** Whether an entry passes the filter; `except` leaves one facet out (for the numbers beside that facet's options). */
export function passes(entry: LibraryEntry, filter: LibraryFilter, categories: Category[], except?: Facet): boolean {
  if (except !== 'sections' && filter.sections.length && !filter.sections.includes(sectionOf(entry, categories))) return false
  if (except !== 'holds' && filter.holds.length) {
    const holds = holdsOf(entry)
    if (!filter.holds.every((h) => holds[h] > 0)) return false
  }
  if (except !== 'tags' && !filter.tags.every((tag) => hasTag(entry.tags, tag))) return false
  return true
}

export interface FacetCounts {
  /** Per section: the entries it would show with the other filters as they are. */
  sections: Record<string, number>
  /** Per kind of content: the entries left if it were asked for as well. */
  holds: Record<Holds, number>
}

/**
 * The number beside every option of a filter: what choosing it would show. The sections widen (an entry is in one
 * of them), so a section counts what the other filters leave of it; "holds" narrows (an entry has to hold everything
 * chosen), so it counts what is left of the current result.
 */
export function facetCounts(entries: LibraryEntry[], filter: LibraryFilter, categories: Category[]): FacetCounts {
  const counts: FacetCounts = { sections: {}, holds: { slides: 0, sheets: 0, files: 0 } }
  for (const e of entries) {
    if (passes(e, filter, categories, 'sections')) {
      const key = sectionOf(e, categories)
      counts.sections[key] = (counts.sections[key] ?? 0) + 1
    }
    if (passes(e, filter, categories)) {
      const holds = holdsOf(e)
      for (const h of HOLDS) if (holds[h] > 0) counts.holds[h] += 1
    }
  }
  return counts
}

export interface Section {
  key: string
  entries: LibraryEntry[]
  minutes: number
}

/** The keys of all sections in the page's order, empty ones too. */
export const sectionKeys = (categories: Category[]): string[] => [...categories.map((c) => c.id), NO_CATEGORY, GROUPS]

/** The entries in their sections, in the page's order; a section without entries is left out. The entries keep the order they come in. */
export function sectionsOf(entries: LibraryEntry[], categories: Category[]): Section[] {
  const by = new Map<string, LibraryEntry[]>()
  for (const e of entries) {
    const key = sectionOf(e, categories)
    by.set(key, [...(by.get(key) ?? []), e])
  }
  return sectionKeys(categories)
    .filter((key) => by.has(key))
    .map((key) => {
      const list = by.get(key) ?? []
      return { key, entries: list, minutes: list.reduce((sum, e) => sum + minutesOf(e), 0) }
    })
}

/** An entry's neighbours in its section (the entries in the order given), for paging from one entry to the next. */
export function neighbours(entries: LibraryEntry[], id: string, categories: Category[]): { index: number; total: number; section: string; previous: LibraryEntry | null; next: LibraryEntry | null } | null {
  const entry = entries.find((e) => e.id === id)
  if (!entry) return null
  const section = sectionOf(entry, categories)
  const list = entries.filter((e) => sectionOf(e, categories) === section)
  const index = list.findIndex((e) => e.id === id)
  return { index, total: list.length, section, previous: list[index - 1] ?? null, next: list[index + 1] ?? null }
}

/** The filter with the sections that exist: a chosen category that was deleted since narrows nothing and counts as no filter. */
export function knownFilter(filter: LibraryFilter, categories: Category[]): LibraryFilter {
  const keys = sectionKeys(categories)
  const sections = filter.sections.filter((key) => keys.includes(key))
  return sections.length === filter.sections.length ? filter : { ...filter, sections }
}

/** The order of titles as a list shows them: whatever the capitals, umlauts beside their letters, 2 before 10. */
export const byTitle = (a: { title: string }, b: { title: string }): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })

/** An entry's place in a list of ids (the list it was opened from), with the ids before and after it. */
export function placeIn(ids: readonly string[], id: string): { index: number; total: number; previous: string | null; next: string | null } | null {
  const index = ids.indexOf(id)
  if (index < 0) return null
  return { index, total: ids.length, previous: ids[index - 1] ?? null, next: ids[index + 1] ?? null }
}

