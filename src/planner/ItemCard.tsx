import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { Flag, NotebookPen, Package, Paperclip, Pin, StickyNote } from 'lucide-react'
import type { Item, PaletteKey } from '@/domain/types'
import type { ItemFields } from '@/domain/ops'
import { durationOf, formatDuration, formatTime, parseClock, parseDuration, snap, SNAP, type Slot } from '@/domain/time'
import { cx } from '@/components/ui'
import type { TimeMode } from './TimeEditor'

export const MIN_CARD = 40

export interface CardProps {
  item: Item
  slot?: Slot
  /** End of the segment the item belongs to, for "does not fit before …". */
  segmentEnd?: number | null
  /** Pixels per minute; undefined = compact (parking lot, drag overlay). */
  ppm?: number
  color?: PaletteKey | null
  showDescription?: boolean
  selected?: boolean
  /** Duration shown while the lower edge is being dragged. */
  duration?: number
  /** The title is edited right on the card (default). Off on phones, where a tap anywhere opens the details. */
  inlineTitle?: boolean
  onSelect?: (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  /** Edits made right on the card (title, start time, duration). */
  onEdit?: (fields: Partial<ItemFields>) => void
  /** Opens the time editor for the start time or the length (on the timeline). */
  onOpenTime?: (mode: TimeMode, anchor: DOMRect) => void
  onResize?: (minutes: number | null) => void
  onResizeEnd?: (minutes: number) => void
}

export function SortableItem({ after, ...props }: CardProps & { after?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cx('relative touch-manipulation select-none [-webkit-touch-callout:none]', isDragging && 'opacity-30')}
    >
      <ItemCard {...props} />
      {after}
    </div>
  )
}

/** Keeps a click or drag inside an inline editor from starting a drag or opening the details. */
const shield = {
  onPointerDown: (e: SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: SyntheticEvent) => e.stopPropagation(),
  onClick: (e: SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
}

/** Text that turns into an input on click; Enter or leaving saves, Escape cancels. */
export function Inline({
  value,
  display,
  parse,
  onSave,
  className,
  inputClassName,
  label,
  disabled,
}: {
  value: string
  display?: React.ReactNode
  parse?: (v: string) => unknown | undefined
  onSave?: (v: unknown) => void
  className?: string
  inputClassName?: string
  label: string
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const done = useRef(false)
  useEffect(() => {
    if (!editing) setText(value)
  }, [value, editing])
  if (!onSave || disabled) return <span className={className}>{display ?? value}</span>
  if (!editing)
    return (
      <span
        role="button"
        tabIndex={-1}
        title={label}
        onClick={(e) => {
          // Shift/Ctrl/Cmd-click selects the card instead; dragging from here works as from anywhere on the card.
          if (e.shiftKey || e.metaKey || e.ctrlKey) return
          e.stopPropagation()
          done.current = false
          setEditing(true)
        }}
        className={cx('cursor-text rounded px-0.5 underline decoration-transparent decoration-dotted underline-offset-2 hover:bg-ink/5 hover:decoration-current', className)}
      >
        {display ?? value}
      </span>
    )
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    setEditing(false)
    if (!save || text === value) return
    const parsed = parse ? parse(text) : text
    if (parsed !== undefined) onSave(parsed)
  }
  return (
    <input
      autoFocus
      aria-label={label}
      value={text}
      {...shield}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      className={cx('min-w-0 rounded border border-line-2 bg-surface px-1 py-0 outline-none', inputClassName)}
    />
  )
}

// Empty start: the item flows again; anything unreadable is ignored.
/** A start time or length on the card: one click opens the time editor right there; dragging still moves the card. */
function TimeButton({ label, onOpen, className, children }: { label: string; onOpen: (anchor: DOMRect) => void; className?: string; children: React.ReactNode }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      title={label}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) return
        e.stopPropagation()
        onOpen(e.currentTarget.getBoundingClientRect())
      }}
      className={cx('tap cursor-pointer rounded px-1 py-0.5 -mx-1 ring-line-2 transition-colors hover:bg-ink/5 hover:ring-1', className)}
    >
      {children}
    </span>
  )
}

const parseStart = (v: string): number | null | undefined => (v.trim() ? (parseClock(v) ?? undefined) : null)

export function ItemCard({ item, slot, segmentEnd, ppm, color, showDescription = true, selected, duration, inlineTitle = true, onSelect, onEdit, onOpenTime, onResize, onResizeEnd }: CardProps) {
  const { t } = useTranslation()
  const minutes = duration ?? durationOf(item)
  const timed = slot !== undefined
  const late = slot?.late && segmentEnd !== undefined && segmentEnd !== null
  const ring = selected ? 'ring-2 ring-accent/60' : ''
  const style = { '--cat': color ? `var(--c-${color})` : undefined } as React.CSSProperties
  const select = (e: React.MouseEvent) => onSelect?.(e)
  const title = (className?: string) => (
    <Inline value={item.title} display={item.title || t(`kinds.${item.kind}`)} label={t('item.title')} disabled={!inlineTitle} onSave={onEdit && ((v) => onEdit({ title: v as string }))} className={className} inputClassName="w-full font-medium" />
  )
  const startLabel = timed && (
    <span className="inline-flex items-center gap-0.5">
      {formatTime(slot.start)}
      {item.fixedStart !== null && <Pin size={10} className="text-ink-3" />}
    </span>
  )
  const start =
    timed &&
    (onOpenTime ? (
      <TimeButton label={t('item.fixedStart')} onOpen={(r) => onOpenTime('start', r)} className="tnum shrink-0 text-ink-2">
        {startLabel}
      </TimeButton>
    ) : (
      <Inline
        value={item.fixedStart !== null ? formatTime(item.fixedStart) : formatTime(slot.start)}
        display={startLabel}
        parse={parseStart}
        label={t('item.fixedStart')}
        onSave={onEdit && ((v) => onEdit({ fixedStart: v as number | null }))}
        className="tnum shrink-0 text-ink-2"
        inputClassName="tnum w-14"
      />
    ))

  const notices = slot && (slot.gap > 0 || slot.overlap > 0) && (
    <div className={cx('mb-1 flex items-center gap-1 px-1 text-[11px] tnum', slot.overlap > 0 ? 'text-rose' : 'text-ink-3')}>
      <span className="h-px flex-1 bg-current opacity-40" />
      {slot.overlap > 0 ? t('planner.overlap', { d: formatDuration(slot.overlap) }) : t('planner.gap', { d: formatDuration(slot.gap) })}
      <span className="h-px flex-1 bg-current opacity-40" />
    </div>
  )

  if (item.kind === 'marker')
    return (
      <div className="pb-1" style={style}>
        {notices}
        <div onClick={select} className={cx('flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-2', ring)}>
          {start && <span className="w-12 shrink-0">{start}</span>}
          <Flag size={13} className="shrink-0" style={{ color: color ? `var(--c-${color})` : 'var(--accent)' }} />
          {title('min-w-0 truncate font-medium')}
          <span className="h-px min-w-4 flex-1 bg-line-2" />
        </div>
      </div>
    )

  if (item.kind === 'note')
    return (
      <div className="pb-1" style={style}>
        {notices}
        <div onClick={select} className={cx('flex cursor-pointer gap-2 rounded-md bg-amber-soft/60 px-2 py-1.5 text-[13px] hover:bg-amber-soft', ring)}>
          <StickyNote size={13} className="mt-0.5 shrink-0 text-amber" />
          <div className="min-w-0 flex-1">
            <div className="italic">{title('line-clamp-2')}</div>
            {showDescription && item.description && <div className="line-clamp-3 text-ink-2">{item.description}</div>}
          </div>
        </div>
      </div>
    )

  const height = ppm ? Math.max(MIN_CARD, minutes * ppm) : undefined
  const roomy = !height || height >= 60
  return (
    <div className="pb-1" style={style}>
      {notices}
      <div
        onClick={select}
        style={{ height }}
        className={cx(
          'relative flex cursor-pointer overflow-hidden rounded-lg border text-[13px] transition-shadow hover:shadow-[var(--shadow)]',
          item.kind === 'break' ? 'item-break' : 'cat-tint',
          late && 'item-late',
          ring,
        )}
      >
        {color && <span className="cat-bar w-[3px] shrink-0" />}
        <div className="min-w-0 flex-1 px-2.5 py-1.5">
          <div className="flex items-baseline gap-2">
            {start && <span className="shrink-0 text-[12px]">{start}</span>}
            <span className={cx('min-w-0 flex-1 truncate font-medium', item.kind === 'break' && 'text-ink-2')}>{title()}</span>
            {onOpenTime ? (
              <TimeButton label={t('item.duration')} onOpen={(r) => onOpenTime('duration', r)} className="tnum shrink-0 text-[11px] text-ink-3">
                {formatDuration(minutes)}
              </TimeButton>
            ) : (
              <Inline
                value={String(minutes)}
                display={formatDuration(minutes)}
                parse={parseDuration}
                label={t('item.duration')}
                onSave={onEdit && ((v) => onEdit({ duration: v as number }))}
                className="tnum shrink-0 text-[11px] text-ink-3"
                inputClassName="tnum w-12 text-right text-[12px]"
              />
            )}
          </div>
          {roomy && showDescription && item.description && <div className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12px] leading-snug text-ink-2">{item.description}</div>}
          {roomy && (
            <div className="mt-1 flex items-center gap-2 text-ink-3">
              {item.notes && <NotebookPen size={11} />}
              {item.materials.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]">
                  <Package size={11} />
                  {item.materials.length}
                </span>
              )}
              {item.attachmentIds.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]">
                  <Paperclip size={11} />
                  {item.attachmentIds.length}
                </span>
              )}
              {item.lead && <span className="truncate text-[11px]">{item.lead}</span>}
            </div>
          )}
          {late && <div className="mt-0.5 truncate text-[11px] text-rose">{t('planner.late', { time: formatTime(segmentEnd!) })}</div>}
        </div>
        {onResize && onResizeEnd && ppm && <ResizeHandle minutes={durationOf(item)} ppm={ppm} onResize={onResize} onResizeEnd={onResizeEnd} />}
      </div>
    </div>
  )
}

/** The lower edge: drag to change the duration in steps of 5 minutes. Taller on touch screens, where it also keeps the page from scrolling instead. */
function ResizeHandle({ minutes, ppm, onResize, onResizeEnd }: { minutes: number; ppm: number; onResize: (m: number | null) => void; onResizeEnd: (m: number) => void }) {
  const start = useRef<{ y: number; current: number } | null>(null)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const value = (y: number) => Math.max(SNAP, snap(minutes + (y - start.current!.y) / ppm))
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className="reveal absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-end justify-center opacity-0 transition-opacity hover:opacity-100 pointer-coarse:h-5 [div:hover>&]:opacity-60"
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={stop}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { y: e.clientY, current: minutes }
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const m = value(e.clientY)
        if (m !== start.current.current) {
          start.current.current = m
          onResize(m)
        }
      }}
      onPointerUp={(e) => {
        if (!start.current) return
        const m = value(e.clientY)
        start.current = null
        onResize(null)
        if (m !== minutes) onResizeEnd(m)
      }}
      onPointerCancel={() => {
        start.current = null
        onResize(null)
      }}
    >
      <span className="mb-0.5 h-1 w-8 rounded-full bg-ink-3 pointer-coarse:mb-1 pointer-coarse:h-1.5 pointer-coarse:w-10" />
    </div>
  )
}
