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
  /**
   * A break put in live ("Break now"), not in the plan: the deck key of the slide it follows. Its slide is generated
   * there in every window of the presentation; its id starts with EXTRA.
   */
  after?: string
  /** The step a break put in live interrupts (the item of the slide it follows): the re-forecast counts it after that step. */
  step?: string | null
}

/** By item id. */
export type LiveTimes = Record<string, LiveBreak>

export const MINUTE = 60_000

/** The id of a break put in live starts with this; the ids of the plan are UUIDs. */
export const EXTRA = 'now-'
export const isExtra = (id: string | undefined): boolean => !!id?.startsWith(EXTRA)

/** Where a break put in live stands, kept through every change of its times. */
const placeOf = (entry: LiveBreak | undefined): Pick<LiveBreak, 'after' | 'step'> => (entry?.after !== undefined ? { after: entry.after, step: entry.step ?? null } : {})

/** A length set live: counted from the start once the break has begun, else from when its slide goes on screen. */
export function withMinutes(entry: LiveBreak | undefined, minutes: number): LiveBreak {
  const from = entry?.from ?? null
  return from !== null ? { from, until: from + minutes * MINUTE, minutes: null, ...placeOf(entry) } : { from: null, until: null, minutes, ...placeOf(entry) }
}

/** An end set live: it holds from now on, whenever the slide goes on screen. */
export function withEnd(entry: LiveBreak | undefined, until: number): LiveBreak {
  return { from: entry?.from ?? null, until, minutes: null, ...placeOf(entry) }
}

/** The break went on screen at `now`: a length becomes an end, and a set end learns when the break began. */
export function started(entry: LiveBreak, now: number): LiveBreak {
  if (entry.from !== null) return entry
  if (entry.minutes !== null) return { from: now, until: now + entry.minutes * MINUTE, minutes: null, ...placeOf(entry) }
  if (entry.until !== null) return { from: Math.min(now, entry.until), until: entry.until, minutes: null, ...placeOf(entry) }
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

/** The length a break put in live takes in the re-forecast: as it ran or runs, else as set. */
function extraMinutes(entry: LiveBreak, now: number): number {
  if (entry.until === null) return entry.minutes ?? 0
  if (entry.from !== null) return Math.max(0, Math.round((entry.until - entry.from) / MINUTE))
  return Math.max(0, minutesLeft(entry.until, now))
}

/**
 * The items of a day with the live times worked in, for scheduleDay: a break that began keeps its real start and
 * end, a break with an agreed end ends then (it starts where the plan has it, or earlier if the end comes before
 * that), and a length waiting for its slide counts as the break's length. A break put in live lengthens the step it
 * interrupts by its length, so that step's minutes left stay true and what follows moves; after an item that is not
 * a step (a planned break, a marker) it comes as a break of its own. Moments of another day are left out.
 */
export function liveItems(day: Pick<Day, 'date' | 'startMin' | 'endMin'>, items: TimedItem[], live: LiveTimes, timeZone: string, now = Date.now()): TimedItem[] {
  const at = (ms: number) => clockIn(new Date(ms), timeZone)
  const out = items.map((i) => ({ ...i }))
  for (const [id, entry] of Object.entries(live)) {
    if (entry.after === undefined || !entry.step) continue
    if (entry.from !== null && at(entry.from).date !== day.date) continue
    const n = out.findIndex((i) => i.id === entry.step)
    if (n === -1) continue
    if (out[n].kind === 'block') {
      out[n].duration += extraMinutes(entry, now)
      continue
    }
    // After the item and after the breaks put in live after it before this one.
    let place = n + 1
    while (place < out.length && isExtra(out[place].id)) place++
    out.splice(place, 0, { id, kind: 'break', duration: extraMinutes(entry, now), fixedStart: null })
  }
  out.forEach((item, n) => {
    const entry = live[item.id]
    if (!entry || item.kind !== 'break' || entry.after !== undefined) return
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
export function liveSchedule(day: Pick<Day, 'date' | 'startMin' | 'endMin'>, items: TimedItem[], live: LiveTimes, timeZone: string, now = Date.now()): DaySchedule {
  return scheduleDay(day.startMin, day.endMin, liveItems(day, items, live, timeZone, now))
}

/**
 * The deck as presented: the breaks put in live get a generated break slide after the slide they follow (one after
 * the other in the order they were put in), with a picture of the pool when there is one. Its key is the break's
 * generated key, so paging to it starts the break as any other; the line under its title is the live line
 * (withLiveBreak). A break whose slide is gone from the deck is left out.
 */
export function withExtraBreaks(deck: DeckSlideRef[], live: LiveTimes, title: string, picture: (id: string) => string = () => ''): DeckSlideRef[] {
  const extras = Object.entries(live).filter(([id, e]) => isExtra(id) && e.after !== undefined)
  if (!extras.length) return deck
  const out = [...deck]
  let put = 0
  // A break may follow another one put in live: placed in rounds, until a round places none.
  let waiting = extras
  while (waiting.length) {
    const left: typeof extras = []
    for (const [id, entry] of waiting) {
      const n = out.findIndex((s) => s.key === entry.after)
      if (n === -1) {
        left.push([id, entry])
        continue
      }
      put++
      let place = n + 1
      while (place < out.length && isExtra(out[place].itemId)) place++
      out.splice(place, 0, {
        key: `break:${id}`,
        itemId: id,
        generated: 'break',
        caption: title,
        part: out[n].part,
        html: `<section class="slide break"><div class="text"><h1>${esc(title)}</h1><p class="until"></p></div>${picture(id)}</section>`,
      })
    }
    if (left.length === waiting.length) break
    waiting = left
  }
  return put ? out : deck
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
  // A clock that ticks every few seconds may still stand before the start the server set: it reads the start.
  const left = minutesLeft(entry.until, entry.from !== null ? Math.max(now, entry.from) : now)
  if (left <= 0) return `<strong>${esc(labels.over)}</strong>`
  return `${esc(labels.left(left))} · <strong>${esc(labels.until(formatTime(clockIn(new Date(entry.until), timeZone).minutes)))}</strong>`
}

/** A generated break slide with its live line in place of the planned one; every other slide as it is. */
export function withLiveBreak(slide: DeckSlideRef, live: LiveTimes, now: number, timeZone: string, labels: BreakLabels): string {
  const entry = slide.generated === 'break' && slide.itemId ? live[slide.itemId] : undefined
  if (!entry) return slide.html
  return slide.html.replace(/<p class="until">[\s\S]*?<\/p>/, `<p class="until">${breakLine(entry, now, timeZone, labels)}</p>`)
}
