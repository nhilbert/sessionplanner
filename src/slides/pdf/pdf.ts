import { compress } from '../pptx/zip.ts'

/**
 * A PDF writer for the deck export, without a dependency: one 16:9 page per slide, the slide as a JPEG picture drawn
 * over the whole page, and the slide's words as invisible text at their places, so the file can be searched and its
 * text selected and copied. Fonts are not embedded: the invisible text uses Helvetica, one of the fonts every reader
 * has, scaled to each word's width.
 *
 * Coordinates are pixels of the 1280 × 720 design size; one pixel is 0.75 pt, the page 960 × 540 pt.
 */

export const PT_PER_PX = 0.75
const PAGE_W = 1280 * PT_PER_PX
const PAGE_H = 720 * PT_PER_PX

export interface PdfWord {
  text: string
  /** the word's box in px of the design size */
  x: number
  y: number
  w: number
  h: number
  /** the font size in px */
  size: number
}

export interface PdfPage {
  /** JPEG bytes of the slide */
  jpeg: Uint8Array
  /** the picture's size in pixels */
  width: number
  height: number
  words: PdfWord[]
}

/** Helvetica's advance widths (per 1000 units of the font size) for the printable ASCII characters. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/** The code points of Windows-1252 from 0x80 to 0x9F; the rest of Latin-1 maps to itself. */
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f }

/** A string in WinAnsiEncoding, the encoding of the standard fonts; characters it lacks become "?". */
export function winAnsi(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out.push(c)
    else if (CP1252[c]) out.push(CP1252[c])
    else if (c === 0x202f || c === 0x2009 || c === 0x2007) out.push(0x20)
    else out.push(0x3f)
  }
  return out
}

const widthOf = (bytes: number[]): number => bytes.reduce((n, b) => n + (b >= 0x20 && b <= 0x7e ? HELVETICA[b - 0x20] : 556), 0)

const hex = (bytes: number[]): string => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
const num = (n: number): string => (Math.round(n * 100) / 100).toString()

/** A text string for the document information: UTF-16BE with its byte order mark. */
function textString(s: string): string {
  let out = 'FEFF'
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${out}>`
}

/** The invisible text of a page: every word as wide and as high as on the slide. */
export function textLayer(words: PdfWord[]): string {
  const ops: string[] = []
  for (const w of words) {
    const bytes = winAnsi(w.text)
    const width = widthOf(bytes)
    if (!bytes.length || !width || w.w <= 0 || w.size <= 0) continue
    const size = w.size * PT_PER_PX
    const scale = ((w.w * PT_PER_PX) / ((width / 1000) * size)) * 100
    // the baseline: the middle of the word's box, lowered by a third of the font size
    const baseline = PAGE_H - (w.y + w.h / 2 + w.size * 0.33) * PT_PER_PX
    ops.push(`/F1 ${num(size)} Tf ${num(Math.min(Math.max(scale, 1), 1000))} Tz 1 0 0 1 ${num(w.x * PT_PER_PX)} ${num(baseline)} Tm <${hex(bytes)}> Tj`)
  }
  return ops.length ? `BT 3 Tr\n${ops.join('\n')}\nET\n` : ''
}

/** The bytes of the PDF: catalog, pages, the font, the document information, and per slide a page, its content and its picture. */
export async function writePdf(pages: PdfPage[], meta: { title: string; lang: string; created?: Date }): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, dict: string, stream?: Uint8Array) => {
    offsets[id] = length
    write(`${id} 0 obj\n${dict}\n`)
    if (stream) {
      write('stream\n')
      write(stream)
      write('\nendstream\n')
    }
    write('endobj\n')
  }
  // 1 catalog, 2 pages, 3 font, 4 information; then three objects per page
  const pageId = (i: number) => 5 + i * 3
  // the header, and a comment of bytes above 127 that marks the file as binary for transfer programs
  write('%PDF-1.7\n')
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  object(1, `<< /Type /Catalog /Pages 2 0 R /Lang ${textString(meta.lang)} /ViewerPreferences << /DisplayDocTitle true >> >>`)
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`)
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const d = (meta.created ?? new Date()).toISOString().replace(/[-:T]/g, '').slice(0, 14)
  object(4, `<< /Title ${textString(meta.title)} /Producer ${textString('Session Planner')} /CreationDate (D:${d}Z) >>`)
  for (const [i, page] of pages.entries()) {
    const id = pageId(i)
    const content = enc.encode(`q ${num(PAGE_W)} 0 0 ${num(PAGE_H)} 0 0 cm /Im0 Do Q\n${textLayer(page.words)}`)
    const packed = await compress(content, 'deflate')
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`)
    object(id + 1, `<< /Length ${(packed ?? content).length}${packed ? ' /Filter /FlateDecode' : ''} >>`, packed ?? content)
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`, page.jpeg)
  }
  const count = 5 + pages.length * 3
  const xref = length
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
