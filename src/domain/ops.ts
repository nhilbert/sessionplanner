import type { Day, Item, Workshop, WorkshopState } from './types.ts'

/**
 * Changes travel as small operations (docs/concept.md, section 7): set some fields of a record, create a
 * record, delete one. The browser applies them at once and sends them; the server stores them and passes
 * them on to every other open window. Per field, the later change wins.
 */

export const WORKSHOP_FIELDS = ['title', 'client', 'location', 'goal', 'notes', 'packing', 'archived'] as const
export const DAY_FIELDS = ['position', 'date', 'startMin', 'endMin'] as const
export const ITEM_FIELDS = [
  'dayId',
  'position',
  'kind',
  'title',
  'description',
  'duration',
  'fixedStart',
  'goal',
  'method',
  'lead',
  'notes',
  'materials',
  'attachmentIds',
] as const

export type WorkshopFields = Pick<Workshop, (typeof WORKSHOP_FIELDS)[number]>
export type DayFields = Pick<Day, (typeof DAY_FIELDS)[number]>
export type ItemFields = Pick<Item, (typeof ITEM_FIELDS)[number]>

export type Op =
  | { op: 'set'; entity: 'workshop'; id: string; fields: Partial<WorkshopFields> }
  | { op: 'set'; entity: 'day'; id: string; fields: Partial<DayFields> }
  | { op: 'set'; entity: 'item'; id: string; fields: Partial<ItemFields> }
  | { op: 'create'; entity: 'day'; record: Day }
  | { op: 'create'; entity: 'item'; record: Item }
  | { op: 'delete'; entity: 'day' | 'item'; id: string }

/** Pushed to open windows (GET /api/workshops/:id/events). */
export type ServerEvent =
  | { type: 'ops'; clientId: string; ops: Op[] }
  | { type: 'attachment'; attachment: import('./types.ts').Attachment }
  | { type: 'attachment-deleted'; id: string }
  | { type: 'workshop-deleted' }

const pick = <T extends object, K extends keyof T>(record: T, keys: K[]): Pick<T, K> => {
  const out = {} as Pick<T, K>
  for (const k of keys) out[k] = record[k]
  return out
}

/** Applies operations to a state; unknown ids are skipped (someone else deleted the record meanwhile). */
export function applyOps(state: WorkshopState, ops: Op[]): WorkshopState {
  let { workshop, days, items } = state
  for (const o of ops) {
    if (o.op === 'set') {
      if (o.entity === 'workshop') {
        if (o.id === workshop.id) workshop = { ...workshop, ...o.fields }
      } else if (o.entity === 'day') days = days.map((d) => (d.id === o.id ? { ...d, ...o.fields } : d))
      else items = items.map((i) => (i.id === o.id ? { ...i, ...o.fields } : i))
    } else if (o.op === 'create') {
      if (o.entity === 'day') days = [...days.filter((d) => d.id !== o.record.id), o.record]
      else items = [...items.filter((i) => i.id !== o.record.id), o.record]
    } else if (o.entity === 'day') days = days.filter((d) => d.id !== o.id)
    else items = items.filter((i) => i.id !== o.id)
  }
  return { ...state, workshop, days, items }
}

/** Operations that undo `ops` when applied after them. */
export function inverseOps(state: WorkshopState, ops: Op[]): Op[] {
  const inverse: Op[] = []
  let current = state
  for (const o of ops) {
    const inv = inverseOf(current, o)
    if (inv) inverse.unshift(inv)
    current = applyOps(current, [o])
  }
  return inverse
}

function inverseOf(state: WorkshopState, o: Op): Op | null {
  if (o.op === 'create') return { op: 'delete', entity: o.entity, id: o.record.id }
  if (o.op === 'delete') {
    if (o.entity === 'day') {
      const day = state.days.find((d) => d.id === o.id)
      return day ? { op: 'create', entity: 'day', record: day } : null
    }
    const item = state.items.find((i) => i.id === o.id)
    return item ? { op: 'create', entity: 'item', record: item } : null
  }
  if (o.entity === 'workshop') return { op: 'set', entity: 'workshop', id: o.id, fields: pick(state.workshop, Object.keys(o.fields) as (keyof WorkshopFields)[]) }
  if (o.entity === 'day') {
    const day = state.days.find((d) => d.id === o.id)
    return day ? { op: 'set', entity: 'day', id: o.id, fields: pick(day, Object.keys(o.fields) as (keyof DayFields)[]) } : null
  }
  const item = state.items.find((i) => i.id === o.id)
  return item ? { op: 'set', entity: 'item', id: o.id, fields: pick(item, Object.keys(o.fields) as (keyof ItemFields)[]) } : null
}

export const newId = (): string => crypto.randomUUID()
