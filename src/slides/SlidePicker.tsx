import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { api } from '@/api'
import type { Deck, DeckSlide } from '@/domain/types'
import { slideText, slideTitle } from '@/domain/slides'
import { matchesWords } from '@/store/useLibrary'
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

/** Pick slides from the pool (docs/slides.md): one deck at a time, or every deck when searching; the chosen ones become copies. */
export function SlidePicker({ open, onClose, onPick, theme }: { open: boolean; onClose: () => void; onPick: (html: string[]) => void; theme: string }) {
  const { t } = useTranslation()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [deckId, setDeckId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [slides, setSlides] = useState<(DeckSlide & { deck: Deck })[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const searching = query.trim() !== ''

  useEffect(() => {
    if (!open) return
    setSelected([])
    api.listDecks().then((list) => {
      setDecks(list)
      setDeckId((id) => (list.some((d) => d.id === id) ? id : (list[0]?.id ?? '')))
    }, () => setDecks([]))
  }, [open])

  useEffect(() => {
    if (!open || !decks) return
    const wanted = searching ? decks : decks.filter((d) => d.id === deckId)
    let live = true
    Promise.all(wanted.map(async (deck) => (await slidesOf(deck.id)).map((s) => ({ ...s, deck })))).then((lists) => live && setSlides(lists.flat()))
    return () => {
      live = false
    }
  }, [open, decks, deckId, searching])

  const shown = useMemo(() => (searching ? slides.filter((s) => matchesWords(`${s.caption} ${slideText(s.html)} ${s.deck.title}`.toLowerCase(), query)) : slides), [slides, searching, query])
  const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
  const take = () => {
    const byId = new Map(slides.map((s) => [s.id, s]))
    onPick(selected.map((id) => byId.get(id)?.html).filter((h): h is string => !!h))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-5xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[16px] font-semibold">{t('slides.pool')}</h2>
        {decks && decks.length > 0 && (
          <Select value={searching ? '' : deckId} onChange={(e) => { setQuery(''); setDeckId(e.target.value) }} className="h-8 w-auto max-w-[260px] text-[13px]" aria-label={t('slides.pool')}>
            {searching && <option value="">{t('slides.allDecks')}</option>}
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} · {t('slides.count', { count: d.slides })}
              </option>
            ))}
          </Select>
        )}
        <SearchField value={query} onChange={setQuery} placeholder={t('slides.search')} className="w-full md:w-64" />
      </div>
      {decks && !decks.length && <p className="py-8 text-center text-[14px] text-ink-2">{t('slides.poolEmptyHint')}</p>}
      {searching && !shown.length && slides.length > 0 && <p className="py-8 text-center text-[14px] text-ink-2">{t('slides.noMatch', { q: query.trim() })}</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {shown.map((s) => {
          const on = selected.includes(s.id)
          return (
            <li key={s.id} className="min-w-0">
              <div className={cx('relative rounded-md ring-offset-2 ring-offset-surface', on && 'ring-2 ring-accent')}>
                <SlideView html={s.html} theme={s.deck.theme || theme} scope="library" onClick={() => toggle(s.id)} label={s.caption || slideTitle(s.html)} />
                {on && (
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                    <Check size={14} />
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[12px] text-ink-3">
                {s.caption || slideTitle(s.html)}
                {searching && <span className="text-ink-3"> · {s.deck.title}</span>}
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
