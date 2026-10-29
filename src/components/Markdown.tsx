import { Fragment, type ReactNode } from 'react'

/**
 * Basic Markdown for notes: headings (#, ##, ###), lists (-, *, 1.), task lists (- [ ] / - [x]), **bold**,
 * *italic*, `code` and [links](https://…). Built from React elements only – never HTML – so nothing typed can
 * run as code, and links work only for http(s) and mailto (guests read notes too).
 */
export default function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{blocks(text)}</div>
}

type Block = { type: 'h'; level: number; text: string } | { type: 'ul' | 'ol'; items: string[] } | { type: 'p'; lines: string[] }

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

function blocks(text: string): ReactNode {
  return parseBlocks(text).map((b, i) => {
    if (b.type === 'h') {
      const cls = b.level === 1 ? 'mt-2 text-[15px] font-semibold first:mt-0' : b.level === 2 ? 'mt-2 text-[14px] font-semibold first:mt-0' : 'mt-1.5 font-semibold first:mt-0'
      return (
        <div key={i} className={cls} role="heading" aria-level={b.level + 2}>
          {inline(b.text)}
        </div>
      )
    }
    if (b.type !== 'p') {
      const List = b.type
      return (
        <List key={i} className={b.type === 'ul' ? 'my-1 list-disc pl-5' : 'my-1 list-decimal pl-5'}>
          {b.items.map((item, j) => {
            const task = /^\[( |x|X)\]\s+(.*)$/.exec(item)
            return (
              <li key={j} className={task ? '-ml-5 list-none' : undefined}>
                {task ? (
                  <>
                    <span aria-hidden className="mr-1.5">
                      {task[1] === ' ' ? '☐' : '☑'}
                    </span>
                    {inline(task[2])}
                  </>
                ) : (
                  inline(item)
                )}
              </li>
            )
          })}
        </List>
      )
    }
    return (
      <p key={i} className="my-1 first:mt-0 last:mb-0">
        {b.lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    )
  })
}

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/

export function inline(text: string): ReactNode[] {
  return text
    .split(TOKEN)
    .filter((part) => part !== '')
    .map((part, i) => {
      if (/^(\*\*|__).+\1$/.test(part)) return <strong key={i}>{inline(part.slice(2, -2))}</strong>
      if (/^`.+`$/.test(part))
        return (
          <code key={i} className="rounded bg-surface-2 px-1 text-[0.92em]">
            {part.slice(1, -1)}
          </code>
        )
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
      if (link)
        return SAFE_LINK.test(link[2]) ? (
          <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">
            {link[1]}
          </a>
        ) : (
          <Fragment key={i}>{link[1]}</Fragment>
        )
      if (/^([*_]).+\1$/.test(part)) return <em key={i}>{inline(part.slice(1, -1))}</em>
      return <Fragment key={i}>{part}</Fragment>
    })
}
