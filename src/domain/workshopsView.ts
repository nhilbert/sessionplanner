import type { WorkshopSummary } from './types.ts'

/**
 * How the list of workshops is ordered (pages/WorkshopsPage.tsx). Time is the order one works in: today divides the
 * list into what is coming, nearest first, and what is over, by year. The client is a second way to look at the same
 * workshops: everything done for one of them, as their history. A search finds both, clients and workshops.
 * Everything here takes "today" as a day (YYYY-MM-DD), so it can be tested.
 */

export type Zone = 'upcoming' | 'undated' | 'past'

const start = (w: WorkshopSummary): string => w.firstDate ?? ''
const end = (w: WorkshopSummary): string => w.lastDate ?? w.firstDate ?? ''

/** A workshop that still runs today is coming: it is what stands next. */
export const zoneOf = (w: WorkshopSummary, today: string): Zone => (!w.firstDate ? 'undated' : end(w) >= today ? 'upcoming' : 'past')

const yearOf = (day: string): number => Number(day.slice(0, 4))
const byTitle = (a: WorkshopSummary, b: WorkshopSummary): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
const soonest = (a: WorkshopSummary, b: WorkshopSummary): number => start(a).localeCompare(start(b)) || byTitle(a, b)
const latest = (a: WorkshopSummary, b: WorkshopSummary): number => start(b).localeCompare(start(a)) || byTitle(a, b)

/** Whole days from one day to another (negative: the other way). */
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((at(to) - at(from)) / 86_400_000)
}

/** How far away a coming workshop is, in the unit one would say it in. */
export type Until = { unit: 'running' | 'today' | 'tomorrow' } | { unit: 'days' | 'weeks' | 'months'; count: number }

export function untilOf(w: WorkshopSummary, today: string): Until | null {
  if (zoneOf(w, today) !== 'upcoming') return null
  const days = daysBetween(today, start(w))
  if (days < 0) return { unit: 'running' }
  if (days === 0) return { unit: 'today' }
  if (days === 1) return { unit: 'tomorrow' }
  if (days < 14) return { unit: 'days', count: days }
  if (days < 60) return { unit: 'weeks', count: Math.round(days / 7) }
  return { unit: 'months', count: Math.round(days / 30) }
}

// ---- clients ---------------------------------------------------------------------------------------------------

/** One client however it was typed: capitals and spaces do not make a second one. */
export const clientKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/** The spelling used most (the first one typed where two are used as often), and how often each client appears. */
function spellings(list: WorkshopSummary[]): Map<string, { name: string; count: number }> {
  const seen = new Map<string, Map<string, number>>()
  for (const w of list) {
    const name = w.client.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = clientKey(name)
    const names = seen.get(key) ?? new Map<string, number>()
    names.set(name, (names.get(name) ?? 0) + 1)
    seen.set(key, names)
  }
  const out = new Map<string, { name: string; count: number }>()
  for (const [key, names] of seen) {
    let best = ''
    let most = 0
    let count = 0
    for (const [name, n] of names) {
      count += n
      if (n > most) [best, most] = [name, n]
    }
    out.set(key, { name: best, count })
  }
  return out
}

/** The clients there are, the most used first: what a client's field suggests. */
export function clientNames(list: WorkshopSummary[]): string[] {
  return [...spellings(list).values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((c) => c.name)
}

// ---- by time ---------------------------------------------------------------------------------------------------

export interface YearSection {
  year: number
  /** Newest first. */
  workshops: WorkshopSummary[]
  /** Workshop days of the year, summed. */
  days: number
  /** For whom, the most workshops first: what a folded year says about itself. */
  clients: { name: string; count: number }[]
}

export interface TimeView {
  /** What stands next: the nearest coming workshop, a running one before the others. */
  next: WorkshopSummary | null
  /** The other coming ones, nearest first. */
  planned: WorkshopSummary[]
  undated: WorkshopSummary[]
  /** What is over, the latest year first. */
  years: YearSection[]
  past: number
}

export function timeView(list: WorkshopSummary[], today: string): TimeView {
  const upcoming = list.filter((w) => zoneOf(w, today) === 'upcoming').sort(soonest)
  const undated = list.filter((w) => zoneOf(w, today) === 'undated').sort(byTitle)
  const past = list.filter((w) => zoneOf(w, today) === 'past').sort(latest)
  const names = spellings(list)
  const years: YearSection[] = []
  for (const w of past) {
    const year = yearOf(start(w))
    let section = years[years.length - 1]
    if (!section || section.year !== year) years.push((section = { year, workshops: [], days: 0, clients: [] }))
    section.workshops.push(w)
    section.days += w.days
  }
  for (const section of years) {
    const counts = new Map<string, number>()
    for (const w of section.workshops) if (w.client.trim()) counts.set(clientKey(w.client), (counts.get(clientKey(w.client)) ?? 0) + 1)
    section.clients = [...counts].map(([key, count]) => ({ name: names.get(key)?.name ?? key, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }
  return { next: upcoming[0] ?? null, planned: upcoming.slice(1), undated, years, past: past.length }
}

/** The workshops of a year by month (YYYY-MM), in the order they came in. */
export function monthsOf(workshops: WorkshopSummary[]): { month: string; workshops: WorkshopSummary[] }[] {
  const months: { month: string; workshops: WorkshopSummary[] }[] = []
  for (const w of workshops) {
    const month = start(w).slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.month === month) last.workshops.push(w)
    else months.push({ month, workshops: [w] })
  }
  return months
}

// ---- by client -------------------------------------------------------------------------------------------------

/** The workshops of the clients one worked for once, shown together so they do not fill the list of clients. */
export const SINGLES = ':singles'
/** The workshops without a client. */
export const NO_CLIENT = ':none'

export interface ClientGroup {
  /** `clientKey` of the client, or SINGLES or NO_CLIENT. */
  key: string
  /** The client's name; empty for SINGLES and NO_CLIENT, which the page names. */
  name: string
  workshops: WorkshopSummary[]
  /** The nearest coming workshop. */
  next: WorkshopSummary | null
  /** The latest one that is over. */
  last: WorkshopSummary | null
  /** Workshops per year of `ClientsView.years`. */
  perYear: number[]
}

export interface ClientsView {
  /** The years the small bars stand for, oldest first: the last six up to the latest workshop. */
  years: number[]
  /** The clients with several workshops, in the chosen order. */
  clients: ClientGroup[]
  /** How many clients have a single workshop; their workshops are `singles`. */
  singleClients: number
  singles: ClientGroup | null
  none: ClientGroup | null
  /** Every client by its key, those with a single workshop too, and SINGLES and NO_CLIENT. */
  byKey: Map<string, ClientGroup>
  /** The largest number of workshops one client has in one year: the height of a full bar. */
  most: number
}

const YEARS_SHOWN = 6

export function clientsView(list: WorkshopSummary[], today: string, order: 'active' | 'name'): ClientsView {
  const dated = list.filter((w) => w.firstDate).map((w) => yearOf(start(w)))
  const lastYear = Math.max(yearOf(today), ...dated)
  const firstYear = Math.max(lastYear - YEARS_SHOWN + 1, Math.min(lastYear, ...dated))
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i)
  const group = (key: string, name: string, workshops: WorkshopSummary[]): ClientGroup => ({
    key,
    name,
    workshops,
    next: workshops.filter((w) => zoneOf(w, today) === 'upcoming').sort(soonest)[0] ?? null,
    last: workshops.filter((w) => zoneOf(w, today) === 'past').sort(latest)[0] ?? null,
    perYear: years.map((y) => workshops.filter((w) => w.firstDate && yearOf(start(w)) === y).length),
  })
  const names = spellings(list)
  const byKey = new Map<string, ClientGroup>()
  for (const [key, { name }] of names) byKey.set(key, group(key, name, list.filter((w) => clientKey(w.client) === key)))
  const all = [...byKey.values()]
  /** Who one works for now comes first: the clients with a coming workshop, the nearest first; then those last worked for, the latest first. */
  const active = (a: ClientGroup, b: ClientGroup): number => {
    if (a.next || b.next) return a.next && b.next ? soonest(a.next, b.next) : a.next ? -1 : 1
    return (b.last ? start(b.last) : '').localeCompare(a.last ? start(a.last) : '')
  }
  const clients = all
    .filter((g) => g.workshops.length > 1)
    .sort((a, b) => (order === 'active' ? active(a, b) : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  const once = all.filter((g) => g.workshops.length === 1)
  const singles = once.length ? group(SINGLES, '', once.flatMap((g) => g.workshops)) : null
  const unnamed = list.filter((w) => !w.client.trim())
  const none = unnamed.length ? group(NO_CLIENT, '', unnamed) : null
  if (singles) byKey.set(SINGLES, singles)
  if (none) byKey.set(NO_CLIENT, none)
  const most = Math.max(1, ...clients.flatMap((g) => g.perYear))
  return { years, clients, singleClients: once.length, singles, none, byKey, most }
}

// ---- search ----------------------------------------------------------------------------------------------------

const wordsOf = (query: string): string[] => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)

export interface SearchView {
  /** Clients whose name holds every word, the most workshops first. */
  clients: ClientGroup[]
  /** Workshops that hold every word in their title, client, place or year; newest first, those without a date last. */
  workshops: WorkshopSummary[]
}

/** What a search finds; null while nothing is typed. */
export function searchView(list: WorkshopSummary[], today: string, query: string): SearchView | null {
  const words = wordsOf(query)
  if (!words.length) return null
  const holds = (text: string) => words.every((w) => text.toLocaleLowerCase().includes(w))
  const workshops = list.filter((w) => holds([w.title, w.client, w.location, w.firstDate ? yearOf(w.firstDate) : ''].join(' '))).sort((a, b) => (a.firstDate ? (b.firstDate ? latest(a, b) : -1) : b.firstDate ? 1 : byTitle(a, b)))
  const view = clientsView(list, today, 'name')
  const clients = [...view.byKey.values()].filter((g) => g.name && holds(g.name)).sort((a, b) => b.workshops.length - a.workshops.length || a.name.localeCompare(b.name))
  return { clients, workshops }
}
