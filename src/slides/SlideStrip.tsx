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

/**
 * The slides of a step or a library entry (docs/slides.md, section 7): thumbnails in order. A thumbnail opens the
 * slide editor on it (the host opens it, so the editor is the same wherever slides are shown); "New slide" adds one
 * from a template, a layout, a picture or the pool and opens it.
 */
export function SlideStrip({ slides, list, onOpen, scope, theme, canEdit, owner }: { slides: Slide[]; /** The list as the store has it now, and how to store a new one. */ list: { get(): Slide[]; set(slides: Slide[]): void }; onOpen: (key: string) => void; scope: AssetScope; theme: string; canEdit: boolean; owner: boolean }) {
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
    if (edit) onOpen(fresh[0].id)
  }

  return (
    <div>
      <SectionLabel>{t('slides.title')}</SectionLabel>
      {slides.length === 0 && <p className="mb-1.5 text-[13px] text-ink-3">{t('slides.empty')}</p>}
      <div className="flex flex-wrap gap-2">
        {slides.map((s, i) => (
          <div key={s.id} className="relative w-[132px] max-md:w-[calc(50%-4px)]">
            <SlideView html={s.html} theme={theme} scope={scope} onClick={() => onOpen(s.id)} label={t('slides.slide', { n: i + 1 })} />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-medium text-paper tnum">{i + 1}</span>
          </div>
        ))}
        {canEdit && (
          <button type="button" onClick={() => setAdding(true)} className="flex aspect-video w-[132px] items-center justify-center gap-1 rounded border border-dashed border-line-2 text-[12px] text-ink-3 transition-colors hover:border-ink-3 hover:text-ink max-md:w-[calc(50%-4px)]" aria-label={t('slides.new')}>
            <Plus size={14} />
            {t('slides.new')}
          </button>
        )}
      </div>
      {slides.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => onOpen(slides[0].id)}>
          {t('slides.edit')}
        </Button>
      )}
      <NewSlidePicker open={adding} onClose={() => setAdding(false)} onPick={add} onPool={owner ? () => setPool(true) : undefined} theme={theme} scope={scope} owner={owner} />
      {owner && <SlidePicker open={pool} onClose={() => setPool(false)} onPick={(html) => add(html, false)} theme={theme} />}
    </div>
  )
}
