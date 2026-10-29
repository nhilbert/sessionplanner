import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { Attachment, Day, Item, Workshop, WorkshopState, WorkshopSummary } from '../src/domain/types.ts'
import { newId, type Op } from '../src/domain/ops.ts'
import { BadRequest } from './validate.ts'

type Codec = 'text' | 'num' | 'bool' | 'json'
type Columns = Record<string, [column: string, codec: Codec]>

const WORKSHOP_COLS: Columns = {
  title: ['title', 'text'],
  client: ['client', 'text'],
  location: ['location', 'text'],
  goal: ['goal', 'text'],
  notes: ['notes', 'text'],
  packing: ['packing', 'json'],
  archived: ['archived', 'bool'],
}
const DAY_COLS: Columns = {
  position: ['position', 'num'],
  date: ['date', 'text'],
  startMin: ['start_min', 'num'],
  endMin: ['end_min', 'num'],
}
const ITEM_COLS: Columns = {
  dayId: ['day_id', 'text'],
  position: ['position', 'num'],
  kind: ['kind', 'text'],
  title: ['title', 'text'],
  description: ['description', 'text'],
  duration: ['duration', 'num'],
  fixedStart: ['fixed_start', 'num'],
  goal: ['goal', 'text'],
  method: ['method', 'text'],
  lead: ['lead', 'text'],
  notes: ['notes', 'text'],
  materials: ['materials', 'json'],
  attachmentIds: ['attachment_ids', 'json'],
}

const encode = (value: unknown, codec: Codec): SQLInputValue => {
  if (value === null || value === undefined) return null
  if (codec === 'json') return JSON.stringify(value)
  if (codec === 'bool') return value ? 1 : 0
  return value as SQLInputValue
}

type Row = Record<string, SQLInputValue>

const toWorkshop = (r: Row): Workshop => ({
  id: r.id as string,
  title: r.title as string,
  client: r.client as string,
  location: r.location as string,
  goal: r.goal as string,
  notes: r.notes as string,
  timezone: r.timezone as string,
  packing: JSON.parse(r.packing as string),
  archived: r.archived === 1,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

const toDay = (r: Row): Day => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  position: r.position as number,
  date: r.date as string,
  startMin: r.start_min as number,
  endMin: (r.end_min as number | null) ?? null,
})

const toItem = (r: Row): Item => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  dayId: (r.day_id as string | null) ?? null,
  position: r.position as number,
  kind: r.kind as Item['kind'],
  title: r.title as string,
  description: r.description as string,
  duration: r.duration as number,
  fixedStart: (r.fixed_start as number | null) ?? null,
  goal: r.goal as string,
  method: r.method as string,
  lead: r.lead as string,
  notes: r.notes as string,
  materials: JSON.parse(r.materials as string),
  attachmentIds: JSON.parse(r.attachment_ids as string),
})

const toAttachment = (r: Row): Attachment => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  name: r.name as string,
  mime: r.mime as string,
  size: r.size as number,
  createdAt: r.created_at as string,
})

const now = () => new Date().toISOString()

export class Repo {
  private db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  listWorkshops(): WorkshopSummary[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.title, w.client, w.archived, w.updated_at,
           (SELECT MIN(date) FROM days WHERE workshop_id = w.id) AS first_date,
           (SELECT MAX(date) FROM days WHERE workshop_id = w.id) AS last_date,
           (SELECT COUNT(*) FROM items WHERE workshop_id = w.id) AS item_count
         FROM workshops w ORDER BY COALESCE(first_date, w.created_at) DESC`,
      )
      .all() as Row[]
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      client: r.client as string,
      archived: r.archived === 1,
      firstDate: (r.first_date as string | null) ?? null,
      lastDate: (r.last_date as string | null) ?? null,
      itemCount: r.item_count as number,
      updatedAt: r.updated_at as string,
    }))
  }

  /** A new workshop with one day (09:00–17:00) on `date`, or today. */
  createWorkshop(input: { title?: string; client?: string; date?: string }): WorkshopState {
    const id = newId()
    const t = now()
    this.tx(() => {
      this.db
        .prepare('INSERT INTO workshops (id, title, client, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, input.title ?? '', input.client ?? '', t, t)
      this.db
        .prepare('INSERT INTO days (id, workshop_id, position, date, start_min, end_min) VALUES (?, ?, 1, ?, 540, 1020)')
        .run(newId(), id, input.date ?? t.slice(0, 10))
    })
    return this.loadWorkshop(id)!
  }

  loadWorkshop(id: string): WorkshopState | null {
    const w = this.db.prepare('SELECT * FROM workshops WHERE id = ?').get(id) as Row | undefined
    if (!w) return null
    return {
      workshop: toWorkshop(w),
      days: (this.db.prepare('SELECT * FROM days WHERE workshop_id = ? ORDER BY position').all(id) as Row[]).map(toDay),
      items: (this.db.prepare('SELECT * FROM items WHERE workshop_id = ? ORDER BY position').all(id) as Row[]).map(toItem),
      attachments: (this.db.prepare('SELECT * FROM attachments WHERE workshop_id = ? ORDER BY created_at').all(id) as Row[]).map(toAttachment),
    }
  }

  /** Deletes the workshop with its days, items and attachment records; returns the attachment ids (files to remove). */
  deleteWorkshop(id: string): string[] | null {
    if (!this.db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(id)) return null
    const files = (this.db.prepare('SELECT id FROM attachments WHERE workshop_id = ?').all(id) as Row[]).map((r) => r.id as string)
    this.db.prepare('DELETE FROM workshops WHERE id = ?').run(id)
    return files
  }

  private owner(table: 'days' | 'items', id: string): string | undefined {
    return (this.db.prepare(`SELECT workshop_id FROM ${table} WHERE id = ?`).get(id) as Row | undefined)?.workshop_id as string | undefined
  }

  /** A day id that may hold items of this workshop: null when it is gone (the item is parked instead). */
  private validDay(workshopId: string, dayId: string | null): string | null {
    if (dayId === null) return null
    return this.owner('days', dayId) === workshopId ? dayId : null
  }

  private update(table: string, cols: Columns, id: string, fields: Record<string, unknown>): void {
    const keys = Object.keys(fields)
    if (!keys.length) return
    const sets = keys.map((k) => `${cols[k][0]} = ?`).join(', ')
    this.db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...keys.map((k) => encode(fields[k], cols[k][1])), id)
  }

  private insert(table: string, cols: Columns, record: Record<string, unknown>): void {
    const keys = Object.keys(cols)
    const columns = ['id', 'workshop_id', ...keys.map((k) => cols[k][0])]
    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(record.id as string, record.workshopId as string, ...keys.map((k) => encode(record[k], cols[k][1])))
  }

  /**
   * Applies a batch in one transaction and returns the operations as stored, for the other windows:
   * operations on records that are gone are dropped, items whose day is gone are parked, and the items
   * of a deleted day are parked too. Records of another workshop are refused.
   */
  applyOps(workshopId: string, ops: Op[]): Op[] | null {
    if (!this.db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(workshopId)) return null
    return this.tx(() => {
      const stored: Op[] = []
      for (const o of ops) {
        if (o.op === 'set' && o.entity === 'workshop') {
          if (o.id !== workshopId) throw new BadRequest('workshop mismatch')
          this.update('workshops', WORKSHOP_COLS, o.id, o.fields)
          stored.push(o)
        } else if (o.op === 'set' || o.op === 'delete') {
          const table = o.entity === 'day' ? 'days' : 'items'
          const owner = this.owner(table, o.id)
          if (owner === undefined) continue
          if (owner !== workshopId) throw new BadRequest('record of another workshop')
          if (o.op === 'delete') {
            if (o.entity === 'day') {
              const parked = this.db.prepare('SELECT id FROM items WHERE day_id = ?').all(o.id) as Row[]
              for (const r of parked) {
                this.update('items', ITEM_COLS, r.id as string, { dayId: null })
                stored.push({ op: 'set', entity: 'item', id: r.id as string, fields: { dayId: null } })
              }
            }
            this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(o.id)
            stored.push(o)
          } else if (o.entity === 'day') {
            this.update('days', DAY_COLS, o.id, o.fields)
            stored.push(o)
          } else {
            const fields = { ...o.fields }
            if ('dayId' in fields) fields.dayId = this.validDay(workshopId, fields.dayId ?? null)
            this.update('items', ITEM_COLS, o.id, fields)
            stored.push({ ...o, fields })
          }
        } else {
          const existing = this.owner(o.entity === 'day' ? 'days' : 'items', o.record.id)
          if (existing !== undefined && existing !== workshopId) throw new BadRequest('record of another workshop')
          if (o.entity === 'day') {
            const record = { ...o.record, workshopId }
            this.insert('days', DAY_COLS, record)
            stored.push({ ...o, record })
          } else {
            const record = { ...o.record, workshopId, dayId: this.validDay(workshopId, o.record.dayId) }
            this.insert('items', ITEM_COLS, record)
            stored.push({ ...o, record })
          }
        }
      }
      this.db.prepare('UPDATE workshops SET updated_at = ? WHERE id = ?').run(now(), workshopId)
      return stored
    })
  }

  addAttachment(workshopId: string, file: { id: string; name: string; mime: string; size: number }): Attachment | null {
    if (!this.db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(workshopId)) return null
    const createdAt = now()
    this.db
      .prepare('INSERT INTO attachments (id, workshop_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(file.id, workshopId, file.name, file.mime, file.size, createdAt)
    return { ...file, workshopId, createdAt }
  }

  getAttachment(id: string): Attachment | null {
    const r = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Row | undefined
    return r ? toAttachment(r) : null
  }

  /** Removes the attachment and unlinks it from its items; returns those changes for the other windows. */
  deleteAttachment(id: string): { workshopId: string; ops: Op[] } | null {
    const att = this.getAttachment(id)
    if (!att) return null
    return this.tx(() => {
      const ops: Op[] = []
      const linked = this.db.prepare(`SELECT id, attachment_ids FROM items WHERE workshop_id = ? AND attachment_ids LIKE ?`).all(att.workshopId, `%${id}%`) as Row[]
      for (const r of linked) {
        const attachmentIds = (JSON.parse(r.attachment_ids as string) as string[]).filter((x) => x !== id)
        this.update('items', ITEM_COLS, r.id as string, { attachmentIds })
        ops.push({ op: 'set', entity: 'item', id: r.id as string, fields: { attachmentIds } })
      }
      this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
      return { workshopId: att.workshopId, ops }
    })
  }
}
