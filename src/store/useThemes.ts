import { create } from 'zustand'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { ThemeInfo } from '@/domain/theme'
import type { SlideTemplate } from '@/domain/types'
import { slideLayout } from '@/domain/slides'
import { inOrder } from './inOrder'

/** The slide themes the server has and the owner's template slides (docs/slides.md, sections 4 and 7). */
interface ThemesStore {
  themes: ThemeInfo[]
  loaded: boolean
  load: (force?: boolean) => Promise<void>
  templates: SlideTemplate[]
  templatesLoaded: boolean
  loadTemplates: (force?: boolean) => Promise<void>
  saveTemplate: (input: { name: string; html: string; position?: number }, id?: string) => Promise<SlideTemplate>
  removeTemplate: (id: string) => Promise<void>
}

const sortTemplates = (list: SlideTemplate[]) => [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

export const useThemes = create<ThemesStore>((set, get) => ({
  themes: [{ id: 'default', name: 'default', kind: 'builtin' }],
  loaded: false,
  load: async (force) => {
    if (get().loaded && !force) return
    try {
      set({ themes: await api.listThemes(), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  templates: [],
  templatesLoaded: false,
  loadTemplates: async (force) => {
    if (get().templatesLoaded && !force) return
    try {
      set({ templates: sortTemplates(await api.listSlideTemplates()), templatesLoaded: true })
    } catch {
      set({ templatesLoaded: true })
    }
  },
  saveTemplate: async (input, id) => {
    if (!id) {
      const saved = await api.saveSlideTemplate(input)
      set({ templates: sortTemplates([...get().templates.filter((t) => t.id !== saved.id), saved]) })
      return saved
    }
    // Shown at once; stored in the order of the changes; only the latest answer is taken over.
    set({ templates: sortTemplates(get().templates.map((t) => (t.id === id ? { ...t, ...input, layout: slideLayout(input.html) || t.layout } : t))) })
    const { result, isLatest } = inOrder(`template:${id}`, () => api.saveSlideTemplate(input, id))
    try {
      const saved = await result
      if (isLatest()) set({ templates: sortTemplates([...get().templates.filter((t) => t.id !== saved.id), saved]) })
      return saved
    } catch (err) {
      if (isLatest()) void get().loadTemplates(true)
      throw err
    }
  },
  removeTemplate: async (id) => {
    await api.deleteSlideTemplate(id)
    set({ templates: get().templates.filter((t) => t.id !== id) })
  },
}))

/** What to call a theme: its name, the built-in one translated. */
export const themeLabel = (info: ThemeInfo | undefined, id: string, t: TFunction): string => (id === 'default' || info?.kind === 'builtin' ? t('slides.themeBuiltIn') : info?.name || id)
