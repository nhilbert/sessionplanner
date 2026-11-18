import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Code, Copy, Pencil, Plus, Printer, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { newId } from '@/domain/ops'
import { parseSheetPage, serializeSheetPage, type BlockWords, type SheetPageDoc } from '@/domain/sheetDoc'
import { MAX_SHEET_PAGES, normalizeSheetHtml } from '@/domain/sheets'
import { PAPERS, type Paper, type Worksheet } from '@/domain/types'
import type { AssetScope } from '@/api'
import { Button, cx, IconButton, Modal, useIsPhone } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { pageSize, SheetPage, useSheetChrome } from '../SheetView'
import { Blocks } from './BlockFields'
import { useOnPage } from './onPage'
import { SlideToolbar } from '@/slides/editor/SlideToolbar'
import { useMediaQuery } from '@/components/ui'

/**
 * The worksheet editor (docs/worksheets.md, section 7): the slide editor's shell for sheets. It opens for looking –
 * the page large, the pages below – and "Edit" brings the fields: the sheet (title, paper), the page (orientation),
 * the header and the blocks, each a card with its fields; blocks are added, moved and removed, pages added,
 * reordered and removed. The page reports which blocks run past its bottom margin. Undo and redo cover every change
 * made here; typing in one field is one step while it goes on. Changes are saved a moment after they are made, and
 * at once when the editor closes. The source of a page is behind the ⋯ menu.
 */

interface Draft {
  title: string
  paper: Paper
  pages: { id: string; doc: SheetPageDoc }[]
}
interface Hist {
  past: Draft[]
  future: Draft[]
  field: string | null
  at: number
}

const TYPING_PAUSE = 1500
const MM = 96 / 25.4

const toSheet = (sheet: Worksheet, d: Draft): Worksheet => ({ ...sheet, title: d.title.trim() || sheet.title, paper: d.paper, pages: d.pages.map((p) => ({ id: p.id, html: serializeSheetPage(p.doc) })) })

export function SheetEditor({ facts, sheet, scope, theme, logo, canEdit, startEditing = false, onSave, onClose, onPrint }: { facts?: string; sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; canEdit: boolean; startEditing?: boolean; onSave: (sheet: Worksheet) => void; onClose: () => void; onPrint?: () => void }) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [draft, setDraft] = useState<Draft>(() => ({ title: sheet.title, paper: sheet.paper, pages: sheet.pages.map((p) => ({ id: p.id, doc: parseSheetPage(p.html) })) }))
  const [hist, setHist] = useState<Hist>({ past: [], future: [], field: null, at: 0 })
  const [current, setCurrent] = useState(0)
  const [editing, setEditing] = useState(canEdit && startEditing)
  const [source, setSource] = useState<string | null>(null)
  const [overflow, setOverflow] = useState<Record<number, number>>({})
  const [focus, setFocus] = useState<number | null>(null)
  const page = draft.pages[Math.min(current, draft.pages.length - 1)]
  const html = useMemo(() => serializeSheetPage(page.doc), [page.doc])
  const words = useBlockWords()
  // typing on the page: with a mouse on more than a phone's width (touch screens keep the fields)
  const fine = useMediaQuery('(pointer: fine)') && !phone
  const onPage = useOnPage(html, (next, field) => update((d) => void (d.pages[current].doc = parseSheetPage(next)), field ?? undefined))

  // ---- changes, history, saving ------------------------------------------------------------------------------------
  const pending = useRef<Draft | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current) onSave(toSheet(sheet, pending.current))
    pending.current = null
  }, [onSave, sheet])
  const schedule = (d: Draft) => {
    pending.current = d
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  useEffect(() => () => flush(), [flush])

  const update = (fn: (d: Draft) => void, field?: string) => {
    const next = structuredClone(draft)
    fn(next)
    const now = Date.now()
    setHist((h) => (field && h.field === field && now - h.at < TYPING_PAUSE ? { ...h, at: now } : { past: [...h.past, draft].slice(-200), future: [], field: field ?? null, at: now }))
    setDraft(next)
    schedule(next)
  }
  const undo = () => {
    onPage.end()
    const prev = hist.past[hist.past.length - 1]
    if (!prev) return
    setHist({ past: hist.past.slice(0, -1), future: [...hist.future, draft], field: null, at: 0 })
    setDraft(prev)
    setCurrent((c) => Math.min(c, prev.pages.length - 1))
    schedule(prev)
  }
  const redo = () => {
    onPage.end()
    const next = hist.future[hist.future.length - 1]
    if (!next) return
    setHist({ past: [...hist.past, draft], future: hist.future.slice(0, -1), field: null, at: 0 })
    setDraft(next)
    schedule(next)
  }
  const close = () => {
    onPage.end()
    flush()
    onClose()
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')
      const onText = (e.target as HTMLElement | null)?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && (!typing || onText)) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'Escape' && !typing && !source) {
        if (editing) setEditing(false)
        else close()
      } else if (!editing && !typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) setCurrent((c) => Math.max(0, Math.min(draft.pages.length - 1, c + (e.key === 'ArrowRight' ? 1 : -1))))
      else if (!editing && !typing && canEdit && e.key.toLowerCase() === 'e') setEditing(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  // ---- the page's overflow: blocks whose bottom is below the bottom margin ------------------------------------------
  const frame = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    let alive = true
    const measure = () => {
      const s = frame.current?.querySelector<HTMLElement>('section.sheet')
      if (!s || !alive) return
      const bottom = s.clientHeight - parseFloat(getComputedStyle(s).paddingBottom)
      const found: Record<number, number> = {}
      ;[...s.children].filter((c) => c.tagName !== 'HEADER' && !c.classList.contains('sheet-foot') && !c.classList.contains('sheet-head')).forEach((c, i) => {
        const el = c as HTMLElement
        const over = el.offsetTop + el.offsetHeight - bottom
        if (over > 1) found[i] = over / MM
      })
      setOverflow((o) => (JSON.stringify(o) === JSON.stringify(found) ? o : found))
    }
    measure()
    void document.fonts?.ready.then(measure)
    const t = setTimeout(measure, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [html, draft.paper])

  // ---- pages -----------------------------------------------------------------------------------------------------------
  const chrome = useSheetChrome({ ...sheet, pages: draft.pages.map((p) => ({ id: p.id, html: '' })), updatedAt: sheet.updatedAt }, logo, facts)
  const setPage = (fn: (d: SheetPageDoc) => void, field?: string) => update((d) => fn(d.pages[current].doc), field)
  const pageMenu = (i: number): MenuItem[] => [
    { label: t('sheetEditor.pageLeft'), icon: <ArrowLeft size={14} />, disabled: i === 0, onSelect: () => (update((d) => void d.pages.splice(i - 1, 0, d.pages.splice(i, 1)[0])), setCurrent(i - 1)) },
    { label: t('sheetEditor.pageRight'), icon: <ArrowRight size={14} />, disabled: i === draft.pages.length - 1, onSelect: () => (update((d) => void d.pages.splice(i + 1, 0, d.pages.splice(i, 1)[0])), setCurrent(i + 1)) },
    { label: t('sheetEditor.duplicatePage'), icon: <Copy size={14} />, disabled: draft.pages.length >= MAX_SHEET_PAGES, onSelect: () => (update((d) => void d.pages.splice(i + 1, 0, { id: newId(), doc: structuredClone(d.pages[i].doc) })), setCurrent(i + 1)) },
    { label: t('sheetEditor.pageSource'), icon: <Code size={14} />, onSelect: () => (setCurrent(i), setSource(serializeSheetPage(draft.pages[i].doc))) },
    { label: t('sheetEditor.removePage'), icon: <Trash2 size={14} />, danger: true, separated: true, disabled: draft.pages.length === 1, onSelect: () => (update((d) => void d.pages.splice(i, 1)), setCurrent(Math.max(0, i - 1))) },
  ]
  const addPage = () => {
    update((d) => void d.pages.push({ id: newId(), doc: { landscape: false, header: null, blocks: [] } }))
    setCurrent(draft.pages.length)
  }

  // the page fits the window's height, so it is always seen whole
  const size = pageSize(draft.paper, page.doc.landscape)
  const overCount = Object.keys(overflow).length
  const preview = (
    <div className="flex min-h-0 flex-col items-center gap-3">
      <div ref={frame} className="w-full" onMouseDown={(e) => {
        if (!editing || !fine || e.button !== 0) return
        const section = frame.current?.querySelector('section.sheet')
        // no preventDefault: the browser places the caret and selects with a drag or a double-click
        if (section) onPage.begin(section, e.target as Element)
      }} style={{ maxWidth: `min(720px, calc((100dvh - ${phone ? 260 : 230}px) * ${size.w / size.h}))` }} onClick={(e) => {
        // a click on a block of the page opens its card
        if (!editing) return
        const s = frame.current?.querySelector('section.sheet')
        const blocks = s ? [...s.children].filter((c) => c.tagName !== 'HEADER' && !c.classList.contains('sheet-foot')) : []
        const hit = blocks.findIndex((b) => b.contains(e.target as Node))
        if (hit >= 0) {
          setFocus(hit)
          requestAnimationFrame(() => document.getElementById(`sheet-block-p${current}.${hit}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
        }
      }}>
        <SheetPage html={onPage.shown(html)} paper={draft.paper} theme={theme} scope={scope} chrome={chrome(current + 1)} label={t('sheets.page', { n: current + 1 })} />
      </div>
      {editing && fine && <p className="text-[12px] text-ink-3">{t('sheetEditor.onPageHint')}</p>}
      {overCount > 0 && <p className="text-[13px] text-rose">{t('sheetEditor.overPage', { count: overCount })}</p>}
      <div className="flex w-full max-w-[640px] flex-wrap items-start gap-2">
        {draft.pages.map((p, i) => (
          <div key={p.id} className="w-[72px]">
            <div className={cx('rounded-sm ring-2', i === current ? 'ring-accent' : 'ring-transparent')}>
              <SheetPage html={serializeSheetPage(p.doc)} paper={draft.paper} theme={theme} scope={scope} chrome={chrome(i + 1)} onClick={() => (onPage.end(), setCurrent(i))} label={t('sheets.page', { n: i + 1 })} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-3">
              <span>{i + 1}</span>
              {editing && <Menu items={pageMenu(i)} label={t('sheetEditor.pageActions', { n: i + 1 })} float />}
            </div>
          </div>
        ))}
        {editing && draft.pages.length < MAX_SHEET_PAGES && (
          <button type="button" onClick={addPage} className="flex h-[100px] w-[72px] items-center justify-center rounded-sm border border-dashed border-line text-ink-3 hover:text-ink" aria-label={t('sheetEditor.addPage')}>
            <Plus size={16} />
          </button>
        )}
      </div>
    </div>
  )

  const d = page.doc
  const fields = (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('sheetEditor.sheet')}</h3>
        <div className="flex gap-2">
          <label className="block min-w-0 flex-1">
            <span className="mb-0.5 block text-[11px] text-ink-3">{t('sheets.titleField')}</span>
            <input className="field h-8 w-full px-2 text-[13px]" value={draft.title} onChange={(e) => update((x) => void (x.title = e.target.value), 'title')} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-ink-3">{t('sheets.paper')}</span>
            <select className="field h-8 w-auto pr-7 text-[13px]" value={draft.paper} onChange={(e) => update((x) => void (x.paper = e.target.value as Paper))}>
              {PAPERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('sheetEditor.page', { n: current + 1, total: draft.pages.length })}</h3>
        <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={d.landscape} onChange={(e) => setPage((x) => void (x.landscape = e.target.checked))} />
          {t('sheetEditor.landscape')}
        </label>
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('sheetEditor.header')}</h3>
        {d.headerRaw !== undefined ? (
          <p className="text-[12px] text-ink-3">{t('sheetEditor.headerRaw')}</p>
        ) : d.header ? (
          <div className="space-y-2">
            {(['eyebrow', 'title'] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-0.5 block text-[11px] text-ink-3">{t(`sheetEditor.${k}`)}</span>
                <input className="field h-8 w-full px-2 text-[13px]" value={d.header![k]} onChange={(e) => setPage((x) => void (x.header![k] = e.target.value), `p${current}.header.${k}`)} />
              </label>
            ))}
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-ink-3">{t('sheetEditor.leads')}</span>
              <textarea className="field w-full px-2 py-1.5 text-[13px]" rows={3} value={d.header.leads.join('\n')} onChange={(e) => setPage((x) => void (x.header!.leads = e.target.value.split('\n')), `p${current}.header.leads`)} />
            </label>
            <button type="button" className="text-[12px] text-ink-3 hover:text-ink" onClick={() => setPage((x) => void (x.header = null))}>
              {t('sheetEditor.removeHeader')}
            </button>
          </div>
        ) : (
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2" onClick={() => setPage((x) => void (x.header = { eyebrow: '', title: t('sheets.newTitle'), titleCls: '', leads: [], picture: null }))}>
            <Plus size={12} />
            {t('sheetEditor.addHeader')}
          </button>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('sheetEditor.blocks')}</h3>
        <Blocks key={`p${current}`} blocks={d.blocks} onChange={(blocks, f) => setPage((x) => void (x.blocks = blocks), f)} scope={scope} theme={theme} words={words} path={`p${current}`} overflow={overflow} focus={focus} />
      </section>
    </div>
  )

  const editorMenu: MenuItem[] = [
    { label: t('sheetEditor.pageSource'), icon: <Code size={14} />, onSelect: () => setSource(html) },
    ...(onPrint ? [{ label: t('sheets.print'), icon: <Printer size={14} />, onSelect: () => (flush(), onPrint()) }] : []),
  ]

  // over the whole window, never inside the panel it was opened from
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label={draft.title}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">{draft.title || t('sheets.untitled')}</div>
          <div className="text-[12px] text-ink-3">{t('sheets.facts', { count: draft.pages.length, paper: draft.paper })}</div>
        </div>
        {canEdit && (
          <>
            <IconButton label={t('common.undo')} onClick={undo} disabled={!hist.past.length}>
              <Undo2 size={15} />
            </IconButton>
            <IconButton label={t('common.redo')} onClick={redo} disabled={!hist.future.length}>
              <Redo2 size={15} />
            </IconButton>
            <Button size="sm" variant={editing ? 'primary' : 'ghost'} onClick={() => (onPage.end(), setEditing(!editing))}>
              {editing ? null : <Pencil size={13} />}
              {editing ? t('sheetEditor.done') : t('sheetEditor.edit')}
            </Button>
          </>
        )}
        {!canEdit && onPrint && (
          <Button size="sm" variant="ghost" onClick={onPrint}>
            <Printer size={13} />
            {t('sheets.print')}
          </Button>
        )}
        {canEdit && <Menu items={editorMenu} label={t('sheetEditor.menu')} />}
        <IconButton label={t('common.close')} onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      <div className={cx('min-h-0 flex-1', editing && !phone ? 'grid grid-cols-[1fr_minmax(340px,440px)]' : 'overflow-y-auto')}>
        <div className={cx('overflow-y-auto bg-surface-2 p-4 md:p-6', editing && !phone && 'min-h-0')}>{preview}</div>
        {editing && <div className="min-h-0 overflow-y-auto border-l border-line p-4">{fields}</div>}
      </div>
      {onPage.active && (
        <SlideToolbar anchor={onPage.active.anchor} kind="text" theme={theme} state={onPage.active.state} onBold={onPage.bold} onItalic={onPage.italic} onSize={onPage.size} onColor={onPage.color} onClear={onPage.clear} />
      )}
      {source !== null && (
        <PageSource
          html={source}
          onClose={() => setSource(null)}
          onApply={(text) => {
            const clean = normalizeSheetHtml(text)
            setPage((x) => Object.assign(x, parseSheetPage(clean)))
            setSource(null)
          }}
        />
      )}
    </div>,
    document.body,
  )
}

/** The source of one page: the markup, sanitised when applied. */
function PageSource({ html, onClose, onApply }: { html: string; onClose: () => void; onApply: (html: string) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(html.replace(/></g, '>\n<'))
  return (
    <Modal open onClose={onClose} width="max-w-3xl">
      <h2 className="mb-2 text-lg font-medium">{t('sheetEditor.pageSource')}</h2>
      <p className="mb-2 text-[12px] text-ink-3">{t('sheets.sourceHint')}</p>
      <textarea className="field h-[55vh] w-full resize-none p-3 font-mono text-[12px] leading-[1.45]" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={() => onApply(text)}>
          {t('sheetEditor.apply')}
        </Button>
      </div>
    </Modal>
  )
}

/** The example words of new blocks, in the app's language. */
function useBlockWords(): BlockWords {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      heading: t('sheetEditor.words.heading'),
      text: t('sheetEditor.words.text'),
      term: t('sheetEditor.words.term'),
      explanation: t('sheetEditor.words.explanation'),
      question: t('sheetEditor.words.question'),
      hint: t('sheetEditor.words.hint'),
      prompt: t('sheetEditor.words.prompt'),
      step: t('sheetEditor.words.step'),
      entry: t('sheetEditor.words.entry'),
      label: t('sheetEditor.words.label'),
      rating: t('sheetEditor.words.rating'),
      criterion: t('sheetEditor.words.criterion'),
      note: t('sheetEditor.words.note'),
      caption: t('sheetEditor.words.caption'),
      noteTitle: t('sheetEditor.words.noteTitle'),
      starter: t('sheetEditor.words.starter'),
      axisY: t('sheetEditor.words.axisY'),
      axisX: t('sheetEditor.words.axisX'),
      low: t('sheetEditor.words.low'),
      high: t('sheetEditor.words.high'),
      never: t('sheetEditor.words.never'),
      sometimes: t('sheetEditor.words.sometimes'),
      often: t('sheetEditor.words.often'),
      always: t('sheetEditor.words.always'),
      statement: t('sheetEditor.words.statement'),
      sum: t('sheetEditor.words.sum'),
      when: t('sheetEditor.words.when'),
      then: t('sheetEditor.words.then'),
      certFor: t('sheetEditor.words.certFor'),
      certTitle: t('sheetEditor.words.certTitle'),
      together: t('sheetEditor.words.together'),
    }),
    [t],
  )
}
