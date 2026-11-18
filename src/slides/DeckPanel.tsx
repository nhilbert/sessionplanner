import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Shuffle } from 'lucide-react'
import type { WorkshopState } from '@/domain/types'
import { newId, type Op } from '@/domain/ops'
import type { DeckSlideRef } from '@/domain/deck'
import { MAX_SLIDES } from '@/domain/slides'
import { sampleTextsOf } from '@/domain/starters'
import { dropIndex, hasRoom } from '@/domain/slideMove'
import { usePlanner } from '@/store/usePlanner'
import { cx } from '@/components/ui'
import { Option } from './Option'
import { SlideView } from './SlideView'
import { useDeck } from './useDeck'
import { moveSlideInPlanner, useSlideEditing, useSlideMoving } from './PlannerSlides'
import { SlideMenu, SlideSort, SortSlide, type Side } from './SlideSort'

/**
 * The whole deck in agenda order, with the generated slides, and which generated slides it shows. Presenting, printing
 * and saving it are in the workshop's header (Present, Output), its theme in the workshop's details. A slide opens
 * the editor on the deck (generated slides read-only, with what can be done instead). The steps'
 * slides are sorted by dragging: within a step, and across its edge into the step of the slide dropped on; the
 * generated slides stay where the plan puts them. A slide's menu moves it to any step, duplicates and removes it.
 */
export function DeckPanel({ data, change, onNotice }: { data: WorkshopState; change: (ops: Op[]) => void; onNotice: (text: string) => void }) {
  const { t } = useTranslation()
  const { deck, theme, options, update, pictures } = useDeck(data)
  // the slides of the steps that still say a starter's sample words: named before the deck is shown or exported
  const sampled = useMemo(() => deck.flatMap((s, i) => (!s.generated && sampleTextsOf(s.html).length ? [{ key: s.key, n: i + 1 }] : [])), [deck])
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
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
