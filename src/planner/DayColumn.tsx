import { createContext, type ReactNode, useContext } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookmarkPlus, ChevronDown, ChevronRight, Flag, FolderOpen, Plus, StickyNote, Trash2, Ungroup } from 'lucide-react'
import type { Category, Day, Group, Item, ItemKind } from '@/domain/types'
import type { ItemFields } from '@/domain/ops'
import { durationOf, type DaySchedule, formatDuration, formatTime, LONG_STRETCH } from '@/domain/time'
import { itemColor } from '@/store/useSettings'
import { formatDate } from '@/i18n'
import { cx, IconButton } from '@/components/ui'
import Menu from '@/components/Menu'
import { Inline, SortableItem } from './ItemCard'
import { TimeField } from './fields'
import { inner, type Lists } from './board'

/** What every list on the board needs; provided once by the planner. */
export interface BoardCtx {
  lists: Lists
  items: Record<string, Item>
  groups: Record<string, Group>
  categories: Category[]
  ppm: number
  showDescription: boolean
  selected: Set<string>
  collapsed: Set<string>
  resizing: { id: string; minutes: number } | null
  onSelect: (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  onEditItem: (id: string, fields: Partial<ItemFields>) => void
  onResize: (id: string, minutes: number | null) => void
  onResizeEnd: (id: string, minutes: number) => void
  onToggleGroup: (id: string) => void
  onRenameGroup: (id: string, title: string) => void
  onUngroup: (id: string) => void
  onDeleteGroup: (id: string) => void
  /** Absent for guests (the library is the owner's). */
  onSaveGroup?: (id: string) => void
}

export const BoardContext = createContext<BoardCtx | null>(null)
export const useBoardCtx = (): BoardCtx => useContext(BoardContext)!

/** One list entry: an item or a group with its members. Without a schedule (parking lot) the cards are compact. */
export function Entries({ ids, schedule }: { ids: string[]; schedule?: DaySchedule }) {
  const ctx = useBoardCtx()
  const segmentEnd: Record<string, number | null> = {}
  for (const s of schedule?.segments ?? []) for (const id of s.itemIds) segmentEnd[id] = s.end
  const card = (id: string) => {
    const item = ctx.items[id]
    if (!item) return null
    return (
      <SortableItem
        key={id}
        item={item}
        slot={schedule?.slots[id]}
        segmentEnd={segmentEnd[id]}
        ppm={schedule ? ctx.ppm : undefined}
        color={itemColor(item, ctx.categories)}
        showDescription={ctx.showDescription}
        selected={ctx.selected.has(id)}
        duration={ctx.resizing?.id === id ? ctx.resizing.minutes : undefined}
        onSelect={(e) => ctx.onSelect(id, e)}
        onEdit={(fields) => ctx.onEditItem(id, fields)}
        onResize={schedule && ((m) => ctx.onResize(id, m))}
        onResizeEnd={schedule && ((m) => ctx.onResizeEnd(id, m))}
      />
    )
  }
  return <>{ids.map((id) => (ctx.groups[id] ? <GroupBlock key={id} group={ctx.groups[id]} schedule={schedule} card={card} /> : card(id)))}</>
}

function GroupBlock({ group, schedule, card }: { group: Group; schedule?: DaySchedule; card: (id: string) => ReactNode }) {
  const { t } = useTranslation()
  const ctx = useBoardCtx()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: group.id })
  const memberIds = ctx.lists[inner(group.id)] ?? []
  const members = memberIds.map((id) => ctx.items[id]).filter(Boolean)
  const collapsed = ctx.collapsed.has(group.id)
  const total = members.reduce((sum, m) => sum + (ctx.resizing?.id === m.id ? ctx.resizing.minutes : durationOf(m)), 0)
  const slots = members.map((m) => schedule?.slots[m.id]).filter((s) => !!s)
  const range = slots.length ? `${formatTime(slots[0].start)}–${formatTime(Math.max(...slots.map((s) => s.end)))}` : null

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('mb-1.5', isDragging && 'opacity-30')}>
      <div ref={setActivatorNodeRef} {...listeners} {...attributes} className="flex cursor-grab touch-manipulation items-center gap-1 rounded-md py-1 pr-1 hover:bg-surface-2 active:cursor-grabbing">
        <button
          type="button"
          aria-label={collapsed ? t('group.expand') : t('group.collapse')}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => ctx.onToggleGroup(group.id)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:text-ink"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <Inline
          value={group.title}
          display={group.title || t('group.untitled')}
          label={t('group.title')}
          onSave={(v) => ctx.onRenameGroup(group.id, v as string)}
          className={cx('min-w-0 truncate text-[13px] font-semibold tracking-[-0.005em]', !group.title && 'text-ink-3')}
          inputClassName="w-full text-[13px] font-semibold"
        />
        <span className="ml-auto shrink-0 pl-2 text-[11px] text-ink-3 tnum">
          {range && `${range} · `}
          {formatDuration(total)}
        </span>
        <Menu
          label={t('group.menu')}
          items={[
            ...(ctx.onSaveGroup ? [{ label: t('group.saveToLibrary'), icon: <BookmarkPlus size={14} />, onSelect: () => ctx.onSaveGroup!(group.id) }] : []),
            { label: t('group.ungroup'), icon: <Ungroup size={14} />, onSelect: () => ctx.onUngroup(group.id) },
            { label: t('group.delete'), icon: <Trash2 size={14} />, danger: true, onSelect: () => ctx.onDeleteGroup(group.id) },
          ]}
        />
      </div>
      {!collapsed && (
        <div className="ml-3 border-l-2 border-line pl-2">
          <List id={inner(group.id)} ids={memberIds} empty={t('group.empty')} compact>
            {memberIds.map(card)}
          </List>
        </div>
      )}
    </div>
  )
}

interface DayProps {
  day: Day
  index: number
  count: number
  ids: string[]
  schedule: DaySchedule
  className?: string
  onAdd: (kind: ItemKind | 'group') => void
  onChange: (fields: Partial<Pick<Day, 'date' | 'startMin' | 'endMin'>>) => void
  onDelete: () => void
}

export function DayColumn({ day, index, count, ids, schedule, className, onAdd, onChange, onDelete }: DayProps) {
  const { t } = useTranslation()
  return (
    <section className={cx('flex flex-col', className)}>
      <header className="group/day mb-3 space-y-1.5 px-1">
        <div className="flex items-center gap-2">
          {count > 1 && <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{index + 1}</span>}
          <label className="relative min-w-0 cursor-pointer">
            <span className="block truncate text-[15px] font-medium">{formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <input type="date" value={day.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('planner.date')} />
          </label>
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
            <TimeField value={day.startMin} onChange={(v) => v !== null && onChange({ startMin: v })} className="h-7 w-[58px] text-[12px] max-md:w-[72px]" aria-label={t('planner.start')} title={t('planner.start')} />
            <span>–</span>
            <TimeField value={day.endMin} nullable onChange={(v) => onChange({ endMin: v })} className="h-7 w-[58px] text-[12px] max-md:w-[72px]" aria-label={t('planner.end')} title={t('planner.end')} />
            {count > 1 && (
              <IconButton label={t('planner.deleteDay')} onClick={onDelete} className="reveal opacity-0 group-hover/day:opacity-100">
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
        </div>
        <DaySummary schedule={schedule} endMin={day.endMin} />
      </header>
      <List id={day.id} ids={ids} empty={t('planner.emptyDay')}>
        <Entries ids={ids} schedule={schedule} />
      </List>
      <AddBar onAdd={onAdd} />
    </section>
  )
}

function DaySummary({ schedule, endMin }: { schedule: DaySchedule; endMin: number | null }) {
  const { t } = useTranslation()
  const over = schedule.overTarget
  const segments = schedule.segments.length > 1 ? schedule.segments : []
  return (
    <div className="space-y-0.5 text-[12px] tnum">
      <div className="flex flex-wrap gap-x-2 text-ink-3">
        <span className={cx('text-ink-2', over !== null && over > 0 && 'font-medium text-rose')}>
          {t('planner.endsAt', { time: formatTime(schedule.end) })}
          {endMin !== null && over !== null && over !== 0 && ` · ${over > 0 ? t('planner.over', { d: formatDuration(over) }) : t('planner.left', { d: formatDuration(-over) })}`}
        </span>
        <span>· {t('planner.work', { d: formatDuration(schedule.workMinutes) })}</span>
        {schedule.breakMinutes > 0 && <span>· {t('planner.breaks', { d: formatDuration(schedule.breakMinutes) })}</span>}
        {schedule.longestStretch > LONG_STRETCH && (
          <span className="inline-flex items-center gap-1 text-amber">
            <AlertTriangle size={11} />
            {t('planner.stretch', { d: formatDuration(schedule.longestStretch) })}
          </span>
        )}
      </div>
      {segments.map((s) => {
        const diff = s.available === null ? null : s.planned - s.available
        if (diff === null || diff <= 0) return null
        return (
          <div key={`${s.anchorId}-${s.start}`} className="text-rose">
            {t('planner.segment', { from: formatTime(s.start), to: formatTime(s.end!), planned: formatDuration(s.planned), available: formatDuration(s.available!) })} ·{' '}
            {t('planner.over', { d: formatDuration(diff) })}
          </div>
        )
      })}
    </div>
  )
}

/** A sortable list that also takes drops while empty. */
export function List({ id, ids, empty, compact, children }: { id: string; ids: string[]; empty: string; compact?: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={cx('rounded-xl transition-colors', compact ? 'min-h-9 p-0.5' : 'min-h-24 flex-1 p-1', isOver && 'bg-surface-2')}>
        {children}
        {!ids.length && (
          <div className={cx('flex items-center justify-center rounded-lg border border-dashed border-line-2 px-4 text-center text-[12px] text-ink-3', compact ? 'h-8' : 'h-20')}>{empty}</div>
        )}
      </div>
    </SortableContext>
  )
}

export function AddBar({ onAdd }: { onAdd: (kind: ItemKind | 'group') => void }) {
  const { t } = useTranslation()
  const button = (kind: ItemKind | 'group', icon: ReactNode) => (
    <button type="button" onClick={() => onAdd(kind)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink">
      {icon}
      {kind === 'group' ? t('group.new') : t(`kinds.${kind}`)}
    </button>
  )
  return (
    <div className="mt-1 flex flex-wrap gap-0.5 px-1">
      {button('block', <Plus size={13} />)}
      {button('break', <Plus size={13} />)}
      {button('marker', <Flag size={12} />)}
      {button('note', <StickyNote size={12} />)}
      {button('group', <FolderOpen size={12} />)}
    </div>
  )
}
