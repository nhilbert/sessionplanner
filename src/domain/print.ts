import type { Day, Item, Material, WorkshopState } from './types.ts'
import { agendaOrder, entriesIn, itemsIn, sortedDays } from './order.ts'
import { type DaySchedule, durationOf, formatDuration, formatTime, scheduleDay } from './time.ts'
import { packingList } from './packing.ts'

/**
 * Print views and their Markdown twin (docs/concept.md, section 6). One set of switches drives both the printed
 * page and the exported Markdown, so what is on paper is what is in the file. Pure: labels and date formatting
 * come from the caller.
 */

export type PrintVariant = 'overview' | 'plan' | 'agenda' | 'packing'

export interface PrintOptions {
  // Fields of a step
  description: boolean
  goal: boolean
  method: boolean
  lead: boolean
  category: boolean
  material: boolean
  files: boolean
  /** Facilitation notes of a step, and the note items (cues) in the flow of the agenda. */
  notes: boolean
  // Rows and columns
  duration: boolean
  breaks: boolean
  markers: boolean
  // Head and page
  workshopGoal: boolean
  workshopNotes: boolean
  pageBreakDays: boolean
  landscape: boolean
  // Moderation plan only
  /** A box to tick per step and per piece of material. */
  checkboxes: boolean
  /** A compact list of the day's steps before the step cards. */
  dayOverview: boolean
  appendPacking: boolean
}

const ALL: PrintOptions = {
  description: true,
  goal: true,
  method: true,
  lead: true,
  category: true,
  material: true,
  files: true,
  notes: true,
  duration: true,
  breaks: true,
  markers: true,
  workshopGoal: true,
  workshopNotes: true,
  pageBreakDays: true,
  landscape: false,
  checkboxes: true,
  dayOverview: true,
  appendPacking: false,
}

/** What each view shows until the user changes it. The client agenda keeps every internal field off. */
export const PRINT_DEFAULTS: Record<PrintVariant, PrintOptions> = {
  overview: { ...ALL, category: false, material: false, files: false, notes: false, checkboxes: false, dayOverview: false },
  plan: ALL,
  agenda: { ...ALL, goal: false, method: false, lead: false, category: false, material: false, files: false, notes: false, duration: false, workshopNotes: false, pageBreakDays: false, checkboxes: false, dayOverview: false },
  packing: ALL,
}

/** The switches each view offers, in the order they are shown. */
export const PRINT_CHOICES: Record<PrintVariant, (keyof PrintOptions)[]> = {
  overview: ['landscape', 'duration', 'description', 'goal', 'method', 'lead', 'category', 'material', 'files', 'notes', 'workshopGoal', 'workshopNotes', 'pageBreakDays'],
  plan: ['checkboxes', 'dayOverview', 'description', 'goal', 'method', 'lead', 'category', 'material', 'files', 'notes', 'workshopGoal', 'workshopNotes', 'pageBreakDays', 'appendPacking'],
  agenda: ['description', 'goal', 'lead', 'duration', 'breaks', 'markers', 'workshopGoal', 'pageBreakDays'],
  packing: [],
}

export const PRINT_VARIANTS: readonly PrintVariant[] = ['overview', 'plan', 'agenda', 'packing']

export const isPrintVariant = (v: string | undefined): v is PrintVariant => PRINT_VARIANTS.includes(v as PrintVariant)

/** Options read back from storage: unknown keys dropped, missing ones filled from the defaults. */
export function printOptions(variant: PrintVariant, stored: unknown): PrintOptions {
  const out = { ...PRINT_DEFAULTS[variant] }
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(out) as (keyof PrintOptions)[]) {
      const v = (stored as Record<string, unknown>)[key]
      if (typeof v === 'boolean') out[key] = v
    }
  }
  return out
}

export type PrintRow =
  | { kind: 'group'; id: string; title: string; start: number | null; end: number | null }
  | {
      kind: 'item'
      item: Item
      start: number
      end: number
      minutes: number
      gap: number
      overlap: number
      late: boolean
      /** When late: the fixed start or target end it runs past. */
      until: number | null
      inGroup: boolean
      /** Blocks are numbered per day (1, 2, 3 …); breaks, markers and notes are not. */
      number: number | null
    }

/** The rows of one day as printed: groups as headings, items in agenda order, hidden kinds left out, blocks numbered. */
export function dayRows(state: WorkshopState, day: Day, variant: PrintVariant, o: PrintOptions): { schedule: DaySchedule; rows: PrintRow[] } {
  const schedule = scheduleDay(day.startMin, day.endMin, itemsIn(state, day.id))
  const shown = (item: Item) => (item.kind === 'break' ? o.breaks : item.kind === 'marker' ? o.markers : item.kind === 'note' ? variant !== 'agenda' && o.notes : true)
  let number = 0
  const rowOf = (item: Item, inGroup: boolean): PrintRow => {
    const slot = schedule.slots[item.id]
    const until = slot.late ? (schedule.segments.find((s) => s.itemIds.includes(item.id))?.end ?? null) : null
    return { kind: 'item', item, start: slot.start, end: slot.end, minutes: durationOf(item), gap: slot.gap, overlap: slot.overlap, late: slot.late, until, inGroup, number: item.kind === 'block' ? ++number : null }
  }
  const rows: PrintRow[] = []
  for (const e of entriesIn(state, day.id)) {
    if (e.type === 'item') {
      if (shown(e.item)) rows.push(rowOf(e.item, false))
      continue
    }
    const members = e.items.filter(shown)
    if (!members.length) continue
    const timed = e.items.map((i) => schedule.slots[i.id])
    rows.push({ kind: 'group', id: e.id, title: e.group.title, start: timed.length ? timed[0].start : null, end: timed.length ? Math.max(...timed.map((s) => s.end)) : null })
    for (const m of members) rows.push(rowOf(m, true))
  }
  return { schedule, rows }
}

export const timeRange = (start: number, end: number): string => (end > start ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start))

/** "Tue, 10 Nov 2026" or "Tue, 10 Nov 2026 – Wed, 11 Nov 2026". */
export function dateRange(days: Day[], formatDate: (date: string) => string): string {
  const sorted = sortedDays(days)
  if (!sorted.length) return ''
  return sorted.length === 1 ? formatDate(sorted[0].date) : `${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}`
}

/** The texts the Markdown needs from the UI's language. */
export interface PrintLabels {
  /** Title of the view ("Moderationsplan"). */
  variant: string
  untitled: string
  day: (n: number) => string
  time: string
  duration: string
  content: string
  goal: string
  method: string
  lead: string
  category: string
  material: string
  files: string
  notes: string
  packing: string
  venue: string
  dayOverview: string
  gap: (d: string) => string
  overlap: (d: string) => string
  late: (time: string) => string
  /** The name of an item's category, or null without one. */
  categoryOf: (item: Item) => string | null
}

/** A table cell: pipes escaped, line breaks kept as <br>. */
const cell = (text: string): string => text.trim().replace(/\|/g, '\\|').replace(/\r?\n+/g, '<br>')

/** Headings inside notes move below the heading they sit under (notes may use #, ## and ###). */
const demote = (markdown: string, by: number): string => markdown.replace(/^(#{1,6})(\s)/gm, (_m, h: string, s: string) => '#'.repeat(Math.min(6, h.length + by)) + s)

/** "2 × Flipchart", or just the label for a single piece. Shared with the printed page, so paper and file agree. */
export const materialLabel = (m: Material): string => (m.qty > 1 ? `${m.qty} × ${m.label}` : m.label)
export const fileNames = (state: WorkshopState, item: Item): string[] => item.attachmentIds.map((a) => state.attachments.find((x) => x.id === a)?.name).filter((n): n is string => !!n)
const materialText = (item: Item): string => item.materials.map(materialLabel).join(', ')

/**
 * The workshop as Markdown, shaped like the printed view: a table per day for the overview and the client agenda,
 * a section per step for the moderation plan, a task list for the packing list.
 */
export function workshopMarkdown(state: WorkshopState, variant: PrintVariant, o: PrintOptions, l: PrintLabels, formatDate: (date: string, long?: boolean) => string): string {
  const w = state.workshop
  const days = sortedDays(state.days)
  const out: string[] = [`# ${w.title.trim() || l.untitled}`, '', [l.variant, w.client, w.location, dateRange(days, formatDate)].filter((x) => x.trim()).join(' · ')]
  if (variant === 'packing') return finish([...out, '', ...packingLines(state, l)])
  if (o.workshopGoal && w.goal.trim()) out.push('', w.goal.trim())
  if (o.workshopNotes && variant !== 'agenda' && w.notes.trim()) out.push('', demote(w.notes.trim(), 1))
  days.forEach((day, i) => {
    const { schedule, rows } = dayRows(state, day, variant, o)
    out.push('', `## ${days.length > 1 ? `${l.day(i + 1)} · ` : ''}${formatDate(day.date, true)} · ${formatTime(day.startMin)}–${formatTime(schedule.end)}`, '')
    if (variant === 'plan') {
      // The day at a glance: times, steps and who leads, without the cues.
      if (o.dayOverview) {
        const glance = rows.filter((r) => r.kind === 'group' || r.item.kind !== 'note')
        out.push(`**${l.dayOverview}**`, '', ...tableLines(glance, state, { ...o, description: false, goal: false, method: false, material: false, files: false, notes: false, category: false }, l), '')
      }
      out.push(...sectionLines(rows, state, o, l))
    } else out.push(...tableLines(rows, state, o, l))
  })
  if (variant === 'plan' && o.appendPacking) out.push('', `## ${l.packing}`, '', ...packingLines(state, l))
  return finish(out)
}

const finish = (lines: string[]): string => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

function tableLines(rows: PrintRow[], state: WorkshopState, o: PrintOptions, l: PrintLabels): string[] {
  type Col = { head: string; of: (r: Extract<PrintRow, { kind: 'item' }>) => string }
  const cols: Col[] = [{ head: l.time, of: (r) => timeRange(r.start, r.end) }]
  if (o.duration) cols.push({ head: l.duration, of: (r) => (r.minutes ? formatDuration(r.minutes) : '') })
  cols.push({
    head: l.content,
    of: (r) => {
      const { item } = r
      if (item.kind === 'note') return `*${[item.title, item.description].filter(Boolean).join(' – ')}*`
      const category = o.category ? l.categoryOf(item) : null
      const title = item.kind === 'block' ? `**${item.title}**` : item.title
      return [title + (category ? ` _(${category})_` : ''), o.description && item.kind !== 'marker' ? item.description : ''].filter(Boolean).join('\n')
    },
  })
  if (o.goal) cols.push({ head: l.goal, of: (r) => r.item.goal })
  if (o.method) cols.push({ head: l.method, of: (r) => r.item.method })
  if (o.lead) cols.push({ head: l.lead, of: (r) => r.item.lead })
  if (o.material || o.files) cols.push({ head: l.material, of: (r) => [o.material ? materialText(r.item) : '', ...(o.files ? fileNames(state, r.item).map((n) => `📎 ${n}`) : [])].filter(Boolean).join('\n') })
  if (o.notes) cols.push({ head: l.notes, of: (r) => (r.item.kind === 'note' ? '' : r.item.notes) })
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  const out = [line(cols.map((c) => c.head)), line(cols.map(() => '---'))]
  for (const r of rows) {
    if (r.kind === 'group') {
      const cells = cols.map(() => '')
      cells[0] = r.start !== null && r.end !== null ? timeRange(r.start, r.end) : ''
      cells[o.duration ? 2 : 1] = `**${cell(r.title.toUpperCase())}**`
      out.push(line(cells))
    } else out.push(line(cols.map((c) => cell(c.of(r)))))
  }
  return out
}

function sectionLines(rows: PrintRow[], state: WorkshopState, o: PrintOptions, l: PrintLabels): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (r.kind === 'group') {
      out.push('', `**${r.title}**${r.start !== null && r.end !== null ? ` · ${timeRange(r.start, r.end)}` : ''}`, '')
      continue
    }
    const { item } = r
    if (r.gap) out.push(`*${l.gap(formatDuration(r.gap))}*`, '')
    if (r.overlap) out.push(`*${l.overlap(formatDuration(r.overlap))}*`, '')
    if (item.kind === 'note') {
      out.push(`> ${[item.title ? `**${item.title}**` : '', item.description].filter(Boolean).join(' – ')}`, '')
      continue
    }
    if (item.kind === 'marker') {
      out.push(`**${formatTime(r.start)} · ${item.title}**`, '')
      continue
    }
    const head = `${r.number !== null ? `${r.number}. ` : ''}${item.title}`.trim()
    out.push(`### ${timeRange(r.start, r.end)} · ${head} (${formatDuration(r.minutes)})`, '')
    if (item.kind === 'break') continue
    if (o.description && item.description.trim()) out.push(item.description.trim(), '')
    const fields: string[] = []
    if (o.goal && item.goal.trim()) fields.push(`- **${l.goal}:** ${item.goal.trim()}`)
    if (o.method && item.method.trim()) fields.push(`- **${l.method}:** ${item.method.trim()}`)
    if (o.lead && item.lead.trim()) fields.push(`- **${l.lead}:** ${item.lead.trim()}`)
    const category = o.category ? l.categoryOf(item) : null
    if (category) fields.push(`- **${l.category}:** ${category}`)
    if (o.material && item.materials.length) fields.push(`- **${l.material}:** ${materialText(item)}`)
    const files = o.files ? fileNames(state, item) : []
    if (files.length) fields.push(`- **${l.files}:** ${files.join(', ')}`)
    if (fields.length) out.push(...fields, '')
    if (o.notes && item.notes.trim()) out.push(demote(item.notes.trim(), 3), '')
    if (r.late) out.push(`*${l.late(formatTime(r.until ?? r.end))}*`, '')
  }
  return out
}

function packingLines(state: WorkshopState, l: PrintLabels): string[] {
  const lines = packingList(agendaOrder(state.days, state), state.workshop.packing, state.workshop.materials)
  return lines.map((p) => `- [${p.state.checked ? 'x' : ' '}] ${p.qty > 1 ? `${p.qty} × ` : ''}${p.label}${p.state.venue ? ` (${l.venue})` : ''}`)
}
