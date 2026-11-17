import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AlertTriangle, Download, FileText, MonitorSpeaker, Play, Presentation, Printer, Shuffle } from 'lucide-react'
import type { WorkshopState } from '@/domain/types'
import { newId, type Op } from '@/domain/ops'
import type { DeckSlideRef } from '@/domain/deck'
import { MAX_SLIDES } from '@/domain/slides'
import { sampleTextsOf } from '@/domain/starters'
import { dropIndex, hasRoom } from '@/domain/slideMove'
import { usePlanner } from '@/store/usePlanner'
import { reportFailure } from '@/api'
import { Button, cx } from '@/components/ui'
import { Option } from './Option'
import { downloadBlob, fileSlug } from '@/print/options'
import { SlideView } from './SlideView'
import { exportDeckHtml } from './export'
import { exportDeckPptx } from './pptx'
import { exportDeckPdf } from './pdf'
import { useDeck } from './useDeck'
import { ThemeSelect } from './ThemeSelect'
import { moveSlideInPlanner, useSlideEditing, useSlideMoving } from './PlannerSlides'
import { SlideMenu, SlideSort, SortSlide, type Side } from './SlideSort'
import { pageUrl } from '@/domain/addresses'

/**
 * The whole deck in agenda order, with the generated slides; present, save as a file, print; the workshop's theme.
 * A slide opens the editor on the deck (generated slides read-only, with what can be done instead). The steps'
 * slides are sorted by dragging: within a step, and across its edge into the step of the slide dropped on; the
 * generated slides stay where the plan puts them. A slide's menu moves it to any step, duplicates and removes it.
 */
export function DeckPanel({ data, change, owner, onNotice }: { data: WorkshopState; change: (ops: Op[]) => void; owner: boolean; onNotice: (text: string) => void }) {
  const { t, i18n } = useTranslation()
  const { deck, theme, options, update, pictures } = useDeck(data)
  // the slides of the steps that still say a starter's sample words: named before the deck is shown or exported
  const sampled = useMemo(() => deck.flatMap((s, i) => (!s.generated && sampleTextsOf(s.html).length ? [{ key: s.key, n: i + 1 }] : [])), [deck])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ kind: 'pptx' | 'pdf'; done: number; of: number } | null>(null)
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
  const common = { title, theme, scope, chrome: title, lang: i18n.language, part: (p: { n: number; of: number }) => t('slides.part', p) }
  const save = async (kind: 'html' | 'pptx' | 'pdf') => {
    setBusy(true)
    const onProgress = (done: number, of: number) => kind !== 'html' && setProgress({ kind, done, of })
    try {
      if (kind === 'html') downloadBlob(`${fileSlug(title)}-folien.html`, await exportDeckHtml(deck, common))
      else if (kind === 'pdf') downloadBlob(`${fileSlug(title)}-folien.pdf`, await exportDeckPdf(deck, { ...common, onProgress }))
      else downloadBlob(`${fileSlug(title)}-folien.pptx`, await exportDeckPptx(deck, { ...common, onProgress }))
    } catch (err) {
      // a browser that will not hand out the drawn slides (a tainted canvas): the print view makes the PDF instead
      if (kind === 'pdf' && err instanceof DOMException && err.name === 'SecurityError') window.open(pageUrl(`/w/${data.workshop.id}/print/slides`), '_blank', 'noopener')
      else reportFailure(err)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  // ---- the steps' slides: sorted, moved, duplicated and removed in place, each one change of the planner ---------
  /** The step of a deck slide and its id there; null for a generated slide. */
  const place = (s: DeckSlideRef | undefined) => (s?.itemId && !s.generated ? { itemId: s.itemId, slideId: s.key.slice(s.itemId.length + 1) } : null)
  const itemNow = (id: string) => usePlanner.getState().data?.items.find((i) => i.id === id)
  const drop = (key: string, over: string, side: Side) => {
    const state = usePlanner.getState().data
    const from = place(deck.find((s) => s.key === key))
    const to = place(deck.find((s) => s.key === over))
    const target = to && itemNow(to.itemId)
    if (!state || !from || !to || !target) return
    if (from.itemId !== to.itemId && !hasRoom(target)) return onNotice(t('slides.noRoom', { title: target.title || t(`kinds.${target.kind}`), max: MAX_SLIDES }))
    const at = dropIndex(state, from.slideId, to.itemId, to.slideId, side)
    if (at !== null) moveSlideInPlanner(from.itemId, from.slideId, to.itemId, at)
  }
  const duplicate = (at: { itemId: string; slideId: string }) => {
    const slides = itemNow(at.itemId)?.slides
    const index = slides?.findIndex((s) => s.id === at.slideId) ?? -1
    if (!slides || index === -1) return
    if (slides.length >= MAX_SLIDES) return window.alert(t('slides.tooMany', { max: MAX_SLIDES, count: 1 }))
    change([{ op: 'set', entity: 'item', id: at.itemId, fields: { slides: [...slides.slice(0, index + 1), { id: newId(), html: slides[index].html }, ...slides.slice(index + 1)] } }])
  }
  const remove = (at: { itemId: string; slideId: string }) => {
    const slides = itemNow(at.itemId)?.slides
    if (!slides?.some((s) => s.id === at.slideId)) return
    change([{ op: 'set', entity: 'item', id: at.itemId, fields: { slides: slides.filter((s) => s.id !== at.slideId) } }])
    onNotice(t('slides.removed'))
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/present`), '_blank', 'noopener')} disabled={!deck.length}>
          <Play size={13} />
          {t('slides.present')}
        </Button>
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/presenter`), '_blank', 'noopener')} disabled={!deck.length}>
          <MonitorSpeaker size={13} />
          {t('slides.presenter')}
        </Button>
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/print/slides`), '_blank', 'noopener')} disabled={!deck.length}>
          <Printer size={13} />
          {t('slides.printSlides')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save('pptx')} disabled={!deck.length || busy}>
          <Presentation size={13} />
          {progress?.kind === 'pptx' ? t('slides.exporting', progress) : t('slides.downloadPptx')}
        </Button>
        <Button size="sm" onClick={() => void save('pdf')} disabled={!deck.length || busy}>
          <FileText size={13} />
          {progress?.kind === 'pdf' ? t('slides.exporting', progress) : t('slides.downloadPdf')}
        </Button>
        <Button size="sm" onClick={() => void save('html')} disabled={!deck.length || busy}>
          <Download size={13} />
          {t('slides.downloadHtml')}
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">{t('slides.exportHint')}</p>
      {owner && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-2">{t('slides.deckTheme')}</span>
          <ThemeSelect value={data.workshop.theme} onChange={(theme) => change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { theme } }])} withDefault />
          <ManageThemes />
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Option checked={options.agenda} onChange={(agenda) => update({ agenda })}>{t('slides.withAgenda')}</Option>
        <Option checked={options.breaks} onChange={(breaks) => update({ breaks })}>{t('slides.withBreaks')}</Option>
        {pictures.length > 0 && (
          <>
            <Option checked={options.pictures} onChange={(pictures) => update({ pictures })}>{t('slides.withPictures')}</Option>
            {options.pictures && pictures.length > 1 && (
              <button type="button" onClick={() => update({ shift: (options.shift ?? 0) + 1 })} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                <Shuffle size={13} />
                {t('slides.otherPictures')}
              </button>
            )}
          </>
        )}
      </div>
      {sampled.length > 0 && (
        <button type="button" onClick={() => useSlideEditing.getState().open({ kind: 'deck', key: sampled[0].key })} className="flex w-full items-start gap-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-left text-[12px] leading-snug text-amber">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t('slides.sampleSlides', { count: sampled.length, list: sampled.map((s) => s.n).join(', ') })}</span>
        </button>
      )}
      {!deck.some((s) => !s.generated) && <p className="text-[13px] text-ink-3">{t('slides.deckEmpty')}</p>}
      <ol className="grid grid-cols-2 gap-2">
        <SlideSort onDrop={drop} overlay={(key) => <SlideView html={deck.find((s) => s.key === key)?.html ?? ''} theme={theme} scope={scope} />}>
          {deck.map((s, i) => {
            const at = place(s)
            return (
              <li key={s.key} className="min-w-0">
                <SortSlide id={s.key} fixed={!at} menu={at && <SlideMenu n={i + 1} onMove={() => useSlideMoving.getState().ask(at.itemId, at.slideId)} onDuplicate={() => duplicate(at)} onRemove={() => remove(at)} />}>
                  <SlideView html={s.html} theme={theme} scope={scope} chrome={{ label: title, n: i + 1, part: s.part && t('slides.part', s.part) }} onClick={() => useSlideEditing.getState().open({ kind: 'deck', key: s.key })} label={t('slides.slide', { n: i + 1 })} />
                </SortSlide>
                <div className={cx('mt-0.5 flex gap-1 truncate text-[11px]', s.generated ? 'text-ink-3' : 'text-ink-2')}>
                  <span className="tnum">{i + 1}</span>
                  <span className="truncate">{s.generated ? t(`slides.generated.${s.generated}`, { n: '' }).trim() : s.caption}</span>
                </div>
              </li>
            )
          })}
        </SlideSort>
      </ol>
    </div>
  )
}

/** The link that sits next to every theme choice. */
export function ManageThemes() {
  const { t } = useTranslation()
  return (
    <Link to="/slides/themes" className="text-[12px] text-ink-3 hover:text-ink hover:underline">
      {t('themes.manage')}
    </Link>
  )
}
