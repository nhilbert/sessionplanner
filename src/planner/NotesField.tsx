import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, Eye, Heading, Italic, List, Maximize2, PenLine } from 'lucide-react'
import Markdown from '@/components/Markdown'
import { sourceOffset } from '@/domain/markdown'
import { cx, IconButton, Modal } from '@/components/ui'

/**
 * Notes with basic Markdown (components/Markdown.tsx). They stand formatted, as they read: a click into them (or
 * the pencil) turns them into the field with its small toolbar, at the word clicked, and leaving the field shows
 * them formatted again. A link is followed and words can be marked to copy without the field opening; empty notes
 * are the field at once. A large editor has text and preview side by side. Saves like the other fields (after a
 * pause, on leaving) and is not overwritten by other windows while you type.
 */
// Not inside a <label>: a click there is passed on to the label's first control, which would be the preview button.
export default function NotesField({
  value,
  onCommit,
  label,
  hint,
  tall,
  frame,
}: {
  value: string
  onCommit: (v: string) => void
  label: string
  hint?: string
  /** Where the notes have room (the details shown large): the field starts higher. */
  tall?: boolean
  /** The place draws the heading itself (a section that folds) and gets the two buttons and the field to put there. */
  frame?: (parts: { tools: ReactNode; body: ReactNode }) => ReactNode
}) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(value)
  const [preview, setPreview] = useState(true)
  const [large, setLarge] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  /** Where the caret goes in the field a click into the formatted notes opens. */
  const caret = useRef<number | null>(null)
  const typing = useRef(false)
  /** Typed since the last save: a field merely visited never writes back the text it showed. */
  const dirty = useRef(false)
  const stored = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  stored.current = value

  useEffect(() => {
    if (!typing.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (v: string) => {
    clearTimeout(timer.current)
    dirty.current = false
    if (v !== stored.current) onCommit(v)
  }
  const change = (v: string) => {
    dirty.current = true
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(v), 800)
  }

  /** The field is left: what was typed is saved, what was only visited shows the stored text again. */
  const leave = () => {
    if (!typing.current) return
    typing.current = false
    if (dirty.current) commit(local)
    else setLocal(stored.current)
  }
  const editor = (big: boolean) => (
    <Editor
      value={local}
      big={big}
      tall={tall}
      label={label}
      caret={big ? undefined : caret}
      onChange={change}
      onFocus={() => {
        typing.current = true
        // empty notes are the field although nobody opened it: typing into it must not turn it into the formatted view
        if (!big) setPreview(false)
      }}
      onBlur={leave}
    />
  )

  // Empty notes have nothing to show formatted: they are the field.
  const formatted = preview && !!local.trim()
  const edit = (at: number) => {
    caret.current = at
    setPreview(false)
  }
  const tools = (
    <>
      {/* keeps the focus where it is, so the click decides alone: a field that lost it would already stand formatted */}
      <IconButton
        label={formatted ? t('notes.edit') : t('notes.preview')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (formatted) return edit(local.length)
          leave()
          setPreview(true)
        }}
      >
        {formatted ? <PenLine size={14} /> : <Eye size={14} />}
      </IconButton>
      <IconButton
        label={t('notes.enlarge')}
        onClick={() => {
          // the large editor takes over: behind it and after it the notes stand formatted
          setPreview(true)
          setLarge(true)
        }}
      >
        <Maximize2 size={14} />
      </IconButton>
    </>
  )
  const body = formatted ? (
    // Not a button: it holds links, and its words can be marked.
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      onClick={(e) => {
        const selection = window.getSelection()
        if ((e.target as HTMLElement).closest('a') || (selection && !selection.isCollapsed)) return
        edit(caretOf(e.currentTarget, selection, local))
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        edit(local.length)
      }}
      className="w-full cursor-text rounded-lg border border-line bg-surface px-3 py-2 text-[14px] leading-relaxed"
    >
      <Markdown text={local} />
    </div>
  ) : (
    editor(false)
  )

  return (
    // Leaving the field (not for another window, where the caret waits, and not for its own buttons) shows the notes formatted again.
    <div ref={root} onBlur={(e) => void (document.hasFocus() && !root.current?.contains(e.relatedTarget) && setPreview(true))}>
      {frame ? (
        frame({ tools, body })
      ) : (
        <>
          <div className="mb-1 flex items-center gap-0.5">
            <span className="mr-auto text-[13px] font-semibold text-brand-ink">
              {label}
              {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
            </span>
            {tools}
          </div>
          {body}
        </>
      )}
      <Modal open={large} onClose={() => setLarge(false)} width="max-w-5xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">{label}</h2>
          <button type="button" onClick={() => setLarge(false)} className="rounded-md px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2">
            {t('time.done')}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {editor(true)}
          <div className="hidden max-h-[72vh] overflow-y-auto rounded-lg border border-line bg-surface-2/40 px-4 py-3 text-[14px] leading-relaxed md:block">
            {local.trim() ? <Markdown text={local} /> : <span className="text-ink-3">{t('notes.empty')}</span>}
          </div>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">{t('notes.syntax')}</p>
      </Modal>
    </div>
  )
}

/** Where a click into the formatted notes lies in their text: at the word clicked, else at the end. */
function caretOf(shown: HTMLElement, selection: Selection | null, source: string): number {
  const node = selection?.anchorNode
  if (!selection || !node || node.nodeType !== Node.TEXT_NODE || !shown.contains(node)) return source.length
  const before = document.createRange()
  before.setStart(shown, 0)
  before.setEnd(node, 0)
  return sourceOffset(source, before.toString(), node.textContent ?? '', selection.anchorOffset)
}

/** The text area with its toolbar; grows with the text (the large one fills the dialog). */
function Editor({ value, big, tall, label, caret, onChange, onFocus, onBlur }: { value: string; big: boolean; tall?: boolean; label: string; /** Set where the field opens to be typed in at once: the caret's place. */ caret?: { current: number | null }; onChange: (v: string) => void; onFocus: () => void; onBlur: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    const at = caret?.current ?? null
    if (!el || !caret || at === null) return
    caret.current = null
    // the caret first: the focus then brings it into view
    el.setSelectionRange(at, at)
    el.focus()
  }, [caret])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || big) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, tall ? 260 : 120), window.innerHeight * 0.6)}px`
  }, [value, big, tall])

  /** Wraps the selection (bold, italic) or prefixes its lines (list, heading). */
  const format = (kind: 'bold' | 'italic' | 'list' | 'heading') => {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    let next: string
    let selA = a
    let selB = b
    if (kind === 'bold' || kind === 'italic') {
      const mark = kind === 'bold' ? '**' : '*'
      next = value.slice(0, a) + mark + value.slice(a, b) + mark + value.slice(b)
      selA = a + mark.length
      selB = b + mark.length
    } else {
      const start = value.lastIndexOf('\n', a - 1) + 1
      const prefix = kind === 'list' ? '- ' : '## '
      const lines = value.slice(start, b).split('\n').map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
      next = value.slice(0, start) + lines.join('\n') + value.slice(b)
      selA = start
      selB = start + lines.join('\n').length
    }
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selA, selB)
    })
  }

  return (
    <div className="rounded-lg border border-line bg-surface focus-within:border-[color-mix(in_oklab,var(--accent)_60%,var(--line))]">
      <div className="flex items-center gap-0.5 border-b border-line px-1 py-0.5">
        {(
          [
            ['bold', Bold, t('notes.bold')],
            ['italic', Italic, t('notes.italic')],
            ['list', List, t('notes.list')],
            ['heading', Heading, t('notes.heading')],
          ] as const
        ).map(([kind, Icon, name]) => (
          <IconButton key={kind} label={name} onMouseDown={(e) => e.preventDefault()} onClick={() => format(kind)}>
            <Icon size={13} />
          </IconButton>
        ))}
      </div>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cx('block w-full resize-y bg-transparent px-3 py-2 text-[14px] leading-relaxed outline-none', big ? 'h-[60vh] md:h-[72vh]' : 'min-h-[120px]')}
      />
    </div>
  )
}
