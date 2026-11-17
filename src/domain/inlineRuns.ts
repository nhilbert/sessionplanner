import { type El, type Node, FORMAT_CLASS, el, formatTokens, txt } from './slideTree.ts'

/**
 * Inline content as runs (docs/slides.md, section 7, "On the slide"): the words of one text element as a flat list
 * of stretches, each with the formatting it carries, instead of nested elements. Formatting a part of the text is
 * then splitting the runs at its ends and changing those between; the elements are built again from the runs, always
 * nested the same way (span, strong, em, code), so what the editor writes is what the fields can read back.
 *
 * What the editor does not model inside a text (the tag of an exercise title, a small note, a nested list, sub and
 * sup) is an island: one position in the text, kept as it is.
 */

export type Size = 'xs' | 's' | 'l' | 'xl'
export type Color = 'accent' | 'accent-2' | 'accent-3' | 'accent-4' | 'title' | 'text' | 'muted'
/** The sizes from small to large; '' is the size the theme gives the text. */
export const SIZE_STEPS: (Size | '')[] = ['xs', 's', '', 'l', 'xl']
export const COLORS: Color[] = ['accent', 'accent-2', 'accent-3', 'accent-4', 'title', 'text', 'muted']

export interface Marks {
  /** Bold (strong), or `normal`: not bold where the theme sets the text bold (a heading). */
  weight?: 'bold' | 'normal'
  italic?: boolean
  code?: boolean
  size?: Size
  color?: Color
}
export type Run = { kind: 'text'; text: string; marks: Marks } | { kind: 'br' } | { kind: 'island'; node: Node }

/** What a formatting command changes; null takes a setting back to the theme's. */
export interface Patch {
  weight?: 'bold' | 'normal' | null
  italic?: boolean
  size?: Size | null
  color?: Color | null
  /** Everything back to the theme's (code stays: it says what the text is, not how it looks). */
  clear?: boolean
}

const isSize = (w: string): w is Size => w === 'xs' || w === 's' || w === 'l' || w === 'xl'
const isColor = (w: string): w is Color => (COLORS as string[]).includes(w)

/** Whether an element is formatting the runs model: strong, em, code, br, or a span of formatting classes. */
export const isFormatEl = (n: El): boolean => ['strong', 'b', 'em', 'i', 'code', 'br'].includes(n.tag) || formatTokens(n) !== null

export function nodesToRuns(nodes: Node[], marks: Marks = {}): Run[] {
  const out: Run[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      if (n.text) out.push({ kind: 'text', text: n.text, marks })
    } else if (n.tag === 'br') out.push({ kind: 'br' })
    else if (n.tag === 'strong' || n.tag === 'b') out.push(...nodesToRuns(n.children, { ...marks, weight: 'bold' }))
    else if (n.tag === 'em' || n.tag === 'i') out.push(...nodesToRuns(n.children, { ...marks, italic: true }))
    else if (n.tag === 'code') out.push(...nodesToRuns(n.children, { ...marks, code: true }))
    else {
      const words = formatTokens(n)
      if (!words) out.push({ kind: 'island', node: n })
      else out.push(...nodesToRuns(n.children, withWords(marks, words)))
    }
  }
  return out
}

/** The marks with the words of a span's braces applied (slideTree.ts, FORMAT_CLASS). */
export function withWords(marks: Marks, words: string[]): Marks {
  const next = { ...marks }
  for (const w of words) {
    if (isSize(w)) next.size = w
    else if (isColor(w)) next.color = w
    else if (w === 'normal') next.weight = 'normal'
  }
  return next
}

const spanClass = (m: Marks): string => [m.size && FORMAT_CLASS[m.size], m.color && FORMAT_CLASS[m.color], m.weight === 'normal' && FORMAT_CLASS.normal].filter(Boolean).join(' ')
const LEVELS: { key: (m: Marks) => string; make: (key: string, inner: Node[]) => Node }[] = [
  { key: spanClass, make: (key, inner) => el('span', { class: key }, inner) },
  { key: (m) => (m.weight === 'bold' ? 'b' : ''), make: (_, inner) => el('strong', {}, inner) },
  { key: (m) => (m.italic ? 'i' : ''), make: (_, inner) => el('em', {}, inner) },
  { key: (m) => (m.code ? 'c' : ''), make: (_, inner) => el('code', {}, inner) },
]

function wrap(seq: { text: string; marks: Marks }[], level: number): Node[] {
  if (level === LEVELS.length) return [txt(seq.map((r) => r.text).join(''))]
  const { key, make } = LEVELS[level]
  const out: Node[] = []
  for (let i = 0; i < seq.length; ) {
    const k = key(seq[i].marks)
    let j = i + 1
    while (j < seq.length && key(seq[j].marks) === k) j++
    const inner = wrap(seq.slice(i, j), level + 1)
    if (k) out.push(make(k, inner))
    else out.push(...inner)
    i = j
  }
  return out
}

/** The elements of the runs: a span for size, colour and "not bold" outermost, then strong, em, code. */
export function runsToNodes(runs: Run[]): Node[] {
  const out: Node[] = []
  const tidy = tidyRuns(runs)
  for (let i = 0; i < tidy.length; ) {
    const r = tidy[i]
    if (r.kind === 'br') out.push(el('br'))
    else if (r.kind === 'island') out.push(r.node)
    else {
      let j = i
      const seq: { text: string; marks: Marks }[] = []
      for (; j < tidy.length; j++) {
        const t = tidy[j]
        if (t.kind !== 'text') break
        seq.push(t)
      }
      out.push(...wrap(seq, 0))
      i = j
      continue
    }
    i++
  }
  return out
}

const marksKey = (m: Marks): string => `${spanClass(m)}|${m.weight === 'bold' ? 'b' : ''}|${m.italic ? 'i' : ''}|${m.code ? 'c' : ''}`
export const sameMarks = (a: Marks, b: Marks): boolean => marksKey(a) === marksKey(b)
const isBlankRun = (r: Run | undefined): boolean => !!r && r.kind === 'text' && r.text.trim() === ''

/**
 * Runs as they are written: empty ones dropped, neighbours with the same formatting joined, and a stretch of spaces
 * between two differently formatted words left plain (an element that holds only a space shows nothing).
 */
export function tidyRuns(runs: Run[]): Run[] {
  const list = runs.filter((r) => r.kind !== 'text' || r.text !== '')
  const loose = list.map((r, i): Run => {
    if (r.kind !== 'text' || !isBlankRun(r)) return r
    const prev = list[i - 1]
    const next = list[i + 1]
    const joins = (n: Run | undefined) => !!n && n.kind === 'text' && !isBlankRun(n) && sameMarks(n.marks, r.marks)
    return joins(prev) || joins(next) ? r : { kind: 'text', text: r.text, marks: r.marks.code ? { code: true } : {} }
  })
  const out: Run[] = []
  for (const r of loose) {
    const last = out[out.length - 1]
    if (r.kind === 'text' && last?.kind === 'text' && sameMarks(last.marks, r.marks)) out[out.length - 1] = { kind: 'text', text: last.text + r.text, marks: last.marks }
    else out.push(r)
  }
  return out
}

/** A line break and an island count as one position each. */
const runLength = (r: Run): number => (r.kind === 'text' ? r.text.length : 1)
export const runsLength = (runs: Run[]): number => runs.reduce((n, r) => n + runLength(r), 0)

function patched(marks: Marks, patch: Patch): Marks {
  let next: Marks = patch.clear ? (marks.code ? { code: true } : {}) : { ...marks }
  const set = <K extends keyof Marks>(k: K, v: Marks[K] | null | undefined) => {
    if (v === undefined) return
    if (v === null || v === false) {
      const { [k]: _gone, ...rest } = next
      void _gone
      next = rest
    } else next = { ...next, [k]: v }
  }
  set('weight', patch.weight)
  set('italic', patch.italic)
  set('size', patch.size)
  set('color', patch.color)
  return next
}

/** The runs with the formatting of the stretch from `start` to `end` changed (positions as `runsLength` counts them). */
export function formatRuns(runs: Run[], start: number, end: number, patch: Patch): Run[] {
  const out: Run[] = []
  let pos = 0
  for (const r of runs) {
    const len = runLength(r)
    const a = Math.max(start, pos)
    const b = Math.min(end, pos + len)
    if (r.kind !== 'text' || a >= b) out.push(r)
    else {
      if (a > pos) out.push({ kind: 'text', text: r.text.slice(0, a - pos), marks: r.marks })
      out.push({ kind: 'text', text: r.text.slice(a - pos, b - pos), marks: patched(r.marks, patch) })
      if (b < pos + len) out.push({ kind: 'text', text: r.text.slice(b - pos), marks: r.marks })
    }
    pos += len
  }
  return tidyRuns(out)
}

export interface RangeState {
  bold: boolean
  italic: boolean
  /** '' for the theme's; 'mixed' when the stretch has several. */
  size: Size | '' | 'mixed'
  color: Color | '' | 'mixed'
  /** Whether anything in the stretch is formatted by hand ("Remove formatting" has something to do). */
  formatted: boolean
}

/** What the words between `start` and `end` carry; `baseBold` says whether the theme sets the element bold. */
export function rangeState(runs: Run[], start: number, end: number, baseBold: boolean): RangeState {
  const marks: Marks[] = []
  let pos = 0
  for (const r of runs) {
    const len = runLength(r)
    if (r.kind === 'text' && r.text.trim() && Math.max(start, pos) < Math.min(end, pos + len)) marks.push(r.marks)
    pos += len
  }
  const common = <T extends string>(values: (T | undefined)[]): T | '' | 'mixed' => (new Set(values).size > 1 ? 'mixed' : (values[0] ?? ''))
  return {
    bold: marks.length > 0 && marks.every((m) => m.weight === 'bold' || (m.weight === undefined && baseBold)),
    italic: marks.length > 0 && marks.every((m) => !!m.italic),
    size: common(marks.map((m) => m.size)),
    color: common(marks.map((m) => m.color)),
    formatted: marks.some((m) => !!(m.weight || m.italic || m.size || m.color)),
  }
}

/** The patch that turns bold on or off for a stretch, given what the theme does with the element. */
export const boldPatch = (state: RangeState, baseBold: boolean): Patch => (state.bold ? { weight: baseBold ? 'normal' : null } : { weight: baseBold ? null : 'bold' })

/** One size step up or down from where the stretch stands (from the theme's size when it is mixed). */
export function sizePatch(state: RangeState, dir: 1 | -1): Patch {
  const at = SIZE_STEPS.indexOf(state.size === 'mixed' ? '' : state.size)
  const next = SIZE_STEPS[Math.max(0, Math.min(SIZE_STEPS.length - 1, at + dir))]
  return { size: next || null }
}

/**
 * Runs for editing: whitespace folded as the browser shows it (a run of spaces, tabs and line ends is one space;
 * none at the start of a line or after another space), so the text can be shown with its spaces kept. A no-break
 * space stays.
 */
export function foldSpaces(runs: Run[]): Run[] {
  const out: Run[] = []
  let spaced = true
  for (const r of runs) {
    if (r.kind !== 'text') {
      // spaces before a line break do not show
      const last = out[out.length - 1]
      if (r.kind === 'br' && last?.kind === 'text') out[out.length - 1] = { ...last, text: last.text.replace(/ +$/, '') }
      out.push(r)
      spaced = r.kind === 'br'
      continue
    }
    let text = r.text.replace(/[ \t\r\n\f]+/g, ' ')
    if (spaced) text = text.replace(/^ /, '')
    if (text) {
      out.push({ kind: 'text', text, marks: r.marks })
      spaced = text.endsWith(' ')
    }
  }
  const last = out[out.length - 1]
  if (last?.kind === 'text') out[out.length - 1] = { ...last, text: last.text.replace(/ +$/, '') }
  return tidyRuns(out)
}

/** Runs as they are stored: line breaks at the very start and end mean nothing. */
export function trimBreaks(runs: Run[]): Run[] {
  let a = 0
  let b = runs.length
  while (a < b && runs[a].kind === 'br') a++
  while (b > a && runs[b - 1].kind === 'br') b--
  return runs.slice(a, b)
}
