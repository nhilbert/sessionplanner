/**
 * The basic Markdown of notes, read into blocks: headings (#, ##, ###), lists (-, *, 1.) and paragraphs. What a line
 * holds (bold, italic, code, links) is the page's business (components/Markdown.tsx); the files the app writes
 * (domain/print.ts) keep the text as typed.
 */
export type Block = { type: 'h'; level: number; text: string } | { type: 'ul' | 'ol'; items: string[] } | { type: 'p'; lines: string[] }

export function parseBlocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'p', lines: para })
    para = []
  }
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    let m: RegExpExecArray | null
    if (!line.trim()) flush()
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flush()
      out.push({ type: 'h', level: m[1].length, text: m[2] })
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
      line
        .replace(/^\s*(#{1,6}\s+|[-*]\s+(\[[ x]\]\s+)?|\d+\.\s+|>\s*)/i, '')
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
