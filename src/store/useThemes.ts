import { useEffect } from 'react'
import { create } from 'zustand'
import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { PoolAsset, ThemeInfo } from '@/domain/theme'
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
  /** The pools of the data themes seen so far, by theme id; a theme without one (built in, folder) has an empty list. */
  pools: Record<string, PoolAsset[]>
  loadPool: (id: string, force?: boolean) => Promise<PoolAsset[]>
  setPool: (id: string, pool: PoolAsset[]) => void
}

const sortTemplates = (list: SlideTemplate[]) => [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

/** The list being fetched: every slide on a page asks for it at once, one request answers them all. */
let loading: Promise<void> | null = null

export const useThemes = create<ThemesStore>((set, get) => ({
  themes: [{ id: 'default', name: 'default', kind: 'builtin' }],
  loaded: false,
  load: (force) => {
    if (get().loaded && !force) return Promise.resolve()
    if (loading && !force) return loading
    const run = api.listThemes().then(
      (themes) => set({ themes, loaded: true }),
      () => set({ loaded: true }),
    )
    const done = run.finally(() => {
      if (loading === done) loading = null
    })
    loading = done
    return done
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
  pools: {},
  loadPool: async (id, force) => {
    const known = get().pools[id]
    if (known && !force) return known
    const info = get().themes.find((t) => t.id === id)
    // Only a data theme has a pool; the others are asked once and remembered as empty.
    const pool = info && info.kind !== 'data' && get().loaded ? [] : await api.getPool(id).catch(() => [] as PoolAsset[])
    set({ pools: { ...get().pools, [id]: pool } })
    return pool
  },
  setPool: (id, pool) => set({ pools: { ...get().pools, [id]: pool } }),
}))

/** The pool of a theme, loaded once per theme version (a change in the editor or elsewhere loads it again). */
export function usePool(theme: string): PoolAsset[] {
  const pool = useThemes((s) => s.pools[theme])
  const version = useThemes((s) => s.themes.find((x) => x.id === theme)?.updatedAt)
  const loadPool = useThemes((s) => s.loadPool)
  const loaded = useThemes((s) => s.loaded)
  useEffect(() => {
    if (theme && theme !== PREVIEW_THEME && loaded) void loadPool(theme, true)
  }, [theme, version, loaded, loadPool])
  return pool ?? EMPTY_POOL
}
const EMPTY_POOL: PoolAsset[] = []
/** The theme editor's preview theme has no pool of its own. */
const PREVIEW_THEME = 'preview-theme'

/** What to call a theme: its name, the built-in one translated. */
export const themeLabel = (info: ThemeInfo | undefined, id: string, t: TFunction): string => (id === 'default' || info?.kind === 'builtin' ? t('slides.themeBuiltIn') : info?.name || id)
