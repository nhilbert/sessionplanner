import { createContext, type ReactNode, useContext, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookmarkPlus, CalendarDays, ChevronDown, Maximize2, Minimize2, ChevronRight, Flag, FolderOpen, Plus, StickyNote, Trash2, Ungroup } from 'lucide-react'
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
import { type InsertKind, InsertPoint } from './Insert'
import type { TimeMode } from './TimeEditor'

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
  preview: Preview | null
  onSelect: (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  onEditItem: (id: string, fields: Partial<ItemFields>) => void
  onResize: (id: string, minutes: number | null) => void
  /** Opens the editor for an item's length or start time beside the clicked value. */
  onOpenTime: (id: string, mode: TimeMode, anchor: DOMRect) => void
  /** Adds an entry at `index` of list `list` (a day, the parking lot, the inside of a group); absent for read-only. */
  onInsert?: (list: string, index: number, kind: InsertKind) => void
  /** Something is dragged or resized: the ⊕ marks step aside. */
  busy: boolean
  onResizeEnd: (id: string, minutes: number) => void
  onToggleGroup: (id: string) => void
  onRenameGroup: (id: string, title: string) => void
  onUngroup: (id: string) => void
  onDeleteGroup: (id: string) => void
  /** Absent for guests (the library is the owner's). */
  onSaveGroup?: (id: string) => void
}

/** Not yet saved values the timeline already shows (dragging the lower edge, the time editor). */
export interface Preview {
  id: string
  fields: { duration?: number; fixedStart?: number | null }
}

export const BoardContext = createContext<BoardCtx | null>(null)
export const useBoardCtx = (): BoardCtx => useContext(BoardContext)!

/** One list entry: an item or a group with its members. Without a schedule (parking lot) the cards are compact. */
export function Entries({ list, ids, schedule }: { list: string; ids: string[]; schedule?: DaySchedule }) {
  const ctx = useBoardCtx()
  const inGroup = list.startsWith('in:')
  const insert = (index: number, position: 'top' | 'bottom' = 'bottom') =>
    ctx.onInsert && !ctx.busy ? <InsertPoint position={position} allowGroup={!inGroup} onInsert={(kind) => ctx.onInsert!(list, index, kind)} /> : null
  const segmentEnd: Record<string, number | null> = {}
  for (const s of schedule?.segments ?? []) for (const id of s.itemIds) segmentEnd[id] = s.end
  const card = (id: string, index: number) => {
    const item = ctx.items[id]
    if (!item) return null
    return (
      <SortableItem
        key={id}
        after={
          <>
            {index === 0 && insert(0, 'top')}
            {insert(index + 1)}
          </>
        }
        item={item}
        slot={schedule?.slots[id]}
        segmentEnd={segmentEnd[id]}
        ppm={schedule ? ctx.ppm : undefined}
        color={itemColor(item, ctx.categories)}
        showDescription={ctx.showDescription}
        selected={ctx.selected.has(id)}
        duration={ctx.preview?.id === id ? ctx.preview.fields.duration : undefined}
        onSelect={(e) => ctx.onSelect(id, e)}
        onEdit={(fields) => ctx.onEditItem(id, fields)}
        onOpenTime={schedule ? (mode, anchor) => ctx.onOpenTime(id, mode, anchor) : undefined}
        onResize={schedule && ((m) => ctx.onResize(id, m))}
        onResizeEnd={schedule && ((m) => ctx.onResizeEnd(id, m))}
      />
    )
  }
  return (
    <>
      {ids.map((id, index) =>
        ctx.groups[id] ? (
          <GroupBlock key={id} group={ctx.groups[id]} schedule={schedule} after={<>{index === 0 && insert(0, 'top')}{insert(index + 1)}</>} />
        ) : (
          card(id, index)
        ),
      )}
    </>
  )
}

function GroupBlock({ group, schedule, after }: { group: Group; schedule?: DaySchedule; after: ReactNode }) {
  const { t } = useTranslation()
  const ctx = useBoardCtx()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: group.id })
  const memberIds = ctx.lists[inner(group.id)] ?? []
  const members = memberIds.map((id) => ctx.items[id]).filter(Boolean)
  const collapsed = ctx.collapsed.has(group.id)
  const total = members.reduce((sum, m) => sum + (ctx.preview?.id === m.id && ctx.preview.fields.duration !== undefined ? ctx.preview.fields.duration : durationOf(m)), 0)
  const slots = members.map((m) => schedule?.slots[m.id]).filter((s) => !!s)
  const range = slots.length ? `${formatTime(slots[0].start)}–${formatTime(Math.max(...slots.map((s) => s.end)))}` : null

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('relative mb-1.5', isDragging && 'opacity-30')}>
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
            <Entries list={inner(group.id)} ids={memberIds} schedule={schedule} />
          </List>
        </div>
      )}
      {after}
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
  /** Several days: this one is shown on its own. */
  focused?: boolean
  onFocus?: () => void
  onAdd: (kind: ItemKind | 'group') => void
  onChange: (fields: Partial<Pick<Day, 'date' | 'startMin' | 'endMin'>>) => void
  onDelete: () => void
}

export function DayColumn({ day, index, count, ids, schedule, className, focused, onFocus, onAdd, onChange, onDelete }: DayProps) {
  const { t } = useTranslation()
  return (
    <section className={cx('flex flex-col', className)}>
      <header className="group/day mb-3 space-y-1.5 px-1">
        <div className="flex items-center gap-2">
          {count > 1 && <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{index + 1}</span>}
          <DateButton date={day.date} short={count > 1} onDate={(date) => onChange({ date })} />
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
            <TimeField value={day.startMin} onChange={(v) => v !== null && onChange({ startMin: v })} className="h-7 w-[58px] text-[12px] max-md:w-[72px]" aria-label={t('planner.start')} title={t('planner.start')} />
            <span>–</span>
            <TimeField value={day.endMin} nullable onChange={(v) => onChange({ endMin: v })} className="h-7 w-[58px] text-[12px] max-md:w-[72px]" aria-label={t('planner.end')} title={t('planner.end')} />
            {count > 1 && onFocus && (
              <IconButton label={focused ? t('planner.allDays') : t('planner.focusDay')} onClick={onFocus}>
                {focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </IconButton>
            )}
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
        <Entries list={day.id} ids={ids} schedule={schedule} />
      </List>
      <AddBar onAdd={onAdd} />
    </section>
  )
}

/** The day's date as a visible button that opens the date picker (the input itself stays out of sight). */
export function DateButton({ date, short, onDate }: { date: string; short?: boolean; onDate: (date: string) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="relative flex min-w-0">
      <button
        type="button"
        title={t('planner.changeDate')}
        onClick={() => {
          const el = input.current
          if (!el) return
          try {
            el.showPicker()
          } catch {
            el.focus()
          }
        }}
        className="-mx-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[15px] font-medium hover:bg-surface-2"
      >
        <CalendarDays size={14} className="shrink-0 text-ink-3" />
        <span className="truncate">{formatDate(date, short ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-label={t('planner.date')}
        value={date}
        onChange={(e) => e.target.value && e.target.value !== date && onDate(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
      />
    </span>
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
      <div ref={setNodeRef} className={cx('group/list rounded-xl transition-colors', compact ? 'min-h-9 p-0.5' : 'min-h-24 flex-1 py-1 pl-7 pr-1', isOver && 'bg-surface-2')}>
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
