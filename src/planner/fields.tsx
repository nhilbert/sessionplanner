import { type ComponentProps, useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { newId } from '@/domain/ops'
import type { Item, ItemKind } from '@/domain/types'
import { formatDuration, formatTime, parseClock, parseDuration } from '@/domain/time'
import { cx } from '@/components/ui'

/**
 * A text field bound to a stored value. It saves after a short pause and on leaving the field, and while
 * you type it is not overwritten by changes from other windows; once you leave it, it shows theirs again.
 * Only what you typed is saved: a field you merely visited never writes back the text it showed.
 */
export function TextField({
  value,
  onCommit,
  multiline,
  className,
  ...props
}: { value: string; onCommit: (value: string) => void; multiline?: boolean; className?: string } & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'ref'>) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)
  /** Typed since the last save. */
  const dirty = useRef(false)
  const stored = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  stored.current = value

  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (v: string) => {
    clearTimeout(timer.current)
    dirty.current = false
    if (v !== stored.current) onCommit(v)
  }
  const common = {
    value: local,
    onFocus: () => void (focused.current = true),
    onBlur: () => {
      focused.current = false
      if (dirty.current) commit(local)
      else setLocal(stored.current)
    },
    onChange: (e: { target: { value: string } }) => {
      dirty.current = true
      setLocal(e.target.value)
      clearTimeout(timer.current)
      const v = e.target.value
      timer.current = setTimeout(() => commit(v), 800)
    },
  }
  if (multiline)
    return (
      <textarea
        {...common}
        placeholder={props.placeholder}
        aria-label={props['aria-label']}
        className={cx('field min-h-[84px] resize-y py-2 leading-relaxed', className)}
      />
    )
  return <input {...props} {...common} className={cx('field', className)} />
}

/**
 * HH:MM field for minutes after midnight, the same in every browser language (the native time input shows
 * 12-hour times in English browsers). Saves on Enter or leaving the field; ↑/↓ move by 5 minutes.
 */
export function TimeField({
  value,
  onChange,
  nullable,
  className,
  ...props
}: { value: number | null; onChange: (v: number | null) => void; nullable?: boolean; className?: string } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const shown = value === null ? '' : formatTime(value)
  const [local, setLocal] = useState(shown)
  const focused = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    if (!focused.current) setLocal(shown)
  }, [shown])
  const commit = (cancel = false) => {
    const typed = dirty.current
    dirty.current = false
    // Left without typing: show the stored time (another window may have changed it meanwhile).
    if (!typed) return setLocal(shown)
    const text = cancel ? shown : local.trim()
    const v = parseClock(text)
    if (v !== null && v !== value) onChange(v)
    else if (nullable && text === '' && value !== null) onChange(null)
    else setLocal(shown)
  }
  return (
    <input
      inputMode="numeric"
      placeholder={nullable ? '––:––' : undefined}
      {...props}
      className={cx('field tnum h-8 px-2 text-center text-[13px]', className)}
      value={local}
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onChange={(e) => {
        dirty.current = true
        setLocal(e.target.value)
      }}
      onBlur={() => {
        if (!focused.current) return
        focused.current = false
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          focused.current = false
          commit(true)
          e.currentTarget.blur()
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
          e.preventDefault()
          const next = Math.min(1435, Math.max(0, value + (e.key === 'ArrowUp' ? 5 : -5)))
          setLocal(formatTime(next))
          onChange(next)
        }
      }}
    />
  )
}

/**
 * A quantity (whole number, 0 or more). Saved on Enter or leaving the field, not on every keystroke (one change,
 * one undo step); an empty or unreadable field goes back to the stored quantity.
 */
export function QtyField({ value, onChange, className, ...props }: { value: number; onChange: (v: number) => void; className?: string } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(String(value))
  const focused = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    if (!focused.current) setLocal(String(value))
  }, [value])
  const commit = () => {
    const typed = dirty.current
    dirty.current = false
    const qty = Number(local)
    if (typed && local.trim() !== '' && Number.isInteger(qty) && qty >= 0 && qty <= 100_000 && qty !== value) onChange(qty)
    else setLocal(String(value))
  }
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      {...props}
      value={local}
      onFocus={() => void (focused.current = true)}
      onChange={(e) => {
        dirty.current = true
        setLocal(e.target.value)
      }}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={cx('field tnum h-8 w-14 px-1.5 text-center text-[13px]', className)}
    />
  )
}

export const DEFAULT_DURATION: Record<ItemKind, number> = { block: 30, break: 15, marker: 0, note: 0 }

export function newItem(t: TFunction, workshopId: string, dayId: string | null, kind: ItemKind, position: number): Item {
  const titles: Record<ItemKind, string> = { block: t('item.newBlock'), break: t('item.newBreak'), marker: t('item.newMarker'), note: '' }
  return {
    id: newId(),
    workshopId,
    dayId,
    position,
    groupId: null,
    kind,
    title: titles[kind],
    description: '',
    duration: DEFAULT_DURATION[kind],
    fixedStart: null,
    goal: '',
    method: '',
    lead: '',
    notes: '',
    materials: [],
    attachmentIds: [],
    slides: [],
    categoryId: null,
    color: null,
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** A length typed in any common form ("90", "1:30", "1h30", "1,5 h"); shows "1 h 30 min" while not editing. */
export function DurationField({ value, onChange, className, ...props }: { value: number; onChange: (v: number) => void; className?: string } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(formatDuration(value))
  const focused = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    if (!focused.current) setLocal(formatDuration(value))
  }, [value])
  const commit = () => {
    const typed = dirty.current
    dirty.current = false
    const v = typed ? parseDuration(local) : undefined
    if (v !== undefined && v !== value) onChange(v)
    else setLocal(formatDuration(value))
  }
  return (
    <input
      {...props}
      className={cx('field tnum h-8 px-2 text-center text-[13px]', className)}
      value={local}
      onFocus={(e) => {
        focused.current = true
        setLocal(String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => {
        dirty.current = true
        setLocal(e.target.value)
      }}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          dirty.current = false
          setLocal(String(value))
          e.currentTarget.blur()
        }
      }}
    />
  )
}
