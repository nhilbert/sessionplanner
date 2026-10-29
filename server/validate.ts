import { z } from 'zod'
import type { Op } from '../src/domain/ops.ts'
import { PALETTE, type ItemContent, type Settings } from '../src/domain/types.ts'

export class BadRequest extends Error {}

const id = z.string().min(1).max(64)
const text = (max: number) => z.string().max(max)
const minutes = z.number().int().min(0).max(2 * 1440)
const position = z.number().finite()
// Links are rendered as <a href>: only web and mail addresses, never javascript: or data:.
const link = z.union([z.literal(''), z.string().max(2000).regex(/^(https?:\/\/|mailto:)/i)])

const material = z.strictObject({ id, label: text(200), qty: z.number().int().min(0).max(100_000), link: link.optional() })
const color = z.enum(PALETTE)
const packingState = z.strictObject({ checked: z.boolean().optional(), venue: z.boolean().optional(), qty: z.number().int().min(0).max(100_000).optional() })

const workshopFields = z.strictObject({
  title: text(300),
  client: text(300),
  location: text(300),
  goal: text(5000),
  notes: text(100_000),
  packing: z.record(z.string().max(200), packingState),
  materials: z.array(material).max(200),
  archived: z.boolean(),
})

const dayFields = z.strictObject({
  position,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: minutes,
  endMin: minutes.nullable(),
})

const groupFields = z.strictObject({
  dayId: id.nullable(),
  position,
  title: text(300),
})

const itemContent = z.strictObject({
  kind: z.enum(['block', 'break', 'marker', 'note']),
  title: text(300),
  description: text(5000),
  duration: z.number().int().min(0).max(1440),
  goal: text(2000),
  method: text(2000),
  lead: text(300),
  notes: text(100_000),
  materials: z.array(material).max(200),
  categoryId: id.nullable(),
  color: color.nullable(),
})

const itemFields = z.strictObject({
  dayId: id.nullable(),
  position,
  groupId: id.nullable(),
  kind: z.enum(['block', 'break', 'marker', 'note']),
  title: text(300),
  description: text(5000),
  duration: z.number().int().min(0).max(1440),
  fixedStart: minutes.nullable(),
  goal: text(2000),
  method: text(2000),
  lead: text(300),
  notes: text(100_000),
  materials: z.array(material).max(200),
  attachmentIds: z.array(id).max(200),
  categoryId: id.nullable(),
  color: color.nullable(),
})

const op = z.union([
  z.strictObject({ op: z.literal('set'), entity: z.literal('workshop'), id, fields: workshopFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('day'), id, fields: dayFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('group'), id, fields: groupFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('item'), id, fields: itemFields.partial() }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('day'), record: dayFields.extend({ id, workshopId: id }) }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('group'), record: groupFields.extend({ id, workshopId: id }) }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('item'), record: itemFields.extend({ id, workshopId: id }) }),
  z.strictObject({ op: z.literal('delete'), entity: z.enum(['day', 'group', 'item']), id }),
])

const opsBody = z.strictObject({ clientId: z.string().max(64), ops: z.array(op).min(1).max(1000) })

export function validateOps(body: unknown): { clientId: string; ops: Op[] } {
  const parsed = opsBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid ops: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data as { clientId: string; ops: Op[] }
}

const newWorkshop = z.strictObject({
  title: text(300).optional(),
  client: text(300).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export function validateNewWorkshop(body: unknown): z.infer<typeof newWorkshop> {
  const parsed = newWorkshop.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid workshop')
  return parsed.data
}

const settingsBody = z.strictObject({
  categories: z.array(z.strictObject({ id, name: text(100), color })).max(50),
  dayStart: minutes,
  dayEnd: minutes.nullable(),
})

/** Settings as sent by the app; the logo is managed by its own routes. */
export function validateSettings(body: unknown): Omit<Settings, 'logo'> {
  const parsed = settingsBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid settings: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

const libraryBody = z.union([
  z.strictObject({ kind: z.literal('item'), title: text(300), data: itemContent }),
  z.strictObject({ kind: z.literal('group'), title: text(300), data: z.strictObject({ items: z.array(itemContent).min(1).max(100) }) }),
])

export function validateLibraryEntry(body: unknown): { kind: 'item'; title: string; data: ItemContent } | { kind: 'group'; title: string; data: { items: ItemContent[] } } {
  const parsed = libraryBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid library entry: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data
}
