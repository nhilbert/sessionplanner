import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Upload } from 'lucide-react'
import { api } from '@/api'
import type { Deck, DeckSlide } from '@/domain/types'
import { formatDate } from '@/i18n'
import { useSettings } from '@/store/useSettings'
import { useLibrary } from '@/store/useLibrary'
import { Button, cx, Empty, IconButton, PageHeader } from '@/components/ui'
import { Option } from '@/slides/Option'
import { SlideView } from '@/slides/SlideView'
import { forgetDecks } from '@/slides/SlidePicker'
import { findDecks, type FoundDeck, importDeck } from '@/slides/importDeck'

/** The slide pool (docs/slides.md): translated decks, uploaded once as folders; slides are picked from here into items and library entries. */
export default function DecksPage() {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const library = useLibrary()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [slides, setSlides] = useState<Record<string, DeckSlide[]>>({})
  const [found, setFound] = useState<FoundDeck[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [createEntries, setCreateEntries] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = () => api.listDecks().then(setDecks, () => setDecks([]))
  useEffect(() => {
    void load()
    if (!library.loaded) void library.load()
  }, [])

  const show = async (id: string) => {
    setOpen(open === id ? null : id)
    if (!slides[id]) setSlides({ ...slides, [id]: (await api.getDeck(id)).slides })
  }

  const choose = async (files: File[]) => {
    const list = await findDecks(files)
    if (!list.length) {
      setNotice(t('slides.noDeck'))
      return
    }
    setFound(list)
    setChosen(list.map((d) => d.folder))
  }

  const run = async () => {
    if (!found) return
    const picked = found.filter((d) => chosen.includes(d.folder))
    const total = picked.reduce((n, d) => n + d.fragments.length, 0)
    let before = 0
    let entries = 0
    setProgress({ done: 0, total })
    const existing = new Set(library.entries.map((e) => e.title.toLowerCase()))
    for (const d of picked) {
      const result = await importDeck(d, { createEntries, existingTitles: existing, categories: settings.categories.map((c) => c.id) }, (done) => setProgress({ done: before + done, total }))
      before += d.fragments.length
      entries += result.entries
    }
    setProgress(null)
    setFound(null)
    forgetDecks()
    await load()
    if (entries) await library.load()
    setNotice([t('slides.imported', { count: picked.length }), entries ? t('slides.entriesCreated', { count: entries }) : ''].filter(Boolean).join(' · '))
  }

  const remove = async (deck: Deck) => {
    if (!window.confirm(t('slides.deleteDeck', { title: deck.title }))) return
    await api.deleteDeck(deck.id)
    forgetDecks()
    await load()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader
          title={t('slides.pool')}
          subtitle={t('slides.poolSubtitle')}
          right={
            <Button size="sm" onClick={() => input.current?.click()} disabled={!!progress}>
              <Upload size={13} />
              {t('slides.uploadDeck')}
            </Button>
          }
        />
        <input
          ref={input}
          type="file"
          multiple
          hidden
          // @ts-expect-error folder selection is non-standard but universal
          webkitdirectory=""
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) void choose(files)
          }}
        />
        <p className="mb-6 text-[13px] text-ink-3">{t('slides.uploadHint')}</p>
        {notice && (
          <div className="mb-4 rounded-lg bg-accent-soft px-4 py-2 text-[13px]">
            {notice}
            <button type="button" className="ml-3 underline" onClick={() => setNotice(null)}>
              {t('common.close')}
            </button>
          </div>
        )}
        {found && (
          <div className="card mb-6 p-4">
            <div className="mb-2 text-[13px] font-medium text-ink-2">{t('slides.choose')}</div>
            <ul className="space-y-1.5">
              {found.map((d) => (
                <li key={d.folder}>
                  <Option checked={chosen.includes(d.folder)} onChange={(on) => setChosen(on ? [...chosen, d.folder] : chosen.filter((f) => f !== d.folder))}>{`${d.meta.title} · ${t('slides.count', { count: d.fragments.length })}${d.meta.entries?.length ? ` · ${t('library.items', { count: d.meta.entries.length })}` : ''}`}</Option>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Option checked={createEntries} onChange={setCreateEntries}>{t('slides.createEntries')}</Option>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => void run()} disabled={!chosen.length || !!progress}>
                {progress ? t('slides.importing', progress) : t('slides.import')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFound(null)} disabled={!!progress}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
        {decks && !decks.length && !found && <Empty title={t('slides.poolEmpty')} body={t('slides.poolEmptyHint')} />}
        <ul className="space-y-3">
          {decks?.map((d) => (
            <li key={d.id} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => void show(d.id)} aria-expanded={open === d.id} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="text-[12px] text-ink-3">
                    {t('slides.count', { count: d.slides })} · {d.theme || t('slides.themeBuiltIn')} · {formatDate(d.createdAt.slice(0, 10))}
                    {d.source && ` · ${d.source}`}
                  </div>
                </button>
                <IconButton label={t('common.delete')} onClick={() => void remove(d)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
              {open === d.id && (
                <ul className={cx('grid grid-cols-2 gap-3 border-t border-line p-4 md:grid-cols-4')}>
                  {(slides[d.id] ?? []).map((s, i) => (
                    <li key={s.id}>
                      <SlideView html={s.html} theme={d.theme || settings.theme || 'default'} scope="library" label={t('slides.slide', { n: i + 1 })} />
                      <div className="mt-1 truncate text-[11px] text-ink-3">{s.caption}</div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
