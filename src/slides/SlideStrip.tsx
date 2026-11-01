import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { AssetScope } from '@/api'
import type { Slide } from '@/domain/types'
import { newId } from '@/domain/ops'
import { normalizeSlideHtml, slideAssets } from '@/domain/slides'
import { Button, SectionLabel } from '@/components/ui'
import { SlideView } from './SlideView'
import { SlidePicker } from './SlidePicker'
import { NewSlidePicker } from './NewSlidePicker'
import { SlideEditor } from './editor/SlideEditor'

/**
 * The slides of a step or a library entry (docs/slides.md): thumbnails in order; a click opens the editor, which
 * pages through them. New slides come from a template, a blank layout, a picture or the pool. The strip keeps its
 * own copy of the list, so a change shows at once even where saving takes a round trip (the library).
 */
export function SlideStrip({ slides, onChange, scope, theme, canEdit, owner, assets = [], onNotice }: { slides: Slide[]; onChange: (slides: Slide[]) => void; scope: AssetScope; theme: string; canEdit: boolean; owner: boolean; /** Pictures shown nearby (the workshop's other slides), offered by the picture picker. */ assets?: string[]; onNotice?: (text: string) => void }) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(slides)
  const [stored, setStored] = useState(slides)
  if (stored !== slides) {
    // The stored list changed (saved, or changed elsewhere): follow it.
    setStored(slides)
    setLocal(slides)
  }
  const [open, setOpen] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [pool, setPool] = useState(false)
  const change = (next: Slide[]) => {
    setLocal(next)
    onChange(next)
  }
  const add = (html: string[], edit: boolean) => {
    const fresh = html.map((h) => ({ id: newId(), html: normalizeSlideHtml(h) }))
    const at = open !== null ? open + 1 : local.length
    change([...local.slice(0, at), ...fresh, ...local.slice(at)])
    if (edit) setOpen(at)
  }
  const known = useMemo(() => [...new Set([...local.flatMap((s) => slideAssets(s.html)), ...assets])], [local, assets])
  useEffect(() => {
    if (open !== null && open >= local.length) setOpen(local.length ? local.length - 1 : null)
  }, [open, local.length])

  return (
    <div>
      <SectionLabel>{t('slides.title')}</SectionLabel>
      {local.length === 0 && <p className="mb-1.5 text-[13px] text-ink-3">{t('slides.empty')}</p>}
      <div className="flex flex-wrap gap-2">
        {local.map((s, i) => (
          <div key={s.id} className="relative w-[132px] max-md:w-[calc(50%-4px)]">
            <SlideView html={s.html} theme={theme} scope={scope} onClick={() => setOpen(i)} label={t('slides.slide', { n: i + 1 })} />
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
      {canEdit && local.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setOpen(0)}>
          {t('slides.edit')}
        </Button>
      )}
      {open !== null && local[open] && (
        <SlideEditor slides={local} index={open} onIndex={setOpen} onChange={change} onClose={() => setOpen(null)} onAdd={canEdit ? () => setAdding(true) : undefined} theme={theme} scope={scope} owner={owner} canEdit={canEdit} known={known} onNotice={onNotice} paused={adding || pool} />
      )}
      {/* After the editor in the tree, so these dialogs paint above it when opened from there. */}
      <NewSlidePicker open={adding} onClose={() => setAdding(false)} onPick={add} onPool={owner ? () => setPool(true) : undefined} theme={theme} scope={scope} owner={owner} />
      {owner && <SlidePicker open={pool} onClose={() => setPool(false)} onPick={(html) => add(html, false)} theme={theme} />}
    </div>
  )
}
