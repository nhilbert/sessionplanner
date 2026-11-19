import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { api } from '@/api'
import type { Deck, DeckSlide, LibraryEntry } from '@/domain/types'
import { entryItems } from '@/domain/copy'
import { slideText, slideTitle } from '@/domain/slides'
import { matchesWords, useLibrary } from '@/store/useLibrary'
import { Button, cx, Modal, SearchField, Select } from '@/components/ui'
import { SlideView } from './SlideView'

const cache = new Map<string, DeckSlide[]>()
async function slidesOf(id: string): Promise<DeckSlide[]> {
  const hit = cache.get(id)
  if (hit) return hit
  const { slides } = await api.getDeck(id)
  cache.set(id, slides)
  return slides
}
/** The pool changed (a deck uploaded or deleted): forget what was loaded. */
export const forgetDecks = () => cache.clear()

/** What slides are picked from: a deck of the pool, or a library entry that holds slides. */
interface Source {
  id: string
  title: string
  theme: string
  count: number
  library: boolean
}
type Found = { id: string; html: string; caption: string; source: Source }

const LIB = 'library:'
/** The library entries that hold slides, as sources beside the decks. */
const librarySources = (entries: LibraryEntry[]): Source[] =>
  entries.flatMap((e) => {
    const count = entryItems(e).reduce((n, c) => n + (c.slides ?? []).length, 0)
    return count ? [{ id: LIB + e.id, title: e.title, theme: '', count, library: true }] : []
  })
/** An entry's slides in order; in a group each is named after its step. */
const librarySlides = (entry: LibraryEntry, source: Source): Found[] =>
  entryItems(entry).flatMap((c, n) => (c.slides ?? []).map((s) => ({ id: `${source.id}:${n}:${s.id}`, html: s.html, caption: entry.kind === 'group' && c.title ? `${slideTitle(s.html)} · ${c.title}` : '', source })))

/**
 * Pick existing slides (docs/slides.md): from a deck of the pool or from a library entry, one at a time, or from all
 * of them when searching; the chosen ones become copies.
 */
export function SlidePicker({ open, onClose, onPick, theme }: { open: boolean; onClose: () => void; onPick: (html: string[]) => void; theme: string }) {
  const { t } = useTranslation()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [deckId, setDeckId] = useState<string>('')
  const [query, setQuery] = useState('')
  const entries = useLibrary((st) => st.entries)
  const libraryRead = useLibrary((st) => st.loaded)
  const loadLibrary = useLibrary((st) => st.load)
  const [slides, setSlides] = useState<Found[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const searching = query.trim() !== ''

  useEffect(() => {
    if (!open) return
    setSelected([])
    void loadLibrary()
    api.listDecks().then(setDecks, () => setDecks([]))
  }, [open, loadLibrary])

  // none before both are read: an empty pool beside a library still on its way is not "no slides anywhere"
  const sources = useMemo<Source[] | null>(
    () => (decks && libraryRead ? [...decks.map((d) => ({ id: d.id, title: d.title, theme: d.theme, count: d.slides, library: false })), ...librarySources(entries)] : null),
    [decks, libraryRead, entries],
  )
  const pool = sources?.filter((s) => !s.library) ?? []
  const library = sources?.filter((s) => s.library) ?? []
  // the source shown: the one chosen, or the first there is
  const current = sources?.find((s) => s.id === deckId) ?? sources?.[0]

  useEffect(() => {
    if (!open || !sources) return
    const wanted = searching ? sources : sources.filter((s) => s.id === current?.id)
    let live = true
    Promise.all(
      wanted.map(async (source): Promise<Found[]> => {
        if (!source.library) return (await slidesOf(source.id)).map((s: DeckSlide) => ({ id: s.id, html: s.html, caption: s.caption, source }))
        const entry = entries.find((e) => LIB + e.id === source.id)
        return entry ? librarySlides(entry, source) : []
      }),
    ).then((lists) => live && setSlides(lists.flat()))
    return () => {
      live = false
    }
  }, [open, sources, entries, current?.id, searching])

  const shown = useMemo(() => (searching ? slides.filter((s) => matchesWords(`${s.caption} ${slideText(s.html)} ${s.source.title}`.toLowerCase(), query)) : slides), [slides, searching, query])
  const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
  const take = () => {
    const byId = new Map(slides.map((s) => [s.id, s]))
    onPick(selected.map((id) => byId.get(id)?.html).filter((h): h is string => !!h))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-5xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[16px] font-semibold">{t('slides.existing')}</h2>
        {sources && sources.length > 0 && (
          <Select value={searching ? '' : (current?.id ?? '')} onChange={(e) => { setQuery(''); setDeckId(e.target.value) }} className="h-8 w-auto max-w-[260px] text-[13px]" aria-label={t('slides.source')}>
            {searching && <option value="">{t('slides.allSources')}</option>}
            {[
              { label: t('slides.pool'), list: pool },
              { label: t('nav.library'), list: library },
            ].map(
              (group) =>
                group.list.length > 0 && (
                  <optgroup key={group.label} label={group.label}>
                    {group.list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} · {t('slides.count', { count: s.count })}
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </Select>
        )}
        <SearchField value={query} onChange={setQuery} placeholder={t('slides.search')} className="w-full md:w-64" />
      </div>
      {sources && !sources.length && <p className="py-8 text-center text-[14px] text-ink-2">{t('slides.existingEmpty')}</p>}
      {searching && !shown.length && slides.length > 0 && <p className="py-8 text-center text-[14px] text-ink-2">{t('slides.noMatch', { q: query.trim() })}</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {shown.map((s) => {
          const on = selected.includes(s.id)
          return (
            <li key={s.id} className="min-w-0">
              <div className={cx('relative rounded-md ring-offset-2 ring-offset-surface', on && 'ring-2 ring-accent')}>
                <SlideView html={s.html} theme={s.source.theme || theme} scope="library" onClick={() => toggle(s.id)} label={s.caption || slideTitle(s.html)} />
                {on && (
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                    <Check size={14} />
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[12px] text-ink-3">
                {s.caption || slideTitle(s.html)}
                {searching && <span className="text-ink-3"> · {s.source.title}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" disabled={!selected.length} onClick={take}>
          {t('slides.take', { count: selected.length })}
        </Button>
      </div>
    </Modal>
  )
}
