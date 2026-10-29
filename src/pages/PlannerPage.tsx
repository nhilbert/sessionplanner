import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { ArrowLeft, Info, Package, Paperclip, Plus, Printer, Redo2, Undo2 } from 'lucide-react'
import { usePlanner } from '@/store/usePlanner'
import { agendaOrder, itemsIn, placeAt, positionAtEnd, sortedDays } from '@/domain/order'
import { scheduleDay, SNAP, type DaySchedule } from '@/domain/time'
import { newId, type Op } from '@/domain/ops'
import type { Item, ItemKind } from '@/domain/types'
import { Button, cx, IconButton, isTyping, Segmented, useLocalState } from '@/components/ui'
import LanguageSwitch from '@/components/LanguageSwitch'
import { AddBar, DayColumn, List } from '@/planner/DayColumn'
import { ItemCard, SortableItem } from '@/planner/ItemCard'
import ItemPanel from '@/planner/ItemPanel'
import { FilesPanel, PackingPanel, SidePanel, WorkshopPanel } from '@/planner/panels'
import { newItem, TextField } from '@/planner/fields'

const PARKING = 'parking'
const ZOOM: Record<string, number> = { s: 1, m: 1.6, l: 2.6 }

type Panel = { kind: 'item'; id: string } | { kind: 'workshop' } | { kind: 'packing' } | { kind: 'files' } | null

export default function PlannerPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { data, status, live, syncError, past, future, open, close, change, undo, redo, addAttachment, removeAttachment, dismissSyncError } = usePlanner()
  const [panel, setPanel] = useState<Panel>(null)
  const [zoom, setZoom] = useLocalState('sp.zoom', 'm')
  const ppm = ZOOM[zoom] ?? ZOOM.m
  const [resizing, setResizing] = useState<{ id: string; minutes: number } | null>(null)

  useEffect(() => {
    open(id)
    return () => close()
  }, [id, open, close])

  useEffect(() => {
    document.title = data?.workshop.title ? `${data.workshop.title} · Session Planner` : 'Session Planner'
  }, [data?.workshop.title])

  const days = useMemo(() => (data ? sortedDays(data.days) : []), [data])
  const byId = useMemo(() => Object.fromEntries((data?.items ?? []).map((i) => [i.id, i])), [data])
  const containers = useMemo(() => {
    const m: Record<string, string[]> = { [PARKING]: itemsIn(data?.items ?? [], null).map((i) => i.id) }
    for (const d of days) m[d.id] = itemsIn(data?.items ?? [], d.id).map((i) => i.id)
    return m
  }, [data, days])

  // ---- drag and drop -------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [preview, setPreview] = useState<Record<string, string[]> | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const order = preview ?? containers
  const containerOf = (key: string, lists = order) => (key in lists ? key : Object.keys(lists).find((c) => lists[c].includes(key)))

  // While dragging within a list, the times already follow the place the item would land on.
  const projected = useMemo(() => {
    if (!activeId || !overId) return order
    const c = containerOf(activeId)
    if (!c || !order[c].includes(overId) || overId === activeId) return order
    return { ...order, [c]: arrayMove(order[c], order[c].indexOf(activeId), order[c].indexOf(overId)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, activeId, overId])

  const schedules = useMemo(() => {
    const out: Record<string, DaySchedule> = {}
    for (const d of days) {
      const timed = (projected[d.id] ?? []).map((x) => byId[x]).filter(Boolean).map((i) => (resizing?.id === i.id ? { ...i, duration: resizing.minutes } : i))
      out[d.id] = scheduleDay(d.startMin, d.endMin, timed)
    }
    return out
  }, [days, projected, byId, resizing])

  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args)
    const onItems = within.filter((c) => !(String(c.id) in order))
    if (onItems.length) return onItems
    if (within.length) return within
    return closestCenter(args)
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setPreview(containers)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    setOverId(o)
    setPreview((prev) => {
      if (!prev) return prev
      const from = containerOf(a, prev)
      const to = containerOf(o, prev)
      if (!from || !to || from === to) return prev
      const target = [...prev[to]]
      const at = o in prev ? target.length : target.indexOf(o)
      target.splice(at < 0 ? target.length : at, 0, a)
      return { ...prev, [from]: prev[from].filter((x) => x !== a), [to]: target }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const lists = preview
    setActiveId(null)
    setOverId(null)
    setPreview(null)
    if (!over || !lists || !data) return
    const a = String(active.id)
    const o = String(over.id)
    const to = containerOf(a, lists)
    if (!to) return
    let list = lists[to]
    if (list.includes(o) && o !== a) list = arrayMove(list, list.indexOf(a), list.indexOf(o))
    const index = list.indexOf(a)
    const dayId = to === PARKING ? null : to
    const before = containers[to] ?? []
    if (byId[a].dayId === dayId && before.indexOf(a) === index) return
    const siblings = list.filter((x) => x !== a).map((x) => byId[x])
    const ops: Op[] = placeAt(siblings, a, index).map((p) =>
      p.id === a ? { op: 'set', entity: 'item', id: a, fields: { dayId, position: p.position } } : { op: 'set', entity: 'item', id: p.id, fields: { position: p.position } },
    )
    change(ops)
  }

  // ---- actions -------------------------------------------------------------------------------
  const addItem = (dayId: string | null, kind: ItemKind) => {
    if (!data) return
    const item = newItem(t, data.workshop.id, dayId, kind, positionAtEnd(itemsIn(data.items, dayId)))
    change([{ op: 'create', entity: 'item', record: item }])
    setPanel({ kind: 'item', id: item.id })
  }

  const addDay = () => {
    if (!data) return
    const last = days[days.length - 1]
    const date = last ? nextDate(last.date) : new Date().toLocaleDateString('sv')
    change([
      {
        op: 'create',
        entity: 'day',
        record: { id: newId(), workshopId: data.workshop.id, position: positionAtEnd(days), date, startMin: last?.startMin ?? 540, endMin: last ? last.endMin : 1020 },
      },
    ])
  }

  const deleteDay = (dayId: string) => {
    if (!data || !window.confirm(t('planner.deleteDayConfirm'))) return
    // Its items go to the end of the parking lot, in their order.
    let pos = positionAtEnd(itemsIn(data.items, null))
    const ops: Op[] = itemsIn(data.items, dayId).map((i) => ({ op: 'set', entity: 'item', id: i.id, fields: { dayId: null, position: pos++ } }))
    ops.push({ op: 'delete', entity: 'day', id: dayId })
    change(ops)
  }

  const resizeBy = (item: Item, delta: number) => {
    if (item.kind !== 'block' && item.kind !== 'break') return
    const duration = Math.min(1440, Math.max(SNAP, item.duration + delta))
    if (duration !== item.duration) change([{ op: 'set', entity: 'item', id: item.id, fields: { duration } }])
  }

  // ---- keyboard ------------------------------------------------------------------------------
  const selectedId = panel?.kind === 'item' ? panel.id : null
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
      } else if (e.key === 'Escape') setPanel(null)
      else if (!mod && selectedId && byId[selectedId] && (e.key === '+' || e.key === '=' || e.key === '-')) {
        e.preventDefault()
        resizeBy(byId[selectedId], e.key === '-' ? -SNAP : SNAP)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // An item deleted elsewhere closes its panel.
  useEffect(() => {
    if (panel?.kind === 'item' && data && !byId[panel.id]) setPanel(null)
  }, [panel, data, byId])

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

  const selected = selectedId ? byId[selectedId] : null
  const selectedStart = selected?.dayId ? (schedules[selected.dayId]?.slots[selected.id]?.start ?? null) : null
  const totalItems = agendaOrder(data.days, data.items).length

  return (
    <div className="flex h-dvh flex-col">
      <header className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2 md:px-5">
        <Link to="/" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" title={t('common.back')}>
          <ArrowLeft size={16} />
        </Link>
        <TextField
          value={data.workshop.title}
          onCommit={(title) => change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { title } }])}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={t('workshops.untitled')}
          aria-label={t('workshop.title')}
          className="field-bare min-w-0 flex-1 text-[17px] font-medium"
        />
        {data.workshop.client && <span className="hidden truncate text-[14px] text-ink-2 md:inline">{data.workshop.client}</span>}
        <span title={live ? t('planner.live') : t('planner.offline')} className={cx('h-2 w-2 shrink-0 rounded-full', live ? 'bg-accent' : 'bg-amber')} />
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label={t('common.undo')} onClick={undo} disabled={!past.length}>
            <Undo2 size={15} />
          </IconButton>
          <IconButton label={t('common.redo')} onClick={redo} disabled={!future.length}>
            <Redo2 size={15} />
          </IconButton>
          <Segmented
            size="sm"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: 's', label: t('planner.zoomS') },
              { value: 'm', label: t('planner.zoomM') },
              { value: 'l', label: t('planner.zoomL') },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: 'packing' })}>
            <Package size={14} />
            <span className="hidden sm:inline">{t('planner.packing')}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: 'files' })}>
            <Paperclip size={14} />
            <span className="hidden sm:inline">{t('planner.files')}</span>
          </Button>
          <PrintMenu id={data.workshop.id} disabled={!totalItems} />
          <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: 'workshop' })}>
            <Info size={14} />
            <span className="hidden sm:inline">{t('planner.details')}</span>
          </Button>
          <LanguageSwitch />
        </div>
      </header>

      {syncError && (
        <div className="no-print flex items-center justify-between gap-3 bg-rose-soft px-5 py-2 text-[13px] text-rose">
          {t('planner.syncError')}
          <IconButton label={t('common.close')} onClick={dismissSyncError}>
            ×
          </IconButton>
        </div>
      )}

      <main className={cx('flex-1 overflow-auto', panel && 'md:pr-[440px]')}>
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setPreview(null), setActiveId(null), setOverId(null))}>
          <div className="flex min-h-full flex-col items-stretch gap-6 p-4 md:flex-row md:items-start md:gap-5 md:p-6">
            {days.map((d, i) => (
              <DayColumn
                key={d.id}
                day={d}
                index={i}
                schedule={schedules[d.id]}
                ppm={ppm}
                ids={order[d.id] ?? []}
                items={byId}
                selectedId={selectedId}
                resizing={resizing}
                onSelect={(itemId) => setPanel({ kind: 'item', id: itemId })}
                onAdd={(kind) => addItem(d.id, kind)}
                onResize={(itemId, minutes) => setResizing(minutes === null ? null : { id: itemId, minutes })}
                onResizeEnd={(itemId, duration) => change([{ op: 'set', entity: 'item', id: itemId, fields: { duration } }])}
                onChange={(fields) => change([{ op: 'set', entity: 'day', id: d.id, fields }])}
                onDelete={() => deleteDay(d.id)}
              />
            ))}
            <button
              type="button"
              onClick={addDay}
              className="no-print mt-1 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Plus size={14} />
              {t('planner.addDay')}
            </button>
            <section className="flex w-full shrink-0 flex-col rounded-xl bg-surface-2/60 p-2 md:w-[260px]">
              <header className="mb-2 px-1">
                <div className="font-medium">{t('planner.parking')}</div>
                <p className="text-[12px] leading-snug text-ink-3">{t('planner.parkingHint')}</p>
              </header>
              <List id={PARKING} ids={order[PARKING]} empty={t('planner.emptyDay')}>
                {order[PARKING].map((itemId) =>
                  byId[itemId] ? <SortableItem key={itemId} item={byId[itemId]} selected={selectedId === itemId} onSelect={() => setPanel({ kind: 'item', id: itemId })} /> : null,
                )}
              </List>
              <AddBar onAdd={(kind) => addItem(null, kind)} />
            </section>
          </div>
          <DragOverlay dropAnimation={null}>{activeId && byId[activeId] ? <div className="w-[280px] opacity-90 shadow-[var(--shadow)]"><ItemCard item={byId[activeId]} /></div> : null}</DragOverlay>
        </DndContext>
        <p className="no-print px-6 pb-6 text-[12px] text-ink-3">{t('planner.keys')}</p>
      </main>

      {panel && (
        <SidePanel>
          {panel.kind === 'item' && selected && (
            <ItemPanel
              key={selected.id}
              item={selected}
              computedStart={selectedStart}
              data={data}
              change={change}
              onAttachment={addAttachment}
              onClose={() => setPanel(null)}
              onSelect={(itemId) => setPanel({ kind: 'item', id: itemId })}
            />
          )}
          {panel.kind === 'workshop' && <WorkshopPanel data={data} change={change} onClose={() => setPanel(null)} />}
          {panel.kind === 'packing' && <PackingPanel data={data} change={change} onClose={() => setPanel(null)} />}
          {panel.kind === 'files' && <FilesPanel data={data} onAttachment={addAttachment} onRemove={removeAttachment} onClose={() => setPanel(null)} />}
        </SidePanel>
      )}
    </div>
  )
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col items-center justify-center p-6 text-center text-ink-2">{children}</div>
}

function PrintMenu({ id, disabled }: { id: string; disabled: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(!open)}>
        <Printer size={14} />
        <span className="hidden sm:inline">{t('planner.print')}</span>
      </Button>
      {open && (
        <div className="card absolute right-0 z-40 mt-1 w-52 p-1 shadow-[var(--shadow)]" onMouseLeave={() => setOpen(false)}>
          {(['plan', 'agenda', 'packing'] as const).map((v) => (
            <a
              key={v}
              href={`/w/${id}/print/${v}`}
              target="_blank"
              rel="noopener"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-1.5 text-[13px] hover:bg-surface-2"
            >
              {t(v === 'plan' ? 'planner.printPlan' : v === 'agenda' ? 'planner.printAgenda' : 'planner.printPacking')}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
