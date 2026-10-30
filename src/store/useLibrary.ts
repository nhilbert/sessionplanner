import { create } from 'zustand'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { Category, ItemContent, LibraryEntry } from '@/domain/types'
import { categoryName } from './useSettings'

/** What a library search looks through: titles, descriptions, goal, method, lead, the category and a group's items. */
export function libraryText(e: LibraryEntry, categories: Category[], t: TFunction): string {
  const item = (i: ItemContent) => [i.title, i.description, i.goal, i.method, i.lead, ...categories.filter((c) => c.id === i.categoryId).map((c) => categoryName(c, t))]
  return [e.title, ...(e.kind === 'group' ? e.data.items.flatMap(item) : item(e.data))].join(' ').toLowerCase()
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
    const saved = await api.saveLibraryEntry(entry, id)
    set({ entries: sort([...get().entries.filter((e) => e.id !== saved.id), saved]) })
    return saved
  },
  remove: async (id) => {
    await api.deleteLibraryEntry(id)
    set({ entries: get().entries.filter((e) => e.id !== id) })
  },
}))
