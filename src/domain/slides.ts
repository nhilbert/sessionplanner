import type { Slide } from './types.ts'

/**
 * Slides (docs/slides.md): a slide is one <section class="slide LAYOUT"> in a small HTML subset. This sanitiser
 * keeps that subset and nothing else, on the server when a slide is written and in the browser before it is
 * rendered, so nothing a guest typed can run or load from elsewhere. It has no DOM: a tokenizer over the text,
 * an allowlist of elements and attributes, a stack that closes what was left open.
 */

const HTML_TAGS = new Set(['section', 'header', 'footer', 'div', 'span', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'strong', 'em', 'br', 'blockquote', 'cite', 'figure', 'figcaption', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'aside', 'code', 'pre', 'small', 'sub', 'sup'])
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc'])
/** Empty elements: never a closing tag. */
const VOID = new Set(['br', 'img'])
/** Elements that are dropped with everything inside them (anything not listed and not allowed is unwrapped: its text stays). */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'foreignobject', 'use', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'math', 'template', 'noscript', 'canvas', 'head', 'svg:style', 'animate', 'set', 'animatetransform', 'animatemotion', 'image', 'feimage'])

const GLOBAL_ATTRS = new Set(['class', 'role', 'aria-label', 'aria-hidden'])
const IMG_ATTRS = new Set(['src', 'alt', 'width', 'height'])
const SVG_ATTRS = new Set([
  'viewbox', 'preserveaspectratio', 'width', 'height', 'x', 'y', 'r', 'rx', 'ry', 'cx', 'cy', 'd', 'points', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'text-anchor', 'dominant-baseline', 'font-size', 'font-weight', 'font-family', 'letter-spacing', 'opacity', 'clip-rule',
])
/** Attribute names written the way SVG wants them (the author may have typed them in any case). */
const CANONICAL: Record<string, string> = { viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio' }

const ASSET = /^asset:[0-9a-f]{16,64}$/
const CLASS = /^[A-Za-z0-9_ -]*$/
const PAINT = /^(none|currentColor|transparent|#[0-9a-fA-F]{3,8}|var\(--[A-Za-z0-9-]+\))$/
const TRANSFORM = /^[a-zA-Z()\s\d.,-]+$/
const PATH = /^[MmZzLlHhVvCcSsQqTtAa\d\s.,eE+-]+$/
const NUMBERS = /^[\d\s.,eE%+-]+(px|em|%)?$/
const WORDS = /^[A-Za-z0-9 _.,:;!?()'"„“”’‘–—·/+&%-]*$/u

function okValue(name: string, value: string): boolean {
  if (value.length > 4000 || /[<>]/.test(value) || /url\(|javascript|expression|&#/i.test(value)) return false
  if (name === 'src') return ASSET.test(value)
  if (name === 'class') return CLASS.test(value)
  if (name === 'fill' || name === 'stroke') return PAINT.test(value)
  if (name === 'transform') return TRANSFORM.test(value)
  if (name === 'd' || name === 'points') return PATH.test(value)
  if (name === 'alt' || name === 'aria-label' || name === 'font-family') return value.length <= 300
  if (name === 'role' || name === 'aria-hidden' || name === 'text-anchor' || name === 'dominant-baseline' || name === 'stroke-linecap' || name === 'stroke-linejoin' || name === 'fill-rule' || name === 'clip-rule' || name === 'preserveaspectratio' || name === 'font-weight') return /^[a-zA-Z0-9 -]{1,40}$/.test(value)
  return NUMBERS.test(value) || WORDS.test(value)
}

const TAG = /<!--[\s\S]*?-->|<!--[\s\S]*$|<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>|<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const escapeText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The slide's markup reduced to the format: allowed elements and attributes only, well-formed, nothing executable. */
export function sanitizeSlide(html: string): string {
  const out: string[] = []
  const stack: string[] = []
  let dropDepth = 0
  let dropTag = ''
  let last = 0
  let inSvg = 0
  const emitText = (text: string) => {
    if (!text || dropDepth) return
    out.push(escapeText(text))
  }
  for (const m of html.matchAll(TAG)) {
    emitText(html.slice(last, m.index))
    last = m.index + m[0].length
    if (m[0].startsWith('<!--')) continue
    const closing = m[1]?.toLowerCase()
    if (closing) {
      if (dropDepth) {
        if (closing === dropTag) dropDepth--
        continue
      }
      const at = stack.lastIndexOf(closing)
      if (at === -1) continue
      // Close what was left open inside it, then the element itself.
      while (stack.length > at) {
        const tag = stack.pop()!
        if (tag === 'svg') inSvg--
        out.push(`</${tag}>`)
      }
      continue
    }
    const raw = m[2].toLowerCase()
    const selfClosing = m[4] === '/'
    if (dropDepth) {
      if (raw === dropTag && !selfClosing) dropDepth++
      continue
    }
    if (DROP.has(raw) || (inSvg && raw === 'style')) {
      if (!selfClosing) {
        dropDepth = 1
        dropTag = raw
      }
      continue
    }
    const allowed = inSvg ? SVG_TAGS.has(raw) : HTML_TAGS.has(raw) || raw === 'svg'
    if (!allowed) continue // unwrapped: the element is gone, its text stays
    const attrs: string[] = []
    for (const a of (m[3] ?? '').matchAll(ATTR)) {
      const name = a[1].toLowerCase()
      const value = a[2] ?? a[3] ?? a[4] ?? ''
      const permitted = GLOBAL_ATTRS.has(name) || (raw === 'img' && IMG_ATTRS.has(name)) || (inSvg || raw === 'svg' ? SVG_ATTRS.has(name) : false)
      if (!permitted || !okValue(name, value)) continue
      attrs.push(`${CANONICAL[name] ?? name}="${value.replace(/"/g, '&quot;')}"`)
    }
    const open = `<${raw}${attrs.length ? ' ' + attrs.join(' ') : ''}`
    if (VOID.has(raw)) {
      out.push(`${open}>`)
      continue
    }
    if (inSvg && selfClosing) {
      // Written out in full: the self-closing form only works inside SVG, and the host may re-parse the markup as HTML.
      out.push(`${open}></${raw}>`)
      continue
    }
    out.push(`${open}>`)
    stack.push(raw)
    if (raw === 'svg') inSvg++
  }
  emitText(html.slice(last))
  while (stack.length) out.push(`</${stack.pop()}>`)
  return out.join('').trim()
}

/** A slide as stored: sanitised, and always one section.slide at the root. */
export function normalizeSlideHtml(html: string): string {
  const clean = sanitizeSlide(html)
  return /^<section class="slide[ "]/.test(clean) ? clean : `<section class="slide list">${clean}</section>`
}

/** The assets a slide shows (content hashes). */
export const slideAssets = (html: string): string[] => [...new Set([...html.matchAll(/asset:([0-9a-f]{16,64})/g)].map((m) => m[1]))]

/** The slide's layout (the second class of its root), or "" when it has none. */
export const slideLayout = (html: string): string => /^<section class="slide ([A-Za-z0-9_-]+)/.exec(html)?.[1] ?? ''

/** The text of a slide for searching and captions: tags removed, whitespace folded. */
export const slideText = (html: string): string =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/** The first heading of a slide, else its first words. */
export function slideTitle(html: string): string {
  const h = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/.exec(html) ?? /<p class="big"[^>]*>([\s\S]*?)<\/p>/.exec(html)
  const text = slideText(h ? h[1] : html)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

/** The markup with asset references turned into addresses the host can load. */
export const renderSlideHtml = (html: string, url: (hash: string) => string): string => html.replace(/src="asset:([0-9a-f]{16,64})"/g, (_, hash: string) => `src="${url(hash)}"`)

/** Escapes text for a slide the host generates. */
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const newSlides = (slides: Slide[], newId: () => string): Slide[] => slides.map((s) => ({ ...s, id: newId() }))
