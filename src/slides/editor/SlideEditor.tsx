import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronLeft, ChevronRight, Code, Copy, LayoutTemplate, MoveLeft, MoveRight, Plus, Save, Trash2, Undo2, X } from 'lucide-react'
import type { Slide } from '@/domain/types'
import { newId } from '@/domain/ops'
import { normalizeSlideHtml, slideTitle } from '@/domain/slides'
import { convertLayout, parseSlide, serializeSlide, type SlideDoc } from '@/domain/slideDoc'
import { Button, cx, IconButton, isTyping, Textarea, useIsPhone } from '@/components/ui'
import Menu from '@/components/Menu'
import { useThemes } from '@/store/useThemes'
import { type AssetScope, SlideView } from '../SlideView'
import { EditPreview } from './EditPreview'
import { Inspector } from './Inspector'
import { LayoutPicker } from './LayoutPicker'
import { SubDialogs, tr, useSubDialog } from './fields'

interface Props {
  slides: Slide[]
  index: number
  onIndex: (i: number) => void
  onChange: (slides: Slide[]) => void
  onClose: () => void
  /** Opens the dialog for a new slide (templates, layouts, pictures). */
  onAdd?: () => void
  theme: string
  scope: AssetScope
  owner: boolean
  canEdit: boolean
  /** Pictures the picker offers: those shown on slides nearby. */
  known: string[]
  onNotice?: (text: string) => void
  /** A dialog of the caller (the new-slide picker) is open: the editor's keys stay quiet. */
  paused?: boolean
}

const COMMIT_DELAY = 400

/**
 * The slide editor (docs/slides.md, section 7): the slide large and live on one side, its fields on the other.
 * Content is edited as fields, the layout is chosen from the catalogue and carries the content along, the
 * appearance stays with the stylesheet and the theme. A click on the slide opens the field it shows. Edits are
 * stored a moment after typing stops, so undo in the planner works in sensible steps.
 */
export function SlideEditor(p: Props) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const saveTemplate = useThemes((s) => s.saveTemplate)
  const slide: Slide | undefined = p.slides[p.index]
  const [draft, setDraft] = useState<{ id: string; doc: SlideDoc; html: string } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [source, setSource] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const [previous, setPrevious] = useState<{ doc: SlideDoc; lost: string[] } | null>(null)
  const pending = useRef<SlideDoc | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef({ slides: p.slides, onChange: p.onChange, id: slide?.id })
  latest.current = { slides: p.slides, onChange: p.onChange, id: slide?.id }
  const depth = useRef(0)

  /** Writes what was typed into the slide (the planner stores it, other windows see it). */
  const commit = useCallback(() => {
    clearTimeout(timer.current)
    const doc = pending.current
    pending.current = null
    const { slides, onChange, id } = latest.current
    if (!doc || !id) return
    const html = normalizeSlideHtml(serializeSlide(doc))
    const current = slides.find((s) => s.id === id)
    if (current && current.html !== html) onChange(slides.map((s) => (s.id === id ? { ...s, html } : s)))
    setDraft((d) => (d && d.id === id ? { ...d, html } : d))
  }, [])

  // A new slide under the editor: store what was typed in the previous one, read the new one.
  useLayoutEffect(() => {
    commit()
    setDraft(slide ? { id: slide.id, doc: parseSlide(slide.html), html: slide.html } : null)
    setPrevious(null)
    setFocus(null)
    setSource(false)
  }, [slide?.id, commit])
  // The same slide changed elsewhere (another window, an agent): show it, unless the user is in the middle of typing.
  useEffect(() => {
    if (!slide || pending.current) return
    setDraft((d) => (d && d.id === slide.id && d.html !== slide.html ? { id: slide.id, doc: parseSlide(slide.html), html: slide.html } : d))
  }, [slide?.html, slide])
  useEffect(() => () => commit(), [commit])

  const doc = draft && draft.id === slide?.id ? draft.doc : slide ? parseSlide(slide.html) : null
  const html = useMemo(() => (doc ? serializeSlide(doc) : ''), [doc])

  const update = (next: SlideDoc) => {
    if (!slide || !p.canEdit) return
    pending.current = next
    setDraft({ id: slide.id, doc: next, html: draft?.html ?? slide.html })
    clearTimeout(timer.current)
    timer.current = setTimeout(commit, COMMIT_DELAY)
  }
  const go = (i: number) => {
    if (i < 0 || i >= p.slides.length) return
    commit()
    p.onIndex(i)
  }
  const close = () => {
    commit()
    p.onClose()
  }
  const changeLayout = (layout: string) => {
    if (!doc || layout === doc.layout) return
    const result = convertLayout(doc, layout)
    setPrevious({ doc, lost: result.lost })
    update(result.doc)
  }
  const revert = () => {
    if (!previous) return
    update(previous.doc)
    setPrevious(null)
  }
  const move = (dir: -1 | 1) => {
    const to = p.index + dir
    if (to < 0 || to >= p.slides.length) return
    commit()
    const next = [...latest.current.slides]
    ;[next[p.index], next[to]] = [next[to], next[p.index]]
    p.onChange(next)
    p.onIndex(to)
  }
  const duplicate = () => {
    if (!slide) return
    commit()
    const slides = latest.current.slides
    const copy = { id: newId(), html: slides.find((s) => s.id === slide.id)?.html ?? slide.html }
    p.onChange([...slides.slice(0, p.index + 1), copy, ...slides.slice(p.index + 1)])
    p.onIndex(p.index + 1)
  }
  const remove = () => {
    if (!slide || !window.confirm(t('slides.removeConfirm'))) return
    pending.current = null
    clearTimeout(timer.current)
    const rest = latest.current.slides.filter((s) => s.id !== slide.id)
    p.onChange(rest)
    if (!rest.length) p.onClose()
    else p.onIndex(Math.min(p.index, rest.length - 1))
  }
  const asTemplate = async () => {
    if (!doc) return
    const name = window.prompt(t('slides.templateName'), slideTitle(html) || tr(t, `slides.layouts.${doc.layout}`))
    if (name === null) return
    const saved = await saveTemplate({ name: name.trim() || slideTitle(html), html: normalizeSlideHtml(html) })
    p.onNotice?.(t('slides.templateSaved', { name: saved.name }))
  }
  const focusField = (path: string) => {
    setFocus(path)
    const el = document.getElementById(`f-${path}`) ?? document.querySelector<HTMLElement>(`[id^="f-${path}."]`)
    if (!el) return
    el.focus()
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  // Keys: arrows page (not while typing), Escape leaves a field, then a nested dialog, then the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (p.paused) return
      if (e.key === 'Escape') {
        if (depth.current > 0) return
        if (isTyping(e.target)) {
          ;(e.target as HTMLElement).blur()
          return
        }
        e.preventDefault()
        close()
        return
      }
      if (isTyping(e.target) || depth.current > 0) return
      if (e.key === 'ArrowLeft') go(p.index - 1)
      else if (e.key === 'ArrowRight') go(p.index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!slide || !doc) return null
  const layoutName = tr(t, `slides.layouts.${doc.layout}`, { defaultValue: doc.layout || '–' })
  const menuItems = [
    ...(p.canEdit ? [{ label: t('slides.duplicateSlide'), icon: <Copy size={15} />, onSelect: duplicate }] : []),
    ...(p.owner ? [{ label: t('slides.saveAsTemplate'), icon: <Save size={15} />, onSelect: () => void asTemplate() }] : []),
    ...(p.canEdit ? [{ label: t('slides.left'), icon: <MoveLeft size={15} />, onSelect: () => move(-1) }, { label: t('slides.right'), icon: <MoveRight size={15} />, onSelect: () => move(1) }] : []),
    { label: t('editor.sourceCode'), icon: <Code size={15} />, checked: source, onSelect: () => setSource((s) => !s) },
    ...(p.canEdit ? [{ label: t('slides.remove'), icon: <Trash2 size={15} />, danger: true, onSelect: remove }] : []),
  ]
  const lostText = previous?.lost.length
    ? previous.lost
        .map((l) => (l.startsWith('items:') ? t('editor.lost', { count: Number(l.slice(6)) }) : l === 'figure' ? t('editor.lostFigure') : l === 'svg' ? t('editor.lostSvg') : t('editor.lostSource')))
        .join(' ')
    : ''

  const layoutButton = (
    <Button size="sm" onClick={() => setLayoutOpen(true)} disabled={!p.canEdit} className="max-w-[220px]" aria-label={`${t('editor.changeLayout')}: ${layoutName}`} title={t('editor.changeLayout')}>
      <LayoutTemplate size={13} />
      <span className="truncate">{layoutName}</span>
    </Button>
  )
  const notices = (
    <>
      {previous && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-[12px]">
          <span className="min-w-0 flex-1">{lostText || `${t('editor.layout')}: ${layoutName}`}</span>
          <Button size="sm" variant="ghost" onClick={revert}>
            <Undo2 size={13} />
            {t('editor.revert', { layout: tr(t, `slides.layouts.${previous.doc.layout}`, { defaultValue: previous.doc.layout }) })}
          </Button>
        </div>
      )}
      {overflow && (
        <div className="flex items-start gap-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-[12px] leading-snug text-amber">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t('slides.overflow')}
        </div>
      )}
    </>
  )
  const inspector = source ? (
    <SourceView html={html} onApply={(v) => update(parseSlide(normalizeSlideHtml(v)))} canEdit={p.canEdit} />
  ) : (
    <Inspector doc={doc} onChange={update} onFocus={setFocus} scope={p.scope} known={p.known} />
  )
  const position = (
    <span className="text-[12px] text-ink-2 tnum">
      {p.index + 1} / {p.slides.length}
    </span>
  )

  const body = phone ? (
    <div role="dialog" aria-modal="true" aria-label={t('slides.edit')} className="fixed inset-0 z-50 flex flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <IconButton label={t('common.close')} onClick={close}>
          <X size={18} />
        </IconButton>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{slideTitle(html) || layoutName}</span>
        {position}
        <Menu label={t('planner.actions')} items={menuItems} />
      </header>
      <div className="shrink-0 bg-black/90 p-2">
        <EditPreview doc={doc} html={html} theme={p.theme} scope={p.scope} focus={focus} onFocus={focusField} onOverflow={setOverflow} className="mx-auto w-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {layoutButton}
          {p.onAdd && p.canEdit && (
            <Button size="sm" variant="ghost" onClick={p.onAdd}>
              <Plus size={13} />
              {t('slides.new')}
            </Button>
          )}
        </div>
        <div className="mb-3 space-y-2 empty:hidden">{notices}</div>
        {inspector}
      </div>
      <nav className="fixed inset-x-0 bottom-0 flex items-center gap-2 border-t border-line bg-surface/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button size="sm" className="flex-1" onClick={() => go(p.index - 1)} disabled={p.index === 0}>
          <ChevronLeft size={15} />
          {t('slides.prev')}
        </Button>
        <Button size="sm" className="flex-1" onClick={() => go(p.index + 1)} disabled={p.index >= p.slides.length - 1}>
          {t('slides.next')}
          <ChevronRight size={15} />
        </Button>
      </nav>
    </div>
  ) : (
    <div role="dialog" aria-modal="true" aria-label={t('slides.edit')} className="fixed inset-0 z-50 flex bg-ink/30 p-3 backdrop-blur-[2px] md:p-5" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="card flex min-h-0 w-full overflow-hidden shadow-[var(--shadow)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-1 border-b border-line px-3 py-2">
            <IconButton label={t('common.close')} onClick={close}>
              <X size={16} />
            </IconButton>
            <IconButton label={t('slides.prev')} onClick={() => go(p.index - 1)} disabled={p.index === 0}>
              <ChevronLeft size={16} />
            </IconButton>
            {position}
            <IconButton label={t('slides.next')} onClick={() => go(p.index + 1)} disabled={p.index >= p.slides.length - 1}>
              <ChevronRight size={16} />
            </IconButton>
            <span className="ml-2 min-w-0 flex-1 truncate text-[14px] font-medium">{slideTitle(html) || layoutName}</span>
            {p.onAdd && p.canEdit && (
              <Button size="sm" variant="ghost" onClick={p.onAdd}>
                <Plus size={13} />
                {t('slides.new')}
              </Button>
            )}
            <Menu label={t('planner.actions')} items={menuItems} />
          </header>
          <Stage>
            {(width) => <EditPreview doc={doc} html={html} theme={p.theme} scope={p.scope} focus={focus} onFocus={focusField} onOverflow={setOverflow} className="shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]" style={{ width }} />}
          </Stage>
          <footer className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 py-2">
            {p.slides.map((s, i) => (
              <button key={s.id} type="button" onClick={() => go(i)} className={cx('relative w-[104px] shrink-0 rounded-md ring-offset-2 ring-offset-surface', i === p.index && 'ring-2 ring-accent')} aria-label={t('slides.slide', { n: i + 1 })} aria-current={i === p.index}>
                <SlideView html={s.html} theme={p.theme} scope={p.scope} />
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-medium text-paper tnum">{i + 1}</span>
              </button>
            ))}
          </footer>
        </div>
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-line lg:w-[420px]">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{t('editor.layout')}</span>
            {layoutButton}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <div className="mb-3 space-y-2 empty:hidden">{notices}</div>
            {inspector}
          </div>
        </aside>
      </div>
    </div>
  )

  return (
    <SubDialogs.Provider value={depth}>
      {body}
      <LayoutPickerGate open={layoutOpen} onClose={() => setLayoutOpen(false)} current={doc.layout} onPick={changeLayout} theme={p.theme} scope={p.scope} />
    </SubDialogs.Provider>
  )
}

function LayoutPickerGate(props: Parameters<typeof LayoutPicker>[0]) {
  useSubDialog(props.open)
  return <LayoutPicker {...props} />
}

/** The slide's markup, for what the fields do not reach. Applied on request; what the format does not allow is removed. */
function SourceView({ html, onApply, canEdit }: { html: string; onApply: (html: string) => void; canEdit: boolean }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(html)
  const [base, setBase] = useState(html)
  if (base !== html) {
    setBase(html)
    setDraft(html)
  }
  return (
    <div>
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="min-h-[320px] font-mono text-[12px] leading-snug" aria-label={t('editor.sourceCode')} readOnly={!canEdit} />
      <p className="mt-1 text-[12px] text-ink-3">{t('slides.sourceHint')}</p>
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => draft !== html && onApply(draft)} disabled={draft === html}>
            {t('slides.apply')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The room the preview gets: as wide as the stage allows, never taller than it. */
function Stage({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.max(240, Math.min(el.clientWidth - 48, ((el.clientHeight - 48) * 16) / 9)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center bg-surface-2/70 p-6">
      {children(width)}
    </div>
  )
}
