import { describe, expect, it } from 'vitest'
import { applyOps, inverseOps } from './ops.ts'
import { MAX_SLIDES } from './slides.ts'
import { dropIndex, moveSlide, slideHomes } from './slideMove.ts'
import type { Item, Slide, WorkshopState } from './types.ts'

const slide = (id: string): Slide => ({ id, html: `<section class="slide statement"><h1>${id}</h1></section>` })

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

const state = (items: Item[]): WorkshopState => ({
  workshop: { id: 'w', title: 'W', client: '', location: '', goal: '', notes: '', timezone: 'Europe/Berlin', theme: '', packing: {}, pictures: {}, materials: [], archived: false, createdAt: '', updatedAt: '' },
  days: [
    { id: 'd2', workshopId: 'w', position: 2, date: '2026-03-03', startMin: 540, endMin: null },
    { id: 'd1', workshopId: 'w', position: 1, date: '2026-03-02', startMin: 540, endMin: null },
  ],
  groups: [],
  items,
  attachments: [],
})

const ids = (s: WorkshopState, itemId: string) => s.items.find((i) => i.id === itemId)!.slides.map((x) => x.id)

describe('moveSlide', () => {
  const start = state([item('a', { slides: [slide('1'), slide('2'), slide('3')] }), item('b', { position: 2, slides: [slide('4')] }), item('m', { position: 3, kind: 'marker' })])

  it('reorders within a step: the index is the one the slide has afterwards', () => {
    const forward = moveSlide(start, 'a', '1', 'a', 2)!
    expect(ids(applyOps(start, forward.ops), 'a')).toEqual(['2', '3', '1'])
    expect(forward).toMatchObject({ fromAt: 0, toAt: 2, slideId: '1' })
    const back = moveSlide(start, 'a', '3', 'a', 0)!
    expect(ids(applyOps(start, back.ops), 'a')).toEqual(['3', '1', '2'])
  })

  it('changes nothing when the slide is there already', () => {
    expect(moveSlide(start, 'a', '2', 'a', 1)!.ops).toEqual([])
  })

  it('moves into another step, to the end unless told where, and keeps the id', () => {
    const end = moveSlide(start, 'a', '2', 'b')!
    const after = applyOps(start, end.ops)
    expect(ids(after, 'a')).toEqual(['1', '3'])
    expect(ids(after, 'b')).toEqual(['4', '2'])
    expect(end).toMatchObject({ fromAt: 1, toAt: 1, slideId: '2' })
    const first = moveSlide(start, 'a', '2', 'b', 0)!
    expect(ids(applyOps(start, first.ops), 'b')).toEqual(['2', '4'])
  })

  it('is taken back by one undo', () => {
    const move = moveSlide(start, 'a', '2', 'b', 0)!
    const after = applyOps(start, move.ops)
    expect(applyOps(after, inverseOps(start, move.ops)).items).toEqual(start.items)
  })

  it('goes back where it came from by the move the other way', () => {
    const move = moveSlide(start, 'a', '2', 'b', 0)!
    const after = applyOps(start, move.ops)
    const back = moveSlide(after, 'b', move.slideId, 'a', move.fromAt)!
    expect(applyOps(after, back.ops).items).toEqual(start.items)
  })

  it('refuses a full step, a marker and what is gone', () => {
    const full = state([item('a', { slides: [slide('1')] }), item('b', { slides: Array.from({ length: MAX_SLIDES }, (_, n) => slide(`s${n}`)) })])
    expect(moveSlide(full, 'a', '1', 'b')).toBeNull()
    expect(moveSlide(start, 'a', '1', 'm')).toBeNull()
    expect(moveSlide(start, 'a', 'x', 'b')).toBeNull()
    expect(moveSlide(start, 'a', '1', 'gone')).toBeNull()
  })

  it('gives the slide a new id when the target holds one of that id', () => {
    const twins = state([item('a', { slides: [slide('1')] }), item('b', { slides: [slide('1')] })])
    const move = moveSlide(twins, 'a', '1', 'b')!
    const b = ids(applyOps(twins, move.ops), 'b')
    expect(b).toHaveLength(2)
    expect(new Set(b).size).toBe(2)
    expect(b[1]).toBe(move.slideId)
  })
})

describe('dropIndex', () => {
  const start = state([item('a', { slides: [slide('1'), slide('2'), slide('3')] }), item('b', { slides: [slide('4'), slide('5')] })])
  const drop = (slideId: string, from: string, to: string, over: string, side: 'before' | 'after') => {
    const at = dropIndex(start, slideId, to, over, side)!
    return ids(applyOps(start, moveSlide(start, from, slideId, to, at)!.ops), to)
  }

  it('puts the slide before or after the one it is dropped on, in its own step', () => {
    expect(drop('1', 'a', 'a', '3', 'after')).toEqual(['2', '3', '1'])
    expect(drop('1', 'a', 'a', '3', 'before')).toEqual(['2', '1', '3'])
    expect(drop('3', 'a', 'a', '1', 'before')).toEqual(['3', '1', '2'])
    expect(drop('3', 'a', 'a', '1', 'after')).toEqual(['1', '3', '2'])
  })

  it('reaches the start and the end of another step', () => {
    expect(drop('2', 'a', 'b', '4', 'before')).toEqual(['2', '4', '5'])
    expect(drop('2', 'a', 'b', '5', 'after')).toEqual(['4', '5', '2'])
  })

  it('is null when the slide dropped on is gone', () => {
    expect(dropIndex(start, '1', 'b', 'x', 'before')).toBeNull()
  })
})

describe('slideHomes', () => {
  it('lists the steps that carry slides by day in order, the parking lot last', () => {
    const s = state([
      item('late', { dayId: 'd2' }),
      item('second', { position: 2, kind: 'break' }),
      item('first', { position: 1 }),
      item('marker', { position: 3, kind: 'marker' }),
      item('parked', { dayId: null }),
    ])
    expect(slideHomes(s).map((h) => [h.n, h.items.map((i) => i.id)])).toEqual([
      [1, ['first', 'second']],
      [2, ['late']],
      [0, ['parked']],
    ])
  })

  it('leaves out days without such a step', () => {
    expect(slideHomes(state([item('note', { kind: 'note' })]))).toEqual([])
  })
})
