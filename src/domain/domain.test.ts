import { describe, expect, it } from 'vitest'
import { entriesIn, itemsIn, placeAt } from './order.ts'
import { packingList } from './packing.ts'
import { applyOps, inverseOps, type Op } from './ops.ts'
import type { Item, WorkshopState } from './types.ts'

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  workshopId: 'w',
  dayId: 'd1',
  position: 1,
  groupId: null,
  kind: 'block',
  title: id,
  description: '',
  duration: 30,
  fixedStart: null,
  goal: '',
  method: '',
  lead: '',
  notes: '',
  materials: [],
  attachmentIds: [],
  categoryId: null,
  color: null,
  ...over,
})

describe('placeAt', () => {
  const sib = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
  ]
  it('places between, before and after', () => {
    expect(placeAt(sib, 'x', 1)).toEqual([{ id: 'x', position: 1.5 }])
    expect(placeAt(sib, 'x', 0)).toEqual([{ id: 'x', position: 0 }])
    expect(placeAt(sib, 'x', 9)).toEqual([{ id: 'x', position: 3 }])
    expect(placeAt([], 'x', 0)).toEqual([{ id: 'x', position: 1 }])
  })
  it('renumbers when neighbours are too close', () => {
    const tight = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + 1e-7 },
    ]
    expect(placeAt(tight, 'x', 1)).toEqual([
      { id: 'a', position: 1 },
      { id: 'x', position: 2 },
      { id: 'b', position: 3 },
    ])
  })
})

describe('packingList', () => {
  it('groups by label, takes the largest quantity and keeps the order of first use', () => {
    const items = [
      item('a', { materials: [{ id: '1', label: 'Flipchart', qty: 2 }, { id: '2', label: 'Moderationskarten', qty: 100 }] }),
      item('b', { materials: [{ id: '3', label: ' flipchart ', qty: 2 }] }),
      item('c', { materials: [{ id: '4', label: 'Flipchart', qty: 3, link: 'https://x' }] }),
    ]
    const list = packingList(items, { moderationskarten: { qty: 250, checked: true } })
    expect(list.map((l) => [l.label, l.suggested, l.qty, l.itemIds.length])).toEqual([
      ['Flipchart', 3, 3, 3],
      ['Moderationskarten', 100, 250, 1],
    ])
    expect(list[0].links).toEqual(['https://x'])
    expect(list[1].state.checked).toBe(true)
  })
})

describe('ops', () => {
  const state: WorkshopState = {
    workshop: { id: 'w', title: 'W', client: '', location: '', goal: '', notes: '', timezone: 'Europe/Berlin', packing: {}, materials: [], archived: false, createdAt: '', updatedAt: '' },
    days: [{ id: 'd1', workshopId: 'w', position: 1, date: '2026-11-10', startMin: 540, endMin: 1020 }],
    groups: [],
    items: [item('a'), item('b', { position: 2 })],
    attachments: [],
  }

  it('undoes a batch of set, create and delete', () => {
    const ops: Op[] = [
      { op: 'set', entity: 'item', id: 'a', fields: { duration: 45, title: 'A' } },
      { op: 'create', entity: 'item', record: item('c', { position: 3 }) },
      { op: 'delete', entity: 'item', id: 'b' },
      { op: 'set', entity: 'day', id: 'd1', fields: { startMin: 600 } },
      { op: 'set', entity: 'workshop', id: 'w', fields: { title: 'New' } },
    ]
    const after = applyOps(state, ops)
    expect(after.items.map((i) => i.id).sort()).toEqual(['a', 'c'])
    const back = applyOps(after, inverseOps(state, ops))
    expect(back.workshop.title).toBe('W')
    expect(back.days[0].startMin).toBe(540)
    expect(back.items.find((i) => i.id === 'a')).toMatchObject({ duration: 30, title: 'a' })
    expect(back.items.map((i) => i.id).sort()).toEqual(['a', 'b'])
  })

  it('skips operations on records that are gone', () => {
    const after = applyOps(state, [{ op: 'set', entity: 'item', id: 'zzz', fields: { duration: 5 } }])
    expect(after.items).toEqual(state.items)
    expect(inverseOps(state, [{ op: 'delete', entity: 'item', id: 'zzz' }])).toEqual([])
  })
})

describe('entriesIn / itemsIn', () => {
  it('orders groups and ungrouped items together and expands groups in order', () => {
    const groups = [{ id: 'g', workshopId: 'w', dayId: 'd1', position: 2, title: 'G' }]
    const items = [item('a', { position: 1 }), item('m2', { groupId: 'g', position: 2 }), item('m1', { groupId: 'g', position: 1 }), item('z', { position: 3 }), item('orphan', { groupId: 'gone', position: 2.5 })]
    expect(entriesIn({ groups, items }, 'd1').map((e) => e.id)).toEqual(['a', 'g', 'orphan', 'z'])
    expect(itemsIn({ groups, items }, 'd1').map((i) => i.id)).toEqual(['a', 'm1', 'm2', 'orphan', 'z'])
  })
})
