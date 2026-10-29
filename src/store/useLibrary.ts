import { create } from 'zustand'
import { api } from '@/api'
import type { LibraryEntry } from '@/domain/types'

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
