/**
 * Diagrams (docs/slides.md, section 3, layout `diagram`): a shape drawn from the number of its entries. The slide
 * holds the entries as a list; the drawing is computed here, so two to five (at most six) entries give a pyramid
 * of that many layers, a ring of that many segments …
 * (The ring's class is `cycle`: `ring` is a utility class of the app's own stylesheet.) The drawing is inline SVG in the theme's classes, with no
 * words in it but the numerals: the entries' words are text of the slide, laid over the drawing by slides.css,
 * which places them from the same numbers (the box is 1152 × 470, see the constants).
 *
 * `drawDiagrams` puts the drawing into a slide's markup. normalizeSlideHtml calls it, so a diagram is drawn
 * wherever a slide is stored or shown, whoever wrote it, and always from its entries.
 */

export const DIAGRAM_SHAPES = ['pyramid', 'cycle', 'venn', 'onion', 'pillars', 'hub'] as const
export type DiagramShape = (typeof DIAGRAM_SHAPES)[number]
/** Shapes with a word of their own beside the entries: the centre of a cycle or hub, the overlap, the roof. */
export const DIAGRAM_CORE: readonly DiagramShape[] = ['cycle', 'venn', 'pillars', 'hub']
/** The most entries a drawing shows; the layout's room is five. */
export const DIAGRAM_MAX = 6

const W = 1152
const H = 470
const CX = W / 2
const CY = H / 2

const r1 = (x: number): string => String(Math.round(x * 10) / 10)
const pt = (x: number, y: number): string => `${r1(x)},${r1(y)}`
const rad = (deg: number): number => (deg * Math.PI) / 180
const polar = (deg: number, r: number, cx = CX, cy = CY): [number, number] => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))]
/** From the strongest tint (the first, or the innermost) to the lightest. */
const tint = (k: number, n: number): number => (n < 2 ? 1 : Math.round((1 - (0.7 * k) / (n - 1)) * 100) / 100)
const fill = (cls: string, opacity: number): string => `class="${cls}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}`
const two = (k: number): string => String(k + 1).padStart(2, '0')
/** A numeral in a shape: light on a strong tint, in the text colour on a light one. */
const numeral = (x: number, y: number, k: number, on: boolean): string => `<text${on ? ' class="t-on"' : ''} x="${r1(x)}" y="${r1(y)}" text-anchor="middle" dominant-baseline="central">${two(k)}</text>`

/**
 * Where the entries of the shapes with words on both sides stand: the first half down the right side, the rest up
 * the left, so they read clockwise. The first entry's direction, in degrees (0 = to the right, clockwise).
 */
const startAngle = (n: number): number => -(Math.ceil(n / 2) * (360 / n)) / 2
const midAngle = (k: number, n: number): number => startAngle(n) + (k + 0.5) * (360 / n)

function pyramid(n: number): string {
  const top = 6
  const span = 464
  const gap = 6
  const half = 290
  const h = span / n - gap
  const widthAt = (y: number) => (half * (y - top)) / (span - gap)
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const y0 = top + (k * span) / n
    const y1 = y0 + h
    const a = widthAt(y0)
    const b = widthAt(y1)
    out.push(`<polygon ${fill('f-accent', tint(k, n))} points="${pt(half - a, y0)} ${pt(half + a, y0)} ${pt(half + b, y1)} ${pt(half - b, y1)}"></polygon>`)
    if (k > 0) out.push(`<line class="s-line" x1="${r1(half + a + 14)}" y1="${r1(y0 - gap / 2)}" x2="${W}" y2="${r1(y0 - gap / 2)}"></line>`)
  }
  return out.join('')
}

function onion(n: number): string {
  const R = 229
  const cx = 232
  const bottom = 464
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const r = (R * (n - k)) / n
    const cy = bottom - r
    // the ground first, so every ring is its own tint and not the sum of the ones below it
    out.push(`<circle class="f-bg" cx="${cx}" cy="${r1(cy)}" r="${r1(r)}"></circle><circle ${fill('f-accent', tint(n - 1 - k, n))} cx="${cx}" cy="${r1(cy)}" r="${r1(r)}"></circle>`)
    if (k > 0) {
      const y = bottom - 2 * r
      const dy = y - (bottom - R)
      out.push(`<line class="s-line" x1="${r1(cx + Math.sqrt(Math.max(0, R * R - dy * dy)) + 14)}" y1="${r1(y)}" x2="${W}" y2="${r1(y)}"></line>`)
    }
  }
  return out.join('')
}

function cycle(n: number): string {
  const ro = 220
  const ri = 128
  const rm = (ro + ri) / 2
  const out: string[] = []
  if (n === 1) return `<path class="f-accent" fill-rule="evenodd" d="M ${pt(CX - ro, CY)} A ${ro} ${ro} 0 1 1 ${pt(CX + ro, CY)} A ${ro} ${ro} 0 1 1 ${pt(CX - ro, CY)} Z M ${pt(CX - ri, CY)} A ${ri} ${ri} 0 1 0 ${pt(CX + ri, CY)} A ${ri} ${ri} 0 1 0 ${pt(CX - ri, CY)} Z"></path>${numeral(...polar(-90, rm), 0, true)}`
  const step = 360 / n
  const gap = 2.4
  const tip = 7
  for (let k = 0; k < n; k++) {
    const a0 = startAngle(n) + k * step + gap / 2
    const a1 = a0 + step - gap
    const large = a1 - a0 > 180 ? 1 : 0
    // each segment ends in a point and begins with the notch that takes the one before it: the ring turns clockwise
    const d = [`M ${pt(...polar(a0, ro))}`, `A ${ro} ${ro} 0 ${large} 1 ${pt(...polar(a1, ro))}`, `L ${pt(...polar(a1 + tip, rm))}`, `L ${pt(...polar(a1, ri))}`, `A ${ri} ${ri} 0 ${large} 0 ${pt(...polar(a0, ri))}`, `L ${pt(...polar(a0 + tip, rm))}`, 'Z'].join(' ')
    const op = tint(k, n)
    out.push(`<path ${fill('f-accent', op)} d="${d}"></path>${numeral(...polar(midAngle(k, n) + tip / 2, rm), k, op >= 0.6)}`)
  }
  return out.join('')
}

const VENN_FILLS = ['f-accent', 'f-accent-2', 'f-accent-3', 'f-accent-4', 'f-accent-deep']

function venn(n: number): string {
  const r = 150 - 8 * n
  const d = n === 1 ? 0 : 224 - r
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const a = midAngle(k, n)
    out.push(`<circle class="${VENN_FILLS[k % VENN_FILLS.length]}" fill-opacity="0.5" cx="${r1(polar(a, d)[0])}" cy="${r1(polar(a, d)[1])}" r="${r}"></circle>`)
  }
  // the numerals above every circle, so no overlap covers one
  for (let k = 0; k < n; k++) out.push(numeral(...polar(midAngle(k, n), d + r * 0.52), k, false))
  return out.join('')
}

function hub(n: number): string {
  const centre = 92
  const dist = 178
  const r = 46
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const a = midAngle(k, n)
    const [x1, y1] = polar(a, centre + 6)
    const [x2, y2] = polar(a, dist - r - 6)
    out.push(`<line class="s-fg" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"></line>`)
  }
  out.push(`<circle class="f-accent" cx="${CX}" cy="${CY}" r="${centre}"></circle>`)
  for (let k = 0; k < n; k++) {
    const [x, y] = polar(midAngle(k, n), dist)
    out.push(`<circle class="f-accent" fill-opacity="0.3" cx="${r1(x)}" cy="${r1(y)}" r="${r}"></circle>${numeral(x, y, k, false)}`)
  }
  return out.join('')
}

/** The pillars' measures, shared with the stylesheet: the row of pillars runs from 40 to 1112, 28 apart. */
function pillars(n: number): string {
  const left = 40
  const right = W - 40
  const gap = 28
  const top = 124
  const bottom = 418
  const w = (right - left - (n - 1) * gap) / n
  const out: string[] = [`<polygon class="f-accent" points="${pt(0, 104)} ${pt(CX, 6)} ${pt(W, 104)}"></polygon>`]
  for (let k = 0; k < n; k++) out.push(`<rect class="f-surface" x="${r1(left + k * (w + gap))}" y="${top}" width="${r1(w)}" height="${bottom - top}"></rect>`)
  out.push(`<rect class="f-accent" fill-opacity="0.3" x="0" y="438" width="${W}" height="26"></rect>`)
  return out.join('')
}

const DRAW: Record<DiagramShape, (n: number) => string> = { pyramid, cycle, venn, onion, pillars, hub }

export const isDiagramShape = (s: string): s is DiagramShape => (DIAGRAM_SHAPES as readonly string[]).includes(s)
/** The number of entries a drawing is made for: at least one, at most DIAGRAM_MAX. */
export const diagramCount = (entries: number): number => Math.min(DIAGRAM_MAX, Math.max(1, Math.floor(entries) || 1))

/** The drawing of a shape for a number of entries, as inline SVG in the theme's classes. */
export function diagramSvg(shape: DiagramShape, entries: number): string {
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${DRAW[shape](diagramCount(entries))}</svg>`
}

/** The classes of a diagram's box: the shape and the number of entries the stylesheet places the words by. */
export const diagramClass = (shape: DiagramShape, entries: number): string => `diagram ${shape} n-${diagramCount(entries)}`

// A diagram holds no div (a list, a paragraph, the drawing), so its end is the next closing div.
const BOX = /<div class="([^"]*)">((?:(?!<\/?div\b)[\s\S])*)<\/div>/g

/**
 * A slide's markup with every diagram drawn: the drawing made anew from the shape and the entries, the count
 * written into the box's classes. Markup that was sanitised comes in; a drawing that is there already (stored
 * with the slide, or written by hand) is replaced, so it can never differ from its entries.
 */
export function drawDiagrams(html: string): string {
  if (!html.includes('diagram')) return html
  return html.replace(BOX, (all, classes: string, inner: string) => {
    const list = classes.split(/\s+/).filter(Boolean)
    if (!list.includes('diagram')) return all
    const shape = list.find(isDiagramShape) ?? 'pyramid'
    const first = inner.indexOf('<svg')
    const last = inner.lastIndexOf('</svg>')
    const rest = first !== -1 && last > first ? inner.slice(0, first) + inner.slice(last + 6) : inner
    const entries = (rest.match(/<li\b/g) ?? []).length
    const others = list.filter((c) => c !== 'diagram' && !isDiagramShape(c) && !/^n-\d+$/.test(c))
    return `<div class="${[diagramClass(shape, entries), ...others].join(' ')}">${diagramSvg(shape, entries)}${rest.trim()}</div>`
  })
}
