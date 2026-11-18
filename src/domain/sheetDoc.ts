import { normalizeSheetHtml, SHEET_BLOCK_NAMES } from './sheets.ts'
import { DIAGRAM_SHAPES, isDiagramShape, type DiagramShape } from './diagram.ts'
import { classes, el, elements, hasClass, inlineToText, isBlank, isEl, parseTree, serializeNodes, textToInline, txt, type El, type Node } from './slideTree.ts'

/**
 * A worksheet page as a document the editor fills (docs/worksheets.md, section 7): its orientation, its header and its
 * blocks, each with the fields of its kind. A page is read through the slides' element tree and written back in the
 * block catalogue's markup. Every block is checked on reading: only when writing it back shows the same block is it
 * offered as fields; otherwise it stays as source (`raw`), untouched. So opening a sheet and changing one field never
 * changes anything else, and markup the editor does not model survives.
 *
 * Inline text is the slides' small markup (**bold**, *italic*, ==accent==, [text]{l accent-2}) plus blanks to write
 * on: "___" is a blank, "__" a short one, "____" a long one.
 */

/** The modifiers that set the writing room and the height, common to many blocks. */
export const SPACES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 140] as const
export const LINES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15] as const

/** One piece of text in a block: a heading, a paragraph of some class, or a list. */
export interface TextItem {
  tag: 'h2' | 'h3' | 'p' | 'ul' | 'ol'
  /** The element's classes ("hint", "prompt quiet", "fill-in" …); '' for none. */
  cls: string
  text: string
  /** The entries of a list. */
  points: string[]
}

/** Writing room inside a step, field or row: a div.write with lines and free space. */
export interface Room {
  lines: number
  space: number
}

export interface Common {
  /** The block's modifier classes other than room and height (cols-3, numbered, ruled, pitch-l …). */
  mods: string[]
  /** h-N in millimetres, 0 for none. */
  space: number
  /** lines-N, 0 for none. */
  lines: number
  fill: boolean
}

export type SheetBlock = Common &
  (
    | { kind: 'text'; items: TextItem[] }
    | { kind: 'terms'; entries: { term: string; text: string }[] }
    | { kind: 'columns'; sections: { heading: string; items: string[] }[] }
    | { kind: 'table'; head: string[]; rows: string[][] }
    | { kind: 'steps'; steps: { title: string; time: string; body: TextItem[]; room: Room | null }[] }
    | { kind: 'question'; title: string; plain: boolean; hint: string }
    | { kind: 'box'; items: TextItem[] }
    | { kind: 'grid'; fields: { mods: string[]; items: TextItem[] }[] }
    | { kind: 'rows'; rows: { label: string; items: TextItem[]; room: Room | null; space: number }[] }
    | { kind: 'circle'; segments: string[]; middle: string }
    | { kind: 'criteria'; crits: { label: string; score: string; name: string; notes: string[]; space: number }[] }
    | { kind: 'ticks'; items: string[] }
    | { kind: 'write' }
    | { kind: 'picture'; image: string; alt: string; caption: string }
    | { kind: 'pictures'; items: { image: string; alt: string; caption: string }[] }
    | { kind: 'pair'; columns: [SheetBlock[], SheetBlock[]] }
    | { kind: 'note'; items: TextItem[] }
    | { kind: 'facts' }
    | { kind: 'starters'; items: string[] }
    | { kind: 'matrix'; y: string; x: string; fields: TextItem[][] }
    | { kind: 'timeline'; items: string[] }
    | { kind: 'shape'; form: DiagramShape; entries: string[] }
    | { kind: 'scale'; rows: { label: string; low: string; high: string }[] }
    | { kind: 'selftest'; head: string[]; items: string[]; sum: string }
    | { kind: 'ifthen'; plans: { if: string; then: string }[] }
    | { kind: 'raw'; html: string }
  )

export type BlockKind = SheetBlock['kind']

export interface SheetHeader {
  eyebrow: string
  title: string
  /** Classes on the title (formatting by hand: "accent fs-xl"). */
  titleCls: string
  leads: string[]
  /** A small picture at the header's right: an asset hash, or an "assets/<file>" address in the preview. */
  picture: { image: string; alt: string } | null
}

export interface SheetPageDoc {
  landscape: boolean
  /** The header as fields, or as source when it holds more than the fields know. */
  header: SheetHeader | null
  headerRaw?: string
  blocks: SheetBlock[]
}

// ---- comparing two pages by what they show -------------------------------------------------------------------------

const BLOCK_TAGS = new Set(['section', 'header', 'footer', 'div', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'p', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'img', 'svg'])

function canon(nodes: Node[], inSvg: boolean): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      out.push(inSvg ? n : { type: 'text', text: n.text.replace(/\s+/g, ' ') })
      continue
    }
    // the circle's drawing is made from its entries on every write: never a difference of its own
    if ((n.tag === 'svg' || n.tag === 'div') && hasClass(n, 'drawn')) continue
    const attrs: Record<string, string> = {}
    for (const k of Object.keys(n.attrs).sort()) {
      if (k !== 'class') attrs[k] = n.attrs[k]
      else {
        const cls = [...new Set(n.attrs.class.split(/\s+/).filter(Boolean))].sort()
        if (cls.length) attrs.class = cls.join(' ')
      }
    }
    // empty elements stay: on a sheet an empty field, row or line is the point
    out.push({ type: 'el', tag: n.tag, attrs, children: canon(n.children, inSvg || n.tag === 'svg') })
  }
  return out
}

/** A page as a string that is equal for two pages that show the same thing (whitespace, attribute and class order aside). */
export function canonicalSheet(html: string): string {
  let s = serializeNodes(canon(parseTree(normalizeSheetHtml(html)), false))
  const block = [...BLOCK_TAGS].join('|')
  for (let k = 0; k < 3; k++) {
    s = s
      .replace(/\s+/g, ' ')
      .replace(new RegExp(`\\s*(<\\/?(?:${block})\\b[^>]*>)\\s*`, 'g'), '$1')
      .replace(/<(strong|em|code|span|small|sub|sup)((?: [^>]*)?)> /g, ' <$1$2>')
      .replace(/ <\/(strong|em|code|span|small|sub|sup)>/g, '</$1> ')
  }
  return s.trim()
}

/** Canonical markup of one fragment inside a page, for comparing blocks. */
const canonFragment = (nodes: Node[]): string => canonicalSheet(`<section class="sheet">${serializeNodes(nodes)}</section>`)

// ---- inline text with blanks ----------------------------------------------------------------------------------------

const BLANK = { short: '__', '': '___', long: '____' } as const

/** Inline content as the fields show it: the slides' markup, a blank as underscores. */
export function inlineText(nodes: Node[]): string {
  const swapped = nodes.map((n): Node => {
    if (!isEl(n) || n.tag !== 'span' || !hasClass(n, 'blank') || n.children.some((c) => !isBlank(c))) return isEl(n) ? { ...n, children: blanksIn(n.children) } : n
    const size = hasClass(n, 'short') ? 'short' : hasClass(n, 'long') ? 'long' : ''
    return classes(n).length === (size ? 2 : 1) ? txt(BLANK[size]) : n
  })
  return inlineToText(swapped)
}
const blanksIn = (nodes: Node[]): Node[] => nodes.map((n) => (isEl(n) && n.tag === 'span' && hasClass(n, 'blank') && !n.children.length ? txt(BLANK[hasClass(n, 'short') ? 'short' : hasClass(n, 'long') ? 'long' : '']) : isEl(n) ? { ...n, children: blanksIn(n.children) } : n))

/** The fields' text back into inline nodes: underscores become blanks. */
export function textInline(text: string): Node[] {
  const out: Node[] = []
  for (const n of textToInline(text)) {
    if (n.type !== 'text') {
      out.push(isEl(n) ? { ...n, children: splitBlanks(n.children) } : n)
      continue
    }
    out.push(...splitBlanks([n]))
  }
  return out
}
function splitBlanks(nodes: Node[]): Node[] {
  return nodes.flatMap((n): Node[] => {
    if (n.type !== 'text') return [isEl(n) ? { ...n, children: splitBlanks(n.children) } : n]
    const parts: Node[] = []
    let last = 0
    for (const m of n.text.matchAll(/_{2,}/g)) {
      if (m.index > last) parts.push(txt(n.text.slice(last, m.index)))
      const size = m[0].length === 2 ? 'short' : m[0].length >= 4 ? 'long' : ''
      parts.push(el('span', { class: size ? `blank ${size}` : 'blank' }))
      last = m.index + m[0].length
    }
    if (last < n.text.length) parts.push(txt(n.text.slice(last)))
    return parts
  })
}

// ---- reading -------------------------------------------------------------------------------------------------------

const only = (els: El[], tag: string, cls?: string): El | undefined => els.find((e) => e.tag === tag && (!cls || hasClass(e, cls)))
const inline = (e: El | undefined): string => (e ? inlineText(e.children) : '')
const clsOf = (e: El, drop: string[] = []): string => classes(e).filter((c) => !drop.includes(c)).join(' ')

/** The common part of a block: its modifiers, height, lines and fill, from its classes. */
function common(e: El): Common {
  const c: Common = { mods: [], space: 0, lines: 0, fill: false }
  for (const k of classes(e).slice(2)) {
    const h = /^h-(\d+)$/.exec(k)
    const l = /^lines-(\d+)$/.exec(k)
    if (h) c.space = Number(h[1])
    else if (l) c.lines = Number(l[1])
    else if (k === 'fill') c.fill = true
    else c.mods.push(k)
  }
  return c
}

function readItems(nodes: El[]): TextItem[] | null {
  const items: TextItem[] = []
  for (const e of nodes) {
    if (e.tag === 'h2' || e.tag === 'h3' || e.tag === 'p') items.push({ tag: e.tag, cls: clsOf(e), text: inline(e), points: [] })
    else if (e.tag === 'ul' || e.tag === 'ol') {
      if (classes(e).length || elements(e).some((li) => li.tag !== 'li')) return null
      items.push({ tag: e.tag, cls: '', text: '', points: elements(e).map(inline) })
    } else return null
  }
  return items
}

function readRoom(e: El | undefined): Room | null {
  if (!e) return null
  const c = common({ ...e, attrs: { class: `x write ${classes(e).filter((k) => k !== 'write').join(' ')}` } })
  return { lines: c.lines, space: c.space }
}

const isWrite = (e: El) => e.tag === 'div' && hasClass(e, 'write') && !hasClass(e, 'block')

type Reader = (e: El, c: Common) => SheetBlock | null

const readers: Record<string, Reader> = {
  text: (e, c) => {
    const items = readItems(elements(e))
    return items && { ...c, kind: 'text', items }
  },
  terms: (e, c) => {
    const kids = elements(e)
    const entries: { term: string; text: string }[] = []
    for (let i = 0; i < kids.length; i += 2) {
      if (kids[i].tag !== 'dt' || kids[i + 1]?.tag !== 'dd') return null
      entries.push({ term: inline(kids[i]), text: inline(kids[i + 1]) })
    }
    return { ...c, kind: 'terms', entries }
  },
  columns: (e, c) => {
    const sections: { heading: string; items: string[] }[] = []
    for (const k of elements(e)) {
      if (k.tag === 'h3') sections.push({ heading: inline(k), items: [] })
      else if (k.tag === 'ul' && !classes(k).length) {
        if (!sections.length || sections[sections.length - 1].items.length) sections.push({ heading: '', items: [] })
        sections[sections.length - 1].items = elements(k).map(inline)
      } else return null
    }
    return { ...c, kind: 'columns', sections }
  },
  table: (e, c) => {
    const head = only(elements(e), 'thead')
    const body = only(elements(e), 'tbody')
    const row = (r: El) => elements(r).map(inline)
    return { ...c, kind: 'table', head: head ? row(elements(head)[0] ?? el('tr')) : [], rows: body ? elements(body).map(row) : [] }
  },
  steps: (e, c) => {
    const steps = []
    for (const li of elements(e)) {
      const kids = elements(li)
      const h3 = kids[0]?.tag === 'h3' ? kids[0] : undefined
      if (!h3) return null
      const time = only(elements(h3), 'span', 'time')
      const title = inlineText(h3.children.filter((n) => n !== time))
      const rest = kids.slice(1)
      const write = rest.length && isWrite(rest[rest.length - 1]) ? rest[rest.length - 1] : undefined
      const body = readItems(write ? rest.slice(0, -1) : rest)
      if (!body) return null
      steps.push({ title, time: inline(time), body, room: readRoom(write) })
    }
    return { ...c, kind: 'steps', steps }
  },
  question: (e, c) => {
    const [h3, hint, ...more] = elements(e)
    if (more.length || (h3 && h3.tag !== 'h3') || (hint && !(hint.tag === 'p' && clsOf(hint) === 'hint'))) return null
    return { ...c, kind: 'question', title: inline(h3), plain: !!h3 && hasClass(h3, 'plain'), hint: inline(hint) }
  },
  box: (e, c) => {
    const items = readItems(elements(e))
    return items && { ...c, kind: 'box', items }
  },
  grid: (e, c) => {
    const fields = []
    for (const f of elements(e)) {
      if (f.tag !== 'div' || !hasClass(f, 'field')) return null
      const items = readItems(elements(f))
      if (!items) return null
      fields.push({ mods: classes(f).filter((k) => k !== 'field'), items })
    }
    return { ...c, kind: 'grid', fields }
  },
  rows: (e, c) => {
    const rows = []
    for (const r of elements(e)) {
      if (r.tag !== 'div' || !hasClass(r, 'row')) return null
      const extra = classes(r).filter((k) => k !== 'row')
      if (extra.some((k) => !/^h-\d+$/.test(k))) return null
      const kids = elements(r)
      const label = kids[0]?.tag === 'h3' ? kids[0] : undefined
      const rest = kids.slice(label ? 1 : 0)
      const write = rest.length && isWrite(rest[rest.length - 1]) ? rest[rest.length - 1] : undefined
      const items = readItems(write ? rest.slice(0, -1) : rest)
      if (!items) return null
      rows.push({ label: inline(label), items, room: readRoom(write), space: Number(/^h-(\d+)$/.exec(extra[0] ?? '')?.[1] ?? 0) })
    }
    return { ...c, kind: 'rows', rows }
  },
  circle: (e, c) => {
    const kids = elements(e).filter((k) => !(k.tag === 'svg' && hasClass(k, 'drawn')))
    const list = only(kids, 'ol')
    const middle = only(kids, 'p', 'middle')
    if (kids.some((k) => k !== list && k !== middle)) return null
    return { ...c, kind: 'circle', segments: list ? elements(list).map(inline) : [], middle: inline(middle) }
  },
  criteria: (e, c) => {
    const crits = []
    for (const k of elements(e)) {
      if (k.tag !== 'div' || !hasClass(k, 'crit')) return null
      const extra = classes(k).filter((x) => x !== 'crit')
      if (extra.some((x) => !/^h-\d+$/.test(x))) return null
      const kids = elements(k)
      crits.push({
        label: inline(only(kids, 'p', 'label')),
        score: inline(only(kids, 'span', 'score')),
        name: inline(only(kids, 'h3')),
        notes: kids.filter((x) => x.tag === 'p' && hasClass(x, 'note')).map(inline),
        space: Number(/^h-(\d+)$/.exec(extra[0] ?? '')?.[1] ?? 0),
      })
    }
    return { ...c, kind: 'criteria', crits }
  },
  ticks: (e, c) => ({ ...c, kind: 'ticks', items: elements(e).map(inline) }),
  write: (e, c) => (elements(e).length ? null : { ...c, kind: 'write' }),
  picture: (e, c) => {
    const img = only(elements(e), 'img')
    const cap = only(elements(e), 'figcaption')
    return img ? { ...c, kind: 'picture', image: img.attrs.src ?? '', alt: img.attrs.alt ?? '', caption: inline(cap) } : null
  },
  pictures: (e, c) => {
    const items = []
    for (const f of elements(e)) {
      const img = only(elements(f), 'img')
      if (f.tag !== 'figure' || !img) return null
      items.push({ image: img.attrs.src ?? '', alt: img.attrs.alt ?? '', caption: inline(only(elements(f), 'figcaption')) })
    }
    return { ...c, kind: 'pictures', items }
  },
  note: (e, c) => {
    const items = readItems(elements(e))
    return items && { ...c, kind: 'note', items }
  },
  facts: (e, c) => (e.tag === 'p' ? { ...c, kind: 'facts' } : null),
  starters: (e, c) => (e.tag === 'ul' && elements(e).every((li) => li.tag === 'li') ? { ...c, kind: 'starters', items: elements(e).map(inline) } : null),
  matrix: (e, c) => {
    const kids = elements(e)
    const y = only(kids, 'p', 'y')
    const x = only(kids, 'p', 'x')
    const fields = kids.filter((k) => k.tag === 'div' && clsOf(k) === 'field')
    if (kids.length !== fields.length + (y ? 1 : 0) + (x ? 1 : 0) || fields.length !== 4) return null
    const items = fields.map((f) => readItems(elements(f)))
    return items.every(Boolean) ? { ...c, kind: 'matrix', y: inline(y), x: inline(x), fields: items as TextItem[][] } : null
  },
  timeline: (e, c) => (e.tag === 'ol' && elements(e).every((li) => li.tag === 'li') ? { ...c, kind: 'timeline', items: elements(e).map(inline) } : null),
  shape: (e, c) => {
    const kids = elements(e).filter((k) => !(k.tag === 'svg' && hasClass(k, 'drawn')))
    const list = only(kids, 'ol')
    if (kids.some((k) => k !== list)) return null
    const form = c.mods.find(isDiagramShape) ?? 'pyramid'
    return { ...c, mods: c.mods.filter((m) => !isDiagramShape(m)), kind: 'shape', form, entries: list ? elements(list).map(inline) : [] }
  },
  scale: (e, c) => {
    const rows = []
    for (const r of elements(e)) {
      if (r.tag !== 'div' || clsOf(r) !== 'rate') return null
      const kids = elements(r).filter((k) => !(k.tag === 'div' && hasClass(k, 'drawn')))
      const label = only(kids, 'p', 'label')
      const low = only(kids, 'p', 'low')
      const high = only(kids, 'p', 'high')
      if (kids.length !== [label, low, high].filter(Boolean).length) return null
      rows.push({ label: inline(label), low: inline(low), high: inline(high) })
    }
    return { ...c, kind: 'scale', rows }
  },
  selftest: (e, c) => {
    const kids = elements(e)
    const head = only(kids, 'ul', 'head')
    const items = only(kids, 'ol', 'items')
    const sum = only(kids, 'p', 'sum')
    if (kids.length !== [head, items, sum].filter(Boolean).length) return null
    return { ...c, mods: c.mods.filter((m) => !/^c-\d$/.test(m)), kind: 'selftest', head: head ? elements(head).map(inline) : [], items: items ? elements(items).map(inline) : [], sum: inline(sum) }
  },
  ifthen: (e, c) => {
    const plans = []
    for (const k of elements(e)) {
      const parts = elements(k)
      if (k.tag !== 'div' || clsOf(k) !== 'plan' || parts.length !== 2 || clsOf(parts[0]) !== 'if' || clsOf(parts[1]) !== 'then') return null
      plans.push({ if: inline(parts[0]), then: inline(parts[1]) })
    }
    return { ...c, kind: 'ifthen', plans }
  },
  pair: (e, c) => {
    const cols = elements(e)
    if (cols.length !== 2 || cols.some((col) => col.tag !== 'div' || classes(col).length)) return null
    return { ...c, kind: 'pair', columns: [readBlocks(cols[0].children), readBlocks(cols[1].children)] }
  },
}

/** A block element as a document block, or as source when its fields cannot hold it. */
function readBlock(e: El): SheetBlock {
  const [first, name] = classes(e)
  const raw: SheetBlock = { kind: 'raw', html: serializeNodes([e]), mods: [], space: 0, lines: 0, fill: false }
  if (first !== 'block' || !name || !SHEET_BLOCK_NAMES.includes(name)) return raw
  const reader = readers[name]
  const doc = reader?.(e, common(e))
  if (!doc) return raw
  return canonFragment([e]) === canonFragment(writeBlock(doc)) ? doc : raw
}

function readBlocks(nodes: Node[]): SheetBlock[] {
  const out: SheetBlock[] = []
  for (const n of nodes) {
    if (isEl(n)) out.push(readBlock(n))
    else if (!isBlank(n)) out.push({ kind: 'raw', html: serializeNodes([n]), mods: [], space: 0, lines: 0, fill: false })
  }
  return out
}

function readHeader(h: El): SheetHeader | null {
  const head: SheetHeader = { eyebrow: '', title: '', titleCls: '', leads: [], picture: null }
  for (const k of elements(h)) {
    if (k.tag === 'div' && clsOf(k) === 'eyebrow') head.eyebrow = inline(k)
    else if (k.tag === 'h1') {
      head.title = inline(k)
      head.titleCls = clsOf(k)
    } else if (k.tag === 'p' && clsOf(k) === 'lead') head.leads.push(inline(k))
    else if (k.tag === 'figure' && !classes(k).length && elements(k).length === 1 && elements(k)[0].tag === 'img') head.picture = { image: elements(k)[0].attrs.src ?? '', alt: elements(k)[0].attrs.alt ?? '' }
    else return null
  }
  return canonFragment([h]) === canonFragment(writeHeader(head)) ? head : null
}

/** A page's markup as a document: its header and its blocks, each block as fields or, where they cannot hold it, as source. */
export function parseSheetPage(html: string): SheetPageDoc {
  const tree = parseTree(normalizeSheetHtml(html))
  const root = tree.find((n): n is El => isEl(n) && n.tag === 'section')!
  const doc: SheetPageDoc = { landscape: hasClass(root, 'landscape'), header: null, blocks: [] }
  const header = elements(root).find((e) => e.tag === 'header')
  if (header) {
    doc.header = readHeader(header)
    if (!doc.header) doc.headerRaw = serializeNodes([header])
  }
  doc.blocks = readBlocks(root.children.filter((n) => n !== header))
  return doc
}

// ---- writing -------------------------------------------------------------------------------------------------------

const textEl = (tag: string, cls: string, text: string): El => el(tag, cls ? { class: cls } : {}, textInline(text))

function writeItems(items: TextItem[]): El[] {
  return items.map((i) => (i.tag === 'ul' || i.tag === 'ol' ? el(i.tag, {}, i.points.map((p) => el('li', {}, textInline(p)))) : textEl(i.tag, i.cls, i.text)))
}

const writeRoom = (r: Room | null): El[] => (r ? [el('div', { class: ['write', r.lines ? `lines-${r.lines}` : '', r.space ? `h-${r.space}` : ''].filter(Boolean).join(' ') })] : [])

function blockClass(b: SheetBlock): string {
  const own = b.kind === 'shape' ? [b.form] : b.kind === 'selftest' && b.head.length && b.head.length !== 4 ? [`c-${Math.min(6, Math.max(2, b.head.length))}`] : []
  return ['block', b.kind, ...own, ...b.mods, b.space ? `h-${b.space}` : '', b.lines ? `lines-${b.lines}` : '', b.fill ? 'fill' : ''].filter(Boolean).join(' ')
}

const TAG: Partial<Record<BlockKind, string>> = { terms: 'dl', table: 'table', steps: 'ol', ticks: 'ul', picture: 'figure', facts: 'p', starters: 'ul', timeline: 'ol' }

/** A block in the catalogue's markup. */
export function writeBlock(b: SheetBlock): Node[] {
  if (b.kind === 'raw') return parseTree(b.html)
  const kids: Node[] = (() => {
    switch (b.kind) {
      case 'text':
      case 'box':
        return writeItems(b.items)
      case 'terms':
        return b.entries.flatMap((x) => [el('dt', {}, textInline(x.term)), el('dd', {}, textInline(x.text))])
      case 'columns':
        return b.sections.flatMap((s) => [...(s.heading.trim() ? [el('h3', {}, textInline(s.heading))] : []), el('ul', {}, s.items.map((x) => el('li', {}, textInline(x))))])
      case 'table':
        return [...(b.head.length ? [el('thead', {}, [el('tr', {}, b.head.map((x) => el('th', {}, textInline(x))))])] : []), el('tbody', {}, b.rows.map((r) => el('tr', {}, r.map((x) => el('td', {}, textInline(x))))))]
      case 'steps':
        return b.steps.map((s) => el('li', {}, [el('h3', {}, [...textInline(s.title), ...(s.time.trim() ? [txt(' '), el('span', { class: 'time' }, textInline(s.time))] : [])]), ...writeItems(s.body), ...writeRoom(s.room)]))
      case 'question':
        return [el('h3', b.plain ? { class: 'plain' } : {}, textInline(b.title)), ...(b.hint.trim() ? [textEl('p', 'hint', b.hint)] : [])]
      case 'grid':
        return b.fields.map((f) => el('div', { class: ['field', ...f.mods].join(' ') }, writeItems(f.items)))
      case 'rows':
        return b.rows.map((r) => el('div', { class: ['row', r.space ? `h-${r.space}` : ''].filter(Boolean).join(' ') }, [...(r.label.trim() ? [el('h3', {}, textInline(r.label))] : []), ...writeItems(r.items), ...writeRoom(r.room)]))
      case 'circle':
        return [el('ol', {}, b.segments.map((x) => el('li', {}, textInline(x)))), ...(b.middle.trim() ? [textEl('p', 'middle', b.middle)] : [])]
      case 'criteria':
        return b.crits.map((x) =>
          el('div', { class: ['crit', x.space ? `h-${x.space}` : ''].filter(Boolean).join(' ') }, [
            ...(x.label.trim() ? [textEl('p', 'label', x.label)] : []),
            ...(x.score.trim() ? [textEl('span', 'score', x.score)] : []),
            ...(x.name.trim() ? [el('h3', {}, textInline(x.name))] : []),
            ...x.notes.map((n) => textEl('p', 'note', n)),
          ]),
        )
      case 'ticks':
        return b.items.map((x) => el('li', {}, textInline(x)))
      case 'write':
        return []
      case 'picture':
        return [el('img', { src: b.image, alt: b.alt }), ...(b.caption.trim() ? [el('figcaption', {}, textInline(b.caption))] : [])]
      case 'pictures':
        return b.items.map((x) => el('figure', {}, [el('img', { src: x.image, alt: x.alt }), ...(x.caption.trim() ? [el('figcaption', {}, textInline(x.caption))] : [])]))
      case 'pair':
        return b.columns.map((col) => el('div', {}, col.flatMap(writeBlock)))
      case 'note':
        return writeItems(b.items)
      case 'facts':
        return []
      case 'starters':
      case 'timeline':
        return b.items.map((x) => el('li', {}, textInline(x)))
      case 'matrix':
        return [...(b.y.trim() ? [textEl('p', 'y', b.y)] : []), ...(b.x.trim() ? [textEl('p', 'x', b.x)] : []), ...b.fields.map((f) => el('div', { class: 'field' }, writeItems(f)))]
      case 'shape':
        return [el('ol', {}, b.entries.map((x) => el('li', {}, textInline(x))))]
      case 'scale':
        return b.rows.map((r) => el('div', { class: 'rate' }, [...(r.label.trim() ? [textEl('p', 'label', r.label)] : []), ...(r.low.trim() ? [textEl('p', 'low', r.low)] : []), ...(r.high.trim() ? [textEl('p', 'high', r.high)] : [])]))
      case 'selftest':
        return [el('ul', { class: 'head' }, b.head.map((x) => el('li', {}, textInline(x)))), el('ol', { class: 'items' }, b.items.map((x) => el('li', {}, textInline(x)))), ...(b.sum.trim() ? [textEl('p', 'sum', b.sum)] : [])]
      case 'ifthen':
        return b.plans.map((x) => el('div', { class: 'plan' }, [textEl('p', 'if', x.if), textEl('p', 'then', x.then)]))
    }
  })()
  return [el(TAG[b.kind] ?? 'div', { class: blockClass(b) }, kids)]
}

function writeHeader(h: SheetHeader): El[] {
  const kids: El[] = []
  if (h.eyebrow.trim()) kids.push(textEl('div', 'eyebrow', h.eyebrow))
  if (h.title.trim()) kids.push(textEl('h1', h.titleCls, h.title))
  for (const l of h.leads) if (l.trim()) kids.push(textEl('p', 'lead', l))
  if (h.picture?.image) kids.push(el('figure', {}, [el('img', { src: h.picture.image, alt: h.picture.alt })]))
  return kids.length ? [el('header', {}, kids)] : []
}

/** A page's document back into markup: a section.sheet with its header and blocks. */
export function serializeSheetPage(doc: SheetPageDoc): string {
  const header = doc.headerRaw !== undefined ? parseTree(doc.headerRaw) : doc.header ? writeHeader(doc.header) : []
  return serializeNodes([el('section', { class: doc.landscape ? 'sheet landscape' : 'sheet' }, [...header, ...doc.blocks.flatMap(writeBlock)])])
}

// ---- new blocks ----------------------------------------------------------------------------------------------------

const item = (tag: TextItem['tag'], cls: string, text: string, points: string[] = []): TextItem => ({ tag, cls, text, points })
const none = (): Common => ({ mods: [], space: 0, lines: 0, fill: false })

/** Words of a new block, in the app's language. */
export interface BlockWords {
  /** stage 4b */
  noteTitle: string
  starter: string
  axisY: string
  axisX: string
  low: string
  high: string
  never: string
  sometimes: string
  often: string
  always: string
  statement: string
  sum: string
  when: string
  then: string
  heading: string
  text: string
  term: string
  explanation: string
  question: string
  hint: string
  prompt: string
  step: string
  entry: string
  label: string
  rating: string
  criterion: string
  note: string
  caption: string
}

/** A block of a kind as it is added: a small example of what it holds, to be replaced. */
export function newBlock(kind: Exclude<BlockKind, 'raw'>, w: BlockWords): SheetBlock {
  switch (kind) {
    case 'text':
      return { ...none(), kind, items: [item('h3', '', w.heading), item('p', '', w.text)] }
    case 'terms':
      return { ...none(), kind, entries: [{ term: w.term, text: w.explanation }, { term: w.term, text: w.explanation }] }
    case 'columns':
      return { ...none(), kind, sections: [{ heading: '', items: [w.entry, w.entry, w.entry, w.entry] }] }
    case 'table':
      return { ...none(), kind, head: [w.heading, w.heading], rows: [[w.entry, w.entry], [w.entry, w.entry]] }
    case 'steps':
      return { ...none(), kind, steps: [{ title: w.step, time: '', body: [item('p', 'hint', w.hint)], room: null }, { title: w.step, time: '', body: [], room: null }] }
    case 'question':
      return { ...none(), kind, lines: 3, title: w.question, plain: false, hint: '' }
    case 'box':
      return { ...none(), kind, space: 30, items: [item('p', 'prompt', w.prompt)] }
    case 'grid':
      return { ...none(), kind, mods: ['g-2x2'], space: 80, fields: Array.from({ length: 4 }, () => ({ mods: [], items: [item('p', 'prompt', w.prompt)] })) }
    case 'rows':
      return { ...none(), kind, rows: [{ label: w.label, items: [item('p', 'prompt', w.prompt)], room: null, space: 25 }, { label: w.label, items: [item('p', 'prompt', w.prompt)], room: null, space: 25 }] }
    case 'circle':
      return { ...none(), kind, space: 100, segments: ['', '', '', ''], middle: '' }
    case 'criteria':
      return { ...none(), kind, crits: [{ label: w.rating, score: '/10', name: w.criterion, notes: [w.note, w.note], space: 25 }] }
    case 'ticks':
      return { ...none(), kind, items: ['', '', ''] }
    case 'write':
      return { ...none(), kind, lines: 4 }
    case 'picture':
      return { ...none(), kind, space: 50, image: '', alt: '', caption: '' }
    case 'pictures':
      return { ...none(), kind, space: 40, items: [] }
    case 'pair':
      return { ...none(), kind, columns: [[newBlock('question', w)], [newBlock('question', w)]] }
    case 'note':
      return { ...none(), kind, items: [item('h3', '', w.noteTitle), item('p', '', w.text)] }
    case 'facts':
      return { ...none(), kind }
    case 'starters':
      return { ...none(), kind, items: [w.starter, w.starter, w.starter] }
    case 'matrix':
      return { ...none(), kind, space: 100, y: w.axisY, x: w.axisX, fields: [[item('p', 'prompt', w.prompt)], [], [], []] }
    case 'timeline':
      return { ...none(), kind, space: 40, items: ['1', '2', '3', '4', '5'] }
    case 'shape':
      return { ...none(), kind, space: 70, form: 'pyramid', entries: ['', '', ''] }
    case 'scale':
      return { ...none(), kind, rows: [{ label: w.criterion, low: w.low, high: w.high }] }
    case 'selftest':
      return { ...none(), kind, head: [w.never, w.sometimes, w.often, w.always], items: [w.statement, w.statement, w.statement], sum: `${w.sum} ___` }
    case 'ifthen':
      return { ...none(), kind, plans: [{ if: w.when, then: w.then }, { if: w.when, then: w.then }] }
  }
}

/** The diagram shapes a shape block can take. */
export const SHEET_SHAPES: readonly DiagramShape[] = DIAGRAM_SHAPES

/** The plain words of a block, for its card's title in the editor. */
export function blockSummary(b: SheetBlock): string {
  const t = (s: string) => s.replace(/[*=`[\]{}_]+/g, ' ').replace(/\s+/g, ' ').trim()
  switch (b.kind) {
    case 'text':
    case 'box':
      return t(b.items.map((i) => i.text || i.points[0] || '').find(Boolean) ?? '')
    case 'terms':
      return t(b.entries.map((e) => e.term).join(', '))
    case 'columns':
      return t(b.sections.map((s) => s.heading || s.items[0] || '').join(', '))
    case 'table':
      return t(b.head.join(', '))
    case 'steps':
      return t(b.steps.map((s) => s.title).join(', '))
    case 'question':
      return t(b.title)
    case 'grid':
      return t(b.fields.map((f) => f.items[0]?.text ?? '').join(', '))
    case 'rows':
      return t(b.rows.map((r) => r.label).join(', '))
    case 'criteria':
      return t(b.crits.map((c) => c.name).join(', '))
    case 'ticks':
      return `${b.items.length}`
    case 'circle':
      return `${b.segments.length || 4}`
    case 'picture':
      return t(b.caption || b.alt)
    case 'pictures':
      return t(b.items.map((x) => x.caption).join(', '))
    case 'note':
      return t(b.items.map((i) => i.text || i.points[0] || '').find(Boolean) ?? '')
    case 'starters':
    case 'timeline':
      return t(b.items.join(', '))
    case 'matrix':
      return t(`${b.y} / ${b.x}`)
    case 'shape':
      return `${b.form} · ${b.entries.length || 3}`
    case 'scale':
      return t(b.rows.map((r) => r.label).join(', '))
    case 'selftest':
      return t(b.items[0] ?? '')
    case 'ifthen':
      return t(b.plans.map((x) => x.if).join(', '))
    default:
      return ''
  }
}

// ---- one element of a page, by its path (typing on the page, docs/worksheets.md, section 7) ------------------------

/** The page's tree and its section. */
function openPage(html: string): { nodes: Node[]; root: El } | null {
  const nodes = parseTree(normalizeSheetHtml(html))
  const root = nodes.find((n): n is El => isEl(n) && n.tag === 'section')
  return root ? { nodes, root } : null
}

function walkPath(root: El, path: number[], tags?: string[]): El | null {
  let at = root
  for (let i = 0; i < path.length; i++) {
    const next = elements(at)[path[i]]
    if (!next || (tags && tags[i] !== next.tag)) return null
    at = next
  }
  return at
}

/** The element at a path of element positions from the section down, if its tags are the ones given (as the browser shows them). */
export function sheetElementAt(html: string, path: number[], tags?: string[]): El | null {
  const page = openPage(html)
  return page && path.length ? walkPath(page.root, path, tags) : null
}

/** The page with the inline content of one element replaced; null when there is no such element. */
export function setSheetInline(html: string, path: number[], children: Node[]): string | null {
  const page = openPage(html)
  const target = page && path.length ? walkPath(page.root, path) : null
  if (!page || !target) return null
  target.children = children
  return serializeNodes(page.nodes)
}
