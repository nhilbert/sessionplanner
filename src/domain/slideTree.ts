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
 * *italic* for em, ==accent== for span.accent, `code` for code, a line break for br. Any other element is
 * unwrapped (its text stays); the formats a slide can carry are these.
 */
export function inlineToText(nodes: Node[]): string {
  return nodes
    .map((n): string => {
      if (n.type === 'text') return n.text
      if (n.tag === 'br') return '\n'
      const inner = inlineToText(n.children)
      if (n.tag === 'strong' || n.tag === 'b') return inner ? `**${inner}**` : ''
      if (n.tag === 'em' || n.tag === 'i') return inner ? `*${inner}*` : ''
      if (n.tag === 'code') return inner ? `\`${inner}\`` : ''
      if (n.tag === 'span' && hasClass(n, 'accent')) return inner ? `==${inner}==` : ''
      return inner
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** The inverse of inlineToText: the editor's text back into inline nodes. */
export function textToInline(text: string): Node[] {
  const out: Node[] = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (i > 0) out.push(el('br'))
    out.push(...inlineSpans(line))
  })
  return out
}

const INLINE = /(\*\*(.+?)\*\*|==(.+?)==|`(.+?)`|\*(.+?)\*)/g

function inlineSpans(line: string): Node[] {
  const out: Node[] = []
  let last = 0
  for (const m of line.matchAll(INLINE)) {
    if (m.index > last) out.push(txt(line.slice(last, m.index)))
    last = m.index + m[0].length
    if (m[2] !== undefined) out.push(el('strong', {}, inlineSpans(m[2])))
    else if (m[3] !== undefined) out.push(el('span', { class: 'accent' }, inlineSpans(m[3])))
    else if (m[4] !== undefined) out.push(el('code', {}, [txt(m[4])]))
    else if (m[5] !== undefined) out.push(el('em', {}, inlineSpans(m[5])))
  }
  if (last < line.length) out.push(txt(line.slice(last)))
  return out
}
