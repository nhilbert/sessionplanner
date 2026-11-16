import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Check, Minus, RotateCcw, Trash2, X } from 'lucide-react'
import { hasTag, parseTags, tagCounts } from '@/domain/tags'
import { formatDate } from '@/i18n'
import { Button, cx, isTyping, useLocalState } from './ui'

/**
 * What the lists of the app share (workshops, library): a sort that is remembered, a selection of several rows with
 * its bar of actions, tags to filter by, the trash and the note that offers to undo. Each list brings its own rows,
 * columns and actions.
 */

// ---- sorting ---------------------------------------------------------------------------------------------------

export interface SortOption<T> {
  key: string
  label: string
  /** The value a row is sorted by; rows without one (null) come last, whichever way the sort runs. */
  value: (row: T) => string | number | null
  /** The direction a first click gives: newest first for dates, A to Z for names. */
  first?: 'asc' | 'desc'
}

export interface Sort {
  key: string
  dir: 'asc' | 'desc'
}

/** The sort of a list, remembered per device under `name`. */
export function useSort<T>(name: string, options: SortOption<T>[], initial: Sort): { sort: Sort; setSort: (s: Sort) => void; toggle: (key: string) => void; sorted: (rows: T[]) => T[] } {
  const [stored, setStored] = useLocalState(name, `${initial.key}:${initial.dir}`)
  const [key, dir] = stored.split(':')
  const option = options.find((o) => o.key === key) ?? options.find((o) => o.key === initial.key) ?? options[0]
  const sort: Sort = { key: option.key, dir: dir === 'asc' || dir === 'desc' ? dir : initial.dir }
  const setSort = (s: Sort) => setStored(`${s.key}:${s.dir}`)
  return {
    sort,
    setSort,
    // A click on the sorted column turns it round; on another one it sorts by that, in its usual direction.
    toggle: (k) => setSort(k === sort.key ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: options.find((o) => o.key === k)?.first ?? 'asc' }),
    sorted: (rows) => sortRows(rows, option, sort.dir),
  }
}

export function sortRows<T>(rows: T[], option: SortOption<T>, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = option.value(a)
    const y = option.value(b)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true }))
  })
}

/** Sort field and direction as two controls, for lists without column heads (cards, phones). */
export function SortControl<T>({ options, sort, onChange }: { options: SortOption<T>[]; sort: Sort; onChange: (s: Sort) => void }) {
  const { t } = useTranslation()
  const direction = t(sort.dir === 'asc' ? 'list.ascending' : 'list.descending')
  return (
    <div className="inline-flex items-center gap-1">
      <select
        aria-label={t('list.sortBy')}
        title={t('list.sortBy')}
        value={sort.key}
        onChange={(e) => onChange({ key: e.target.value, dir: options.find((o) => o.key === e.target.value)?.first ?? 'asc' })}
        className="field h-8 w-auto text-[13px] pointer-coarse:h-9"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={direction}
        title={direction}
        onClick={() => onChange({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        className="tap inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:text-ink pointer-coarse:h-9 pointer-coarse:w-9"
      >
        {sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </button>
    </div>
  )
}

/** A column head that sorts: a button, with the direction shown on the sorted column only (aria-sort goes on the cell around it). */
export function SortHead({ id, label, sort, onToggle, className }: { id: string; label: string; sort: Sort; onToggle: (key: string) => void; className?: string }) {
  const active = sort.key === id
  return (
    <button type="button" onClick={() => onToggle(id)} className={cx('group inline-flex items-center gap-1 text-[12px] hover:text-ink', active ? 'text-ink' : 'text-ink-3', className)}>
      {label}
      <span className={cx('inline-flex', !active && 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60')}>{active && sort.dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}</span>
    </button>
  )
}

export const ariaSort = (id: string, sort: Sort): 'ascending' | 'descending' | undefined => (sort.key === id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined)

// ---- selection -------------------------------------------------------------------------------------------------

export interface Selection {
  /** The selected rows among those shown, in their order. */
  ids: string[]
  has: (id: string) => boolean
  /** Ticks or unticks a row; with Shift every row from the last one ticked to this one. */
  toggle: (id: string, range?: boolean) => void
  /** Whether all, some or none of the rows shown are selected. */
  all: boolean | 'mixed'
  toggleAll: () => void
  clear: () => void
}

/**
 * The selection of a list. It holds only rows that are shown: what a search or filter hides is no longer selected, so
 * an action never reaches a row out of sight. Escape and Ctrl+A work as in a file manager (not while typing).
 */
export function useSelection(shown: string[]): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const ids = useMemo(() => shown.filter((id) => picked.has(id)), [shown, picked])
  const all = ids.length === 0 ? false : ids.length === shown.length ? true : 'mixed'
  const clear = () => {
    anchor.current = null
    setPicked(new Set())
  }
  const toggleAll = () => setPicked(all === true ? new Set() : new Set(shown))
  const live = useRef({ ids, shown, clear, toggleAll })
  live.current = { ids, shown, clear, toggleAll }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return
      if (e.key === 'Escape' && live.current.ids.length) live.current.clear()
      // Only once a selection is under way: otherwise Ctrl+A stays the browser's.
      if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey) && live.current.ids.length) {
        e.preventDefault()
        setPicked(new Set(live.current.shown))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return {
    ids,
    has: (id) => picked.has(id),
    toggle: (id, range) => {
      const next = new Set(ids)
      const from = range && anchor.current ? shown.indexOf(anchor.current) : -1
      const to = shown.indexOf(id)
      if (from >= 0 && to >= 0) for (const x of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(x)
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      anchor.current = id
      setPicked(next)
    },
    all,
    toggleAll,
    clear,
  }
}

/** The tick of a row, or of all rows ('mixed': some of them). Shift-click reaches the caller, for ranges. */
export function SelectBox({ state, onToggle, label, className }: { state: boolean | 'mixed'; onToggle: (range: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e.shiftKey)
      }}
      className={cx('tap inline-flex h-7 w-7 shrink-0 items-center justify-center pointer-coarse:h-9 pointer-coarse:w-9', className)}
    >
      <span className={cx('flex h-[16px] w-[16px] items-center justify-center rounded-[5px] border transition-colors', state ? 'border-accent bg-accent text-accent-ink' : 'border-line-2 bg-surface hover:border-ink-3')}>
        {state === true && <Check size={11} strokeWidth={3} />}
        {state === 'mixed' && <Minus size={11} strokeWidth={3} />}
      </span>
    </button>
  )
}

/** "Select all" over a list, saying what it would select: the rows shown. */
export function SelectAll({ selection, count }: { selection: Selection; count: number }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-ink-3">
      <SelectBox state={selection.all} onToggle={selection.toggleAll} label={t('list.selectAll', { count })} />
      <span aria-live="polite">{selection.ids.length ? t('list.selected', { count: selection.ids.length, total: count }) : t('list.selectAll', { count })}</span>
    </span>
  )
}

/** The bar that comes up while rows are selected: how many, what can be done with them, and the way out. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  if (!count) return null
  return (
    <div role="toolbar" aria-label={t('list.actions')} className="no-print fade-in fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow)] md:bottom-6">
      <span className="mr-auto whitespace-nowrap text-[13px] font-medium tnum" aria-label={t('list.count', { count })}>
        <span className="md:hidden">{count}</span>
        <span className="hidden md:inline">{t('list.count', { count })}</span>
      </span>
      {children}
      <button type="button" aria-label={t('list.clearSelection')} title={t('list.clearSelection')} onClick={onClear} className="tap inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
        <X size={15} />
      </button>
    </div>
  )
}

// ---- tags ------------------------------------------------------------------------------------------------------

const TAGS_SHOWN = 12

/**
 * Tags to filter a list by, as chips of one size in the order of their names, each with the number of rows it would
 * leave (of those the other filters leave). Several chosen tags narrow the list: a row has to carry all of them.
 */
export function TagFilter({ rows, active, onChange }: { /** The tags of every row the other filters leave. */ rows: string[][]; active: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const all = tagCounts(rows)
  if (!all.length && !active.length) return null
  const matching = rows.filter((tags) => active.every((a) => hasTag(tags, a)))
  const left = new Map(tagCounts(matching).map((c) => [c.tag.toLocaleLowerCase(), c.count]))
  // A chosen tag stays in view even where no row carries it any more (its last entry was just deleted).
  const chips = [...active.filter((a) => !all.some((c) => hasTag([c.tag], a))).map((tag) => ({ tag, count: 0 })), ...all]
  const visible = open ? chips : chips.filter((c, n) => n < TAGS_SHOWN || hasTag(active, c.tag))
  return (
    <div role="group" aria-label={t('tags.filter')} className="flex flex-wrap items-center gap-1.5">
      {visible.map((c) => {
        const on = hasTag(active, c.tag)
        const count = left.get(c.tag.toLocaleLowerCase()) ?? 0
        return (
          <button
            key={c.tag}
            type="button"
            aria-pressed={on}
            disabled={!on && count === 0}
            onClick={() => onChange(on ? active.filter((a) => !hasTag([c.tag], a)) : [...active, c.tag])}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition-colors pointer-coarse:h-9',
              on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink',
              !on && count === 0 && 'opacity-40',
            )}
          >
            {on && <Check size={12} strokeWidth={2.5} />}
            {c.tag}
            <span className={cx('text-[12px] tnum', on ? 'text-accent/80' : 'text-ink-3')}>{count}</span>
          </button>
        )
      })}
      {chips.length > visible.length && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t('tags.more', { count: chips.length - visible.length })}
        </Button>
      )}
      {open && chips.length > TAGS_SHOWN && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('tags.fewer')}
        </Button>
      )}
      {active.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange([])}>
          <X size={13} />
          {t('tags.clear')}
        </Button>
      )}
    </div>
  )
}

/** A field to type tags into: Enter or a comma adds what is typed, the tags in use are offered. */
export function TagInput({ onAdd, known, placeholder, id }: { onAdd: (tags: string[]) => void; known: string[]; placeholder?: string; id: string }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const add = (text: string) => {
    const tags = parseTags(text)
    if (tags.length) onAdd(tags)
    setTyped('')
  }
  return (
    <>
      <input
        value={typed}
        list={id}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setTyped(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && typed.trim()) {
            e.preventDefault()
            add(typed)
          }
        }}
        onBlur={() => typed.trim() && add(typed)}
        placeholder={placeholder ?? t('tags.add')}
        aria-label={t('tags.add')}
        className="field h-7 w-36 min-w-0 flex-1 text-[13px] pointer-coarse:h-9"
      />
      <datalist id={id}>
        {known.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
    </>
  )
}

/** The tags of one row: each with a button to take it off, and a field to add more. */
export function TagEditor({ tags, known, onChange, id }: { tags: string[]; known: string[]; onChange: (tags: string[]) => void; id: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 pl-2.5 pr-1 text-[13px] text-ink-2 pointer-coarse:h-9">
          {tag}
          <button type="button" aria-label={t('tags.remove', { tag })} title={t('tags.remove', { tag })} onClick={() => onChange(tags.filter((x) => x !== tag))} className="tap inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-line hover:text-ink">
            <X size={12} />
          </button>
        </span>
      ))}
      <TagInput id={id} known={known.filter((k) => !hasTag(tags, k))} onAdd={(more) => onChange([...tags, ...more])} />
    </div>
  )
}

/** Tags of a row, to read. */
export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null
  return (
    <span className={cx('inline-flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full bg-surface-2 px-2 text-[12px] leading-none text-ink-2">
          {tag}
        </span>
      ))}
    </span>
  )
}

// ---- trash -----------------------------------------------------------------------------------------------------

export interface TrashRow {
  id: string
  title: string
  deletedAt: string
  purgeAt: string
}

/** The calendar day of a moment, on this device. */
export const localDay = (iso: string) => new Date(iso).toLocaleDateString('sv')
/** A moment as a short date, for the columns of a list. */
export const shortDate = (iso: string) => formatDate(localDay(iso), { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The trash at the end of a list: what was deleted waits here TRASH_DAYS days. Folded away until asked for; each row
 * says when it was deleted and when it goes for good, and can be brought back or deleted at once.
 */
export function TrashSection<T extends TrashRow>({ rows, hint, meta, onRestore, onPurge, purgeConfirm }: { rows: T[]; hint: string; meta?: (row: T) => ReactNode; onRestore: (row: T) => void; onPurge: (rows: T[]) => void; /** What "delete for good" asks first; it cannot be undone. */ purgeConfirm: (rows: T[]) => string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  const label = t('trash.title', { count: rows.length })
  const purge = (list: T[]) => window.confirm(purgeConfirm(list)) && onPurge(list)
  return (
    <div className="mt-6">
      <div className="text-center">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Trash2 size={14} />
          {open ? t('trash.hide') : label}
        </Button>
      </div>
      {open && (
        <section aria-label={label} className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[13px] text-ink-3">{hint}</p>
            {rows.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => purge(rows)}>
                {t('trash.empty')}
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="card flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink-2">{r.title || t('trash.untitled')}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-3">
                    {meta?.(r)}
                    <span>{t('trash.deletedOn', { date: formatDate(localDay(r.deletedAt)) })}</span>
                    <span>{t('trash.purgeOn', { date: formatDate(localDay(r.purgeAt)) })}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onRestore(r)}>
                    <RotateCcw size={13} />
                    {t('trash.restore')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => purge([r])}>
                    <Trash2 size={13} />
                    {t('trash.purge')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---- undo ------------------------------------------------------------------------------------------------------

export interface Notice {
  text: string
  undo?: () => void
}

const NOTICE_SECONDS = 10

/** A note at the foot of the page after an action, with the way back where there is one. It leaves by itself. */
export function useNotice(): { notice: Notice | null; show: (n: Notice) => void; close: () => void } {
  const [notice, setNotice] = useState<Notice | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [notice])
  return { notice, show: setNotice, close: () => setNotice(null) }
}

export function NoticeBar({ notice, onClose, raised }: { notice: Notice | null; onClose: () => void; /** Above the bar of a selection that is still up. */ raised?: boolean }) {
  const { t } = useTranslation()
  if (!notice) return null
  return (
    <div role="status" className={cx('no-print fade-in fixed left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-ink py-2 pl-4 pr-2 text-[13px] text-paper shadow-[var(--shadow)]', raised ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:bottom-24' : 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-6')}>
      <span className="min-w-0">{notice.text}</span>
      {notice.undo && (
        <button
          type="button"
          onClick={() => {
            notice.undo?.()
            onClose()
          }}
          className="tap shrink-0 rounded-md px-2 py-1 font-medium underline underline-offset-2 hover:bg-paper/15"
        >
          {t('common.undo')}
        </button>
      )}
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="tap inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-paper/15">
        <X size={14} />
      </button>
    </div>
  )
}
