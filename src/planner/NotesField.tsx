import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, Eye, Heading, Italic, List, Maximize2, PenLine } from 'lucide-react'
import Markdown from '@/components/Markdown'
import { cx, IconButton, Modal } from '@/components/ui'

/**
 * Notes with basic Markdown (components/Markdown.tsx): a field that grows with its text, a small toolbar, a
 * preview, and a large editor with text and preview side by side. Saves like the other fields (after a pause,
 * on leaving) and is not overwritten by other windows while you type.
 */
// Not inside a <label>: a click there is passed on to the label's first control, which would be the preview button.
export default function NotesField({ value, onCommit, label, hint }: { value: string; onCommit: (v: string) => void; label: string; hint?: string }) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(value)
  const [preview, setPreview] = useState(false)
  const [large, setLarge] = useState(false)
  const typing = useRef(false)
  const stored = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  stored.current = value

  useEffect(() => {
    if (!typing.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (v: string) => {
    clearTimeout(timer.current)
    if (v !== stored.current) onCommit(v)
  }
  const change = (v: string) => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(v), 800)
  }

  const editor = (big: boolean) => (
    <Editor
      value={local}
      big={big}
      label={label}
      onChange={change}
      onFocus={() => void (typing.current = true)}
      onBlur={() => {
        typing.current = false
        commit(local)
      }}
    />
  )

  return (
    <div>
      <div className="mb-1 flex items-center gap-0.5">
        <span className="mr-auto text-[12px] font-medium text-ink-2">
          {label}
          {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
        </span>
        <IconButton label={preview ? t('notes.edit') : t('notes.preview')} onClick={() => setPreview(!preview)}>
          {preview ? <PenLine size={14} /> : <Eye size={14} />}
        </IconButton>
        <IconButton label={t('notes.enlarge')} onClick={() => setLarge(true)}>
          <Maximize2 size={14} />
        </IconButton>
      </div>
      {preview ? (
        <button type="button" onClick={() => setPreview(false)} className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[14px] leading-relaxed">
          {local.trim() ? <Markdown text={local} /> : <span className="text-ink-3">{t('notes.empty')}</span>}
        </button>
      ) : (
        editor(false)
      )}
      <Modal open={large} onClose={() => setLarge(false)} width="max-w-5xl" top="pt-4 md:pt-[6vh]">
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

/** The text area with its toolbar; grows with the text (the large one fills the dialog). */
function Editor({ value, big, label, onChange, onFocus, onBlur }: { value: string; big: boolean; label: string; onChange: (v: string) => void; onFocus: () => void; onBlur: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || big) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 120), window.innerHeight * 0.6)}px`
  }, [value, big])

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
