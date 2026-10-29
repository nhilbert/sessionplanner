import { create } from 'zustand'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import { type Category, DEFAULT_SETTINGS, type Item, type Me, type PaletteKey, type Settings } from '@/domain/types'

/** Settings shared by all workshops (server: GET/PUT /api/settings). Saved right away, one change at a time. */
interface SettingsStore {
  settings: Settings
  loaded: boolean
  /** Who is signed in; until known, treated as the owner (the server decides anyway). */
  me: Me
  loadMe: () => Promise<void>
  load: () => Promise<void>
  update: (patch: Partial<Omit<Settings, 'logo'>>) => void
  setLogo: (file: File) => Promise<void>
  removeLogo: () => Promise<void>
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  me: { email: null, owner: true },
  loadMe: async () => {
    try {
      set({ me: await api.me() })
    } catch {
      /* stays as is; the server refuses what is not allowed */
    }
  },
  load: async () => {
    try {
      set({ settings: await api.getSettings(), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    const { logo: _logo, ...body } = settings
    void api.saveSettings(body).catch(() => void get().load())
  },
  setLogo: async (file) => set({ settings: await api.uploadLogo(file) }),
  removeLogo: async () => set({ settings: await api.deleteLogo() }),
}))

export const categoryName = (c: Category, t: TFunction): string => c.name.trim() || t(`categories.${c.id}`, { defaultValue: c.id })

/** The colour an item shows: its own, else its category's, else none. */
export function itemColor(item: Pick<Item, 'color' | 'categoryId'>, categories: Category[]): PaletteKey | null {
  return item.color ?? categories.find((c) => c.id === item.categoryId)?.color ?? null
}

export const colorVar = (key: PaletteKey | null): string | undefined => (key ? `var(--c-${key})` : undefined)
