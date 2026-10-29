import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Flag, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { Day, Item, ItemKind } from '@/domain/types'
import { type DaySchedule, formatDuration, formatTime, LONG_STRETCH } from '@/domain/time'
import { formatDate } from '@/i18n'
import { cx, IconButton } from '@/components/ui'
import { SortableItem } from './ItemCard'
import { TimeField } from './fields'

export interface ListProps {
  ids: string[]
  items: Record<string, Item>
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (kind: ItemKind) => void
}

interface DayProps extends ListProps {
  day: Day
  index: number
  schedule: DaySchedule
  ppm: number
  resizing: { id: string; minutes: number } | null
  onResize: (id: string, minutes: number | null) => void
  onResizeEnd: (id: string, minutes: number) => void
  onChange: (fields: Partial<Pick<Day, 'date' | 'startMin' | 'endMin'>>) => void
  onDelete: () => void
}

export function DayColumn({ day, index, schedule, ppm, ids, items, selectedId, resizing, onSelect, onAdd, onResize, onResizeEnd, onChange, onDelete }: DayProps) {
  const { t } = useTranslation()
  const segmentEnd: Record<string, number | null> = {}
  for (const s of schedule.segments) for (const id of s.itemIds) segmentEnd[id] = s.end

  return (
    <section className="flex w-full shrink-0 flex-col md:w-[320px]">
      <header className="mb-3 space-y-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{index + 1}</span>
          <label className="relative min-w-0 flex-1 cursor-pointer">
            <span className="block truncate font-medium">{formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <input type="date" value={day.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('workshops.firstDay')} />
          </label>
          <IconButton label={t('planner.deleteDay')} onClick={onDelete} className="reveal opacity-0 hover:opacity-100 [header:hover_&]:opacity-100">
            <Trash2 size={14} />
          </IconButton>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-ink-2">
          <span>{t('planner.start')}</span>
          <TimeField value={day.startMin} onChange={(v) => v !== null && onChange({ startMin: v })} className="w-[64px]" aria-label={t('planner.start')} />
          <span>{t('planner.end')}</span>
          <TimeField value={day.endMin} nullable onChange={(v) => onChange({ endMin: v })} className="w-[64px]" aria-label={t('planner.end')} />
        </div>
        <DaySummary schedule={schedule} endMin={day.endMin} />
      </header>
      <List id={day.id} ids={ids} empty={t('planner.emptyDay')}>
        {ids.map((id) => {
          const item = items[id]
          if (!item) return null
          return (
            <SortableItem
              key={id}
              item={item}
              slot={schedule.slots[id]}
              segmentEnd={segmentEnd[id]}
              ppm={ppm}
              selected={selectedId === id}
              duration={resizing?.id === id ? resizing.minutes : undefined}
              onSelect={() => onSelect(id)}
              onResize={(m) => onResize(id, m)}
              onResizeEnd={(m) => onResizeEnd(id, m)}
            />
          )
        })}
      </List>
      <AddBar onAdd={onAdd} />
    </section>
  )
}

function DaySummary({ schedule, endMin }: { schedule: DaySchedule; endMin: number | null }) {
  const { t } = useTranslation()
  const over = schedule.overTarget
  return (
    <div className="space-y-1 text-[12px]">
      <div className="flex flex-wrap gap-x-2 text-ink-2 tnum">
        <span className={cx(over !== null && over > 0 && 'font-medium text-rose')}>
          {t('planner.endsAt', { time: formatTime(schedule.end) })}
          {over !== null && over !== 0 && ` · ${over > 0 ? t('planner.over', { d: formatDuration(over) }) : t('planner.left', { d: formatDuration(-over) })}`}
        </span>
        <span className="text-ink-3">· {t('planner.work', { d: formatDuration(schedule.workMinutes) })}</span>
        {schedule.breakMinutes > 0 && <span className="text-ink-3">· {t('planner.breaks', { d: formatDuration(schedule.breakMinutes) })}</span>}
      </div>
      {schedule.longestStretch > LONG_STRETCH && (
        <div className="flex items-center gap-1 text-amber">
          <AlertTriangle size={12} />
          {t('planner.stretch', { d: formatDuration(schedule.longestStretch) })}
        </div>
      )}
      {(schedule.segments.length > 1 || endMin !== null) &&
        schedule.segments.map((s) => {
          const diff = s.available === null ? null : s.planned - s.available
          return (
            <div key={`${s.anchorId}-${s.start}`} className={cx('flex justify-between gap-2 tnum', diff !== null && diff > 0 ? 'text-rose' : 'text-ink-3')}>
              <span>
                {s.end === null
                  ? t('planner.openSegment', { from: formatTime(s.start), planned: formatDuration(s.planned) })
                  : t('planner.segment', { from: formatTime(s.start), to: formatTime(s.end), planned: formatDuration(s.planned), available: formatDuration(s.available!) })}
              </span>
              {diff !== null && diff !== 0 && <span>{diff > 0 ? t('planner.over', { d: formatDuration(diff) }) : t('planner.left', { d: formatDuration(-diff) })}</span>}
            </div>
          )
        })}
    </div>
  )
}

/** A sortable list that also takes drops while empty. */
export function List({ id, ids, empty, children }: { id: string; ids: string[]; empty: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={cx('min-h-24 flex-1 rounded-xl p-1 transition-colors', isOver && 'bg-surface-2')}>
        {children}
        {!ids.length && <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-line-2 px-4 text-center text-[12px] text-ink-3">{empty}</div>}
      </div>
    </SortableContext>
  )
}

export function AddBar({ onAdd }: { onAdd: (kind: ItemKind) => void }) {
  const { t } = useTranslation()
  const button = (kind: ItemKind, icon: ReactNode) => (
    <button type="button" onClick={() => onAdd(kind)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      {icon}
      {t(`kinds.${kind}`)}
    </button>
  )
  return (
    <div className="mt-1 flex flex-wrap gap-0.5 px-1">
      {button('block', <Plus size={13} />)}
      {button('break', <Plus size={13} />)}
      {button('marker', <Flag size={12} />)}
      {button('note', <StickyNote size={12} />)}
    </div>
  )
}
