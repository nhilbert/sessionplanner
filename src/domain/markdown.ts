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
  /** Lines that begin with "> ": what they hold is read as notes again. */
  | { type: 'quote'; blocks: Block[] }
  /** Head and rows have as many cells as the longest of them. */
  | { type: 'table'; head: string[]; align: Align[]; rows: string[][] }

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
/**
 * A quote begins with ">" and a space, and not with a number: "> 5 people" and ">5" mean "more than" and stay as
 * typed. Once begun, every line with ">" and a space (or ">" alone) goes on with it.
 */
const QUOTE_START = /^\s*>\s+(?!\d)/
const QUOTE_LINE = /^\s*>(\s|$)/
/** Quotes inside quotes are read this deep; deeper, the signs stay text (the depth must not follow what is typed). */
const QUOTE_DEPTH = 4

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
/** A table's row: a line with a bar that does not begin something else (a heading, a list, a quote). */
const rowAt = (lines: string[], i: number): boolean => i < lines.length && lines[i].includes('|') && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i]) && !QUOTE_LINE.test(lines[i])

/** The table that begins at line `i` (see tableAt), and the line after it. */
function tableFrom(lines: string[], i: number): { table: Extract<Block, { type: 'table' }>; next: number } {
  const head = cellsOf(lines[i])
  const align = cellsOf(lines[i + 1]).map((rule): Align => (rule.startsWith(':') && rule.endsWith(':') ? 'center' : rule.endsWith(':') ? 'right' : rule.startsWith(':') ? 'left' : null))
  const rows: string[][] = []
  let next = i + 2
  for (; rowAt(lines, next); next++) rows.push(cellsOf(lines[next]))
  // a row longer than the head widens the table: nothing typed is left out
  const width = Math.max(head.length, ...rows.map((row) => row.length))
  const wide = <T>(cells: T[], fill: T): T[] => [...cells, ...Array<T>(width - cells.length).fill(fill)]
  return { table: { type: 'table', head: wide(head, ''), align: wide(align, null), rows: rows.map((row) => wide(row, '')) }, next }
}

const linesOf = (text: string): string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => raw.trimEnd())

export function parseBlocks(text: string, depth = 0): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'p', lines: para })
    para = []
  }
  const lines = linesOf(text)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let m: RegExpExecArray | null
    if (!line.trim()) flush()
    else if ((m = HEADING.exec(line))) {
      flush()
      out.push({ type: 'h', level: m[1].length, text: m[2] })
    } else if (tableAt(lines, i)) {
      flush()
      const { table, next } = tableFrom(lines, i)
      out.push(table)
      i = next - 1
    } else if (depth < QUOTE_DEPTH && QUOTE_START.test(line)) {
      flush()
      const quoted: string[] = []
      for (; i < lines.length && QUOTE_LINE.test(lines[i]); i++) quoted.push(lines[i].replace(/^\s*>\s?/, ''))
      i--
      out.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n'), depth + 1) })
    } else if ((m = BULLET.exec(line)) || (m = NUMBERED.exec(line))) {
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

/** A line without the signs of what it holds: a link is its words, bold and italic are plain. */
const unmarked = (line: string): string =>
  line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    // a star or underscore inside a word is the word's (a gender star, a name), at its edge it is a sign
    .replace(/(?<![\p{L}\p{N}])[*_]|[*_](?![\p{L}\p{N}])/gu, '')
    .trim()

/** The first line of a text that says something, without its Markdown signs: what stands for the text in one line. */
export function plainLine(text: string): string {
  const first = (blocks: Block[]): string => {
    for (const b of blocks) {
      const lines =
        b.type === 'h'
          ? [b.text]
          : b.type === 'p'
            ? b.lines
            : b.type === 'quote'
              ? [first(b.blocks)]
              : b.type === 'table'
                ? // a row is its cells that say something
                  [b.head, ...b.rows].map((row) => row.filter((cell) => cell.trim()).join(' · '))
                : b.items.map((item) => item.replace(/^\[[ xX]\]\s+/, ''))
      const said = lines.map(unmarked).find(Boolean)
      if (said) return said
    }
    return ''
  }
  return first(parseBlocks(text))
}

/**
 * Notes for a place that holds no table (a cell of the table in a Markdown file): each table as its rows, one a
 * line, the cells set apart by " · ". Everything else stays as typed.
 */
export function tablesAsLines(text: string): string {
  const lines = linesOf(text)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!tableAt(lines, i)) {
      out.push(lines[i])
      continue
    }
    const { table, next } = tableFrom(lines, i)
    const row = (cells: string[]) => cells.filter((cell) => cell.trim()).join(' · ')
    out.push(...[table.head.some((cell) => cell.trim()) ? `**${row(table.head.map(unmarked))}**` : '', ...table.rows.map(row)].filter(Boolean))
    i = next - 1
  }
  return out.join('\n')
}

/**
 * Where a place in the formatted text lies in its source: `piece` is the run of text clicked into, `offset` the
 * place in it, `before` the formatted text that stands before it. The source holds every run as typed, so the place
 * is in the run's occurrence of the same count; the end, where it is not found. Addresses of links are not shown, so
 * a run is never looked for in them, and a bar in a table's cell is typed "\|". Give the source with plain line
 * ends, as a text area counts it.
 */
export function sourceOffset(source: string, before: string, piece: string, offset: number): number {
  if (!piece) return source.length
  const shown = source.replace(/\]\([^)\s]+\)/g, (address) => ']' + '\0'.repeat(address.length - 1))
  let earlier = 0
  for (let i = before.indexOf(piece); i !== -1; i = before.indexOf(piece, i + 1)) earlier++
  const nth = (typed: string): number => {
    let at = shown.indexOf(typed)
    for (let left = earlier; at !== -1 && left > 0; left--) at = shown.indexOf(typed, at + 1)
    return at
  }
  const at = nth(piece)
  if (at !== -1) return at + offset
  // as typed in a table's cell: every bar with its backslash, which moves the place by one per bar before it
  const escaped = piece.includes('|') ? nth(piece.replace(/\|/g, '\\|')) : -1
  return escaped === -1 ? source.length : escaped + offset + piece.slice(0, offset).split('|').length - 1
}
