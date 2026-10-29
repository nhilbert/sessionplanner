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
    s.available = s.end === null ? null : s.end - s.start
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
