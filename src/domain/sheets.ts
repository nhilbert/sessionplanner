import { sanitizeSlide } from './slides.ts'
import { diagramSvg, isDiagramShape } from './diagram.ts'
import type { Worksheet } from './types.ts'

/**
 * Worksheets (docs/worksheets.md, sections 4 and 5): a page is one <section class="sheet"> (or "sheet landscape") in
 * the same HTML subset as slides, sanitised by the same allowlist on write and on render. The page holds a header and
 * a stack of building blocks; src/worksheets/sheets.css gives them their look. A circle is drawn here from the number
 * of its entries, as slide diagrams are (diagram.ts), so the drawing is right whoever wrote the page.
 */

export type SheetBlockGroup = 'read' | 'instruct' | 'write' | 'order' | 'rate' | 'plan' | 'picture' | 'page'

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
  // stage 4b
  { block: 'note', group: 'read', use: 'a note to remember: text set apart by a rule in the accent', example: '<div class="block note"><h3>Merke</h3><p>…</p></div>' },
  { block: 'facts', group: 'instruct', use: "the step's facts – duration, method, material – filled in by the app from the step", example: '<p class="block facts"></p>' },
  { block: 'starters', group: 'write', use: 'sentence starters, each continued on its line (lines-N adds lines below)', example: '<ul class="block starters lines-2"><li>Mir ist wichtig, dass …</li><li>Ich wünsche mir …</li></ul>' },
  { block: 'matrix', group: 'order', use: 'a 2 × 2 with an axis up and an axis across, a field per quarter', example: '<div class="block matrix h-100"><p class="y">Wichtigkeit</p><p class="x">Dringlichkeit</p><div class="field"><p class="prompt">…</p></div><div class="field"></div><div class="field"></div><div class="field"></div></div>' },
  { block: 'timeline', group: 'order', use: 'a timeline across the page: marks with labels, room to write above them', example: '<ol class="block timeline h-40"><li>Mo</li><li>Di</li><li>Mi</li></ol>' },
  { block: 'shape', group: 'order', use: "a diagram shape of the slides, empty to fill in (pyramid, cycle, venn, onion, pillars, hub), its entries listed below; one per <li>", example: '<div class="block shape pyramid h-80"><ol><li></li><li></li><li></li></ol></div>', modifiers: ['pyramid', 'cycle', 'venn', 'onion', 'pillars', 'hub'] },
  { block: 'scale', group: 'rate', use: 'scales from 0 to 10 (s5: 1 to 5) with words at both ends, one per row', example: '<div class="block scale"><div class="rate"><p class="label">Energie</p><p class="low">leer</p><p class="high">voll</p></div></div>', modifiers: ['s5'] },
  { block: 'selftest', group: 'rate', use: 'a self-test: statements, a box per answer column, and a sum', example: '<div class="block selftest"><ul class="head"><li>nie</li><li>selten</li><li>oft</li><li>immer</li></ul><ol class="items"><li>Ich …</li></ol><p class="sum">Summe: ___</p></div>' },
  { block: 'ifthen', group: 'plan', use: 'if-then plans: a situation and what I will do then, each on its line', example: '<div class="block ifthen"><div class="plan"><p class="if">Wenn …</p><p class="then">dann …</p></div></div>' },
  // stage 4c: page kinds, as blocks
  { block: 'cards', group: 'page', use: 'cards to cut out: a grid with dashed cut lines, two columns (cols-3: three)', example: '<div class="block cards fill"><div class="card"><p class="big">Frage 1</p><p>…</p></div><div class="card"></div></div>', modifiers: ['cols-3'] },
  { block: 'certificate', group: 'page', use: 'a certificate in a double frame: small and large lines, a line for a name, lines to write, a stamp picture', example: '<div class="block certificate h-90"><p class="small">Hiermit erhält</p><p class="line"></p><p class="small">die</p><p class="big">Erlaubnis</p><div class="write lines-2"></div><img class="stamp" src="asset:…" alt=""></div>' },
  { block: 'figure', group: 'page', use: 'a picture in a frame with fields to write around it: the first above, the second beside it, more below', example: '<div class="block figure h-140"><figure><img src="asset:…" alt=""><figcaption>…</figcaption></figure><div class="field"><p class="prompt">…</p></div><div class="field"><p class="prompt">…</p></div></div>' },
  { block: 'placemat', group: 'page', use: 'a placemat for a group (best on A3): a field in the middle, four seats around it, each written towards its side', example: '<div class="block placemat"><div class="middle"><p class="prompt">Gemeinsam</p></div><div class="seat"></div><div class="seat"></div><div class="seat"></div><div class="seat"></div></div>' },
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

/** The points of a scale: 0 to 10, or 1 to 5. */
export const scalePoints = (five: boolean): string => `<div class="points drawn">${(five ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((n) => `<span>${n}</span>`).join('')}</div>`

/**
 * What the app draws into a page from its entries, wherever the page came from: a circle's segments, an empty diagram
 * shape (the slides' drawing, its numerals the entries' numbers) and the points of a scale. A drawing already there
 * is replaced, so it always follows the entries.
 */
export function drawCircles(html: string): string {
  let out = ''
  let at = 0
  for (const m of html.matchAll(/<div class="([^"]*)">/g)) {
    if (m.index < at) continue
    const classes = m[1].split(/\s+/)
    if (classes[0] !== 'block' || !['circle', 'shape', 'scale'].includes(classes[1])) continue
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
    const inner = html.slice(start, end).replace(/<svg class="drawn"[\s\S]*?<\/svg>/g, '').replace(/<div class="points drawn">[\s\S]*?<\/div>/g, '')
    const entries = (inner.match(/<li\b/g) ?? []).length
    if (classes[1] === 'circle') out += html.slice(at, start) + circleSvg(entries || 4) + inner
    else if (classes[1] === 'shape') {
      const form = classes.slice(2).find(isDiagramShape) ?? 'pyramid'
      out += html.slice(at, start) + diagramSvg(form, entries || 3).replace('<svg ', '<svg class="drawn" ') + inner
    } else {
      // a scale: its points after each row's label
      const points = scalePoints(classes.includes('s5'))
      out += html.slice(at, start) + inner.replace(/(<div class="rate">(?:<p class="label">[\s\S]*?<\/p>)?)/g, `$1${points}`)
    }
    at = end
  }
  return out + html.slice(at)
}

/**
 * A page as stored and as rendered: sanitised, its circles drawn, exactly one section.sheet. Markup after the root
 * is dropped; markup without one is wrapped in a portrait page.
 */
export function normalizeSheetHtml(html: string): string {
  // the root's classes in the order the format reads them: "landscape sheet" is a page too
  const clean = drawCircles(sanitizeSlide(html)).replace(/^<section class="([^"]*)"/, (m, cls: string) => {
    const names = cls.split(/\s+/).filter(Boolean)
    return names.includes('sheet') && names[0] !== 'sheet' ? `<section class="${['sheet', ...names.filter((n) => n !== 'sheet')].join(' ')}"` : m
  })
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
  return [...html.matchAll(/<(?:div|ol|ul|dl|table|figure|p) class="block ([A-Za-z0-9_-]+)/g)].map((m) => m[1])
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
  const open = /<section\b[^>]*class="(?:[^"]*\s)?sheet(?:\s[^"]*)?"[^>]*>/gi
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

/** The words of a step's facts line, in the app's language. */
export interface FactWords {
  duration: string
  method: string
  material: string
}

/** A step's facts for the facts block of its worksheets: "Dauer 45 Min. · Methode: Kartenabfrage · Material: Flipchart, Karten". */
export function stepFacts(step: { duration: number; method: string; materials: { label: string; qty: number }[] }, w: FactWords, formatDuration: (min: number) => string): string {
  const parts: string[] = []
  if (step.duration > 0) parts.push(`${w.duration} ${formatDuration(step.duration)}`)
  if (step.method.trim()) parts.push(`${w.method}: ${step.method.trim()}`)
  const material = step.materials.map((m) => (m.qty > 1 ? `${m.qty} × ${m.label.trim()}` : m.label.trim())).filter(Boolean)
  if (material.length) parts.push(`${w.material}: ${material.join(', ')}`)
  return parts.join(' · ')
}
