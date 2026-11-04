import type { Color, Fill, GradientStop, Media, Paragraph, PptxSlide, Run, Shape } from './ooxml'

/**
 * Turns a slide the browser has laid out into native PowerPoint shapes (ooxml.ts). Generic over the catalogue and
 * every theme: whatever the stylesheet draws is read back from the page – a text block becomes a text box with its
 * runs, a background or border a shape, a picture a picture (cropped as the slide crops it), an inline SVG a picture
 * that PowerPoint can convert to shapes. Pseudo-elements (marks, numerals, rules, discs) are made real elements first
 * so they can be measured like the rest.
 */

const SLIDE_W = 1280
const SLIDE_H = 720

/** Media of a deck, shared across slides so a picture used twice is stored once. */
export class MediaStore {
  media: Media[] = []
  private byKey = new Map<string, number | null>()

  async get(key: string, make: () => Promise<Media[] | null>): Promise<number | null> {
    if (this.byKey.has(key)) return this.byKey.get(key)!
    const made = await make().catch(() => null)
    let index: number | null = null
    if (made?.length) {
      // the fallback first, then the picture that names it
      const base = this.media.length
      made.forEach((m, i) => this.media.push(i === made.length - 1 && made.length > 1 ? { ...m, fallback: base } : m))
      index = this.media.length - 1
    }
    this.byKey.set(key, index)
    return index
  }
}

// ---------- colours ----------

let ctx: CanvasRenderingContext2D | null = null
const colorCache = new Map<string, Color | null>()

/** Any CSS colour the browser knows (rgb, oklab, color-mix …) as RRGGBB and alpha; null when transparent. */
export function parseColor(css: string): Color | null {
  if (colorCache.has(css)) return colorCache.get(css)!
  let out: Color | null = null
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(css.trim())
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    out = { hex: [m[1], m[2], m[3]].map((v) => Math.round(Math.min(255, parseFloat(v))).toString(16).padStart(2, '0')).join(''), alpha: a }
  } else if (css && css !== 'transparent' && css !== 'none') {
    ctx ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      out = a ? { hex: [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), alpha: a / 255 } : null
    }
  }
  if (out && out.alpha <= 0.001) out = null
  colorCache.set(css, out)
  return out
}

const withAlpha = (c: Color, k: number): Color => ({ hex: c.hex, alpha: c.alpha * k })

// ---------- fonts ----------

const GENERIC = /^(system-ui|-apple-system|blinkmacsystemfont|ui-[a-z-]+|sans-serif|serif|monospace|cursive|fantasy|emoji|math|fangsong)$/i

/** The first family of a stack PowerPoint can know by name: "'Inter Variable', Inter, system-ui" → "Inter". */
export function fontName(stack: string): string {
  for (const raw of stack.split(',')) {
    const f = raw.trim().replace(/^['"]|['"]$/g, '')
    if (!f || GENERIC.test(f)) continue
    return f.replace(/ Variable$/, '')
  }
  return /serif/i.test(stack) && !/sans-serif/i.test(stack) ? 'Georgia' : /mono/i.test(stack) ? 'Consolas' : 'Arial'
}

// ---------- making pseudo-elements real ----------

const PSEUDO_TAG = 'pp-pseudo'

/** The text of a `content` value: strings, counters, attributes. */
function contentText(content: string, el: Element, counter: (name: string) => number): string | null {
  if (!content || content === 'none' || content === 'normal') return null
  let out = ''
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|counters?\(\s*([\w-]+)\s*(?:,\s*(?:"[^"]*"\s*,\s*)?([\w-]+))?\s*\)|attr\(\s*([\w-]+)\s*\)|(url\([^)]*\))/g
  let m: RegExpExecArray | null
  let any = false
  while ((m = re.exec(content))) {
    any = true
    if (m[1] !== undefined || m[2] !== undefined) out += (m[1] ?? m[2]).replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1')
    else if (m[3]) {
      const n = counter(m[3])
      out += m[4] === 'decimal-leading-zero' ? String(n).padStart(2, '0') : m[4] === 'lower-alpha' || m[4] === 'lower-latin' ? String.fromCharCode(96 + n) : m[4] === 'upper-alpha' || m[4] === 'upper-latin' ? String.fromCharCode(64 + n) : String(n)
    } else if (m[5]) out += el.getAttribute(m[5]) ?? ''
  }
  return any ? out : null
}

/** The value of counter `name` at an element: it and its earlier siblings that increment it. */
function counterAt(el: Element, name: string): number {
  let n = 0
  for (let e: Element | null = el; e; e = e.previousElementSibling) {
    const inc = getComputedStyle(e).counterIncrement
    const m = new RegExp(`(?:^|\\s)${name}(?:\\s+(-?\\d+))?(?:\\s|$)`).exec(inc)
    if (m) n += m[1] ? parseInt(m[1], 10) : 1
  }
  return n
}

/**
 * Freezes every element's computed style inline and replaces ::before and ::after by real elements with the
 * pseudo's style, so inserting them changes no selector's match (nth-child, :has, adjacency).
 */
function materialize(root: HTMLElement) {
  const els = [root, ...root.querySelectorAll<HTMLElement | SVGElement>('*')].filter((e) => !(e instanceof SVGElement) || e.tagName.toLowerCase() === 'svg')
  // read everything first, write afterwards: one style pass
  const frozen = els.map((el) => {
    const styles = (['', '::before', '::after'] as const).map((p) => {
      const cs = getComputedStyle(el, p || null)
      if (p) {
        const text = contentText(cs.content, el, (name) => counterAt(el, name))
        if (text === null || cs.display === 'none') return null
        const props: [string, string][] = []
        for (const name of cs) props.push([name, cs.getPropertyValue(name)])
        return { props, text }
      }
      const props: [string, string][] = []
      for (const name of cs) props.push([name, cs.getPropertyValue(name)])
      return { props, text: '' }
    })
    return { el, styles }
  })
  for (const { el, styles } of frozen) {
    const [own, before, after] = styles
    if (own && el !== root) for (const [k, v] of own.props) el.style.setProperty(k, v)
    if (el instanceof SVGElement || el instanceof HTMLImageElement || el instanceof HTMLBRElement) continue
    for (const [which, s] of [['before', before], ['after', after]] as const) {
      if (!s) continue
      const span = document.createElement(PSEUDO_TAG)
      span.dataset.pseudo = which
      for (const [k, v] of s.props) span.style.setProperty(k, v)
      span.textContent = s.text
      if (which === 'before') el.insertBefore(span, el.firstChild)
      else el.appendChild(span)
    }
  }
  // the pseudo-elements themselves go
  root.classList.add('pp-measuring')
}

/** Hides the pseudo-elements once they are real elements (materialize); the stage of the export carries it. */
export const MEASURE_CSS = `.pp-measuring::before, .pp-measuring::after, .pp-measuring *::before, .pp-measuring *::after { content: none !important; display: none !important; }`

// ---------- geometry ----------

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null
}

const px = (v: string): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// ---------- the walk ----------

interface Ctx {
  origin: DOMRect
  slide: HTMLElement
  media: MediaStore
  out: { shape: Shape; layer: number; order: number }[]
  order: number
  titleTaken: boolean
}

const INLINE = new Set(['inline', 'contents'])
const isInline = (n: Node): boolean => n.nodeType === Node.TEXT_NODE || (n instanceof Element && !(n instanceof SVGElement && n.tagName.toLowerCase() === 'svg') && n.tagName !== 'IMG' && INLINE.has(getComputedStyle(n).display))

function rectOf(el: Element, c: Ctx): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left - c.origin.left, y: r.top - c.origin.top, w: r.width, h: r.height }
}

/** The slide's opacity at an element: the product of its own and its ancestors'. */
function opacityOf(el: Element, c: Ctx): number {
  let k = 1
  for (let e: Element | null = el; e && e !== c.slide.parentElement; e = e.parentElement) k *= parseFloat(getComputedStyle(e).opacity) || 0
  return k
}

/** Painting order, roughly: z-index below 0, the flow, positioned elements, z-index above 0. */
function layerOf(el: Element, c: Ctx): number {
  let layer = 0
  for (let e: Element | null = el; e && e !== c.slide; e = e.parentElement) {
    const cs = getComputedStyle(e)
    if (cs.position === 'static') continue
    // an element with a z-index is a stacking context: the outermost one decides; positioned without one paints above the flow
    const z = parseInt(cs.zIndex, 10)
    if (Number.isFinite(z)) layer = z < 0 ? z - 1 : z + 1
    else if (!layer) layer = 1
  }
  return layer
}

/** The rectangle the overflow of the element's ancestors leaves visible. */
function clipOf(el: Element, c: Ctx): Rect {
  let clip: Rect = { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }
  for (let e = el.parentElement; e && e !== c.slide; e = e.parentElement) {
    const cs = getComputedStyle(e)
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.contain.includes('paint')) clip = intersect(clip, rectOf(e, c)) ?? { x: 0, y: 0, w: 0, h: 0 }
  }
  return clip
}

const nameOf = (el: Element): string => {
  if (el.tagName.toLowerCase() === PSEUDO_TAG) return `${nameOf(el.parentElement!)}::${(el as HTMLElement).dataset.pseudo}`
  const cls = [...el.classList].filter((k) => k !== 'pp-measuring')[0]
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
}

function push(c: Ctx, el: Element, shape: Shape) {
  c.out.push({ shape, layer: layerOf(el, c), order: c.order++ })
}

// ---------- pictures ----------

async function blobOf(url: string): Promise<Blob | null> {
  const res = await fetch(url).catch(() => null)
  return res?.ok ? res.blob() : null
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

async function rasterize(src: string, w: number, h: number): Promise<Uint8Array | null> {
  const img = await loadImage(src)
  if (!img) return null
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) })
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}

/** A picture by address: PNG and JPEG as they are, SVG with a PNG beside it, anything else as PNG. */
async function pictureMedia(url: string, natural: { w: number; h: number }): Promise<Media[] | null> {
  const blob = await blobOf(url)
  if (!blob) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const type = blob.type || ''
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [{ ext: 'png', data: bytes }]
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return [{ ext: 'jpeg', data: bytes }]
  const objectUrl = URL.createObjectURL(blob)
  try {
    const isSvg = type.includes('svg') || /^\s*(<\?xml|<svg)/.test(new TextDecoder().decode(bytes.slice(0, 200)))
    const scale = isSvg ? Math.max(1, 1600 / Math.max(natural.w, natural.h, 1)) : 1
    const png = await rasterize(objectUrl, natural.w * scale, natural.h * scale)
    if (!png) return null
    return isSvg ? [{ ext: 'png', data: png }, { ext: 'svg', data: bytes }] : [{ ext: 'png', data: png }]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Places a picture of natural size into a box as object-fit / background-size would, cropped to the visible part. */
function placePicture(c: Ctx, el: Element, name: string, media: number, drawn: Rect, clip: Rect, alpha: number, descr?: string) {
  const vis = intersect(drawn, clip)
  if (!vis || vis.w < 0.5 || vis.h < 0.5) return
  const crop = { l: (vis.x - drawn.x) / drawn.w, t: (vis.y - drawn.y) / drawn.h, r: (drawn.x + drawn.w - vis.x - vis.w) / drawn.w, b: (drawn.y + drawn.h - vis.y - vis.h) / drawn.h }
  push(c, el, { kind: 'picture', name, media, ...vis, crop, alpha, descr })
}

/** Where a picture of natural size lands in a box: fill, contain, cover, none; positioned by "x y". */
function fit(box: Rect, natural: { w: number; h: number }, mode: string, position: string): Rect {
  const nw = natural.w || box.w
  const nh = natural.h || box.h
  let w = box.w
  let h = box.h
  if (mode === 'contain' || mode === 'scale-down' || mode === 'cover') {
    const k = mode === 'cover' ? Math.max(box.w / nw, box.h / nh) : Math.min(box.w / nw, box.h / nh)
    const kk = mode === 'scale-down' ? Math.min(1, k) : k
    w = nw * kk
    h = nh * kk
  } else if (mode === 'none') {
    w = nw
    h = nh
  } else if (mode !== 'fill') {
    // background-size: "auto", "100px auto", "50% 50%"
    const [sw, sh = 'auto'] = mode.split(/\s+/)
    const size = (v: string, total: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * total : v === 'auto' ? NaN : px(v))
    w = size(sw, box.w)
    h = size(sh, box.h)
    if (Number.isNaN(w) && Number.isNaN(h)) [w, h] = [nw, nh]
    else if (Number.isNaN(w)) w = (h * nw) / nh
    else if (Number.isNaN(h)) h = (w * nh) / nw
  }
  const [px1 = '50%', py1 = '50%'] = position.split(/\s+/)
  const off = (v: string, free: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * free : px(v))
  return { x: box.x + off(px1, box.w - w), y: box.y + off(py1, box.h - h), w, h }
}

async function imgShape(c: Ctx, img: HTMLImageElement) {
  const cs = getComputedStyle(img)
  const box = contentBox(img, cs, c)
  const natural = { w: img.naturalWidth, h: img.naturalHeight }
  const media = await c.media.get(img.currentSrc || img.src, () => pictureMedia(img.currentSrc || img.src, natural))
  if (media === null) return
  const drawn = fit(box, natural, cs.objectFit, cs.objectPosition)
  placePicture(c, img, img.alt || 'picture', media, drawn, intersect(box, clipOf(img, c)) ?? box, opacityOf(img, c), img.alt || undefined)
}

const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline']

/** An inline SVG as a file of its own: the theme's classes resolved to the colours they give. */
async function svgShape(c: Ctx, svg: SVGSVGElement) {
  const r = rectOf(svg, c)
  if (r.w < 1 || r.h < 1) return
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  src.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const target = dst[i]
    target.removeAttribute('class')
    target.removeAttribute('style')
    for (const p of SVG_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v && v !== 'normal' && !(p === 'opacity' && v === '1')) target.setAttribute(p, v)
    }
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.round(r.w)))
  clone.setAttribute('height', String(Math.round(r.h)))
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${r.w} ${r.h}`)
  const text = new XMLSerializer().serializeToString(clone)
  const bytes = new TextEncoder().encode(text)
  const media = await c.media.get(`svg:${text}`, async () => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }))
    try {
      const png = await rasterize(url, r.w * 2, r.h * 2)
      return png ? [{ ext: 'png', data: png }, { ext: 'svg', data: bytes }] : null
    } finally {
      URL.revokeObjectURL(url)
    }
  })
  if (media === null) return
  placePicture(c, svg, svg.getAttribute('aria-label') || 'diagram', media, r, clipOf(svg, c), opacityOf(svg, c), svg.getAttribute('aria-label') || undefined)
}

// ---------- boxes ----------

function contentBox(el: Element, cs: CSSStyleDeclaration, c: Ctx): Rect {
  const r = rectOf(el, c)
  const l = px(cs.borderLeftWidth) + px(cs.paddingLeft)
  const t = px(cs.borderTopWidth) + px(cs.paddingTop)
  return { x: r.x + l, y: r.y + t, w: Math.max(0, r.w - l - px(cs.borderRightWidth) - px(cs.paddingRight)), h: Math.max(0, r.h - t - px(cs.borderBottomWidth) - px(cs.paddingBottom)) }
}

/** Splits a comma list at the top level (not inside parentheses). */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** "rgb(1, 2, 3) 40%" → colour and position (0–1 of `length`, or null). */
function stopOf(s: string, length: number): { color: Color | null; at: number | null } {
  const m = /^(.*?\))?\s*([^()]*)$/.exec(s)
  const colorPart = (m?.[1] ?? s.split(/\s+/)[0]).trim()
  const pos = (m?.[1] ? m[2] : s.split(/\s+/).slice(1).join(' ')).trim().split(/\s+/)[0]
  const at = !pos ? null : pos.endsWith('%') ? parseFloat(pos) / 100 : pos.endsWith('px') ? px(pos) / (length || 1) : null
  return { color: parseColor(colorPart || s), at }
}

/** A linear gradient as a PowerPoint gradient; a hard-edged circular radial gradient as a disc. */
function gradientShapes(layer: string, box: Rect, k: number, name: string): Shape[] {
  const lin = /^linear-gradient\((.*)\)$/.exec(layer)
  if (lin) {
    const parts = splitTop(lin[1])
    let angle = 180
    const head = parts[0]
    if (/^-?[\d.]+deg$/.test(head)) {
      angle = parseFloat(head)
      parts.shift()
    } else if (head.startsWith('to ')) {
      const dir = head.slice(3)
      angle = dir === 'right' ? 90 : dir === 'left' ? 270 : dir === 'top' ? 0 : dir === 'bottom' ? 180 : dir.includes('right') ? (dir.includes('top') ? 45 : 135) : dir.includes('top') ? 315 : 225
      parts.shift()
    }
    const raw = parts.map((p) => stopOf(p, 0))
    const stops: GradientStop[] = raw.flatMap((s, i) => (s.color ? [{ color: withAlpha(s.color, k), at: s.at ?? i / Math.max(1, raw.length - 1) }] : [{ color: { hex: (raw[i - 1]?.color ?? raw[i + 1]?.color ?? { hex: 'FFFFFF' }).hex, alpha: 0 }, at: s.at ?? i / Math.max(1, raw.length - 1) }]))
    if (stops.length < 2) return []
    // CSS 90deg points right; PowerPoint 0 points right, clockwise.
    return [{ kind: 'shape', name: `${name} gradient`, geom: 'rect', ...box, fill: { kind: 'linear', angle: angle - 90, stops } }]
  }
  const rad = /^radial-gradient\((.*)\)$/.exec(layer)
  if (rad) {
    const parts = splitTop(rad[1])
    const shape = /^circle(?:\s+at\s+(\S+)\s+(\S+))?$/.exec(parts[0]) ?? /^(?:circle\s+)?(?:[\d.]+px\s+)?at\s+(\S+)\s+(\S+)$/.exec(parts[0])
    if (!shape || parts.length !== 3) return []
    const a = stopOf(parts[1], 1)
    const b = stopOf(parts[2], 1)
    if (!a.color || b.color || a.at === null) return []
    const cx = box.x + (shape[1]?.endsWith('%') ? (parseFloat(shape[1]) / 100) * box.w : shape[1] ? px(shape[1]) : box.w / 2)
    const cy = box.y + (shape[2]?.endsWith('%') ? (parseFloat(shape[2]) / 100) * box.h : shape[2] ? px(shape[2]) : box.h / 2)
    const r = (a.at + (b.at ?? a.at)) / 2
    return [{ kind: 'shape', name: `${name} disc`, geom: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { kind: 'solid', color: withAlpha(a.color, k) } }]
  }
  return []
}

async function decorations(c: Ctx, el: HTMLElement, cs: CSSStyleDeclaration, isSlide: boolean) {
  const r = isSlide ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H } : rectOf(el, c)
  if (r.w < 0.5 || r.h < 0.5) return
  const k = isSlide ? 1 : opacityOf(el, c)
  const name = nameOf(el)
  const radius = px(cs.borderTopLeftRadius)
  const round = cs.borderTopLeftRadius.endsWith('%') ? (parseFloat(cs.borderTopLeftRadius) / 100) * Math.min(r.w, r.h) : radius
  const geom = round >= Math.min(r.w, r.h) / 2 - 0.5 && Math.abs(r.w - r.h) < 1 ? 'ellipse' : round > 0.5 ? 'roundRect' : 'rect'
  const bg = parseColor(cs.backgroundColor)
  const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) => ({ s, w: px(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)), style: cs.getPropertyValue(`border-${s.toLowerCase()}-style`), color: parseColor(cs.getPropertyValue(`border-${s.toLowerCase()}-color`)) })).map((b) => ({ ...b, on: b.w > 0 && b.style !== 'none' && b.style !== 'hidden' && !!b.color }))
  const uniform = sides.every((b) => b.on) && sides.every((b) => b.w === sides[0].w && b.color!.hex === sides[0].color!.hex && b.color!.alpha === sides[0].color!.alpha)
  if (bg && !isSlide) push(c, el, { kind: 'shape', name, geom, radius: round, ...r, fill: { kind: 'solid', color: withAlpha(bg, k) }, line: uniform ? { color: withAlpha(sides[0].color!, k), width: sides[0].w } : undefined })
  else if (uniform && !isSlide) push(c, el, { kind: 'shape', name: `${name} border`, geom, radius: round, x: r.x + sides[0].w / 2, y: r.y + sides[0].w / 2, w: r.w - sides[0].w, h: r.h - sides[0].w, line: { color: withAlpha(sides[0].color!, k), width: sides[0].w } })
  // background layers, the bottom one first
  const layers = cs.backgroundImage && cs.backgroundImage !== 'none' ? splitTop(cs.backgroundImage) : []
  const sizes = splitTop(cs.backgroundSize)
  const positions = splitTop(cs.backgroundPosition)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    const url = /^url\("?(.*?)"?\)$/.exec(layer)?.[1]
    if (url) {
      const img = await loadImage(url)
      if (!img) continue
      const natural = { w: img.naturalWidth || r.w, h: img.naturalHeight || r.h }
      const media = await c.media.get(url, () => pictureMedia(url, natural))
      if (media === null) continue
      const drawn = fit(r, natural, sizes[i % sizes.length] ?? 'auto', (positions[i % positions.length] ?? '0% 0%'))
      placePicture(c, el, `${name} picture`, media, drawn, intersect(r, clipOf(el, c)) ?? r, k)
    } else for (const s of gradientShapes(layer, r, k, name)) push(c, el, s)
  }
  if (!uniform && !isSlide)
    for (const b of sides) {
      if (!b.on) continue
      const line = b.s === 'Top' ? { x: r.x, y: r.y, w: r.w, h: b.w } : b.s === 'Bottom' ? { x: r.x, y: r.y + r.h - b.w, w: r.w, h: b.w } : b.s === 'Left' ? { x: r.x, y: r.y, w: b.w, h: r.h } : { x: r.x + r.w - b.w, y: r.y, w: b.w, h: r.h }
      push(c, el, { kind: 'shape', name: `${name} rule`, geom: 'rect', ...line, fill: { kind: 'solid', color: withAlpha(b.color!, k) } })
    }
}

// ---------- text ----------

function runOf(text: string, el: Element, k: number): Run {
  const cs = getComputedStyle(el)
  const deco = cs.textDecorationLine || cs.textDecoration
  return {
    text,
    font: fontName(cs.fontFamily),
    size: px(cs.fontSize),
    bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
    italic: cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique'),
    underline: deco.includes('underline'),
    strike: deco.includes('line-through'),
    caps: cs.textTransform === 'uppercase',
    spacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
    color: withAlpha(parseColor(cs.color) ?? { hex: '000000', alpha: 1 }, k),
  }
}

/** The runs of a stretch of inline content: text with its formatting, line breaks; whitespace collapsed as CSS does. */
function collectRuns(nodes: Node[], k: number, out: Run[]) {
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      const parent = n.parentElement!
      const ws = getComputedStyle(parent).whiteSpace
      const pre = ws.startsWith('pre') || ws === 'break-spaces'
      const raw = n.textContent ?? ''
      if (pre) {
        raw.split('\n').forEach((line, i) => out.push({ ...runOf(line, parent, k), br: i > 0 || undefined }))
      } else {
        const text = raw.replace(/[ \t\n\r\f]+/g, ' ')
        if (text) out.push(runOf(text, parent, k))
      }
    } else if (n instanceof HTMLBRElement) {
      out.push({ ...runOf('', n.parentElement!, k), br: true })
    } else if (n instanceof HTMLElement && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden') {
      collectRuns([...n.childNodes], k, out)
    }
  }
}

/** Drops the spaces CSS drops: at the start, at the end, after a break, doubled across run boundaries. */
function tidy(runs: Run[]): Run[] {
  let atStart = true
  for (const r of runs) {
    if (r.br) atStart = true
    if (atStart) r.text = r.text.replace(/^ +/, '')
    if (r.text) atStart = r.text.endsWith(' ')
  }
  for (let i = runs.length - 1; i >= 0; i--) {
    runs[i].text = runs[i].text.replace(/ +$/, '')
    if (runs[i].text || runs[i].br) break
  }
  for (let i = 0; i < runs.length - 1; i++) if (runs[i].text.endsWith(' ') && runs[i + 1].text.startsWith(' ')) runs[i + 1].text = runs[i + 1].text.slice(1)
  return runs.filter((r) => r.text || r.br)
}

const ALIGN: Record<string, Paragraph['align']> = { center: 'ctr', right: 'r', end: 'r', justify: 'just' }

function textShape(c: Ctx, el: HTMLElement, cs: CSSStyleDeclaration, nodes: Node[]) {
  const k = opacityOf(el, c)
  const runs = tidy((() => {
    const out: Run[] = []
    collectRuns(nodes, k, out)
    return out
  })())
  if (!runs.some((r) => r.text.trim())) return
  const range = document.createRange()
  range.setStartBefore(nodes[0])
  range.setEndAfter(nodes[nodes.length - 1])
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  if (!rects.length) return
  const left = Math.min(...rects.map((r) => r.left)) - c.origin.left
  const top = Math.min(...rects.map((r) => r.top)) - c.origin.top
  const right = Math.max(...rects.map((r) => r.right)) - c.origin.left
  const bottom = Math.max(...rects.map((r) => r.bottom)) - c.origin.top
  const vertical = cs.writingMode.startsWith('vertical')
  const fontSize = px(cs.fontSize)
  // the font's own line (what PowerPoint calls single spacing) is the height of a line's text, without the leading
  const firstText = [...range.getClientRects()].find((r) => r.height > 0)
  const natural = Math.max(1, (vertical ? firstText?.width : firstText?.height) ?? fontSize * 1.2)
  const lh = cs.lineHeight === 'normal' ? natural : px(cs.lineHeight)
  const factor = lh / natural
  const lineSpacing = lh > 0.5 ? factor : 1
  let align = ALIGN[cs.textAlign] ?? 'l'
  // a box as wide as its text, pushed to the right or the middle of a row (the source in the footer): its text keeps
  // to that side when another font makes it longer
  const parent = el.parentElement ? getComputedStyle(el.parentElement) : null
  if (align === 'l' && !vertical && parent?.display.includes('flex') && parent.flexDirection.startsWith('row') && Math.abs(contentBox(el, cs, c).w - (right - left)) < 2) {
    if (/end|right/.test(parent.justifyContent)) align = 'r'
    else if (parent.justifyContent === 'center') align = 'ctr'
  }
  const oneLine = (vertical ? right - left : bottom - top) < natural * 1.5
  // PowerPoint puts the extra leading above each line, CSS half above and half below: the box starts that much higher.
  const lead = lh > 0.5 ? lh - natural : 0
  let box: Rect
  if (vertical) {
    // the line runs vertically: the slack goes at its end – the top when it reads upwards (rotated), else the bottom
    const used = bottom - top
    const slack = Math.max(12, used * 0.1)
    const up = /matrix\(-1|rotate\(180/.test(cs.transform) || cs.writingMode === 'sideways-lr'
    const y = align === 'ctr' ? top - slack : up ? top - 2 * slack : top
    box = { x: left, y, w: right - left, h: used + 2 * slack }
  } else {
    // the width the text may take: its container's, at least what it uses, with slack for other font metrics (a font
    // the viewer lacks is replaced by a wider one, and a line that no longer fits would wrap)
    const content = contentBox(el, cs, c)
    const used = right - left
    const slack = Math.max(12, used * (oneLine ? 0.2 : 0.08))
    let x = left
    let w = Math.max(used + slack, Math.min(content.w, SLIDE_W - left))
    if (align === 'ctr') {
      const mid = (left + right) / 2
      w = Math.max(used + 2 * slack, content.w)
      x = mid - w / 2
    } else if (align === 'r') {
      w = Math.max(used + slack, content.w)
      x = right - w
    }
    box = { x, y: top - lead, w, h: bottom - top + lead }
  }
  const tag = el.tagName.toLowerCase()
  const title = !c.titleTaken && (tag === 'h1' || tag === 'h2') && !el.closest('svg')
  if (title) c.titleTaken = true
  const rotated = vertical && (/matrix\(-1|rotate\(180/.test(cs.transform) || cs.writingMode === 'sideways-lr')
  push(c, el, {
    kind: 'text',
    name: title ? 'Title' : nameOf(el),
    ...box,
    title,
    // a short single line set from the left (a kicker, a label) never wraps, whatever font the viewer has; centred and
    // right-aligned lines keep wrapping, since readers differ in where an unwrapped line overflows
    wrap: !(oneLine && fontSize <= 16 && align === 'l'),
    vert: vertical ? (rotated ? 'vert270' : 'vert') : undefined,
    paragraphs: [{ align, lineSpacing, runs }],
  })
}

/** Groups the child nodes of a block into stretches of inline content; each with visible text becomes a text box. */
function textGroups(el: HTMLElement): Node[][] {
  const groups: Node[][] = []
  let cur: Node[] = []
  for (const n of el.childNodes) {
    if (n.nodeType === Node.COMMENT_NODE) continue
    if (isInline(n)) cur.push(n)
    else {
      if (cur.length) groups.push(cur)
      cur = []
    }
  }
  if (cur.length) groups.push(cur)
  return groups.filter((g) => g.some((n) => (n.textContent ?? '').trim()))
}

async function walk(c: Ctx, el: HTMLElement) {
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden') return
  const isSlide = el === c.slide
  if (!INLINE.has(cs.display) || isSlide) await decorations(c, el, cs, isSlide)
  if (el instanceof HTMLImageElement) return imgShape(c, el)
  for (const group of textGroups(el)) textShape(c, el, cs, group)
  for (const child of el.children) {
    if (child instanceof SVGSVGElement) {
      if (getComputedStyle(child).display !== 'none') await svgShape(c, child)
    } else if (child instanceof HTMLElement) {
      // inline elements are text of their block; their block-level children (rare) are walked
      if (INLINE.has(getComputedStyle(child).display)) {
        for (const inner of child.querySelectorAll<HTMLElement>('*')) if (!INLINE.has(getComputedStyle(inner).display) && !inner.closest('svg')) await walk(c, inner)
      } else await walk(c, child)
    }
  }
}

/** The slide colours a PowerPoint theme takes over, read from the slide's tokens. */
export function themeColors(slide: HTMLElement): { dk1: string; lt1: string; dk2: string; lt2: string; accents: string[] } {
  const cs = getComputedStyle(slide)
  const get = (v: string, fallback: string) => parseColor(cs.getPropertyValue(v).trim())?.hex ?? fallback
  return {
    dk1: get('--fg', '22272E'),
    lt1: get('--bg', 'FFFFFF'),
    dk2: get('--title', '22272E'),
    lt2: get('--surface', 'ECECEA'),
    accents: ['--accent', '--accent-2', '--accent-3', '--accent-4', '--field', '--accent-deep'].map((v) => get(v, '2F6F8F')),
  }
}

export const themeFonts = (slide: HTMLElement): { major: string; minor: string } => {
  const cs = getComputedStyle(slide)
  return { major: fontName(cs.getPropertyValue('--font-display') || cs.fontFamily), minor: fontName(cs.getPropertyValue('--font-body') || cs.fontFamily) }
}

/** Lays one slide out on the stage and reads it back as shapes. */
export async function measureSlide(root: HTMLElement, html: string, media: MediaStore): Promise<PptxSlide> {
  root.innerHTML = html
  const slide = root.querySelector<HTMLElement>(':scope > section.slide')
  if (!slide) return { shapes: [] }
  await Promise.all([...slide.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
  await document.fonts.ready
  materialize(slide)
  const c: Ctx = { origin: slide.getBoundingClientRect(), slide, media, out: [], order: 0, titleTaken: false }
  await walk(c, slide)
  const background = parseColor(getComputedStyle(slide).backgroundColor) ?? undefined
  const shapes = c.out
    .filter(({ shape: s }) => s.w > 0 && s.h > 0 && intersect(s, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }))
    .sort((a, b) => a.layer - b.layer || a.order - b.order)
    .map((o) => o.shape)
  return { background, shapes }
}

export type { Fill }
