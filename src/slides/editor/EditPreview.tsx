import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AssetScope, useFrameScale, useHostHtml, useTheme, useThemeGround } from '../SlideView'
import { fieldSelectors, type SlideDoc } from '@/domain/slideDoc'
import { normalizeSlideHtml } from '@/domain/slides'
import { cardPictureKind, figureKind } from '@/domain/pool'
import { useKindContext } from '@/store/useThemes'
import { isReplaceable } from '../samples'
import { clearAt, elementAt, removeAt, setImage, setInline, type TreePath } from '@/domain/slideEdit'
import { boldPatch, formatRuns, nodesToRuns, type Patch, type RangeState, rangeState, runsLength, runsToNodes, sizePatch, trimBreaks } from '@/domain/inlineRuns'
import { api } from '@/api'
import { cx } from '@/components/ui'
import { uploadProblem } from '@/planner/upload'
import { PicturePicker, usePair } from './PicturePicker'
import { type Anchor, SlideToolbar } from './SlideToolbar'
import { baseBold, byPath, domRuns, entryOf, isFixed, kindOf, pathOf, placeCaret, renderRuns, selectionOffsets, type Session, setSelection, startSession, type TargetKind, targetOf, targets } from './inplace'
import './editor.css'

/** What the editor gives the preview so the slide can be changed on the slide itself. */
export interface OnSlide {
  /**
   * Stores the slide's markup after a change made on the slide; `field` names the text being typed in (its typing
   * is one step of the history) or is null. Answers the slide's markup as it is then, or null when the change was
   * not taken: the layout's fields could not hold it.
   */
  apply: (html: string, field: string | null) => string | null
  /** Pictures the picker offers. */
  known: string[]
  /** A line for the user; with `undo`, next to a way to take the change back. */
  notice: (text: string, undo?: boolean) => void
}

/** The element selected on the slide: where it stands in the markup, what it is, and whether its text is being typed in. */
interface Sel {
  path: TreePath
  tags: string[]
  kind: TargetKind
  editing: boolean
  /** Where the click was: the caret goes there. */
  point?: { x: number; y: number }
  /** Without a click: the whole text selected (Tab), else the caret at its end. */
  all?: boolean
}

/** A text being edited: the element, the markup it started from, and the markup the editor should show for it now. */
interface Live {
  s: Session
  base: string
  path: TreePath
  expected: string
  composing: boolean
  warned: boolean
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The slide as it will look, with the editor's marks (docs/slides.md, section 7): every element that shows a field
 * carries that field's path, so a field with the focus lights up its element, and it reports whether the content
 * runs over the slide's edge.
 *
 * With a mouse the slide is edited on the slide itself (`edit`): a click on a text puts the caret into it, a click
 * on a picture or an entry selects it, and a bar above the selection formats, replaces and removes. One text
 * element at a time is editable; what is typed goes into the slide's markup at once, through the same fields the
 * panel shows, so both stay in step and undo is the editor's. While a text is typed in, the markup React renders
 * is held still, so the caret stays where it is; when the text is left, the slide is rendered afresh from what was
 * stored. On a touch screen and on a phone there is no editing on the slide: a click opens the field instead.
 */
export function EditPreview({ doc, html, theme, scope, focus, onFocus, onEdit, viewing, onOverflow, className, style, edit, slideKey }: { doc: SlideDoc; html: string; theme: string; scope: AssetScope; focus: string | null; onFocus: (path: string) => void; /** Looking: a double-click on a text asks to edit it. */ onEdit?: (path: string) => void; viewing?: boolean; onOverflow?: (over: boolean) => void; className?: string; style?: React.CSSProperties; edit?: OnSlide; /** The slide shown: another one ends what was selected. */ slideKey?: string }) {
  // which of the pool's kinds the picker shows first for the picture selected: the one its place takes
  const kinds = useKindContext(theme)
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const scale = useFrameScale(ref)
  const rendered = useHostHtml(html, scope, undefined, useThemeGround(theme))
  useTheme(theme)
  const selectors = useMemo(() => fieldSelectors(doc), [doc])
  const [over, setOver] = useState(false)

  const inPlace = !!edit && !viewing
  const [sel, setSel] = useState<Sel | null>(null)
  /** Counts the times the slide has to be built afresh: after a text was edited, its element is not what React rendered. */
  const [epoch, setEpoch] = useState(0)
  const [state, setState] = useState<RangeState | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [picker, setPicker] = useState(false)
  const [, setTick] = useState(0)
  /** The markup shown while a text is edited: what was rendered when it began. */
  const frozen = useRef<string | null>(null)
  const session = useRef<Live | null>(null)
  /** A text double-clicked while looking: edited as soon as the editor edits. */
  const wanted = useRef<Sel | null>(null)
  const live = useRef({ html, rendered, edit, sel })
  live.current = { html, rendered, edit, sel }
  const shown = sel?.editing && frozen.current !== null ? frozen.current : rendered

  const section = () => root.current?.querySelector<HTMLElement>('.slide') ?? null
  /** An element's place in the markup, when the markup has that element there. */
  const locate = (e: Element): { path: TreePath; tags: string[] } | null => {
    const sec = section()
    const at = sec && pathOf(sec, e)
    return at && elementAt(live.current.html, at.path, at.tags) ? at : null
  }
  /** Ends the editing of a text: the slide is built afresh from what is stored. */
  const quit = () => {
    if (!session.current && frozen.current === null) return
    session.current = null
    frozen.current = null
    setEpoch((e) => e + 1)
  }
  const select = (next: Sel | null) => {
    quit()
    if (next?.editing) frozen.current = live.current.rendered
    setState(null)
    setSel(next)
  }
  const focusFrame = () => ref.current?.focus({ preventScroll: true })

  // Another slide, or the editor stopped editing: nothing is selected; a text double-clicked while looking is taken up.
  useLayoutEffect(() => {
    session.current = null
    frozen.current = null
    setEpoch((e) => e + 1)
    const next = inPlace ? wanted.current : null
    wanted.current = null
    if (next) frozen.current = live.current.rendered
    setState(null)
    setSel(next)
    setPicker(false)
  }, [slideKey, inPlace])

  // Mark the elements after every render of the markup, then check the fit.
  useLayoutEffect(() => {
    const sec = section()
    if (!sec) return
    for (const { path, selector } of selectors) {
      try {
        for (const el of sec.querySelectorAll<HTMLElement>(selector)) if (!el.dataset.f) el.dataset.f = path
      } catch {
        // a selector the browser does not know: that field has no mark
      }
    }
    // What a click selects, for the pointer and the outline under it.
    if (inPlace)
      for (const el of sec.querySelectorAll<HTMLElement>('*')) {
        const kind = kindOf(el)
        if (kind) el.dataset.t = kind
      }
    // The section hides its overflow; its scroll size still tells whether the content runs past 1280 × 720.
    const runsOver = sec.scrollHeight > 720 + 2 || sec.scrollWidth > 1280 + 2
    setOver(runsOver)
    onOverflow?.(runsOver)
  }, [shown, selectors, onOverflow, inPlace, epoch])

  useLayoutEffect(() => {
    const sec = section()
    if (!sec) return
    for (const el of sec.querySelectorAll('.is-focus')) el.classList.remove('is-focus')
    if (!focus) return
    // The field's own element, else the entry it belongs to ("cards.1.text" → "cards.1").
    const parts = focus.split('.')
    while (parts.length) {
      const hit = sec.querySelector(`[data-f="${parts.join('.')}"]`)
      if (hit) {
        hit.classList.add('is-focus')
        return
      }
      parts.pop()
    }
  }, [focus, shown, epoch])

  /** The selected element as the page shows it. */
  const selected = (): HTMLElement | null => {
    const sec = section()
    const at = live.current.sel
    return sec && at ? byPath(sec, at.path, at.tags) : null
  }
  const measure = () => {
    const r = selected()?.getBoundingClientRect()
    const next = r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
    setAnchor((prev) => (sameJson(prev, next) ? prev : next))
  }
  /** What the selected words carry (the whole text without a selection), for the bar; and where the bar stands. */
  const refresh = () => {
    const cur = session.current
    if (cur) {
      const runs = domRuns(cur.s)
      const at = selectionOffsets(cur.s)
      const [a, b] = at && at.end > at.start ? [at.start, at.end] : [0, runsLength(runs)]
      const next = rangeState(runs, a, b, baseBold(cur.s.el))
      setState((prev) => (sameJson(prev, next) ? prev : next))
    }
    measure()
  }

  // The selected element: its outline, and for a text what it carries.
  useLayoutEffect(() => {
    const sec = section()
    if (!sec) return
    for (const el of sec.querySelectorAll('.is-selected')) el.classList.remove('is-selected')
    if (!sel || !inPlace) return
    const el = byPath(sec, sel.path, sel.tags)
    if (!el || kindOf(el) !== sel.kind) {
      // the slide changed under the selection
      if (!sel.editing) setSel(null)
      return
    }
    if (sel.editing) return
    el.classList.add('is-selected')
    if (sel.kind !== 'text') return
    const tree = elementAt(html, sel.path, sel.tags)
    const runs = tree ? nodesToRuns(tree.children) : []
    const next = rangeState(runs, 0, runsLength(runs), baseBold(el))
    setState((prev) => (sameJson(prev, next) ? prev : next))
  }, [sel, shown, epoch, inPlace, html])

  // Where the bar stands: measured after every render, and when the window changes.
  useLayoutEffect(measure)
  useEffect(() => {
    const again = () => setTick((n) => n + 1)
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [])

  /** Writes the text being edited into the slide. Typing is one step of the history while it goes on; a command is one of its own. */
  const write = (typing: boolean) => {
    const cur = session.current
    const on = live.current.edit
    if (!cur || !on) return
    const next = setInline(cur.base, cur.path, runsToNodes(trimBreaks(domRuns(cur.s))))
    const out = next === null ? null : on.apply(next, typing ? `slide:${cur.path.join('.')}` : null)
    if (out !== null) cur.expected = out
    else if (!cur.warned) {
      cur.warned = true
      on.notice(t('editor.onSlide.cannotChange'))
    }
  }

  /** A formatting command: on the selected words while a text is edited, else on the whole text. */
  const format = (make: (state: RangeState) => Patch) => {
    const on = live.current.edit
    const at = live.current.sel
    if (!on || !at || at.kind !== 'text') return
    const cur = session.current
    if (cur) {
      const runs = domRuns(cur.s)
      const range = selectionOffsets(cur.s)
      const [a, b] = range && range.end > range.start ? [range.start, range.end] : [0, runsLength(runs)]
      renderRuns(cur.s, formatRuns(runs, a, b, make(rangeState(runs, a, b, baseBold(cur.s.el)))))
      if (range) setSelection(cur.s, range.start, range.end)
      write(false)
      refresh()
      return
    }
    const el = selected()
    const base = normalizeSlideHtml(live.current.html)
    const tree = elementAt(base, at.path, at.tags)
    if (!el || !tree) return
    const runs = nodesToRuns(tree.children)
    const len = runsLength(runs)
    const next = setInline(base, at.path, runsToNodes(formatRuns(runs, 0, len, make(rangeState(runs, 0, len, baseBold(el))))))
    if (next === null || on.apply(next, null) === null) on.notice(t('editor.onSlide.cannotChange'))
  }

  /** Removes the selected element; what stands in a fixed place, or cannot go without breaking the layout, is emptied. */
  const remove = () => {
    const on = live.current.edit
    const at = live.current.sel
    const el = selected()
    if (!on || !at || !el) return
    const base = normalizeSlideHtml(live.current.html)
    const tree = elementAt(base, at.path, at.tags)
    const took = (next: string | null) => next !== null && on.apply(next, null) !== null
    const done = (!isFixed(el) && took(removeAt(base, at.path))) || (!!tree?.children.length && took(clearAt(base, at.path)))
    if (done) {
      select(null)
      focusFrame()
      on.notice(t('editor.onSlide.removed'), true)
    } else on.notice(t('editor.onSlide.cannotRemove'))
  }

  /** The picture selected: its asset. */
  const picture = useMemo(() => {
    if (!sel || sel.kind !== 'image') return ''
    return /^asset:([0-9a-f]{16,64})$/.exec(elementAt(html, sel.path, sel.tags)?.attrs.src ?? '')?.[1] ?? ''
  }, [sel, html])
  const pair = usePair(scope, picture)
  const setPicture = (hash: string) => {
    const on = live.current.edit
    const at = live.current.sel
    if (!on || !at || at.kind !== 'image') return
    const next = setImage(normalizeSlideHtml(live.current.html), at.path, hash)
    if (next === null || on.apply(next, null) === null) on.notice(t('editor.onSlide.cannotChange'))
  }

  /** The next or the previous text or picture of the slide; false at the ends. */
  const step = (dir: 1 | -1, editing: boolean): boolean => {
    const sec = section()
    if (!sec) return false
    const list = targets(sec)
    const now = selected()
    const next = list[now ? list.indexOf(now) + dir : dir === 1 ? 0 : list.length - 1]
    const at = next && locate(next)
    if (!next || !at) return false
    const kind = kindOf(next)!
    select({ ...at, kind, editing: editing && kind === 'text', all: true })
    if (!(editing && kind === 'text')) focusFrame()
    return true
  }

  // A text is edited: the element takes what is typed, the slide follows every keystroke.
  const editKey = sel?.editing ? sel.path.join('.') : ''
  useLayoutEffect(() => {
    const at = live.current.sel
    if (!editKey || !at || !live.current.edit) return
    const sec = section()
    const el = sec && byPath(sec, at.path, at.tags)
    const base = normalizeSlideHtml(live.current.html)
    const tree = el && elementAt(base, at.path, at.tags)
    const s = el && tree ? startSession(el, tree) : null
    if (!el || !s) {
      // the page and the markup do not agree here: the element is selected, the fields edit it
      frozen.current = null
      setEpoch((e) => e + 1)
      setSel({ ...at, editing: false })
      return
    }
    const cur: Live = { s, base, path: at.path, expected: live.current.html, composing: false, warned: false }
    session.current = cur
    el.contentEditable = 'true'
    el.classList.add('is-editing')
    el.focus({ preventScroll: true })
    // sample and placeholder words are there to be replaced: selected as a whole, the first key typed does it
    if (at.all || isReplaceable(el.textContent ?? '')) setSelection(s, 0, runsLength(domRuns(s)))
    else placeCaret(s, at.point)
    refresh()

    const mine = () => session.current === cur
    /** Back to the element selected, not typed in. */
    const finish = () => {
      select({ ...at, editing: false, point: undefined, all: undefined })
      focusFrame()
    }
    const onInput = () => {
      if (!mine() || cur.composing) return
      write(true)
      refresh()
    }
    const onBefore = (e: InputEvent) => {
      // Enter ends the editing (keydown); the browser's own formatting, undo and drops would go past the slide's markup.
      const kind = e.inputType
      if (kind === 'insertParagraph' || kind.startsWith('format') || kind === 'historyUndo' || kind === 'historyRedo' || kind === 'insertFromDrop') e.preventDefault()
    }
    const onPaste = (e: ClipboardEvent) => {
      // words only, on one line: what else the clipboard holds does not belong on a slide
      e.preventDefault()
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*[\r\n]+\s*/g, ' ')
      if (text) document.execCommand('insertText', false, text)
    }
    const onKey = (e: KeyboardEvent) => {
      if (!mine() || e.isComposing) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        finish()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (!step(e.shiftKey ? -1 : 1, true)) finish()
      } else if (mod && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        format((st) => boldPatch(st, baseBold(el)))
      } else if (mod && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        format((st) => ({ italic: !st.italic }))
      }
    }
    const onBlur = () => {
      // Left for a field or a button of the editor (not for another window): the text is done.
      if (mine() && document.hasFocus()) select(null)
    }
    const onStart = () => (cur.composing = true)
    const onEnd = () => {
      cur.composing = false
      onInput()
    }
    const onSelection = () => mine() && refresh()
    el.addEventListener('input', onInput)
    el.addEventListener('beforeinput', onBefore)
    el.addEventListener('paste', onPaste)
    el.addEventListener('keydown', onKey)
    el.addEventListener('blur', onBlur)
    el.addEventListener('compositionstart', onStart)
    el.addEventListener('compositionend', onEnd)
    document.addEventListener('selectionchange', onSelection)
    return () => {
      el.removeEventListener('input', onInput)
      el.removeEventListener('beforeinput', onBefore)
      el.removeEventListener('paste', onPaste)
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('compositionstart', onStart)
      el.removeEventListener('compositionend', onEnd)
      document.removeEventListener('selectionchange', onSelection)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey, epoch])

  // The slide changed while a text was edited and not by the typing (undo, another window): go on in the same text
  // on what the slide holds now, if it still has it.
  useEffect(() => {
    const cur = session.current
    const at = live.current.sel
    if (!cur || html === cur.expected) return
    session.current = null
    const still = !!at && !!elementAt(html, at.path, at.tags)
    frozen.current = still ? live.current.rendered : null
    setEpoch((e) => e + 1)
    setSel(still ? { ...at!, point: undefined, all: undefined } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  const onMouseDown = (e: React.MouseEvent) => {
    if (!inPlace || e.button !== 0) return
    const sec = section()
    const from = e.target as Element
    const hit = sec && sec.contains(from) ? targetOf(sec, from) : null
    // inside the text being edited: the browser moves the caret
    if (hit && hit === session.current?.s.el) return
    if (!hit) {
      select(null)
      return
    }
    const at = locate(hit)
    if (!at) {
      // an element the markup does not have at this place (the browser repaired it): its field, as on a touch screen
      const field = hit.closest<HTMLElement>('[data-f]')?.dataset.f
      if (field) onFocus(field)
      return
    }
    e.preventDefault()
    const kind = kindOf(hit)!
    select({ ...at, kind, editing: kind === 'text', point: { x: e.clientX, y: e.clientY } })
    if (kind !== 'text') focusFrame()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!inPlace || session.current || e.target !== ref.current) return
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Tab' && !mod && !e.altKey) {
      // into the slide and through its texts and pictures; out again at the ends
      if (!sel && e.shiftKey) return
      if (step(e.shiftKey ? -1 : 1, false)) {
        e.preventDefault()
        e.stopPropagation()
      } else if (sel) select(null)
      return
    }
    if (!sel) return
    if (e.key === 'Escape') {
      e.preventDefault()
      select(null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (sel.kind === 'text') select({ ...sel, editing: true, point: undefined, all: false })
      else if (sel.kind === 'image') setPicker(true)
    } else if (sel.kind === 'text' && mod && !e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      format((st) => boldPatch(st, baseBold(selected()!)))
    } else if (sel.kind === 'text' && mod && !e.altKey && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      format((st) => ({ italic: !st.italic }))
    }
  }

  /** A picture file dropped onto a picture of the slide takes its place. */
  const pictureUnder = (e: React.DragEvent): { path: TreePath; tags: string[] } | null => {
    const sec = section()
    const hit = inPlace && sec && e.dataTransfer.types.includes('Files') ? targetOf(sec, e.target as Element) : null
    return hit && kindOf(hit) === 'image' ? locate(hit) : null
  }
  const onDrop = (e: React.DragEvent) => {
    const at = pictureUnder(e)
    const file = e.dataTransfer.files[0]
    const on = live.current.edit
    if (!at || !file || !on) return
    e.preventDefault()
    const before = live.current.html
    api.uploadAsset(scope, file).then(
      (asset) => {
        // only onto the slide the picture was dropped on, as it was then
        if (live.current.html !== before) return
        const next = setImage(normalizeSlideHtml(before), at.path, asset.cutout ?? asset.hash)
        if (next === null || live.current.edit?.apply(next, null) == null) on.notice(t('editor.onSlide.cannotChange'))
      },
      (err) => on.notice(uploadProblem(err, file.name, t)),
    )
  }

  const selEl = sel && inPlace ? selected() : null
  const sec = section()
  const entry = selEl && sec && sel && sel.kind !== 'entry' ? entryOf(sec, selEl) : null
  return (
    <>
      <div
        ref={ref}
        tabIndex={inPlace ? 0 : undefined}
        className={cx('slide-frame slide-edit outline-none', over && 'is-overflow', viewing && 'is-view', inPlace && 'is-inplace', className)}
        onDoubleClick={(e) => {
          const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')
          if (onEdit) {
            // On the slide itself where that is possible: the text double-clicked is the one to type in.
            const here = section()
            const text = here ? targetOf(here, e.target as Element) : null
            const at = text && kindOf(text) === 'text' ? locate(text) : null
            wanted.current = at ? { ...at, kind: 'text', editing: true, point: { x: e.clientX, y: e.clientY } } : null
            onEdit(hit?.dataset.f ?? 'header.title')
          } else if (inPlace && sel?.kind === 'image' && !picker) setPicker(true)
        }}
        style={{ ...style, '--s': scale } as React.CSSProperties}
        onClick={(e) => {
          if (inPlace) return
          const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')
          if (hit?.dataset.f) onFocus(hit.dataset.f)
        }}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        onDragOver={(e) => pictureUnder(e) && e.preventDefault()}
        onDrop={onDrop}
      >
        <div key={epoch} ref={root} className="slide-root" data-theme={theme} dangerouslySetInnerHTML={{ __html: shown }} />
      </div>
      {inPlace && sel && anchor && (sel.kind !== 'text' || state) && (
        <SlideToolbar
          anchor={anchor}
          kind={sel.kind}
          theme={theme}
          state={sel.kind === 'text' ? state : null}
          onBold={() => format((st) => boldPatch(st, baseBold(selected()!)))}
          onItalic={() => format((st) => ({ italic: !st.italic }))}
          onSize={(dir) => format((st) => sizePatch(st, dir))}
          onColor={(color) => format(() => ({ color }))}
          onClear={() => format(() => ({ clear: true }))}
          onReplace={sel.kind === 'image' ? () => setPicker(true) : undefined}
          cutout={sel.kind === 'image' && pair?.cutout ? { on: picture === pair.cutout, set: (on) => setPicture(on ? pair.cutout! : pair.original) } : undefined}
          onEntry={
            entry
              ? () => {
                  const at = locate(entry)
                  if (!at) return
                  select({ ...at, kind: 'entry', editing: false })
                  focusFrame()
                }
              : undefined
          }
          onRemove={remove}
        />
      )}
      {edit && <PicturePicker open={picker && sel?.kind === 'image'} onClose={() => {
            // back to the slide, so the keys go on working on the picture
            setPicker(false)
            focusFrame()
          }}
          onPick={setPicture} scope={scope} known={edit.known} current={picture} theme={theme} prefer={selEl?.closest('ul.cards') ? cardPictureKind(doc) : figureKind(doc, kinds)} />}
    </>
  )
}
