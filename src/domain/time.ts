import { type Item, ZERO_KINDS } from './types.ts'

/** Time rules of a day (docs/concept.md, section 4). Pure: no clock, no UI. All times in minutes after midnight. */

export type TimedItem = Pick<Item, 'id' | 'kind' | 'duration' | 'fixedStart'>

export interface Slot {
  start: number
  end: number
  /** Free minutes before a fixed start (the cursor was earlier). */
  gap: number
  /** Minutes the items before run into this fixed start (the cursor was later). */
  overlap: number
  /** Ends after the next fixed start or the day's target end. */
  late: boolean
}

export interface Segment {
  start: number
  /** Next fixed start or the target end; null when the day has no target end and no fixed start follows. */
  end: number | null
  /** The fixed-start item that opens the segment; null for the first one. */
  anchorId: string | null
  itemIds: string[]
  planned: number
  available: number | null
}

export interface DaySchedule {
  slots: Record<string, Slot>
  segments: Segment[]
  /** End of the last item (the day's start when empty). */
  end: number
  /** Computed end minus target end; null without a target end. */
  overTarget: number | null
  workMinutes: number
  breakMinutes: number
  /** Longest run of blocks without a break or a gap of BREAK_GAP minutes or more. */
  longestStretch: number
}

export const BREAK_GAP = 10
export const LONG_STRETCH = 90
export const SNAP = 5
/** The longest step: a whole day (the server refuses more). */
export const MAX_DURATION = 1440

export const durationOf = (item: Pick<Item, 'kind' | 'duration'>): number => (ZERO_KINDS.includes(item.kind) ? 0 : Math.max(0, item.duration))

export function scheduleDay(startMin: number, endMin: number | null, items: TimedItem[]): DaySchedule {
  const slots: Record<string, Slot> = {}
  const segments: Segment[] = []
  let segment: Segment = { start: startMin, end: null, anchorId: null, itemIds: [], planned: 0, available: null }
  let cursor = startMin
  let workMinutes = 0
  let breakMinutes = 0

  for (const item of items) {
    const duration = durationOf(item)
    let start = cursor
    let gap = 0
    let overlap = 0
    if (item.fixedStart !== null) {
      start = item.fixedStart
      if (cursor < start) gap = start - cursor
      else overlap = cursor - start
      segment.end = item.fixedStart
      segments.push(segment)
      segment = { start: item.fixedStart, end: null, anchorId: item.id, itemIds: [], planned: 0, available: null }
    }
    const end = start + duration
    slots[item.id] = { start, end, gap, overlap, late: false }
    segment.itemIds.push(item.id)
    segment.planned += duration
    if (item.kind === 'block') workMinutes += duration
    if (item.kind === 'break') breakMinutes += duration
    cursor = end
  }
  segment.end = endMin
  segments.push(segment)

  for (const s of segments) {
    // A fixed start earlier than the one before it (out of order) leaves no room, not negative room: it shows as an overlap.
    s.available = s.end === null ? null : Math.max(0, s.end - s.start)
    if (s.end === null) continue
    for (const id of s.itemIds) if (slots[id].end > s.end) slots[id].late = true
  }

  return {
    slots,
    // The first segment is empty when the day opens with a fixed start at (or before) its start time.
    segments: segments.filter((s, i) => !(i === 0 && s.itemIds.length === 0 && (s.available ?? 0) <= 0)),
    end: cursor,
    overTarget: endMin === null ? null : cursor - endMin,
    workMinutes,
    breakMinutes,
    longestStretch: longestStretch(items, slots),
  }
}

function longestStretch(items: TimedItem[], slots: Record<string, Slot>): number {
  let longest = 0
  let from: number | null = null
  let lastEnd = 0
  for (const item of items) {
    const slot = slots[item.id]
    if (item.kind === 'marker' || item.kind === 'note') continue
    if (from !== null && slot.start - lastEnd >= BREAK_GAP) from = null
    if (item.kind === 'break') {
      from = null
      continue
    }
    if (from === null) from = slot.start
    lastEnd = Math.max(lastEnd, slot.end)
    longest = Math.max(longest, lastEnd - from)
  }
  return longest
}

export const snap = (minutes: number, step = SNAP): number => Math.round(minutes / step) * step

/** 570 → "09:30"; times past midnight wrap (25:00 → "01:00"). */
export function formatTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 90 → "1 h 30 min", 45 → "45 min", 120 → "2 h". */
export function formatDuration(min: number): string {
  const m = Math.abs(Math.round(min))
  const h = Math.floor(m / 60)
  const rest = m % 60
  const text = h === 0 ? `${rest} min` : rest === 0 ? `${h} h` : `${h} h ${rest} min`
  return min < 0 ? `−${text}` : text
}

/** "09:30" → 570; null for anything that is not HH:MM. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

/**
 * A length typed by hand: "90", "90 min", "1:30", "1h30", "1 h 30 min", "1 h 30 Minuten", "1,5 h", "2h".
 * Minutes are whole numbers; a decimal needs the hours ("1,5" alone is not a length). Blocks and breaks
 * take at least SNAP minutes, so a shorter length counts as that. Undefined when it is not a length up to 24 hours.
 */
export function parseDuration(value: string): number | undefined {
  const text = value.trim().toLowerCase().replace(',', '.')
  const MIN = '(?:m|min|mins|minuten|minutes)'
  const HOURS = '(?:h|std|stunden?|hours?)'
  let m: RegExpExecArray | null
  let minutes: number | undefined
  if ((m = new RegExp(`^(\\d+)\\s*${MIN}?$`).exec(text))) minutes = Number(m[1])
  else if ((m = /^(\d+):(\d{1,2})$/.exec(text))) minutes = Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined
  else if ((m = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${HOURS}$`).exec(text))) minutes = Number(m[1]) * 60
  else if ((m = new RegExp(`^(\\d+)\\s*${HOURS}\\s*(\\d+)\\s*${MIN}?$`).exec(text))) minutes = Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined
  if (minutes === undefined || !Number.isFinite(minutes)) return undefined
  const rounded = Math.round(minutes)
  return rounded >= 1 && rounded <= MAX_DURATION ? Math.max(SNAP, rounded) : undefined
}

/** A clock time typed by hand: "9", "930", "0930", "9:30", "9.30", "9h30", "9 Uhr", "9.30 h" → minutes after midnight; null for anything else. */
export function parseClock(value: string): number | null {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s*(uhr|h)$/, '')
    .replace(/[.h]/, ':')
  if (/^\d{1,2}$/.test(text)) return parseTime(`${text}:00`)
  if (/^\d{3,4}$/.test(text)) return parseTime(`${text.slice(0, -2)}:${text.slice(-2)}`)
  return parseTime(text)
}

/**
 * The calendar date (YYYY-MM-DD) and the minutes after midnight of `at` in a time zone (the workshop's), so the
 * clock matches the agenda wherever the device is set. An unknown zone falls back to the device's own.
 */
export function clockIn(at: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    )
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0')
    return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, minutes: at.getHours() * 60 + at.getMinutes() }
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}
