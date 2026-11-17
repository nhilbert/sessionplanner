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
 * Formatting the author lays over the theme (docs/slides.md, section 2) is a span in brackets with what it sets in
 * braces: [text]{l accent-2}. The words in the braces are the sizes xs, s, l, xl (steps relative to the size the
 * theme gives the text), the colours accent, accent-2, accent-3, accent-4, title, text, muted (places of the theme's
 * palette), `normal` (not bold, in a heading), and b and i for bold and italic where the stars cannot say it: inside
 * a word ("Kolleg[innen]{i}"). Brackets work anywhere; a literal bracket that would be read as one is written "\[".
 *
 * Other inline elements (small, sub, sup, a span with other classes …) have no markup: they are unwrapped here, and
 * the slide document (slideDoc.ts) notices the change and keeps such a slide as source instead.
 */

/** The words of the braces and the class each one stands for (slides.css, "formatting laid over the theme"). */
export const FORMAT_CLASS: Record<string, string> = {
  xs: 'fs-xs', s: 'fs-s', l: 'fs-l', xl: 'fs-xl',
  accent: 'accent', 'accent-2': 'c-accent-2', 'accent-3': 'c-accent-3', 'accent-4': 'c-accent-4', title: 'c-title', text: 'c-text', muted: 'muted',
  normal: 'fw-normal',
}
const FORMAT_TOKEN = new Map(Object.entries(FORMAT_CLASS).map(([token, cls]) => [cls, token]))
const isFormatWord = (w: string): boolean => Object.prototype.hasOwnProperty.call(FORMAT_CLASS, w)

/** The words a span's classes stand for when every one of them is formatting, else null (a span the editor does not model). */
export function formatTokens(n: El): string[] | null {
  if (n.tag !== 'span') return null
  const list = classes(n)
  if (!list.length || !list.every((c) => FORMAT_TOKEN.has(c))) return null
  return list.map((c) => FORMAT_TOKEN.get(c)!)
}

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

/**
 * Escapes the markers in literal text that would otherwise be read as markup; `prev` and `next` are the characters
 * around it. Inside an element (`nested`) every bracket is escaped, so the brackets of a span always pair up.
 */
function escapeLiteral(text: string, prev: string, next: string, nested: boolean): string {
  const full = prev + text + next
  const off = prev.length
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && /[\\*=`[\]]/.test(full[off + i + 1] ?? '')) out += '\\\\'
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
    } else if ((ch === '[' || ch === ']') && (nested || (ch === ']' && full[off + i + 1] === '{'))) out += `\\${ch}`
    else out += ch
  }
  return out
}

const MARK: Record<string, string> = { strong: '**', b: '**', em: '*', i: '*', code: '`' }

export function inlineToText(nodes: Node[]): string {
  return inlineRaw(nodes, false).trim()
}

/** inlineToText without the trim at the ends, for the inside of an element. */
function inlineRaw(nodes: Node[], nested: boolean): string {
  // First each node on its own, then literal text escaped with the neighbours it ends up next to. `inside` is what
  // the brackets hold when the element is written as [inside]{b}: strong and em inside a word, where stars do not count.
  type Part = { literal: boolean; text: string; inside?: string; word?: string }
  const parts: Part[] = nodes.map((n): Part => {
    if (n.type === 'text') return { literal: true, text: n.text.replace(/\s+/g, ' ') }
    if (n.tag === 'br') return { literal: false, text: '\n' }
    const raw = inlineRaw(n.children, true)
    const tokens = formatTokens(n)
    const bracket = tokens && !(tokens.length === 1 && tokens[0] === 'accent') ? tokens.join(' ') : ''
    const mark = bracket ? '' : (MARK[n.tag] ?? (tokens ? '==' : ''))
    if ((!mark && !bracket) || !raw.trim()) return { literal: false, text: raw }
    // Spaces at the inside edges of an element go outside its markers, where the markers can still count.
    const lead = /^\s*/.exec(raw)![0] ? ' ' : ''
    const trail = /\s*$/.exec(raw)![0] ? ' ' : ''
    if (bracket) return { literal: false, text: `${lead}[${raw.trim()}]{${bracket}}${trail}` }
    const word = n.tag === 'strong' || n.tag === 'b' ? 'b' : n.tag === 'em' || n.tag === 'i' ? 'i' : undefined
    return { literal: false, text: `${lead}${mark}${raw.trim()}${mark}${trail}`, inside: raw.trim(), word }
  })
  let out = ''
  parts.forEach((p, k) => {
    const next = parts[k + 1]?.text[0] ?? ''
    if (p.literal) out += escapeLiteral(p.text, out.slice(-1), next, nested)
    else if (p.word && ((!p.text.startsWith(' ') && ALNUM.test(out.slice(-1))) || (!p.text.endsWith(' ') && ALNUM.test(next)))) out += `${p.text.startsWith(' ') ? ' ' : ''}[${p.inside}]{${p.word}}${p.text.endsWith(' ') ? ' ' : ''}`
    else out += p.text
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

const unescape = (s: string) => s.replace(/\\([\\*=`[\]])/g, '$1')

/** One line: markers that open at a word's edge and close at one, innermost content read again; backslash escapes kept literal. */
function inlineSpans(line: string): Node[] {
  const out: Node[] = []
  let buf = ''
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '\\' && /[\\*=`[\]]/.test(line[i + 1] ?? '')) {
      buf += line[i + 1]
      i += 2
      continue
    }
    const span = ch === '[' ? bracketSpan(line, i) : null
    if (span) {
      if (buf) out.push(txt(buf))
      buf = ''
      out.push(span.node)
      i = span.end
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

/**
 * A span in brackets that opens at `i`: "[inside]{words}" with its closing bracket found past escaped and paired
 * brackets, and every word of the braces known. The classes become one span; b and i a strong and an em inside it.
 */
function bracketSpan(line: string, i: number): { node: Node; end: number } | null {
  let depth = 1
  let j = i + 1
  for (; j < line.length && depth > 0; j++) {
    if (line[j] === '\\') j++
    else if (line[j] === '[') depth++
    else if (line[j] === ']') depth--
  }
  if (depth !== 0) return null
  const close = j - 1
  const m = /^\{([a-z0-9 -]+)\}/.exec(line.slice(close + 1))
  if (!m || close === i + 1) return null
  const words = m[1].split(' ').filter(Boolean)
  if (!words.length || !words.every((w) => w === 'b' || w === 'i' || isFormatWord(w))) return null
  let nodes = inlineSpans(line.slice(i + 1, close))
  if (words.includes('i')) nodes = [el('em', {}, nodes)]
  if (words.includes('b')) nodes = [el('strong', {}, nodes)]
  const cls = [...new Set(words.filter(isFormatWord).map((w) => FORMAT_CLASS[w]))]
  const node = cls.length ? el('span', { class: cls.join(' ') }, nodes) : nodes[0]
  return { node, end: close + 1 + m[0].length }
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
    // "***": the first star closes the italic inside, the two after it the bold
    if (mark === '**' && line[j + 2] === '*' && line[j + 3] !== '*' && flanking(line, j + 1, 2).close) return j + 1
    if (flanking(line, j, mark.length).close) return j
  }
  return -1
}
