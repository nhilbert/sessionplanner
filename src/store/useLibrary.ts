import { create } from 'zustand'
import { historyViews } from './listViews'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { Category, ItemContent, LibraryBatch, LibraryEntry, LibraryEntryInput, TrashedLibraryEntry } from '@/domain/types'
import { categoryName } from './useSettings'
import { inOrder } from '@/domain/inOrder'
import type { LibraryFilter } from '@/domain/libraryView'

/** What a library search looks through: titles, descriptions, goal, method, lead, the category, a group's items and the file names. */
export function libraryText(e: LibraryEntry, categories: Category[], t: TFunction): string {
  const item = (i: ItemContent) => [i.title, i.description, i.goal, i.method, i.lead, ...categories.filter((c) => c.id === i.categoryId).map((c) => categoryName(c, t))]
  return [e.title, ...e.tags, ...(e.kind === 'group' ? e.data.items.flatMap(item) : item(e.data)), ...e.attachments.map((a) => a.name)].join(' ').toLowerCase()
}

/** Every typed word occurs somewhere in the text. */
export const matchesWords = (text: string, query: string): boolean => query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w))

/** The shared library of items and groups (server: /api/library). */
interface LibraryStore {
  entries: LibraryEntry[]
  loaded: boolean
  /** A read of the library is under way. */
  loading: boolean
  /** The last read failed: what is shown may be nothing, or out of date. */
  failed: boolean
  load: () => Promise<void>
  /** Without tags an entry keeps the ones it has. */
  save: (entry: LibraryEntryInput, id?: string) => Promise<LibraryEntry>
  /** Into the trash. */
  remove: (id: string) => Promise<void>
  /** Several entries at once: tags, category, colour or the trash. */
  change: (batch: LibraryBatch) => Promise<void>
  /** What waits in the trash, the most recently deleted first. */
  trash: TrashedLibraryEntry[]
  loadTrash: () => Promise<void>
  restore: (ids: string[]) => Promise<void>
  /** Deletes entries in the trash for good. */
  purge: (ids: string[]) => Promise<void>
  /** A change to an entry's files, in line with its saves; the answer is the entry as it now is. */
  changeFiles: (id: string, run: () => Promise<LibraryEntry>) => Promise<void>
}

/** The trash is an extra: a list that cannot be read leaves the one shown. */
const loadTrash = (set: (s: Partial<LibraryStore>) => void) => api.listLibraryTrash().then((trash) => set({ trash }), () => undefined)

const sort = (list: LibraryEntry[]) => [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

export const useLibrary = create<LibraryStore>((set, get) => ({
  entries: [],
  loaded: false,
  loading: false,
  failed: false,
  load: async () => {
    set({ loading: true })
    try {
      set({ entries: await api.listLibrary(), loaded: true, loading: false, failed: false })
    } catch {
      set({ loaded: true, loading: false, failed: true })
    }
  },
  save: async (entry, id) => {
    if (!id) {
      const saved = await api.saveLibraryEntry(entry)
      set({ entries: sort([...get().entries.filter((e) => e.id !== saved.id), saved]) })
      return saved
    }
    // Shown at once; stored in the order of the changes; only the latest answer is taken over.
    const before = get().entries.find((e) => e.id === id)
    if (before) set({ entries: sort(get().entries.map((e) => (e.id === id ? ({ ...e, ...entry } as LibraryEntry) : e))) })
    const { result, isLatest } = inOrder(`library:${id}`, () => api.saveLibraryEntry(entry, id))
    try {
      const saved = await result
      if (isLatest()) set({ entries: sort([...get().entries.filter((e) => e.id !== saved.id), saved]) })
      return saved
    } catch (err) {
      if (isLatest()) void get().load()
      throw err
    }
  },
  remove: async (id) => {
    await api.deleteLibraryEntry(id)
    set({ entries: get().entries.filter((e) => e.id !== id) })
    void loadTrash(set)
  },
  change: async (batch) => {
    set({ entries: await api.changeLibraryEntries(batch) })
    if (batch.trash) void loadTrash(set)
  },
  trash: [],
  loadTrash: () => loadTrash(set),
  restore: async (ids) => {
    try {
      for (const id of ids) await api.restoreLibraryEntry(id)
    } finally {
      await get().load()
    }
  },
  purge: async (ids) => {
    try {
      for (const id of ids) await api.purgeLibraryEntry(id)
    } finally {
      await loadTrash(set)
    }
  },
  changeFiles: async (id, run) => {
    const { result, isLatest } = inOrder(`library:${id}`, run)
    const saved = await result
    if (isLatest()) set({ entries: sort([...get().entries.filter((e) => e.id !== saved.id), saved]) })
  },
}))

/** What the library's list showed: its search and filters, how far it was scrolled, and the entry opened from it. */
export interface LibraryListView {
  query: string
  filter: LibraryFilter
  scroll: number
  /** The entry last opened from the list: the focus returns to its line. */
  opened: string | null
}

/**
 * The list's view per entry of the browser's history (store/listViews.ts): the way back from an entry's page finds the
 * list as it was left, and a fresh visit of the library starts fresh.
 */
export const libraryListView = historyViews<LibraryListView>()

let trashedElsewhere: string[] = []

/** Entries put into the trash on their own page: the list, opened next, says so and offers the way back. */
export const trashedOnPage = {
  leave: (ids: string[]) => void (trashedElsewhere = ids),
  take: (): string[] => {
    const ids = trashedElsewhere
    trashedElsewhere = []
    return ids
  },
}
