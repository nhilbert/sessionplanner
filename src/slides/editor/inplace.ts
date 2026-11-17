import { type El, type Node as TreeNode, el as treeEl, elements, formatTokens } from '@/domain/slideTree'
import { foldSpaces, isFormatEl, type Marks, nodesToRuns, type Run, runsToNodes, withWords } from '@/domain/inlineRuns'
import type { TreePath } from '@/domain/slideEdit'

/**
 * Editing on the slide itself (docs/slides.md, section 7, "On the slide"), the part that touches the page: which
 * element a click means, where it stands in the slide's markup, and one text element made editable for a while.
 *
 * While a text is edited the browser types into the element; everything else goes through the runs
 * (domain/inlineRuns.ts): the element's content is read as runs after every keystroke and written to the slide, and
 * a formatting command changes the runs and builds the element's content from them again. The caret and the
 * selection are kept as positions in the runs, so they survive that.
 */

// ---- what a click means ---------------------------------------------------------------------------------------

export type TargetKind = 'text' | 'image' | 'entry'

/** Elements that hold a text of their own. */
const TEXT = 'h1,h2,h3,p,li,dt,dd,figcaption,cite,th,td,.eyebrow,footer>.source,footer>.takeaway,.agenda>li>span,.axis-y>span,.axis-x>span,dl.acronym dd>strong,dl.acronym dd>span'
const BLOCK = 'h1,h2,h3,p,div,ul,ol,dl,figure,img,table,blockquote,aside,header,footer,section,svg'
/** Elements that are one entry of a list of the slide: a card, a point, a step, a box, a row. */
const ENTRY = 'li,.canvas>.box,.matrix .cell,.compare>.side,dl.acronym>div,tbody>tr'
/** Entries that stand in a fixed place: removing one would move the others, so they are emptied instead. */
const FIXED = '.matrix .cell,td,th'

const isList = (e: Element) => e.tagName === 'UL' || e.tagName === 'OL'

/** What a click on this very element selects: a text (an element that holds words and no blocks), a picture, an entry. */
export function kindOf(e: Element): TargetKind | null {
  if (e.closest('svg, footer.chrome')) return null
  if (e.tagName === 'IMG') return e.classList.contains('logo') ? null : 'image'
  if (e.matches(TEXT) && ![...e.children].some((c) => c.matches(TEXT) || (c.matches(BLOCK) && !(e.tagName === 'LI' && isList(c))))) return 'text'
  return e.matches(ENTRY) ? 'entry' : null
}

/** The element a click on `from` selects: the nearest one upwards that is a text, a picture or an entry. */
export function targetOf(section: Element, from: Element | null): HTMLElement | null {
  for (let e = from; e && e !== section && section.contains(e); e = e.parentElement) if (e instanceof HTMLElement && kindOf(e)) return e
  return null
}

/** The entry an element belongs to (the card of a heading), for "select the entry". */
export const entryOf = (section: Element, e: Element): HTMLElement | null => {
  const up = e.parentElement?.closest<HTMLElement>(ENTRY)
  return up && section.contains(up) ? up : null
}

export const isFixed = (e: Element): boolean => e.matches(FIXED)

/** Every text and picture of the slide in reading order (what Tab steps through). */
export const targets = (section: Element): HTMLElement[] => [...section.querySelectorAll<HTMLElement>('*')].filter((e) => kindOf(e) === 'text' || kindOf(e) === 'image')

/**
 * Where an element stands in the slide: its positions among the element children from the section down, and the
 * tags on the way (slideEdit.ts checks them against the markup). An island of a text being edited carries its
 * position in the markup (`data-ix`), since the text's formatting elements around it come and go.
 */
export function pathOf(section: Element, e: Element): { path: TreePath; tags: string[] } | null {
  const path: number[] = []
  const tags: string[] = []
  for (let at: Element = e; at !== section; ) {
    const parent = at.parentElement
    if (!parent) return null
    const ix = at instanceof HTMLElement && at.dataset.ix !== undefined ? Number(at.dataset.ix) : [...parent.children].indexOf(at)
    path.unshift(ix)
    tags.unshift(at.tagName.toLowerCase())
    at = parent
  }
  return { path, tags }
}

export function byPath(section: Element, path: TreePath, tags: string[]): HTMLElement | null {
  let at: Element = section
  for (let i = 0; i < path.length; i++) {
    const next = at.children[path[i]]
    if (!next || next.tagName.toLowerCase() !== tags[i]) return null
    at = next
  }
  return at instanceof HTMLElement ? at : null
}

// ---- one text element, editable -------------------------------------------------------------------------------

export interface Session {
  el: HTMLElement
  /** The islands of the text (domain/inlineRuns.ts): the markup's node and the element that shows it, kept as it is. */
  byNode: Map<TreeNode, HTMLElement>
  byEl: Map<Element, TreeNode>
}

/**
 * Makes ready to edit the element that shows `tree`: its islands are found (the element and the markup have the
 * same children, the page was rendered from it) and set aside, and its content is built from the runs with the
 * whitespace folded, so it can be shown with every space kept while it is typed in. Null when the two do not match.
 */
export function startSession(el: HTMLElement, tree: El): Session | null {
  const s: Session = { el, byNode: new Map(), byEl: new Map() }
  const pair = (t: El, d: Element, top: boolean): boolean => {
    const te = elements(t)
    const de = [...d.children]
    if (te.length !== de.length) return false
    return te.every((child, k) => {
      const shown = de[k]
      if (child.tag !== shown.tagName.toLowerCase() || !(shown instanceof HTMLElement)) return false
      if (isFormatEl(child)) return pair(child, shown, false)
      s.byNode.set(child, shown)
      s.byEl.set(shown, child)
      shown.contentEditable = 'false'
      if (top) shown.dataset.ix = String(k)
      return true
    })
  }
  if (!pair(tree, el, true)) return null
  renderRuns(s, foldSpaces(nodesToRuns(tree.children)))
  return s
}

type Item = { kind: 'text'; node: Text; text: string; marks: Marks } | { kind: 'br'; node: Element; virtual?: boolean } | { kind: 'island'; node: Element; tree: TreeNode }

/** The element's content in order, as the pieces the runs are made of. A line end inside a text is a line break of one position. */
function scan(s: Session): Item[] {
  const out: Item[] = []
  const walk = (parent: Node, marks: Marks) => {
    for (const n of parent.childNodes) {
      if (n instanceof Text) {
        if (n.data) out.push({ kind: 'text', node: n, text: n.data, marks })
        continue
      }
      if (!(n instanceof HTMLElement)) continue
      const island = s.byEl.get(n)
      if (island) {
        out.push({ kind: 'island', node: n, tree: island })
        continue
      }
      const tag = n.tagName
      if (tag === 'BR') {
        // the break the editor puts at the end so the caret can stand on the new line is not content
        if (n.dataset.pad === undefined) out.push({ kind: 'br', node: n })
        continue
      }
      let m = marks
      if (tag === 'STRONG' || tag === 'B') m = { ...marks, weight: 'bold' }
      else if (tag === 'EM' || tag === 'I') m = { ...marks, italic: true }
      else if (tag === 'CODE') m = { ...marks, code: true }
      else if (tag === 'SPAN') {
        const words = formatTokens(treeEl('span', { class: n.className }))
        if (words) m = withWords(marks, words)
      } else if ((tag === 'DIV' || tag === 'P') && out.length && out[out.length - 1].kind !== 'br') out.push({ kind: 'br', node: n, virtual: true })
      walk(n, m)
    }
  }
  walk(s.el, {})
  return out
}

/** The element's content as runs, positions as the browser's selection counts them. */
export function domRuns(s: Session): Run[] {
  const out: Run[] = []
  for (const it of scan(s)) {
    if (it.kind === 'br') out.push({ kind: 'br' })
    else if (it.kind === 'island') out.push({ kind: 'island', node: it.tree })
    else
      it.text.split('\n').forEach((part, i) => {
        if (i > 0) out.push({ kind: 'br' })
        if (part) out.push({ kind: 'text', text: part, marks: it.marks })
      })
  }
  return out
}

/** Builds the element's content from runs; the islands are the elements they were. */
export function renderRuns(s: Session, runs: Run[]): void {
  const dom = (n: TreeNode): Node => {
    if (n.type === 'text') return document.createTextNode(n.text)
    const island = s.byNode.get(n)
    if (island) return island
    const e = document.createElement(n.tag)
    if (n.attrs.class) e.className = n.attrs.class
    e.append(...n.children.map(dom))
    return e
  }
  s.el.replaceChildren(...runsToNodes(runs).map(dom))
  if (runs[runs.length - 1]?.kind === 'br') {
    const pad = document.createElement('br')
    pad.dataset.pad = ''
    s.el.append(pad)
  }
}

const indexIn = (n: Node): number => [...(n.parentNode?.childNodes ?? [])].indexOf(n as ChildNode)

/** A point of the browser's selection as a position in the runs. */
function offsetOf(s: Session, container: Node, offset: number): number | null {
  const r = document.createRange()
  r.selectNodeContents(s.el)
  try {
    r.setEnd(container, offset)
  } catch {
    return null
  }
  // Everything that ends before that point counts whole; the text the point stands in counts up to it.
  let n = 0
  for (const it of scan(s)) {
    if (it.kind === 'text') {
      if (it.node === container) n += Math.min(offset, it.text.length)
      else if (r.comparePoint(it.node, it.text.length) === 0) n += it.text.length
    } else if (it.kind === 'br' && it.virtual) {
      if (r.comparePoint(it.node, 0) === 0) n += 1
    } else if (it.node.parentNode && r.comparePoint(it.node.parentNode, indexIn(it.node) + 1) === 0) n += 1
  }
  return n
}

/** A position in the runs as a point for the browser's selection. */
function pointAt(s: Session, at: number): { node: Node; offset: number } {
  let pos = 0
  for (const it of scan(s)) {
    if (it.kind === 'text') {
      if (at <= pos + it.text.length) return { node: it.node, offset: at - pos }
      pos += it.text.length
    } else {
      if (at === pos && !(it.kind === 'br' && it.virtual) && it.node.parentNode) return { node: it.node.parentNode, offset: indexIn(it.node) }
      pos += 1
    }
  }
  const last = s.el.lastChild
  const pad = last instanceof HTMLElement && last.dataset.pad !== undefined
  return { node: s.el, offset: s.el.childNodes.length - (pad ? 1 : 0) }
}

/** The selection inside the element as positions in the runs, or null when it is elsewhere. */
export function selectionOffsets(s: Session): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!s.el.contains(r.startContainer) || !s.el.contains(r.endContainer)) return null
  const start = offsetOf(s, r.startContainer, r.startOffset)
  const end = offsetOf(s, r.endContainer, r.endOffset)
  return start === null || end === null ? null : { start, end }
}

export function setSelection(s: Session, start: number, end: number): void {
  const sel = window.getSelection()
  if (!sel) return
  const a = pointAt(s, start)
  const b = end === start ? a : pointAt(s, end)
  const r = document.createRange()
  r.setStart(a.node, a.offset)
  r.setEnd(b.node, b.offset)
  sel.removeAllRanges()
  sel.addRange(r)
}

/** The caret to where the user clicked, or to the end of the text. */
export function placeCaret(s: Session, point?: { x: number; y: number }): void {
  const sel = window.getSelection()
  if (!sel) return
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null }
  let at: { node: Node; offset: number } | null = null
  if (point) {
    const pos = doc.caretPositionFromPoint?.(point.x, point.y)
    if (pos) at = { node: pos.offsetNode, offset: pos.offset }
    else {
      const range = doc.caretRangeFromPoint?.(point.x, point.y)
      if (range) at = { node: range.startContainer, offset: range.startOffset }
    }
    // a click on an island or outside the words: the end of the text
    if (at && (!s.el.contains(at.node) || [...s.byEl.keys()].some((island) => island.contains(at!.node)))) at = null
  }
  const to = at ?? pointAt(s, Number.MAX_SAFE_INTEGER)
  const r = document.createRange()
  r.setStart(to.node, to.offset)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

/** Whether the theme sets the element's own text bold (a heading): "bold" then means taking it off. */
export const baseBold = (e: Element): boolean => (parseInt(getComputedStyle(e).fontWeight, 10) || 400) >= 600
