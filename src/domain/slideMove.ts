import { newId, type Op } from './ops.ts'
import { itemsIn, sortedDays } from './order.ts'
import { MAX_SLIDES } from './slides.ts'
import type { Day, Item, WorkshopState } from './types.ts'

/**
 * Moving a slide (docs/slides.md, section 7): to another place among the slides of its step, or into another step
 * of the same workshop. A slide keeps its id when it moves, so whatever follows it by id still finds it.
 */

/** The kinds of item that carry slides (the server refuses them on markers and notes). */
export const holdsSlides = (item: Pick<Item, 'kind'>): boolean => item.kind === 'block' || item.kind === 'break'

/** The steps of one day (or of the parking lot: day null) that a slide can move to, in agenda order. */
export interface SlideHomes {
  day: Day | null
  /** The day's number, 1 = first; 0 for the parking lot. */
  n: number
  items: Item[]
}

/** Every step that carries slides, by day in agenda order, the parking lot last; days and a parking lot without one are left out. */
export function slideHomes(state: WorkshopState): SlideHomes[] {
  const days = sortedDays(state.days).map((day, i): SlideHomes => ({ day, n: i + 1, items: itemsIn(state, day.id).filter(holdsSlides) }))
  return [...days, { day: null, n: 0, items: itemsIn(state, null).filter(holdsSlides) }].filter((h) => h.items.length)
}

/** Whether a step has room for one more slide. */
export const hasRoom = (item: Pick<Item, 'slides'>): boolean => item.slides.length < MAX_SLIDES

export interface SlideMove {
  ops: Op[]
  /** The slide's id afterwards: its own, or a new one when the target already held a slide of that id. */
  slideId: string
  /** Where it was in its step, and where it is in the target. */
  fromAt: number
  toAt: number
}

/**
 * The ops that put a slide of `fromItem` at index `at` of `toItem`'s slides (the index it has afterwards; the end
 * when left out). Null when it cannot be done: the slide or a step is gone, the target carries no slides or is
 * full. No ops when the slide is there already.
 */
export function moveSlide(state: WorkshopState, fromItem: string, slideId: string, toItem: string, at?: number): SlideMove | null {
  const from = state.items.find((i) => i.id === fromItem)
  const to = state.items.find((i) => i.id === toItem)
  const fromAt = from ? from.slides.findIndex((s) => s.id === slideId) : -1
  if (!from || !to || fromAt === -1 || !holdsSlides(to)) return null
  const slide = from.slides[fromAt]
  const rest = from.slides.filter((s) => s.id !== slideId)
  if (from.id === to.id) {
    const toAt = Math.max(0, Math.min(at ?? rest.length, rest.length))
    if (toAt === fromAt) return { ops: [], slideId, fromAt, toAt }
    return { ops: [{ op: 'set', entity: 'item', id: from.id, fields: { slides: [...rest.slice(0, toAt), slide, ...rest.slice(toAt)] } }], slideId, fromAt, toAt }
  }
  if (!hasRoom(to)) return null
  const toAt = Math.max(0, Math.min(at ?? to.slides.length, to.slides.length))
  const moved = to.slides.some((s) => s.id === slideId) ? { ...slide, id: newId() } : slide
  return {
    ops: [
      { op: 'set', entity: 'item', id: from.id, fields: { slides: rest } },
      { op: 'set', entity: 'item', id: to.id, fields: { slides: [...to.slides.slice(0, toAt), moved, ...to.slides.slice(toAt)] } },
    ],
    slideId: moved.id,
    fromAt,
    toAt,
  }
}

/**
 * The index a dragged slide takes when it is dropped before or after the slide `overId` of `toItem`: counted
 * without the dragged slide itself, as moveSlide wants it. Null when the slide dropped on is gone.
 */
export function dropIndex(state: WorkshopState, slideId: string, toItem: string, overId: string, side: 'before' | 'after'): number | null {
  const rest = (state.items.find((i) => i.id === toItem)?.slides ?? []).filter((s) => s.id !== slideId)
  const over = rest.findIndex((s) => s.id === overId)
  return over === -1 ? null : over + (side === 'after' ? 1 : 0)
}
