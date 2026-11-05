import { create } from 'zustand'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { Category, ItemContent, LibraryEntry } from '@/domain/types'
import { categoryName } from './useSettings'
import { inOrder } from './inOrder'

/** What a library search looks through: titles, descriptions, goal, method, lead, the category, a group's items and the file names. */
export function libraryText(e: LibraryEntry, categories: Category[], t: TFunction): string {
  const item = (i: ItemContent) => [i.title, i.description, i.goal, i.method, i.lead, ...categories.filter((c) => c.id === i.categoryId).map((c) => categoryName(c, t))]
  return [e.title, ...(e.kind === 'group' ? e.data.items.flatMap(item) : item(e.data)), ...e.attachments.map((a) => a.name)].join(' ').toLowerCase()
}

/** Every typed word occurs somewhere in the text. */
export const matchesWords = (text: string, query: string): boolean => query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w))

/** The shared library of items and groups (server: /api/library). */
interface LibraryStore {
  entries: LibraryEntry[]
  loaded: boolean
  load: () => Promise<void>
  save: (entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>, id?: string) => Promise<LibraryEntry>
  remove: (id: string) => Promise<void>
  /** A change to an entry's files, in line with its saves; the answer is the entry as it now is. */
  changeFiles: (id: string, run: () => Promise<LibraryEntry>) => Promise<void>
}

const sort = (list: LibraryEntry[]) => [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

export const useLibrary = create<LibraryStore>((set, get) => ({
  entries: [],
  loaded: false,
  load: async () => {
    try {
      set({ entries: await api.listLibrary(), loaded: true })
    } catch {
      set({ loaded: true })
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
  },
  changeFiles: async (id, run) => {
    const { result, isLatest } = inOrder(`library:${id}`, run)
    const saved = await result
    if (isLatest()) set({ entries: sort([...get().entries.filter((e) => e.id !== saved.id), saved]) })
  },
}))
