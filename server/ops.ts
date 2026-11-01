import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Repo } from './repo.ts'
import type { Hub } from './hub.ts'
import { BadRequest, isCalendarDate, validateLibraryEntry, validateOps } from './validate.ts'
import { listThemes, THEME_NAME } from './themes.ts'
import type { Category, Day, Group, Item, ItemContent, ItemKind, LibraryEntry, Material, PackingState, PaletteKey, Slide, WorkshopState, WorkshopSummary } from '../src/domain/types.ts'
import { ZERO_KINDS } from '../src/domain/types.ts'
import { newId, type Op } from '../src/domain/ops.ts'
import { agendaOrder, entriesIn, type Entry, itemsIn, membersOf, placeAt, sortedDays } from '../src/domain/order.ts'
import { formatTime, LONG_STRETCH, parseTime, scheduleDay } from '../src/domain/time.ts'
import { packingKey, packingList } from '../src/domain/packing.ts'
import { DECK_DEFAULTS, deckOf } from '../src/domain/deck.ts'
import { MAX_SLIDES, normalizeSlideHtml, slideAssets, slideLayout, slideText, slideTitle } from '../src/domain/slides.ts'
import { SLIDE_FORMAT, SLIDE_LAYOUTS } from '../src/domain/slideFormat.ts'

/**
 * Session Planner operations for agents (the MCP tools): reads and writes on the server database with
 * the same rules as the app. Every write is a batch of operations (docs/concept.md, section 7) that
 * passes the same validation as the browser's and goes through Repo.applyOps; in the server process
 * the Hub then passes it to every open window of the workshop, so the change shows at once.
 */

export interface OpsOptions {
  /** Open windows learn about changes at once (server process); absent over stdio, where the page is reloaded by hand. */
  hub?: Hub
  /** Where attachment files live (data/files), so a duplicated workshop gets its files too. */
  filesDir?: string
  /** Where the slide themes live (data/themes), so a workshop's theme can be checked and listed. */
  themesDir?: string
  /** Injectable clock for tests. */
  today?: () => string
}

/** A day by id, by date (YYYY-MM-DD) or by number (1 = first day); null = the parking lot. */
export type DayRef = string | number | null

export interface Placement {
  /** 0-based index among the entries of the day (or of the group); default: at the end. */
  at?: number
  /** Put it right after this item or group (id or title) instead. */
  after?: string
}

export interface MaterialInput {
  label: string
  qty?: number
  link?: string
}

export interface ItemInput {
  kind?: ItemKind
  title?: string
  /** Minutes; markers and notes take none. */
  duration?: number
  /** HH:mm, null lets the item flow. */
  fixedStart?: string | null
  description?: string
  goal?: string
  method?: string
  lead?: string
  /** Facilitation notes; null clears. */
  notes?: string | null
  appendNotes?: string
  /** Replaces the material of the item. */
  materials?: MaterialInput[]
  /** Category id or name; null clears. */
  category?: string | null
  color?: PaletteKey | null
  /** Replaces the slides of the item: markup or pool copies (docs/slides.md). */
  slides?: SlideGiven[]
}

/** An item of a library entry as an agent gives it: the content fields with a title; no fixed start, which belongs to a place in an agenda. */
export interface LibraryItemInput extends ItemInput {
  title: string
}

export interface WorkshopInput {
  title?: string
  client?: string
  location?: string
  goal?: string
  notes?: string | null
  appendNotes?: string
  archived?: boolean
  /** Slide theme: null or '' follows the settings, 'default' is the built-in one, else a theme the server has. */
  theme?: string | null
}

export interface PackingLineInput {
  label: string
  /** Overrides the suggested quantity; null goes back to the suggestion. */
  qty?: number | null
  checked?: boolean
  venue?: boolean
}

/** A slide as an agent gives it: markup, a copy of a pool slide, or (slide_set only) one of the existing slides kept. */
export interface SlideGiven {
  html?: string
  pool?: string
  keep?: string | number
}

/** Where slides live: a step of a workshop (workshop + item) or a library entry (entry; for a group entry also item). */
export interface SlideTargetInput {
  workshop?: string
  entry?: string
  item?: string
}

interface SlideTarget {
  /** Names the place in the answer. */
  where: { item?: string; entry?: string }
  slides: Slide[]
  /** Stores the new list (sanitised slides only). */
  save: (slides: Slide[]) => void
}

/** The target part of a slide tool's input, without the slide fields (html there is markup, in slideList a switch). */
const targetOf = (i: SlideTargetInput): SlideTargetInput => ({ workshop: i.workshop, entry: i.entry, item: i.item })

type GroupEntry = Extract<LibraryEntry, { kind: 'group' }>

/** The content fields an input carries (title and placement aside): whether the agent meant to change an item. */
const CONTENT_KEYS = ['kind', 'duration', 'description', 'goal', 'method', 'lead', 'notes', 'appendNotes', 'materials', 'category', 'color', 'slides'] as const satisfies readonly (keyof ItemInput)[]
const contentKeys = (input: ItemInput) => CONTENT_KEYS.filter((k) => input[k] !== undefined)

const CLIENT_ID = 'mcp'
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Drops undefined, null, empty strings and empty arrays so answers stay short. */
function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>
}

// A day that exists on the calendar, as the HTTP API demands it: Date.parse alone would let 2026-02-30 through.
function checkDate(d: unknown, field: string): void {
  if (d !== undefined && d !== null && (typeof d !== 'string' || !isCalendarDate(d))) throw new BadRequest(`${field} must be a date YYYY-MM-DD`)
}

/** "09:30" → 570; undefined stays undefined, null stays null. */
function minutes(value: string | null | undefined, field: string): number | null | undefined {
  if (value === undefined || value === null) return value
  const m = parseTime(value)
  if (m === null) throw new BadRequest(`${field} must be a time HH:mm`)
  return m
}

const addDays = (date: string, n: number): string => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10)

export class Ops {
  private repo: Repo
  private hub?: Hub
  private filesDir?: string
  private themesDir?: string
  private today: () => string

  constructor(repo: Repo, options: OpsOptions = {}) {
    this.repo = repo
    this.hub = options.hub
    this.filesDir = options.filesDir
    this.themesDir = options.themesDir
    this.today = options.today ?? todayLocal
  }

  // ---------- lookups ----------

  /** A workshop by id, or by title (exact, case-insensitive, current before archived; else a unique partial match). */
  private summary(ref: string): WorkshopSummary {
    const all = this.repo.listWorkshops()
    const byId = all.find((w) => w.id === ref)
    if (byId) return byId
    const q = ref.trim().toLowerCase()
    if (!q) throw new BadRequest('workshop must not be empty')
    const exact = all.filter((w) => w.title.toLowerCase() === q)
    if (exact.length === 1) return exact[0]
    const current = exact.filter((w) => !w.archived)
    if (current.length === 1) return current[0]
    const partial = exact.length ? exact : all.filter((w) => w.title.toLowerCase().includes(q) || w.client.toLowerCase().includes(q))
    if (partial.length === 1) return partial[0]
    if (!partial.length) throw new BadRequest(`no workshop "${ref}"`)
    throw new BadRequest(`"${ref}" matches several workshops: ${partial.map((w) => `${w.title}${w.client ? ` (${w.client})` : ''} [${w.id}]`).join(', ')}`)
  }

  private state(ref: string): WorkshopState {
    const state = this.repo.loadWorkshop(this.summary(ref).id)
    if (!state) throw new BadRequest(`no workshop "${ref}"`)
    return state
  }

  private day(s: WorkshopState, ref: DayRef): Day | null {
    if (ref === null || ref === undefined) return null
    const days = sortedDays(s.days)
    if (typeof ref === 'number') {
      const day = days[ref - 1]
      if (!day) throw new BadRequest(`no day ${ref} (the workshop has ${days.length})`)
      return day
    }
    const found = days.find((d) => d.id === ref) ?? days.filter((d) => d.date === ref)
    if (Array.isArray(found)) {
      if (found.length === 1) return found[0]
      if (found.length > 1) throw new BadRequest(`several days on ${ref}: give the id (${found.map((d) => d.id).join(', ')})`)
      throw new BadRequest(`no day "${ref}" (give its id, date or number; null = parking lot)`)
    }
    return found
  }

  private byTitle<T extends { id: string; title: string }>(records: T[], ref: string, what: string): T {
    const byId = records.find((r) => r.id === ref)
    if (byId) return byId
    const q = ref.trim().toLowerCase()
    if (!q) throw new BadRequest(`${what} must not be empty`)
    const exact = records.filter((r) => r.title.toLowerCase() === q)
    if (exact.length === 1) return exact[0]
    const partial = exact.length ? exact : records.filter((r) => r.title.toLowerCase().includes(q))
    if (partial.length === 1) return partial[0]
    if (!partial.length) throw new BadRequest(`no ${what} "${ref}"`)
    throw new BadRequest(`"${ref}" matches several ${what}s: ${partial.map((r) => `${r.title} [${r.id}]`).join(', ')}`)
  }

  private item(s: WorkshopState, ref: string): Item {
    return this.byTitle(s.items, ref, 'item')
  }

  private group(s: WorkshopState, ref: string): Group {
    return this.byTitle(s.groups, ref, 'group')
  }

  /** A category by id or name (the app's default names are the ids: input, exercise, discussion, reflection, energizer, organisation). */
  private category(ref: string | null | undefined): string | null | undefined {
    if (ref === undefined || ref === null) return ref
    const categories = this.repo.getSettings().categories
    const q = ref.trim().toLowerCase()
    const hit = categories.find((c) => c.id === ref) ?? categories.find((c) => c.name.trim().toLowerCase() === q) ?? categories.find((c) => c.id.toLowerCase() === q)
    if (!hit) throw new BadRequest(`no category "${ref}" (${categories.map((c) => c.name.trim() || c.id).join(', ')})`)
    return hit.id
  }

  // ---------- writing ----------

  /** Validates the batch like the browser's, stores it and tells the open windows. */
  private apply(workshopId: string, ops: Op[]): void {
    if (!ops.length) return
    const stored = this.repo.applyOps(workshopId, validateOps({ clientId: CLIENT_ID, ops }).ops)
    if (!stored) throw new BadRequest('no such workshop')
    if (stored.length) this.hub?.publish(workshopId, { type: 'ops', clientId: CLIENT_ID, ops: stored })
  }

  /**
   * Where a record goes: its position among the entries of a day/parking lot (or the members of a group),
   * plus the neighbours' new positions when the list is renumbered. `moving` is left out of the siblings.
   */
  private place(s: WorkshopState, dayId: string | null, groupId: string | null, moving: string, p: Placement): { position: number; ops: Op[] } {
    const siblings: { id: string; position: number; type: 'item' | 'group' }[] = groupId
      ? membersOf(s.items, groupId).map((i) => ({ id: i.id, position: i.position, type: 'item' as const }))
      : entriesIn(s, dayId).map((e) => ({ id: e.id, position: e.position, type: e.type }))
    const list = siblings.filter((x) => x.id !== moving)
    let index = list.length
    if (p.after !== undefined) {
      const target = this.byTitle(
        list.map((x) => ({ id: x.id, title: x.type === 'item' ? s.items.find((i) => i.id === x.id)!.title : s.groups.find((g) => g.id === x.id)!.title })),
        p.after,
        'entry',
      )
      index = list.findIndex((x) => x.id === target.id) + 1
    } else if (p.at !== undefined) index = p.at
    const placed = placeAt(list, moving, index)
    const ops: Op[] = []
    let position = 0
    for (const x of placed) {
      if (x.id === moving) position = x.position
      else ops.push({ op: 'set', entity: list.find((y) => y.id === x.id)!.type, id: x.id, fields: { position: x.position } })
    }
    return { position, ops }
  }

  private materials(input: MaterialInput[] | undefined): Material[] | undefined {
    return input?.map((m) => compact({ id: newId(), label: m.label.trim(), qty: Math.max(0, Math.round(m.qty ?? 1)), link: m.link?.trim() }) as Material)
  }

  /** The item fields from an agent's input (for creating and updating); `current` supplies kind and notes for appends. */
  private itemFields(input: ItemInput, current?: ItemContent): Partial<Item> {
    const f: Partial<Item> = {}
    const kind = input.kind ?? current?.kind ?? 'block'
    if (input.kind !== undefined) f.kind = input.kind
    if (input.title !== undefined) f.title = input.title
    if (ZERO_KINDS.includes(kind)) {
      if (input.kind !== undefined || input.duration !== undefined) f.duration = 0
    } else if (input.duration !== undefined) f.duration = Math.round(input.duration)
    else if (input.kind !== undefined && !current?.duration) f.duration = kind === 'break' ? 15 : 30
    if (input.fixedStart !== undefined) f.fixedStart = minutes(input.fixedStart, 'fixedStart') ?? null
    for (const k of ['description', 'goal', 'method', 'lead'] as const) if (input[k] !== undefined) f[k] = input[k]
    if (input.notes !== undefined) f.notes = input.notes ?? ''
    if (input.appendNotes) f.notes = [f.notes ?? current?.notes ?? '', input.appendNotes].filter(Boolean).join('\n\n')
    if (input.materials !== undefined) f.materials = this.materials(input.materials)
    if (input.category !== undefined) f.categoryId = this.category(input.category) ?? null
    if (input.color !== undefined) f.color = input.color
    if (input.slides !== undefined) {
      if (ZERO_KINDS.includes(kind)) throw new BadRequest('markers and notes have no slides')
      if (input.slides.length > MAX_SLIDES) throw new BadRequest(`at most ${MAX_SLIDES} slides`)
      f.slides = input.slides.map((g) => this.slideFrom(g))
    }
    return f
  }

  /** The content fields for a library entry: as itemFields, without the fixed start (which belongs to a place in an agenda). */
  private contentFields(input: ItemInput, current?: ItemContent): Partial<ItemContent> {
    return this.itemFields({ ...input, fixedStart: undefined }, current)
  }

  /** Fresh content with the defaults for the kind; the agent's fields are laid over it. */
  private blankContent(input: ItemInput): ItemContent {
    const kind = input.kind ?? 'block'
    return { kind, title: input.title ?? '', description: '', duration: ZERO_KINDS.includes(kind) ? 0 : Math.round(input.duration ?? (kind === 'break' ? 15 : 30)), goal: '', method: '', lead: '', notes: '', materials: [], slides: [], categoryId: null, color: null }
  }

  private newContent(input: ItemInput): ItemContent {
    return { ...this.blankContent(input), ...this.contentFields(input) }
  }

  private newItem(workshopId: string, dayId: string | null, groupId: string | null, position: number, input: ItemInput): Item {
    return { id: newId(), workshopId, dayId, position, groupId, fixedStart: null, attachmentIds: [], ...this.blankContent(input), ...this.itemFields(input) }
  }

  // ---------- views ----------

  private itemView(s: WorkshopState, i: Item, slot?: { start: number; end: number; gap: number; overlap: number; late: boolean }, categories: Category[] = []) {
    const category = categories.find((c) => c.id === i.categoryId)
    return compact({
      id: i.id,
      kind: i.kind,
      title: i.title,
      start: slot ? formatTime(slot.start) : undefined,
      end: slot && !ZERO_KINDS.includes(i.kind) ? formatTime(slot.end) : undefined,
      duration: ZERO_KINDS.includes(i.kind) ? undefined : i.duration,
      fixedStart: i.fixedStart === null ? undefined : formatTime(i.fixedStart),
      gap: slot?.gap || undefined,
      overlap: slot?.overlap || undefined,
      late: slot?.late || undefined,
      description: i.description,
      goal: i.goal,
      method: i.method,
      lead: i.lead,
      notes: i.notes,
      materials: i.materials.map((m) => compact({ label: m.label, qty: m.qty, link: m.link })),
      category: category ? category.name.trim() || category.id : undefined,
      color: i.color,
      attachments: i.attachmentIds.map((id) => s.attachments.find((a) => a.id === id)?.name).filter(Boolean),
      slides: i.slides.length || undefined,
    })
  }

  private entriesView(s: WorkshopState, dayId: string | null, slots: Record<string, { start: number; end: number; gap: number; overlap: number; late: boolean }>, categories: Category[]) {
    return entriesIn(s, dayId).map((e: Entry) =>
      e.type === 'item' ? this.itemView(s, e.item, slots[e.item.id], categories) : { group: e.group.id, title: e.group.title, items: e.items.map((i) => this.itemView(s, i, slots[i.id], categories)) },
    )
  }

  private dayView(s: WorkshopState, d: Day, n: number, categories: Category[]) {
    const items = itemsIn(s, d.id)
    const sched = scheduleDay(d.startMin, d.endMin, items)
    const warnings: string[] = []
    if (sched.overTarget !== null && sched.overTarget > 0) warnings.push(`ends ${sched.overTarget} min after the target end`)
    if (sched.longestStretch > LONG_STRETCH) warnings.push(`${sched.longestStretch} min without a break`)
    for (const i of items) {
      const slot = sched.slots[i.id]
      if (slot.overlap) warnings.push(`"${i.title}" (fixed ${formatTime(slot.start)}): the items before run ${slot.overlap} min into it`)
      if (slot.late) warnings.push(`"${i.title}" ends after the next fixed start or the target end`)
    }
    return compact({
      id: d.id,
      day: n,
      date: d.date,
      start: formatTime(d.startMin),
      end: d.endMin === null ? undefined : formatTime(d.endMin),
      computedEnd: formatTime(sched.end),
      overTarget: sched.overTarget === null ? undefined : sched.overTarget,
      workMinutes: sched.workMinutes,
      breakMinutes: sched.breakMinutes,
      longestStretch: sched.longestStretch,
      segments: sched.segments.length > 1 ? sched.segments.map((seg) => compact({ from: formatTime(seg.start), to: seg.end === null ? undefined : formatTime(seg.end), available: seg.available, planned: seg.planned })) : undefined,
      warnings,
      entries: this.entriesView(s, d.id, sched.slots, categories),
    })
  }

  private workshopView(s: WorkshopState) {
    const categories = this.repo.getSettings().categories
    const w = s.workshop
    return compact({
      id: w.id,
      title: w.title,
      client: w.client,
      location: w.location,
      goal: w.goal,
      notes: w.notes,
      theme: w.theme || undefined,
      archived: w.archived || undefined,
      days: sortedDays(s.days).map((d, n) => this.dayView(s, d, n + 1, categories)),
      parkingLot: this.entriesView(s, null, {}, categories),
      packing: this.packingView(s),
      attachments: s.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size })),
    })
  }

  private packingView(s: WorkshopState) {
    // As in the app: placed items only, in agenda order; parked items pack nothing.
    return packingList(agendaOrder(s.days, s), s.workshop.packing, s.workshop.materials).map((l) =>
      compact({
        label: l.label,
        qty: l.qty,
        suggested: l.suggested !== l.qty ? l.suggested : undefined,
        checked: l.state.checked || undefined,
        venue: l.state.venue || undefined,
        items: l.itemIds.map((id) => s.items.find((i) => i.id === id)?.title).filter(Boolean),
        links: l.links,
      }),
    )
  }

  /** An entry as the agent sees it: in the list compact (slides as a count); in full with notes, colour and the slides (number, id, layout, title). */
  private libraryView(e: LibraryEntry, full = false) {
    const content = (c: ItemContent) =>
      compact({
        kind: c.kind,
        title: c.title,
        duration: ZERO_KINDS.includes(c.kind) ? undefined : c.duration,
        description: c.description,
        goal: c.goal,
        method: c.method,
        lead: c.lead,
        notes: full ? c.notes : undefined,
        materials: c.materials.map((m) => compact({ label: m.label, qty: m.qty, link: m.link })),
        category: c.categoryId,
        color: full ? c.color : undefined,
        slides: full ? (c.slides ?? []).map((x, i) => ({ n: i + 1, id: x.id, layout: slideLayout(x.html), title: slideTitle(x.html) })) : c.slides?.length || undefined,
      })
    return compact({ id: e.id, kind: e.kind, title: e.title, item: e.kind === 'item' ? content(e.data) : undefined, items: e.kind === 'group' ? e.data.items.map(content) : undefined })
  }

  // ---------- workshops ----------

  workshopList(filter: { includeArchived?: boolean; query?: string } = {}) {
    const q = filter.query?.trim().toLowerCase()
    return this.repo
      .listWorkshops()
      .filter((w) => (filter.includeArchived || !w.archived) && (!q || w.title.toLowerCase().includes(q) || w.client.toLowerCase().includes(q)))
      .map((w) => compact({ id: w.id, title: w.title, client: w.client, firstDate: w.firstDate, lastDate: w.lastDate !== w.firstDate ? w.lastDate : undefined, items: w.itemCount, archived: w.archived || undefined }))
  }

  workshopGet(ref: string) {
    return this.workshopView(this.state(ref))
  }

  workshopCreate(input: WorkshopInput & { date?: string; days?: number; start?: string; end?: string | null }) {
    checkDate(input.date, 'date')
    const start = minutes(input.start, 'start')
    const end = minutes(input.end, 'end')
    const first = input.date ?? this.today()
    const theme = this.theme(input.theme)
    const state = this.repo.createWorkshop({ title: input.title, client: input.client, date: first })
    const id = state.workshop.id
    const ops: Op[] = []
    const fields = compact({ location: input.location, goal: input.goal, notes: input.notes ?? undefined, archived: input.archived }) as Record<string, unknown>
    if (theme) fields.theme = theme
    if (Object.keys(fields).length) ops.push({ op: 'set', entity: 'workshop', id, fields })
    const dayFields: Record<string, unknown> = {}
    if (start !== undefined && start !== null) dayFields.startMin = start
    if (end !== undefined) dayFields.endMin = end
    if (Object.keys(dayFields).length) ops.push({ op: 'set', entity: 'day', id: state.days[0].id, fields: dayFields })
    const count = Math.min(Math.max(1, Math.round(input.days ?? 1)), 14)
    for (let n = 1; n < count; n++) {
      ops.push({ op: 'create', entity: 'day', record: { id: newId(), workshopId: id, position: n + 1, date: addDays(first, n), startMin: start ?? state.days[0].startMin, endMin: end === undefined ? state.days[0].endMin : end } })
    }
    this.apply(id, ops)
    return this.workshopView(this.repo.loadWorkshop(id)!)
  }

  workshopUpdate(ref: string, input: WorkshopInput) {
    const s = this.state(ref)
    const fields = compact({ title: input.title, client: input.client, location: input.location, goal: input.goal, archived: input.archived }) as Record<string, unknown>
    if (input.notes !== undefined) fields.notes = input.notes ?? ''
    if (input.appendNotes) fields.notes = [(fields.notes as string | undefined) ?? s.workshop.notes, input.appendNotes].filter(Boolean).join('\n\n')
    if (input.theme !== undefined) fields.theme = this.theme(input.theme)
    this.apply(s.workshop.id, Object.keys(fields).length ? [{ op: 'set', entity: 'workshop', id: s.workshop.id, fields }] : [])
    const w = this.repo.loadWorkshop(s.workshop.id)!.workshop
    return compact({ id: w.id, title: w.title, client: w.client, location: w.location, goal: w.goal, notes: w.notes, theme: w.theme || undefined, archived: w.archived || undefined })
  }

  async workshopDuplicate(ref: string, input: { title: string; firstDate?: string }) {
    checkDate(input.firstDate, 'firstDate')
    const s = this.state(ref)
    const result = this.repo.duplicateWorkshop(s.workshop.id, input)!
    if (this.filesDir && Object.keys(result.files).length) {
      await mkdir(this.filesDir, { recursive: true })
      await Promise.all(Object.entries(result.files).map(([from, to]) => copyFile(path.join(this.filesDir!, from), path.join(this.filesDir!, to)).catch(() => undefined)))
    }
    return this.workshopView(result.state)
  }

  // ---------- days ----------

  dayAdd(ref: string, input: { date: string; start?: string; end?: string | null; at?: number }) {
    checkDate(input.date, 'date')
    const s = this.state(ref)
    const settings = this.repo.getSettings()
    const days = sortedDays(s.days)
    const id = newId()
    const placed = placeAt(days, id, input.at ?? days.length)
    const ops: Op[] = placed.filter((p) => p.id !== id).map((p) => ({ op: 'set', entity: 'day', id: p.id, fields: { position: p.position } }))
    const start = minutes(input.start, 'start') ?? days[0]?.startMin ?? settings.dayStart
    const end = input.end === undefined ? (days[0]?.endMin ?? settings.dayEnd) : (minutes(input.end, 'end') ?? null)
    ops.push({ op: 'create', entity: 'day', record: { id, workshopId: s.workshop.id, position: placed.find((p) => p.id === id)!.position, date: input.date, startMin: start, endMin: end } })
    this.apply(s.workshop.id, ops)
    return this.workshopView(this.repo.loadWorkshop(s.workshop.id)!)
  }

  dayUpdate(ref: string, dayRef: DayRef, input: { date?: string; start?: string; end?: string | null }) {
    checkDate(input.date, 'date')
    const s = this.state(ref)
    const day = this.day(s, dayRef)
    if (!day) throw new BadRequest('give the day to change')
    const fields = compact({ date: input.date, startMin: minutes(input.start, 'start') ?? undefined }) as Record<string, unknown>
    if (input.end !== undefined) fields.endMin = minutes(input.end, 'end')
    this.apply(s.workshop.id, Object.keys(fields).length ? [{ op: 'set', entity: 'day', id: day.id, fields }] : [])
    const after = this.repo.loadWorkshop(s.workshop.id)!
    return this.dayView(after, after.days.find((d) => d.id === day.id)!, sortedDays(after.days).findIndex((d) => d.id === day.id) + 1, this.repo.getSettings().categories)
  }

  dayRemove(ref: string, dayRef: DayRef) {
    const s = this.state(ref)
    const day = this.day(s, dayRef)
    if (!day) throw new BadRequest('give the day to remove')
    const parked = itemsIn(s, day.id).length
    this.apply(s.workshop.id, [{ op: 'delete', entity: 'day', id: day.id }])
    return { removed: day.date, parkedItems: parked, days: sortedDays(this.repo.loadWorkshop(s.workshop.id)!.days).map((d) => d.date) }
  }

  // ---------- items ----------

  itemCreate(ref: string, dayRef: DayRef, input: ItemInput & Placement & { group?: string | null }) {
    return this.itemCreateMany(ref, dayRef, [input], { group: input.group, at: input.at, after: input.after })[0]
  }

  /** Several items in order, placed one after the other at the given place (default: the end of the day). */
  itemCreateMany(ref: string, dayRef: DayRef, inputs: ItemInput[], where: Placement & { group?: string | null } = {}) {
    const s = this.state(ref)
    const day = this.day(s, dayRef)
    const group = where.group ? this.group(s, where.group) : null
    if (group && day?.id !== group.dayId && !(day === null && group.dayId === null)) throw new BadRequest(`group "${group.title}" is not on that day`)
    const dayId = group ? group.dayId : (day?.id ?? null)
    const ops: Op[] = []
    let working = s
    const created: Item[] = []
    let placement: Placement = where
    for (const input of inputs) {
      const id = newId()
      const { position, ops: moved } = this.place(working, dayId, group?.id ?? null, id, placement)
      const record = { ...this.newItem(s.workshop.id, dayId, group?.id ?? null, position, input), id }
      ops.push(...moved, { op: 'create', entity: 'item', record })
      created.push(record)
      const positions = new Map(moved.flatMap((o) => (o.op === 'set' && (o.entity === 'item' || o.entity === 'group') && o.fields.position !== undefined ? [[o.id, o.fields.position] as const] : [])))
      working = {
        ...working,
        items: [...working.items.map((i) => (positions.has(i.id) ? { ...i, position: positions.get(i.id)! } : i)), record],
        groups: working.groups.map((g) => (positions.has(g.id) ? { ...g, position: positions.get(g.id)! } : g)),
      }
      placement = { after: id }
    }
    this.apply(s.workshop.id, ops)
    const after = this.repo.loadWorkshop(s.workshop.id)!
    return this.itemsResult(after, created.map((i) => i.id), dayId)
  }

  /** The created or changed items with their computed times, plus the day's warnings. */
  private itemsResult(s: WorkshopState, ids: string[], dayId: string | null) {
    const categories = this.repo.getSettings().categories
    const day = dayId ? s.days.find((d) => d.id === dayId) : undefined
    const sched = day ? scheduleDay(day.startMin, day.endMin, itemsIn(s, day.id)) : undefined
    const items = ids.map((id) => s.items.find((i) => i.id === id)).filter((i): i is Item => !!i)
    const view = items.map((i) => ({ ...this.itemView(s, i, sched?.slots[i.id], categories), day: day?.date ?? 'parking lot', group: i.groupId ? s.groups.find((g) => g.id === i.groupId)?.title : undefined }))
    const dayInfo = day ? this.dayView(s, day, sortedDays(s.days).findIndex((d) => d.id === day.id) + 1, categories) : undefined
    return view.map((v) => compact({ ...v, dayEnd: dayInfo?.computedEnd, dayWarnings: dayInfo?.warnings }))
  }

  itemUpdate(ref: string, itemRef: string, input: ItemInput) {
    const s = this.state(ref)
    const item = this.item(s, itemRef)
    const fields = this.itemFields(input, item)
    this.apply(s.workshop.id, Object.keys(fields).length ? [{ op: 'set', entity: 'item', id: item.id, fields }] : [])
    return this.itemsResult(this.repo.loadWorkshop(s.workshop.id)!, [item.id], item.dayId)[0]
  }

  itemMove(ref: string, itemRef: string, where: { day?: DayRef; group?: string | null } & Placement) {
    const s = this.state(ref)
    const item = this.item(s, itemRef)
    let group = where.group === undefined ? (item.groupId ? (s.groups.find((g) => g.id === item.groupId) ?? null) : null) : where.group === null ? null : this.group(s, where.group)
    const currentDay = group ? group.dayId : item.dayId
    const day = where.day === undefined ? (s.days.find((d) => d.id === currentDay) ?? null) : this.day(s, where.day)
    // Moved to another day without naming a group, the item leaves its group.
    if (group && where.group === undefined && (day?.id ?? null) !== group.dayId) group = null
    if (group && (day?.id ?? null) !== group.dayId) throw new BadRequest(`group "${group.title}" is not on that day`)
    const dayId = day?.id ?? null
    const { position, ops } = this.place(s, dayId, group?.id ?? null, item.id, where)
    this.apply(s.workshop.id, [...ops, { op: 'set', entity: 'item', id: item.id, fields: { dayId, groupId: group?.id ?? null, position } }])
    return this.itemsResult(this.repo.loadWorkshop(s.workshop.id)!, [item.id], dayId)[0]
  }

  itemDelete(ref: string, itemRef: string) {
    const s = this.state(ref)
    const item = this.item(s, itemRef)
    this.apply(s.workshop.id, [{ op: 'delete', entity: 'item', id: item.id }])
    return { deleted: item.title || item.id }
  }

  // ---------- groups ----------

  /** A heading over items; the given items (in that order) move into it. */
  groupCreate(ref: string, dayRef: DayRef, input: { title: string; items?: string[] } & Placement) {
    const s = this.state(ref)
    const day = this.day(s, dayRef)
    const dayId = day?.id ?? null
    const id = newId()
    const members = (input.items ?? []).map((r) => this.item(s, r))
    const isMember = (x: { id: string }) => members.some((m) => m.id === x.id)
    const placement: Placement = { at: input.at, after: input.after }
    // Without a place, the group stands where its first member was.
    if (placement.at === undefined && placement.after === undefined && members[0]?.dayId === dayId && !members[0].groupId) {
      const entries = entriesIn(s, dayId)
      placement.at = entries.slice(0, entries.findIndex((e) => e.id === members[0].id)).filter((e) => !isMember(e)).length
    }
    const without: WorkshopState = { ...s, items: s.items.filter((i) => !isMember(i)) }
    const { position, ops } = this.place(without, dayId, null, id, placement)
    ops.push({ op: 'create', entity: 'group', record: { id, workshopId: s.workshop.id, dayId, position, title: input.title } })
    members.forEach((m, n) => ops.push({ op: 'set', entity: 'item', id: m.id, fields: { dayId, groupId: id, position: n + 1 } }))
    this.apply(s.workshop.id, ops)
    const after = this.repo.loadWorkshop(s.workshop.id)!
    return this.groupView(after, after.groups.find((g) => g.id === id)!)
  }

  private groupView(s: WorkshopState, g: Group) {
    const categories = this.repo.getSettings().categories
    const day = g.dayId ? s.days.find((d) => d.id === g.dayId) : undefined
    const sched = day ? scheduleDay(day.startMin, day.endMin, itemsIn(s, day.id)) : undefined
    return compact({ id: g.id, title: g.title, day: day?.date ?? 'parking lot', items: membersOf(s.items, g.id).map((i) => this.itemView(s, i, sched?.slots[i.id], categories)) })
  }

  groupUpdate(ref: string, groupRef: string, input: { title?: string; day?: DayRef } & Placement) {
    const s = this.state(ref)
    const group = this.group(s, groupRef)
    const ops: Op[] = []
    const fields: Partial<Group> = {}
    if (input.title !== undefined) fields.title = input.title
    if (input.day !== undefined || input.at !== undefined || input.after !== undefined) {
      const dayId = input.day === undefined ? group.dayId : (this.day(s, input.day)?.id ?? null)
      const { position, ops: moved } = this.place(s, dayId, null, group.id, input)
      ops.push(...moved)
      fields.dayId = dayId
      fields.position = position
      for (const m of membersOf(s.items, group.id)) if (m.dayId !== dayId) ops.push({ op: 'set', entity: 'item', id: m.id, fields: { dayId } })
    }
    if (Object.keys(fields).length) ops.push({ op: 'set', entity: 'group', id: group.id, fields })
    this.apply(s.workshop.id, ops)
    const after = this.repo.loadWorkshop(s.workshop.id)!
    return this.groupView(after, after.groups.find((g) => g.id === group.id)!)
  }

  /** Removes the heading; its items stay where they are, ungrouped. */
  groupDelete(ref: string, groupRef: string) {
    const s = this.state(ref)
    const group = this.group(s, groupRef)
    const members = membersOf(s.items, group.id)
    const ops: Op[] = []
    // The members take the group's place in the day's order, in their order; the whole day is renumbered.
    const entries = entriesIn(s, group.dayId)
    const index = entries.findIndex((e) => e.id === group.id)
    const order = [...entries.slice(0, index), ...members.map((m): Entry => ({ type: 'item', id: m.id, position: m.position, item: m })), ...entries.slice(index + 1)]
    order.forEach((e, n) => {
      if (e.type === 'group') ops.push({ op: 'set', entity: 'group', id: e.id, fields: { position: n + 1 } })
      else ops.push({ op: 'set', entity: 'item', id: e.id, fields: members.some((m) => m.id === e.id) ? { groupId: null, position: n + 1 } : { position: n + 1 } })
    })
    ops.push({ op: 'delete', entity: 'group', id: group.id })
    this.apply(s.workshop.id, ops)
    return { deleted: group.title || group.id, ungroupedItems: members.map((m) => m.title) }
  }

  // ---------- packing list ----------

  packingList(ref: string) {
    const s = this.state(ref)
    return { workshop: s.workshop.title, lines: this.packingView(s) }
  }

  /** Ticks, venue marks and quantity overrides per line; `add` puts material on the workshop as a whole, `remove` takes such material off again. */
  packingUpdate(ref: string, input: { lines?: PackingLineInput[]; add?: MaterialInput[]; remove?: string[] }) {
    const s = this.state(ref)
    const packing: Record<string, PackingState> = { ...s.workshop.packing }
    // The lines are the ones packing_list shows: placed steps and the workshop's own material (parked steps pack nothing).
    const placed = agendaOrder(s.days, s)
    const known = new Set(packingList(placed, s.workshop.packing, s.workshop.materials).map((l) => l.key))
    let materials = s.workshop.materials
    if (input.add?.length) materials = [...materials, ...this.materials(input.add)!]
    for (const label of input.remove ?? []) {
      const key = packingKey(label)
      if (!known.has(key)) throw new BadRequest(`no line "${label}" in the packing list`)
      if (!materials.some((m) => packingKey(m.label) === key)) throw new BadRequest(`"${label}" is material of a step, not of the workshop as a whole: change it on the item`)
      materials = materials.filter((m) => packingKey(m.label) !== key)
      // The line goes only when no placed step needs the material any more; otherwise it stays with its tick.
      if (!placed.some((i) => i.materials.some((m) => packingKey(m.label) === key))) delete packing[key]
    }
    for (const line of input.lines ?? []) {
      const key = packingKey(line.label)
      if (!known.has(key) && !materials.some((m) => packingKey(m.label) === key)) throw new BadRequest(`no line "${line.label}" in the packing list (use add for new material)`)
      const state: PackingState = { ...packing[key] }
      if (line.checked !== undefined) state.checked = line.checked
      if (line.venue !== undefined) state.venue = line.venue
      if (line.qty !== undefined) {
        if (line.qty === null) delete state.qty
        else state.qty = Math.max(0, Math.round(line.qty))
      }
      packing[key] = state
    }
    this.apply(s.workshop.id, [{ op: 'set', entity: 'workshop', id: s.workshop.id, fields: { packing, materials } }])
    return this.packingList(s.workshop.id)
  }

  // ---------- slides (docs/slides.md) ----------

  /** The slide themes: the built-in default and the folders in data/themes that hold a theme.css. */
  themes(): string[] {
    return listThemes(this.themesDir)
  }

  /** A workshop's theme from the agent's input: null or '' follows the settings, 'default' is the built-in one, any other name must be a theme the server has. */
  private theme(ref: string | null | undefined): string | undefined {
    if (ref === undefined) return undefined
    const name = (ref ?? '').trim().toLowerCase()
    if (!name) return ''
    if (!THEME_NAME.test(name)) throw new BadRequest(`no theme "${ref}"`)
    if (name !== 'default' && this.themesDir) {
      const themes = this.themes()
      if (!themes.includes(name)) throw new BadRequest(`no theme "${ref}" (${themes.join(', ')})`)
    }
    return name
  }

  private slideView(slide: Slide, n: number, html: boolean) {
    return compact({ n, id: slide.id, layout: slideLayout(slide.html), title: slideTitle(slide.html), text: slideText(slide.html).slice(0, 400), html: html ? slide.html : undefined })
  }

  /**
   * Where slides live: a step of a workshop (workshop + item), or a library entry (entry; for a group entry
   * also the item inside it, by title or number). Writing refuses markers and notes, which have no slides.
   */
  private slideTarget(input: SlideTargetInput, write = false): SlideTarget {
    const check = (kind: ItemKind) => {
      if (write && ZERO_KINDS.includes(kind)) throw new BadRequest('markers and notes have no slides')
    }
    if (input.workshop !== undefined && input.entry !== undefined) throw new BadRequest('give either workshop and item or entry, not both')
    if (input.workshop !== undefined) {
      if (input.item === undefined) throw new BadRequest('give the item of the workshop')
      const s = this.state(input.workshop)
      const item = this.item(s, input.item)
      check(item.kind)
      return { where: { item: item.title || item.id }, slides: item.slides, save: (slides) => this.apply(s.workshop.id, [{ op: 'set', entity: 'item', id: item.id, fields: { slides } }]) }
    }
    if (input.entry === undefined) throw new BadRequest('give a workshop and its item, or a library entry')
    const entry = this.entry(input.entry)
    if (entry.kind === 'item') {
      check(entry.data.kind)
      return { where: { entry: entry.title }, slides: entry.data.slides ?? [], save: (slides) => this.repo.saveLibraryEntry(entry.id, { kind: 'item', title: entry.title, data: { ...entry.data, slides } }) }
    }
    if (input.item === undefined) throw new BadRequest(`"${entry.title}" is a group: give the item inside it, by title or number (${this.memberNames(entry)})`)
    const index = this.member(entry, input.item)
    const content = entry.data.items[index]
    check(content.kind)
    return {
      where: { entry: entry.title, item: content.title || String(index + 1) },
      slides: content.slides ?? [],
      save: (slides) => this.repo.saveLibraryEntry(entry.id, { kind: 'group', title: entry.title, data: { items: entry.data.items.map((c, n) => (n === index ? { ...c, slides } : c)) } }),
    }
  }

  /** The index of a slide given by id or number (1 = first; digits count as a number, since ids never are digits only). */
  private slideIndex(t: SlideTarget, ref: string | number): number {
    const n = typeof ref === 'number' ? ref : /^\d+$/.test(ref) ? Number(ref) : null
    const index = n !== null ? n - 1 : t.slides.findIndex((x) => x.id === ref)
    if (index < 0 || index >= t.slides.length) throw new BadRequest(`no slide "${ref}" (${t.where.entry ? 'the entry' : 'the item'} has ${t.slides.length})`)
    return index
  }

  /** A slide to store from what the agent gave: markup, a copy of a pool slide, or (with `existing`) one of the slides kept, by id or number. */
  private slideFrom(given: SlideGiven, existing?: Slide[]): Slide {
    const kinds = [given.html !== undefined, given.pool !== undefined, given.keep !== undefined].filter(Boolean).length
    if (kinds !== 1 || (given.keep !== undefined && !existing)) throw new BadRequest(existing ? 'give exactly one of html, pool or keep per slide' : 'give exactly one of html (markup) or pool (a pool slide id) per slide')
    if (given.html !== undefined) return { id: newId(), html: normalizeSlideHtml(given.html) }
    if (given.pool !== undefined) {
      const slide = this.repo.getDeckSlide(given.pool)
      if (!slide) throw new BadRequest(`no pool slide "${given.pool}" (pool_search lists ids)`)
      return { id: newId(), html: slide.html }
    }
    const kept = typeof given.keep === 'number' || /^\d+$/.test(String(given.keep)) ? existing![Number(given.keep) - 1] : existing!.find((x) => x.id === given.keep)
    if (!kept) throw new BadRequest(`no slide "${given.keep}" to keep`)
    return kept
  }

  /** The slide format: the rules and every layout with purpose, structure and an example; `layout` narrows it to one. */
  slideFormat(input: { layout?: string } = {}) {
    if (input.layout) {
      const key = input.layout.trim().toLowerCase()
      const layout = SLIDE_LAYOUTS.find((l) => l.layout === key)
      if (!layout) throw new BadRequest(`no layout "${input.layout}" (${SLIDE_LAYOUTS.map((l) => l.layout).join(', ')})`)
      return layout
    }
    return { ...SLIDE_FORMAT, layouts: SLIDE_LAYOUTS }
  }

  /** The slides of a step or library entry: number, id, layout, title and text; the markup only when asked for. */
  slideList(input: SlideTargetInput & { html?: boolean }) {
    const t = this.slideTarget(input)
    return { ...t.where, count: t.slides.length, slides: t.slides.map((x, i) => this.slideView(x, i + 1, !!input.html)) }
  }

  /** One slide with its markup and the pictures it shows: of a step or library entry, or of the pool. */
  slideGet(input: SlideTargetInput & { slide?: string | number; pool?: string }) {
    if (input.pool !== undefined) {
      const slide = this.repo.getDeckSlide(input.pool)
      if (!slide) throw new BadRequest(`no pool slide "${input.pool}" (pool_search lists ids)`)
      return compact({ pool: slide.id, deck: this.repo.listDecks().find((d) => d.id === slide.deckId)?.title, n: slide.position, layout: slideLayout(slide.html), title: slide.caption || slideTitle(slide.html), assets: slideAssets(slide.html), html: slide.html })
    }
    if (input.slide === undefined) throw new BadRequest('give the slide (id or number) or a pool slide id')
    const t = this.slideTarget(input)
    const index = this.slideIndex(t, input.slide)
    return { ...t.where, ...this.slideView(t.slides[index], index + 1, true), assets: slideAssets(t.slides[index].html) }
  }

  /** Replaces the slides with the given list (markup, pool copies, kept slides in a new order). */
  slideSet(input: SlideTargetInput & { slides: SlideGiven[] }) {
    const t = this.slideTarget(input, true)
    if (input.slides.length > MAX_SLIDES) throw new BadRequest(`at most ${MAX_SLIDES} slides`)
    t.save(input.slides.map((g) => this.slideFrom(g, t.slides)))
    return this.slideList(targetOf(input))
  }

  /** Adds one slide (html or pool) or several (slides), by default at the end; answers with the numbers added. */
  slideAdd(input: SlideTargetInput & SlideGiven & { slides?: SlideGiven[]; at?: number }) {
    const t = this.slideTarget(input, true)
    if (input.slides && (input.html !== undefined || input.pool !== undefined)) throw new BadRequest('give one slide (html or pool) or several (slides), not both')
    const given = input.slides ?? [{ html: input.html, pool: input.pool }]
    if (!given.length) throw new BadRequest('nothing to add')
    if (t.slides.length + given.length > MAX_SLIDES) throw new BadRequest(`at most ${MAX_SLIDES} slides (there are ${t.slides.length})`)
    const added = given.map((g) => this.slideFrom(g))
    const at = input.at === undefined ? t.slides.length : Math.min(Math.max(input.at, 0), t.slides.length)
    t.save([...t.slides.slice(0, at), ...added, ...t.slides.slice(at)])
    return { ...this.slideList(targetOf(input)), added: added.map((_, i) => at + i + 1) }
  }

  /** Changes one slide: new markup (the id stays), exact text replacements in the markup (every occurrence), or a new position. */
  slideUpdate(input: SlideTargetInput & { slide: string | number; html?: string; replace?: { find: string; with: string }[]; at?: number }) {
    const t = this.slideTarget(input, true)
    const index = this.slideIndex(t, input.slide)
    if (input.html !== undefined && input.replace !== undefined) throw new BadRequest('give html or replace, not both')
    if (input.html === undefined && input.replace === undefined && input.at === undefined) throw new BadRequest('nothing to change: give html, replace or at')
    let html = t.slides[index].html
    if (input.html !== undefined) html = normalizeSlideHtml(input.html)
    for (const r of input.replace ?? []) {
      if (!r.find) throw new BadRequest('find must not be empty')
      if (!html.includes(r.find)) throw new BadRequest(`"${r.find}" does not occur in slide ${index + 1} (slide_get shows the markup as stored)`)
      html = html.split(r.find).join(r.with)
    }
    if (input.replace) html = normalizeSlideHtml(html)
    const slide: Slide = { id: t.slides[index].id, html }
    const rest = t.slides.filter((_, i) => i !== index)
    const at = input.at === undefined ? index : Math.min(Math.max(input.at, 0), rest.length)
    t.save([...rest.slice(0, at), slide, ...rest.slice(at)])
    return { ...this.slideList(targetOf(input)), updated: this.slideView(slide, at + 1, true) }
  }

  /** Removes one slide (slide) or several (slides), by id or number. */
  slideRemove(input: SlideTargetInput & { slide?: string | number; slides?: (string | number)[] }) {
    const t = this.slideTarget(input, true)
    const refs = [...(input.slides ?? []), ...(input.slide !== undefined ? [input.slide] : [])]
    if (!refs.length) throw new BadRequest('give the slide (id or number) or slides to remove')
    const gone = new Set(refs.map((r) => t.slides[this.slideIndex(t, r)].id))
    t.save(t.slides.filter((x) => !gone.has(x.id)))
    return { ...this.slideList(targetOf(input)), removed: gone.size }
  }

  /** The decks of the pool, and the slides whose deck, caption or text match every word of the query (all of them without one), at most 60. */
  poolSearch(input: { query?: string; deck?: string; layout?: string } = {}) {
    const words = (input.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const deckRef = input.deck?.trim()
    const deck = deckRef?.toLowerCase()
    const layout = input.layout?.trim().toLowerCase()
    const hits = this.repo.listDeckSlides().filter((x) => {
      if (deck && x.deckId !== deckRef && !x.deck.toLowerCase().includes(deck)) return false
      if (layout && slideLayout(x.html) !== layout) return false
      const text = `${x.deck} ${x.caption} ${slideText(x.html)}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
    return {
      decks: this.repo.listDecks().map((d) => compact({ id: d.id, title: d.title, slides: d.slides, theme: d.theme })),
      total: hits.length,
      slides: hits.slice(0, 60).map((x) => ({ id: x.id, deck: x.deck, n: x.position, layout: slideLayout(x.html), title: x.caption || slideTitle(x.html), text: slideText(x.html).slice(0, 200) })),
    }
  }

  /** The deck of a workshop as it would be shown: generated slides and the items' own, in order; agenda and break slides can be left out as in the app. */
  deckOutline(ref: string, options: { agenda?: boolean; breaks?: boolean } = {}) {
    const s = this.state(ref)
    const labels = { untitled: 'Workshop', day: (n: number) => `Tag ${n}`, agenda: 'Agenda', breakTitle: 'Pause', until: (t: string) => `bis ${t}`, minutes: (n: number) => `${n} Minuten`, date: (d: string) => d }
    const deck = deckOf(s, labels, { ...DECK_DEFAULTS, ...compact(options) })
    return {
      theme: s.workshop.theme || this.repo.getSettings().theme || 'default',
      slides: deck.length,
      deck: deck.map((d, i) => compact({ n: i + 1, generated: d.generated, item: d.itemId ? s.items.find((x) => x.id === d.itemId)?.title : undefined, title: d.generated ? d.caption : slideTitle(d.html), layout: slideLayout(d.html) })),
    }
  }

  // ---------- library ----------

  private entry(ref: string): LibraryEntry {
    return this.byTitle(this.repo.listLibrary(), ref, 'library entry')
  }

  /** The index of an item inside a group entry, by title or number (1 = first). */
  private member(entry: GroupEntry, ref: string | number): number {
    const members = entry.data.items.map((c, n) => ({ id: String(n + 1), title: c.title }))
    return Number(this.byTitle(members, String(ref), 'item of the entry').id) - 1
  }

  private memberNames(entry: GroupEntry): string {
    return entry.data.items.map((c, n) => `${n + 1} ${c.title}`).join(', ')
  }

  /** Validates like the app's library editor (field limits, link schemes) and stores; answers with the entry in full. */
  private saveEntry(id: string | null, entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>) {
    const saved = this.repo.saveLibraryEntry(id, validateLibraryEntry(entry))
    if (!saved) throw new BadRequest('no such library entry')
    return this.libraryView(saved, true)
  }

  libraryList() {
    return this.repo.listLibrary().map((e) => this.libraryView(e))
  }

  /** One entry in full (notes, colour, the slides), to read before changing it. */
  libraryGet(ref: string) {
    return this.libraryView(this.entry(ref), true)
  }

  /** A new entry from the agent's fields: a single item, or with `items` a group with those items in order. */
  libraryCreate(input: LibraryItemInput & { items?: LibraryItemInput[] }) {
    const title = input.title.trim()
    if (!title) throw new BadRequest('title must not be empty')
    if (input.items) {
      if (contentKeys(input).length) throw new BadRequest('a group entry takes its fields per item: put them into items')
      if (!input.items.length) throw new BadRequest('a group entry needs at least one item')
      return this.saveEntry(null, { kind: 'group', title, data: { items: input.items.map((i) => this.newContent(i)) } })
    }
    return this.saveEntry(null, { kind: 'item', title, data: this.newContent({ ...input, title }) })
  }

  /**
   * Changes an entry; copies placed in workshops stay as they are. An item entry: title and fields change its item
   * (entry and item share the title, as in the app's editor). A group entry: title alone renames the heading; with
   * `item` the title and fields change that item and `at` moves it; `addItems` adds (at `addAt`, default the end),
   * `removeItems` takes items out. Items are resolved against the entry as it was before the call.
   */
  libraryUpdate(ref: string, input: ItemInput & { item?: string | number; at?: number; addItems?: LibraryItemInput[]; addAt?: number; removeItems?: (string | number)[] }) {
    const entry = this.entry(ref)
    const title = input.title?.trim()
    if (title !== undefined && !title) throw new BadRequest('title must not be empty')
    if (entry.kind === 'item') {
      if (input.item !== undefined || input.at !== undefined || input.addItems || input.removeItems) throw new BadRequest(`"${entry.title}" is a single item, not a group: leave item, at, addItems and removeItems out`)
      return this.saveEntry(entry.id, { kind: 'item', title: title ?? entry.title, data: { ...entry.data, ...this.contentFields({ ...input, title }, entry.data) } })
    }
    const index = input.item === undefined ? null : this.member(entry, input.item)
    if (index === null && (contentKeys(input).length || input.at !== undefined)) throw new BadRequest(`"${entry.title}" is a group: give the item inside it whose fields change, by title or number (${this.memberNames(entry)})`)
    const removed = new Set((input.removeItems ?? []).map((r) => this.member(entry, r)))
    const edited = index === null ? null : { ...entry.data.items[index], ...this.contentFields({ ...input, title }, entry.data.items[index]) }
    let items = entry.data.items.map((c, n) => (n === index ? edited! : c)).filter((_, n) => !removed.has(n))
    if (edited && input.at !== undefined && items.includes(edited)) {
      items = items.filter((c) => c !== edited)
      items.splice(Math.min(Math.max(0, input.at), items.length), 0, edited)
    }
    const added = (input.addItems ?? []).map((i) => this.newContent(i))
    items.splice(Math.min(Math.max(0, input.addAt ?? items.length), items.length), 0, ...added)
    if (!items.length) throw new BadRequest('a group entry needs at least one item; to drop the entry use library_delete')
    return this.saveEntry(entry.id, { kind: 'group', title: index === null && title !== undefined ? title : entry.title, data: { items } })
  }

  /** Deletes an entry for good; copies placed in workshops stay. */
  libraryDelete(ref: string) {
    const entry = this.entry(ref)
    this.repo.deleteLibraryEntry(entry.id)
    return { deleted: entry.title, kind: entry.kind }
  }

  private content(i: Item | ItemContent): ItemContent {
    return { kind: i.kind, title: i.title, description: i.description, duration: i.duration, goal: i.goal, method: i.method, lead: i.lead, notes: i.notes, materials: i.materials.map((m) => ({ ...m, id: newId() })), slides: (i.slides ?? []).map((s) => ({ ...s, id: newId() })), categoryId: i.categoryId, color: i.color }
  }

  /** Saves an item, or a group with its items, of a workshop to the library (a copy; files stay with the workshop). */
  librarySave(ref: string, input: { item?: string; group?: string; title?: string }) {
    const s = this.state(ref)
    if (input.item) {
      const item = this.item(s, input.item)
      return this.libraryView(this.repo.saveLibraryEntry(null, { kind: 'item', title: input.title ?? item.title, data: this.content(item) })!)
    }
    if (input.group) {
      const group = this.group(s, input.group)
      const items = membersOf(s.items, group.id)
      if (!items.length) throw new BadRequest('the group has no items')
      return this.libraryView(this.repo.saveLibraryEntry(null, { kind: 'group', title: input.title ?? group.title, data: { items: items.map((i) => this.content(i)) } })!)
    }
    throw new BadRequest('give an item or a group to save')
  }

  /** Inserts a copy of a library entry into a day (or the parking lot). */
  libraryInsert(ref: string, entryRef: string, dayRef: DayRef, where: Placement = {}) {
    const entry = this.entry(entryRef)
    const s = this.state(ref)
    const day = this.day(s, dayRef)
    const dayId = day?.id ?? null
    if (entry.kind === 'item') {
      const { position, ops } = this.place(s, dayId, null, 'new', where)
      const record: Item = { ...this.newItem(s.workshop.id, dayId, null, position, {}), ...this.content(entry.data) }
      this.apply(s.workshop.id, [...ops, { op: 'create', entity: 'item', record }])
      return this.itemsResult(this.repo.loadWorkshop(s.workshop.id)!, [record.id], dayId)
    }
    const groupId = newId()
    const { position, ops } = this.place(s, dayId, null, groupId, where)
    ops.push({ op: 'create', entity: 'group', record: { id: groupId, workshopId: s.workshop.id, dayId, position, title: entry.title } })
    const ids: string[] = []
    entry.data.items.forEach((c, n) => {
      const record: Item = { ...this.newItem(s.workshop.id, dayId, groupId, n + 1, {}), ...this.content(c) }
      ids.push(record.id)
      ops.push({ op: 'create', entity: 'item', record })
    })
    this.apply(s.workshop.id, ops)
    return this.itemsResult(this.repo.loadWorkshop(s.workshop.id)!, ids, dayId)
  }

  // ---------- settings ----------

  settingsGet() {
    const settings = this.repo.getSettings()
    return {
      categories: settings.categories.map((c) => ({ id: c.id, name: c.name.trim() || c.id, color: c.color })),
      dayStart: formatTime(settings.dayStart),
      dayEnd: settings.dayEnd === null ? null : formatTime(settings.dayEnd),
      theme: settings.theme || 'default',
      themes: this.themes(),
      kinds: { block: 'a step with a duration (≥ 5 min)', break: 'a pause', marker: 'a point in time without duration ("Participants arrive", "End")', note: 'a cue in the flow of the agenda, no duration' },
    }
  }
}
