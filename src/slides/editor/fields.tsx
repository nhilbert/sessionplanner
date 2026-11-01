import { type ComponentProps, createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button, cx, IconButton } from '@/components/ui'

/** A translation by a key built at runtime (layout and option names); the typed t() wants literal keys. */
export const tr = (t: TFunction, key: string, opts?: Record<string, unknown>): string => (t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, opts)

/** Nested dialogs (layout picker, picture picker) tell the editor they are open, so Escape closes them first. */
export const SubDialogs = createContext<{ current: number }>({ current: 0 })
export function useSubDialog(open: boolean) {
  const depth = useContext(SubDialogs)
  useEffect(() => {
    if (!open) return
    depth.current++
    return () => {
      depth.current--
    }
  }, [open, depth])
}

/** The id of the input that edits a field path, so the preview can focus it. */
export const fieldId = (path: string) => `f-${path}`

interface Bound {
  /** The field's path in the document ("header.title", "cards.2.text"): its id, and what the preview highlights. */
  path: string
  value: string
  onChange: (value: string) => void
  onFocus: (path: string) => void
  label?: string
  placeholder?: string
  mono?: boolean
}

/** A one-line field of the slide. */
export function Text({ path, value, onChange, onFocus, label, placeholder, className, ...rest }: Bound & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'onFocus'>) {
  return (
    <input
      id={fieldId(path)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => onFocus(path)}
      placeholder={placeholder}
      aria-label={label}
      className={cx('field h-8 text-[13px]', className)}
      {...rest}
    />
  )
}

/** A growing multi-line field of the slide (one to many lines; the inline markup **bold**, *italic*, ==accent==). */
export function Area({ path, value, onChange, onFocus, label, placeholder, mono, className, rows = 1 }: Bound & { className?: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(el.scrollHeight, rows * 20 + 12)}px`
  }, [value, rows])
  return (
    <textarea
      ref={ref}
      id={fieldId(path)}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => onFocus(path)}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={!mono}
      className={cx('field min-h-0 resize-none overflow-hidden py-1.5 text-[13px] leading-[20px]', mono && 'font-mono text-[12px]', className)}
    />
  )
}

/** A label above a field or a group of fields. */
export function Row({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('block', className)}>
      <div className="mb-1 flex items-baseline justify-between text-[12px] font-medium text-ink-2">
        <span>{label}</span>
        {hint && <span className="font-normal text-ink-3">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** A small switch (an option of the layout, a flag on a card). */
export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx('tap inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors pointer-coarse:h-9', checked ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-2 hover:text-ink')}
    >
      <span className={cx('h-2 w-2 rounded-full', checked ? 'bg-accent' : 'bg-line-2')} />
      {children}
    </button>
  )
}

/** The frame of one entry in a list of the slide (a point, a card, a step): its number, up, down, remove; the fields inside. */
export function Entry({ n, count, onMove, onRemove, children, label }: { n: number; count: number; onMove: (dir: -1 | 1) => void; onRemove: () => void; children: ReactNode; label?: string }) {
  const { t } = useTranslation()
  return (
    <li className="rounded-lg border border-line bg-surface-2/50 p-2">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-[11px] font-medium text-ink-3 tnum">{label ?? n + 1}</span>
        <span className="flex-1" />
        <IconButton label={t('editor.up')} onClick={() => onMove(-1)} disabled={n === 0}>
          <ArrowUp size={13} />
        </IconButton>
        <IconButton label={t('editor.down')} onClick={() => onMove(1)} disabled={n >= count - 1}>
          <ArrowDown size={13} />
        </IconButton>
        <IconButton label={t('editor.remove')} onClick={onRemove}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="space-y-1.5">{children}</div>
    </li>
  )
}

/** A list of entries with an add button and the count against the layout's room. */
export function Entries<T>({ items, onChange, make, render, max, label }: { items: T[]; onChange: (items: T[]) => void; make: () => T; render: (item: T, set: (next: T) => void, i: number) => ReactNode; max?: number; label: ReactNode }) {
  const { t } = useTranslation()
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange(next)
  }
  return (
    <Row label={label} hint={<span className={cx('tnum', max !== undefined && items.length > max && 'text-amber')}>{max !== undefined ? `${items.length} / ${max}` : items.length}</span>}>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <Entry key={i} n={i} count={items.length} onMove={(dir) => move(i, dir)} onRemove={() => onChange(items.filter((_, k) => k !== i))}>
            {render(item, (next) => onChange(items.map((x, k) => (k === i ? next : x))), i)}
          </Entry>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => onChange([...items, make()])}>
        <Plus size={13} />
        {t('editor.add')}
      </Button>
    </Row>
  )
}
