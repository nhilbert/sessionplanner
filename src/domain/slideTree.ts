/**
 * A small element tree over a slide's markup (docs/slides.md). The sanitiser (slides.ts) leaves markup that is
 * well formed – every open tag closed, void elements known, attributes quoted – so a tree can be built without a
 * DOM, on the server and in the browser alike. The editor (slideDoc.ts) reads a slide through this tree and
 * writes it back through `serializeNodes`.
 */

export interface El {
  type: 'el'
  tag: string
  attrs: Record<string, string>
  children: Node[]
}
export interface Txt {
  type: 'text'
  /** Decoded text (no entities). */
  text: string
}
export type Node = El | Txt

const VOID = new Set(['br', 'img'])
const TAG = /<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>|<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', middot: '·', times: '×', shy: '­' }

/** Decodes the entities a slide may carry (the sanitiser escapes < and >; authors write &amp; and a few named ones). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[body] ?? m
  })
}

/** Escapes text for markup (the same as slides.ts `esc`, kept here so the tree needs nothing else). */
export const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

/** The tree of a (sanitised) fragment. Unknown closing tags are ignored; what is left open is closed at the end. */
export function parseTree(html: string): Node[] {
  const root: El = { type: 'el', tag: '#root', attrs: {}, children: [] }
  const stack: El[] = [root]
  let last = 0
  const text = (s: string) => {
    if (s) stack[stack.length - 1].children.push({ type: 'text', text: decodeEntities(s) })
  }
  for (const m of html.matchAll(TAG)) {
    text(html.slice(last, m.index))
    last = m.index + m[0].length
    const closing = m[1]?.toLowerCase()
    if (closing) {
      const at = stack.findLastIndex((e) => e.tag === closing)
      if (at > 0) stack.length = at
      continue
    }
    const tag = m[2].toLowerCase()
    const attrs: Record<string, string> = {}
    for (const a of (m[3] ?? '').matchAll(ATTR)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '')
    const el: El = { type: 'el', tag, attrs, children: [] }
    stack[stack.length - 1].children.push(el)
    if (!VOID.has(tag) && m[4] !== '/') stack.push(el)
  }
  text(html.slice(last))
  return root.children
}

/** Markup for a tree, in the form the sanitiser produces (closing tags written out, void elements without). */
export function serializeNodes(nodes: Node[]): string {
  return nodes.map(serializeNode).join('')
}

export function serializeNode(n: Node): string {
  if (n.type === 'text') return escapeText(n.text)
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('')
  if (VOID.has(n.tag)) return `<${n.tag}${attrs}>`
  return `<${n.tag}${attrs}>${serializeNodes(n.children)}</${n.tag}>`
}

// ---- helpers for reading a tree --------------------------------------------------------------------------------

export const isEl = (n: Node | undefined): n is El => !!n && n.type === 'el'
export const classes = (el: El): string[] => (el.attrs.class ?? '').split(/\s+/).filter(Boolean)
export const hasClass = (el: El, c: string): boolean => classes(el).includes(c)
/** The element children (whitespace-only text between blocks is dropped). */
export const elements = (n: El): El[] => n.children.filter(isEl)
/** True when a node is text that is only whitespace. */
export const isBlank = (n: Node): boolean => n.type === 'text' && n.text.trim() === ''
export const el = (tag: string, attrs: Record<string, string> = {}, children: Node[] = []): El => ({ type: 'el', tag, attrs, children })
export const txt = (text: string): Txt => ({ type: 'text', text })

/** The text of a subtree, whitespace folded. */
export function textOf(nodes: Node[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : n.tag === 'br' ? '\n' : textOf(n.children)))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Inline content as the editor shows it: a small markup instead of a rich-text widget. **bold** for strong,
 * *italic* for em, ==accent== for span.accent, `code` for code, a line break for br.
 *
 * A marker only counts at a word's edge, as emphasis does in Markdown for the underscore: it opens after a space,
 * punctuation or the start and before a non-space, and closes after a non-space and before a space, punctuation or
 * the end. A star inside a word is a star, so gender stars ("Teilnehmer*innen und Kolleg*innen"), "a==b" and
 * "2 * 3" stay as they are. Where a literal marker would count, it is written with a backslash ("\*") and read
 * back without it.
 *
 * Other inline elements (small, sub, sup, span.muted …) have no markup: they are unwrapped here, and the slide
 * document (slideDoc.ts) notices the change and keeps such a slide as source instead.
 */

const ALNUM = /[\p{L}\p{N}]/u
const SPACE = /\s/
/** Whether a marker of `len` characters at `i` can open or close emphasis (word-edge rule above). */
function flanking(text: string, i: number, len: number): { open: boolean; close: boolean } {
  const before = i > 0 ? text[i - 1] : ''
  const after = i + len < text.length ? text[i + len] : ''
  const open = !!after && !SPACE.test(after) && !(before && ALNUM.test(before))
  const close = !!before && !SPACE.test(before) && !(after && ALNUM.test(after))
  return { open, close }
}

/** Escapes the markers in literal text that would otherwise be read as markup; `prev` and `next` are the characters around it. */
function escapeLiteral(text: string, prev: string, next: string): string {
  const full = prev + text + next
  const off = prev.length
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && /[\\*=`]/.test(full[off + i + 1] ?? '')) out += '\\\\'
    else if (ch === '*' || ch === '`') {
      const { open, close } = flanking(full, off + i, 1)
      out += open || close ? `\\${ch}` : ch
    } else if (ch === '=' && (text[i + 1] === '=' || text[i - 1] === '=')) {
      // a run of two or more: escape it when it stands at a word's edge
      let a = i
      while (a > 0 && text[a - 1] === '=') a--
      let b = i
      while (b + 1 < text.length && text[b + 1] === '=') b++
      const { open, close } = flanking(full, off + a, b - a + 1)
      out += open || close ? '\\=' : '='
    } else out += ch
  }
  return out
}

const MARK: Record<string, string> = { strong: '**', b: '**', em: '*', i: '*', code: '`' }

export function inlineToText(nodes: Node[]): string {
  return inlineRaw(nodes).trim()
}

/** inlineToText without the trim at the ends, for the inside of an element. */
function inlineRaw(nodes: Node[]): string {
  // First each node on its own, then literal text escaped with the neighbours it ends up next to.
  type Part = { literal: true; text: string } | { literal: false; text: string }
  const parts: Part[] = nodes.map((n): Part => {
    if (n.type === 'text') return { literal: true, text: n.text.replace(/\s+/g, ' ') }
    if (n.tag === 'br') return { literal: false, text: '\n' }
    const raw = inlineRaw(n.children)
    const mark = MARK[n.tag] ?? (n.tag === 'span' && hasClass(n, 'accent') ? '==' : '')
    if (!mark || !raw.trim()) return { literal: false, text: raw }
    // Spaces at the inside edges of an element go outside its markers, where the markers can still count.
    const lead = /^\s*/.exec(raw)![0]
    const trail = /\s*$/.exec(raw)![0]
    return { literal: false, text: `${lead ? ' ' : ''}${mark}${raw.trim()}${mark}${trail ? ' ' : ''}` }
  })
  let out = ''
  parts.forEach((p, k) => {
    if (!p.literal) {
      out += p.text
      return
    }
    const next = parts[k + 1]?.text[0] ?? ''
    out += escapeLiteral(p.text, out.slice(-1), next)
  })
  return out.replace(/ +/g, ' ').replace(/ ?\n ?/g, '\n')
}

/** The inverse of inlineToText: the editor's text back into inline nodes. */
export function textToInline(text: string): Node[] {
  const out: Node[] = []
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push(el('br'))
    out.push(...inlineSpans(line))
  })
  return merge(out)
}

/** Neighbouring text nodes as one. */
function merge(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    const last = out[out.length - 1]
    if (n.type === 'text' && last?.type === 'text') last.text += n.text
    else if (n.type !== 'text' || n.text) out.push(n)
  }
  return out
}

const MARKERS: { mark: string; make: (inner: string) => Node }[] = [
  { mark: '**', make: (inner) => el('strong', {}, inlineSpans(inner)) },
  { mark: '==', make: (inner) => el('span', { class: 'accent' }, inlineSpans(inner)) },
  { mark: '`', make: (inner) => el('code', {}, [txt(unescape(inner))]) },
  { mark: '*', make: (inner) => el('em', {}, inlineSpans(inner)) },
]

const unescape = (s: string) => s.replace(/\\([\\*=`])/g, '$1')

/** One line: markers that open at a word's edge and close at one, innermost content read again; backslash escapes kept literal. */
function inlineSpans(line: string): Node[] {
  const out: Node[] = []
  let buf = ''
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '\\' && /[\\*=`]/.test(line[i + 1] ?? '')) {
      buf += line[i + 1]
      i += 2
      continue
    }
    const hit = MARKERS.find((m) => line.startsWith(m.mark, i) && !(m.mark === '*' && line[i + 1] === '*') && flanking(line, i, m.mark.length).open)
    const end = hit ? closing(line, i + hit.mark.length, hit.mark) : -1
    if (hit && end > i + hit.mark.length) {
      if (buf) out.push(txt(buf))
      buf = ''
      out.push(hit.make(line.slice(i + hit.mark.length, end)))
      i = end + hit.mark.length
      continue
    }
    buf += ch
    i++
  }
  if (buf) out.push(txt(buf))
  return out
}

/** Where the marker opened before `from` closes: the first unescaped occurrence that can close (for `*`, not part of `**`). */
function closing(line: string, from: number, mark: string): number {
  for (let j = from; j < line.length; j++) {
    if (line[j] === '\\') {
      j++
      continue
    }
    if (!line.startsWith(mark, j)) continue
    if (mark === '*' && (line[j + 1] === '*' || line[j - 1] === '*')) {
      // a star of a ** pair inside the italic text: step over the pair
      if (line[j + 1] === '*') j++
      continue
    }
    if (flanking(line, j, mark.length).close) return j
  }
  return -1
}
