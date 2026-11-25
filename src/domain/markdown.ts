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
