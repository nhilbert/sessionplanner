import { describe, expect, it } from 'vitest'
import { applyOps, type Op } from './ops.ts'
import { addLocal, applyRemote, fromSnapshot, markSent, settle, startSync, syncView, type Sync } from './sync.ts'
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
  slides: [],
  categoryId: null,
  color: null,
  ...over,
})

const base: WorkshopState = {
  workshop: { id: 'w', title: 'W', client: '', location: '', goal: '', notes: '', timezone: 'Europe/Berlin', theme: '', packing: {}, materials: [], archived: false, createdAt: '', updatedAt: '' },
  days: [{ id: 'd1', workshopId: 'w', position: 1, date: '2026-11-10', startMin: 540, endMin: 1020 }],
  groups: [],
  items: [item('x'), item('y', { position: 2 })],
  attachments: [],
}

const title = (id: string, value: string): Op[] => [{ op: 'set', entity: 'item', id, fields: { title: value } }]
const titleOf = (s: Sync, id: string) => syncView(s).items.find((i) => i.id === id)?.title

describe('sync', () => {
  it('shows a change at once and keeps it when it comes back', () => {
    let s = addLocal(startSync(base), 'a.1', title('x', 'Mine'))
    expect(titleOf(s, 'x')).toBe('Mine')
    s = markSent(s, 'a.1')
    s = applyRemote(s, 'a.1', title('x', 'Mine'))
    expect(s.pending).toEqual([])
    expect(titleOf(s, 'x')).toBe('Mine')
  })

  it('ends both windows with the change the server stored last, in either order of arrival', () => {
    // Window A and window B change the same title at nearly the same time; the server stores A's, then B's.
    let a = markSent(addLocal(startSync(base), 'a.1', title('x', 'A')), 'a.1')
    let b = markSent(addLocal(startSync(base), 'b.1', title('x', 'B')), 'b.1')
    const stream: [string, Op[]][] = [
      ['a.1', title('x', 'A')],
      ['b.1', title('x', 'B')],
    ]
    for (const [tag, ops] of stream) {
      a = applyRemote(a, tag, ops)
      b = applyRemote(b, tag, ops)
      // While B's own change is on its way, B keeps showing it over A's.
      if (tag === 'a.1') expect(titleOf(b, 'x')).toBe('B')
    }
    const server = stream.reduce((st, [, ops]) => applyOps(st, ops), base)
    expect(titleOf(a, 'x')).toBe('B')
    expect(titleOf(b, 'x')).toBe('B')
    expect(syncView(a)).toEqual(server)
    expect(syncView(b)).toEqual(server)
  })

  it('takes over what the server stored differently', () => {
    const sent: Op[] = [{ op: 'create', entity: 'item', record: item('z', { dayId: 'gone' }) }]
    const stored: Op[] = [{ op: 'create', entity: 'item', record: item('z', { dayId: null }) }]
    let s = markSent(addLocal(startSync(base), 'a.1', sent), 'a.1')
    expect(syncView(s).items.find((i) => i.id === 'z')?.dayId).toBe('gone')
    s = applyRemote(s, 'a.1', stored)
    expect(syncView(s).items.find((i) => i.id === 'z')?.dayId).toBeNull()
  })

  it('keeps later changes over a foreign one and drops a refused batch', () => {
    let s = addLocal(startSync(base), 'a.1', title('x', 'one'))
    s = addLocal(s, 'a.2', title('y', 'two'))
    s = applyRemote(s, 'b.1', title('y', 'foreign'))
    expect(titleOf(s, 'y')).toBe('two')
    s = settle(s, 'a.2')
    expect(titleOf(s, 'y')).toBe('foreign')
    expect(titleOf(s, 'x')).toBe('one')
  })

  it('a fresh load holds what was sent; changes not yet sent stay on top of it', () => {
    let s = addLocal(startSync(base), 'a.1', title('x', 'sent'))
    s = markSent(s, 'a.1')
    s = addLocal(s, 'a.2', title('y', 'queued'))
    const loaded = applyOps(base, title('x', 'sent'))
    s = fromSnapshot(s, loaded)
    expect(s.pending.map((b) => b.tag)).toEqual(['a.2'])
    expect(titleOf(s, 'x')).toBe('sent')
    expect(titleOf(s, 'y')).toBe('queued')
    // The echo of the batch already in the snapshot may still arrive: it changes nothing.
    s = applyRemote(s, 'a.1', title('x', 'sent'))
    expect(titleOf(s, 'x')).toBe('sent')
    expect(s.pending.map((b) => b.tag)).toEqual(['a.2'])
  })
})
