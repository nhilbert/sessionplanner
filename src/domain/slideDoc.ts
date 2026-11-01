import { type El, type Node, classes, el, elements, hasClass, inlineToText, isBlank, isEl, parseTree, serializeNode, serializeNodes, textOf, textToInline, txt } from './slideTree.ts'

/**
 * The structured view of a slide (docs/slides.md, section 7): what the editor shows as fields, read from the
 * markup and written back to it. Content (the words, the pictures) and layout (which catalogue layout, which of
 * its options) are kept apart: a slide document names its layout and holds its content in parts – a header, a
 * list of points, cards, steps, a figure … – and the layout decides which parts are shown and how. The stylesheet
 * (slides.css) and the theme own the appearance; nothing here carries a colour or a size.
 *
 * A slide whose body does not have the catalogue's structure keeps that body as source (`raw`): the editor then
 * offers the header, the footer and the source, so no slide is ever locked.
 */

export type OptionValue = boolean | number

export interface Header {
  eyebrow: string
  title: string
  lead: string
  /** The pill in front of an exercise title. */
  tag: string
}
/** The text block of title, section, statement, break and closing slides. */
export interface TextBlock {
  eyebrow: string
  title: string
  subtitle: string
  meta: string
  lead: string
  big: string
  sub: string
  until: string
  /** Closing slide: the line under the title. */
  body: string
}
export interface Point {
  text: string
  children: string[]
}
export interface Card {
  /** Asset hash of the picture, or ''. */
  image: string
  eyebrow: string
  title: string
  text: string
  points: string[]
}
export interface Step {
  eyebrow: string
  title: string
  text: string
}
export interface Fact {
  term: string
  value: string
}
export interface Quote {
  text: string
  sub: string
  cite: string
}
export interface Figure {
  image: string
  alt: string
  caption: string
}
export type Block = { kind: 'lead' | 'p' | 'small' | 'h3'; text: string } | { kind: 'list'; points: string[] }
export interface AgendaRow {
  when: string
  text: string
  isBreak: boolean
}
export interface Cell {
  title: string
  text: string
  accent: boolean
}
export interface Matrix {
  axisY: [string, string]
  axisX: [string, string]
  cells: Cell[]
}
export interface Letter {
  letter: string
  term: string
  text: string
}
export interface Box {
  title: string
  text: string
  wide: boolean
  tall: boolean
  accent: boolean
}
export type Tone = '' | 'good' | 'bad'
export interface Table {
  head: string[]
  rows: { text: string; tone: Tone }[][]
}
export interface Glyph {
  char: string
  caption: string
}

export interface SlideDoc {
  layout: string
  options: Record<string, OptionValue>
  header?: Header
  text?: TextBlock
  points?: Point[]
  cards?: Card[]
  steps?: Step[]
  facts?: Fact[]
  quote?: Quote
  figure?: Figure
  blocks?: Block[]
  rows?: AgendaRow[]
  matrix?: Matrix
  letters?: Letter[]
  boxes?: Box[]
  table?: Table
  /** Inline SVG of a model slide (or in the figure of a split slide), kept as markup. */
  svg?: string
  glyph?: Glyph
  /** Closing slide: the theme's logo above the title. */
  logo?: boolean
  source?: string
  /** The body as markup when its structure is not the catalogue's. */
  raw?: string
}

// ---- the catalogue as a schema ----------------------------------------------------------------------------------

export type Part = 'header' | 'text' | 'points' | 'cards' | 'steps' | 'facts' | 'quote' | 'figure' | 'blocks' | 'rows' | 'matrix' | 'letters' | 'boxes' | 'table' | 'svg' | 'glyph' | 'logo' | 'source'
export type OptionSpec = { key: string; kind: 'flag' } | { key: string; kind: 'choice'; values: number[]; default: number }
export type LayoutGroup = 'opening' | 'text' | 'structure' | 'visual'

export interface LayoutSpec {
  id: string
  group: LayoutGroup
  parts: Part[]
  /** The fields of the text block this layout uses, in order. */
  textFields?: (keyof TextBlock)[]
  options: OptionSpec[]
  /** How many entries the main list holds before the slide is over-full. */
  max?: number
  /** The app generates slides of this layout from the plan; writing one is the special case. */
  generated?: boolean
}

const flag = (key: string): OptionSpec => ({ key, kind: 'flag' })
const choice = (key: string, values: number[], def: number): OptionSpec => ({ key, kind: 'choice', values, default: def })

export const LAYOUTS: LayoutSpec[] = [
  { id: 'title', group: 'opening', parts: ['figure', 'text'], textFields: ['eyebrow', 'title', 'subtitle', 'meta'], options: [], generated: true },
  { id: 'section', group: 'opening', parts: ['text', 'points', 'glyph'], textFields: ['eyebrow', 'title', 'lead'], options: [], max: 5 },
  { id: 'agenda', group: 'opening', parts: ['header', 'rows'], options: [], max: 11, generated: true },
  { id: 'break', group: 'opening', parts: ['text', 'figure'], textFields: ['title', 'until'], options: [], generated: true },
  { id: 'closing', group: 'opening', parts: ['logo', 'text'], textFields: ['title', 'body'], options: [], generated: true },
  { id: 'statement', group: 'text', parts: ['text'], textFields: ['eyebrow', 'big', 'sub'], options: [flag('long')] },
  { id: 'quote', group: 'text', parts: ['quote'], options: [] },
  { id: 'list', group: 'text', parts: ['header', 'points', 'source'], options: [flag('ordered'), flag('compact'), flag('two'), flag('rows'), flag('four')], max: 8 },
  { id: 'cards', group: 'structure', parts: ['header', 'cards', 'source'], options: [choice('cols', [2, 3, 4, 5], 3), flag('numbered'), flag('plain'), flag('contain'), flag('picture')], max: 10 },
  { id: 'split', group: 'visual', parts: ['header', 'blocks', 'figure', 'source'], options: [flag('figureLeft'), flag('wideText')] },
  { id: 'figure', group: 'visual', parts: ['header', 'figure'], options: [flag('full')] },
  { id: 'exercise', group: 'structure', parts: ['header', 'steps', 'facts'], options: [], max: 6 },
  { id: 'steps', group: 'structure', parts: ['header', 'steps', 'source'], options: [flag('plain')], max: 5 },
  { id: 'matrix', group: 'structure', parts: ['header', 'matrix', 'source'], options: [] },
  { id: 'acronym', group: 'structure', parts: ['header', 'letters', 'source'], options: [flag('compact')], max: 8 },
  { id: 'canvas', group: 'structure', parts: ['header', 'boxes', 'source'], options: [choice('cols', [2, 3, 4], 3)], max: 12 },
  { id: 'model', group: 'visual', parts: ['header', 'svg', 'figure', 'source'], options: [] },
  { id: 'table', group: 'structure', parts: ['header', 'table', 'source'], options: [flag('compact')], max: 8 },
]
export const LAYOUT_IDS = LAYOUTS.map((l) => l.id)
export const layoutSpec = (id: string): LayoutSpec | undefined => LAYOUTS.find((l) => l.id === id)

const emptyHeader = (): Header => ({ eyebrow: '', title: '', lead: '', tag: '' })
const emptyText = (): TextBlock => ({ eyebrow: '', title: '', subtitle: '', meta: '', lead: '', big: '', sub: '', until: '', body: '' })
export const emptyCard = (): Card => ({ image: '', eyebrow: '', title: '', text: '', points: [] })
export const emptyStep = (): Step => ({ eyebrow: '', title: '', text: '' })
export const emptyBox = (): Box => ({ title: '', text: '', wide: false, tall: false, accent: false })
export const emptyCell = (): Cell => ({ title: '', text: '', accent: false })
export const emptyLetter = (): Letter => ({ letter: '', term: '', text: '' })
export const emptyFigure = (): Figure => ({ image: '', alt: '', caption: '' })

const ASSET_SRC = /^asset:([0-9a-f]{16,64})$/

// ---- reading ------------------------------------------------------------------------------------------------------

const hash = (img: El | undefined): string => ASSET_SRC.exec(img?.attrs.src ?? '')?.[1] ?? ''
const only = (els: El[], tag: string, cls?: string): El | undefined => els.find((e) => e.tag === tag && (!cls || hasClass(e, cls)))
const inline = (e: El | undefined): string => (e ? inlineToText(e.children) : '')
/** Paragraphs: several p become one text with blank lines between them. */
const paragraphs = (els: El[]): string => els.filter((e) => e.tag === 'p' && !classes(e).length).map(inline).filter(Boolean).join('\n\n')
/** Whether every element child of `e` is one of the tags (and classes) allowed, so the structure is the catalogue's. */
const onlyOf = (els: El[], allowed: (e: El) => boolean): boolean => els.every(allowed)
const tagIs = (...tags: string[]) => (e: El) => tags.includes(e.tag)

function readHeader(h: El): Header {
  const out = emptyHeader()
  for (const c of elements(h)) {
    if (c.tag === 'div' && hasClass(c, 'eyebrow')) out.eyebrow = inline(c)
    else if (c.tag === 'h2') {
      const kids = c.children.filter((n) => !isBlank(n))
      const tag = kids[0]
      if (isEl(tag) && tag.tag === 'span' && hasClass(tag, 'tag')) {
        out.tag = inline(tag)
        kids.shift()
      }
      out.title = inlineToText(kids.filter((n) => !(isEl(n) && n.tag === 'small')))
    } else if (c.tag === 'p' && hasClass(c, 'lead')) out.lead = inline(c)
  }
  return out
}

function readText(t: El, doc: SlideDoc): boolean {
  const text = emptyText()
  for (const c of elements(t)) {
    if (c.tag === 'div' && hasClass(c, 'eyebrow')) text.eyebrow = inline(c)
    else if (c.tag === 'h1') text.title = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'subtitle')) text.subtitle = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'meta')) text.meta = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'lead')) text.lead = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'big')) text.big = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'sub')) text.sub = inline(c)
    else if (c.tag === 'p' && hasClass(c, 'until')) text.until = inline(c)
    else if (c.tag === 'ul' && hasClass(c, 'list')) doc.points = readPoints(c)
    else return false
  }
  doc.text = text
  if (hasClass(t, 'long')) doc.options.long = true
  return true
}

function readPoints(list: El): Point[] {
  return elements(list)
    .filter((li) => li.tag === 'li')
    .map((li) => {
      const nested = elements(li).find((e) => e.tag === 'ul' || e.tag === 'ol')
      const own = li.children.filter((n) => n !== nested)
      return { text: inlineToText(own), children: nested ? elements(nested).filter((e) => e.tag === 'li').map(inline) : [] }
    })
}

function readFigure(f: El, doc: SlideDoc): boolean {
  const fig = emptyFigure()
  for (const c of elements(f)) {
    if (c.tag === 'img') {
      fig.image = hash(c)
      fig.alt = c.attrs.alt ?? ''
    } else if (c.tag === 'figcaption') fig.caption = inline(c)
    else if (c.tag === 'svg') doc.svg = serializeNode(c)
    else return false
  }
  doc.figure = fig
  return true
}

type BodyReader = (body: El[], doc: SlideDoc, root: El) => boolean

const readers: Record<string, BodyReader> = {
  title: (body, doc) => {
    if (!onlyOf(body, tagIs('figure', 'div'))) return false
    const f = only(body, 'figure')
    const t = only(body, 'div', 'text')
    if (!t || (f && !readFigure(f, doc))) return false
    return readText(t, doc)
  },
  section: (body, doc) => {
    if (!onlyOf(body, (e) => e.tag === 'div' && (hasClass(e, 'text') || hasClass(e, 'glyph')))) return false
    const t = only(body, 'div', 'text')
    const g = only(body, 'div', 'glyph')
    if (!t) return false
    if (g) {
      const small = only(elements(g), 'small')
      doc.glyph = { char: textOf(g.children.filter((n) => n !== small)), caption: inline(small) }
    }
    return readText(t, doc)
  },
  agenda: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'ol' || !hasClass(body[0], 'agenda')) return false
    doc.rows = elements(body[0])
      .filter((li) => li.tag === 'li')
      .map((li) => {
        const spans = elements(li).filter((e) => e.tag === 'span')
        const when = spans.find((s) => hasClass(s, 'when'))
        const main = spans.find((s) => s !== when)
        return { when: inline(when), text: main ? inline(main) : inlineToText(li.children.filter((n) => n !== when)), isBreak: !!main && hasClass(main, 'break') }
      })
    return true
  },
  break: (body, doc) => {
    if (!onlyOf(body, tagIs('figure', 'div'))) return false
    const t = only(body, 'div', 'text')
    const f = only(body, 'figure')
    if (!t || (f && !readFigure(f, doc))) return false
    return readText(t, doc)
  },
  closing: (body, doc) => {
    if (!onlyOf(body, (e) => (e.tag === 'div' && hasClass(e, 'logo')) || e.tag === 'h1' || e.tag === 'p')) return false
    const text = emptyText()
    doc.logo = !!only(body, 'div', 'logo')
    text.title = inline(only(body, 'h1'))
    text.body = paragraphs(body)
    doc.text = text
    return true
  },
  statement: (body, doc) => {
    const t = body.length === 1 && body[0].tag === 'div' && hasClass(body[0], 'text') ? body[0] : undefined
    return !!t && readText(t, doc)
  },
  quote: (body, doc) => {
    if (!onlyOf(body, tagIs('blockquote', 'cite'))) return false
    const b = only(body, 'blockquote')
    if (!b) return false
    const ps = elements(b).filter((e) => e.tag === 'p')
    doc.quote = { text: ps.filter((p) => !hasClass(p, 'sub')).map(inline).join('\n\n'), sub: inline(ps.find((p) => hasClass(p, 'sub'))), cite: inline(only(body, 'cite')) }
    return true
  },
  list: (body, doc) => {
    if (body.length !== 1 || !(body[0].tag === 'ul' || body[0].tag === 'ol') || !hasClass(body[0], 'list')) return false
    const list = body[0]
    doc.points = readPoints(list)
    if (list.tag === 'ol') doc.options.ordered = true
    for (const o of ['compact', 'two', 'rows', 'four']) if (hasClass(list, o)) doc.options[o] = true
    return true
  },
  cards: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'ul' || !hasClass(body[0], 'cards')) return false
    const list = body[0]
    for (const o of ['numbered', 'plain', 'contain', 'picture']) if (hasClass(list, o)) doc.options[o] = true
    const cols = classes(list).find((c) => /^cols-[2-5]$/.test(c))
    doc.options.cols = cols ? Number(cols.slice(5)) : 3
    doc.cards = []
    for (const li of elements(list).filter((e) => e.tag === 'li')) {
      const card = emptyCard()
      for (const c of elements(li)) {
        if (c.tag === 'img') card.image = hash(c)
        else if (c.tag === 'div' && hasClass(c, 'eyebrow')) card.eyebrow = inline(c)
        else if (c.tag === 'h3') card.title = inline(c)
        else if (c.tag === 'p') card.text = card.text ? `${card.text}\n\n${inline(c)}` : inline(c)
        else if (c.tag === 'ul') card.points = elements(c).filter((e) => e.tag === 'li').map(inline)
        else return false
      }
      doc.cards.push(card)
    }
    return true
  },
  split: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'div' || !hasClass(body[0], 'split')) return false
    const split = body[0]
    if (hasClass(split, 'figure-left')) doc.options.figureLeft = true
    if (hasClass(split, 'wide-text')) doc.options.wideText = true
    if (!onlyOf(elements(split), tagIs('div', 'figure'))) return false
    const t = only(elements(split), 'div', 'text')
    const f = only(elements(split), 'figure')
    doc.blocks = []
    for (const c of t ? elements(t) : []) {
      if (c.tag === 'p' && hasClass(c, 'lead')) doc.blocks.push({ kind: 'lead', text: inline(c) })
      else if (c.tag === 'p' && hasClass(c, 'small')) doc.blocks.push({ kind: 'small', text: inline(c) })
      else if (c.tag === 'p') doc.blocks.push({ kind: 'p', text: inline(c) })
      else if (c.tag === 'h3') doc.blocks.push({ kind: 'h3', text: inline(c) })
      else if (c.tag === 'ul' && hasClass(c, 'list')) doc.blocks.push({ kind: 'list', points: elements(c).filter((e) => e.tag === 'li').map(inline) })
      else return false
    }
    if (f && !readFigure(f, doc)) return false
    doc.figure ??= emptyFigure()
    return true
  },
  figure: (body, doc, root) => {
    if (body.length !== 1 || body[0].tag !== 'figure' || !hasClass(body[0], 'main')) return false
    if (hasClass(root, 'full')) doc.options.full = true
    return readFigure(body[0], doc)
  },
  exercise: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'div' || !hasClass(body[0], 'exercise')) return false
    const ex = elements(body[0])
    if (!onlyOf(ex, (e) => (e.tag === 'ol' && hasClass(e, 'steps')) || (e.tag === 'aside' && hasClass(e, 'facts')))) return false
    doc.steps = elements(only(ex, 'ol') ?? el('ol')).filter((e) => e.tag === 'li').map((li) => ({ eyebrow: '', title: '', text: inline(li) }))
    doc.facts = []
    const dl = only(elements(only(ex, 'aside') ?? el('aside')), 'dl')
    if (dl) {
      let term = ''
      for (const c of elements(dl)) {
        if (c.tag === 'dt') term = inline(c)
        else if (c.tag === 'dd') {
          doc.facts.push({ term, value: inline(c) })
          term = ''
        }
      }
    }
    return true
  },
  steps: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'ol' || !hasClass(body[0], 'flow')) return false
    if (hasClass(body[0], 'plain')) doc.options.plain = true
    doc.steps = []
    for (const li of elements(body[0]).filter((e) => e.tag === 'li')) {
      const step = emptyStep()
      for (const c of elements(li)) {
        if (c.tag === 'div' && hasClass(c, 'eyebrow')) step.eyebrow = inline(c)
        else if (c.tag === 'h3') step.title = inline(c)
        else if (c.tag === 'p') step.text = step.text ? `${step.text}\n\n${inline(c)}` : inline(c)
        else return false
      }
      doc.steps.push(step)
    }
    return true
  },
  matrix: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'div' || !hasClass(body[0], 'matrix')) return false
    const parts = elements(body[0])
    const axis = (cls: string): [string, string] => {
      const spans = elements(only(parts, 'div', cls) ?? el('div')).filter((e) => e.tag === 'span')
      return [inline(spans[0]), inline(spans[1])]
    }
    const cells = elements(only(parts, 'div', 'cells') ?? el('div')).filter((e) => e.tag === 'div' && hasClass(e, 'cell'))
    doc.matrix = {
      axisY: axis('axis-y'),
      axisX: axis('axis-x'),
      cells: cells.map((c) => ({ title: inline(only(elements(c), 'h3')), text: paragraphs(elements(c)), accent: hasClass(c, 'accent') })),
    }
    while (doc.matrix.cells.length < 4) doc.matrix.cells.push(emptyCell())
    return true
  },
  acronym: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'dl' || !hasClass(body[0], 'acronym')) return false
    if (hasClass(body[0], 'compact')) doc.options.compact = true
    doc.letters = elements(body[0])
      .filter((e) => e.tag === 'div')
      .map((d) => {
        const dd = only(elements(d), 'dd')
        const kids = dd ? elements(dd) : []
        return { letter: inline(only(elements(d), 'dt')), term: inline(only(kids, 'strong')), text: inline(only(kids, 'span')) }
      })
    return true
  },
  canvas: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'div' || !hasClass(body[0], 'canvas')) return false
    const cols = classes(body[0]).find((c) => /^cols-[2-4]$/.test(c))
    doc.options.cols = cols ? Number(cols.slice(5)) : 3
    doc.boxes = elements(body[0])
      .filter((e) => e.tag === 'div' && hasClass(e, 'box'))
      .map((b) => ({ title: inline(only(elements(b), 'h3')), text: paragraphs(elements(b)), wide: hasClass(b, 'wide'), tall: hasClass(b, 'tall'), accent: hasClass(b, 'accent') }))
    return true
  },
  model: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'figure' || !hasClass(body[0], 'model')) return false
    const ok = readFigure(body[0], doc)
    doc.svg ??= ''
    return ok
  },
  table: (body, doc) => {
    if (body.length !== 1 || body[0].tag !== 'table') return false
    const table = body[0]
    if (hasClass(table, 'compact')) doc.options.compact = true
    const rowsOf = (section: El | undefined) => (section ? elements(section).filter((e) => e.tag === 'tr') : [])
    const parts = elements(table)
    const headRows = [...rowsOf(only(parts, 'thead')), ...rowsOf(table).filter((r) => elements(r).some((c) => c.tag === 'th'))]
    const bodyRows = [...rowsOf(only(parts, 'tbody')), ...rowsOf(table).filter((r) => !elements(r).some((c) => c.tag === 'th'))]
    doc.table = {
      head: headRows.length ? elements(headRows[0]).map(inline) : [],
      rows: bodyRows.map((r) => elements(r).map((c) => ({ text: inline(c), tone: hasClass(c, 'good') ? 'good' : hasClass(c, 'bad') ? 'bad' : '' }))),
    }
    return true
  },
}

/** The slide's markup as a document. The layout is the root's second class; an unknown structure keeps its body as source. */
export function parseSlide(html: string): SlideDoc {
  const tree = parseTree(html)
  const root = tree.find((n): n is El => isEl(n) && n.tag === 'section')
  if (!root) return { layout: '', options: {}, raw: html }
  const [layout = ''] = classes(root).filter((c) => c !== 'slide')
  const doc: SlideDoc = { layout, options: {} }
  const header = elements(root).find((e) => e.tag === 'header')
  const footer = elements(root).find((e) => e.tag === 'footer' && !hasClass(e, 'chrome'))
  if (header) doc.header = readHeader(header)
  if (footer) doc.source = inline(only(elements(footer), 'span', 'source') ?? footer)
  const bodyNodes = root.children.filter((n) => n !== header && n !== footer && !(isEl(n) && n.tag === 'footer' && hasClass(n, 'chrome')))
  const body = bodyNodes.filter(isEl)
  const clean = bodyNodes.every((n) => isEl(n) || isBlank(n))
  const reader = readers[layout]
  if (!clean || !reader || !reader(body, doc, root)) {
    // Not the catalogue's structure: keep the body as it is, but drop the parts a partial read may have set.
    const keep: SlideDoc = { layout, options: {}, raw: serializeNodes(bodyNodes).trim() }
    if (doc.header) keep.header = doc.header
    if (doc.source !== undefined) keep.source = doc.source
    return keep
  }
  return doc
}

// ---- writing ------------------------------------------------------------------------------------------------------

const p = (cls: string, text: string): El[] => (text.trim() ? [el('p', cls ? { class: cls } : {}, textToInline(text.trim()))] : [])
const div = (cls: string, text: string): El[] => (text.trim() ? [el('div', { class: cls }, textToInline(text.trim()))] : [])
const h = (tag: 'h1' | 'h2' | 'h3', text: string): El[] => (text.trim() ? [el(tag, {}, textToInline(text.trim()))] : [])
/** Paragraphs: blank lines in the text become separate p elements. */
const ps = (cls: string, text: string): El[] => text.split(/\n\s*\n/).flatMap((part) => p(cls, part))
const img = (image: string, alt = '', cls?: string): El[] => (image ? [el('img', { ...(cls ? { class: cls } : {}), src: `asset:${image}`, alt })] : [])
const ul = (cls: string, points: string[]): El[] => (points.some((x) => x.trim()) ? [el('ul', cls ? { class: cls } : {}, points.filter((x) => x.trim()).map((x) => el('li', {}, textToInline(x.trim()))))] : [])
const cls = (...parts: (string | number | boolean | null | undefined)[]): string => parts.filter((x): x is string => typeof x === 'string' && x !== '').join(' ')

function writeHeader(hd: Header | undefined, tag = false): El[] {
  if (!hd) return []
  const kids: Node[] = []
  kids.push(...div('eyebrow', hd.eyebrow))
  if (hd.title.trim() || (tag && hd.tag.trim())) {
    const h2: Node[] = []
    if (tag && hd.tag.trim()) h2.push(el('span', { class: 'tag' }, [txt(hd.tag.trim())]), txt(' '))
    h2.push(...textToInline(hd.title.trim()))
    kids.push(el('h2', {}, h2))
  }
  kids.push(...p('lead', hd.lead))
  return kids.length ? [el('header', {}, kids)] : []
}

function writeText(doc: SlideDoc, fields: (keyof TextBlock)[], extra: El[] = []): El[] {
  const t = doc.text ?? emptyText()
  const kids: El[] = []
  for (const f of fields) {
    const v = t[f]
    if (f === 'eyebrow') kids.push(...div('eyebrow', v))
    else if (f === 'title') kids.push(...h('h1', v))
    else if (f === 'body') kids.push(...ps('', v))
    else kids.push(...p(f, v))
  }
  kids.push(...extra)
  return [el('div', { class: cls('text', doc.layout === 'statement' && doc.options.long && 'long') }, kids)]
}

function writePoints(points: Point[], tag: 'ul' | 'ol', className: string): El[] {
  const items = points.filter((pt) => pt.text.trim() || pt.children.some((c) => c.trim()))
  if (!items.length) return []
  return [
    el(
      tag,
      { class: className },
      items.map((pt) => el('li', {}, [...textToInline(pt.text.trim()), ...ul('', pt.children)])),
    ),
  ]
}

function writeFigure(fig: Figure | undefined, className: string, svg?: string): El[] {
  if (!fig?.image && !fig?.caption.trim() && !svg) return []
  const kids: Node[] = svg ? parseTree(svg).filter(isEl) : img(fig?.image ?? '', fig?.alt ?? '')
  kids.push(...(fig?.caption.trim() ? [el('figcaption', {}, textToInline(fig.caption.trim()))] : []))
  return [el('figure', className ? { class: className } : {}, kids)]
}

const writers: Record<string, (doc: SlideDoc) => El[]> = {
  title: (d) => [...writeFigure(d.figure, ''), ...writeText(d, ['eyebrow', 'title', 'subtitle', 'meta'])],
  section: (d) => [...writeText(d, ['eyebrow', 'title', 'lead'], writePoints(d.points ?? [], 'ul', 'list')), ...(d.glyph?.char.trim() ? [el('div', { class: 'glyph' }, [txt(d.glyph.char.trim()), ...(d.glyph.caption.trim() ? [el('small', {}, textToInline(d.glyph.caption.trim()))] : [])])] : [])],
  agenda: (d) => {
    const rows = (d.rows ?? []).filter((r) => r.text.trim() || r.when.trim())
    return [
      el(
        'ol',
        { class: cls('agenda', rows.length > 8 && 'many') },
        rows.map((r) => el('li', {}, [...(r.when.trim() ? [el('span', { class: 'when' }, [txt(r.when.trim())])] : []), el('span', r.isBreak ? { class: 'break' } : {}, textToInline(r.text.trim()))])),
      ),
    ]
  },
  break: (d) => [...writeText(d, ['title', 'until']), ...writeFigure(d.figure, '')],
  closing: (d) => [...(d.logo ? [el('div', { class: 'logo' })] : []), ...h('h1', d.text?.title ?? ''), ...ps('', d.text?.body ?? '')],
  statement: (d) => writeText(d, ['eyebrow', 'big', 'sub']),
  quote: (d) => [el('blockquote', {}, [...ps('', d.quote?.text ?? ''), ...p('sub', d.quote?.sub ?? '')]), ...(d.quote?.cite.trim() ? [el('cite', {}, textToInline(d.quote.cite.trim()))] : [])],
  list: (d) => writePoints(d.points ?? [], d.options.ordered ? 'ol' : 'ul', cls('list', ...['compact', 'two', 'rows', 'four'].filter((o) => d.options[o]))),
  cards: (d) => {
    const cards = (d.cards ?? []).filter((c) => c.title.trim() || c.text.trim() || c.image || c.points.some((x) => x.trim()))
    if (!cards.length) return []
    const cols = Number(d.options.cols ?? 3)
    return [
      el(
        'ul',
        { class: cls('cards', `cols-${cols}`, ...['numbered', 'plain', 'contain', 'picture'].filter((o) => d.options[o])) },
        cards.map((c) => el('li', {}, [...img(c.image, '', 'icon'), ...div('eyebrow', c.eyebrow), ...h('h3', c.title), ...ps('', c.text), ...ul('list', c.points)])),
      ),
    ]
  },
  split: (d) => {
    const text = (d.blocks ?? []).flatMap((b): El[] => (b.kind === 'list' ? ul('list', b.points) : b.kind === 'h3' ? h('h3', b.text) : p(b.kind === 'p' ? '' : b.kind, b.text)))
    return [el('div', { class: cls('split', d.options.figureLeft && 'figure-left', d.options.wideText && 'wide-text') }, [el('div', { class: 'text' }, text), ...writeFigure(d.figure, '', d.svg)])]
  },
  figure: (d) => writeFigure(d.figure, 'main'),
  exercise: (d) => {
    const steps = (d.steps ?? []).filter((s) => s.text.trim() || s.title.trim())
    const facts = (d.facts ?? []).filter((f) => f.term.trim() || f.value.trim())
    return [
      el('div', { class: 'exercise' }, [
        el('ol', { class: 'steps' }, steps.map((s) => el('li', {}, textToInline([s.title.trim() && `**${s.title.trim()}**`, s.text.trim()].filter(Boolean).join(' '))))),
        ...(facts.length ? [el('aside', { class: 'facts' }, [el('dl', {}, facts.flatMap((f) => [el('dt', {}, textToInline(f.term.trim())), el('dd', {}, textToInline(f.value.trim()))]))])] : []),
      ]),
    ]
  },
  steps: (d) => {
    const steps = (d.steps ?? []).filter((s) => s.text.trim() || s.title.trim() || s.eyebrow.trim())
    if (!steps.length) return []
    return [el('ol', { class: cls('flow', d.options.plain && 'plain') }, steps.map((s) => el('li', {}, [...div('eyebrow', s.eyebrow), ...h('h3', s.title), ...ps('', s.text)])))]
  },
  matrix: (d) => {
    const m = d.matrix ?? { axisY: ['', ''], axisX: ['', ''], cells: [] }
    const cells = [...m.cells]
    while (cells.length < 4) cells.push(emptyCell())
    const axis = (name: string, labels: [string, string]) => el('div', { class: name }, labels.map((l) => el('span', {}, textToInline(l.trim()))))
    return [el('div', { class: 'matrix' }, [axis('axis-y', m.axisY), el('div', { class: 'cells' }, cells.slice(0, 4).map((c) => el('div', { class: cls('cell', c.accent && 'accent') }, [...h('h3', c.title), ...ps('', c.text)]))), axis('axis-x', m.axisX)])]
  },
  acronym: (d) => {
    const letters = (d.letters ?? []).filter((l) => l.letter.trim() || l.term.trim() || l.text.trim())
    if (!letters.length) return []
    return [
      el(
        'dl',
        { class: cls('acronym', d.options.compact && 'compact') },
        letters.map((l) => el('div', {}, [el('dt', {}, textToInline(l.letter.trim())), el('dd', {}, [...(l.term.trim() ? [el('strong', {}, textToInline(l.term.trim()))] : []), ...(l.text.trim() ? [el('span', {}, textToInline(l.text.trim()))] : [])])])),
      ),
    ]
  },
  canvas: (d) => {
    const boxes = (d.boxes ?? []).filter((b) => b.title.trim() || b.text.trim())
    if (!boxes.length) return []
    const cols = Number(d.options.cols ?? 3)
    return [el('div', { class: cls('canvas', `cols-${cols}`) }, boxes.map((b) => el('div', { class: cls('box', b.wide && 'wide', b.tall && 'tall', b.accent && 'accent') }, [...h('h3', b.title), ...ps('', b.text)])))]
  },
  model: (d) => {
    const kids: Node[] = d.svg ? parseTree(d.svg).filter(isEl) : []
    if (d.figure?.caption.trim()) kids.push(el('figcaption', {}, textToInline(d.figure.caption.trim())))
    return [el('figure', { class: 'model' }, kids)]
  },
  table: (d) => {
    const t = d.table ?? { head: [], rows: [] }
    const kids: El[] = []
    if (t.head.some((x) => x.trim())) kids.push(el('thead', {}, [el('tr', {}, t.head.map((x) => el('th', {}, textToInline(x.trim()))))]))
    const rows = t.rows.filter((r) => r.some((c) => c.text.trim()))
    if (rows.length) kids.push(el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', c.tone ? { class: c.tone } : {}, textToInline(c.text.trim())))))))
    return [el('table', d.options.compact ? { class: 'compact' } : {}, kids)]
  },
}

/** The document as markup in the slide format: one section.slide with header, body and footer. */
export function serializeSlide(doc: SlideDoc): string {
  const spec = layoutSpec(doc.layout)
  const rootClass = cls('slide', doc.layout, doc.layout === 'figure' && doc.options.full && 'full')
  const parts: string[] = []
  if (spec?.parts.includes('header') || (doc.raw !== undefined && doc.header)) parts.push(serializeNodes(writeHeader(doc.header, doc.layout === 'exercise')))
  if (doc.raw !== undefined) parts.push(doc.raw)
  else if (writers[doc.layout]) parts.push(serializeNodes(writers[doc.layout](doc)))
  if (doc.source?.trim()) parts.push(`<footer><span class="source">${serializeNodes(textToInline(doc.source.trim()))}</span></footer>`)
  return `<section class="${rootClass}">${parts.join('')}</section>`
}

// ---- blank slides ------------------------------------------------------------------------------------------------

/** The words a blank slide is filled with, in the UI's language. */
export interface BlankWords {
  title: string
  text: string
  point: string
  lead: string
  step: string
  quote: string
  cite: string
  eyebrow: string
  letter: string
  term: string
  value: string
  when: string
  axis: string
  caption: string
}

/** A new slide of a layout: the structure with placeholder words, ready to be edited. */
export function blankDoc(layout: string, w: BlankWords): SlideDoc {
  const n = (word: string, i: number) => `${word} ${i}`
  const doc: SlideDoc = { layout, options: {} }
  const spec = layoutSpec(layout)
  if (!spec) return { layout: 'list', options: {}, header: { ...emptyHeader(), title: w.title }, points: [1, 2, 3].map((i) => ({ text: n(w.point, i), children: [] })) }
  if (spec.parts.includes('header')) doc.header = { ...emptyHeader(), title: w.title, tag: layout === 'exercise' ? w.eyebrow : '', lead: layout === 'exercise' ? w.lead : '' }
  if (spec.textFields) {
    doc.text = emptyText()
    for (const f of spec.textFields) doc.text[f] = f === 'eyebrow' ? w.eyebrow : f === 'title' || f === 'big' ? w.title : f === 'sub' || f === 'subtitle' || f === 'lead' || f === 'body' ? w.text : f === 'until' ? `**${w.when}**` : f === 'meta' ? '' : w.text
  }
  switch (layout) {
    case 'section':
      doc.text!.lead = w.lead
      break
    case 'closing':
      doc.logo = true
      break
    case 'quote':
      doc.quote = { text: w.quote, sub: '', cite: w.cite }
      break
    case 'list':
      doc.points = [1, 2, 3].map((i) => ({ text: n(w.point, i), children: [] }))
      break
    case 'cards':
      doc.options.cols = 3
      doc.cards = [1, 2, 3].map((i) => ({ ...emptyCard(), title: n(w.point, i), text: w.text }))
      break
    case 'split':
      doc.blocks = [
        { kind: 'lead', text: w.lead },
        { kind: 'list', points: [1, 2, 3].map((i) => n(w.point, i)) },
      ]
      doc.figure = emptyFigure()
      break
    case 'figure':
      doc.figure = { ...emptyFigure(), caption: w.caption }
      break
    case 'exercise':
      doc.steps = [1, 2, 3].map((i) => ({ ...emptyStep(), text: n(w.step, i) }))
      doc.facts = []
      break
    case 'steps':
      doc.steps = [1, 2, 3].map((i) => ({ ...emptyStep(), title: n(w.step, i), text: w.text }))
      break
    case 'matrix':
      doc.matrix = { axisY: [n(w.axis, 1), n(w.axis, 2)], axisX: [n(w.axis, 3), n(w.axis, 4)], cells: [1, 2, 3, 4].map((i) => ({ ...emptyCell(), title: n(w.point, i), text: w.text, accent: i === 1 })) }
      break
    case 'acronym':
      doc.letters = ['A', 'B', 'C'].map((l, i) => ({ letter: l, term: n(w.term, i + 1), text: w.text }))
      break
    case 'canvas':
      doc.options.cols = 3
      doc.boxes = [1, 2, 3, 4, 5, 6].map((i) => ({ ...emptyBox(), title: n(w.point, i), text: w.text }))
      break
    case 'model':
      doc.svg = '<svg viewBox="0 0 1152 470" role="img"><polygon class="f-accent" points="576,20 416,170 736,170"></polygon><polygon class="f-accent-2" points="396,190 256,320 896,320 756,190"></polygon><polygon class="f-surface-2" points="236,340 96,460 1056,460 916,340"></polygon></svg>'
      doc.figure = { ...emptyFigure(), caption: w.caption }
      break
    case 'table':
      doc.table = { head: ['', n(w.point, 1), n(w.point, 2)], rows: [1, 2].map((i) => [{ text: n(w.term, i), tone: '' as Tone }, { text: w.text, tone: '' as Tone }, { text: w.text, tone: '' as Tone }]) }
      break
    case 'agenda':
      doc.rows = [1, 2, 3].map((i) => ({ when: '', text: n(w.point, i), isBreak: false }))
      break
  }
  return doc
}

// ---- changing the layout -----------------------------------------------------------------------------------------

/** What a slide says, independent of its layout: the pool a new layout is filled from. */
interface Pool {
  eyebrow: string
  title: string
  lead: string
  items: { title: string; text: string }[]
  figure?: Figure
  svg?: string
  source: string
}

function poolOf(doc: SlideDoc): Pool {
  const t = doc.text
  const items: Pool['items'] = []
  const pool: Pool = { eyebrow: doc.header?.eyebrow || t?.eyebrow || '', title: doc.header?.title || t?.title || t?.big || doc.quote?.text || '', lead: doc.header?.lead || t?.lead || t?.sub || t?.subtitle || t?.body || doc.quote?.sub || '', items, figure: doc.figure, svg: doc.svg, source: doc.source ?? '' }
  if (doc.points) for (const pt of doc.points) items.push({ title: '', text: [pt.text, ...pt.children].filter(Boolean).join('\n') })
  if (doc.cards) for (const c of doc.cards) items.push({ title: c.title, text: [c.text, ...c.points].filter(Boolean).join('\n') })
  if (doc.steps) for (const s of doc.steps) items.push({ title: s.title, text: s.text })
  if (doc.facts) for (const f of doc.facts) items.push({ title: f.term, text: f.value })
  if (doc.blocks) for (const b of doc.blocks) items.push(...(b.kind === 'list' ? b.points.map((x) => ({ title: '', text: x })) : b.kind === 'lead' && !pool.lead ? ((pool.lead = b.text), []) : [{ title: b.kind === 'h3' ? b.text : '', text: b.kind === 'h3' ? '' : b.text }]))
  if (doc.rows) for (const r of doc.rows) items.push({ title: r.when, text: r.text })
  if (doc.matrix) for (const c of doc.matrix.cells) items.push({ title: c.title, text: c.text })
  if (doc.letters) for (const l of doc.letters) items.push({ title: l.term || l.letter, text: l.text })
  if (doc.boxes) for (const b of doc.boxes) items.push({ title: b.title, text: b.text })
  if (doc.table) for (const r of doc.table.rows) items.push({ title: r[0]?.text ?? '', text: r.slice(1).map((c) => c.text).filter(Boolean).join(' · ') })
  if (doc.quote && doc.quote.cite) pool.source = pool.source || doc.quote.cite
  return pool
}

/** A title for an item that has none: its text, cut to a few words. */
const headline = (item: { title: string; text: string }): string => item.title || item.text.split('\n')[0].split(/(?<=[.!?])\s/)[0].slice(0, 60)
const rest = (item: { title: string; text: string }): string => (item.title ? item.text : item.text.slice(headline(item).length).trim())

/**
 * The same content in another layout: the title stays the title, points become cards become steps, a picture is
 * kept where the layout shows one. What the new layout cannot hold is reported in `lost` (the editor says so and
 * offers the way back).
 */
export function convertLayout(doc: SlideDoc, layout: string): { doc: SlideDoc; lost: string[] } {
  if (doc.layout === layout) return { doc, lost: [] }
  const spec = layoutSpec(layout)
  if (!spec || doc.raw !== undefined) return { doc: { ...doc, layout, options: {} }, lost: [] }
  const pool = poolOf(doc)
  const lost: string[] = []
  const out: SlideDoc = { layout, options: {} }
  const items = pool.items
  const take = (max: number | undefined) => {
    if (max !== undefined && items.length > max) lost.push(`items:${items.length - max}`)
    return max === undefined ? items : items.slice(0, max)
  }
  if (spec.parts.includes('header')) out.header = { ...emptyHeader(), eyebrow: pool.eyebrow, title: pool.title, lead: layout === 'exercise' ? pool.lead : spec.parts.includes('blocks') ? '' : pool.lead }
  if (spec.textFields) {
    out.text = emptyText()
    const f = spec.textFields
    if (f.includes('title')) out.text.title = pool.title
    if (f.includes('big')) out.text.big = pool.title
    if (f.includes('eyebrow')) out.text.eyebrow = pool.eyebrow
    if (f.includes('sub')) out.text.sub = pool.lead
    if (f.includes('subtitle')) out.text.subtitle = pool.lead
    if (f.includes('lead')) out.text.lead = pool.lead
    if (f.includes('body')) out.text.body = pool.lead
    if (f.includes('until')) out.text.until = pool.lead
  }
  const figureWanted = spec.parts.includes('figure')
  if (figureWanted && (pool.figure?.image || pool.figure?.caption)) out.figure = { ...pool.figure }
  else if (figureWanted) out.figure = emptyFigure()
  else if (pool.figure?.image) lost.push('figure')
  if (spec.parts.includes('svg')) out.svg = pool.svg ?? ''
  else if (pool.svg && !(layout === 'split')) lost.push('svg')
  if (spec.parts.includes('source') && pool.source) out.source = pool.source
  else if (pool.source && layout !== 'quote') lost.push('source')
  switch (layout) {
    case 'section':
      out.points = take(spec.max).map((i) => ({ text: headline(i), children: [] }))
      break
    case 'closing':
      out.logo = true
      if (items.length) lost.push(`items:${items.length}`)
      break
    case 'title':
    case 'break':
    case 'statement':
      if (items.length) lost.push(`items:${items.length}`)
      break
    case 'quote':
      out.quote = { text: pool.title, sub: pool.lead, cite: pool.source }
      if (items.length) lost.push(`items:${items.length}`)
      break
    case 'list':
      out.points = take(spec.max).map((i) => ({ text: i.title ? `**${i.title}** ${i.text.split('\n')[0]}`.trim() : i.text.split('\n')[0], children: i.text.split('\n').slice(1).filter(Boolean) }))
      if (items.some((i) => i.title)) out.options.rows = true
      break
    case 'cards':
      out.options.cols = Math.min(5, Math.max(2, Math.min(items.length, 3) || 3))
      out.cards = take(spec.max).map((i) => ({ ...emptyCard(), title: headline(i), text: rest(i) }))
      break
    case 'split':
      out.blocks = [...(pool.lead ? [{ kind: 'lead' as const, text: pool.lead }] : []), ...(items.length ? [{ kind: 'list' as const, points: items.map((i) => [i.title, i.text].filter(Boolean).join(': ')) }] : [])]
      if (pool.svg) out.svg = pool.svg
      break
    case 'figure':
      if (items.length) lost.push(`items:${items.length}`)
      break
    case 'exercise':
      out.steps = take(spec.max).map((i) => ({ ...emptyStep(), text: [i.title, i.text].filter(Boolean).join(': ') }))
      out.facts = []
      break
    case 'steps':
      out.steps = take(spec.max).map((i) => ({ ...emptyStep(), title: headline(i), text: rest(i) }))
      break
    case 'matrix':
      out.matrix = { axisY: ['', ''], axisX: ['', ''], cells: take(4).map((i) => ({ title: headline(i), text: rest(i), accent: false })) }
      while (out.matrix.cells.length < 4) out.matrix.cells.push(emptyCell())
      break
    case 'acronym':
      out.letters = take(spec.max).map((i) => ({ letter: headline(i).charAt(0).toUpperCase(), term: headline(i), text: rest(i) }))
      break
    case 'canvas':
      out.options.cols = 3
      out.boxes = take(spec.max).map((i) => ({ ...emptyBox(), title: headline(i), text: rest(i) }))
      break
    case 'model':
      out.figure = { ...emptyFigure(), caption: pool.figure?.caption ?? '' }
      if (items.length) lost.push(`items:${items.length}`)
      break
    case 'table':
      out.table = { head: [], rows: take(spec.max).map((i) => [{ text: headline(i), tone: '' }, { text: rest(i), tone: '' }]) }
      break
    case 'agenda':
      out.rows = take(spec.max).map((i) => ({ when: /^\d{1,2}:\d{2}$/.test(i.title) ? i.title : '', text: /^\d{1,2}:\d{2}$/.test(i.title) ? i.text : headline(i), isBreak: false }))
      break
  }
  return { doc: out, lost }
}

// ---- where a field shows on the slide --------------------------------------------------------------------------

/**
 * For every field of the document, the selector of the element that shows it, relative to the section (`:scope`).
 * The editor marks those elements, so a click on the slide opens the field, and a focused field lights up its
 * element. Paths are the editor's field ids: "header.title", "cards.2.text", "matrix.cells.0.title" …
 */
export function fieldSelectors(doc: SlideDoc): { path: string; selector: string }[] {
  const out: { path: string; selector: string }[] = []
  const add = (path: string, selector: string) => out.push({ path, selector })
  if (doc.header) {
    add('header.eyebrow', ':scope > header > .eyebrow')
    add('header.title', ':scope > header > h2')
    add('header.lead', ':scope > header > .lead')
  }
  if (doc.text) {
    const base = doc.layout === 'closing' ? ':scope' : ':scope > .text'
    add('text.eyebrow', `${base} > .eyebrow`)
    add('text.title', `${base} > h1`)
    for (const f of ['subtitle', 'meta', 'lead', 'big', 'sub', 'until'] as const) add(`text.${f}`, `${base} > .${f}`)
    if (doc.layout === 'closing') add('text.body', ':scope > p')
  }
  const nth = (i: number) => `:nth-child(${i + 1})`
  if (doc.points) {
    const list = doc.layout === 'section' ? ':scope > .text > .list' : ':scope > .list'
    doc.points.forEach((_, i) => add(`points.${i}`, `${list} > li${nth(i)}`))
  }
  if (doc.cards)
    doc.cards.forEach((_, i) => {
      const li = `:scope > .cards > li${nth(i)}`
      add(`cards.${i}.image`, `${li} > img`)
      add(`cards.${i}.eyebrow`, `${li} > .eyebrow`)
      add(`cards.${i}.title`, `${li} > h3`)
      add(`cards.${i}.text`, `${li} > p`)
      add(`cards.${i}.points`, `${li} > ul`)
      add(`cards.${i}`, li)
    })
  if (doc.steps)
    doc.steps.forEach((_, i) => {
      const li = doc.layout === 'exercise' ? `:scope > .exercise > .steps > li${nth(i)}` : `:scope > .flow > li${nth(i)}`
      add(`steps.${i}.eyebrow`, `${li} > .eyebrow`)
      add(`steps.${i}.title`, `${li} > h3`)
      add(`steps.${i}.text`, `${li} > p`)
      add(`steps.${i}`, li)
    })
  if (doc.facts) doc.facts.forEach((_, i) => add(`facts.${i}`, `:scope > .exercise > .facts > dl > dd:nth-of-type(${i + 1})`))
  if (doc.quote) {
    add('quote.text', ':scope > blockquote > p:not(.sub)')
    add('quote.sub', ':scope > blockquote > .sub')
    add('quote.cite', ':scope > cite')
  }
  if (doc.figure) {
    const fig = doc.layout === 'split' ? ':scope > .split > figure' : doc.layout === 'model' ? ':scope > .model' : ':scope > figure'
    add('figure.caption', `${fig} > figcaption`)
    add('figure.image', `${fig} > img`)
  }
  if (doc.svg !== undefined) add('svg', doc.layout === 'split' ? ':scope > .split > figure > svg' : ':scope > .model > svg')
  if (doc.blocks) doc.blocks.forEach((_, i) => add(`blocks.${i}`, `:scope > .split > .text > ${nth(i)}`))
  if (doc.rows) doc.rows.forEach((_, i) => add(`rows.${i}`, `:scope > .agenda > li${nth(i)}`))
  if (doc.matrix) {
    add('matrix.axisY', ':scope > .matrix > .axis-y')
    add('matrix.axisX', ':scope > .matrix > .axis-x')
    doc.matrix.cells.forEach((_, i) => add(`matrix.cells.${i}`, `:scope > .matrix > .cells > .cell${nth(i)}`))
  }
  if (doc.letters) doc.letters.forEach((_, i) => add(`letters.${i}`, `:scope > .acronym > div${nth(i)}`))
  if (doc.boxes) doc.boxes.forEach((_, i) => add(`boxes.${i}`, `:scope > .canvas > .box${nth(i)}`))
  if (doc.table) add('table', ':scope > table')
  if (doc.glyph) add('glyph', ':scope > .glyph')
  if (doc.source !== undefined) add('source', ':scope > footer > .source')
  return out
}
