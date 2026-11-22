import { createContext, type ReactNode, useContext, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Archive, BookmarkPlus, CalendarDays, ChevronDown, Maximize2, Minimize2, ChevronRight, Flag, FolderOpen, Plus, StickyNote, Trash2, Ungroup } from 'lucide-react'
import type { Category, Day, Group, Item, ItemKind } from '@/domain/types'
import type { ItemFields } from '@/domain/ops'
import { BREAK_GAP, durationOf, type DaySchedule, formatDuration, formatTime, LONG_STRETCH, longestStretch } from '@/domain/time'
import { categoryName, itemColor, stripColor } from '@/store/useSettings'
import { groupRail } from '@/domain/color'
import { formatDate } from '@/i18n'
import { cx, useIsPhone } from '@/components/ui'
import Menu from '@/components/Menu'
import { Inline, runClass, type RunPart, SortableItem } from './ItemCard'
import { TimeField } from './fields'
import { flatIds, inner, type Lists } from './board'
import { type InsertKind, InsertPoint } from './Insert'
import { usePlanner } from '@/store/usePlanner'
import type { TimeMode } from './TimeEditor'

/** What every list on the board needs; provided once by the planner. */
export interface BoardCtx {
  lists: Lists
  items: Record<string, Item>
  groups: Record<string, Group>
  categories: Category[]
  ppm: number
  showDescription: boolean
  /** Phones: a tap on a card opens the details, where the title is edited (no inline title editing). */
  phone: boolean
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
  /** Shown from the offline copy (docs/offline.md): no handle to change a length. */
  readOnly?: boolean
  /** Something is dragged or resized: the ⊕ marks step aside. */
  busy: boolean
  /** A screen without a pointer that hovers: the ⊕ marks stay away until inserting is switched on. */
  touch: boolean
  /** Inserting is switched on (touch screens): every gap shows its ⊕ and takes the tap. */
  inserting: boolean
  onResizeEnd: (id: string, minutes: number) => void
  onToggleGroup: (id: string) => void
  onRenameGroup: (id: string, title: string) => void
  onUngroup: (id: string) => void
  onDeleteGroup: (id: string) => void
  /** Moves a group with its steps to the end of the parking lot. */
  onParkGroup: (id: string) => void
  /** Absent for guests (saving to the library is the owner's). */
  onSaveGroup?: (id: string) => void
  /** Opens the slide editor on a step (the slide count on its card). */
  onOpenSlides?: (id: string) => void
}

/** Not yet saved values the timeline already shows (dragging the lower edge, the time editor). */
export interface Preview {
  id: string
  fields: { duration?: number; fixedStart?: number | null }
}

export const BoardContext = createContext<BoardCtx | null>(null)
export const useBoardCtx = (): BoardCtx => useContext(BoardContext)!

/** The items a top-level entry stands for: the item itself, or a group's items in order. */
const itemsOfEntry = (ctx: BoardCtx, id: string): Item[] =>
  (ctx.groups[id] ? (ctx.lists[inner(id)] ?? []).map((m) => ctx.items[m]) : [ctx.items[id]]).filter((m): m is Item => !!m)

interface Run {
  ids: string[]
  start: number | null
  end: number | null
  /** The longest run of work without a break inside the card, by the day's own rule (a break inside a group does not split the card). */
  longest: number
}

/**
 * The cards of a day: every stretch of entries between two breaks. A gap before a fixed start counts as a break
 * (BREAK_GAP, as for the day's longest stretch); markers at a stretch's edges stay outside the card.
 */
function runsOf(ctx: BoardCtx, ids: string[], schedule: DaySchedule): Run[] {
  const isMarker = (id: string) => ctx.items[id]?.kind === 'marker'
  const runs: Run[] = []
  let current: string[] = []
  const close = () => {
    while (current.length && isMarker(current[0])) current.shift()
    while (current.length && isMarker(current[current.length - 1])) current.pop()
    if (current.length) {
      const members = current.flatMap((id) => itemsOfEntry(ctx, id))
      const slots = members.filter((m) => m.kind === 'block' && schedule.slots[m.id]).map((m) => schedule.slots[m.id])
      runs.push({
        ids: current,
        start: slots.length ? Math.min(...slots.map((s) => s.start)) : null,
        end: slots.length ? Math.max(...slots.map((s) => s.end)) : null,
        longest: longestStretch(members, schedule.slots),
      })
    }
    current = []
  }
  for (const id of ids) {
    if (!ctx.groups[id] && (!ctx.items[id] || ctx.items[id].kind === 'break')) {
      close()
      continue
    }
    const first = itemsOfEntry(ctx, id)[0]
    if (current.length && first && (schedule.slots[first.id]?.gap ?? 0) >= BREAK_GAP) close()
    current.push(id)
  }
  close()
  return runs
}

/** The head of a card: its span of the day and how long it runs without a break. */
function RunHead({ run }: { run: Run }) {
  const { t } = useTranslation()
  if (run.start === null || run.end === null) return null
  const long = run.longest > LONG_STRETCH
  return (
    <div className="flex items-baseline gap-2 px-3 pb-0.5 pt-2">
      <span className="app-title text-[14px] font-bold tnum">
        {formatTime(run.start)} – {formatTime(run.end)}
      </span>
      <span className={cx('ml-auto inline-flex items-center gap-1 text-[12px] tnum', long ? 'font-semibold text-amber' : 'text-ink-3')}>
        {long && <AlertTriangle size={12} />}
        {t('planner.run', { d: formatDuration(run.longest) })}
      </span>
    </div>
  )
}

/** One list entry: an item or a group with its members. Without a schedule (parking lot) the cards are compact. */
export function Entries({ list, ids, schedule }: { list: string; ids: string[]; schedule?: DaySchedule }) {
  const { t } = useTranslation()
  const ctx = useBoardCtx()
  const inGroup = list.startsWith('in:')
  const mode = ctx.inserting ? 'pick' : ctx.touch ? null : 'hover'
  const insert = (index: number, position: 'top' | 'bottom' = 'bottom') =>
    ctx.onInsert && !ctx.busy && mode ? <InsertPoint mode={mode} position={position} allowGroup={!inGroup} onInsert={(kind) => ctx.onInsert!(list, index, kind)} /> : null
  const segmentEnd: Record<string, number | null> = {}
  for (const s of schedule?.segments ?? []) for (const id of s.itemIds) segmentEnd[id] = s.end
  // A day's own list is cut into cards; the inside of a group stands in its group's part of one.
  const parts: Record<string, RunPart> = {}
  if (schedule && !inGroup)
    for (const run of runsOf(ctx, ids, schedule))
      run.ids.forEach((id, i) => {
        parts[id] = { first: i === 0, last: i === run.ids.length - 1, head: i === 0 ? <RunHead run={run} /> : undefined }
      })
  const card = (id: string, index: number) => {
    const item = ctx.items[id]
    if (!item) return null
    const category = ctx.categories.find((c) => c.id === item.categoryId)
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
        category={schedule && category ? categoryName(category, t) : undefined}
        run={parts[id]}
        showDescription={ctx.showDescription}
        selected={ctx.selected.has(id)}
        duration={ctx.preview?.id === id ? ctx.preview.fields.duration : undefined}
        inlineTitle={!ctx.phone}
        onOpenSlides={ctx.onOpenSlides && (() => ctx.onOpenSlides!(id))}
        onSelect={(e) => ctx.onSelect(id, e)}
        onEdit={(fields) => ctx.onEditItem(id, fields)}
        onOpenTime={schedule ? (mode, anchor) => ctx.onOpenTime(id, mode, anchor) : undefined}
        onResize={schedule && !ctx.readOnly ? (m) => ctx.onResize(id, m) : undefined}
        onResizeEnd={schedule && !ctx.readOnly ? (m) => ctx.onResizeEnd(id, m) : undefined}
      />
    )
  }
  return (
    <>
      {ids.map((id, index) =>
        ctx.groups[id] ? (
          <GroupBlock key={id} group={ctx.groups[id]} schedule={schedule} run={parts[id]} after={<>{index === 0 && insert(0, 'top')}{insert(index + 1)}</>} />
        ) : (
          card(id, index)
        ),
      )}
    </>
  )
}

function GroupBlock({ group, schedule, run, after }: { group: Group; schedule?: DaySchedule; run?: RunPart; after: ReactNode }) {
  const { t } = useTranslation()
  const ctx = useBoardCtx()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: group.id })
  const memberIds = ctx.lists[inner(group.id)] ?? []
  const members = memberIds.map((id) => ctx.items[id]).filter(Boolean)
  const collapsed = ctx.collapsed.has(group.id)
  const lengthOf = (m: Item) => (ctx.preview?.id === m.id && ctx.preview.fields.duration !== undefined ? ctx.preview.fields.duration : durationOf(m))
  const total = members.reduce((sum, m) => sum + lengthOf(m), 0)
  const slots = members.map((m) => schedule?.slots[m.id]).filter((s) => !!s)
  const range = slots.length ? `${formatTime(slots[0].start)}–${formatTime(Math.max(...slots.map((s) => s.end)))}` : null
  // Folded, the group's rail shows what is inside: its members' colours, each as long as the member lasts.
  const rail = groupRail(members.map((m) => ({ color: stripColor(m, ctx.categories), minutes: lengthOf(m) })))

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('entry relative', !schedule && 'mb-1.5', isDragging && 'drag-target')}>
      <div className={cx(runClass(run), !schedule && 'rounded-[14px] border border-line bg-surface p-1')}>
        {run?.head}
        <div ref={setActivatorNodeRef} {...listeners} {...attributes} data-row
          // Enter folds and unfolds (Space moves the group, as it moves an entry).
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget && !isDragging) {
              e.preventDefault()
              ctx.onToggleGroup(group.id)
            } else listeners?.onKeyDown?.(e)
          }}
          className="@container my-0.5 flex min-h-9 cursor-grab touch-manipulation items-center gap-1.5 rounded-[10px] bg-paper py-0.5 pl-3 pr-1 active:cursor-grabbing"
        >
          <span className="w-[6px] shrink-0 self-stretch rounded-[3px]" style={collapsed && rail ? { background: rail } : undefined} />
          <button
            type="button"
            aria-label={collapsed ? t('group.expand') : t('group.collapse')}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={() => ctx.onToggleGroup(group.id)}
            className="tap inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-surface-2 pointer-coarse:h-8 pointer-coarse:w-8"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <Inline
            value={group.title}
            display={group.title || t('group.untitled')}
            label={t('group.title')}
            onSave={(v) => ctx.onRenameGroup(group.id, v as string)}
            className={cx('min-w-0 truncate text-[14px] font-bold', group.title ? 'text-brand-ink' : 'text-ink-3')}
            inputClassName="w-full text-[14px] font-bold"
          />
          <span className="ml-auto shrink-0 pl-2 text-[12px] text-ink-2 tnum">
            {range && <span className="@max-md:hidden">{range} · </span>}
            {t('group.units', { count: members.filter((m) => m.kind === 'block').length })} · {formatDuration(total)}
          </span>
          <Menu
            label={t('group.menu')}
            title={group.title || t('group.untitled')}
            items={[
              // The order of every object's menu: keep in the library, move to the parking lot, then (apart) delete.
              ...(ctx.onSaveGroup ? [{ label: t('group.saveToLibrary'), icon: <BookmarkPlus size={14} />, onSelect: () => ctx.onSaveGroup!(group.id) }] : []),
              ...(group.dayId !== null ? [{ label: t('item.toParking'), icon: <Archive size={14} />, onSelect: () => ctx.onParkGroup(group.id) }] : []),
              { label: t('group.ungroup'), icon: <Ungroup size={14} />, onSelect: () => ctx.onUngroup(group.id) },
              { label: t('group.delete'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: () => ctx.onDeleteGroup(group.id) },
            ]}
          />
        </div>
        {!collapsed && (
          // The members stand indented under the title, in the same card: no second frame. While inserting, room
          // below them keeps the gap after the last member apart from the gap after the group.
          <div className={cx('pl-4', ctx.inserting && 'pb-5')}>
            <List id={inner(group.id)} ids={memberIds} empty={t('group.empty')} compact>
              <Entries list={inner(group.id)} ids={memberIds} schedule={schedule} />
            </List>
          </div>
        )}
      </div>
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
  const ctx = useBoardCtx()
  // Phones: the short date, taller time fields, and no focus button (the day tabs above do that).
  const phone = useIsPhone()
  return (
    <section className={cx('flex flex-col', className)}>
      <header className="group/day mb-2 space-y-2 px-1">
        <div className="flex items-center gap-2">
          {count > 1 && <span className="text-[12px] font-semibold text-brand-ink">{index + 1}</span>}
          <DateButton date={day.date} short={count > 1 || phone} onDate={(date) => onChange({ date })} />
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
            <TimeField value={day.startMin} onChange={(v) => v !== null && onChange({ startMin: v })} className="h-7 w-[58px] text-[12px] max-md:h-9 max-md:w-[66px]" aria-label={t('planner.start')} title={t('planner.start')} />
            <span>–</span>
            <TimeField value={day.endMin} nullable onChange={(v) => onChange({ endMin: v })} className="h-7 w-[58px] text-[12px] max-md:h-9 max-md:w-[66px]" aria-label={t('planner.end')} title={t('planner.end')} />
            {count > 1 && (
              <Menu
                label={t('planner.dayMenu')}
                title={formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                items={[
                  ...(onFocus && !phone ? [{ label: focused ? t('planner.allDays') : t('planner.focusDay'), icon: focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />, onSelect: onFocus }] : []),
                  { label: t('planner.deleteDay'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: onDelete },
                ]}
              />
            )}
          </div>
        </div>
        <DaySummary schedule={schedule} endMin={day.endMin} />
        <DayStrip dayId={day.id} start={day.startMin} target={day.endMin} schedule={schedule} ctx={ctx} />
      </header>
      <List id={day.id} ids={ids} empty={t('planner.emptyDay')} emptyInsert={ctx.inserting && ctx.onInsert ? <InsertPoint mode="pick" position="top" allowGroup onInsert={(kind) => ctx.onInsert!(day.id, 0, kind)} /> : undefined}>
        <Entries list={day.id} ids={ids} schedule={schedule} />
      </List>
      <AddBar onAdd={onAdd} first={!ids.length} />
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
        className="app-title -mx-2 inline-flex min-w-0 items-center gap-2 rounded-full px-2 py-0.5 text-[20px] font-bold hover:bg-surface-2 md:text-[22px]"
      >
        <CalendarDays size={16} className="shrink-0" />
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
    <div className="space-y-0.5 text-[13px] tnum">
      <div className="flex flex-wrap gap-x-2 text-ink-2">
        <span className={cx('text-ink', over !== null && over > 0 && 'font-semibold text-rose')}>
          {t('planner.endsAt', { time: formatTime(schedule.end) })}
          {endMin !== null && over !== null && over !== 0 && ` · ${over > 0 ? t('planner.over', { d: formatDuration(over) }) : t('planner.left', { d: formatDuration(-over) })}`}
        </span>
        <span>· {t('planner.work', { d: formatDuration(schedule.workMinutes) })}</span>
        {schedule.breakMinutes > 0 && <span>· {t('planner.breaks', { d: formatDuration(schedule.breakMinutes) })}</span>}
        {schedule.longestStretch > LONG_STRETCH && (
          <span className="inline-flex items-center gap-1 font-semibold text-amber">
            <AlertTriangle size={12} />
            {t('planner.stretch', { d: formatDuration(schedule.longestStretch) })}
          </span>
        )}
      </div>
      {segments.map((s) => {
        const diff = s.available === null ? null : s.planned - s.available
        if (diff === null || diff <= 0) return null
        return (
          <div key={`${s.anchorId}-${s.start}`} className="font-semibold text-rose">
            {t('planner.segment', { from: formatTime(s.start), to: formatTime(s.end!), planned: formatDuration(s.planned), available: formatDuration(s.available!) })} ·{' '}
            {t('planner.over', { d: formatDuration(diff) })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The day at a glance, to scale: every unit as wide as it lasts, in its category's colour, breaks in the neutral
 * tone, an overlap in the conflict colour. Under it the minutes per category, as word and number.
 */
function DayStrip({ dayId, start, target, schedule, ctx }: { dayId: string; start: number; target: number | null; schedule: DaySchedule; ctx: BoardCtx }) {
  const { t } = useTranslation()
  const items = flatIds(ctx.lists, dayId, new Set(Object.keys(ctx.groups)))
    .map((id) => ctx.items[id])
    .filter((it): it is Item => !!it && !!schedule.slots[it.id] && schedule.slots[it.id].end > schedule.slots[it.id].start)
  if (!items.length) return null
  const from = Math.min(start, ...items.map((it) => schedule.slots[it.id].start))
  const to = Math.max(target ?? 0, ...items.map((it) => schedule.slots[it.id].end))
  const span = Math.max(1, to - from)
  const pct = (minutes: number) => `${(minutes / span) * 100}%`
  // The colour a unit shows in the strip is the one of its rail: its own, else its category's. The legend names every
  // colour that occurs, so a unit with a colour of its own gets a line of its own.
  const colorOf = (it: Item) => stripColor(it, ctx.categories)
  const sums = new Map<string, { key: string; label: string; color: string; minutes: number }>()
  for (const it of items) {
    const minutes = schedule.slots[it.id].end - schedule.slots[it.id].start
    const category = ctx.categories.find((c) => c.id === it.categoryId)
    const color = colorOf(it)
    const key = it.kind === 'break' ? 'break' : `${category?.id ?? ''}|${color}`
    const label = it.kind === 'break' ? t('planner.stripBreaks') : category ? categoryName(category, t) : t('planner.noCategory')
    sums.set(key, { key, label, color, minutes: (sums.get(key)?.minutes ?? 0) + minutes })
  }
  // Breaks last, the rest by what takes most of the day.
  const legend = [...sums.values()].sort((x, y) => (x.key === 'break' ? 1 : y.key === 'break' ? -1 : y.minutes - x.minutes))
  return (
    <div>
      <div role="img" aria-label={`${t('planner.strip')}: ${legend.map((l) => `${l.label} ${formatDuration(l.minutes)}`).join(', ')}`} className="relative h-3.5 overflow-hidden rounded-[4px]">
        {items.map((it) => {
          const slot = schedule.slots[it.id]
          return <span key={it.id} className="absolute inset-y-0 rounded-[4px] border-x border-paper" style={{ left: pct(slot.start - from), width: pct(slot.end - slot.start), background: colorOf(it) }} />
        })}
        {items
          .filter((it) => schedule.slots[it.id].overlap > 0)
          .map((it) => {
            const slot = schedule.slots[it.id]
            return <span key={`o-${it.id}`} className="absolute inset-y-0 rounded-[4px] border-x border-paper bg-rose" style={{ left: pct(slot.start - from), width: pct(Math.min(slot.overlap, span)) }} />
          })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2 tnum">
        {legend.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} />
            {l.label} <b className="font-bold text-ink">{formatDuration(l.minutes)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** A sortable list that also takes drops while empty. */
export function List({ id, ids, empty, compact, emptyInsert, children }: { id: string; ids: string[]; empty: string; compact?: boolean; emptyInsert?: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={cx('group/list rounded-[14px] transition-colors', compact ? 'min-h-9' : 'min-h-24 flex-1 py-1', isOver && 'bg-surface-2')}>
        {children}
        {!ids.length && (
          <div className={cx('relative flex items-center justify-center rounded-[10px] border border-dashed border-line-2 px-4 text-center text-[12px] text-ink-3', compact ? 'h-8' : 'h-20')}>
            {empty}
            {emptyInsert}
          </div>
        )}
      </div>
    </SortableContext>
  )
}

/** The kinds to add at the end of a list. In an empty day (`first`) the first unit is the view's main action. */
export function AddBar({ onAdd, first }: { onAdd: (kind: ItemKind | 'group') => void; first?: boolean }) {
  const { t } = useTranslation()
  // From the offline copy the buttons stay where they are, but say that they need the connection (docs/offline.md).
  const offline = usePlanner((s) => !!s.offlineAt)
  const button = (kind: ItemKind | 'group', icon: ReactNode) => (
    <button
      type="button"
      disabled={offline}
      title={offline ? t('offline.needsConnection') : undefined}
      onClick={() => onAdd(kind)}
      className={cx('inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold pointer-coarse:h-9 disabled:cursor-not-allowed disabled:opacity-40', first && kind === 'block' ? 'bg-accent text-accent-ink enabled:hover:opacity-90' : 'border border-dashed border-line-2 text-brand-ink enabled:hover:bg-surface-2')}
    >
      {icon}
      {kind === 'group' ? t('group.new') : t(`kinds.${kind}`)}
    </button>
  )
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {button('block', <Plus size={13} />)}
      {button('break', <Plus size={13} />)}
      {button('marker', <Flag size={12} />)}
      {button('note', <StickyNote size={12} />)}
      {button('group', <FolderOpen size={12} />)}
    </div>
  )
}
