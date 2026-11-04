import type { DeckSlideRef } from '@/domain/deck'
import { type ExportOptions, docLang, standaloneDeck } from '../export'
import { createStage } from '../stage'
import { type PdfPage, type PdfWord, writePdf } from './pdf'

/**
 * The deck as a PDF file (docs/slides.md, section 5a), made in the page without the print dialog: every slide is
 * drawn by the browser itself – the self-contained slide of the HTML export inside an SVG picture, painted onto a
 * canvas at twice the design size – so the page looks exactly like the slide; the words are laid over it as
 * invisible text, so the file can be searched and copied from.
 */

const SCALE = 2
const W = 1280
const H = 720

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('slide could not be drawn'))
    img.src = src
  })

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

/**
 * The SVG around a slide, as the two ends of a data address: the stylesheet (with its fonts, often megabytes) is
 * written out and encoded once per deck, only the slide's own markup per slide.
 */
function svgFrame(css: string): { head: string; tail: string } {
  const style = document.createElement('style')
  style.textContent = css
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;overflow:hidden;position:relative">${new XMLSerializer().serializeToString(style)}`
  return { head: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(head)}`, tail: encodeURIComponent('</div></foreignObject></svg>') }
}

/** One slide as a JPEG of twice its design size: its markup and the deck's stylesheet in an SVG foreignObject. */
async function rasterize(section: string, theme: string, frameEnds: { head: string; tail: string }): Promise<Uint8Array> {
  // XHTML for the foreignObject: built as HTML, written out as XML
  const root = document.createElement('div')
  root.className = 'slide-root'
  root.dataset.theme = theme
  root.innerHTML = section
  // a data address, not a blob: browsers keep a canvas readable after drawing an SVG picture from one
  const img = await loadImage(frameEnds.head + encodeURIComponent(new XMLSerializer().serializeToString(root)) + frameEnds.tail)
  await img.decode().catch(() => undefined)
  // the fonts and pictures inside the SVG are data too; one more frame lets the browser finish laying it out
  await frame()
  const canvas = Object.assign(document.createElement('canvas'), { width: W * SCALE, height: H * SCALE })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // a browser that taints the canvas here (older WebKit) throws a SecurityError; the deck tab falls back to printing
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('slide could not be drawn')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Whether an element shows: visible and not transparent, itself or through an ancestor up to the slide. */
function visible(el: Element, slide: Element): boolean {
  if (getComputedStyle(el).visibility === 'hidden') return false
  for (let e: Element | null = el; e && e !== slide.parentElement; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) === 0) return false
  return true
}

/** The words of a slide laid out on the stage, with their boxes and font sizes. */
function wordsOf(slide: HTMLElement): PdfWord[] {
  const origin = slide.getBoundingClientRect()
  const words: PdfWord[] = []
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const hidden = new Map<Element, boolean>()
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement
    if (!parent || parent.closest('svg')) continue
    // invisible text stays out of the text layer: hidden, or transparent itself or through an ancestor
    if (hidden.get(parent) ?? hidden.set(parent, !visible(parent, slide)).get(parent)) continue
    const size = parseFloat(getComputedStyle(parent).fontSize) || 16
    for (const m of node.data.matchAll(/\S+/g)) {
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      // a word broken across lines (a hyphen, a slash) has a box per line; the text goes with the first
      const r = [...range.getClientRects()].find((b) => b.width > 0 && b.height > 0)
      if (!r) continue
      const x = r.left - origin.left
      const y = r.top - origin.top
      if (x + r.width < 0 || y + r.height < 0 || x > W || y > H) continue
      words.push({ text: m[0], x, y, w: r.width, h: r.height, size })
    }
  }
  return words
}

export async function exportDeckPdf(deck: DeckSlideRef[], options: ExportOptions & { onProgress?: (done: number, of: number) => void }): Promise<Blob> {
  const { css, sections } = await standaloneDeck(deck, options)
  const stage = createStage(options.theme)
  const frameEnds = svgFrame(css)
  const pages: PdfPage[] = []
  try {
    for (const [i, section] of sections.entries()) {
      stage.root.innerHTML = section
      const slide = stage.root.querySelector<HTMLElement>(':scope > section.slide')
      await Promise.all([...stage.root.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
      await document.fonts.ready
      const words = slide ? wordsOf(slide) : []
      pages.push({ jpeg: await rasterize(section, options.theme, frameEnds), width: W * SCALE, height: H * SCALE, words })
      options.onProgress?.(i + 1, sections.length)
    }
  } finally {
    stage.remove()
  }
  const bytes = await writePdf(pages, { title: options.title, lang: docLang(options.lang) })
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
