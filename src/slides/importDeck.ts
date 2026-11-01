import { api } from '@/api'
import type { Deck, ItemContent, ItemKind } from '@/domain/types'
import { newId } from '@/domain/ops'
import { normalizeSlideHtml, slideTitle } from '@/domain/slides'

/** The manifest of a translated deck (docs/slides.md, section 6; .claude/skills/deck-translate). */
export interface DeckMeta {
  title: string
  theme?: string
  source?: string
  entries?: { title: string; kind?: string; category?: string; duration?: number; method?: string; material?: string; notes?: string; slides: string[] }[]
}

export interface FoundDeck {
  /** Folder of the deck.json inside the chosen folder. */
  folder: string
  meta: DeckMeta
  /** One file per slide, in order. */
  fragments: File[]
  /** Every file of the selection, by its relative path. */
  all: Map<string, File>
}

const pathOf = (f: File): string => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name

/** The decks in a chosen folder: every deck.json with the slide files beside it. */
export async function findDecks(files: File[]): Promise<FoundDeck[]> {
  const all = new Map(files.map((f) => [pathOf(f), f]))
  const found: FoundDeck[] = []
  for (const [p, f] of all) {
    if (!p.endsWith('/deck.json') && p !== 'deck.json') continue
    const folder = p.slice(0, p.length - 'deck.json'.length)
    let meta: DeckMeta
    try {
      meta = JSON.parse(await f.text()) as DeckMeta
    } catch {
      continue
    }
    if (!meta || typeof meta.title !== 'string') continue
    const fragments = [...all.entries()]
      .filter(([q]) => q.startsWith(folder) && q.endsWith('.html') && !q.slice(folder.length).includes('/'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, file]) => file)
    if (fragments.length) found.push({ folder, meta, fragments, all })
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder))
}

/** A referenced picture: next to the deck, else anywhere in the selection under assets/. */
function assetFile(found: FoundDeck, name: string): File | undefined {
  const root = found.folder.replace(/decks\/[^/]+\/$/, '')
  return found.all.get(`${found.folder}assets/${name}`) ?? found.all.get(`${root}assets/${name}`) ?? [...found.all.entries()].find(([p]) => p.endsWith(`/assets/${name}`))?.[1]
}

const KINDS: ItemKind[] = ['block', 'break', 'marker', 'note']

/**
 * Uploads one translated deck into the pool: its pictures once by content, its slides sanitised; optionally the
 * library entries its manifest proposes (existing titles are skipped). Reports progress in slides.
 */
export async function importDeck(found: FoundDeck, options: { createEntries: boolean; existingTitles: Set<string>; categories: string[] }, progress?: (done: number, total: number) => void): Promise<{ deck: Deck; entries: number }> {
  const hashes = new Map<string, string>()
  const slides: { file: string; html: string; caption: string }[] = []
  let done = 0
  for (const file of found.fragments) {
    let html = await file.text()
    for (const m of [...html.matchAll(/src="assets\/([^"]+)"/g)]) {
      const name = m[1]
      let hash = hashes.get(name)
      if (!hash) {
        const picture = assetFile(found, name)
        if (!picture) continue
        hash = (await api.uploadAsset('library', picture)).hash
        hashes.set(name, hash)
      }
      html = html.replace(m[0], `src="asset:${hash}"`)
    }
    html = normalizeSlideHtml(html)
    slides.push({ file: pathOf(file).slice(found.folder.length), html, caption: slideTitle(html) })
    progress?.(++done, found.fragments.length)
  }
  const { deck } = await api.createDeck({ title: found.meta.title, theme: found.meta.theme ?? '', source: found.meta.source ?? found.folder.replace(/\/$/, ''), slides: slides.map(({ html, caption }) => ({ html, caption })) })
  let entries = 0
  if (options.createEntries) {
    const byFile = new Map(slides.map((s) => [s.file, s.html]))
    for (const e of found.meta.entries ?? []) {
      if (!e.title || options.existingTitles.has(e.title.toLowerCase())) continue
      const kind = KINDS.includes(e.kind as ItemKind) ? (e.kind as ItemKind) : 'block'
      const data: ItemContent = {
        kind,
        title: e.title,
        description: '',
        duration: typeof e.duration === 'number' ? e.duration : kind === 'break' ? 15 : 30,
        goal: '',
        method: e.method ?? '',
        lead: '',
        notes: e.notes ?? '',
        materials: (e.material ?? '').split(',').map((m) => m.trim()).filter(Boolean).map((label) => ({ id: newId(), label, qty: 1 })),
        slides: e.slides.map((f) => byFile.get(f)).filter((h): h is string => !!h).map((html) => ({ id: newId(), html })),
        categoryId: e.category && options.categories.includes(e.category) ? e.category : null,
        color: null,
      }
      await api.saveLibraryEntry({ kind: 'item', title: e.title, data })
      options.existingTitles.add(e.title.toLowerCase())
      entries++
    }
  }
  return { deck, entries }
}
