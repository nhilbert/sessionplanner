import { type PointerEvent as ReactPointerEvent, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { Flag, NotebookPen, Package, Paperclip, Pin, StickyNote } from 'lucide-react'
import type { Item } from '@/domain/types'
import { durationOf, formatDuration, formatTime, snap, SNAP, type Slot } from '@/domain/time'
import { cx } from '@/components/ui'

export const MIN_CARD = 44

export interface CardProps {
  item: Item
  slot?: Slot
  /** End of the segment the item belongs to, for "does not fit before …". */
  segmentEnd?: number | null
  /** Pixels per minute; undefined = compact (parking lot, drag overlay). */
  ppm?: number
  selected?: boolean
  /** Duration shown while the lower edge is being dragged. */
  duration?: number
  onSelect?: () => void
  onResize?: (minutes: number | null) => void
  onResizeEnd?: (minutes: number) => void
}

export function SortableItem(props: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cx('touch-manipulation select-none [-webkit-touch-callout:none]', isDragging && 'opacity-30')}
    >
      <ItemCard {...props} />
    </div>
  )
}

export function ItemCard({ item, slot, segmentEnd, ppm, selected, duration, onSelect, onResize, onResizeEnd }: CardProps) {
  const { t } = useTranslation()
  const minutes = duration ?? durationOf(item)
  const timed = slot !== undefined
  const late = slot?.late && segmentEnd !== undefined && segmentEnd !== null
  const ring = selected ? 'ring-2 ring-accent/60' : ''

  const notices = slot && (slot.gap > 0 || slot.overlap > 0) && (
    <div className={cx('mb-1 flex items-center gap-1 px-1 text-[11px] tnum', slot.overlap > 0 ? 'text-rose' : 'text-ink-3')}>
      <span className="h-px flex-1 bg-current opacity-40" />
      {slot.overlap > 0 ? t('planner.overlap', { d: formatDuration(slot.overlap) }) : t('planner.gap', { d: formatDuration(slot.gap) })}
      <span className="h-px flex-1 bg-current opacity-40" />
    </div>
  )

  if (item.kind === 'marker')
    return (
      <div className="pb-1">
        {notices}
        <div onClick={onSelect} className={cx('flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-2', ring)}>
          {timed && <span className="tnum w-10 shrink-0 text-ink-2">{formatTime(slot.start)}</span>}
          <Flag size={13} className="shrink-0 text-accent" />
          <span className="truncate font-medium">{item.title}</span>
          {item.fixedStart !== null && <Pin size={11} className="shrink-0 text-ink-3" />}
          <span className="h-px min-w-4 flex-1 bg-line-2" />
        </div>
      </div>
    )

  if (item.kind === 'note')
    return (
      <div className="pb-1">
        {notices}
        <div onClick={onSelect} className={cx('flex cursor-pointer gap-2 rounded-md bg-amber-soft/70 px-2 py-1.5 text-[13px] hover:bg-amber-soft', ring)}>
          <StickyNote size={13} className="mt-0.5 shrink-0 text-amber" />
          <div className="min-w-0">
            {item.title && <div className="line-clamp-2 italic">{item.title}</div>}
            {item.description && <div className="line-clamp-3 text-ink-2">{item.description}</div>}
            {!item.title && !item.description && <div className="text-ink-3">{t('kinds.note')}</div>}
          </div>
        </div>
      </div>
    )

  const height = ppm ? Math.max(MIN_CARD, minutes * ppm) : undefined
  const roomy = !height || height >= 64
  return (
    <div className="pb-1">
      {notices}
      <div
        onClick={onSelect}
        style={{ height }}
        className={cx(
          'relative cursor-pointer overflow-hidden rounded-lg border px-2.5 py-1.5 text-[13px] transition-shadow hover:shadow-[var(--shadow)]',
          item.kind === 'break' ? 'item-break' : 'item-block',
          late && 'item-late',
          ring,
        )}
      >
        <div className="flex items-baseline gap-2">
          {timed && (
            <span className="tnum shrink-0 text-[12px] text-ink-2">
              {formatTime(slot.start)}–{formatTime(slot.start + minutes)}
            </span>
          )}
          <span className={cx('min-w-0 flex-1 truncate font-medium', item.kind === 'break' && 'text-ink-2')}>{item.title || t(`kinds.${item.kind}`)}</span>
          <span className="tnum shrink-0 text-[11px] text-ink-3">{formatDuration(minutes)}</span>
        </div>
        {roomy && item.description && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-2">{item.description}</div>}
        {roomy && (
          <div className="mt-1 flex items-center gap-2 text-ink-3">
            {item.fixedStart !== null && <Pin size={11} />}
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
        {onResize && onResizeEnd && ppm && <ResizeHandle minutes={durationOf(item)} ppm={ppm} onResize={onResize} onResizeEnd={onResizeEnd} />}
      </div>
    </div>
  )
}

/** The lower edge: drag to change the duration in steps of 5 minutes. */
function ResizeHandle({ minutes, ppm, onResize, onResizeEnd }: { minutes: number; ppm: number; onResize: (m: number | null) => void; onResizeEnd: (m: number) => void }) {
  const start = useRef<{ y: number; current: number } | null>(null)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const value = (y: number) => Math.max(SNAP, snap(minutes + (y - start.current!.y) / ppm))
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className="reveal absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center opacity-0 transition-opacity hover:opacity-100 [div:hover>&]:opacity-60"
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
