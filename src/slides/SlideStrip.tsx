import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Code, Image, LayoutTemplate, MoveLeft, MoveRight, Plus, Trash2 } from 'lucide-react'
import { api, type AssetScope } from '@/api'
import type { Slide } from '@/domain/types'
import { newId } from '@/domain/ops'
import { normalizeSlideHtml, slideLayout, slideTitle } from '@/domain/slides'
import { Button, IconButton, Modal, SectionLabel, Textarea } from '@/components/ui'
import Menu from '@/components/Menu'
import { SlideView } from './SlideView'
import { SlidePicker } from './SlidePicker'
import { pictureSlide, TEMPLATES, template } from './templates'

/**
 * The slides of a step or a library entry (docs/slides.md): thumbnails in order, a click shows one large with its
 * neighbours; there it can be moved, removed, or its source corrected. New slides come from the pool, from a
 * picture, or as a blank layout.
 */
export function SlideStrip({ slides, onChange, scope, theme, canEdit, owner }: { slides: Slide[]; onChange: (slides: Slide[]) => void; scope: AssetScope; theme: string; canEdit: boolean; owner: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const add = (html: string[]) => onChange([...slides, ...html.map((h) => ({ id: newId(), html: normalizeSlideHtml(h) }))])
  const words = {
    title: t('slides.placeholder.title'),
    text: t('slides.placeholder.text'),
    point: t('slides.placeholder.point'),
    lead: t('slides.placeholder.lead'),
    step: t('slides.placeholder.step'),
    quote: t('slides.placeholder.quote'),
    cite: t('slides.placeholder.cite'),
    eyebrow: t('slides.placeholder.eyebrow'),
  }
  const upload = async (files: File[]) => {
    setBusy(true)
    const html: string[] = []
    for (const file of files) {
      try {
        const asset = await api.uploadAsset(scope, file)
        html.push(pictureSlide(asset.hash, file.name.replace(/\.[a-z0-9]+$/i, '')))
      } catch {
        window.alert(t('files.failed', { name: file.name }))
      }
    }
    setBusy(false)
    if (html.length) add(html)
  }
  const current = open !== null ? slides[open] : undefined

  return (
    <div>
      <SectionLabel>{t('slides.title')}</SectionLabel>
      {slides.length === 0 && <p className="mb-1.5 text-[13px] text-ink-3">{t('slides.empty')}</p>}
      <div className="flex flex-wrap gap-2">
        {slides.map((s, i) => (
          <div key={s.id} className="relative w-[132px] max-md:w-[calc(50%-4px)]">
            <SlideView html={s.html} theme={theme} scope={scope} onClick={() => setOpen(i)} label={t('slides.slide', { n: i + 1 })} />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-medium text-paper tnum">{i + 1}</span>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-1.5 flex items-center gap-2">
          <Menu
            align="left"
            label={t('slides.add')}
            trigger={
              <span className="inline-flex items-center gap-1 text-[13px]">
                <Plus size={13} />
                {busy ? t('common.uploading') : t('slides.add')}
              </span>
            }
            items={[
              ...(owner ? [{ label: t('slides.fromPool'), icon: <LayoutTemplate size={15} />, onSelect: () => setPicker(true) }] : []),
              { label: t('slides.picture'), icon: <Image size={15} />, onSelect: () => input.current?.click() },
              ...TEMPLATES.map((key) => ({ label: t('slides.blank', { layout: t(`slides.layouts.${key}`) }), icon: <Plus size={15} />, onSelect: () => add([template(key, words)]) })),
            ]}
          />
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void upload(files)
            }}
          />
        </div>
      )}
      {owner && <SlidePicker open={picker} onClose={() => setPicker(false)} onPick={add} theme={theme} />}
      <Modal open={current !== undefined} onClose={() => setOpen(null)} width="max-w-5xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
        {current && open !== null && (
          <Lightbox
            slide={current}
            index={open}
            count={slides.length}
            theme={theme}
            scope={scope}
            canEdit={canEdit}
            onPrev={() => setOpen(Math.max(0, open - 1))}
            onNext={() => setOpen(Math.min(slides.length - 1, open + 1))}
            onMove={(dir) => {
              const to = open + dir
              if (to < 0 || to >= slides.length) return
              const next = [...slides]
              ;[next[open], next[to]] = [next[to], next[open]]
              onChange(next)
              setOpen(to)
            }}
            onSource={(html) => onChange(slides.map((s) => (s.id === current.id ? { ...s, html: normalizeSlideHtml(html) } : s)))}
            onRemove={() => {
              onChange(slides.filter((s) => s.id !== current.id))
              setOpen(slides.length > 1 ? Math.min(open, slides.length - 2) : null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function Lightbox({ slide, index, count, theme, scope, canEdit, onPrev, onNext, onMove, onSource, onRemove }: { slide: Slide; index: number; count: number; theme: string; scope: AssetScope; canEdit: boolean; onPrev: () => void; onNext: () => void; onMove: (dir: -1 | 1) => void; onSource: (html: string) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [source, setSource] = useState(false)
  const [draft, setDraft] = useState(slide.html)
  const [editingId, setEditingId] = useState(slide.id)
  if (editingId !== slide.id) {
    setEditingId(slide.id)
    setDraft(slide.html)
  }
  return (
    <div className="space-y-3" onKeyDown={(e) => {
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }}>
      <div className="flex flex-wrap items-center gap-1">
        <IconButton label={t('slides.prev')} onClick={onPrev} disabled={index === 0}>
          <ChevronLeft size={16} />
        </IconButton>
        <span className="text-[13px] text-ink-2 tnum">{index + 1} / {count}</span>
        <IconButton label={t('slides.next')} onClick={onNext} disabled={index >= count - 1}>
          <ChevronRight size={16} />
        </IconButton>
        <span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-ink-3 max-md:order-last max-md:basis-full max-md:ml-0">
          {slideTitle(slide.html)} <span className="text-ink-3">· {slideLayout(slide.html)}</span>
        </span>
        {canEdit && (
          <>
            <IconButton label={t('slides.left')} onClick={() => onMove(-1)} disabled={index === 0}>
              <MoveLeft size={15} />
            </IconButton>
            <IconButton label={t('slides.right')} onClick={() => onMove(1)} disabled={index >= count - 1}>
              <MoveRight size={15} />
            </IconButton>
            <IconButton label={t('slides.source')} onClick={() => setSource((s) => !s)} aria-pressed={source}>
              <Code size={15} />
            </IconButton>
            <IconButton label={t('slides.remove')} onClick={() => window.confirm(t('slides.removeConfirm')) && onRemove()}>
              <Trash2 size={15} />
            </IconButton>
          </>
        )}
      </div>
      <SlideView html={source ? draft : slide.html} theme={theme} scope={scope} />
      {source && canEdit && (
        <div>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== slide.html && onSource(draft)} spellCheck={false} className="min-h-[200px] font-mono text-[12px] leading-snug" aria-label={t('slides.source')} />
          <p className="mt-1 text-[12px] text-ink-3">{t('slides.sourceHint')}</p>
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => draft !== slide.html && onSource(draft)}>
              {t('slides.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
