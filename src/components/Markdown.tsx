import { Fragment, type ReactNode, type Ref } from 'react'
import { oneLine, parseBlocks } from '@/domain/markdown'

/**
 * Basic Markdown for notes: headings (#, ##, ###), lists (-, *, 1.), task lists (- [ ] / - [x]), **bold**,
 * *italic*, `code` and [links](https://…). Built from React elements only – never HTML – so nothing typed can
 * run as code, and links work only for http(s) and mailto (guests read notes too).
 */
export default function Markdown({ text, className, ref }: { text: string; className?: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={className}>
      {blocks(text)}
    </div>
  )
}

/**
 * A note item's title and text where they stand together (the guests' agenda, the printed views). The text is
 * Markdown like the facilitation notes: one plain line follows the title after a dash, anything longer (several
 * lines, a list, a heading) stands below it. Where the place sets its words in italics, give it `[&_em]:not-italic`,
 * so that emphasis still shows.
 */
export function NoteText({ title, text, titleClassName, className }: { title: string; text: string; titleClassName?: string; className?: string }) {
  const line = oneLine(text)
  if (line !== null || !text.trim())
    return (
      <>
        {title && <span className={titleClassName}>{title}</span>}
        {title && line !== null && ' – '}
        {line !== null && inline(line)}
      </>
    )
  return (
    <>
      {title && <div className={titleClassName}>{title}</div>}
      <Markdown text={text} className={className} />
    </>
  )
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
// *italic*, _italic_ and __bold__ begin and end at the edge of a word, so a gender star ("Kolleg*innen und
// Leiter*innen"), a_name_with_dashes and an address with underscores stay as typed; **bold** may stand inside a word.
const WORD = '[\\p{L}\\p{N}]'
const TOKEN = new RegExp(
  [
    '\\*\\*[^*]+\\*\\*',
    `(?<!${WORD}|_)__[^_]+__(?!${WORD}|_)`,
    `(?<!${WORD}|\\*)\\*[^*\\s](?:[^*]*[^*\\s])?\\*(?!${WORD}|\\*)`,
    `(?<!${WORD}|_)_[^_\\s](?:[^_]*[^_\\s])?_(?!${WORD}|_)`,
    '`[^`]+`',
    '\\[[^\\]]+\\]\\([^)\\s]+\\)',
  ].join('|'),
  'u',
)

export function inline(text: string): ReactNode[] {
  // split by one group: what the pattern found stands at the odd places, the text between at the even ones
  return text.split(new RegExp(`(${TOKEN.source})`, 'u')).map((part, i) => {
    if (i % 2 === 0) return part === '' ? null : <Fragment key={i}>{part}</Fragment>
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
        <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-accent-strong underline underline-offset-2">
          {link[1]}
        </a>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      )
    return <em key={i}>{inline(part.slice(1, -1))}</em>
  })
}
