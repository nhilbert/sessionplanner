import { useCallback, useEffect, useRef, useState } from 'react'
import { type Color, formatRuns, type Patch, rangeState, type RangeState, runsLength, runsToNodes, sizePatch, boldPatch, trimBreaks } from '@/domain/inlineRuns'
import { setSheetInline, sheetElementAt } from '@/domain/sheetDoc'
import { baseBold, domRuns, pathOf, placeCaret, renderRuns, selectionOffsets, type Session, setSelection, startSession } from '@/slides/editor/inplace'
import type { Anchor } from '@/slides/editor/SlideToolbar'

/**
 * Typing on the worksheet page (docs/worksheets.md, section 7, stage 3b), with the machinery of the slides
 * (slides/editor/inplace.ts, domain/inlineRuns.ts): one text element at a time is editable; what is typed is read as
 * runs after every keystroke and written into the page's markup at the element's place, then read as the page's
 * document like any change of a field. While a text is typed in, the page React renders is held still, so the caret
 * never jumps; when the text is left, the page is rendered afresh from what was stored.
 *
 * Only with a mouse or trackpad on more than a phone's width; touch screens keep the fields (as for slides).
 */

/** Elements that hold a text of their own on a page. */
const TEXT = 'h1,h2,h3,p,li,dt,dd,th,td,figcaption,.eyebrow,span.time,span.score'
/** What may stand inside such a text: formatting, a blank, a line break. */
const INLINE = 'strong,em,b,i,code,span,br'

/** The text element a click on `from` means: the nearest one upwards that holds only words. */
export function textTarget(section: Element, from: Element | null): HTMLElement | null {
  for (let e = from; e && e !== section && section.contains(e); e = e.parentElement) {
    if (e.closest('svg, .sheet-foot, .sheet-head')) return null
    if (!(e instanceof HTMLElement) || !e.matches(TEXT)) continue
    // a step's heading holds its time: the heading is edited in the fields, the time on the page
    if ([...e.children].every((c) => c.matches(INLINE) && !c.matches('span.time, span.score'))) return e
    return null
  }
  return null
}

export interface OnPage {
  /** The markup to render: held still while a text is typed in. */
  shown: (html: string) => string
  /** Starts typing into the text under a mouse press on the page; true when it did (the press is then the caret's). */
  begin: (section: Element, target: Element, point: { x: number; y: number }) => boolean
  /** Ends typing (undo, redo, paging, closing). */
  end: () => void
  /** The text being typed in, for the bar above it. */
  active: { anchor: Anchor; state: RangeState } | null
  format: (make: (state: RangeState) => Patch) => void
  bold: () => void
  italic: () => void
  size: (dir: 1 | -1) => void
  color: (c: Color | null) => void
  clear: () => void
}

interface Live {
  s: Session
  base: string
  path: number[]
}

/**
 * The page's in-place editing. `html` is the page as stored; `write` stores a new page markup, `field` naming the
 * text so typing in it is one step of the history.
 */
export function useOnPage(html: string, write: (html: string, field: string | null) => void): OnPage {
  const [frozen, setFrozen] = useState<string | null>(null)
  const [active, setActive] = useState<OnPage['active']>(null)
  const live = useRef<Live | null>(null)
  const latest = useRef({ html, write })
  latest.current = { html, write }

  const refresh = useCallback(() => {
    const cur = live.current
    if (!cur) return setActive(null)
    const runs = domRuns(cur.s)
    const range = selectionOffsets(cur.s)
    const [a, b] = range && range.end > range.start ? [range.start, range.end] : [0, runsLength(runs)]
    const r = cur.s.el.getBoundingClientRect()
    setActive({ anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, state: rangeState(runs, a, b, baseBold(cur.s.el)) })
  }, [])

  const store = useCallback((typing: boolean) => {
    const cur = live.current
    if (!cur) return
    const next = setSheetInline(cur.base, cur.path, runsToNodes(trimBreaks(domRuns(cur.s))))
    if (next !== null) latest.current.write(next, typing ? `page:${cur.path.join('.')}` : null)
  }, [])

  const end = useCallback(() => {
    const cur = live.current
    if (!cur) return
    live.current = null
    cur.s.el.contentEditable = 'false'
    cur.s.el.classList.remove('is-editing')
    setActive(null)
    setFrozen(null)
  }, [])

  const begin = (section: Element, target: Element, point: { x: number; y: number }): boolean => {
    const el = textTarget(section, target)
    if (!el) return false
    if (live.current?.s.el === el) return true
    end()
    const at = pathOf(section, el)
    const base = latest.current.html
    const tree = at && sheetElementAt(base, at.path, at.tags)
    const s = tree ? startSession(el, tree) : null
    if (!at || !s) return false
    live.current = { s, base, path: at.path }
    setFrozen(base)
    el.contentEditable = 'true'
    el.classList.add('is-editing')
    el.focus({ preventScroll: true })
    placeCaret(s, point)
    refresh()
    return true
  }

  // the element's own events: typing, keys, paste, leaving
  useEffect(() => {
    const cur = live.current
    if (!cur) return
    const el = cur.s.el
    let composing = false
    const onInput = () => {
      if (composing) return
      store(true)
      refresh()
    }
    const onBefore = (e: InputEvent) => {
      const kind = e.inputType
      if (kind === 'insertParagraph' || kind.startsWith('format') || kind === 'historyUndo' || kind === 'historyRedo' || kind === 'insertFromDrop') e.preventDefault()
    }
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*[\r\n]+\s*/g, ' ')
      if (text) document.execCommand('insertText', false, text)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        e.stopPropagation()
        el.blur()
      } else if (mod && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        format((st) => boldPatch(st, baseBold(el)))
      } else if (mod && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        format((st) => ({ italic: !st.italic }))
      }
    }
    const onBlur = () => {
      if (document.hasFocus()) end()
    }
    const onStart = () => (composing = true)
    const onEnd = () => {
      composing = false
      onInput()
    }
    const onSelection = () => live.current === cur && refresh()
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
  }, [frozen])

  /** A formatting command on the selected words, or on the whole text when none are selected. */
  const format = (make: (state: RangeState) => Patch) => {
    const cur = live.current
    if (!cur) return
    const runs = domRuns(cur.s)
    const range = selectionOffsets(cur.s)
    const [a, b] = range && range.end > range.start ? [range.start, range.end] : [0, runsLength(runs)]
    renderRuns(cur.s, formatRuns(runs, a, b, make(rangeState(runs, a, b, baseBold(cur.s.el)))))
    if (range) setSelection(cur.s, range.start, range.end)
    store(false)
    refresh()
  }

  return {
    shown: (h) => frozen ?? h,
    begin,
    end,
    active,
    format,
    bold: () => format((st) => boldPatch(st, baseBold(live.current!.s.el))),
    italic: () => format((st) => ({ italic: !st.italic })),
    size: (dir) => format((st) => sizePatch(st, dir)),
    color: (c) => format(() => ({ color: c })),
    clear: () => format(() => ({ clear: true })),
  }
}
