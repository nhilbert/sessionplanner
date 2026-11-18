import { sanitizeSlide } from './slides.ts'
import type { Worksheet } from './types.ts'

/**
 * Worksheets (docs/worksheets.md, sections 4 and 5): a page is one <section class="sheet"> (or "sheet landscape") in
 * the same HTML subset as slides, sanitised by the same allowlist on write and on render. The page holds a header and
 * a stack of building blocks; src/worksheets/sheets.css gives them their look. A circle is drawn here from the number
 * of its entries, as slide diagrams are (diagram.ts), so the drawing is right whoever wrote the page.
 */

export type SheetBlockGroup = 'read' | 'instruct' | 'write' | 'order' | 'rate' | 'plan' | 'picture'

export interface SheetBlockDoc {
  block: string
  group: SheetBlockGroup
  /** What it is for, in one line. */
  use: string
  /** Its markup, as an author writes it. */
  example: string
  /** Modifier classes it takes, besides h-N, lines-N and fill. */
  modifiers?: string[]
}

/** The block catalogue (v1): what stage 1 builds. Section 5 of docs/worksheets.md lists what follows. */
export const SHEET_BLOCKS: SheetBlockDoc[] = [
  { block: 'text', group: 'read', use: 'paragraphs, headings (h2, h3) and lists', example: '<div class="block text"><h3>Teil 1</h3><p>…</p><ul><li>…</li></ul></div>', modifiers: ['loose'] },
  { block: 'terms', group: 'read', use: 'terms and their explanation, side by side', example: '<dl class="block terms"><dt>Achtsamkeit</dt><dd>…</dd></dl>', modifiers: ['wide'] },
  { block: 'columns', group: 'read', use: 'a long list in two or three columns, with optional section headings and running numbers', example: '<div class="block columns cols-2 numbered"><h3>Körper</h3><ul><li>…</li></ul></div>', modifiers: ['cols-3', 'numbered', 'small'] },
  { block: 'table', group: 'read', use: 'a table, also with empty rows to fill in', example: '<table class="block table tall"><thead><tr><th>…</th></tr></thead><tbody><tr><td></td></tr></tbody></table>', modifiers: ['boxed', 'tall'] },
  { block: 'steps', group: 'instruct', use: 'the steps of an exercise: title, hint, optional time; numbered across the page', example: '<ol class="block steps"><li><h3>Austausch <span class="time">10 min</span></h3><p class="hint">…</p></li></ol>', modifiers: ['plain', 'tight'] },
  { block: 'question', group: 'write', use: 'a question with writing lines (lines-N) or free space (h-N)', example: '<div class="block question lines-3"><h3>Was nehme ich mit?</h3><p class="hint">…</p></div>', modifiers: ['numbered', 'pitch-l', 'pitch-xl'] },
  { block: 'box', group: 'write', use: 'a framed field with a prompt', example: '<div class="block box h-40"><p class="prompt">Unsere Stimme sagt jetzt:</p></div>', modifiers: ['round'] },
  { block: 'grid', group: 'order', use: 'a grid of fields: two, three, 2 × 2, one wide over 2 × 2', example: '<div class="block grid g-2x2 h-120"><div class="field"><p class="prompt">…</p></div></div>', modifiers: ['g-2', 'g-3', 'g-2x2', 'g-wide', 'narrow', 'ruled'] },
  { block: 'rows', group: 'order', use: 'framed rows with a label on the left and room to write', example: '<div class="block rows fill"><div class="row"><h3>Fakten</h3><p class="prompt">…</p></div></div>' },
  { block: 'circle', group: 'order', use: 'a circle with segments and an open middle; one segment per entry', example: '<div class="block circle h-120"><ol><li></li><li></li><li></li><li></li></ol><p class="middle"><span class="blank"></span> Std.</p></div>' },
  { block: 'criteria', group: 'rate', use: 'criteria rows with a value and columns of notes', example: '<div class="block criteria fill"><div class="crit"><p class="label">Einschätzung</p><span class="score">/10</span><h3>Optimismus</h3><p class="note">Ressourcen …</p></div></div>' },
  { block: 'ticks', group: 'plan', use: 'lines with a box to tick', example: '<ul class="block ticks"><li></li><li></li><li></li></ul>', modifiers: ['no-lines', 'cols-2', 'pitch-l'] },
  { block: 'write', group: 'write', use: 'writing room on its own (lines-N, h-N, fill); also inside a step, field or row', example: '<div class="block write lines-4"></div>' },
  { block: 'picture', group: 'picture', use: 'a picture with an optional caption', example: '<figure class="block picture right h-60"><img src="asset:…" alt=""><figcaption>…</figcaption></figure>', modifiers: ['left', 'right'] },
  { block: 'pictures', group: 'picture', use: 'pictures in a row, each with a caption', example: '<div class="block pictures h-45"><figure><img src="asset:…" alt=""><figcaption>…</figcaption></figure></div>', modifiers: ['contain'] },
  { block: 'pair', group: 'picture', use: 'two columns of blocks side by side', example: '<div class="block pair r-2-1"><div>…blocks…</div><div>…blocks…</div></div>', modifiers: ['r-2-1', 'r-1-2', 'r-3-2', 'bottom'] },
]

export const SHEET_BLOCK_NAMES: string[] = SHEET_BLOCKS.map((b) => b.block)

/** The most segments a circle draws. */
export const CIRCLE_MAX = 12

const r1 = (x: number): string => String(Math.round(x * 100) / 100)

/** The drawing of a circle with `n` segments: outer ring, spokes and the open middle, in a 100 × 100 box. */
export function circleSvg(n: number): string {
  const count = Math.min(CIRCLE_MAX, Math.max(2, Math.floor(n) || 4))
  const outer = 49.5
  const hub = 15
  const spokes: string[] = []
  for (let k = 0; k < count; k++) {
    const a = ((-90 + (k * 360) / count) * Math.PI) / 180
    spokes.push(`<line class="spoke" x1="${r1(50 + hub * Math.cos(a))}" y1="${r1(50 + hub * Math.sin(a))}" x2="${r1(50 + outer * Math.cos(a))}" y2="${r1(50 + outer * Math.sin(a))}"></line>`)
  }
  return `<svg class="drawn" viewBox="0 0 100 100" aria-hidden="true"><circle class="outer" cx="50" cy="50" r="${outer}"></circle>${spokes.join('')}<circle class="hub" cx="50" cy="50" r="${hub}"></circle></svg>`
}

/** Every circle block drawn from its entries (one segment per <li>; four without a list); a drawing already there is replaced. */
export function drawCircles(html: string): string {
  let out = ''
  let at = 0
  for (const m of html.matchAll(/<div class="([^"]*)">/g)) {
    if (m.index < at) continue
    const classes = m[1].split(/\s+/)
    if (!classes.includes('circle')) continue
    // The sanitiser's output is well-formed: the block ends where its <div>s balance.
    const start = m.index + m[0].length
    let depth = 1
    let end = html.length
    for (const t of html.slice(start).matchAll(/<(\/?)div\b[^>]*>/g)) {
      depth += t[1] ? -1 : 1
      if (depth === 0) {
        end = start + t.index
        break
      }
    }
    const inner = html.slice(start, end).replace(/<svg class="drawn"[\s\S]*?<\/svg>/g, '')
    const entries = (inner.match(/<li\b/g) ?? []).length
    out += html.slice(at, start) + circleSvg(entries || 4) + inner
    at = end
  }
  return out + html.slice(at)
}

/**
 * A page as stored and as rendered: sanitised, its circles drawn, exactly one section.sheet. Markup after the root
 * is dropped; markup without one is wrapped in a portrait page.
 */
export function normalizeSheetHtml(html: string): string {
  const clean = drawCircles(sanitizeSlide(html))
  if (!/^<section class="sheet[ "]/.test(clean)) return `<section class="sheet">${clean}</section>`
  let depth = 0
  for (const m of clean.matchAll(/<(\/?)section\b[^>]*>/g)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return clean.slice(0, m.index + m[0].length)
  }
  return clean
}

/** Whether a page is landscape. */
export const isLandscape = (html: string): boolean => /^<section class="sheet\b[^"]*\blandscape\b/.test(html)

/** The blocks of a page, in order: the second class of each top-level block. */
export function sheetBlocks(html: string): string[] {
  return [...html.matchAll(/<(?:div|ol|ul|dl|table|figure) class="block ([A-Za-z0-9_-]+)/g)].map((m) => m[1])
}

/** At most this many worksheets on a step, and pages on a sheet. */
export const MAX_WORKSHEETS = 10
export const MAX_SHEET_PAGES = 8

/** Copies of worksheets with ids of their own (a duplicate, an inserted library entry); the content stays as it is. */
export const newWorksheets = (sheets: Worksheet[], newId: () => string): Worksheet[] => sheets.map((w) => ({ ...w, id: newId(), pages: w.pages.map((p) => ({ ...p, id: newId() })) }))

/** The pictures the pages of worksheets show (content hashes). */
export const worksheetAssets = (sheets: Worksheet[]): string[] => [...new Set(sheets.flatMap((w) => w.pages.flatMap((p) => [...p.html.matchAll(/asset:([0-9a-f]{16,64})/g)].map((m) => m[1]))))]

/**
 * The pages of a source text: every <section class="sheet…"> … </section> is a page, in order; text without one is
 * one page. Used where a sheet is written as one text (the source field, the connector).
 */
export function splitPages(source: string): string[] {
  const pages: string[] = []
  const open = /<section\b[^>]*class="sheet\b[^"]*"[^>]*>/gi
  const starts = [...source.matchAll(open)].map((m) => m.index)
  if (!starts.length) return source.trim() ? [source.trim()] : []
  starts.forEach((at, i) => pages.push(source.slice(at, starts[i + 1] ?? source.length).trim()))
  return pages
}

/** The rules of the worksheet format, for agents writing pages (the connector's worksheet_format, the sheet-build skill). */
export const SHEET_FORMAT = {
  page: 'One page is <section class="sheet"> (portrait) or <section class="sheet landscape">. A sheet has 1 to 8 pages on one paper size (A4, A3, A5); write several pages one after the other.',
  header: '<header> with <div class="eyebrow"> (kicker, e.g. "Arbeitsblatt Transfer"), <h1> (title), up to two <p class="lead">, optionally a small <figure><img src="asset:…" alt=""></figure> at its right.',
  blocks: 'Under the root only blocks: an element with class="block NAME" (NAME from blocks below) and modifiers. Blocks stack from the top; one block with fill takes the rest of the page.',
  sizes: 'Heights and writing room are classes, never values: h-N (N mm: 10 15 20 25 30 35 40 45 50 60 70 80 90 100 120 140), lines-N (writing lines: 1-10, 12, 15), fill. Line pitch 9 mm; pitch-l 12 mm, pitch-xl 24 mm (posters). Picture widths w-N (20 30 40 50 60 70 80 100 120).',
  inline: 'A blank inside a sentence: <span class="blank"></span> (short, long); a line of its own: <p class="fill-in">Label: <span class="blank"></span></p>. Hints under a heading: <p class="hint">. Prompts in frames: <p class="prompt">. Quiet text: class quiet.',
  formatting: 'By hand, as on slides: span or heading classes fs-xs fs-s fs-l fs-xl, accent, muted, fw-normal; strong, em.',
  host: 'Do not write the logo, the footer, the date or page numbers: the app adds them. Do not number steps or questions by hand: steps and question.numbered count across the page.',
  forbidden: 'As on slides: no style, id, script, event attributes, external addresses. Pictures only as asset:<hash> the workshop or library already shows.',
  fit: 'Nothing flows to the next page: content that does not fit is cut. Keep a page to what fits on paper; split long material into pages yourself.',
} as const
