import type { DeckSlideRef } from './deck.ts'
import { esc } from './slides.ts'
import { clockIn, durationOf, formatTime, scheduleDay, type DaySchedule, type TimedItem } from './time.ts'
import type { Day } from './types.ts'

/**
 * Live times (docs/slides.md, Presenting): what the facilitator sets in the presenter view while the workshop runs, so
 * far the end of a break. They are not part of the plan: the agenda, the agenda slides, the printouts and the exports
 * keep the planned times. The server keeps them in memory beside the presentation's slide and passes them to every
 * window that leads it; the presenter view computes the rest of the day from them (the re-forecast), and the
 * generated break slide counts down to the end.
 *
 * Moments are epoch milliseconds, so every device reads the same moment whatever its own time zone.
 */
export interface LiveBreak {
  /** When the break began: when its slide went on screen (or the end was set without a slide); null before. */
  from: number | null
  /** The agreed end; null while only a length is set. */
  until: number | null
  /** A length that starts when the break's slide goes on screen; null once the end is fixed. */
  minutes: number | null
}

/** By item id. */
export type LiveTimes = Record<string, LiveBreak>

export const MINUTE = 60_000

/** A length set live: counted from the start once the break has begun, else from when its slide goes on screen. */
export function withMinutes(entry: LiveBreak | undefined, minutes: number): LiveBreak {
  const from = entry?.from ?? null
  return from !== null ? { from, until: from + minutes * MINUTE, minutes: null } : { from: null, until: null, minutes }
}

/** An end set live: it holds from now on, whenever the slide goes on screen. */
export function withEnd(entry: LiveBreak | undefined, until: number): LiveBreak {
  return { from: entry?.from ?? null, until, minutes: null }
}

/** The break went on screen at `now`: a length becomes an end, and a set end learns when the break began. */
export function started(entry: LiveBreak, now: number): LiveBreak {
  if (entry.from !== null) return entry
  if (entry.minutes !== null) return { from: now, until: now + entry.minutes * MINUTE, minutes: null }
  if (entry.until !== null) return { from: Math.min(now, entry.until), until: entry.until, minutes: null }
  return entry
}

/** Whether a slide of the presentation (its deck key) belongs to the item: its generated break slide or one of its own. */
export const slideOf = (key: string, itemId: string): boolean => key === `break:${itemId}` || key.startsWith(`${itemId}:`)

/**
 * The moment a clock time of today (minutes after midnight in the workshop's zone) stands for, `now` being the
 * moment whose clock time is `nowMin`. Zones are offset by whole minutes, so the minute boundaries agree.
 */
export function momentAt(now: number, nowMin: number, minutes: number): number {
  return Math.floor(now / MINUTE) * MINUTE + (minutes - nowMin) * MINUTE
}

/** The whole minutes left until `until`, rounded up: one minute shows until the end has come. */
export const minutesLeft = (until: number, now: number): number => Math.ceil((until - now) / MINUTE)

/**
 * The items of a day with the live times worked in, for scheduleDay: a break that began keeps its real start and
 * end, a break with an agreed end ends then (it starts where the plan has it, or earlier if the end comes before
 * that), and a length waiting for its slide counts as the break's length. Moments of another day are left out.
 */
export function liveItems(day: Pick<Day, 'date' | 'startMin' | 'endMin'>, items: TimedItem[], live: LiveTimes, timeZone: string): TimedItem[] {
  const at = (ms: number) => clockIn(new Date(ms), timeZone)
  const out = items.map((i) => ({ ...i }))
  out.forEach((item, n) => {
    const entry = live[item.id]
    if (!entry || item.kind !== 'break') return
    if (entry.until === null) {
      if (entry.minutes !== null) item.duration = entry.minutes
      return
    }
    const end = at(entry.until)
    if (end.date !== day.date) return
    if (entry.from !== null) {
      const start = at(entry.from)
      if (start.date !== day.date) return
      item.fixedStart = start.minutes
      item.duration = Math.max(0, end.minutes - start.minutes)
      return
    }
    const planned = scheduleDay(day.startMin, day.endMin, out.slice(0, n + 1)).slots[item.id].start
    if (end.minutes >= planned) item.duration = end.minutes - planned
    else item.fixedStart = end.minutes - durationOf(item)
  })
  return out
}

/** The day computed from the plan and the live times: the re-forecast of the presenter view. */
export function liveSchedule(day: Pick<Day, 'date' | 'startMin' | 'endMin'>, items: TimedItem[], live: LiveTimes, timeZone: string): DaySchedule {
  return scheduleDay(day.startMin, day.endMin, liveItems(day, items, live, timeZone))
}

export interface BreakLabels {
  /** "15 Minuten" */
  minutes: (n: number) => string
  /** "noch 12 Minuten" */
  left: (n: number) => string
  /** "bis 11:30" */
  until: (time: string) => string
  /** "Es geht weiter" */
  over: string
}

/** The line under a break slide's title with the live times: the minutes left and the end, or the end come. */
export function breakLine(entry: LiveBreak, now: number, timeZone: string, labels: BreakLabels): string {
  if (entry.until === null) return entry.minutes !== null ? esc(labels.minutes(entry.minutes)) : ''
  const left = minutesLeft(entry.until, now)
  if (left <= 0) return `<strong>${esc(labels.over)}</strong>`
  return `${esc(labels.left(left))} · <strong>${esc(labels.until(formatTime(clockIn(new Date(entry.until), timeZone).minutes)))}</strong>`
}

/** A generated break slide with its live line in place of the planned one; every other slide as it is. */
export function withLiveBreak(slide: DeckSlideRef, live: LiveTimes, now: number, timeZone: string, labels: BreakLabels): string {
  const entry = slide.generated === 'break' && slide.itemId ? live[slide.itemId] : undefined
  if (!entry) return slide.html
  return slide.html.replace(/<p class="until">[\s\S]*?<\/p>/, `<p class="until">${breakLine(entry, now, timeZone, labels)}</p>`)
}
