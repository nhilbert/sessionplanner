import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { type Announcements, DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { FolderOpen, Plus, X } from 'lucide-react'
import { productName } from '@/features'
import { api, ApiError, reportFailure } from '@/api'
import { usePlanner } from '@/store/usePlanner'
import { itemColor, useLibraryEdit, useSettings } from '@/store/useSettings'
import { useLibrary } from '@/store/useLibrary'
import { entriesIn, itemsIn, placeIn, positionAtEnd, sortedDays } from '@/domain/order'
import { MAX_DURATION, scheduleDay, SNAP, type DaySchedule } from '@/domain/time'
import { newId, type Op } from '@/domain/ops'
import { contentOf, fromLibrary } from '@/domain/copy'
import type { Item, ItemKind, LibraryEntry, WorkshopState } from '@/domain/types'
import { formatDate } from '@/i18n'
import { Button, cx, IconButton, isTyping, useIsPhone, useLocalState, useMediaQuery } from '@/components/ui'
import { overlayOpen } from '@/components/overlay'
import { BoardContext, type BoardCtx, DayColumn } from '@/planner/DayColumn'
import { ItemCard } from '@/planner/ItemCard'
import Toolbox, { type ItemNav, shownTab } from '@/planner/Toolbox'
import { DayList } from '@/planner/DayList'
import WorkshopHeader from '@/planner/WorkshopHeader'
import { flatIds, inner, PARKING, placeOf, useBoard } from '@/planner/board'
import { newItem } from '@/planner/fields'
import TimeEditor, { type TimeMode } from '@/planner/TimeEditor'
import type { InsertKind } from '@/planner/Insert'
import type { Preview } from '@/planner/DayColumn'
import AgendaView from './AgendaView'
import { PlannerSlideEditor, PlannerSlideMover, useSlideEditing } from '@/slides/PlannerSlides'

const ZOOM: Record<string, number> = { s: 1, m: 1.6, l: 2.6 }
const EMPTY = { workshop: { id: '' }, days: [], groups: [], items: [], attachments: [] } as unknown as WorkshopState

export default function PlannerPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const phone = useIsPhone()
  const { data, status, live, syncError, past, future, open, close, change, undo, redo, addAttachment, removeAttachment, dismissSyncError } = usePlanner()
  const settings = useSettings((s) => s.settings)
  const mayChangeLibrary = useLibraryEdit()
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
  // The details shown large, in place of the agenda: asked for per entry opened, and over once the details close.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    if (!detailsId || phone) setWide(false)
  }, [detailsId, phone])
  // What the timeline shows before it is saved: a length dragged or slid, a start time being chosen.
  const [preview, setPreview] = useState<Preview | null>(null)
  const [timeEdit, setTimeEdit] = useState<{ id: string; mode: TimeMode; anchor: DOMRect } | null>(null)
  const [notice, setNotice] = useState('')
  // Several days: one can be opened on its own, full width.
  const [focusDay, setFocusDay] = useState<string | null>(null)
  // Touch screens: the ⊕ marks between the entries show only while inserting is switched on (one button for all of them).
  // (Some touch devices report a pointer that hovers; a coarse pointer counts as touch as well.)
  const touch = useMediaQuery('(hover: none), (pointer: coarse)')
  const [inserting, setInserting] = useState(false)
  // Inserting ends with whatever changes the screen below it: another workshop, the sidebar, a tab, details.
  useEffect(() => setInserting(false), [id, mobileToolbox, tab, detailsId])
  const ppm = ZOOM[zoom] ?? ZOOM.m
  const collapsed = useMemo(() => new Set<string>(safeParse(collapsedRaw)), [collapsedRaw])

  useEffect(() => {
    open(id)
    setFocusDay(null)
    return () => {
      useSlideEditing.getState().close()
      close()
    }
  }, [id, open, close])
  useEffect(() => {
    document.title = data?.workshop.title ? `${data.workshop.title} · ${productName()}` : productName()
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
  const setPosition = (x: string, position: number): Op => (groups[x] ? { op: 'set', entity: 'group', id: x, fields: { position } } : { op: 'set', entity: 'item', id: x, fields: { position } })

  // ---- library entries arrive as copies ---------------------------------------------------------
  const insertLibrary = async (entry: LibraryEntry, to: string, index: number) => {
    if (!data) return
    // The workshop gets its own copies of the entry's files first, so that the new items can name them.
    const files: Record<string, string> = {}
    if (entry.attachments.length) {
      try {
        for (const [from, copy] of Object.entries(await api.copyLibraryFiles(entry.id, data.workshop.id))) {
          addAttachment(copy)
          files[from] = copy.id
        }
      } catch (err) {
        if (err instanceof ApiError && err.message === 'quota') window.alert(t('files.quotaEntry', { title: entry.title }))
        else reportFailure(err)
        return
      }
    }
    let key = to
    let at = index
    if (entry.kind === 'group' && key.startsWith('in:')) {
      // Groups do not nest: a group dropped into a group goes right after it.
      const gid = key.slice(3)
      key = groups[gid]?.dayId ?? PARKING
      at = (board.lists[key] ?? []).indexOf(gid) + 1
    }
    const { dayId, groupId } = placeOf(data, key)
    const { group, items: created } = fromLibrary(entry, data.workshop.id, dayId, groupId, 0, files)
    const topId = group?.id ?? created[0].id
    const { position, ops } = placeIn(state, board.lists[key] ?? [], topId, at)
    if (group) ops.push({ op: 'create', entity: 'group', record: { ...group, position } }, ...created.map((i): Op => ({ op: 'create', entity: 'item', record: i })))
    else ops.push({ op: 'create', entity: 'item', record: { ...created[0], position } })
    change(ops)
  }

  const board = useBoard({
    data: state,
    change,
    onLibraryDrop: (entryId, to, index) => {
      const entry = library.entries.find((e) => e.id === entryId)
      if (entry) void insertLibrary(entry, to, index)
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
    // Space picks an entry up and puts it down; Enter is left to the entry itself, where it opens the details.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  )
  // While inserting on a touch screen a long press must not pick an entry up.
  const noSensors = useSensors()

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
    const { position, ops } = placeIn(state, board.lists[list] ?? [], id, index)
    if (kind === 'group') ops.push({ op: 'create', entity: 'group', record: { id, workshopId: data.workshop.id, dayId, position, title: t('group.newTitle') } })
    else ops.push({ op: 'create', entity: 'item', record: { ...newItem(t, data.workshop.id, dayId, kind, position), id, groupId } })
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
    const duration = Math.min(MAX_DURATION, Math.max(SNAP, item.duration + delta))
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
  /** From a list beside the agenda (the packing list) to the entry itself: its details open and the agenda shows it. */
  const jumpTo = (itemId: string) => {
    const item = items[itemId]
    if (!item) return
    // Out of a folded group and onto the day that is shown, or there is no row to go to.
    if (item.groupId && collapsed.has(item.groupId)) setCollapsedRaw(JSON.stringify([...collapsed].filter((x) => x !== item.groupId)))
    if (focusDay && item.dayId !== focusDay) setFocusDay(null)
    openDetails(itemId)
    window.setTimeout(() => {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.querySelector(`[data-entry="${CSS.escape(itemId)}"]`)?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    }, 60)
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
    const gid = newId()
    const { dayId } = placeOf(data, key)
    const { position, ops } = placeIn(state, list.filter((x) => !selected.has(x)), gid, index)
    ops.push({ op: 'create', entity: 'group', record: { id: gid, workshopId: data.workshop.id, dayId, position, title: t('group.newTitle') } })
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

  /** A group with its steps to the end of the parking lot, as a drag there would put it. */
  const parkGroup = (gid: string) => {
    if (!data || !groups[gid]) return
    const ops: Op[] = [{ op: 'set', entity: 'group', id: gid, fields: { dayId: null, position: positionAtEnd(entriesIn(data, null)) } }]
    for (const x of board.lists[inner(gid)] ?? []) ops.push({ op: 'set', entity: 'item', id: x, fields: { dayId: null } })
    change(ops)
  }

  const saveGroup = async (gid: string) => {
    const members = (board.lists[inner(gid)] ?? []).map((x) => items[x]).filter(Boolean)
    if (!members.length) return
    const title = groups[gid]?.title || t('group.untitled')
    try {
      await library.save({ kind: 'group', title, data: { items: members.map(contentOf) } })
      setNotice(t('library.saved', { title }))
    } catch (err) {
      reportFailure(err)
    }
  }

  // ---- keyboard --------------------------------------------------------------------------------
  const single = selected.size === 1 ? [...selected][0] : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog, menu or the slide editor above the agenda takes the keys; the agenda behind it stays as it is.
      if (isTyping(e.target) || overlayOpen() || e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape') {
        // One step back at a time: from the large details to the agenda with the details beside it, then out of them.
        if (wide && detailsId) setWide(false)
        else clearSelection()
      }
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
        <Link to="/" className="mt-4 inline-block text-accent-strong hover:underline">
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
    onInsert: (list, index, kind) => {
      setInserting(false)
      insertAt(list, index, kind)
    },
    busy: !!board.activeId || !!preview,
    touch,
    inserting: touch && inserting,
    onResizeEnd: (itemId, duration) => change([{ op: 'set', entity: 'item', id: itemId, fields: { duration } }]),
    onToggleGroup: (gid) => setCollapsedRaw(JSON.stringify(collapsed.has(gid) ? [...collapsed].filter((x) => x !== gid) : [...collapsed, gid])),
    onRenameGroup: (gid, title) => change([{ op: 'set', entity: 'group', id: gid, fields: { title } }]),
    onUngroup: ungroup,
    onDeleteGroup: deleteGroup,
    onParkGroup: parkGroup,
    onSaveGroup: owner && mayChangeLibrary ? (gid) => void saveGroup(gid) : undefined,
    onOpenSlides: (itemId) => {
      const first = items[itemId]?.slides[0]
      if (first) useSlideEditing.getState().open({ kind: 'step', itemId, key: first.id })
    },
  }

  /** Where an item would start if it flowed with the agenda (its fixed start taken away). */
  const flowStart = (it: Item): number | null => {
    const day = it.dayId ? days.find((d) => d.id === it.dayId) : undefined
    if (!day) return null
    const flowing = itemsIn(state, day.id).map((i) => (i.id === it.id ? { ...i, fixedStart: null } : i))
    return scheduleDay(day.startMin, day.endMin, flowing).slots[it.id]?.start ?? null
  }

  const detailsItem = detailsId ? items[detailsId] : null
  const computedStart = detailsItem?.dayId ? (schedules[detailsItem.dayId]?.slots[detailsItem.id]?.start ?? null) : null
  const showWide = wide && !!detailsItem && !phone
  // The entries in the agenda's order, for the way to the one before and after: all days, or the parking lot for an entry that waits there.
  const sequence = !detailsItem ? [] : detailsItem.dayId ? days.flatMap((d) => flatIds(board.order, d.id, board.groupIds)) : flatIds(board.order, PARKING, board.groupIds)
  const at = detailsItem ? sequence.indexOf(detailsItem.id) : -1
  const nav: ItemNav | undefined = at === -1 ? undefined : { index: at + 1, count: sequence.length, onPrev: at > 0 ? () => openDetails(sequence[at - 1]) : undefined, onNext: at < sequence.length - 1 ? () => openDetails(sequence[at + 1]) : undefined }
  const active = board.activeId
  const activeItem = active ? items[active] : undefined
  const activeGroup = active ? groups[active] : undefined
  const activeLib = active?.startsWith('lib:') ? library.entries.find((e) => `lib:${e.id}` === active) : undefined
  const focused = focusDay && days.some((d) => d.id === focusDay) ? focusDay : null
  const shownDays = focused ? days.filter((d) => d.id === focused) : days
  // One day gets one wide, centred column; two share the width; more scroll sideways. Side by side only where the
  // agenda's own room allows it (not the window's: both sidebars may be open); otherwise the days stand one below the other.
  const dayWidth = shownDays.length === 1 ? 'mx-auto w-full max-w-[760px]' : shownDays.length === 2 ? 'w-full @3xl:min-w-[320px] @3xl:max-w-[640px] @3xl:flex-1' : 'w-full @3xl:w-[330px] @3xl:shrink-0'
  // What a screen reader hears while an entry is moved with the keyboard: titles and places, not the entries' ids.
  const nameOf = (id: string | number): string => {
    const key = String(id)
    if (items[key]) return items[key].title || t(`kinds.${items[key].kind}`)
    if (groups[key]) return groups[key].title || t('group.untitled')
    return library.entries.find((e) => `lib:${e.id}` === key)?.title ?? ''
  }
  const placeName = (id: string | number): string => {
    const key = String(id)
    const list = key in board.order ? key : Object.keys(board.order).find((l) => board.order[l].includes(key))
    if (!list) return ''
    if (list === PARKING) return t('planner.parking')
    if (list.startsWith('in:')) return groups[list.slice(3)]?.title || t('group.untitled')
    const day = days.find((d) => d.id === list)
    return day ? formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('planner.dragPicked', { title: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      !over ? undefined : String(over.id) in board.order ? t('planner.dragOverList', { title: nameOf(active.id), place: placeName(over.id) }) : t('planner.dragOverEntry', { title: nameOf(active.id), other: nameOf(over.id), place: placeName(over.id) }),
    onDragEnd: ({ active, over }) => (over ? t('planner.dragDropped', { title: nameOf(active.id), place: placeName(over.id) }) : t('planner.dragCancelled', { title: nameOf(active.id) })),
    onDragCancel: ({ active }) => t('planner.dragCancelled', { title: nameOf(active.id) }),
  }
  return (
    <BoardContext.Provider value={ctx}>
      <DndContext sensors={touch && inserting ? noSensors : sensors} accessibility={{ announcements, screenReaderInstructions: { draggable: t('planner.dragHelp') } }} collisionDetection={board.collision} onDragStart={board.onDragStart} onDragOver={board.onDragOver} onDragEnd={board.onDragEnd} onDragCancel={board.onDragCancel}>
        <div className={cx('flex h-full min-h-0', touch && inserting && 'inserting')}>
          {/* Behind the large details the agenda stays as it is (its scroll position too); a slim list stands in for it. */}
          {showWide && detailsItem && <DayList title={data.workshop.title} days={days} lists={board.order} items={items} groups={groups} schedules={schedules} categories={settings.categories} currentId={detailsItem.id} onSelect={openDetails} />}
          <div className={cx('relative min-w-0 flex-1 flex-col', showWide ? 'hidden' : 'flex')}>
            <WorkshopHeader
              data={data}
              owner={owner}
              phone={phone}
              live={live}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              undo={undo}
              redo={redo}
              change={change}
              showDescription={desc === '1'}
              onShowDescription={(on) => setDesc(on ? '1' : '0')}
              zoom={zoom}
              onZoom={setZoom}
              onAddDay={addDay}
              onOpenSidebar={() => setMobileToolbox(true)}
            />

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
                    className={cx('shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors pointer-coarse:py-2', focused === dayId ? 'bg-brand font-semibold text-on-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                  >
                    {dayId === null ? t('planner.allDays') : `${i} · ${formatDate(days[i - 1].date, { weekday: 'short', day: 'numeric', month: 'numeric' })}`}
                  </button>
                ))}
                {/* A day more belongs with the days (it stays in the workshop's menu too, where a single day has no tabs). */}
                <button type="button" onClick={addDay} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-surface-2 pointer-coarse:py-2">
                  <Plus size={13} />
                  {t('planner.addDay')}
                </button>
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

            {touch && inserting && <p className="no-print bg-accent-soft px-4 py-2 text-[13px] font-semibold md:px-6">{t('insert.where')}</p>}

            <main className="@container min-h-0 flex-1 overflow-auto">
              <div className="flex min-h-full flex-col gap-8 p-4 md:p-8 @3xl:flex-row @3xl:items-start @3xl:gap-6">
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
              <p className="no-print px-8 pb-24 text-center text-[12px] text-ink-3 md:pb-6">{touch ? t('planner.touchKeys') : t('planner.keys')}</p>
            </main>

            {touch && (!(phone && mobileToolbox) || (!detailsItem && shownTab(tab, owner, data) === 'parking')) && (
              // One button for inserting instead of a mark at every gap: it shows the gaps, a tap on one asks for the kind.
              // On a phone it stays above the full-screen sidebar while that shows the parking lot, which has gaps too.
              <button
                type="button"
                data-insert-toggle
                aria-pressed={inserting}
                aria-label={inserting ? t('insert.done') : t('insert.toggle')}
                title={inserting ? t('insert.done') : t('insert.toggle')}
                onClick={() => setInserting((on) => !on)}
                className="no-print fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-[45] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-paper md:absolute md:bottom-4 md:z-20"
              >
                <Plus size={24} className={cx('transition-transform', inserting && 'rotate-45')} />
              </button>
            )}
          </div>

          <Toolbox
            data={data}
            owner={owner}
            onDayDate={changeDate}
            change={change}
            tab={tab}
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
            itemFromAgenda={phone && overlayForItem}
            onSelect={openDetails}
            onAddParked={(kind) => add(null, kind)}
            onLibraryInsert={(entry) => insertLibrary(entry, PARKING, (board.lists[PARKING] ?? []).length)}
            onAttachment={addAttachment}
            onRemoveAttachment={removeAttachment}
            onNotice={setNotice}
            onJump={jumpTo}
            wide={showWide}
            onWide={setWide}
            nav={nav}
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
          flowStart={flowStart(items[timeEdit.id])}
          phone={phone}
          onPreview={(fields) => setPreview(fields ? { id: timeEdit.id, fields } : null)}
          onCommit={(fields) => change([{ op: 'set', entity: 'item', id: timeEdit.id, fields }])}
          onClose={() => setTimeEdit(null)}
        />
      )}
      <PlannerSlideMover onNotice={setNotice} />
      <PlannerSlideEditor
        owner={owner}
        onNotice={setNotice}
        onDetails={() => {
          setTab('details')
          setDetailsId(null)
          setToolboxOpen('1')
          if (phone) setMobileToolbox(true)
        }}
      />
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
