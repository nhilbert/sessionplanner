import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { AlignLeft, CalendarPlus, ChevronLeft, FolderOpen, PanelRight, Printer, Redo2, Rows2, Rows3, Rows4, Undo2, X } from 'lucide-react'
import { PRINT_VARIANTS } from '@/domain/print'
import { VARIANT_LABEL } from '@/print/options'
import { usePlanner } from '@/store/usePlanner'
import { itemColor, useSettings } from '@/store/useSettings'
import { useLibrary } from '@/store/useLibrary'
import { entriesIn, itemsIn, placeAt, positionAtEnd, sortedDays } from '@/domain/order'
import { scheduleDay, SNAP, type DaySchedule } from '@/domain/time'
import { newId, type Op } from '@/domain/ops'
import { contentOf, fromLibrary } from '@/domain/copy'
import type { Item, ItemKind, LibraryEntry, WorkshopState } from '@/domain/types'
import { formatDate } from '@/i18n'
import { Button, cx, IconButton, isTyping, Segmented, useIsPhone, useLocalState } from '@/components/ui'
import Menu from '@/components/Menu'
import { BoardContext, type BoardCtx, DayColumn } from '@/planner/DayColumn'
import { ItemCard } from '@/planner/ItemCard'
import Toolbox, { type Tab } from '@/planner/Toolbox'
import { flatIds, inner, PARKING, placeOf, useBoard } from '@/planner/board'
import { newItem, TextField } from '@/planner/fields'
import TimeEditor, { type TimeMode } from '@/planner/TimeEditor'
import type { InsertKind } from '@/planner/Insert'
import type { Preview } from '@/planner/DayColumn'
import AgendaView from './AgendaView'

const ZOOM: Record<string, number> = { s: 1, m: 1.6, l: 2.6 }
const EMPTY = { workshop: { id: '' }, days: [], groups: [], items: [], attachments: [] } as unknown as WorkshopState

export default function PlannerPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const phone = useIsPhone()
  const { data, status, live, syncError, past, future, open, close, change, undo, redo, addAttachment, removeAttachment, dismissSyncError } = usePlanner()
  const settings = useSettings((s) => s.settings)
  const library = useLibrary()
  const [zoom, setZoom] = useLocalState('sp.zoom', 'm')
  const [desc, setDesc] = useLocalState('sp.desc', '1')
  const [toolboxOpen, setToolboxOpen] = useLocalState('sp.toolbox', '1')
  const [tab, setTab] = useLocalState('sp.tab', 'parking')
  const [collapsedRaw, setCollapsedRaw] = useLocalState('sp.collapsed', '[]')
  const [mobileToolbox, setMobileToolbox] = useState(false)
  // Phones: the details were opened by a tap on the agenda, so closing them returns there (not to a sidebar tab).
  const [overlayForItem, setOverlayForItem] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailsId, setDetailsId] = useState<string | null>(null)
  // What the timeline shows before it is saved: a length dragged or slid, a start time being chosen.
  const [preview, setPreview] = useState<Preview | null>(null)
  const [timeEdit, setTimeEdit] = useState<{ id: string; mode: TimeMode; anchor: DOMRect } | null>(null)
  const [notice, setNotice] = useState('')
  // Several days: one can be opened on its own, full width.
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const ppm = ZOOM[zoom] ?? ZOOM.m
  const collapsed = useMemo(() => new Set<string>(safeParse(collapsedRaw)), [collapsedRaw])

  useEffect(() => {
    open(id)
    setFocusDay(null)
    return () => close()
  }, [id, open, close])
  useEffect(() => {
    document.title = data?.workshop.title ? `${data.workshop.title} · Session Planner` : 'Session Planner'
  }, [data?.workshop.title])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const state = data ?? EMPTY
  const days = useMemo(() => sortedDays(state.days), [state.days])
  const items = useMemo(() => Object.fromEntries(state.items.map((i) => [i.id, i])), [state.items])
  const groups = useMemo(() => Object.fromEntries(state.groups.map((g) => [g.id, g])), [state.groups])
  const positionOf = (x: string) => items[x]?.position ?? groups[x]?.position ?? 0
  const setPosition = (x: string, position: number): Op => (groups[x] ? { op: 'set', entity: 'group', id: x, fields: { position } } : { op: 'set', entity: 'item', id: x, fields: { position } })

  // ---- library entries arrive as copies ---------------------------------------------------------
  const insertLibrary = (entry: LibraryEntry, to: string, index: number) => {
    if (!data) return
    let key = to
    let at = index
    if (entry.kind === 'group' && key.startsWith('in:')) {
      // Groups do not nest: a group dropped into a group goes right after it.
      const gid = key.slice(3)
      key = groups[gid]?.dayId ?? PARKING
      at = (board.lists[key] ?? []).indexOf(gid) + 1
    }
    const { dayId, groupId } = placeOf(data, key)
    const { group, items: created } = fromLibrary(entry, data.workshop.id, dayId, groupId, 0)
    const topId = group?.id ?? created[0].id
    const siblings = (board.lists[key] ?? []).map((x) => ({ id: x, position: positionOf(x) }))
    const ops: Op[] = []
    for (const p of placeAt(siblings, topId, at)) {
      if (p.id !== topId) ops.push(setPosition(p.id, p.position))
      else if (group) ops.push({ op: 'create', entity: 'group', record: { ...group, position: p.position } })
      else ops.push({ op: 'create', entity: 'item', record: { ...created[0], position: p.position } })
    }
    if (group) for (const i of created) ops.push({ op: 'create', entity: 'item', record: i })
    change(ops)
  }

  const board = useBoard({
    data: state,
    change,
    onLibraryDrop: (entryId, to, index) => {
      const entry = library.entries.find((e) => e.id === entryId)
      if (entry) insertLibrary(entry, to, index)
    },
  })

  const schedules = useMemo(() => {
    const out: Record<string, DaySchedule> = {}
    for (const d of days) {
      const timed = flatIds(board.projected, d.id, board.groupIds)
        .map((x) => items[x])
        .filter(Boolean)
        .map((i) => (preview?.id === i.id ? { ...i, ...preview.fields } : i))
      out[d.id] = scheduleDay(d.startMin, d.endMin, timed)
    }
    return out
  }, [days, board.projected, board.groupIds, items, preview])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ---- actions ---------------------------------------------------------------------------------
  const add = (dayId: string | null, kind: ItemKind | 'group') => {
    if (!data) return
    const position = positionAtEnd(entriesIn(data, dayId))
    if (kind === 'group') {
      change([{ op: 'create', entity: 'group', record: { id: newId(), workshopId: data.workshop.id, dayId, position, title: t('group.newTitle') } }])
      return
    }
    const item = newItem(t, data.workshop.id, dayId, kind, position)
    change([{ op: 'create', entity: 'item', record: item }])
    openDetails(item.id)
  }

  /** An entry added at a ⊕ between two others: into that day, the parking lot or the group. */
  const insertAt = (list: string, index: number, kind: InsertKind) => {
    if (!data) return
    const { dayId, groupId } = placeOf(data, list)
    const id = newId()
    const siblings = (board.lists[list] ?? []).map((x) => ({ id: x, position: positionOf(x) }))
    const ops: Op[] = []
    for (const p of placeAt(siblings, id, index)) {
      if (p.id !== id) ops.push(setPosition(p.id, p.position))
      else if (kind === 'group') ops.push({ op: 'create', entity: 'group', record: { id, workshopId: data.workshop.id, dayId, position: p.position, title: t('group.newTitle') } })
      else ops.push({ op: 'create', entity: 'item', record: { ...newItem(t, data.workshop.id, dayId, kind, p.position), id, groupId } })
    }
    change(ops)
    if (kind !== 'group') openDetails(id)
  }

  /** A day gets a new date; for the first of several days the app offers to move the others along. */
  const changeDate = (dayId: string, date: string) => {
    const day = days.find((d) => d.id === dayId)
    if (!day) return
    const shift = Math.round((Date.parse(date) - Date.parse(day.date)) / 86_400_000)
    const others = days.filter((d) => d.id !== dayId)
    if (days[0]?.id === dayId && others.length && shift && window.confirm(t('planner.moveOtherDays', { count: others.length }))) {
      const moved = (d: string) => new Date(Date.parse(d) + shift * 86_400_000).toISOString().slice(0, 10)
      change(days.map((d): Op => ({ op: 'set', entity: 'day', id: d.id, fields: { date: moved(d.date) } })))
    } else change([{ op: 'set', entity: 'day', id: dayId, fields: { date } }])
  }

  const addDay = () => {
    if (!data) return
    const last = days[days.length - 1]
    const date = last ? nextDate(last.date) : new Date().toLocaleDateString('sv')
    change([
      {
        op: 'create',
        entity: 'day',
        record: { id: newId(), workshopId: data.workshop.id, position: positionAtEnd(days), date, startMin: last?.startMin ?? settings.dayStart, endMin: last ? last.endMin : settings.dayEnd },
      },
    ])
  }

  const deleteDay = (dayId: string) => {
    if (!data || !window.confirm(t('planner.deleteDayConfirm'))) return
    // Its groups and items go to the end of the parking lot, in their order; members follow their group.
    let pos = positionAtEnd(entriesIn(data, null))
    const ops: Op[] = []
    for (const e of entriesIn(data, dayId)) {
      if (e.type === 'group') {
        ops.push({ op: 'set', entity: 'group', id: e.id, fields: { dayId: null, position: pos++ } })
        for (const m of e.items) ops.push({ op: 'set', entity: 'item', id: m.id, fields: { dayId: null } })
      } else ops.push({ op: 'set', entity: 'item', id: e.id, fields: { dayId: null, position: pos++ } })
    }
    ops.push({ op: 'delete', entity: 'day', id: dayId })
    change(ops)
  }

  const resizeBy = (item: Item, delta: number) => {
    if (item.kind !== 'block' && item.kind !== 'break') return
    const duration = Math.min(1440, Math.max(SNAP, item.duration + delta))
    if (duration !== item.duration) change([{ op: 'set', entity: 'item', id: item.id, fields: { duration } }])
  }

  const openDetails = (itemId: string) => {
    setSelected(new Set([itemId]))
    setDetailsId(itemId)
    setToolboxOpen('1')
    if (phone && !mobileToolbox) {
      setMobileToolbox(true)
      setOverlayForItem(true)
    }
  }
  const clearSelection = () => {
    setSelected(new Set())
    setDetailsId(null)
    if (overlayForItem) {
      setOverlayForItem(false)
      setMobileToolbox(false)
    }
  }
  const closeMobileToolbox = () => {
    setMobileToolbox(false)
    setOverlayForItem(false)
    setDetailsId(null)
  }

  /** Puts the selected items, in agenda order, into a new group where the first of them was. */
  const groupSelected = () => {
    if (!data) return
    const ordered = [...days.flatMap((d) => itemsIn(data, d.id)), ...itemsIn(data, null)].filter((i) => selected.has(i.id))
    if (!ordered.length) return
    const first = ordered[0]
    const inGroup = first.groupId !== null && !!groups[first.groupId]
    const key = (inGroup ? groups[first.groupId!].dayId : first.dayId) ?? PARKING
    const anchor = inGroup ? first.groupId! : first.id
    const list = board.lists[key] ?? []
    // Inside an existing group, the new group goes right after it.
    const index = list.slice(0, list.indexOf(anchor)).filter((x) => !selected.has(x)).length + (inGroup ? 1 : 0)
    const siblings = list.filter((x) => !selected.has(x)).map((x) => ({ id: x, position: positionOf(x) }))
    const gid = newId()
    const { dayId } = placeOf(data, key)
    const ops: Op[] = []
    for (const p of placeAt(siblings, gid, index)) {
      if (p.id === gid) ops.push({ op: 'create', entity: 'group', record: { id: gid, workshopId: data.workshop.id, dayId, position: p.position, title: t('group.newTitle') } })
      else ops.push(setPosition(p.id, p.position))
    }
    ordered.forEach((i, n) => ops.push({ op: 'set', entity: 'item', id: i.id, fields: { groupId: gid, dayId, position: n + 1 } }))
    change(ops)
    clearSelection()
  }

  const ungroup = (gid: string) => {
    const g = groups[gid]
    if (!g) return
    const key = g.dayId ?? PARKING
    const order = (board.lists[key] ?? []).flatMap((x) => (x === gid ? (board.lists[inner(gid)] ?? []) : [x]))
    const ops: Op[] = order.map((x, n): Op => (groups[x] ? setPosition(x, n + 1) : { op: 'set', entity: 'item', id: x, fields: { position: n + 1, groupId: null } }))
    ops.push({ op: 'delete', entity: 'group', id: gid })
    change(ops)
  }

  const deleteGroup = (gid: string) => {
    if (!window.confirm(t('group.deleteConfirm', { title: groups[gid]?.title || t('group.untitled') }))) return
    change([...(board.lists[inner(gid)] ?? []).map((x): Op => ({ op: 'delete', entity: 'item', id: x })), { op: 'delete', entity: 'group', id: gid }])
  }

  const saveGroup = async (gid: string) => {
    const members = (board.lists[inner(gid)] ?? []).map((x) => items[x]).filter(Boolean)
    if (!members.length) return
    const title = groups[gid]?.title || t('group.untitled')
    await library.save({ kind: 'group', title, data: { items: members.map(contentOf) } })
    setNotice(t('library.saved', { title }))
  }

  // ---- keyboard --------------------------------------------------------------------------------
  const single = selected.size === 1 ? [...selected][0] : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape') clearSelection()
      else if (!mod && single && items[single] && (e.key === '+' || e.key === '=' || e.key === '-')) {
        e.preventDefault()
        resizeBy(items[single], e.key === '-' ? -SNAP : SNAP)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // An item deleted elsewhere leaves the selection (and, on a phone, its details overlay).
  useEffect(() => {
    if (!detailsId || !data || items[detailsId]) return
    setDetailsId(null)
    if (overlayForItem) {
      setOverlayForItem(false)
      setMobileToolbox(false)
    }
  }, [detailsId, data, items, overlayForItem])

  if (status === 'loading' || status === 'idle') return <Centered>{t('common.loading')}</Centered>
  if (status === 'missing')
    return (
      <Centered>
        <p>{t('common.missing')}</p>
        <Link to="/" className="mt-4 inline-block text-accent hover:underline">
          {t('common.back')}
        </Link>
      </Centered>
    )
  if (status === 'login' || !data)
    return (
      <Centered>
        <p>{status === 'login' ? t('common.login') : t('common.error')}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          {t('common.reload')}
        </Button>
      </Centered>
    )

  // Guests with view access get the read-only agenda; editing guests the planner without the owner's tools.
  if (data.access?.role === 'view') return <AgendaView data={data} />
  const owner = !data.access

  const ctx: BoardCtx = {
    lists: board.order,
    items,
    groups,
    categories: settings.categories,
    ppm,
    showDescription: desc === '1',
    phone,
    selected,
    collapsed,
    preview,
    onSelect: (itemId, e) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const next = new Set(selected)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        setSelected(next)
        setDetailsId(null)
      } else openDetails(itemId)
    },
    onEditItem: (itemId, fields) => change([{ op: 'set', entity: 'item', id: itemId, fields }]),
    onResize: (itemId, minutes) => setPreview(minutes === null ? null : { id: itemId, fields: { duration: minutes } }),
    onOpenTime: (itemId, mode, anchor) => setTimeEdit({ id: itemId, mode, anchor }),
    onInsert: insertAt,
    busy: !!board.activeId || !!preview,
    onResizeEnd: (itemId, duration) => change([{ op: 'set', entity: 'item', id: itemId, fields: { duration } }]),
    onToggleGroup: (gid) => setCollapsedRaw(JSON.stringify(collapsed.has(gid) ? [...collapsed].filter((x) => x !== gid) : [...collapsed, gid])),
    onRenameGroup: (gid, title) => change([{ op: 'set', entity: 'group', id: gid, fields: { title } }]),
    onUngroup: ungroup,
    onDeleteGroup: deleteGroup,
    onSaveGroup: owner ? (gid) => void saveGroup(gid) : undefined,
  }

  const detailsItem = detailsId ? items[detailsId] : null
  const computedStart = detailsItem?.dayId ? (schedules[detailsItem.dayId]?.slots[detailsItem.id]?.start ?? null) : null
  const active = board.activeId
  const activeItem = active ? items[active] : undefined
  const activeGroup = active ? groups[active] : undefined
  const activeLib = active?.startsWith('lib:') ? library.entries.find((e) => `lib:${e.id}` === active) : undefined
  const dates = days.length ? (days.length === 1 ? formatDate(days[0].date) : `${formatDate(days[0].date)} – ${formatDate(days[days.length - 1].date)}`) : ''
  const focused = focusDay && days.some((d) => d.id === focusDay) ? focusDay : null
  const shownDays = focused ? days.filter((d) => d.id === focused) : days
  // One day gets one wide, centred column; two share the width; more scroll sideways.
  const dayWidth = shownDays.length === 1 ? 'w-full md:max-w-[760px]' : shownDays.length === 2 ? 'w-full md:min-w-[320px] md:max-w-[640px] md:flex-1' : 'w-full md:w-[330px] md:shrink-0'
  const printItems = [
    ...PRINT_VARIANTS.map((v) => ({
      label: t(VARIANT_LABEL[v]),
      icon: <Printer size={15} />,
      onSelect: () => window.open(`/w/${data.workshop.id}/print/${v}`, '_blank', 'noopener'),
    })),
    { label: t('slides.printSlides'), icon: <Printer size={15} />, onSelect: () => window.open(`/w/${data.workshop.id}/print/slides`, '_blank', 'noopener') },
  ]
  const zoomItems = [
    { value: 's', label: t('planner.zoomS'), icon: <Rows4 size={15} /> },
    { value: 'm', label: t('planner.zoomM'), icon: <Rows3 size={15} /> },
    { value: 'l', label: t('planner.zoomL'), icon: <Rows2 size={15} /> },
  ]

  return (
    <BoardContext.Provider value={ctx}>
      <DndContext sensors={sensors} collisionDetection={board.collision} onDragStart={board.onDragStart} onDragOver={board.onDragOver} onDragEnd={board.onDragEnd} onDragCancel={board.onDragCancel}>
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 md:gap-x-3 md:px-6 md:py-2.5">
              <Link to="/" aria-label={t('common.back')} title={t('common.back')} className="tap -ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink md:hidden">
                <ChevronLeft size={20} />
              </Link>
              <div className="min-w-0 flex-1">
                <TextField
                  value={data.workshop.title}
                  onCommit={(title) => change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { title } }])}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  placeholder={t('workshops.untitled')}
                  aria-label={t('workshop.title')}
                  className="field-bare -ml-2 h-8 w-full max-w-xl text-ellipsis px-2 text-[17px] font-medium"
                />
                <div className="truncate text-[12px] text-ink-3">{[data.workshop.client, data.workshop.location, dates].filter(Boolean).join(' · ')}</div>
              </div>
              {/* Phones keep undo and the sidebar at hand; the rest sits in a ⋯ menu. Desktop shows everything. */}
              <div className="flex shrink-0 items-center gap-1">
                <span title={live ? t('planner.live') : t('planner.offline')} className={cx('mx-1 h-2 w-2 shrink-0 rounded-full', live ? 'bg-accent' : 'bg-amber')} />
                {!live && <span className="text-[12px] text-amber">{t('planner.offline')}</span>}
                <IconButton label={t('common.undo')} onClick={undo} disabled={!past.length}>
                  <Undo2 size={15} />
                </IconButton>
                <IconButton label={t('common.redo')} onClick={redo} disabled={!future.length} className="max-md:hidden">
                  <Redo2 size={15} />
                </IconButton>
                <IconButton
                  label={desc === '1' ? t('planner.hideDescription') : t('planner.showDescription')}
                  aria-pressed={desc === '1'}
                  onClick={() => setDesc(desc === '1' ? '0' : '1')}
                  className={cx('max-md:hidden', desc === '1' && 'bg-surface-2 text-ink')}
                >
                  <AlignLeft size={15} />
                </IconButton>
                <span className="max-md:hidden">
                  <Segmented
                    size="sm"
                    value={zoom}
                    onChange={setZoom}
                    options={[
                      { value: 's', label: 'S' },
                      { value: 'm', label: 'M' },
                      { value: 'l', label: 'L' },
                    ]}
                  />
                </span>
                <IconButton label={t('planner.addDay')} onClick={addDay} className="max-md:hidden">
                  <CalendarPlus size={15} />
                </IconButton>
                <Menu label={t('planner.print')} trigger={<Printer size={15} />} className="max-md:hidden" items={printItems} />
                <Menu
                  label={t('planner.actions')}
                  className="md:hidden"
                  items={[
                    ...(future.length ? [{ label: t('common.redo'), icon: <Redo2 size={15} />, onSelect: redo }] : []),
                    { label: t('planner.showDescription'), icon: <AlignLeft size={15} />, checked: desc === '1', onSelect: () => setDesc(desc === '1' ? '0' : '1') },
                    ...zoomItems.map((z) => ({ label: z.label, icon: z.icon, checked: zoom === z.value, onSelect: () => setZoom(z.value) })),
                    { label: t('planner.addDay'), icon: <CalendarPlus size={15} />, onSelect: addDay },
                    ...printItems,
                  ]}
                />
                <IconButton label={t('toolbox.open')} onClick={() => setMobileToolbox(true)} className="md:hidden">
                  <PanelRight size={15} />
                </IconButton>
              </div>
            </header>

            {syncError && (
              <div className="no-print flex items-center justify-between gap-3 bg-rose-soft px-5 py-2 text-[13px] text-rose">
                {t('planner.syncError')}
                <IconButton label={t('common.close')} onClick={dismissSyncError}>
                  <X size={14} />
                </IconButton>
              </div>
            )}

            {days.length > 1 && (
              <nav className="no-print flex gap-1 overflow-x-auto border-b border-line px-4 py-1.5 md:px-6" aria-label={t('planner.days')}>
                {[null, ...days.map((d) => d.id)].map((dayId, i) => (
                  <button
                    key={dayId ?? 'all'}
                    type="button"
                    onClick={() => setFocusDay(dayId)}
                    aria-pressed={focused === dayId}
                    className={cx('shrink-0 rounded-md px-2.5 py-1 text-[13px] transition-colors pointer-coarse:py-2', focused === dayId ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink')}
                  >
                    {dayId === null ? t('planner.allDays') : `${i} · ${formatDate(days[i - 1].date, { weekday: 'short', day: 'numeric', month: 'numeric' })}`}
                  </button>
                ))}
              </nav>
            )}

            {selected.size > 1 && (
              <div className="no-print flex items-center gap-2 border-b border-line bg-accent-soft/60 px-4 py-1.5 text-[13px] md:px-6">
                <span className="text-ink-2">{t('planner.selected', { count: selected.size })}</span>
                <Button size="sm" onClick={groupSelected}>
                  <FolderOpen size={13} />
                  {t('group.make')}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  {t('planner.clearSelection')}
                </Button>
              </div>
            )}

            <main className="min-h-0 flex-1 overflow-auto">
              <div className={cx('flex min-h-full flex-col gap-8 p-4 md:flex-row md:items-start md:gap-6 md:p-8', shownDays.length === 1 && 'md:justify-center')}>
                {shownDays.map((d) => (
                  <DayColumn
                    key={d.id}
                    day={d}
                    index={days.indexOf(d)}
                    count={days.length}
                    focused={focused === d.id}
                    onFocus={() => setFocusDay(focused === d.id ? null : d.id)}
                    ids={board.order[d.id] ?? []}
                    schedule={schedules[d.id]}
                    className={dayWidth}
                    onAdd={(kind) => add(d.id, kind)}
                    onChange={(fields) => (fields.date ? changeDate(d.id, fields.date) : change([{ op: 'set', entity: 'day', id: d.id, fields }]))}
                    onDelete={() => deleteDay(d.id)}
                  />
                ))}
              </div>
              <p className="no-print px-8 pb-6 text-center text-[12px] text-ink-3">{phone ? t('planner.touchKeys') : t('planner.keys')}</p>
            </main>
          </div>

          <Toolbox
            data={data}
            owner={owner}
            onDayDate={changeDate}
            change={change}
            tab={tab as Tab}
            onTab={(x) => {
              setTab(x)
              setDetailsId(null)
            }}
            open={toolboxOpen === '1'}
            onOpen={(o) => setToolboxOpen(o ? '1' : '0')}
            mobile={phone && mobileToolbox}
            onCloseMobile={closeMobileToolbox}
            parkingIds={board.order[PARKING] ?? []}
            itemId={detailsItem ? detailsItem.id : null}
            computedStart={computedStart}
            onCloseItem={clearSelection}
            itemBack={phone && overlayForItem ? t('planner.agenda') : undefined}
            onSelect={openDetails}
            onAddParked={(kind) => add(null, kind)}
            onLibraryInsert={(entry) => insertLibrary(entry, PARKING, (board.lists[PARKING] ?? []).length)}
            onAttachment={addAttachment}
            onRemoveAttachment={removeAttachment}
            onNotice={setNotice}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="w-[300px] opacity-90 shadow-[var(--shadow)]">
              <ItemCard item={activeItem} color={itemColor(activeItem, settings.categories)} showDescription={false} />
            </div>
          ) : activeGroup ? (
            <div className="card w-[300px] px-3 py-2 text-[13px] font-semibold opacity-90 shadow-[var(--shadow)]">{activeGroup.title || t('group.untitled')}</div>
          ) : activeLib ? (
            <div className="card w-[280px] px-3 py-2 text-[13px] opacity-90 shadow-[var(--shadow)]">{activeLib.title}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {timeEdit && items[timeEdit.id] && (
        <TimeEditor
          key={`${timeEdit.id}-${timeEdit.mode}`}
          item={items[timeEdit.id]}
          mode={timeEdit.mode}
          anchor={timeEdit.anchor}
          computedStart={(() => {
            const it = items[timeEdit.id]
            return it.dayId ? (schedules[it.dayId]?.slots[it.id]?.start ?? null) : null
          })()}
          phone={phone}
          onPreview={(fields) => setPreview(fields ? { id: timeEdit.id, fields } : null)}
          onCommit={(fields) => change([{ op: 'set', entity: 'item', id: timeEdit.id, fields }])}
          onClose={() => setTimeEdit(null)}
        />
      )}
      {notice && <div className="no-print fade-in fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-[13px] text-paper shadow-[var(--shadow)] md:bottom-6">{notice}</div>}
    </BoardContext.Provider>
  )
}

function safeParse(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center text-ink-2">{children}</div>
}
