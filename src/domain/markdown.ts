/**
 * The basic Markdown of notes, read into blocks: headings (#, ##, ###), lists (-, *, 1.), quotes (>), tables
 * (| a | b | over |---|---|) and paragraphs. What a line holds (bold, italic, code, links) is the page's business
 * (components/Markdown.tsx); the files the app writes (domain/print.ts) keep the text as typed.
 */
export type Align = 'left' | 'center' | 'right' | null
export type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'p'; lines: string[] }
  /** Lines that begin with ">": what they hold is read as notes again. */
  | { type: 'quote'; blocks: Block[] }
  /** Every row has as many cells as the head. */
  | { type: 'table'; head: string[]; align: Align[]; rows: string[][] }

/** The line under a table's head: dashes per column, a colon where the column is set to a side. */
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
/** A table row's cells: split at the bars, a bar at either edge is the frame; "\|" is a bar in the text. */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
/** A head with bars, and under it a rule of as many columns. */
const tableAt = (lines: string[], i: number): boolean => lines[i].includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && cellsOf(lines[i + 1]).length === cellsOf(lines[i]).length
const QUOTE = /^\s*>\s?/

export function parseBlocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'p', lines: para })
    para = []
  }
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => raw.trimEnd())
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let m: RegExpExecArray | null
    if (!line.trim()) flush()
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flush()
      out.push({ type: 'h', level: m[1].length, text: m[2] })
    } else if (tableAt(lines, i)) {
      flush()
      const head = cellsOf(line)
      const align = cellsOf(lines[i + 1]).map((rule): Align => (rule.startsWith(':') && rule.endsWith(':') ? 'center' : rule.endsWith(':') ? 'right' : rule.startsWith(':') ? 'left' : null))
      const rows: string[][] = []
      // its rows: the lines with bars that follow, up to an empty line or a line without one
      for (i += 2; i < lines.length && lines[i].includes('|'); i++) {
        const cells = cellsOf(lines[i])
        rows.push(head.map((_, column) => cells[column] ?? ''))
      }
      i--
      out.push({ type: 'table', head, align, rows })
    } else if (QUOTE.test(line)) {
      flush()
      const quoted: string[] = []
      for (; i < lines.length && QUOTE.test(lines[i]); i++) quoted.push(lines[i].replace(QUOTE, ''))
      i--
      out.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n')) })
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flush()
      const type = /^\s*\d/.test(line) ? 'ol' : 'ul'
      const last = out[out.length - 1]
      if (last && last.type === type) last.items.push(m[1])
      else out.push({ type, items: [m[1]] })
    } else para.push(line)
  }
  flush()
  return out
}

/** The text's one line, where it is a single plain line (no list, no heading, no second line); else null. */
export function oneLine(text: string): string | null {
  const blocks = parseBlocks(text)
  return blocks.length === 1 && blocks[0].type === 'p' && blocks[0].lines.length === 1 ? blocks[0].lines[0].trim() : null
}

/** The first line of a text that says something, without its Markdown signs: what stands for the text in one line. */
export const plainLine = (text: string): string =>
  text
    .split('\n')
    .map((line) =>
      (TABLE_RULE.test(line) ? '' : line)
        .replace(/^\s*(#{1,6}\s+|[-*]\s+(\[[ x]\]\s+)?|\d+\.\s+|>\s*)/i, '')
        // a table's row: its cells, without the frame
        .replace(/^\s*\||\|\s*$/g, '')
        .replace(/\s*(?<!\\)\|\s*/g, ' · ')
        .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
        .replace(/\*\*|__|`/g, '')
        // a star or underscore inside a word is the word's (a gender star, a name), at its edge it is a sign
        .replace(/(?<![\p{L}\p{N}])[*_]|[*_](?![\p{L}\p{N}])/gu, '')
        .trim(),
    )
    .find(Boolean) ?? ''

/**
 * Where a place in the formatted text lies in its source: `piece` is the run of text clicked into, `offset` the
 * place in it, `before` the formatted text that stands before it. The source holds every run as typed, so the place
 * is in the run's occurrence of the same count; the end, where it is not found. Addresses of links are not shown, so
 * a run is never looked for in them. Give the source with plain line ends, as a text area counts it.
 */
export function sourceOffset(source: string, before: string, piece: string, offset: number): number {
  if (!piece) return source.length
  const shown = source.replace(/\]\([^)\s]+\)/g, (address) => ']' + '\0'.repeat(address.length - 1))
  let earlier = 0
  for (let i = before.indexOf(piece); i !== -1; i = before.indexOf(piece, i + 1)) earlier++
  let at = shown.indexOf(piece)
  for (; at !== -1 && earlier > 0; earlier--) at = shown.indexOf(piece, at + 1)
  return at === -1 ? source.length : at + offset
}
