import { useMemo, useState } from 'react'
import { closestCenter, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, pointerWithin } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { entriesIn, placeAt } from '@/domain/order'
import type { Op } from '@/domain/ops'
import type { WorkshopState } from '@/domain/types'

/**
 * Drag and drop on the board (docs/concept.md, section 3). Lists ("containers") are the days, the parking
 * lot and the inside of every group; days and the parking lot hold groups and ungrouped items, a group holds
 * its members. Library entries can be dropped anywhere and arrive as copies.
 */

export const PARKING = 'parking'
export const inner = (groupId: string) => `in:${groupId}`
export const LIB = 'lib:'
const isInner = (key: string) => key.startsWith('in:')

export type Lists = Record<string, string[]>

export function buildLists(data: WorkshopState): Lists {
  const lists: Lists = {}
  const add = (key: string, dayId: string | null) => {
    const entries = entriesIn(data, dayId)
    lists[key] = entries.map((e) => e.id)
    for (const e of entries) if (e.type === 'group') lists[inner(e.id)] = e.items.map((i) => i.id)
  }
  add(PARKING, null)
  for (const d of data.days) add(d.id, d.id)
  return lists
}

/** The item ids of a day (or the parking lot) in order, groups expanded. */
export function flatIds(lists: Lists, key: string, groupIds: Set<string>): string[] {
  return (lists[key] ?? []).flatMap((id) => (groupIds.has(id) ? (lists[inner(id)] ?? []) : [id]))
}

/** Where a list sits: the day id, null for the parking lot; and the group for the inside of a group. */
export function placeOf(data: WorkshopState, key: string): { dayId: string | null; groupId: string | null } {
  if (key === PARKING) return { dayId: null, groupId: null }
  if (isInner(key)) {
    const groupId = key.slice(3)
    return { dayId: data.groups.find((g) => g.id === groupId)?.dayId ?? null, groupId }
  }
  return { dayId: key, groupId: null }
}

/** Operations that put `id` (item or group) at `index` of list `to`, given the list's current entries (without `id`). */
export function moveOps(data: WorkshopState, to: string, siblings: string[], id: string, index: number): Op[] {
  const position = (x: string) => data.items.find((i) => i.id === x)?.position ?? data.groups.find((g) => g.id === x)?.position ?? 0
  const placed = placeAt(
    siblings.map((x) => ({ id: x, position: position(x) })),
    id,
    index,
  )
  const { dayId, groupId } = placeOf(data, to)
  const ops: Op[] = []
  for (const p of placed) {
    const group = data.groups.find((g) => g.id === p.id)
    if (p.id !== id) ops.push(group ? { op: 'set', entity: 'group', id: p.id, fields: { position: p.position } } : { op: 'set', entity: 'item', id: p.id, fields: { position: p.position } })
    else if (group) {
      ops.push({ op: 'set', entity: 'group', id, fields: { dayId, position: p.position } })
      if (group.dayId !== dayId) for (const m of data.items.filter((i) => i.groupId === id)) ops.push({ op: 'set', entity: 'item', id: m.id, fields: { dayId } })
    } else ops.push({ op: 'set', entity: 'item', id, fields: { dayId, groupId, position: p.position } })
  }
  return ops
}

export function useBoard({ data, change, onLibraryDrop }: { data: WorkshopState; change: (ops: Op[]) => void; onLibraryDrop: (entryId: string, to: string, index: number) => void }) {
  const lists = useMemo(() => buildLists(data), [data])
  const groupIds = useMemo(() => new Set(data.groups.map((g) => g.id)), [data.groups])
  const [preview, setPreview] = useState<Lists | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const order = preview ?? lists

  const containerOf = (key: string, l: Lists) => (key in l ? key : Object.keys(l).find((c) => l[c].includes(key)))
  /** Groups do not nest: a group dragged over the inside of another group goes next to that group. */
  const target = (active: string, over: string, l: Lists) => {
    let to = containerOf(over, l)
    let at = over
    if (to && groupIds.has(active) && isInner(to)) {
      at = to.slice(3)
      to = containerOf(at, l)
    }
    return { to, at }
  }

  // While dragging within a list, the times already follow the place the item would land on.
  const projected = useMemo(() => {
    if (!activeId || !overId || activeId.startsWith(LIB)) return order
    const from = containerOf(activeId, order)
    const { to, at } = target(activeId, overId, order)
    if (!from || from !== to || !order[from].includes(at) || at === activeId) return order
    return { ...order, [from]: arrayMove(order[from], order[from].indexOf(activeId), order[from].indexOf(at)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, activeId, overId])

  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args)
    // The innermost target wins: a group's members, then the inside of a group, then entries (items and whole
    // groups, which cover their members too), then the lists that hold them.
    const innerKeys = Object.keys(order).filter(isInner)
    const members = within.filter((c) => innerKeys.some((k) => order[k].includes(String(c.id))))
    if (members.length) return members
    const innerLists = within.filter((c) => isInner(String(c.id)))
    if (innerLists.length) return innerLists
    const entries = within.filter((c) => !(String(c.id) in order))
    if (entries.length) return entries
    if (within.length) return within
    return closestCenter(args)
  }

  const reset = () => {
    setActiveId(null)
    setOverId(null)
    setPreview(null)
  }

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id)
    if (!id.startsWith(LIB)) setPreview(lists)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    setOverId(o)
    if (a.startsWith(LIB)) return
    setPreview((prev) => {
      if (!prev) return prev
      const from = containerOf(a, prev)
      const { to, at } = target(a, o, prev)
      if (!from || !to || from === to || to === inner(a)) return prev
      const list = [...prev[to]]
      const index = at in prev ? list.length : list.indexOf(at)
      list.splice(index < 0 ? list.length : index, 0, a)
      return { ...prev, [from]: prev[from].filter((x) => x !== a), [to]: list }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const l = preview
    reset()
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    if (a.startsWith(LIB)) {
      const { to, at } = target(a, o, lists)
      if (!to) return
      onLibraryDrop(a.slice(LIB.length), to, at in lists ? lists[to].length : Math.max(0, lists[to].indexOf(at)))
      return
    }
    if (!l) return
    const to = containerOf(a, l)
    if (!to) return
    let list = l[to]
    const { at } = target(a, o, l)
    if (list.includes(at) && at !== a) list = arrayMove(list, list.indexOf(a), list.indexOf(at))
    const index = list.indexOf(a)
    const from = containerOf(a, lists)
    if (from === to && lists[to].indexOf(a) === index) return
    change(
      moveOps(
        data,
        to,
        list.filter((x) => x !== a),
        a,
        index,
      ),
    )
  }

  return { lists, order, projected, groupIds, activeId, collision, onDragStart, onDragOver, onDragEnd, onDragCancel: reset }
}
