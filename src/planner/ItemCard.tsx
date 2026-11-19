import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { Coffee, Flag, NotebookPen, Package, Paperclip, Pin, Presentation, StickyNote } from 'lucide-react'
import type { Item, PaletteKey } from '@/domain/types'
import type { ItemFields } from '@/domain/ops'
import { durationOf, formatDuration, formatTime, MAX_DURATION, parseDuration, snap, SNAP, type Slot } from '@/domain/time'
import { cx } from '@/components/ui'
import type { TimeMode } from './TimeEditor'

export const MIN_CARD = 40
/** A break is a quiet row between two cards and may be lower than a unit. */
const MIN_BREAK = 32

/**
 * Where an entry stands in a card. A card is the stretch between two breaks and only a surface: every entry draws
 * its own part of it (and the first one the card's head), so the parts move with their entries while one is dragged.
 */
export interface RunPart {
  first: boolean
  last: boolean
  head?: React.ReactNode
}

export const runClass = (run?: RunPart): string => (run ? cx('run px-[7px]', run.first && 'run-first mt-1', run.last && 'run-last mb-1 pb-1.5') : '')

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
  /** The slide count on the card opens the slide editor on the step. */
  onOpenSlides?: () => void
  /** The entry's part of a card on the timeline; undefined outside one (breaks, the parking lot, inside a group). */
  run?: RunPart
  /** The category's name: the word that goes with the colour of the rail. */
  category?: string
}

export function SortableItem({ after, ...props }: CardProps & { after?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      data-entry={props.item.id}
      // Enter opens the details (the way to title, start and length without a mouse); Space is the drag's, see the sensors.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget && !isDragging) {
          e.preventDefault()
          props.onSelect?.(e)
        } else listeners?.onKeyDown?.(e)
      }}
      className={cx('entry relative touch-manipulation select-none [-webkit-touch-callout:none]', isDragging && 'drag-target')}
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

/**
 * Text that turns into an input on click; Enter or leaving saves, Escape cancels. Only a change typed here is
 * saved: if another window changes the value meanwhile, leaving without typing keeps theirs.
 */
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
  /** The value when editing began. */
  const original = useRef(value)
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
          original.current = value
          setText(value)
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
    if (!save || text === original.current) return
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

export function ItemCard({ item, slot, segmentEnd, ppm, color, showDescription = true, selected, duration, inlineTitle = true, onSelect, onEdit, onOpenTime, onResize, onResizeEnd, onOpenSlides, run, category }: CardProps) {
  const { t } = useTranslation()
  const minutes = duration ?? durationOf(item)
  const timed = slot !== undefined
  const late = slot?.late && segmentEnd !== undefined && segmentEnd !== null
  // Selection is a fill in the action's light tone, as everywhere in the app.
  const tone = selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
  const style = { '--cat': color ? `var(--c-${color})` : undefined } as React.CSSProperties
  const select = (e: React.MouseEvent) => onSelect?.(e)
  const title = (className?: string) => (
    <Inline value={item.title} display={item.title || t(`kinds.${item.kind}`)} label={t('item.title')} disabled={!inlineTitle} onSave={onEdit && ((v) => onEdit({ title: v as string }))} className={className} inputClassName="w-full font-semibold" />
  )
  const startLabel = timed && (
    <span className="inline-flex items-center gap-0.5">
      {formatTime(slot.start)}
      {item.fixedStart !== null && <Pin size={10} className="text-ink-3" />}
    </span>
  )
  // On the timeline a slot always comes with the time editor; without one the time is only shown.
  const start =
    timed &&
    (onOpenTime ? (
      <TimeButton label={t('item.fixedStart')} onOpen={(r) => onOpenTime('start', r)} className="tnum shrink-0">
        {startLabel}
      </TimeButton>
    ) : (
      <span className="tnum shrink-0">{startLabel}</span>
    ))

  const notices = slot && (slot.gap > 0 || slot.overlap > 0) && (
    <div className={cx('my-1 flex items-center gap-1.5 px-3 text-[12px] tnum', slot.overlap > 0 ? 'font-semibold text-rose' : 'text-ink-3')}>
      <span className="h-px flex-1 bg-current opacity-40" />
      {slot.overlap > 0 ? t('planner.overlap', { d: formatDuration(slot.overlap) }) : t('planner.gap', { d: formatDuration(slot.gap) })}
      <span className="h-px flex-1 bg-current opacity-40" />
    </div>
  )

  // Between two rows of one card the notice stays on the card's surface; before a card's first row it stands above it.
  const outside = !run || run.first ? notices : null
  const inside = run && !run.first ? notices : null

  if (item.kind === 'marker')
    return (
      <div style={style} className={cx(!ppm && 'pb-1')}>
        {outside}
        <div className={runClass(run)}>
          {run?.head}
          {inside}
          <div data-row onClick={select} className={cx('flex h-8 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-[14px] text-brand-ink transition-colors', tone)}>
            <span className="w-[6px] shrink-0" />
            {start && <span className="w-[46px] shrink-0 font-bold">{start}</span>}
            <Flag size={14} className="shrink-0" style={{ color: color ? `var(--c-${color})` : undefined }} />
            {title('min-w-0 truncate font-bold')}
          </div>
        </div>
      </div>
    )

  if (item.kind === 'note')
    return (
      <div style={style} className={cx(!ppm && 'pb-1')}>
        {outside}
        <div className={runClass(run)}>
          {run?.head}
          {inside}
          <div data-row onClick={select} className={cx('my-0.5 flex cursor-pointer gap-2 rounded-[10px] px-3 py-1.5 text-[13px] transition-colors', selected ? 'bg-accent-soft' : 'bg-amber-soft/70 hover:bg-amber-soft')}>
            <StickyNote size={13} className="mt-0.5 shrink-0 text-amber" />
            <div className="min-w-0 flex-1">
              <div className="italic">{title('line-clamp-2')}</div>
              {showDescription && item.description && <div className="line-clamp-3 text-ink-2">{item.description}</div>}
            </div>
          </div>
        </div>
      </div>
    )

  const pause = item.kind === 'break'
  const height = ppm ? Math.max(pause ? MIN_BREAK : MIN_CARD, minutes * ppm) : undefined
  const roomy = !height || height >= 60
  // The line of signs (notes, material, slides, lead) needs a third line's room where a description stands above it;
  // a row that is too low for it shows the description alone instead of a line cut in half.
  const describes = roomy && showDescription && !!item.description
  const signs = roomy && (!height || !describes || height >= 76)
  // Off the timeline (parking lot, the card under the pointer while dragging) an entry is a small card of its own.
  const alone = !ppm
  return (
    <div style={style} className={cx(alone && 'pb-1')}>
      {outside}
      <div className={runClass(run)}>
        {run?.head}
        {inside}
        <div
          data-row
          onClick={select}
          style={late ? { minHeight: height } : { height }}
          className={cx(
            'relative flex cursor-pointer gap-2.5 overflow-hidden rounded-[10px] px-3 py-1 text-[14px] transition-colors',
            alone && (pause ? 'border border-dashed border-line-2' : 'border border-line'),
            selected ? 'bg-accent-soft' : alone ? 'bg-surface hover:bg-surface-2' : 'hover:bg-surface-2',
            pause && 'text-ink-2',
            late && 'item-late',
          )}
        >
          {pause ? <span className="w-[6px] shrink-0" /> : <span className="cat-rail" />}
          <div className="@container min-w-0 flex-1 py-0.5">
            <div className="flex items-baseline gap-2.5">
              {start && <span className={cx('w-[46px] shrink-0', pause ? 'font-semibold' : 'font-bold text-brand-ink')}>{start}</span>}
              {pause && <Coffee size={14} className="shrink-0 self-center" />}
              <span className={cx('min-w-0 flex-1 truncate', !pause && 'font-semibold')}>{title()}</span>
              {category && <span className="shrink-0 text-[12px] font-semibold text-ink-2 @max-md:hidden">{category}</span>}
              {onOpenTime ? (
                <TimeButton label={t('item.duration')} onOpen={(r) => onOpenTime('duration', r)} className="tnum shrink-0 text-[13px] text-ink-2">
                  {formatDuration(minutes)}
                </TimeButton>
              ) : (
                <Inline
                  value={String(minutes)}
                  display={formatDuration(minutes)}
                  parse={parseDuration}
                  label={t('item.duration')}
                  onSave={onEdit && ((v) => onEdit({ duration: v as number }))}
                  className="tnum shrink-0 text-[13px] text-ink-2"
                  inputClassName="tnum w-12 text-right text-[12px]"
                />
              )}
            </div>
            {describes && <div className={cx('mt-0.5 whitespace-pre-line', height && height < 100 ? 'line-clamp-1' : 'line-clamp-3', 'text-[13px] leading-snug text-ink-2', start && 'pl-[56px]')}>{item.description}</div>}
            {signs && (
              <div className={cx('mt-1 flex items-center gap-2 text-ink-3', start && 'pl-[56px]')}>
                {item.notes && <NotebookPen size={12} />}
                {item.materials.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[12px]">
                    <Package size={12} />
                    {item.materials.length}
                  </span>
                )}
                {item.attachmentIds.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[12px]">
                    <Paperclip size={12} />
                    {item.attachmentIds.length}
                  </span>
                )}
                {item.slides.length > 0 &&
                  (onOpenSlides ? (
                    <button
                      type="button"
                      // Pointer and click stay here (no drag, no details); of the keys only Enter and Space, which would start a
                      // keyboard drag of the card – Ctrl+Z and the other shortcuts reach the planner.
                      onPointerDown={shield.onPointerDown}
                      onMouseDown={shield.onMouseDown}
                      onTouchStart={shield.onTouchStart}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}
                      onClick={(e) => (e.stopPropagation(), onOpenSlides())} className="tap -mx-1 inline-flex items-center gap-0.5 rounded px-1 text-[12px] hover:bg-surface-2 hover:text-ink" title={t('slides.openSlides')} aria-label={`${t('slides.openSlides')}: ${item.slides.length}`}>
                      <Presentation size={12} />
                      {item.slides.length}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[12px]">
                      <Presentation size={12} />
                      {item.slides.length}
                    </span>
                  ))}
                {item.lead && <span className="truncate text-[12px]">{item.lead}</span>}
              </div>
            )}
            {late && <div className={cx('mt-0.5 truncate text-[12px] font-semibold text-rose', start && 'pl-[56px]')}>{t('planner.late', { time: formatTime(segmentEnd!) })}</div>}
          </div>
          {onResize && onResizeEnd && ppm && <ResizeHandle minutes={durationOf(item)} ppm={ppm} onResize={onResize} onResizeEnd={onResizeEnd} />}
        </div>
      </div>
    </div>
  )
}

/**
 * The lower edge: drag to change the duration in steps of 5 minutes. Not on touch screens: there it covered the
 * lower half of a short card, the browser's touch adjustment sent taps on the card to it (so the details never
 * opened), and a 5px wiggle changed the length. Touch changes the length by tapping it (time editor).
 */
function ResizeHandle({ minutes, ppm, onResize, onResizeEnd }: { minutes: number; ppm: number; onResize: (m: number | null) => void; onResizeEnd: (m: number) => void }) {
  const start = useRef<{ y: number; current: number } | null>(null)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const value = (y: number) => Math.min(MAX_DURATION, Math.max(SNAP, snap(minutes + (y - start.current!.y) / ppm)))
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className="reveal absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-end justify-center opacity-0 transition-opacity hover:opacity-100 pointer-coarse:hidden [div:hover>&]:opacity-60"
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
      <span className="mb-0.5 h-1 w-8 rounded-full bg-ink-3" />
    </div>
  )
}
