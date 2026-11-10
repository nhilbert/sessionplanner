import { esc, slideTitle } from '@/domain/slides'
import type { DeckMeta, FoundDeck } from '../importDeck'
import { MAX_UNZIPPED, readZip } from '../unzip'
import { BadXml, at, child, descendants, kids, parseXml, type XmlNode } from './xml'
import { crc32 } from './zip'

/**
 * A PowerPoint file as a deck for the slide pool, read in the browser, by rules and without any AI: every visible slide
 * becomes one or more slides of the catalogue (src/domain/slideFormat.ts) in the deck's own words. The file is not to be
 * trusted: its text is escaped wherever it goes, its parts are read by the strict reader in xml.ts, and the work is
 * bounded by the limits below. What cannot come across is listed in the warnings, never replaced by something made up.
 *
 * Reading follows scripts/slides/extract.py: slide order through presentation.xml and its relationships, positions
 * through group transforms, a placeholder's position from its layout. Only a slide's own shapes count; the layout and
 * the master are read for positions, never for content.
 */

export interface PptxImport {
  found: FoundDeck
  /** The slides of the deck made from the file, which may differ from the file's: hidden ones are left out, long ones split. */
  slides: number
  /** For each slide of the deck, the number of the slide in the file it was made from. */
  from: number[]
  /** What came across with something missing, by the slide's number in the file, for telling the person. */
  warnings: { slide: number; what: string }[]
}

/** What the server takes (server/app.ts, MAX_ASSET; server/validate.ts, the deck's body): a larger picture would fail the whole upload. */
const MAX_PICTURE = 10 * 1024 * 1024
const MAX_POOL_SLIDES = 500
const MAX_NAME = 300
const MAX_NOTES = 100_000
/** Bounds for a file made to do harm: slides in presentation.xml, and characters of XML read in all (a part may be referred to many times). */
const MAX_SLIDE_PARTS = 5000
const MAX_XML_TOTAL = 1024 * 1024 * 1024

const OLE_FILE = [0xd0, 0xcf, 0x11, 0xe0]

// ---- the package ---------------------------------------------------------------------------------------------------

interface Rel {
  type: string
  target: string
  external: boolean
}

/** A path inside the package, from a relationship's target; never leaves the archive, since parts are only looked up by name. */
function resolve(base: string, target: string): string {
  let path = target
  try {
    path = decodeURI(target)
  } catch {
    // A target with a stray % is taken as written.
  }
  const steps = path.startsWith('/') ? [] : base.split('/').slice(0, -1)
  for (const step of path.split('/')) {
    if (step === '..') steps.pop()
    else if (step && step !== '.') steps.push(step)
  }
  return steps.join('/')
}

class Package {
  private spent = 0
  private relations = new Map<string, Map<string, Rel>>()

  constructor(readonly files: Map<string, Uint8Array>) {}

  xml(part: string): XmlNode {
    const bytes = this.files.get(part)
    if (!bytes) throw new BadXml(`The part ${part} is missing.`)
    this.spent += bytes.length
    if (this.spent > MAX_XML_TOTAL) throw new BadXml('The file holds too much to read.')
    return parseXml(bytes)
  }

  rels(part: string): Map<string, Rel> {
    let found = this.relations.get(part)
    if (found) return found
    found = new Map()
    const slash = part.lastIndexOf('/') + 1
    const name = `${part.slice(0, slash)}_rels/${part.slice(slash)}.rels`
    if (this.files.has(name)) {
      for (const r of kids(this.xml(name), 'pr:Relationship')) {
        const { Id: id, Type: type, Target: target, TargetMode: mode } = r.attrs
        if (id && type && target) found.set(id, { type: type.slice(type.lastIndexOf('/') + 1), target: mode === 'External' ? target : resolve(part, target), external: mode === 'External' })
      }
    }
    this.relations.set(part, found)
    return found
  }

  /** The part a relationship of that type leads to. */
  related(part: string, type: string): string | undefined {
    for (const r of this.rels(part).values()) if (r.type === type && !r.external) return r.target
    return undefined
  }
}

// ---- text ----------------------------------------------------------------------------------------------------------

/** One line of a paragraph: as text, and as markup with its emphasis. */
interface Line {
  text: string
  html: string
}

interface Para {
  lines: Line[]
  text: string
  html: string
  level: number
  /** Numbered in the file (a list of these becomes an ol). */
  numbered: boolean
  /** Bullets switched off in the file: a line of text rather than a point. */
  plain: boolean
  bold: boolean
  /** The largest size given on a run, in points; 0 where it is inherited. */
  size: number
}

/** Text as markup: escaped, and {{ broken up, which nothing in a slide may contain; the page shows the same characters. */
const textHtml = (text: string): string => esc(text).replace(/\{(?=\{)/g, '&#123;')

const clean = (text: string): string =>
  text
    .replace(/_x000[bBdDaA9]_/g, '\n')
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '')

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** A branch of mc:AlternateContent: the fallback, which any reader can use, unless the choice holds a frame (a modern chart's fallback only says it cannot be shown). */
function chosen(el: XmlNode): XmlNode[] {
  const choices = kids(el, 'mc:Choice')
  const framed = choices.find((c) => descendants(c, 'p:graphicFrame').length)
  return (framed ?? child(el, 'mc:Fallback') ?? choices[0])?.children ?? []
}

const expanded = (nodes: XmlNode[]): XmlNode[] => nodes.flatMap((n) => (n.name === 'mc:AlternateContent' ? chosen(n) : [n]))

interface Span {
  text: string
  bold: boolean
  italic: boolean
}

function spansOf(p: XmlNode): (Span | null)[] {
  const out: (Span | null)[] = []
  for (const el of expanded(p.children)) {
    if (el.name === 'a:br') out.push(null)
    if (el.name !== 'a:r' && el.name !== 'a:fld') continue
    if (el.name === 'a:fld' && /^(slidenum|datetime)/.test(el.attrs.type ?? '')) continue
    const rPr = child(el, 'a:rPr')
    const style = { bold: rPr?.attrs.b === '1' || rPr?.attrs.b === 'true', italic: rPr?.attrs.i === '1' || rPr?.attrs.i === 'true' }
    // A vertical tab in the text is a soft return that came in by pasting.
    clean(child(el, 'a:t')?.text ?? '')
      .split(/[\n\r\v\f]/)
      .forEach((text, i) => {
        if (i) out.push(null)
        out.push({ ...style, text: text.replace(/\t/g, ' ') })
      })
  }
  return out
}

function lineHtml(spans: Span[], allBold: boolean, allItalic: boolean): string {
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    const bold = s.bold && !allBold
    const italic = s.italic && !allItalic
    if (last && last.bold === bold && last.italic === italic) last.text += s.text
    else merged.push({ text: s.text, bold, italic })
  }
  return merged
    .map((s) => {
      const blankRun = !s.text.trim()
      const inner = textHtml(s.text)
      if (blankRun) return inner
      const em = s.italic ? `<em>${inner}</em>` : inner
      return s.bold ? `<strong>${em}</strong>` : em
    })
    .join('')
}

/** The paragraphs of a text body that have text, with what the file says about their level and bullets. */
function paragraphs(body: XmlNode | undefined): Para[] {
  const out: Para[] = []
  for (const p of kids(body, 'a:p')) {
    const pPr = child(p, 'a:pPr')
    const spans = spansOf(p)
    const inked = spans.filter((s): s is Span => !!s && !!s.text.trim())
    if (!inked.length) continue
    const allBold = inked.every((s) => s.bold)
    const allItalic = inked.every((s) => s.italic)
    const groups: Span[][] = [[]]
    for (const s of spans) {
      if (s) groups[groups.length - 1].push(s)
      else groups.push([])
    }
    const lines = groups.filter((g) => g.some((s) => s.text.trim())).map((g) => {
      const trimmed = g.map((s) => ({ ...s }))
      trimmed[0].text = trimmed[0].text.trimStart()
      trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.trimEnd()
      return { text: g.map((s) => s.text).join('').trim(), html: lineHtml(trimmed, allBold, allItalic) }
    })
    const sizes = kids(p, 'a:r').map((r) => Number(child(r, 'a:rPr')?.attrs.sz ?? 0) / 100)
    out.push({
      lines,
      text: lines.map((l) => l.text).join(' '),
      html: lines.map((l) => l.html).join('<br>'),
      level: Math.max(0, Math.min(8, Number(pPr?.attrs.lvl ?? 0) || 0)),
      numbered: !!child(pPr, 'a:buAutoNum'),
      plain: !!child(pPr, 'a:buNone'),
      bold: allBold,
      size: sizes.reduce((a, b) => Math.max(a, b || 0), 0),
    })
  }
  return out
}

// ---- pictures ------------------------------------------------------------------------------------------------------

interface Media {
  name: string
  bytes: Uint8Array
  type: string
}

const startsWith = (b: Uint8Array, ...head: number[]): boolean => head.every((v, i) => b[i] === v)
const latin = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.subarray(from, to))

/** The same test as the server's: by the content, whatever the part is called. */
function pictureType(b: Uint8Array): { type: string; ext: string } | null {
  if (b.length > 8 && startsWith(b, 0x89, 0x50, 0x4e, 0x47)) return { type: 'image/png', ext: 'png' }
  if (b.length > 3 && startsWith(b, 0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' }
  if (b.length > 12 && latin(b, 0, 4) === 'RIFF' && latin(b, 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' }
  if (b.length > 6 && /^GIF8[79]a/.test(latin(b, 0, 6))) return { type: 'image/gif', ext: 'gif' }
  return null
}

/** The warning for a picture in a format the app does not take. */
function refusedFormat(part: string): string {
  const ext = part.slice(part.lastIndexOf('.') + 1).toLowerCase()
  const name = ({ jpeg: 'JPEG', tif: 'TIFF', tiff: 'TIFF', emf: 'EMF', wmf: 'WMF', svg: 'SVG', bmp: 'BMP', wdp: 'JPEG XR' } as Record<string, string>)[ext]
  return name ? `${name} picture` : 'picture in an unknown format'
}

// ---- reading a slide -----------------------------------------------------------------------------------------------

/** A position as parts of the slide's width and height. */
interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Block {
  box: Box
  paras: Para[]
  /** The placeholder type, for what has one. */
  ph?: string
  /** Text that is no placeholder (a text box or a shape): it may turn out to be a footer or a repeated label. */
  free: boolean
  /** The colour of the shape the text is written on, as the file names it; none for text on the slide's ground. */
  fill?: string
}

interface Pic {
  box: Box
  media: Media
  alt: string
}

interface Cell {
  html: string
}

interface Table {
  box: Box
  rows: Cell[][]
  /** The first row is a heading row, the first column a heading column. */
  headRow: boolean
  headCol: boolean
  /** Set from right to left in the file: its first column stands on the right. */
  rtl: boolean
}

interface RawSlide {
  n: number
  blocks: Block[]
  pics: Pic[]
  tables: Table[]
  /** Filled shapes without text: they may hold text boxes, or be a drawing. */
  shapes: Box[]
  /** Arrows and chevrons, and lines that have arrow heads: what makes a row of boxes a sequence. */
  arrows: number
  lines: number
  /** A shape or background of its own fills the slide: the way a divider looks in decks without placeholders. */
  filled: boolean
  notes: string
  warnings: string[]
}

interface Transform {
  sx: number
  sy: number
  dx: number
  dy: number
}

const IDENTITY: Transform = { sx: 1, sy: 1, dx: 0, dy: 0 }

interface SlideContext {
  pkg: Package
  media: Map<string, Media | string>
  part: string
  width: number
  height: number
  /** Positions by placeholder, from the slide's layout and its master. */
  places: Map<string, Box>
  slide: RawSlide
}

const num = (v: string | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function boxOf(xfrm: XmlNode | undefined, t: Transform, ctx: { width: number; height: number }): Box | null {
  const off = child(xfrm, 'a:off')
  const ext = child(xfrm, 'a:ext')
  if (!off || !ext) return null
  return {
    x: (t.sx * num(off.attrs.x) + t.dx) / ctx.width,
    y: (t.sy * num(off.attrs.y) + t.dy) / ctx.height,
    w: (t.sx * num(ext.attrs.cx)) / ctx.width,
    h: (t.sy * num(ext.attrs.cy)) / ctx.height,
  }
}

const offSlide = (b: Box): boolean => b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= 1 || b.y >= 1

/** The non-visual part of a shape: its name, whether it is hidden, its placeholder. */
function nonVisual(el: XmlNode): { cNvPr?: XmlNode; nvPr?: XmlNode } {
  const nv = el.children.find((c) => c.name.startsWith('p:nv'))
  return { cNvPr: child(nv, 'p:cNvPr'), nvPr: child(nv, 'p:nvPr') }
}

/** Placeholders of a layout or master by index and by type. */
function placesIn(pkg: Package, part: string, size: { width: number; height: number }, into: Map<string, Box>): void {
  const tree = at(pkg.xml(part), 'p:cSld', 'p:spTree')
  for (const el of tree?.children ?? []) {
    const ph = child(nonVisual(el).nvPr, 'p:ph')
    const box = ph && boxOf(child(child(el, 'p:spPr'), 'a:xfrm'), IDENTITY, size)
    if (!ph || !box) continue
    const keys = [`type:${ph.attrs.type ?? 'obj'}`]
    if (ph.attrs.idx) keys.push(`idx:${ph.attrs.idx}`)
    for (const k of keys) if (!into.has(k)) into.set(k, box)
  }
}

function placeOf(ph: XmlNode, ctx: SlideContext): Box | undefined {
  const type = ph.attrs.type ?? 'obj'
  const general = type === 'ctrTitle' ? 'title' : type === 'subTitle' || type === 'obj' ? 'body' : type
  return ctx.places.get(`idx:${ph.attrs.idx}`) ?? ctx.places.get(`type:${type}`) ?? ctx.places.get(`type:${general}`)
}

const DROPPED_PLACEHOLDERS = new Set(['dt', 'ftr', 'sldNum', 'hdr'])
const FALLBACK_TITLE: Box = { x: 0.05, y: 0.05, w: 0.9, h: 0.15 }
const FALLBACK_BODY: Box = { x: 0.05, y: 0.25, w: 0.9, h: 0.65 }

function pictureFrom(el: XmlNode, blip: XmlNode | undefined, box: Box, ctx: SlideContext): void {
  const { slide, part, pkg } = ctx
  const id = blip?.attrs['r:embed'] ?? blip?.attrs['r:link']
  if (!id) return
  const rel = pkg.rels(part).get(id)
  if (!rel || rel.external) {
    slide.warnings.push(rel?.external ? 'linked picture' : 'picture not found')
    return
  }
  let media = ctx.media.get(rel.target)
  if (media === undefined) {
    const bytes = pkg.files.get(rel.target)
    const kind = bytes && pictureType(bytes)
    if (!bytes) media = 'picture not found'
    else if (!kind) media = refusedFormat(rel.target)
    else if (bytes.length > MAX_PICTURE) media = 'picture over 10 MB'
    else media = { name: `pic-${crc32(bytes).toString(16).padStart(8, '0')}-${bytes.length.toString(16)}.${kind.ext}`, bytes, type: kind.type }
    ctx.media.set(rel.target, media)
  }
  if (typeof media === 'string') slide.warnings.push(media)
  else slide.pics.push({ box, media, alt: altOf(el) })
}

/** What PowerPoint adds to a description it made up itself. */
const MACHINE_ALT = /\s*(AI-generated content may be incorrect\.?|KI-generierte Inhalte können fehlerhaft sein\.?|Automatisch generierte Beschreibung|Automatically generated description)/gi

/** The description of a picture as an alt text that passes the sanitiser, which refuses a few words and long values. */
function altOf(el: XmlNode): string {
  const { cNvPr } = nonVisual(el)
  const given = (cNvPr?.attrs.descr || cNvPr?.attrs.title || '').replace(MACHINE_ALT, '').replace(/\s+/g, ' ').trim()
  if (/^[^\s]+\.(png|jpe?g|gif|svg|emf|wmf|tiff?|bmp|webp)$/i.test(given)) return ''
  const alt = textHtml(clean(given).slice(0, 240)).replace(/&#123;/g, '{ ')
  return alt.length > 300 || /url\(|javascript|expression|&#/i.test(alt) ? '' : alt
}

function readTable(graphic: XmlNode, box: Box, ctx: SlideContext): void {
  const tbl = child(graphic, 'a:tbl')
  const props = child(tbl, 'a:tblPr')
  const yes = (v: string | undefined) => v === '1' || v === 'true'
  const rows = kids(tbl, 'a:tr').map((tr) =>
    kids(tr, 'a:tc').map((tc) =>
      // A merged cell stays an empty cell: the format has no spans, and the columns stay in line.
      ({ html: yes(tc.attrs.hMerge) || yes(tc.attrs.vMerge) ? '' : paragraphs(child(tc, 'a:txBody')).map((p) => p.html).join('<br>') }),
    ),
  ).filter((r) => r.some((c) => c.html))
  if (rows.length) ctx.slide.tables.push({ box, rows, headRow: yes(props?.attrs.firstRow), headCol: yes(props?.attrs.firstCol), rtl: yes(props?.attrs.rtl) })
}

/** The text of a SmartArt in the order of its data model, children under their parents. */
function diagramParas(graphic: XmlNode, ctx: SlideContext): Para[] {
  const ids = descendants(graphic, 'dgm:relIds')[0]
  const rel = ctx.pkg.rels(ctx.part).get(ids?.attrs['r:dm'] ?? '')
  if (!rel || rel.external || !ctx.pkg.files.has(rel.target)) return []
  const data = ctx.pkg.xml(rel.target)
  const points = new Map(descendants(data, 'dgm:pt').map((pt) => [pt.attrs.modelId, pt]))
  const below = new Map<string, { id: string; order: number }[]>()
  for (const c of descendants(data, 'dgm:cxn')) {
    if (c.attrs.type && c.attrs.type !== 'parOf') continue
    const list = below.get(c.attrs.srcId) ?? []
    list.push({ id: c.attrs.destId, order: num(c.attrs.srcOrd) })
    below.set(c.attrs.srcId, list)
  }
  const out: Para[] = []
  const seen = new Set<string>()
  const start = [...points.values()].find((pt) => pt.attrs.type === 'doc')?.attrs.modelId
  const todo: { id: string; depth: number }[] = start ? [{ id: start, depth: -1 }] : []
  while (todo.length) {
    const { id, depth } = todo.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const pt = points.get(id)
    if (pt && depth >= 0 && (pt.attrs.type ?? 'node') === 'node') out.push(...paragraphs(child(pt, 'dgm:t')).map((p) => ({ ...p, level: depth })))
    const next = [...(below.get(id) ?? [])].sort((a, b) => b.order - a.order)
    for (const n of next) todo.push({ id: n.id, depth: depth + 1 })
  }
  return out
}

const MAX_CHART_ROWS = 20

/** A chart's numbers as a table: the drawing does not come across, what it says does. */
function chartTable(graphic: XmlNode, box: Box, ctx: SlideContext): void {
  const rel = ctx.pkg.rels(ctx.part).get(child(graphic, 'c:chart')?.attrs['r:id'] ?? '')
  if (!rel || rel.external || !ctx.pkg.files.has(rel.target)) return
  // Spreadsheets store 4.4 as 4.4000000000000004.
  const shown = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? String(Number(Number(v).toPrecision(12))) : v)
  // A blank cell has no point at all, so a value's place is its idx, not its turn in the file. Of categories on several levels, the inner one.
  const values = (node: XmlNode | undefined) => {
    if (!node) return []
    const points = descendants(descendants(node, 'c:lvl')[0] ?? node, 'c:pt')
    if (!points.length) return descendants(node, 'c:v').map((v) => textHtml(shown(clean(v.text))))
    const placed: string[] = []
    points.forEach((p, turn) => {
      const place = Number(p.attrs.idx ?? turn)
      const value = child(p, 'c:v')
      if (value && Number.isInteger(place) && place >= 0) placed[place] = textHtml(shown(clean(value.text)))
    })
    return placed
  }
  const series = descendants(ctx.pkg.xml(rel.target), 'c:ser')
  const categories = values(child(series[0], 'c:cat'))
  const columns = series.map((ser) => values(child(ser, 'c:val')))
  const length = columns.reduce((n, c) => Math.max(n, c.length), categories.length)
  // A long series says nothing as a table: the warning has to do.
  if (!length || length > MAX_CHART_ROWS) return
  const head = [{ html: '' }, ...series.map((ser) => ({ html: values(child(ser, 'c:tx')).join(' ') }))]
  const body = Array.from({ length }, (_, i) => [{ html: categories[i] ?? '' }, ...columns.map((c) => ({ html: c[i] ?? '' }))])
  ctx.slide.tables.push({ box, rows: [head, ...body], headRow: true, headCol: true, rtl: false })
}

function readFrame(el: XmlNode, t: Transform, ctx: SlideContext): void {
  const { slide } = ctx
  const ph = child(nonVisual(el).nvPr, 'p:ph')
  const box = boxOf(child(el, 'p:xfrm'), t, ctx) ?? (ph && placeOf(ph, ctx)) ?? FALLBACK_BODY
  if (offSlide(box)) return
  const graphic = at(el, 'a:graphic', 'a:graphicData')
  const uri = graphic?.attrs.uri ?? ''
  if (!graphic) return
  if (uri.endsWith('/table')) readTable(graphic, box, ctx)
  else if (uri.endsWith('/diagram')) {
    const paras = diagramParas(graphic, ctx)
    if (paras.length) slide.blocks.push({ box, paras, free: false })
    slide.warnings.push('SmartArt')
  } else if (uri.includes('chart')) {
    chartTable(graphic, box, ctx)
    slide.warnings.push('chart')
  } else {
    const pic = descendants(graphic, 'p:pic')[0]
    slide.warnings.push('embedded object')
    if (pic) pictureFrom(pic, at(pic, 'p:blipFill', 'a:blip'), box, ctx)
  }
}

function readShape(el: XmlNode, t: Transform, ctx: SlideContext): void {
  const { slide } = ctx
  const { nvPr } = nonVisual(el)
  const ph = child(nvPr, 'p:ph')
  const type = ph ? (ph.attrs.type ?? 'obj') : undefined
  if (type && DROPPED_PLACEHOLDERS.has(type)) return
  const spPr = child(el, 'p:spPr')
  const isTitle = type === 'title' || type === 'ctrTitle'
  const box = boxOf(child(spPr, 'a:xfrm'), t, ctx) ?? (ph && placeOf(ph, ctx)) ?? (isTitle ? FALLBACK_TITLE : FALLBACK_BODY)
  if (offSlide(box)) return
  const paras = paragraphs(child(el, 'p:txBody'))
  const shape = child(spPr, 'a:prstGeom')?.attrs.prst ?? ''
  const noFill = !!child(spPr, 'a:noFill')
  const filled = !noFill && (!!(child(spPr, 'a:solidFill') ?? child(spPr, 'a:gradFill') ?? child(spPr, 'a:pattFill')) || num(child(at(el, 'p:style'), 'a:fillRef')?.attrs.idx) > 0)
  const blip = at(spPr, 'a:blipFill', 'a:blip')
  if (blip) pictureFrom(el, blip, box, ctx)
  if (/arrow|chevron|homePlate/i.test(shape)) slide.arrows++
  if (paras.length) slide.blocks.push({ box, paras, ph: type, free: !ph, fill: filled ? (child(spPr, 'a:solidFill')?.children[0]?.attrs.val ?? 'filled') : undefined })
  else if (filled) {
    if (box.x <= 0.02 && box.y <= 0.02 && box.w >= 0.96 && box.h >= 0.96) slide.filled = true
    slide.shapes.push(box)
  }
}

function readPicture(el: XmlNode, t: Transform, ctx: SlideContext): void {
  const { nvPr } = nonVisual(el)
  const ph = child(nvPr, 'p:ph')
  const box = boxOf(child(child(el, 'p:spPr'), 'a:xfrm'), t, ctx) ?? (ph && placeOf(ph, ctx)) ?? FALLBACK_BODY
  if (offSlide(box)) return
  if (child(nvPr, 'a:videoFile')) ctx.slide.warnings.push('video')
  if (child(nvPr, 'a:audioFile')) ctx.slide.warnings.push('audio')
  pictureFrom(el, at(el, 'p:blipFill', 'a:blip'), box, ctx)
}

function groupTransform(el: XmlNode, t: Transform): Transform {
  const xfrm = at(el, 'p:grpSpPr', 'a:xfrm')
  const [off, ext, chOff, chExt] = ['a:off', 'a:ext', 'a:chOff', 'a:chExt'].map((n) => child(xfrm, n))
  if (!off || !ext || !chOff || !chExt) return t
  const sx = num(chExt.attrs.cx) ? num(ext.attrs.cx) / num(chExt.attrs.cx) : 1
  const sy = num(chExt.attrs.cy) ? num(ext.attrs.cy) / num(chExt.attrs.cy) : 1
  return { sx: t.sx * sx, sy: t.sy * sy, dx: t.sx * (num(off.attrs.x) - num(chOff.attrs.x) * sx) + t.dx, dy: t.sy * (num(off.attrs.y) - num(chOff.attrs.y) * sy) + t.dy }
}

/** The shapes in z-order; groups are entered. The depth is bounded by the XML reader's. */
function walk(nodes: XmlNode[], t: Transform, ctx: SlideContext): void {
  for (const el of expanded(nodes)) {
    const { cNvPr } = nonVisual(el)
    if (cNvPr?.attrs.hidden === '1' || cNvPr?.attrs.hidden === 'true') continue
    if (el.name === 'p:grpSp') walk(el.children, groupTransform(el, t), ctx)
    else if (el.name === 'p:sp') readShape(el, t, ctx)
    else if (el.name === 'p:pic') readPicture(el, t, ctx)
    else if (el.name === 'p:graphicFrame') readFrame(el, t, ctx)
    else if (el.name === 'p:contentPart') ctx.slide.warnings.push('ink drawing')
    else if (el.name === 'p:cxnSp') {
      ctx.slide.lines++
      const line = at(el, 'p:spPr', 'a:ln')
      if (child(line, 'a:tailEnd') || child(line, 'a:headEnd')) ctx.slide.arrows++
    }
  }
}

function notesOf(pkg: Package, part: string): string {
  const notes = pkg.related(part, 'notesSlide')
  if (!notes || !pkg.files.has(notes)) return ''
  const shapes = descendants(pkg.xml(notes), 'p:sp').filter((sp) => child(nonVisual(sp).nvPr, 'p:ph')?.attrs.type === 'body')
  return shapes.flatMap((sp) => paragraphs(child(sp, 'p:txBody'))).map((p) => p.text).join('\n')
}

function readSlide(pkg: Package, part: string, n: number, deck: { width: number; height: number; media: Map<string, Media | string>; layouts: Map<string, Map<string, Box>> }): RawSlide | null {
  const root = pkg.xml(part)
  if (root.attrs.show === '0' || root.attrs.show === 'false') return null
  const layout = pkg.related(part, 'slideLayout')
  let places = deck.layouts.get(layout ?? '')
  if (!places) {
    places = new Map()
    if (layout && pkg.files.has(layout)) {
      placesIn(pkg, layout, deck, places)
      const master = pkg.related(layout, 'slideMaster')
      if (master && pkg.files.has(master)) placesIn(pkg, master, deck, places)
    }
    deck.layouts.set(layout ?? '', places)
  }
  const slide: RawSlide = { n, blocks: [], pics: [], tables: [], shapes: [], arrows: 0, lines: 0, filled: false, notes: notesOf(pkg, part), warnings: [] }
  const tree = at(root, 'p:cSld', 'p:spTree')
  if (!tree) throw new BadXml(`Slide ${n} has no shapes.`)
  if (child(at(root, 'p:cSld', 'p:bg', 'p:bgPr'), 'a:solidFill')) slide.filled = true
  walk(tree.children, IDENTITY, { pkg, media: deck.media, part, width: deck.width, height: deck.height, places, slide })
  return slide
}

// ---- what is decoration --------------------------------------------------------------------------------------------

/** A picture on this share of the slides, and in at least three of them, is a logo or template art. */
const REPEATED_PICTURE = 0.4
const REPEATED_FOOTER = 0.3

const spot = (b: Box): string => `${Math.round(b.x * 50)}:${Math.round(b.y * 50)}`
const longSide = (b: Box, aspect: number): number => Math.max(b.w, b.h / aspect)

/** Removes what repeats through the deck, and what is too small to be content, from all slides at once. */
function dropDecoration(slides: RawSlide[], aspect: number): void {
  const pictures = new Map<string, number>()
  const placed = new Map<string, number>()
  const labels = new Map<string, number>()
  const count = (map: Map<string, number>, keys: Iterable<string>) => {
    for (const k of new Set(keys)) map.set(k, (map.get(k) ?? 0) + 1)
  }
  const label = (b: Block) => `${spot(b.box)}|${b.paras.map((p) => p.text).join(' ')}`
  for (const s of slides) {
    count(pictures, s.pics.map((p) => p.media.name))
    count(placed, s.pics.map((p) => `${p.media.name}@${spot(p.box)}`))
    count(labels, s.blocks.filter((b) => b.free).map(label))
  }
  const often = (n: number, share: number) => n >= 3 && n >= slides.length * share
  for (const s of slides) {
    s.pics = s.pics.filter((p) => {
      const small = p.box.w * p.box.h < 0.1
      return longSide(p.box, aspect) >= 0.045 && !often(pictures.get(p.media.name) ?? 0, REPEATED_PICTURE) && !(small && (placed.get(`${p.media.name}@${spot(p.box)}`) ?? 0) >= 3)
    })
    s.blocks = s.blocks.filter((b) => {
      if (!b.free) return true
      const text = b.paras.map((p) => p.text).join(' ')
      const low = b.box.y >= 0.85
      if (low && /^\d{1,3}$/.test(text)) return false
      return !often(labels.get(label(b)) ?? 0, low ? REPEATED_FOOTER : 0.5)
    })
  }
}

/** What a slide shows, for telling whether the next one shows it again: its paragraphs, table cells and pictures, and what of it could not be read. */
const shownOn = (s: RawSlide): Set<string> =>
  new Set([...s.blocks.flatMap((b) => b.paras.map((p) => `t:${p.text}`)), ...s.tables.flatMap((t) => t.rows.flatMap((r) => r.map((c) => `c:${c.html}`))), ...s.pics.map((p) => `p:${p.media.name}`), ...s.warnings.map((w) => `w:${w}`)])

/**
 * A slide that the next one repeats with more on it is a step of a build, made by copying the slide instead of animating
 * it; a slide the next one repeats exactly is a copy. Only the last of such a run is kept, with the notes of all. A slide
 * with a single thing on it stays: a divider is not the first step of the slide it announces.
 */
function dropBuilds(slides: RawSlide[]): RawSlide[] {
  const kept: RawSlide[] = []
  slides.forEach((s, i) => {
    const next = slides[i + 1]
    const here = shownOn(s)
    const there = next ? shownOn(next) : new Set<string>()
    const repeated = !!next && here.size > 0 && [...here].every((k) => there.has(k)) && (here.size >= 2 || there.size === here.size)
    if (!repeated) return void kept.push(s)
    if (s.notes && !next.notes.includes(s.notes)) next.notes = [s.notes, next.notes].filter(Boolean).join('\n')
  })
  return kept
}

/**
 * A hyphen typed to break a word in a narrow box ("Selbst-wirksamkeit") is taken out where the deck itself writes the
 * word in one piece somewhere else. Nothing else tells such a hyphen from one that belongs to the word.
 */
function mendHyphens(slides: RawSlide[]): void {
  const known = new Set<string>()
  const paras = slides.flatMap((s) => s.blocks.flatMap((b) => b.paras))
  for (const p of paras) for (const w of p.text.match(/\p{L}{6,}/gu) ?? []) known.add(w.toLowerCase())
  const mend = (text: string): string => text.replace(/(\p{L}{2,})-(\p{Ll}{2,})/gu, (all, a: string, b: string) => (known.has((a + b).toLowerCase()) ? a + b : all))
  for (const p of paras) {
    if (!/\p{L}-\p{Ll}/u.test(p.text)) continue
    p.text = mend(p.text)
    p.html = mend(p.html)
    p.lines = p.lines.map((l) => ({ text: mend(l.text), html: mend(l.html) }))
  }
}

// ---- how much fits -------------------------------------------------------------------------------------------------

/** Estimates from the stylesheet (src/slides/slides.css): 1280 × 720 less the padding, an average glyph at about half the type size. */
const CONTENT_HEIGHT = 568
const CONTENT_WIDTH = 1152
const GAP = 32

const lineCount = (text: string, width: number, font: number): number => Math.max(1, Math.ceil(text.length / (width / (font * 0.52))))

interface Head {
  eyebrow: string
  title: string
  lead: string
  source: string
}

function headerHeight(h: Head): number {
  if (!h.title && !h.lead && !h.eyebrow) return 0
  let height = h.title ? Math.ceil(h.title.length / 38) * 54 : 0
  if (h.eyebrow) height += 30
  if (h.lead) height += 14 + lineCount(h.lead, 760, 22) * 32
  return height + GAP
}

const roomUnder = (h: Head): number => CONTENT_HEIGHT - headerHeight(h)

interface Point {
  html: string
  text: string
  kids: Point[]
}

const subHeight = (p: Point, width: number): number => (p.kids.length ? 6 + p.kids.reduce((n, k) => n + lineCount(k.text, width - 22, 19) * 26.6 + 3, 0) : 0)

/** The height of a list at the size the stylesheet gives it: nine points and more get smaller type by themselves. */
function listHeight(points: Point[], compact: boolean): number {
  const many = points.length >= 9
  const font = compact ? (many ? 15 : 17) : many ? 19 : 24
  const line = font * (compact ? 1.3 : 1.4)
  const pad = compact ? (many ? 8 : 10) : many ? 16 : 24
  return points.reduce((n, p) => n + pad + lineCount(p.text, 850, font) * line + subHeight(p, 850), 0)
}

const columnHeight = (points: Point[]): number => points.reduce((n, p) => n + 20 + lineCount(p.text, 466, 20) * 28 + subHeight(p, 466), 0)

/** Points in as few runs as fit, evened out where that still fits. */
function packed(points: Point[], fits: (run: Point[]) => boolean): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []
  for (const p of points) {
    if (run.length && !fits([...run, p])) {
      runs.push(run)
      run = []
    }
    run.push(p)
  }
  if (run.length) runs.push(run)
  if (runs.length < 2) return runs
  const even: Point[][] = []
  const size = Math.ceil(points.length / runs.length)
  for (let i = 0; i < points.length; i += size) even.push(points.slice(i, i + size))
  return even.every(fits) ? even : runs
}

/** A point too tall for a slide by itself is parted along its sub-points, each part under the point's own words. */
function parted(points: Point[], fits: (run: Point[]) => boolean): Point[] {
  return points.flatMap((p) => {
    if (fits([p]) || p.kids.length < 2) return [p]
    return packed(p.kids, (run) => fits([{ ...p, kids: run }])).map((run) => ({ ...p, kids: run }))
  })
}

// ---- the layouts ---------------------------------------------------------------------------------------------------

interface Draft {
  layout: string
  html: string
}

const slide = (layout: string, inner: string, extra = ''): Draft => ({ layout, html: `<section class="slide ${layout}${extra}">${inner}</section>` })

function header(h: Head): string {
  if (!h.title && !h.lead && !h.eyebrow) return ''
  const eyebrow = h.eyebrow ? `<div class="eyebrow">${textHtml(h.eyebrow)}</div>` : ''
  const title = h.title ? `<h2>${textHtml(h.title)}</h2>` : ''
  const lead = h.lead ? `<p class="lead">${textHtml(h.lead)}</p>` : ''
  return `<header>${eyebrow}${title}${lead}</header>`
}

const footer = (h: Pick<Head, 'source'>): string => (h.source ? `<footer><span class="source">${textHtml(h.source)}</span></footer>` : '')

const pointHtml = (p: Point): string => `<li>${p.html}${p.kids.length ? `<ul>${p.kids.map((k) => `<li>${k.html}</li>`).join('')}</ul>` : ''}</li>`

function listBlock(points: Point[], ordered: boolean, extra = ''): string {
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag} class="list${extra}">${points.map(pointHtml).join('')}</${tag}>`
}

function sectionSlide(h: Head): Draft {
  // A divider's type is for a few words; a whole sentence reads better as a statement.
  if (h.title.length > 55) return statementSlide(h.eyebrow, h.title, h.lead, h.source)
  const eyebrow = h.eyebrow ? `<div class="eyebrow">${textHtml(h.eyebrow)}</div>` : ''
  const lead = h.lead ? `<p class="lead">${textHtml(h.lead)}</p>` : ''
  return slide('section', `<div class="text">${eyebrow}<h1>${textHtml(h.title)}</h1>${lead}</div>${footer(h)}`)
}

function statementSlide(eyebrow: string, sentence: string, sub = '', source = ''): Draft {
  const long = words(sentence) > 12 ? ' long' : ''
  const kicker = eyebrow ? `<div class="eyebrow">${textHtml(eyebrow)}</div>` : ''
  const below = sub ? `<p class="sub">${textHtml(sub)}</p>` : ''
  return slide('statement', `<div class="text${long}">${kicker}<p class="big">${textHtml(sentence)}</p>${below}</div>${footer({ source })}`)
}

/** Reads as one sentence rather than a heading. */
const isSentence = (text: string): boolean => words(text) <= 40 && (/[.?!…“”"]$/.test(text) || words(text) >= 8)

/** A list, with the type made smaller where that is enough, split over several slides where it is not. */
function listSlides(h: Head, points: Point[], ordered: boolean, warn: (what: string) => void): Draft[] {
  const room = roomUnder(h)
  const fits = (run: Point[]) => run.length <= 10 && listHeight(run, false) <= room
  const write = (run: Point[], extra = '') => slide('list', `${header(h)}${listBlock(run, ordered, extra)}${footer(h)}`)
  if (fits(points)) return [write(points)]
  // A long list of words stands in two columns.
  if (points.every((p) => !p.kids.length && p.text.length <= 50)) {
    const most = Math.max(2, Math.floor(room / 43) * 2)
    const size = Math.ceil(points.length / Math.ceil(points.length / most))
    return Array.from({ length: Math.ceil(points.length / size) }, (_, i) => write(points.slice(i * size, (i + 1) * size), ' two'))
  }
  if (points.length <= 13 && listHeight(points, true) <= room) return [write(points, ' compact')]
  const runs = packed(parted(points, fits), fits)
  if (runs.some((run) => !fits(run))) warn('more text than a slide holds')
  return runs.map((run) => write(run))
}

function figureSlide(h: Head, p: Pic, caption: string): Draft {
  const cap = caption ? `<figcaption>${textHtml(caption)}</figcaption>` : ''
  const full = !h.title && !caption && p.box.w >= 0.9 && p.box.h >= 0.9
  return slide('figure', `${header(h)}<figure class="main"><img src="assets/${p.media.name}" alt="${p.alt}">${cap}</figure>${footer(h)}`, full ? ' full' : '')
}

/** Text beside a picture; what the column does not hold follows as a list. */
function splitSlides(h: Head, points: Point[], p: Pic, ordered: boolean, warn: (what: string) => void): Draft[] {
  const room = roomUnder(h)
  const runs = packed(parted(points, (run) => columnHeight(run) <= room), (run) => columnHeight(run) <= room)
  const first = runs[0]
  const whole = first.length === 1 && !first[0].kids.length
  const text = whole ? `<p>${first[0].html}</p>` : listBlock(first, ordered)
  // A photograph may be cropped to the column; a drawing or a screenshot stands whole.
  const classes = ['split', ...(p.media.type === 'image/jpeg' ? [] : ['contain']), ...(p.box.x + p.box.w / 2 < 0.45 ? ['figure-left'] : [])].join(' ')
  const out = [slide('split', `${header(h)}<div class="${classes}"><div class="text">${text}</div><figure><img src="assets/${p.media.name}" alt="${p.alt}"></figure></div>${footer(h)}`)]
  const rest = runs.slice(1).flat()
  return rest.length ? [...out, ...listSlides(h, rest, ordered, warn)] : out
}

interface Panel {
  box: Box
  head: string
  paras: Para[]
  pic?: Pic
  /** The number of the badge beside it. */
  rank?: number
}

const panelPoints = (p: Panel): Point[] => {
  const points = pointsOf(p.paras)
  return p.head ? [{ html: textHtml(p.head), text: p.head, kids: points.flatMap((q) => [{ ...q, kids: [] }, ...q.kids]) }] : points
}

function panelText(p: Panel): string {
  const points = pointsOf(p.paras)
  if (!points.length) return ''
  if (points.length === 1 && !points[0].kids.length) return `<p>${points[0].html}</p>`
  return listBlock(points, false)
}

const panelLines = (p: Panel, width: number): number => p.paras.reduce((n, q) => n + lineCount(q.text, width, 19), 0)

function cardsFit(panels: Panel[], cols: number, room: number, picture: number): boolean {
  const rows = Math.ceil(panels.length / cols)
  const width = (CONTENT_WIDTH - (cols - 1) * 32) / cols
  const height = Math.max(...panels.map((p) => 17 + picture + (p.head ? lineCount(p.head, width, 25) * 31 + 10 : 0) + panelLines(p, width) * 27.6 + (p.paras.length > 1 ? p.paras.length * 16 : 0)))
  return height * rows + (rows - 1) * GAP <= room
}

const SMALL_PICTURE = 0.12
const MAX_BLOCKS = 200

function cardsSlide(h: Head, panels: Panel[], cols: number, icons: boolean): Draft {
  const classes = `cards cols-${cols}${panels.some((p) => p.pic) && !icons ? ' picture contain' : ''}${panels.every((p) => p.rank) ? ' numbered' : ''}`
  const items = panels.map((p) => {
    const img = p.pic ? `<img${icons ? ' class="icon"' : ''} src="assets/${p.pic.media.name}" alt="${p.pic.alt}">` : ''
    return `<li>${img}${p.head ? `<h3>${textHtml(p.head)}</h3>` : ''}${panelText(p)}</li>`
  })
  return slide('cards', `${header(h)}<ul class="${classes}">${items.join('')}</ul>${footer(h)}`)
}

function stepsSlide(h: Head, panels: Panel[]): Draft {
  const items = panels.map((p) => `<li>${p.head ? `<h3>${textHtml(p.head)}</h3>` : ''}${panelText(p)}</li>`)
  return slide('steps', `${header(h)}<ol class="flow">${items.join('')}</ol>${footer(h)}`)
}

function compareSlide(h: Head, sides: Panel[]): Draft {
  const html = sides.map((p) => `<div class="side">${p.head ? `<h3>${textHtml(p.head)}</h3>` : ''}${panelText(p)}</div>`)
  return slide('compare', `${header(h)}<div class="compare">${html.join('')}</div>${footer(h)}`)
}

const compareFits = (sides: Panel[], room: number): boolean =>
  sides.every((p) => {
    const points = pointsOf(p.paras)
    return points.length <= 6 && (p.head ? 49 : 0) + points.reduce((n, q) => n + 18 + lineCount(q.text, 490, 21) * 29.4 + subHeight(q, 490), 0) <= room
  })

/** Headed panels under each other, or too long for cards: the list with a strong heading at the start of each point. */
function rowsSlides(h: Head, panels: Panel[], warn: (what: string) => void): Draft[] {
  const room = roomUnder(h)
  const item = (p: Panel) => {
    const text = pointsOf(p.paras)
    const body = text.length === 1 && !text[0].kids.length ? text[0].html : text.length ? `<ul>${text.flatMap((q) => [q, ...q.kids]).map((q) => `<li>${q.html}</li>`).join('')}</ul>` : ''
    return `<li><strong>${textHtml(p.head)}</strong>${body}</li>`
  }
  const height = (run: Panel[]) => run.reduce((n, p) => n + 44 + (p.head ? 30 : 0) + panelLines(p, 850) * 28, 0)
  const runs: Panel[][] = []
  for (const p of panels) {
    const last = runs[runs.length - 1]
    if (last && last.length < 6 && height([...last, p]) <= room) last.push(p)
    else runs.push([p])
  }
  if (runs.some((run) => height(run) > room)) warn('more text than a slide holds')
  return runs.map((run) => slide('list', `${header(h)}<ul class="list rows">${run.map(item).join('')}</ul>${footer(h)}`))
}

function tableSlides(h: Head, t: Table, warn: (what: string) => void): Draft[] {
  const cols = t.rows.reduce((n, r) => Math.max(n, r.length), 0)
  const compact = cols > 4
  const width = CONTENT_WIDTH / Math.max(1, cols)
  const font = compact ? 17 : 20
  const rowHeight = (r: Cell[]) => 24 + 1.35 * font * r.reduce((n, c) => Math.max(n, c.html.split('<br>').reduce((m, line) => m + lineCount(line, width - 16, font), 0)), 1)
  const headRow = t.headRow ? t.rows[0] : null
  const body = t.headRow ? t.rows.slice(1) : t.rows
  const room = roomUnder(h) - (headRow ? 36 : 0)
  const runs: Cell[][][] = []
  let height = Infinity
  for (const r of body) {
    if (height + rowHeight(r) > room) {
      runs.push([])
      height = 0
    }
    runs[runs.length - 1].push(r)
    height += rowHeight(r)
  }
  if (runs.some((run) => run.length === 1 && rowHeight(run[0]) > room)) warn('more text than a slide holds')
  const cells = (r: Cell[], tag: string) => {
    const padded = [...r, ...Array.from({ length: cols - r.length }, () => ({ html: '' }))]
    // The slide reads from the left, so a table set from right to left is turned round: its columns stand where they stood.
    const placed = t.rtl ? padded.reverse() : padded
    const heading = t.rtl ? cols - 1 : 0
    return `<tr>${placed.map((c, i) => `<${tag}>${tag === 'td' && i === heading && t.headCol && c.html ? `<strong>${c.html}</strong>` : c.html}</${tag}>`).join('')}</tr>`
  }
  const thead = headRow ? `<thead>${cells(headRow, 'th')}</thead>` : ''
  return (runs.length ? runs : [[]]).map((run) =>
    slide('table', `${header(h)}<table${compact ? ' class="compact"' : ''}>${thead}<tbody>${run.map((r) => cells(r, 'td')).join('')}</tbody></table>${footer(h)}`),
  )
}

/** Pictures side by side, whole: five to a slide. */
function pictureRows(h: Head, pics: Pic[]): Draft[] {
  const out: Draft[] = []
  for (let i = 0; i < pics.length; i += 5) {
    const run = pics.slice(i, i + 5)
    if (run.length === 1) out.push(figureSlide(h, run[0], ''))
    else out.push(slide('cards', `${header(h)}<ul class="cards cols-${run.length} picture contain">${run.map((p) => `<li><img src="assets/${p.media.name}" alt="${p.alt}"></li>`).join('')}</ul>${footer(h)}`))
  }
  return out
}

// ---- from shapes to a layout ---------------------------------------------------------------------------------------

function pointsOf(paras: Para[]): Point[] {
  const base = paras.reduce((n, p) => Math.min(n, p.level), 8)
  // Lines set apart from the bullets under them, by being bold or having no bullet, head those bullets even on one level.
  const heads = (p: Para) => p.plain || p.bold
  const headed = paras.length > 1 && heads(paras[0]) && paras.some((p) => !heads(p))
  const out: Point[] = []
  for (const p of paras) {
    const point: Point = { html: p.html, text: p.text, kids: [] }
    const last = out[out.length - 1]
    if (last && (p.level > base || (headed && !heads(p)))) last.kids.push(point)
    else out.push(point)
  }
  return out
}

/** Reading order: top to bottom in rows of about the same height, left to right in a row. */
function inReadingOrder<T extends { box: Box }>(items: T[]): T[] {
  const byTop = [...items].sort((a, b) => a.box.y - b.box.y)
  const rows: T[][] = []
  let rowTop = -Infinity
  for (const item of byTop) {
    if (item.box.y > rowTop + 0.04) {
      rows.push([])
      rowTop = item.box.y
    }
    rows[rows.length - 1].push(item)
  }
  return rows.flatMap((row) => row.sort((a, b) => a.box.x - b.box.x))
}

const textOf = (b: Block): string => b.paras.map((p) => p.text).join(' ')
const sizeOf = (b: Block): number => b.paras.reduce((n, p) => Math.max(n, p.size), 0)

/** A title's lines: a wrapped title stays one, a long second line starting anew is the title's lead. */
function titleParts(b: Block): { title: string; lead: string } {
  const lines = b.paras.flatMap((p) => p.lines.map((l) => l.text))
  let title = lines[0]
  let i = 1
  for (; i < lines.length; i++) {
    const joined = /-$/.test(title) && !/\s-$/.test(title) ? title + lines[i] : `${title} ${lines[i]}`
    if (!/^[\p{Ll}(]/u.test(lines[i]) && joined.length > 60) break
    title = joined
  }
  return { title: title.replace(/(?<![.…])\.$/, ''), lead: lines.slice(i).join(' ') }
}

/** The title of a slide without a title placeholder: the largest text near the top, else a bold line at the very top. */
function inferredTitle(blocks: Block[]): Block | undefined {
  const fits = (b: Block) => b.box.y < 0.4 && b.paras.length <= 2 && words(textOf(b)) <= 16 && !b.paras.every((p) => p.numbered)
  const sized = [...blocks].sort((a, b) => sizeOf(b) - sizeOf(a))
  const [first, second] = sized
  if (first && sizeOf(first) > 0 && fits(first) && (!second || sizeOf(first) >= sizeOf(second) * 1.2)) return first
  const bold = (b: Block) => blocks.length > 1 && b.box.y < 0.25 && b.paras.length === 1 && b.paras[0].bold && fits(b)
  const top = inReadingOrder(blocks)[0]
  if (top && bold(top)) return top
  // The one bold line near the top, wherever it stands: a title set to the right of the text is still the title.
  const lines = blocks.filter(bold)
  return lines.length === 1 ? lines[0] : undefined
}

/** The heading of a slide, and the blocks that are left for its content. */
function headOf(s: RawSlide): { head: Head; rest: Block[]; cover: boolean } {
  // The same words twice on a slide are said once; a block of quotation marks or dashes alone is ornament.
  const seen = new Set<string>()
  const unique = s.blocks.filter((b) => /[\p{L}\p{N}]/u.test(textOf(b)) && !seen.has(textOf(b)) && !!seen.add(textOf(b)))
  const placed = unique.find((b) => b.ph === 'title' || b.ph === 'ctrTitle')
  // Without a title of any kind, a subtitle is the title: a cover made from the subtitle alone.
  const titleBlock = placed ?? inferredTitle(unique.filter((b) => b.free || b.ph === 'subTitle')) ?? unique.find((b) => b.ph === 'subTitle' && words(textOf(b)) <= 16)
  let rest = unique.filter((b) => b !== titleBlock)
  const head: Head = { eyebrow: '', title: '', lead: '', source: '' }
  if (titleBlock) Object.assign(head, titleParts(titleBlock))
  else if (rest.length === 1 && !s.tables.length) {
    // One text box with everything in it: a short first line set apart from the text under it is the slide's title.
    const [first, second] = rest[0].paras
    if (second && words(first.text) <= 8 && headsOver(first, second)) {
      head.title = first.text.replace(/(?<![.…])\.$/, '')
      rest = [{ ...rest[0], paras: rest[0].paras.slice(1) }]
    }
  }
  const subtitle = rest.find((b) => b.ph === 'subTitle')
  if (subtitle) {
    head.lead = [head.lead, textOf(subtitle)].filter(Boolean).join(' ')
    rest = rest.filter((b) => b !== subtitle)
  }
  if (titleBlock) {
    // A short line just above the title is its kicker.
    const above = (b: Block) => b.free && b.paras.length === 1 && words(textOf(b)) <= 10 && b.box.y < titleBlock.box.y && b.box.y + b.box.h <= titleBlock.box.y + titleBlock.box.h * 0.4 && titleBlock.box.y - b.box.y < 0.15
    head.eyebrow = inReadingOrder(rest.filter(above)).map(textOf).join(' · ')
    rest = rest.filter((b) => !above(b))
  }
  const source = rest.find((b) => b.box.y >= 0.8 && /^(quelle|quellen|source|sources)\b/i.test(textOf(b)))
  if (source) {
    head.source = textOf(source)
    rest = rest.filter((b) => b !== source)
  }
  return { head, rest, cover: !!placed && placed.ph === 'ctrTitle' }
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const inside = (b: Box, outer: Box): boolean => {
  const c = centre(b)
  return c.x >= outer.x && c.x <= outer.x + outer.w && c.y >= outer.y && c.y <= outer.y + outer.h
}
const unionOf = (boxes: Box[]): Box => {
  const x = boxes.reduce((n, b) => Math.min(n, b.x), Infinity)
  const y = boxes.reduce((n, b) => Math.min(n, b.y), Infinity)
  return { x, y, w: boxes.reduce((n, b) => Math.max(n, b.x + b.w), -Infinity) - x, h: boxes.reduce((n, b) => Math.max(n, b.y + b.h), -Infinity) - y }
}
const overlapX = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) / Math.max(1e-6, Math.min(a.w, b.w))

/** Set apart from what follows: bold where that is not, or larger. */
const headsOver = (head: Para, next: Para): boolean => (head.bold && !next.bold) || (head.size > 0 && head.size >= next.size * 1.15)
const shortHead = (p: Para): boolean => words(p.text) <= 8 && !p.numbered

function panelOf(blocks: Block[]): Panel {
  const paras = blocks.flatMap((b) => b.paras)
  const [first, second] = paras
  const separate = blocks.length > 1 && blocks[0].paras.length === 1
  const head = first && second && shortHead(first) && (separate || headsOver(first, second)) ? first.text : ''
  return { box: unionOf(blocks.map((b) => b.box)), head, paras: head ? paras.slice(1) : paras }
}

/** The gap between two boxes; none where they touch or overlap. */
const gapBetween = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)))

interface Columns {
  /** Blocks across the width, over and under the columns. */
  before: Block[]
  columns: Block[][]
  after: Block[]
  /** Every column starts with a short line set apart from what stands under it. */
  headed: boolean
}

/** A short line that looks like a heading: by itself in its box, and how it is set. */
const headLook = (b: Block): string => (b.paras.length === 1 && shortHead(b.paras[0]) ? `${b.paras[0].bold}|${b.paras[0].size}|${b.fill ?? ''}` : '')

/**
 * Text boxes that stand in columns with a gutter between them, where the columns are what belongs together: each
 * under a heading of its own, or its boxes closer under each other than the columns are beside each other. Such a
 * slide is read column by column; read row by row, the columns would be shuffled into each other. Null for
 * everything else, a grid of cards among it, whose rows stand apart.
 */
function columnsOf(blocks: Block[]): Columns | null {
  if (blocks.length < 4) return null
  const span = unionOf(blocks.map((b) => b.box))
  const narrow = blocks.filter((b) => b.box.w < span.w * 0.6)
  if (narrow.length < 4) return null
  const columns: Block[][] = []
  const gutters: number[] = []
  let right = -Infinity
  for (const b of [...narrow].sort((a, c) => a.box.x - c.box.x)) {
    if (b.box.x > right) {
      if (columns.length) gutters.push(b.box.x - right)
      columns.push([])
    }
    columns[columns.length - 1].push(b)
    right = Math.max(right, b.box.x + b.box.w)
  }
  if (columns.length < 2 || columns.length > 5 || !columns.some((c) => c.length >= 3)) return null
  const read = columns.map((c) => inReadingOrder(c))
  const gutter = Math.min(...gutters)
  if (gutter < 0.01) return null
  const setApart = (c: Block[]) => c.length >= 2 && !!headLook(c[0]) && headLook(c[0]) !== headLook(c[1]) && (headsOver(c[0].paras[0], c[1].paras[0]) || (!!c[0].fill && c[0].fill !== c[1].fill))
  const tops = read.map((c) => c[0].box.y)
  const headed = read.every(setApart) && Math.max(...tops) - Math.min(...tops) < 0.05
  const gaps = read.flatMap((c) => c.slice(1).map((b, i) => b.box.y - (c[i].box.y + c[i].box.h)))
  if (!headed && Math.max(0, ...gaps) * 1.5 >= gutter) return null
  const top = Math.min(...narrow.map((b) => b.box.y))
  const wide = inReadingOrder(blocks.filter((b) => !narrow.includes(b)))
  return { before: wide.filter((b) => b.box.y < top), columns: read, after: wide.filter((b) => b.box.y >= top), headed }
}

/** A headed column as panels: its heading over what stands under it, and again from every further box set like the heading. */
function sectionsOf(column: Block[]): Panel[] {
  const look = headLook(column[0])
  const out: Block[][] = []
  for (const b of column) {
    if (headLook(b) === look || !out.length) out.push([b])
    else out[out.length - 1].push(b)
  }
  return out.map((run) => ({ box: unionOf(run.map((b) => b.box)), head: run[0].paras[0].text, paras: run.slice(1).flatMap((b) => b.paras) }))
}

/** Text that belongs together: what lies on one filled shape, a heading with the text right under it, a column under its heading. */
function panelsOf(blocks: Block[], shapes: Box[]): Panel[] {
  const cols = columnsOf(blocks)
  if (cols?.headed) {
    const alone = (b: Block) => panelOf([b])
    const sections = cols.columns.flatMap(sectionsOf)
    // Sections that turn out to stand in a grid are cards, read row by row.
    return [...cols.before.map(alone), ...(gridOf(sections) ? inReadingOrder(sections) : sections), ...cols.after.map(alone)]
  }
  const order = cols ? [...cols.before, ...cols.columns.flat(), ...cols.after] : inReadingOrder(blocks)
  const holders = shapes.filter((b) => b.w * b.h >= 0.01 && b.w * b.h <= 0.6).sort((a, b) => a.w * a.h - b.w * b.h)
  const holds = (h: Box, b: Block) => inside(b.box, h) && b.box.w * b.box.h <= h.w * h.h * 1.05
  const held = new Map<Box, Block[]>()
  const loose: Block[] = []
  for (const b of order) {
    // A shape on a shape: the text goes with the outer one, as long as that is a part of the slide and not its ground.
    const around = b.free ? holders.filter((h) => holds(h, b)) : []
    const outer = [...around].reverse().find((h) => blocks.filter((o) => o.free && holds(h, o)).length <= blocks.length / 2)
    const holder = outer ?? around[0]
    if (holder) held.set(holder, [...(held.get(holder) ?? []), b])
    else loose.push(b)
  }
  const groups = [...held.values()]
  const used = new Set<Block>()
  const byTop = [...loose].sort((a, b) => a.box.y - b.box.y)
  // Bold labels with their text to the right of them: rows of a table built from text boxes.
  const rows: [Block, Block][] = []
  for (const a of byTop) {
    if (!a.free || a.paras.length !== 1 || !a.paras[0].bold || !shortHead(a.paras[0])) continue
    const b = byTop.find((o) => o !== a && o.free && !rows.some((r) => r[1] === o) && o.box.w > a.box.w && o.box.x >= a.box.x + a.box.w - 0.02 && o.box.x - a.box.x - a.box.w < 0.1 && Math.abs(centre(o.box).y - centre(a.box).y) < Math.max(o.box.h, a.box.h) / 2 + 0.01)
    if (b) rows.push([a, b])
  }
  if (rows.length >= 2) {
    for (const row of rows) {
      row.forEach((b) => used.add(b))
      groups.push(row)
    }
  }
  for (const a of byTop) {
    if (used.has(a) || a.paras.length !== 1 || !shortHead(a.paras[0]) || !a.free) continue
    const group = [a]
    let bottom = a.box.y + a.box.h
    for (const b of byTop) {
      if (b === a || used.has(b) || !b.free || overlapX(a.box, b.box) < 0.6 || !headsOver(a.paras[0], b.paras[0])) continue
      if (b.box.y < bottom - 0.03 || b.box.y - bottom > 0.08) continue
      group.push(b)
      bottom = b.box.y + b.box.h
    }
    if (group.length > 1) {
      group.forEach((b) => used.add(b))
      groups.push(group)
    }
  }
  for (const b of loose) if (!used.has(b)) groups.push([b])
  if (!cols) return inReadingOrder(groups.map(panelOf))
  const at = (g: Block[]) => Math.min(...g.map((b) => order.indexOf(b)))
  return groups.sort((a, b) => at(a) - at(b)).map(panelOf)
}

/** Panels that stand in a grid: one or two rows of two to five, of about the same width. */
function gridOf(panels: Panel[]): { cols: number; rows: number } | null {
  if (panels.length < 2 || panels.length > 10) return null
  const rows: Panel[][] = []
  for (const p of [...panels].sort((a, b) => a.box.y - b.box.y)) {
    const row = rows.find((r) => Math.abs(centre(r[0].box).y - centre(p.box).y) < Math.max(r[0].box.h, p.box.h) / 2)
    if (row) row.push(p)
    else rows.push([p])
  }
  const cols = rows[0].length
  if (rows.length > 2 || cols < 2 || cols > 5 || rows.some((r) => r.length !== cols)) return null
  const widths = panels.map((p) => p.box.w)
  if (Math.max(...widths) > Math.min(...widths) * 2 || Math.min(...widths) < 0.08) return null
  if (rows.length === 2) {
    const [a, b] = rows.map((r) => [...r].sort((p, q) => p.box.x - q.box.x))
    if (a.some((p, i) => Math.abs(centre(p.box).x - centre(b[i].box).x) > 0.08)) return null
  }
  return { cols, rows: rows.length }
}

/** A line of words as a paragraph, for a heading that becomes text again. */
const paraOf = (text: string): Para => ({ lines: [{ text, html: textHtml(text) }], text, html: textHtml(text), level: 0, numbered: false, plain: false, bold: false, size: 0 })

/** How near a text stands to the picture it belongs to. */
const BESIDE = 0.05

/**
 * Each picture with the text that stands right beside, over or under it, as one panel; the text that stands by no
 * picture, and by no text of one, is left over. Null when a picture has no text of its own: then the pictures are no parts of the content.
 */
function withPictures(panels: Panel[], pics: Pic[]): { groups: Panel[]; others: Panel[] } | null {
  if (pics.length < 2 || pics.length > 10 || panels.length < pics.length) return null
  const beside = besidePictures(panels, pics)
  if (panels.length !== pics.length || (beside && !beside.others.length)) return beside
  // As many texts as pictures, though not side by side: they pair off by nearness alone, however far a caption stands under its picture.
  const groups = panels.map((p) => ({ ...p }))
  for (const pic of pics) {
    const c = centre(pic.box)
    const near = groups.filter((p) => !p.pic).sort((a, b) => Math.hypot(centre(a.box).x - c.x, centre(a.box).y - c.y) - Math.hypot(centre(b.box).x - c.x, centre(b.box).y - c.y))[0]
    near.pic = pic
  }
  return { groups: inReadingOrder(groups.map((p) => ({ ...p, box: unionOf([p.box, p.pic!.box]) }))), others: [] }
}

function besidePictures(panels: Panel[], pics: Pic[]): { groups: Panel[]; others: Panel[] } | null {
  // First the texts that touch a picture, each to its nearest; then, nearest first, the texts that touch a text of one: a row of label and description stays one.
  const mine = new Map<Pic, Panel[]>()
  const far = (p: Panel, pic: Pic) => Math.hypot(centre(pic.box).x - centre(p.box).x, centre(pic.box).y - centre(p.box).y)
  const direct = new Set<Panel>()
  let others: Panel[] = []
  for (const p of panels) {
    const near = [...pics].sort((a, b) => gapBetween(p.box, a.box) - gapBetween(p.box, b.box) || far(p, a) - far(p, b))[0]
    if (gapBetween(p.box, near.box) > BESIDE) others.push(p)
    else {
      mine.set(near, [...(mine.get(near) ?? []), p])
      direct.add(p)
    }
  }
  for (;;) {
    let best: { p: Panel; pic: Pic; gap: number } | null = null
    for (const p of others) {
      for (const [pic, texts] of mine) {
        const gap = Math.min(...texts.map((m) => gapBetween(p.box, m.box)))
        if (!best || gap < best.gap || (gap === best.gap && far(p, pic) < far(best.p, best.pic))) best = { p, pic, gap }
      }
    }
    if (!best || best.gap > BESIDE) break
    const joined = best
    mine.get(joined.pic)!.push(joined.p)
    others = others.filter((p) => p !== joined.p)
  }
  const groups: Panel[] = []
  for (const pic of pics) {
    const texts = mine.get(pic)
    if (!texts) return null
    const box = unionOf([pic.box, ...texts.map((p) => p.box)])
    if (texts.length === 1) {
      groups.push({ ...texts[0], box, pic })
      continue
    }
    // Several texts by one picture: its name heads the rest, which is the one short line among them, or the one that touches the picture.
    const name = (p: Panel) => !!p.head || (p.paras.length === 1 && shortHead(p.paras[0]))
    const names = texts.filter(name)
    const touching = names.filter((p) => direct.has(p))
    const label = names.length === 1 ? names[0] : touching.length === 1 ? touching[0] : undefined
    const rest = inReadingOrder(texts.filter((p) => p !== label)).flatMap((p) => [...(p.head ? [paraOf(p.head)] : []), ...p.paras])
    groups.push({ box, pic, head: label ? label.head || label.paras[0].text : '', paras: [...(label?.head ? label.paras : []), ...rest] })
  }
  // Pictures that only mark a few words of a slide full of text are no parts of it.
  const count = (list: Panel[]) => list.reduce((n, p) => n + words(p.head) + p.paras.reduce((m, q) => m + words(q.text), 0), 0)
  if (count(others) > count(groups)) return null
  return { groups: inReadingOrder(groups), others }
}

/**
 * Pictures with their texts: as cards in the grid they stand in (two rows on two slides where one does not hold them),
 * a few of them side by side wherever they stand, and each on a slide of its own beside its text where cards are too small.
 */
function pictureCards(s: RawSlide, head: Head, found: { groups: Panel[]; others: Panel[] }, aspect: number, warn: (what: string) => void): Draft[] | null {
  const { others } = found
  const aside = others.map((p) => [p.head, ...p.paras.map((q) => q.text)].filter(Boolean).join(' ')).join(' ')
  const short = others.length > 0 && !head.lead && words(aside) <= 30 && !others.some((p) => p.head)
  const h = short ? { ...head, lead: aside } : head
  // Pictures of one kind are about one size: an icon beside a photograph is no part of the same row.
  const sizes = found.groups.map((p) => longSide(p.pic!.box, aspect))
  if (Math.max(...sizes) > Math.min(...sizes) * 3) return null
  const icons = sizes.every((size) => size < SMALL_PICTURE)
  // More than a word or two by every picture: a name with its text, or a text of some length.
  const said = found.groups.every((p) => (p.head ? p.paras.length > 0 : p.paras.length > 1 || words(p.paras[0]?.text ?? '') > 6))
  const groups = found.groups
  const standing = gridOf(groups)
  // No grid: a few pictures with their texts still make a row; icons over a word each are a list with decoration.
  if (!standing && (groups.length > 5 || (icons && !said))) return null
  const grid = standing ?? { cols: groups.length, rows: 1 }
  const fits = (run: Panel[]) => cardsFit(run, grid.cols, roomUnder(h), icons ? 68 : 208)
  const rows = fits(groups) ? [groups] : grid.rows === 2 ? [groups.slice(0, grid.cols), groups.slice(grid.cols)] : []
  const apart = !icons && groups.length <= 5 && said
  let slides: Draft[]
  if (rows.length && rows.every(fits)) slides = rows.map((run) => cardsSlide(h, run, grid.cols, icons))
  else if (apart) slides = groups.flatMap((p) => splitSlides(h, panelPoints(p), p.pic!, false, warn))
  else return null
  return short || !others.length ? slides : [...slides, ...textSlides(s, head, others, warn)]
}

/** Numbers standing alone beside the text, the way a numbered sequence is built from boxes. */
const isBadge = (b: Block): boolean => b.free && b.paras.length === 1 && /^\d{1,2}\.?$/.test(textOf(b))

/** The panels in the order of the badges beside them, when each badge finds a panel of its own. */
function inBadgeOrder(panels: Panel[], badges: Block[]): Panel[] {
  const ranked = panels.map((p) => ({ ...p }))
  for (const b of badges) {
    const c = centre(b.box)
    const near = ranked.filter((p) => !p.rank).sort((p, q) => Math.hypot(centre(p.box).x - c.x, centre(p.box).y - c.y) - Math.hypot(centre(q.box).x - c.x, centre(q.box).y - c.y))[0]
    if (!near) return panels
    near.rank = parseInt(textOf(b), 10) || undefined
  }
  const ranks = ranked.flatMap((p) => p.rank ?? [])
  if (new Set(ranks).size !== badges.length) return panels
  return [...ranked.filter((p) => !p.rank), ...ranked.filter((p) => p.rank).sort((p, q) => p.rank! - q.rank!)]
}

const flat = (panels: Panel[]): Point[] => panels.flatMap(panelPoints)
const isOrdered = (panels: Panel[]): boolean => {
  if (panels.length > 1 && panels.every((p) => p.rank)) return true
  const paras = panels.flatMap((p) => p.paras).filter((p, _, all) => p.level === all[0].level)
  return paras.length > 1 && paras.every((p) => p.numbered)
}

const EXERCISE_TITLE = /^(Übung|Exercise|Aktivität|Activity)\s*[:–—-]\s*(.+)$/
const EXERCISE_WORD = /^(Übung|Exercise|Aktivität|Activity)$/i

/** The exercise layout for a slide that says it is one, with plain steps: the word becomes the tag in front of the title. */
function exerciseSlide(h: Head, points: Point[]): Draft | null {
  const named = EXERCISE_TITLE.exec(h.title)
  const parts = h.eyebrow.split(/\s*·\s*/)
  const place = parts.findIndex((p) => EXERCISE_WORD.test(p))
  if (!h.title || (!named && place < 0) || points.length < 2 || points.length > 8 || points.some((p) => p.kids.length)) return null
  const lines = points.reduce((n, p) => n + lineCount(p.text, 760, 22), 0)
  if (lines > 8 || (lines > 5 && points.length <= 5 && lines > points.length * 2)) return null
  const tag = named ? named[1] : parts[place]
  const title = named ? named[2] : h.title
  const eyebrow = named ? h.eyebrow : parts.filter((_, i) => i !== place).join(' · ')
  const kicker = eyebrow ? `<div class="eyebrow">${textHtml(eyebrow)}</div>` : ''
  const lead = h.lead ? `<p class="lead">${textHtml(h.lead)}</p>` : ''
  const steps = points.map((p) => `<li>${p.html}</li>`).join('')
  return slide('exercise', `<header>${kicker}<h2><span class="tag">${textHtml(tag)}</span> ${textHtml(title)}</h2>${lead}</header><div class="exercise"><ol class="steps">${steps}</ol></div>${footer(h)}`)
}

/** The panels as text under the heading: a grid as what it is, the rest as a list. */
function textSlides(s: RawSlide, h: Head, panels: Panel[], warn: (what: string) => void): Draft[] {
  const room = roomUnder(h)
  const grid = gridOf(panels)
  const headed = panels.every((p) => p.head)
  if (grid) {
    if (grid.rows === 1 && grid.cols === 2 && compareFits(panels, room)) return [compareSlide(h, panels)]
    if (grid.rows === 1 && grid.cols >= 3 && s.arrows >= grid.cols - 1 && cardsFit(panels, grid.cols, room, 0)) return [stepsSlide(h, panels)]
    if (cardsFit(panels, grid.cols, room, 0)) return [cardsSlide(h, panels, grid.cols, false)]
  }
  if (headed && panels.length > 1) return rowsSlides(h, panels, warn)
  const exercise = exerciseSlide(h, flat(panels))
  return exercise ? [exercise] : listSlides(h, flat(panels), isOrdered(panels), warn)
}

/** One slide of the file as slides of the catalogue. */
function translate(s: RawSlide, aspect: number, warn: (what: string) => void): Draft[] {
  const { head, rest: all, cover } = headOf(s)
  const badges = all.filter(isBadge)
  const rest = badges.length >= 2 ? all.filter((b) => !isBadge(b)) : all
  // More text boxes than any slide of the catalogue has room for are read as one text; so the work stays bounded too.
  const read = rest.length > MAX_BLOCKS ? [panelOf(inReadingOrder(rest))] : panelsOf(rest, s.shapes)
  const panels = badges.length >= 2 && all.length <= MAX_BLOCKS ? inBadgeOrder(read, badges) : read
  const text = panels.map((p) => [p.head, ...p.paras.map((q) => q.text)].filter(Boolean).join(' ')).join(' ')
  // On a slide with text, an icon that belongs to nothing is decoration.
  const shown = [...new Map(s.pics.map((p) => [p.media.name, p])).values()]
  const pics = rest.length ? shown.filter((p) => longSide(p.box, aspect) >= SMALL_PICTURE) : shown
  const divider = cover || (s.filled && rest.every((b) => b.free))
  const out: Draft[] = []

  if (s.tables.length) {
    const short = panels.length === 1 && !panels[0].head && panels[0].paras.length <= 2 && words(text) <= 30
    const tableHead = short && !head.lead ? { ...head, lead: text } : head
    out.push(...s.tables.flatMap((t) => tableSlides(tableHead, t, warn)))
    if (panels.length && !short) out.push(...textSlides(s, head, panels, warn))
    out.push(...pictureRows(head, pics))
    return out
  }

  if (shown.length >= 2) {
    const found = withPictures(panels, shown)
    const cards = found && pictureCards(s, head, found, aspect, warn)
    if (cards) return cards
  }

  if (!pics.length) {
    if (!panels.length) {
      if (!head.title && !head.lead) return []
      if (head.title && !head.lead && !cover && isSentence(head.title)) return [statementSlide(head.eyebrow, head.title, '', head.source)]
      return [head.title ? sectionSlide(head) : statementSlide(head.eyebrow, head.lead, '', head.source)]
    }
    if (panels.length === 1 && panels[0].paras.length <= 1 && !head.lead) {
      const only = panels[0].paras[0]?.text ?? panels[0].head
      if (divider && head.title && words(only) <= 25) return [sectionSlide({ ...head, lead: only })]
      // A statement has one line above its sentence: a kicker and a title together need a slide with a header.
      if (words(only) <= 40 && (!head.title || head.title.length <= 60) && !(head.title && head.eyebrow) && !panels[0].head && !only.endsWith(':')) return [statementSlide(head.title || head.eyebrow, only, '', head.source)]
    }
    if (divider && head.title && words(text) <= 25) {
      return [sectionSlide({ ...head, lead: [head.lead, text].filter(Boolean).join(' ') })]
    }
    return textSlides(s, head, panels, warn)
  }

  if (pics.length === 1) {
    if (!panels.length) return [figureSlide(head, pics[0], '')]
    if (panels.length === 1 && panels[0].paras.length <= 1 && words(text) <= 15) return [figureSlide(head, pics[0], text)]
    return splitSlides(head, flat(panels), pics[0], isOrdered(panels), warn)
  }

  const largest = [...pics].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
  if (!panels.length || words(text) <= 15) {
    const h = text && !head.lead ? { ...head, lead: text } : head
    return pictureRows(h, inReadingOrder(pics))
  }
  out.push(...splitSlides(head, flat(panels), largest[0], isOrdered(panels), warn))
  out.push(...pictureRows(head, inReadingOrder(largest.slice(1))))
  return out
}

/** Shapes left over that hold no text: what was drawn does not come across, only the words on it. */
function warnDrawing(s: RawSlide, aspect: number): void {
  const drawn = s.shapes.slice(0, MAX_BLOCKS).filter((b) => b.w * b.h < 0.25 && longSide(b, aspect) >= 0.02 && !s.blocks.slice(0, MAX_BLOCKS).some((t) => inside(t.box, b)))
  if (drawn.length + s.lines >= 4) s.warnings.push('drawn shapes')
}

// ---- the deck ------------------------------------------------------------------------------------------------------

function mainPart(pkg: Package): string {
  const main = pkg.related('', 'officeDocument')
  if (main && pkg.files.has(main)) return main
  if (pkg.files.has('ppt/presentation.xml')) return 'ppt/presentation.xml'
  throw new BadXml('It holds no presentation.')
}

const fileOf = (name: string, content: BlobPart, type: string): File => new File([content], name, { type })

/**
 * Speaker notes have no place on a pool slide, so they go where the deck format keeps them (docs/slides.md, section 6):
 * in the notes of a library entry. A slide with notes becomes a proposed entry; the person chooses at the upload whether
 * entries are made. A title that repeats is one entry, since importDeck would skip the second.
 */
function entriesOf(deckTitle: string, noted: { n: number; notes: string; files: string[]; title: string }[]): DeckMeta['entries'] {
  const byTitle = new Map<string, { title: string; notes: string; slides: string[] }>()
  for (const s of noted) {
    const title = (s.title || `${deckTitle} ${s.n}`).slice(0, MAX_NAME)
    const key = title.toLowerCase()
    const known = byTitle.get(key)
    if (known) {
      known.notes = `${known.notes}\n\n${s.notes}`.slice(0, MAX_NOTES)
      known.slides.push(...s.files)
    } else byTitle.set(key, { title, notes: s.notes.slice(0, MAX_NOTES), slides: [...s.files] })
  }
  return byTitle.size ? [...byTitle.values()] : undefined
}

function build(fileName: string, pkg: Package): PptxImport {
  const main = mainPart(pkg)
  const pres = pkg.xml(main)
  const size = child(pres, 'p:sldSz')
  const width = num(size?.attrs.cx) || 12192000
  const height = num(size?.attrs.cy) || 6858000
  const aspect = width / height
  const ids = kids(child(pres, 'p:sldIdLst'), 'p:sldId')
  if (ids.length > MAX_SLIDE_PARTS) throw new BadXml('It holds too many slides.')
  const deck = { width, height, media: new Map<string, Media | string>(), layouts: new Map<string, Map<string, Box>>() }
  const read: RawSlide[] = []
  ids.forEach((id, i) => {
    const rel = pkg.rels(main).get(id.attrs['r:id'] ?? '')
    if (!rel || rel.external) throw new BadXml(`Slide ${i + 1} is missing.`)
    const slide = readSlide(pkg, rel.target, i + 1, deck)
    if (slide) read.push(slide)
  })
  dropDecoration(read, aspect)
  mendHyphens(read)
  const raw = dropBuilds(read)

  const title = fileName.replace(/\.[^.]*$/, '').trim().slice(0, MAX_NAME) || 'PowerPoint'
  const warnings: PptxImport['warnings'] = []
  const fragments: File[] = []
  const all = new Map<string, File>()
  const noted: Parameters<typeof entriesOf>[1] = []
  const from: number[] = []
  for (const s of raw) {
    warnDrawing(s, aspect)
    const drafts = translate(s, aspect, (what) => s.warnings.push(what))
    const room = MAX_POOL_SLIDES - fragments.length
    if (drafts.length > room) s.warnings.push('more slides than a pool deck takes')
    const pictures = new Map(s.pics.map((p) => [p.media.name, p.media]))
    const files: string[] = []
    for (const draft of drafts.slice(0, Math.max(0, room))) {
      const name = `${String(fragments.length + 1).padStart(3, '0')}-${draft.layout}.html`
      const file = fileOf(name, draft.html, 'text/html')
      fragments.push(file)
      from.push(s.n)
      all.set(name, file)
      files.push(name)
      for (const m of draft.html.matchAll(/src="assets\/([^"]+)"/g)) {
        const media = pictures.get(m[1])
        if (media && !all.has(`assets/${media.name}`)) all.set(`assets/${media.name}`, fileOf(media.name, media.bytes as BlobPart, media.type))
      }
    }
    for (const what of new Set(s.warnings)) warnings.push({ slide: s.n, what })
    if (s.notes && files.length) noted.push({ n: s.n, notes: s.notes, files, title: slideTitle(drafts[0].html) })
  }
  if (!fragments.length) throw new BadXml('It holds no slides that can be read.')

  const meta: DeckMeta = { title, source: fileName.slice(0, MAX_NAME), entries: entriesOf(title, noted) }
  all.set('deck.json', fileOf('deck.json', JSON.stringify(meta), 'application/json'))
  return { found: { folder: '', meta, fragments, all }, slides: fragments.length, from, warnings }
}

/** The deck in a .pptx, in the form findDecks gives, so importDeck takes it. Throws an Error that says why for what is no readable deck. */
export async function deckFromPptx(file: File): Promise<PptxImport> {
  if (file.size > MAX_UNZIPPED) throw new Error('This file is too large to read.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (startsWith(bytes, ...OLE_FILE)) throw new Error('This is an old .ppt file, or one protected by a password; save it as .pptx without a password first.')
  let files: Map<string, Uint8Array>
  try {
    files = await readZip(bytes)
  } catch (err) {
    throw new Error(`This is not a PowerPoint file: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return build(file.name, new Package(files))
  } catch (err) {
    if (err instanceof BadXml) throw new Error(`This PowerPoint file cannot be read: ${err.message}`)
    throw err
  }
}
