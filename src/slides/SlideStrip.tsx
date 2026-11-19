import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { AssetScope } from '@/api'
import type { Slide } from '@/domain/types'
import { newId } from '@/domain/ops'
import { MAX_SLIDES, normalizeSlideHtml } from '@/domain/slides'
import { Button, SectionLabel } from '@/components/ui'
import { SlideView } from './SlideView'
import { SlidePicker } from './SlidePicker'
import { NewSlidePicker } from './NewSlidePicker'
import { SlideMenu, SlideSort, SortSlide, type Side } from './SlideSort'

/**
 * The slides of a step or a library entry (docs/slides.md, section 7): thumbnails in order. A thumbnail opens the
 * slide editor on it (the host opens it, so the editor is the same wherever slides are shown); "New slide" adds one
 * from a template, a layout, a picture or the pool and opens it for editing; a thumbnail opens the slide to look at.
 * Who may edit sorts the slides by dragging a thumbnail, and duplicates, removes or (in a workshop) moves a slide
 * to another step from the thumbnail's menu.
 */
export function SlideStrip({
  slides,
  list,
  onOpen,
  scope,
  theme,
  canEdit,
  owner,
  onMove,
  onRemoved,
  heading = true,
}: {
  /** Off where the place names the slides itself (a section of the details that folds). */
  heading?: boolean
  slides: Slide[]
  /** The list as the store has it now, and how to store a new one. */
  list: { get(): Slide[]; set(slides: Slide[]): void }
  /** Thumbnails open to look at; a slide just added and "Edit slides" open straight into editing. */
  onOpen: (key: string, mode: 'view' | 'edit') => void
  scope: AssetScope
  theme: string
  canEdit: boolean
  owner: boolean
  /** A workshop: asks where the slide should move to. */
  onMove?: (slideId: string) => void
  /** Where removing can be undone (the planner): called once a slide is gone. Without it, removing asks first. */
  onRemoved?: () => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [pool, setPool] = useState(false)
  /** Appends slides, as many as the limit allows (the server refuses more), and opens the first in the editor. */
  const add = (html: string[], edit: boolean) => {
    const current = list.get()
    const room = Math.max(0, MAX_SLIDES - current.length)
    if (html.length > room) window.alert(t('slides.tooMany', { max: MAX_SLIDES, count: html.length - room }))
    if (!room) return
    const fresh = html.slice(0, room).map((h) => ({ id: newId(), html: normalizeSlideHtml(h) }))
    list.set([...current, ...fresh])
    if (edit) onOpen(fresh[0].id, 'edit')
  }
  const drop = (id: string, over: string, side: Side) => {
    const current = list.get()
    const slide = current.find((x) => x.id === id)
    const rest = current.filter((x) => x.id !== id)
    const at = rest.findIndex((x) => x.id === over)
    if (!slide || at === -1) return
    const next = [...rest]
    next.splice(at + (side === 'after' ? 1 : 0), 0, slide)
    if (next.some((x, i) => x.id !== current[i].id)) list.set(next)
  }
  const duplicate = (id: string) => {
    const current = list.get()
    const at = current.findIndex((x) => x.id === id)
    if (at === -1) return
    if (current.length >= MAX_SLIDES) return window.alert(t('slides.tooMany', { max: MAX_SLIDES, count: 1 }))
    list.set([...current.slice(0, at + 1), { id: newId(), html: current[at].html }, ...current.slice(at + 1)])
  }
  const remove = (id: string) => {
    if (!onRemoved && !window.confirm(t('slides.removeConfirm'))) return
    const current = list.get()
    if (!current.some((x) => x.id === id)) return
    list.set(current.filter((x) => x.id !== id))
    onRemoved?.()
  }

  return (
    <div>
      {heading && <SectionLabel>{t('slides.title')}</SectionLabel>}
      {slides.length === 0 && <p className="mb-1.5 text-[13px] text-ink-3">{t('slides.empty')}</p>}
      <div className="flex flex-wrap gap-2">
        <SlideSort onDrop={drop} overlay={(id) => <SlideView html={slides.find((x) => x.id === id)?.html ?? ''} theme={theme} scope={scope} />}>
          {slides.map((s, i) => (
            <SortSlide
              key={s.id}
              id={s.id}
              fixed={!canEdit}
              className="w-[132px] max-md:w-[calc(50%-4px)]"
              menu={canEdit && <SlideMenu n={i + 1} onMove={onMove && (() => onMove(s.id))} onDuplicate={() => duplicate(s.id)} onRemove={() => remove(s.id)} />}
            >
              <SlideView html={s.html} theme={theme} scope={scope} onClick={() => onOpen(s.id, 'view')} label={t('slides.slide', { n: i + 1 })} />
              <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-medium text-paper tnum">{i + 1}</span>
            </SortSlide>
          ))}
        </SlideSort>
        {canEdit && (
          <button type="button" onClick={() => setAdding(true)} className="flex aspect-video w-[132px] items-center justify-center gap-1 rounded border border-dashed border-line-2 text-[12px] text-ink-3 transition-colors hover:border-ink-3 hover:text-ink max-md:w-[calc(50%-4px)]" aria-label={t('slides.new')}>
            <Plus size={14} />
            {t('slides.new')}
          </button>
        )}
      </div>
      {canEdit && slides.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => onOpen(slides[0].id, 'edit')}>
          {t('slides.edit')}
        </Button>
      )}
      <NewSlidePicker open={adding} onClose={() => setAdding(false)} onPick={add} onPool={owner ? () => setPool(true) : undefined} theme={theme} scope={scope} owner={owner} />
      {owner && <SlidePicker open={pool} onClose={() => setPool(false)} onPick={(html) => add(html, false)} theme={theme} />}
    </div>
  )
}
