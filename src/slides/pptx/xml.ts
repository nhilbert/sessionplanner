/**
 * A small, strict XML reader for the parts of an uploaded PowerPoint file (read.ts), for the browser and for Node, where
 * there is no DOMParser. The file is not to be trusted: a document type is refused outright, so no entity can be
 * defined or expanded and nothing outside the file is ever referred to; only the five predefined entities and
 * character references are read; depth, elements and size are capped. One pass with indexOf and no recursion, so the
 * work grows with the size of the input, and what is not well-formed throws.
 */

export interface XmlNode {
  /** The name with the prefix this reader knows the namespace by (KNOWN below), whatever the file calls it: p:sp, a:t. */
  name: string
  /** By name, in the same form; xmlns declarations are left out. */
  attrs: Record<string, string>
  children: XmlNode[]
  /** The element's own character data, in order, without that of its children. */
  text: string
}

export class BadXml extends Error {}

export const MAX_XML_CHARS = 64 * 1024 * 1024
export const MAX_XML_DEPTH = 256
const MAX_XML_NODES = 3_000_000
const MAX_ATTRS = 128

const PML = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const DML = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
/** Both spellings of OOXML (transitional and strict) under the prefixes read.ts asks for. */
const KNOWN = new Map([
  [PML, 'p'],
  [DML, 'a'],
  [REL, 'r'],
  ['http://purl.oclc.org/ooxml/presentationml/main', 'p'],
  ['http://purl.oclc.org/ooxml/drawingml/main', 'a'],
  ['http://purl.oclc.org/ooxml/officeDocument/relationships', 'r'],
  ['http://schemas.openxmlformats.org/drawingml/2006/chart', 'c'],
  ['http://purl.oclc.org/ooxml/drawingml/chart', 'c'],
  ['http://schemas.openxmlformats.org/drawingml/2006/diagram', 'dgm'],
  ['http://purl.oclc.org/ooxml/drawingml/diagram', 'dgm'],
  ['http://schemas.openxmlformats.org/markup-compatibility/2006', 'mc'],
  ['http://schemas.openxmlformats.org/package/2006/relationships', 'pr'],
])

const ENTITIES = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]])

const legalChar = (c: number): boolean => c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff)

function decodeEntities(s: string): string {
  let at = s.indexOf('&')
  if (at < 0) return s
  let out = ''
  let last = 0
  while (at >= 0) {
    const end = s.indexOf(';', at)
    if (end < 0 || end - at > 12) throw new BadXml('A stray "&" in the text.')
    const name = s.slice(at + 1, end)
    let value = ENTITIES.get(name)
    if (value === undefined && name.startsWith('#')) {
      const code = /^#x[0-9a-fA-F]+$/.test(name) ? parseInt(name.slice(2), 16) : /^#[0-9]+$/.test(name) ? parseInt(name.slice(1), 10) : NaN
      if (!legalChar(code)) throw new BadXml(`A character reference that is not allowed: &${name};`)
      value = String.fromCodePoint(code)
    }
    if (value === undefined) throw new BadXml(`An entity that is not allowed: &${name};`)
    out += s.slice(last, at) + value
    last = end + 1
    at = s.indexOf('&', last)
  }
  return out + s.slice(last)
}

/** The text of a part: UTF-8, or UTF-16 by its byte order mark. Bytes that are neither are an error, not replaced. */
function decode(bytes: Uint8Array): string {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null
  try {
    return new TextDecoder(utf16 ?? 'utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new BadXml('The text is not valid UTF-8.')
  }
}

const isSpace = (c: number): boolean => c === 0x20 || c === 0x9 || c === 0xa || c === 0xd
const blank = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (!isSpace(s.charCodeAt(i))) return false
  return true
}
/** Where a name ends: at white space or at one of the characters that cannot be part of one. */
function nameEnd(s: string, from: number): number {
  let i = from
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (isSpace(c) || c === 0x2f || c === 0x3e || c === 0x3d || c === 0x3c || c === 0x22 || c === 0x27 || c === 0x26) break
  }
  return i
}

type Scope = Record<string, string>

function qualified(raw: string, scope: Scope, element: boolean): string {
  const colon = raw.indexOf(':')
  const prefix = colon < 0 ? '' : raw.slice(0, colon)
  if (colon < 0 && !element) return raw
  const uri = scope[prefix]
  const known = uri === undefined ? undefined : KNOWN.get(uri)
  const local = colon < 0 ? raw : raw.slice(colon + 1)
  return known ? `${known}:${local}` : raw
}

/** The document's root element. Throws BadXml for anything that is not well-formed or goes beyond the limits. */
export function parseXml(input: Uint8Array | string): XmlNode {
  if (input.length > MAX_XML_CHARS) throw new BadXml('A part of the file is too large.')
  const s = typeof input === 'string' ? input : decode(input)
  const stack: { node: XmlNode; raw: string; scope: Scope }[] = []
  const rootScope: Scope = Object.create(null) as Scope
  let root: XmlNode | null = null
  let nodes = 0
  let pos = s.charCodeAt(0) === 0xfeff ? 1 : 0

  const addText = (text: string) => {
    const top = stack[stack.length - 1]
    if (top) top.node.text += text
    else if (!blank(text)) throw new BadXml('Text outside the root element.')
  }

  for (;;) {
    const open = s.indexOf('<', pos)
    if (open < 0) {
      addText(s.slice(pos))
      break
    }
    if (open > pos) addText(decodeEntities(s.slice(pos, open)))
    const next = s.charCodeAt(open + 1)
    if (next === 0x3f /* ? */) {
      const end = s.indexOf('?>', open + 2)
      if (end < 0) throw new BadXml('An unfinished processing instruction.')
      pos = end + 2
      continue
    }
    if (next === 0x21 /* ! */) {
      if (s.startsWith('<!--', open)) {
        const end = s.indexOf('-->', open + 4)
        if (end < 0) throw new BadXml('An unfinished comment.')
        pos = end + 3
      } else if (s.startsWith('<![CDATA[', open)) {
        const end = s.indexOf(']]>', open + 9)
        if (end < 0 || !stack.length) throw new BadXml('A misplaced CDATA section.')
        addText(s.slice(open + 9, end))
        pos = end + 3
      } else throw new BadXml('A document type declaration is not allowed.')
      continue
    }
    if (next === 0x2f /* / */) {
      const end = nameEnd(s, open + 2)
      let close = end
      while (isSpace(s.charCodeAt(close))) close++
      const top = stack.pop()
      if (s.charCodeAt(close) !== 0x3e || !top || top.raw !== s.slice(open + 2, end)) throw new BadXml('Elements do not close in order.')
      pos = close + 1
      continue
    }

    // A start tag.
    const nameTo = nameEnd(s, open + 1)
    const raw = s.slice(open + 1, nameTo)
    if (!raw) throw new BadXml('A stray "<" in the text.')
    if (root && !stack.length) throw new BadXml('More than one root element.')
    if (stack.length >= MAX_XML_DEPTH) throw new BadXml('The elements are nested too deeply.')
    if (++nodes > MAX_XML_NODES) throw new BadXml('A part of the file holds too many elements.')
    const given: [string, string][] = []
    const parent = stack[stack.length - 1]
    let scope = parent ? parent.scope : rootScope
    let at = nameTo
    let empty = false
    for (;;) {
      const before = at
      while (isSpace(s.charCodeAt(at))) at++
      const c = s.charCodeAt(at)
      if (c === 0x3e) {
        at++
        break
      }
      if (c === 0x2f && s.charCodeAt(at + 1) === 0x3e) {
        at += 2
        empty = true
        break
      }
      if (at === before) throw new BadXml('A malformed tag.')
      const end = nameEnd(s, at)
      const attr = s.slice(at, end)
      if (!attr) throw new BadXml('A malformed tag.')
      at = end
      while (isSpace(s.charCodeAt(at))) at++
      if (s.charCodeAt(at) !== 0x3d) throw new BadXml('An attribute without a value.')
      at++
      while (isSpace(s.charCodeAt(at))) at++
      const quote = s[at]
      if (quote !== '"' && quote !== "'") throw new BadXml('An attribute value without quotes.')
      const close = s.indexOf(quote, at + 1)
      if (close < 0) throw new BadXml('An unfinished attribute value.')
      const rawValue = s.slice(at + 1, close)
      if (rawValue.includes('<')) throw new BadXml('A "<" in an attribute value.')
      at = close + 1
      if (given.length >= MAX_ATTRS) throw new BadXml('An element with too many attributes.')
      const value = decodeEntities(rawValue)
      if (attr === 'xmlns' || attr.startsWith('xmlns:')) {
        if (scope === (parent ? parent.scope : rootScope)) scope = Object.create(scope) as Scope
        scope[attr === 'xmlns' ? '' : attr.slice(6)] = value
      } else given.push([attr, value])
    }
    const attrs = Object.create(null) as Record<string, string>
    for (const [name, value] of given) {
      const key = qualified(name, scope, false)
      if (key in attrs) throw new BadXml('An attribute given twice.')
      attrs[key] = value
    }
    const node: XmlNode = { name: qualified(raw, scope, true), attrs, children: [], text: '' }
    if (parent) parent.node.children.push(node)
    else root = node
    if (!empty) stack.push({ node, raw, scope })
    pos = at
  }
  if (stack.length) throw new BadXml('An element is not closed.')
  if (!root) throw new BadXml('There is no root element.')
  return root
}

/** The first child of that name. */
export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => node?.children.find((c) => c.name === name)

/** The children of that name. */
export const kids = (node: XmlNode | undefined, name: string): XmlNode[] => node?.children.filter((c) => c.name === name) ?? []

/** The element at the end of a path of child names. */
export const at = (node: XmlNode | undefined, ...path: string[]): XmlNode | undefined => path.reduce((n, name) => child(n, name), node)

/** Every element of that name below the node, in document order, without recursion. */
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = []
  const todo = [...node.children].reverse()
  while (todo.length) {
    const n = todo.pop()!
    if (n.name === name) found.push(n)
    for (let i = n.children.length - 1; i >= 0; i--) todo.push(n.children[i])
  }
  return found
}
