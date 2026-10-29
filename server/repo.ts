import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { type Attachment, type Day, DEFAULT_SETTINGS, type Group, type Item, type LibraryEntry, type Settings, type Workshop, type WorkshopState, type WorkshopSummary } from '../src/domain/types.ts'
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
  materials: ['materials', 'json'],
  archived: ['archived', 'bool'],
}
const DAY_COLS: Columns = {
  position: ['position', 'num'],
  date: ['date', 'text'],
  startMin: ['start_min', 'num'],
  endMin: ['end_min', 'num'],
}
const GROUP_COLS: Columns = {
  dayId: ['day_id', 'text'],
  position: ['position', 'num'],
  title: ['title', 'text'],
}
const ITEM_COLS: Columns = {
  dayId: ['day_id', 'text'],
  position: ['position', 'num'],
  groupId: ['group_id', 'text'],
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
  categoryId: ['category_id', 'text'],
  color: ['color', 'text'],
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
  materials: JSON.parse(r.materials as string),
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

const toGroup = (r: Row): Group => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  dayId: (r.day_id as string | null) ?? null,
  position: r.position as number,
  title: r.title as string,
})

const toItem = (r: Row): Item => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  dayId: (r.day_id as string | null) ?? null,
  position: r.position as number,
  groupId: (r.group_id as string | null) ?? null,
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
  categoryId: (r.category_id as string | null) ?? null,
  color: (r.color as Item['color']) ?? null,
})

const toAttachment = (r: Row): Attachment => ({
  id: r.id as string,
  workshopId: r.workshop_id as string,
  name: r.name as string,
  mime: r.mime as string,
  size: r.size as number,
  createdAt: r.created_at as string,
})

const toLibraryEntry = (r: Row): LibraryEntry =>
  ({
    id: r.id as string,
    kind: r.kind as LibraryEntry['kind'],
    title: r.title as string,
    data: JSON.parse(r.data as string),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }) as LibraryEntry

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

  /** A new workshop with one day (times from the settings) on `date`, or today. */
  createWorkshop(input: { title?: string; client?: string; date?: string }): WorkshopState {
    const id = newId()
    const t = now()
    this.tx(() => {
      this.db
        .prepare('INSERT INTO workshops (id, title, client, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, input.title ?? '', input.client ?? '', t, t)
      this.db
        .prepare('INSERT INTO days (id, workshop_id, position, date, start_min, end_min) VALUES (?, ?, 1, ?, ?, ?)')
        .run(newId(), id, input.date ?? t.slice(0, 10), this.getSettings().dayStart, this.getSettings().dayEnd)
    })
    return this.loadWorkshop(id)!
  }

  loadWorkshop(id: string): WorkshopState | null {
    const w = this.db.prepare('SELECT * FROM workshops WHERE id = ?').get(id) as Row | undefined
    if (!w) return null
    return {
      workshop: toWorkshop(w),
      days: (this.db.prepare('SELECT * FROM days WHERE workshop_id = ? ORDER BY position').all(id) as Row[]).map(toDay),
      groups: (this.db.prepare('SELECT * FROM groups WHERE workshop_id = ? ORDER BY position').all(id) as Row[]).map(toGroup),
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

  private owner(table: 'days' | 'groups' | 'items', id: string): string | undefined {
    return (this.db.prepare(`SELECT workshop_id FROM ${table} WHERE id = ?`).get(id) as Row | undefined)?.workshop_id as string | undefined
  }

  /** A day id that may hold items of this workshop: null when it is gone (the item is parked instead). */
  private validDay(workshopId: string, dayId: string | null): string | null {
    if (dayId === null) return null
    return this.owner('days', dayId) === workshopId ? dayId : null
  }

  /** A group id that may hold items of this workshop: null when it is gone (the item becomes ungrouped). */
  private validGroup(workshopId: string, groupId: string | null): string | null {
    if (groupId === null) return null
    return this.owner('groups', groupId) === workshopId ? groupId : null
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
          const table = o.entity === 'day' ? 'days' : o.entity === 'group' ? 'groups' : 'items'
          const owner = this.owner(table, o.id)
          if (owner === undefined) continue
          if (owner !== workshopId) throw new BadRequest('record of another workshop')
          if (o.op === 'delete') {
            if (o.entity === 'day') {
              for (const r of this.db.prepare('SELECT id FROM groups WHERE day_id = ?').all(o.id) as Row[]) {
                this.update('groups', GROUP_COLS, r.id as string, { dayId: null })
                stored.push({ op: 'set', entity: 'group', id: r.id as string, fields: { dayId: null } })
              }
              for (const r of this.db.prepare('SELECT id FROM items WHERE day_id = ?').all(o.id) as Row[]) {
                this.update('items', ITEM_COLS, r.id as string, { dayId: null })
                stored.push({ op: 'set', entity: 'item', id: r.id as string, fields: { dayId: null } })
              }
            }
            if (o.entity === 'group') {
              // Members left in a deleted group stay where they are, ungrouped.
              for (const r of this.db.prepare('SELECT id FROM items WHERE group_id = ?').all(o.id) as Row[]) {
                this.update('items', ITEM_COLS, r.id as string, { groupId: null })
                stored.push({ op: 'set', entity: 'item', id: r.id as string, fields: { groupId: null } })
              }
            }
            this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(o.id)
            stored.push(o)
          } else if (o.entity === 'day') {
            this.update('days', DAY_COLS, o.id, o.fields)
            stored.push(o)
          } else if (o.entity === 'group') {
            const fields = { ...o.fields }
            if ('dayId' in fields) fields.dayId = this.validDay(workshopId, fields.dayId ?? null)
            this.update('groups', GROUP_COLS, o.id, fields)
            stored.push({ ...o, fields })
          } else {
            const fields = { ...o.fields }
            if ('dayId' in fields) fields.dayId = this.validDay(workshopId, fields.dayId ?? null)
            if ('groupId' in fields) fields.groupId = this.validGroup(workshopId, fields.groupId ?? null)
            this.update('items', ITEM_COLS, o.id, fields)
            stored.push({ ...o, fields })
          }
        } else {
          const existing = this.owner(o.entity === 'day' ? 'days' : o.entity === 'group' ? 'groups' : 'items', o.record.id)
          if (existing !== undefined && existing !== workshopId) throw new BadRequest('record of another workshop')
          if (o.entity === 'day') {
            const record = { ...o.record, workshopId }
            this.insert('days', DAY_COLS, record)
            stored.push({ ...o, record })
          } else if (o.entity === 'group') {
            const record = { ...o.record, workshopId, dayId: this.validDay(workshopId, o.record.dayId) }
            this.insert('groups', GROUP_COLS, record)
            stored.push({ ...o, record })
          } else {
            const record = { ...o.record, workshopId, dayId: this.validDay(workshopId, o.record.dayId), groupId: this.validGroup(workshopId, o.record.groupId) }
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

  getSettings(): Settings {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as Row | undefined
    return r ? { ...DEFAULT_SETTINGS, ...JSON.parse(r.value as string) } : DEFAULT_SETTINGS
  }

  saveSettings(settings: Settings): Settings {
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings))
    return settings
  }

  listLibrary(): LibraryEntry[] {
    return (this.db.prepare('SELECT * FROM library ORDER BY title COLLATE NOCASE').all() as Row[]).map(toLibraryEntry)
  }

  saveLibraryEntry(id: string | null, entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>): LibraryEntry | null {
    const t = now()
    if (id === null) {
      id = newId()
      this.db.prepare('INSERT INTO library (id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, entry.kind, entry.title, JSON.stringify(entry.data), t, t)
    } else if (!this.db.prepare('UPDATE library SET kind = ?, title = ?, data = ?, updated_at = ? WHERE id = ?').run(entry.kind, entry.title, JSON.stringify(entry.data), t, id).changes) return null
    return toLibraryEntry(this.db.prepare('SELECT * FROM library WHERE id = ?').get(id) as Row)
  }

  deleteLibraryEntry(id: string): boolean {
    return this.db.prepare('DELETE FROM library WHERE id = ?').run(id).changes > 0
  }
}
