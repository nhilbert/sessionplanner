import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { type Asset, type Attachment, type Day, DEFAULT_SETTINGS, type Group, type Item, type LibraryEntry, type Member, type MemberRole, type Settings, type Workshop, type WorkshopState, type WorkshopSummary } from '../src/domain/types.ts'
import { newId, type Op } from '../src/domain/ops.ts'
import { itemsIn } from '../src/domain/order.ts'
import { scheduleDay } from '../src/domain/time.ts'
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
  theme: ['theme', 'text'],
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
  slides: ['slides', 'json'],
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
  theme: (r.theme as string | null) ?? '',
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
  slides: JSON.parse((r.slides as string | null) ?? '[]'),
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

const toAsset = (r: Row): Asset => ({ hash: r.hash as string, mime: r.mime as string, size: r.size as number, createdAt: r.created_at as string })

const toLibraryEntry = (r: Row): LibraryEntry =>
  ({
    id: r.id as string,
    kind: r.kind as LibraryEntry['kind'],
    title: r.title as string,
    data: withSlides(JSON.parse(r.data as string)),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }) as unknown as LibraryEntry

/** Entries saved before slides existed get an empty list. */
function withSlides(data: { items?: Record<string, unknown>[] } & Record<string, unknown>) {
  if (Array.isArray(data.items)) return { ...data, items: data.items.map((i) => ({ slides: [], ...i })) }
  return { slides: [], ...data }
}

const toMember = (r: Row): Member => ({
  workshopId: r.workshop_id as string,
  email: r.email as string,
  role: r.role as MemberRole,
  showNotes: r.show_notes === 1,
  addedAt: r.added_at as string,
  lastSeenAt: (r.last_seen_at as string | null) ?? null,
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

  /** All workshops, or only those shared with `guest` (an e-mail). */
  listWorkshops(guest?: string): WorkshopSummary[] {
    const only = guest !== undefined ? 'WHERE workshop_id IN (SELECT workshop_id FROM members WHERE email = ?)' : ''
    const args = guest !== undefined ? [guest] : []
    const rows = this.db
      .prepare(
        `SELECT w.id, w.title, w.client, w.location, w.archived, w.updated_at,
           (SELECT MIN(date) FROM days WHERE workshop_id = w.id) AS first_date,
           (SELECT MAX(date) FROM days WHERE workshop_id = w.id) AS last_date,
           (SELECT COUNT(*) FROM items WHERE workshop_id = w.id) AS item_count
         FROM workshops w ${guest !== undefined ? 'WHERE w.id IN (SELECT workshop_id FROM members WHERE email = ?)' : ''}
         ORDER BY COALESCE(first_date, w.created_at) DESC`,
      )
      .all(...args) as Row[]
    // The length needs the computed times: days, groups and placed items of the listed workshops, three queries in all.
    const byWorkshop = <T extends { workshopId: string }>(list: T[]) => {
      const map = new Map<string, T[]>()
      for (const x of list) map.set(x.workshopId, [...(map.get(x.workshopId) ?? []), x])
      return map
    }
    const days = byWorkshop((this.db.prepare(`SELECT * FROM days ${only}`).all(...args) as Row[]).map(toDay))
    const groups = byWorkshop((this.db.prepare(`SELECT * FROM groups ${only}`).all(...args) as Row[]).map(toGroup))
    const items = byWorkshop((this.db.prepare(`SELECT * FROM items ${only ? `${only} AND` : 'WHERE'} day_id IS NOT NULL`).all(...args) as Row[]).map(toItem))
    const minutes = (id: string) => {
      const structure = { groups: groups.get(id) ?? [], items: items.get(id) ?? [] }
      return (days.get(id) ?? []).reduce((sum, d) => {
        const placed = itemsIn(structure, d.id)
        return sum + (placed.length ? Math.max(0, scheduleDay(d.startMin, d.endMin, placed).end - d.startMin) : 0)
      }, 0)
    }
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      client: r.client as string,
      location: r.location as string,
      archived: r.archived === 1,
      firstDate: (r.first_date as string | null) ?? null,
      lastDate: (r.last_date as string | null) ?? null,
      itemCount: r.item_count as number,
      days: days.get(r.id as string)?.length ?? 0,
      minutes: minutes(r.id as string),
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

  /**
   * A copy of a workshop under a new title, its days moved so the first one falls on `firstDate`. Groups,
   * items, material and files come along (file contents are copied by the caller with the returned id map);
   * ticks in the packing list are cleared.
   */
  duplicateWorkshop(id: string, input: { title: string; firstDate?: string }): { state: WorkshopState; files: Record<string, string> } | null {
    const src = this.loadWorkshop(id)
    if (!src) return null
    const newWs = newId()
    const t = now()
    const days = [...src.days].sort((a, b) => a.position - b.position)
    // A stored date that never was one (older data, from before the API checked calendar dates) cannot be shifted: it stays as it is.
    const parsed = (date: string) => Date.parse(date)
    const shift = input.firstDate && days.length && Number.isFinite(parsed(days[0].date)) ? Math.round((parsed(input.firstDate) - parsed(days[0].date)) / 86_400_000) : 0
    const moved = (date: string) => (shift && Number.isFinite(parsed(date)) ? new Date(parsed(date) + shift * 86_400_000).toISOString().slice(0, 10) : date)
    const dayIds = new Map(days.map((d) => [d.id, newId()]))
    const groupIds = new Map(src.groups.map((g) => [g.id, newId()]))
    const files = Object.fromEntries(src.attachments.map((a) => [a.id, newId()]))
    const packing = Object.fromEntries(Object.entries(src.workshop.packing).map(([k, v]) => [k, { ...v, checked: false }]))
    const w = src.workshop
    this.tx(() => {
      this.db
        .prepare('INSERT INTO workshops (id, title, client, location, goal, notes, timezone, theme, packing, materials, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
        .run(newWs, input.title, w.client, w.location, w.goal, w.notes, w.timezone, w.theme, JSON.stringify(packing), JSON.stringify(w.materials.map((m) => ({ ...m, id: newId() }))), t, t)
      for (const d of days) this.insert('days', DAY_COLS, { ...d, id: dayIds.get(d.id)!, workshopId: newWs, date: moved(d.date) })
      for (const g of src.groups) this.insert('groups', GROUP_COLS, { ...g, id: groupIds.get(g.id)!, workshopId: newWs, dayId: g.dayId ? (dayIds.get(g.dayId) ?? null) : null })
      for (const a of src.attachments)
        this.db.prepare('INSERT INTO attachments (id, workshop_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(files[a.id], newWs, a.name, a.mime, a.size, t)
      for (const i of src.items)
        this.insert('items', ITEM_COLS, {
          ...i,
          id: newId(),
          workshopId: newWs,
          dayId: i.dayId ? (dayIds.get(i.dayId) ?? null) : null,
          groupId: i.groupId ? (groupIds.get(i.groupId) ?? null) : null,
          materials: i.materials.map((m) => ({ ...m, id: newId() })),
          slides: i.slides.map((s) => ({ ...s, id: newId() })),
          attachmentIds: i.attachmentIds.filter((x) => files[x]).map((x) => files[x]),
        })
    })
    return { state: this.loadWorkshop(newWs)!, files }
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

  listMembers(workshopId: string): Member[] {
    return (this.db.prepare('SELECT * FROM members WHERE workshop_id = ? ORDER BY added_at').all(workshopId) as Row[]).map(toMember)
  }

  getMember(workshopId: string, email: string): Member | null {
    const r = this.db.prepare('SELECT * FROM members WHERE workshop_id = ? AND email = ?').get(workshopId, email) as Row | undefined
    return r ? toMember(r) : null
  }

  /** Adds a guest or changes their access; edit always includes the notes. */
  setMember(workshopId: string, email: string, role: MemberRole, showNotes: boolean): Member | null {
    if (!this.db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(workshopId)) return null
    this.db
      .prepare(
        `INSERT INTO members (workshop_id, email, role, show_notes, added_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workshop_id, email) DO UPDATE SET role = excluded.role, show_notes = excluded.show_notes`,
      )
      .run(workshopId, email, role, role === 'edit' || showNotes ? 1 : 0, now())
    return this.getMember(workshopId, email)
  }

  removeMember(workshopId: string, email: string): boolean {
    return this.db.prepare('DELETE FROM members WHERE workshop_id = ? AND email = ?').run(workshopId, email).changes > 0
  }

  touchMember(workshopId: string, email: string): void {
    this.db.prepare('UPDATE members SET last_seen_at = ? WHERE workshop_id = ? AND email = ?').run(now(), workshopId, email)
  }

  /** Everyone any workshop is shared with, and in how many workshops. */
  sharedEmails(): { email: string; workshops: number }[] {
    return (this.db.prepare('SELECT email, COUNT(*) AS n FROM members GROUP BY email ORDER BY email').all() as Row[]).map((r) => ({ email: r.email as string, workshops: r.n as number }))
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

  // ---- assets: pictures of slides, once per content hash ----------------------------------------------

  addAsset(asset: { hash: string; mime: string; size: number }): Asset {
    this.db.prepare('INSERT OR IGNORE INTO assets (hash, mime, size, created_at) VALUES (?, ?, ?, ?)').run(asset.hash, asset.mime, asset.size, now())
    return this.getAsset(asset.hash)!
  }

  getAsset(hash: string): Asset | null {
    const r = this.db.prepare('SELECT * FROM assets WHERE hash = ?').get(hash) as Row | undefined
    return r ? toAsset(r) : null
  }

  /** Whether a slide of this workshop shows the asset: what a guest of the workshop may load. */
  assetInWorkshop(workshopId: string, hash: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM items WHERE workshop_id = ? AND slides LIKE ? LIMIT 1').get(workshopId, `%asset:${hash}%`)
  }

  /** Removes the records of assets no slide shows any more (in a workshop or the library); returns their hashes, whose files the caller removes. */
  sweepAssets(): string[] {
    const gone: string[] = []
    for (const r of this.db.prepare('SELECT hash FROM assets').all() as Row[]) {
      const hash = r.hash as string
      const like = `%asset:${hash}%`
      if (this.db.prepare('SELECT 1 FROM items WHERE slides LIKE ? LIMIT 1').get(like) || this.db.prepare('SELECT 1 FROM library WHERE data LIKE ? LIMIT 1').get(like)) continue
      this.db.prepare('DELETE FROM assets WHERE hash = ?').run(hash)
      gone.push(hash)
    }
    return gone
  }
}
