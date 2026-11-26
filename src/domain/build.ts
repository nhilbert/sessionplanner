/**
 * Builds (docs/slide-builds.md): a slide whose root carries the class `build` comes on in stages while it is
 * presented – its header first, then its points, cards or steps one after another. The layout knows its units: a
 * build is one switch of the slide, and what a stage is follows from the catalogue (docs/slides.md, section 3), never
 * from marks on single elements.
 *
 * This is the one place that says what the stages of a slide are. It reads the markup without a DOM, so the browser,
 * the server and the exported file agree: `buildOf` numbers the units of a slide (`data-b="2"` on an element that
 * comes with the second stage), and whoever shows the slide hides what is still to come (src/slides/build.ts).
 * The numbers are the host's, like the footer line: they are never stored, and the sanitiser would drop them.
 *
 * Stage 0 is the slide as it comes on: everything that is not a unit. A slide never comes on empty: where nothing
 * else stands (no header, no sentence, no picture), the first unit comes with the slide.
 */

/** The class beside the layout that makes a slide build: `<section class="slide cards build">`. */
export const BUILD_CLASS = 'build'

/** The attribute the host numbers a unit with: the stage it comes with, from 1. */
export const STAGE_ATTR = 'data-b'

/** One element of the slide, as far as the stages need it. */
interface Tag {
  tag: string
  cls: string[]
  kids: Tag[]
  up: Tag | null
  /** Where an attribute can be put into the markup: right after the tag's name. */
  at: number
  /** Whether the element itself shows something: words of its own, or a picture. */
  shows: boolean
}

const VOID = new Set(['br', 'img'])
// The sanitiser's output: every tag closed, attributes quoted, no comments (src/domain/slides.ts).
const TAG = /<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>|<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const CLASS = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/

/** The slide's root with the elements below it; null when the markup is no slide. */
function read(html: string): Tag | null {
  const top: Tag = { tag: '#', cls: [], kids: [], up: null, at: 0, shows: false }
  let cur = top
  let last = 0
  for (const m of html.matchAll(TAG)) {
    if (html.slice(last, m.index).trim()) cur.shows = true
    last = m.index + m[0].length
    if (m[1]) {
      const name = m[1].toLowerCase()
      let open: Tag | null = cur
      while (open && open.tag !== name) open = open.up
      if (open?.up) cur = open.up
      continue
    }
    const tag = m[2].toLowerCase()
    const found = CLASS.exec(m[3] ?? '')
    const node: Tag = { tag, cls: (found?.[1] ?? found?.[2] ?? '').split(/\s+/).filter(Boolean), kids: [], up: cur, at: m.index + 1 + m[2].length, shows: tag === 'img' || tag === 'svg' }
    cur.kids.push(node)
    if (!VOID.has(tag) && m[4] !== '/') cur = node
  }
  if (html.slice(last).trim()) cur.shows = true
  return top.kids.find((k) => k.tag === 'section' && k.cls.includes('slide')) ?? null
}

const kids = (of: Tag | undefined, tag: string, cls?: string): Tag[] => (of ? of.kids.filter((k) => k.tag === tag && (!cls || k.cls.includes(cls))) : [])
const kid = (of: Tag | undefined, tag: string, cls?: string): Tag | undefined => kids(of, tag, cls)[0]
/** The lists of an element, in the order they stand. */
const lists = (of: Tag | undefined, ...cls: string[]): Tag[] => (of ? of.kids.filter((k) => (k.tag === 'ul' || k.tag === 'ol') && cls.some((c) => k.cls.includes(c))) : [])
/** Every entry a stage of its own. */
const each = (hosts: Tag[], tag: string, cls?: string): Tag[][] => hosts.flatMap((h) => kids(h, tag, cls)).map((u) => [u])

/**
 * What comes one after another, per layout: the stages in reading order, each the elements that come together.
 * A layout that is not listed has nothing to build (title, break, closing, figure, model), or not yet (diagram and
 * matrix: their drawing and their fixed places come with a later stage of the work).
 */
const UNITS: Record<string, (root: Tag) => Tag[][]> = {
  // a point comes with its sub-points
  list: (r) => each(lists(r, 'list'), 'li'),
  section: (r) => each(lists(kid(r, 'div', 'text'), 'list'), 'li'),
  cards: (r) => each(kids(r, 'ul', 'cards'), 'li'),
  number: (r) => each(kids(r, 'ul', 'numbers'), 'li'),
  steps: (r) => each(kids(r, 'ol', 'flow'), 'li'),
  timeline: (r) => each(kids(r, 'ol', 'timeline'), 'li'),
  // the task and its facts stand; the steps come while they are explained
  exercise: (r) => each(kids(kid(r, 'div', 'exercise'), 'ol', 'steps'), 'li'),
  compare: (r) => each(kids(r, 'div', 'compare'), 'div', 'side'),
  acronym: (r) => each(kids(r, 'dl', 'acronym'), 'div'),
  canvas: (r) => each(kids(r, 'div', 'canvas'), 'div', 'box'),
  // the head stands; a table without a tbody has its head in the rows of th
  table: (r) => {
    const table = kid(r, 'table')
    const body = kid(table, 'tbody')
    // a head row is one of th alone: a row that begins with its label (th) and goes on with td is of the body
    return body ? each([body], 'tr') : kids(table, 'tr').filter((row) => !row.kids.every((c) => c.tag === 'th')).map((u) => [u])
  },
  agenda: (r) => each(lists(kid(r, 'div', 'cols') ?? r, 'agenda', 'blocks'), 'li'),
  // the picture stands; the text beside it comes block by block
  split: (r) => (kid(kid(r, 'div', 'split'), 'div', 'text')?.kids ?? []).map((u) => [u]),
  // the sentence stands; the line under it comes
  statement: (r) => each([kid(r, 'div', 'text')].filter((t): t is Tag => !!t), 'p', 'sub'),
  // the quotation stands; who said it comes as one
  quote: (r) => {
    const said = [...kids(kid(r, 'blockquote'), 'p', 'sub'), ...kids(r, 'cite')]
    return said.length ? [said] : []
  },
}

/** Whether anything shows outside the units and the author's footer: then the slide does not come on empty. */
function stands(node: Tag, units: Set<Tag>): boolean {
  if (units.has(node) || (node.tag === 'footer' && node.up?.tag === 'section')) return false
  return node.shows || node.kids.some((k) => stands(k, units))
}

function stagesIn(root: Tag): Tag[][] {
  if (!root.cls.includes(BUILD_CLASS)) return []
  // the layout is the first class that is neither `slide` nor `build`: "slide build cards" is a cards slide that builds
  const layout = root.cls.find((c) => c !== 'slide' && c !== BUILD_CLASS) ?? ''
  const stages = UNITS[layout]?.(root).filter((s) => s.length) ?? []
  if (!stages.length) return []
  // the takeaway is the conclusion: a last stage of its own
  const takeaway = kid(kid(root, 'footer'), 'span', 'takeaway')
  if (takeaway) stages.push([takeaway])
  if (!stands(root, new Set(stages.flat()))) stages.shift()
  return stages
}

const rootBuilds = (html: string): boolean => {
  const cls = /^\s*<section\s[^>]*?class\s*=\s*"([^"]*)"/.exec(html)?.[1]
  return !!cls && cls.split(/\s+/).includes(BUILD_CLASS)
}

/** How many stages a slide comes on in: 0 for a slide without a build, or with nothing to build. */
export function buildStages(html: string): number {
  if (!rootBuilds(html)) return 0
  const root = read(html)
  return root ? stagesIn(root).length : 0
}

/**
 * The slide with its units numbered for the host (`data-b`), and how many stages that makes. A slide without a build
 * comes back as it was. Nothing else of the markup is touched: the numbers are put into the tags as they stand.
 */
export function buildOf(html: string): { html: string; stages: number } {
  if (!rootBuilds(html)) return { html, stages: 0 }
  const root = read(html)
  const stages = root ? stagesIn(root) : []
  if (!stages.length) return { html, stages: 0 }
  const marks = stages.flatMap((units, k) => units.map((u) => ({ at: u.at, n: k + 1 }))).sort((a, b) => a.at - b.at)
  let out = ''
  let last = 0
  for (const m of marks) {
    out += `${html.slice(last, m.at)} ${STAGE_ATTR}="${m.n}"`
    last = m.at
  }
  return { html: out + html.slice(last), stages: stages.length }
}

/** The root's classes with the build switched on or off; everything else as it was. */
export function withBuildClass(rootClass: string, on: boolean): string {
  const list = rootClass.split(/\s+/).filter((c) => c && c !== BUILD_CLASS)
  return (on ? [...list, BUILD_CLASS] : list).join(' ')
}

/**
 * Where a presentation stands after one step forward or back (docs/slide-builds.md, Presenting): the next stage of
 * the slide, then the next slide at its first; back takes the last stage away, and from the first it goes to the
 * slide before, whole. `whole` pages slides without their stages (Shift with an arrow). `counts` are the stages of
 * every slide of the deck.
 */
export function stepFrom(counts: number[], at: number, stage: number, dir: 1 | -1, whole = false): { at: number; stage: number } {
  const of = (i: number) => counts[i] ?? 0
  const now = Math.min(Math.max(stage, 0), of(at))
  if (dir === 1) {
    if (!whole && now < of(at)) return { at, stage: now + 1 }
    return at < counts.length - 1 ? { at: at + 1, stage: 0 } : { at, stage: now }
  }
  if (!whole && now > 0) return { at, stage: now - 1 }
  return at > 0 ? { at: at - 1, stage: of(at - 1) } : { at, stage: now }
}
