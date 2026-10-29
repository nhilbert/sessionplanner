import { type ComponentProps, useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { newId } from '@/domain/ops'
import type { Item, ItemKind } from '@/domain/types'
import { formatTime, parseTime } from '@/domain/time'
import { cx } from '@/components/ui'

/**
 * A text field bound to a stored value. It saves after a short pause and on leaving the field, and while
 * you type it is not overwritten by changes from other windows; once you leave it, it shows theirs again.
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
  const stored = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  stored.current = value

  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (v: string) => {
    clearTimeout(timer.current)
    if (v !== stored.current) onCommit(v)
  }
  const common = {
    value: local,
    onFocus: () => void (focused.current = true),
    onBlur: () => {
      focused.current = false
      commit(local)
    },
    onChange: (e: { target: { value: string } }) => {
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
  useEffect(() => {
    if (!focused.current) setLocal(shown)
  }, [shown])
  const commit = (cancel = false) => {
    const text = cancel ? shown : local.trim()
    const v = parseTime(/^\d{3,4}$/.test(text) ? `${text.slice(0, -2)}:${text.slice(-2)}` : text)
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
      onChange={(e) => setLocal(e.target.value)}
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
    categoryId: null,
    color: null,
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
