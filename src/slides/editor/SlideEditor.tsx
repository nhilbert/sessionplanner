import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Code, Copy, Info, LayoutTemplate, MoveLeft, MoveRight, Pencil, Play, Plus, Redo2, Save, Trash2, Undo2, X } from 'lucide-react'
import { normalizeSlideHtml, slideTitle } from '@/domain/slides'
import { convertLayout, parseSlide, serializeSlide, type SlideDoc } from '@/domain/slideDoc'
import { Button, cx, IconButton, isTyping, Textarea, useIsPhone } from '@/components/ui'
import Menu from '@/components/Menu'
import { useOverlay } from '@/components/overlay'
import { useThemes } from '@/store/useThemes'
import { type AssetScope, SlideView } from '../SlideView'
import { NewSlidePicker } from '../NewSlidePicker'
import { SlidePicker } from '../SlidePicker'
import { EditPreview } from './EditPreview'
import { Inspector } from './Inspector'
import { LayoutPicker } from './LayoutPicker'
import { tr } from './fields'
import { dropRedo, dropUndo, EMPTY_HISTORY, type History, lastStep, nextStep, record, recordEdit, redone, rekey, seal, undone } from './history'
import type { EditorSlide, SlideSource } from './source'

interface Props {
  source: SlideSource
  /** The key of the slide to open on. */
  start: string
  onClose: () => void
  theme: string
  scope: AssetScope
  /** Templates and the pool (in "New slide" and "Save as template") are the owner's. */
  owner: boolean
  canEdit: boolean
  /** Pictures the picker offers: those shown on slides nearby. */
  known: string[]
  onNotice?: (text: string) => void
  /** How it opens: looking (the default) or editing (a new slide, "Edit slides"). */
  mode?: 'view' | 'edit'
}

const COMMIT_DELAY = 400
const read = (html: string) => parseSlide(html)
const stored = (doc: SlideDoc) => normalizeSlideHtml(serializeSlide(doc))

/**
 * The slide editor (docs/slides.md, section 7): the slide large and live on one side, its fields on the other, on
 * whatever it was opened from – a step, the deck, a library entry, the templates, a deck of the pool (source.ts).
 * Content is edited as fields, the layout is chosen from the catalogue and carries the content along, the
 * appearance stays with the theme. Edits are stored a moment after typing stops; the editor keeps its own history
 * (undo, redo), and in the planner the whole session is one undo step. Focus moves into the editor when it opens,
 * stays in it, and goes back to what opened it when it closes.
 */
export function SlideEditor(p: Props) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const saveTemplate = useThemes((s) => s.saveTemplate)
  const root = useRef<HTMLDivElement>(null)
  const slides = p.source.slides
  const [key, setKey] = useState(p.start)
  const lastIndex = useRef(0)
  const found = slides.findIndex((s) => s.key === key)
  const index = found !== -1 ? found : Math.min(lastIndex.current, slides.length - 1)
  if (found !== -1) lastIndex.current = found
  const slide: EditorSlide | undefined = slides[index]
  const editable = p.canEdit && !!slide?.editable && !!p.source.write
  /** Looking at slides is the usual case; the fields come with "Edit" (E, a double-click on a text). */
  const [editMode, setEditMode] = useState(p.mode === 'edit')
  const editing = editMode && editable

  const [draft, setDraft] = useState<{ key: string; doc: SlideDoc; html: string } | null>(null)
  const [focus, setFocusPath] = useState<string | null>(null)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [pool, setPool] = useState(false)
  const [sourceView, setSourceView] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const [lost, setLost] = useState<string[] | null>(null)
  const [notice, setNotice] = useState('')
  const [, setVersion] = useState(0)
  const history = useRef<History>(EMPTY_HISTORY)
  const setHistory = (h: History) => {
    history.current = h
    setVersion((v) => v + 1)
  }
  /** What was typed and not yet stored, with the slide it was typed into (which need not be the one shown by then). */
  const pending = useRef<{ key: string; doc: SlideDoc } | null>(null)
  /** Markup typed in the source view and not yet applied. */
  const sourceDraft = useRef<{ key: string; html: string } | null>(null)
  /** The markup this editor stored lately: an older one coming back (a late answer to a save) is not a change from elsewhere. */
  const own = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const src = useRef(p.source)
  src.current = p.source
  /** Undo, redo and the changes of the slides themselves run one after the other (some sources answer later). */
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const queue = (run: () => unknown) => {
    chain.current = chain.current.then(run).catch(() => undefined)
  }

  // The planner counts the whole session as one undo step.
  useEffect(() => {
    const session = src.current.session
    session?.begin()
    return () => session?.end()
  }, [])

  /** Stores what was typed into its slide. */
  const commit = useCallback(() => {
    clearTimeout(timer.current)
    if (sourceDraft.current) {
      const { key: k, html } = sourceDraft.current
      sourceDraft.current = null
      const doc = read(normalizeSlideHtml(html))
      const before = src.current.current().find((s) => s.key === k)?.html
      if (before !== undefined) history.current = recordEdit(history.current, { key: k, before, after: stored(doc), field: null, at: Date.now() })
      pending.current = { key: k, doc }
    }
    const edit = pending.current
    pending.current = null
    if (!edit) return
    const html = stored(edit.doc)
    const current = src.current.current().find((s) => s.key === edit.key)
    // A slide removed meanwhile (another window, an agent) takes what was typed with it.
    if (!current || !src.current.write) return
    if (current.html !== html) {
      own.current = [...own.current.slice(-30), html]
      src.current.write(edit.key, html)
    }
    setDraft((d) => (d && d.key === edit.key ? { key: edit.key, doc: edit.doc, html } : d))
  }, [])

  // Another slide under the editor: store what was typed in the previous one, read this one.
  useLayoutEffect(() => {
    commit()
    history.current = seal(history.current)
    setDraft(slide ? { key: slide.key, doc: read(slide.html), html: slide.html } : null)
    setLost(null)
    setFocusPath(null)
    setSourceView(false)
  }, [slide?.key, commit])
  // The same slide changed elsewhere (another window, an agent, undo): show it, unless the user is in the middle of typing.
  useEffect(() => {
    if (!slide || pending.current || sourceDraft.current) return
    setDraft((d) => {
      if (!d || d.key !== slide.key || d.html === slide.html) return d
      if (own.current.includes(slide.html) && own.current[own.current.length - 1] !== slide.html) return d
      return { key: slide.key, doc: read(slide.html), html: slide.html }
    })
  }, [slide?.html, slide])
  useEffect(() => () => commit(), [commit])
  // Nothing left to show (the last slide removed, the deck switched off): the editor closes.
  useEffect(() => {
    if (!slides.length) p.onClose()
  }, [slides.length, p])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const doc = draft && draft.key === slide?.key ? draft.doc : slide ? read(slide.html) : null
  const html = useMemo(() => (doc ? serializeSlide(doc) : ''), [doc])

  /** The field being typed in, if any: typing in one field is one step of the history. */
  const typingField = (): string | null => {
    const active = document.activeElement
    return active instanceof HTMLElement && isTyping(active) && root.current?.contains(active) ? active.id || null : null
  }
  const update = (next: SlideDoc, field: string | null = typingField()) => {
    if (!slide || !editable || !doc) return
    history.current = recordEdit(history.current, { key: slide.key, before: stored(doc), after: stored(next), field, at: Date.now() })
    setVersion((v) => v + 1)
    pending.current = { key: slide.key, doc: next }
    setDraft({ key: slide.key, doc: next, html: draft?.html ?? slide.html })
    clearTimeout(timer.current)
    timer.current = setTimeout(commit, COMMIT_DELAY)
  }
  const setFocus = (path: string | null) => {
    if (path !== focus) history.current = seal(history.current)
    setFocusPath(path)
  }
  const goKey = (k: string) => {
    commit()
    history.current = seal(history.current)
    setKey(k)
  }
  const go = (i: number) => {
    if (i < 0 || i >= slides.length) return
    goKey(slides[i].key)
  }
  const close = () => {
    commit()
    p.onClose()
  }

  // ---- the slides themselves: inserting, removing, moving, all steps of the history ----------------------------

  /** The position of a slide within its group. */
  const placeOf = (k: string) => {
    const list = src.current.current()
    const s = list.find((x) => x.key === k)
    return s ? { group: s.group, at: list.filter((x) => x.group === s.group).findIndex((x) => x.key === k) } : null
  }
  const insert = (group: string, at: number, htmls: string[], open: boolean) =>
    queue(async () => {
      commit()
      if (!src.current.insert) return
      const keys = await src.current.insert(group, at, htmls)
      if (keys.length < htmls.length) window.alert(t('slides.tooMany', { max: 60, count: htmls.length - keys.length }))
      if (!keys.length) return
      setHistory(record(seal(history.current), { kind: 'insert', group, at, keys, html: htmls.slice(0, keys.length) }))
      if (open) {
        setKey(keys[0])
        setEditMode(true)
      }
    })
  /** New slides go after the one shown, in its group; a generated slide has none (its step takes slides, see "own slide"). */
  const addTarget = slide && slide.editable ? placeOf(slide.key) : null
  const add = (htmls: string[], open: boolean) => addTarget && insert(addTarget.group, addTarget.at + 1, htmls, open)
  const duplicate = () => slide && addTarget && insert(addTarget.group, addTarget.at + 1, [stored(doc!)], true)
  const remove = () => {
    if (!slide || !src.current.remove || !window.confirm(t('slides.removeConfirm'))) return
    const k = slide.key
    queue(async () => {
      pending.current = null
      sourceDraft.current = null
      clearTimeout(timer.current)
      const place = placeOf(k)
      const before = src.current.current().find((x) => x.key === k)?.html
      if (!place || before === undefined) return
      const neighbour = slides[index + 1]?.key ?? slides[index - 1]?.key
      await src.current.remove!(k)
      setHistory(record(seal(history.current), { kind: 'remove', group: place.group, at: place.at, key: k, html: before }))
      if (neighbour) setKey(neighbour)
    })
  }
  const move = (dir: -1 | 1) => {
    if (!slide || !src.current.move) return
    const k = slide.key
    queue(async () => {
      commit()
      const place = placeOf(k)
      if (!place) return
      const size = src.current.current().filter((x) => x.group === place.group).length
      const to = place.at + dir
      if (to < 0 || to >= size) return
      await src.current.move!(k, to)
      setHistory(record(seal(history.current), { kind: 'move', key: k, from: place.at, to }))
    })
  }

  // ---- undo and redo ----------------------------------------------------------------------------------------

  /** Shows a slide after undo or redo changed it, and the field the step was typed in. */
  const show = (k: string, field?: string | null) => {
    setKey(k)
    if (field) requestAnimationFrame(() => document.getElementById(field)?.focus({ preventScroll: false }))
  }
  const undo = () =>
    queue(async () => {
      commit()
      const h = seal(history.current)
      const step = lastStep(h)
      if (!step) return
      const list = src.current.current()
      const s = 'key' in step ? list.find((x) => x.key === step.key) : undefined
      if (step.kind === 'edit') {
        // Changed elsewhere since (another window, an agent): taking this step back would overwrite that.
        if (!s || s.html !== step.after || !src.current.write) {
          setHistory(dropUndo(h))
          setNotice(t('editor.changedElsewhere'))
          return
        }
        src.current.write(step.key, step.before)
        own.current = [...own.current.slice(-30), step.before]
        setDraft({ key: step.key, doc: read(step.before), html: step.before })
        setHistory(undone(h, step))
        show(step.key, step.field)
      } else if (step.kind === 'insert') {
        for (const k of step.keys) if (list.some((x) => x.key === k)) await src.current.remove?.(k)
        setHistory(undone(h, step))
        const back = src.current.current().filter((x) => x.group === step.group)[Math.max(0, step.at - 1)]
        if (back) setKey(back.key)
      } else if (step.kind === 'remove') {
        const [k] = (await src.current.insert?.(step.group, step.at, [step.html])) ?? []
        if (!k) {
          setHistory(dropUndo(h))
          return
        }
        const h2 = rekey(h, step.key, k)
        setHistory(undone(h2, { ...step, key: k }))
        show(k)
      } else {
        const place = placeOf(step.key)
        if (!place || place.at !== step.to) {
          setHistory(dropUndo(h))
          setNotice(t('editor.changedElsewhere'))
          return
        }
        await src.current.move?.(step.key, step.from)
        setHistory(undone(h, step))
        show(step.key)
      }
    })
  const redo = () =>
    queue(async () => {
      commit()
      const h = history.current
      const step = nextStep(h)
      if (!step) return
      const list = src.current.current()
      if (step.kind === 'edit') {
        const s = list.find((x) => x.key === step.key)
        if (!s || s.html !== step.before || !src.current.write) {
          setHistory(dropRedo(h))
          setNotice(t('editor.changedElsewhere'))
          return
        }
        src.current.write(step.key, step.after)
        own.current = [...own.current.slice(-30), step.after]
        setDraft({ key: step.key, doc: read(step.after), html: step.after })
        setHistory(redone(h, step))
        show(step.key, step.field)
      } else if (step.kind === 'insert') {
        const keys = ((await src.current.insert?.(step.group, step.at, step.html)) ?? []) as string[]
        let h2 = h
        step.keys.forEach((old, n) => keys[n] && (h2 = rekey(h2, old, keys[n])))
        setHistory(redone(h2, { ...step, keys }))
        if (keys[0]) show(keys[0])
      } else if (step.kind === 'remove') {
        if (list.some((x) => x.key === step.key)) await src.current.remove?.(step.key)
        setHistory(redone(h, step))
      } else {
        const place = placeOf(step.key)
        if (!place || place.at !== step.from) {
          setHistory(dropRedo(h))
          setNotice(t('editor.changedElsewhere'))
          return
        }
        await src.current.move?.(step.key, step.to)
        setHistory(redone(h, step))
        show(step.key)
      }
    })

  /** Back to looking; what was typed (in the fields or the source) is stored. */
  function leaveEdit() {
    commit()
    setSourceView(false)
    setEditMode(false)
  }

  // ---- keys and focus -------------------------------------------------------------------------------------------

  // Escape leaves a field first (back to the editor itself), then closes; whatever lies above takes it before.
  const onTop = useOverlay(
    true,
    () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && isTyping(active)) {
        active.blur()
        root.current?.focus({ preventScroll: true })
      } else if (editing) {
        leaveEdit()
        root.current?.focus({ preventScroll: true })
      } else close()
    },
    { root, focus: 'root' },
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!onTop()) return
      const mod = e.ctrlKey || e.metaKey
      const inSource = e.target instanceof HTMLTextAreaElement && e.target.dataset.source === '1'
      if (mod && !inSource && e.key.toLowerCase() === 'z') {
        // The editor's history, also inside the fields (each field's typing is one step there).
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && !inSource && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (isTyping(e.target)) return
      if ((e.key === 'e' || e.key === 'E') && !mod && !e.altKey && !editing && editable) {
        e.preventDefault()
        setEditMode(true)
        return
      }
      if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!slide || !doc) return null

  const layoutName = tr(t, `slides.layouts.${doc.layout}`, { defaultValue: doc.layout || '–' })
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0
  const asTemplate = async () => {
    const name = window.prompt(t('slides.templateName'), slideTitle(html) || layoutName)
    if (name === null) return
    const saved = await saveTemplate({ name: name.trim() || slideTitle(html) || layoutName, html: normalizeSlideHtml(html) })
    const text = t('slides.templateSaved', { name: saved.name })
    setNotice(text)
    p.onNotice?.(text)
  }
  const groupSize = slides.filter((s) => s.group === slide.group).length
  const groupAt = slides.filter((s) => s.group === slide.group).findIndex((s) => s.key === slide.key)
  const presentAt = src.current.presentAt?.(slide.key) ?? null
  const menuItems = [
    ...(presentAt ? [{ label: t('editor.presentHere'), icon: <Play size={15} />, onSelect: () => (commit(), src.current.present!(presentAt)) }] : []),
    ...(editing && src.current.insert ? [{ label: t('slides.duplicateSlide'), icon: <Copy size={15} />, onSelect: duplicate }] : []),
    ...(p.owner ? [{ label: t('slides.saveAsTemplate'), icon: <Save size={15} />, onSelect: () => void asTemplate() }] : []),
    ...(editing && src.current.move && groupSize > 1
      ? [
          { label: t('slides.left'), icon: <MoveLeft size={15} />, onSelect: () => move(-1) },
          { label: t('slides.right'), icon: <MoveRight size={15} />, onSelect: () => move(1) },
        ]
      : []),
    ...(editing
      ? [
          {
            label: t('editor.sourceCode'),
            icon: <Code size={15} />,
            checked: sourceView,
            onSelect: () => {
              // Leaving the source applies what was typed there.
              commit()
              setSourceView((s) => !s)
            },
          },
        ]
      : []),
    ...(editing && src.current.remove ? [{ label: t('slides.remove'), icon: <Trash2 size={15} />, danger: true, onSelect: remove }] : []),
  ]
  const lostText = lost?.length
    ? lost
        .map((l) =>
          l.startsWith('items:') ? t('editor.lost', { count: Number(l.slice(6)) }) : l.startsWith('images:') ? t('editor.lostImages', { count: Number(l.slice(7)) }) : l === 'figure' ? t('editor.lostFigure') : l === 'svg' ? t('editor.lostSvg') : l === 'other' ? t('editor.lostOther') : t('editor.lostSource'),
        )
        .join(' ')
    : ''
  const changeLayout = (layout: string) => {
    if (layout === doc.layout) return
    const result = convertLayout(doc, layout)
    update(result.doc, null)
    setLost(result.lost)
  }

  const layoutButton = (
    <Button size="sm" onClick={() => setLayoutOpen(true)} disabled={!editable || doc.raw !== undefined} className="max-w-[220px]" aria-label={`${t('editor.changeLayout')}: ${layoutName}`} title={doc.raw !== undefined ? t('editor.layoutLocked') : t('editor.changeLayout')}>
      <LayoutTemplate size={13} />
      <span className="truncate">{layoutName}</span>
    </Button>
  )
  const historyButtons = (
    <>
      <IconButton label={t('editor.undo')} onClick={undo} disabled={!canUndo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton label={t('editor.redo')} onClick={redo} disabled={!canRedo} className="max-md:hidden">
        <Redo2 size={15} />
      </IconButton>
    </>
  )
  /** Between looking and editing: the one control that changes what the editor shows. */
  const modeButton = editable && (
    <Button
      size="sm"
      variant={editMode ? 'default' : 'primary'}
      onClick={() => (editMode ? leaveEdit() : setEditMode(true))}
      title={editMode ? t('editor.viewHint') : t('editor.editHint')}
    >
      {editMode ? <Check size={13} /> : <Pencil size={13} />}
      {editMode ? t('editor.done') : t('editor.edit')}
    </Button>
  )
  const addButton = editing && src.current.insert && (
    <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={!addTarget} title={addTarget ? undefined : t('editor.addHere')}>
      <Plus size={13} />
      {t('slides.new')}
    </Button>
  )
  const notices = (
    <>
      {lost && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-[12px]">
          <span className="min-w-0 flex-1">{lostText || `${t('editor.layout')}: ${layoutName}`}</span>
          <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
            <Undo2 size={13} />
            {t('editor.undo')}
          </Button>
        </div>
      )}
      {notice && <div className="rounded-md bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2" role="status">{notice}</div>}
      {overflow && (
        <div className="flex items-start gap-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-[12px] leading-snug text-amber">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t('slides.overflow')}
        </div>
      )}
    </>
  )
  const panel = sourceView ? (
    <SourceView html={html} canEdit={editable} onDraft={(v) => (sourceDraft.current = v === html ? null : { key: slide.key, html: v })} onApply={() => commit()} />
  ) : editing ? (
    <Inspector doc={doc} onChange={(next) => update(next)} onFocus={setFocus} scope={p.scope} known={p.known} />
  ) : (
    <ReadOnly
      slide={slide}
      canEdit={p.canEdit}
      onDetails={
        src.current.openDetails &&
        (() => {
          close()
          src.current.openDetails!()
        })
      }
      onHide={src.current.hide && ((kind) => src.current.hide!(kind))}
      onAdopt={slide.generated?.adopt && p.canEdit && src.current.insert ? () => insert(slide.generated!.adopt!, 0, [slide.html], true) : undefined}
      onTemplate={p.owner ? () => void asTemplate() : undefined}
    />
  )
  const title = slideTitle(html) || layoutName
  const context = (
    <span className="min-w-0 flex-1 truncate">
      <span className="text-[12px] text-ink-3">
        {p.source.context}
        {slide.groupLabel && ` · ${slide.groupLabel}`}
      </span>
      <span className="block truncate text-[14px] font-medium leading-tight">{title}</span>
    </span>
  )
  const position = (
    <span className="text-[12px] text-ink-2 tnum">
      {index + 1} / {slides.length}
    </span>
  )
  const preview = (style?: React.CSSProperties, className?: string) => (
    <EditPreview
      doc={doc}
      html={html}
      theme={p.theme}
      scope={p.scope}
      focus={editing ? focus : null}
      viewing={!editing}
      onFocus={editing ? focusField : () => undefined}
      // Looking: a double-click on a text opens the editor at its field.
      onEdit={
        editable && !editing
          ? (path) => {
              setEditMode(true)
              requestAnimationFrame(() => requestAnimationFrame(() => focusField(path, true)))
            }
          : undefined
      }
      onOverflow={setOverflow}
      className={className}
      style={style}
    />
  )
  /** Looking at a slide that is not edited here: what it is and what can be done, under the slide. */
  const viewInfo = !editing && !editable && <div className="border-t border-line bg-surface px-4 py-3">{panel}</div>
  const dialogLabel = editing ? t('slides.edit') : t('editor.viewing')
  /** Moves to a field; from a double-click on the slide the caret goes to the end of its text, ready to go on typing. */
  function focusField(path: string, atEnd = false) {
    setFocus(path)
    const el = document.getElementById(`f-${path}`) ?? document.querySelector<HTMLElement>(`[id^="f-${path}."]`)
    if (!el) return
    el.focus()
    if (atEnd && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.setSelectionRange(el.value.length, el.value.length)
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const body = phone ? (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={dialogLabel} className="fixed inset-0 z-50 flex flex-col bg-paper pt-[env(safe-area-inset-top)] outline-none">
      <header className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <IconButton label={t('common.close')} onClick={close}>
          <X size={18} />
        </IconButton>
        {context}
        {position}
        {historyButtons}
        {modeButton}
        <Menu label={t('planner.actions')} items={[...(canRedo ? [{ label: t('editor.redo'), icon: <Redo2 size={15} />, onSelect: redo }] : []), ...menuItems]} />
      </header>
      {editing ? (
        <>
          <div className="shrink-0 bg-black/90 p-2">{preview(undefined, 'mx-auto w-full')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {layoutButton}
              {addButton}
            </div>
            <div className="mb-3 space-y-2 empty:hidden">{notices}</div>
            {panel}
          </div>
        </>
      ) : (
        // Looking: the slide as large as the screen allows; a swipe pages.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-20">
          <Swipe onPrev={() => go(index - 1)} onNext={() => go(index + 1)} className="flex flex-1 items-center bg-black/90 p-2">
            {preview(undefined, 'w-full')}
          </Swipe>
          {notice && <div className="px-4 pt-3 text-[12px] text-ink-2" role="status">{notice}</div>}
          {viewInfo}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 flex items-center gap-2 border-t border-line bg-surface/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button size="sm" className="flex-1" onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronLeft size={15} />
          {t('slides.prev')}
        </Button>
        <Button size="sm" className="flex-1" onClick={() => go(index + 1)} disabled={index >= slides.length - 1}>
          {t('slides.next')}
          <ChevronRight size={15} />
        </Button>
      </nav>
    </div>
  ) : (
    <div className="fixed inset-0 z-50 flex bg-ink/30 p-3 backdrop-blur-[2px] md:p-5" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={dialogLabel} className="card flex min-h-0 w-full overflow-hidden shadow-[var(--shadow)] outline-none">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-1 border-b border-line px-3 py-2">
            <IconButton label={t('common.close')} onClick={close}>
              <X size={16} />
            </IconButton>
            <IconButton label={t('slides.prev')} onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft size={16} />
            </IconButton>
            {position}
            <IconButton label={t('slides.next')} onClick={() => go(index + 1)} disabled={index >= slides.length - 1}>
              <ChevronRight size={16} />
            </IconButton>
            <span className="ml-2 flex min-w-0 flex-1">{context}</span>
            {historyButtons}
            {addButton}
            {modeButton}
            <Menu label={t('planner.actions')} items={menuItems} />
          </header>
          <Stage>{(width) => preview({ width }, 'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]')}</Stage>
          {!editing && notice && <div className="border-t border-line px-4 py-2 text-[12px] text-ink-2" role="status">{notice}</div>}
          {viewInfo}
          <Thumbs slides={slides} current={slide.key} groupAt={groupAt} theme={p.theme} scope={p.scope} onPick={goKey} />
        </div>
        {editing && (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-line lg:w-[420px]">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{t('editor.layout')}</span>
              {layoutButton}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              <div className="mb-3 space-y-2 empty:hidden">{notices}</div>
              {panel}
            </div>
          </aside>
        )}
      </div>
    </div>
  )

  return (
    <>
      {body}
      <LayoutPicker open={layoutOpen} onClose={() => setLayoutOpen(false)} current={doc.layout} onPick={changeLayout} theme={p.theme} scope={p.scope} />
      <NewSlidePicker open={adding} onClose={() => setAdding(false)} onPick={add} onPool={p.owner ? () => setPool(true) : undefined} theme={p.theme} scope={p.scope} owner={p.owner} />
      {p.owner && <SlidePicker open={pool} onClose={() => setPool(false)} onPick={(htmls) => add(htmls, false)} theme={p.theme} />}
    </>
  )
}

/** The slides of the source along the bottom; where they belong to several groups (the deck's steps), the group's name starts each run. */
function Thumbs({ slides, current, theme, scope, onPick }: { slides: EditorSlide[]; current: string; groupAt: number; theme: string; scope: AssetScope; onPick: (key: string) => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const grouped = new Set(slides.map((s) => s.group)).size > 1
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  return (
    <footer ref={ref} className="flex items-end gap-2 overflow-x-auto border-t border-line px-3 py-2">
      {slides.map((s, i) => (
        <div key={s.key} className="flex shrink-0 flex-col gap-0.5">
          {grouped && (i === 0 || slides[i - 1].group !== s.group) ? <span className="max-w-[104px] truncate text-[10px] text-ink-3">{s.groupLabel}</span> : grouped && <span className="h-[15px]" />}
          <button type="button" onClick={() => onPick(s.key)} className={cx('relative w-[104px] rounded-md ring-offset-2 ring-offset-surface', s.key === current && 'ring-2 ring-accent', !s.editable && 'opacity-80')} aria-label={t('slides.slide', { n: i + 1 })} aria-current={s.key === current}>
            <SlideView html={s.html} theme={theme} scope={scope} />
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink/70 px-1 text-[10px] font-medium text-paper tnum">{i + 1}</span>
          </button>
        </div>
      ))}
    </footer>
  )
}

/** What a slide that is not edited here is, and what can be done instead. */
function ReadOnly({ slide, canEdit, onDetails, onHide, onAdopt, onTemplate }: { slide: EditorSlide; canEdit: boolean; onDetails?: () => void; onHide?: (kind: 'agenda' | 'break') => void; onAdopt?: () => void; onTemplate?: () => void }) {
  const { t } = useTranslation()
  const kind = slide.generated?.kind
  const text = kind ? tr(t, `editor.generated.${kind}`) : slide.pool ? t('editor.poolNote') : t('editor.viewOnly')
  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-ink-2">
        <Info size={15} className="mt-0.5 shrink-0 text-ink-3" />
        <span>{text}</span>
      </div>
      <div className="flex flex-col items-start gap-2">
        {kind === 'title' && onDetails && <Button size="sm" onClick={onDetails}>{t('editor.openDetails')}</Button>}
        {kind === 'break' && onAdopt && canEdit && <Button size="sm" onClick={onAdopt}>{t('editor.adoptBreak')}</Button>}
        {(kind === 'agenda' || kind === 'break') && onHide && canEdit && (
          <Button size="sm" variant="ghost" onClick={() => onHide(kind)}>
            {kind === 'agenda' ? t('editor.hideAgenda') : t('editor.hideBreaks')}
          </Button>
        )}
        {slide.pool && onTemplate && (
          <Button size="sm" onClick={onTemplate}>
            <Save size={13} />
            {t('slides.saveAsTemplate')}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * The slide's markup, for what the fields do not reach. What is typed here is applied when the field is left, on
 * Apply, and before the editor pages, switches back to the fields or closes; what the format does not allow is
 * removed. Undo here is the field's own until it is applied; then the editor's history has it as one step.
 */
function SourceView({ html, onDraft, onApply, canEdit }: { html: string; onDraft: (html: string) => void; onApply: () => void; canEdit: boolean }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(html)
  const [base, setBase] = useState(html)
  if (base !== html) {
    setBase(html)
    setDraft(html)
  }
  return (
    <div>
      <Textarea
        value={draft}
        data-source="1"
        onChange={(e) => {
          setDraft(e.target.value)
          onDraft(e.target.value)
        }}
        onBlur={() => draft !== html && onApply()}
        spellCheck={false}
        className="min-h-[320px] font-mono text-[12px] leading-snug"
        aria-label={t('editor.sourceCode')}
        readOnly={!canEdit}
      />
      <p className="mt-1 text-[12px] text-ink-3">{t('slides.sourceHint')}</p>
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={onApply} disabled={draft === html}>
            {t('slides.apply')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** A horizontal swipe pages (phones, while looking); a tap or a vertical move does nothing. */
function Swipe({ onPrev, onNext, className, children }: { onPrev: () => void; onNext: () => void; className?: string; children: React.ReactNode }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      className={className}
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!start.current) return
        const dx = e.changedTouches[0].clientX - start.current.x
        const dy = e.changedTouches[0].clientY - start.current.y
        start.current = null
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? onNext : onPrev)()
      }}
    >
      {children}
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
