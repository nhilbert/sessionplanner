import { describe, expect, it } from 'vitest'
import type { WorkshopSummary } from './types.ts'
import { clientKey, clientNames, clientsView, daysBetween, monthsOf, NO_CLIENT, searchView, SINGLES, timeView, untilOf, zoneOf } from './workshopsView.ts'

const today = '2026-11-19'

const w = (title: string, client: string, firstDate: string | null, more: Partial<WorkshopSummary> = {}): WorkshopSummary => ({
  id: title,
  title,
  client,
  location: '',
  archived: false,
  firstDate,
  lastDate: firstDate,
  itemCount: 0,
  days: 1,
  minutes: 420,
  createdAt: '',
  updatedAt: '',
  ...more,
})

const strategy = w('Strategietag', 'Musterwerk GmbH', '2026-11-24', { lastDate: '2026-11-25', days: 2, location: 'Eichenhof' })
const team = w('Teamtag', 'Klinikum Musterstadt', '2026-11-27')
const kickoff = w('Jahresauftakt', 'Stadtwerke Beispielstadt', '2027-01-14')
const draft = w('Moderationstraining', 'Volkshochschule Neudorf', null, { lastDate: null })
const retreat = w('Klausur', 'Stadtwerke Beispielstadt', '2026-11-12', { lastDate: '2026-11-13', days: 2 })
const roles = w('Rollenklärung', 'musterwerk gmbh', '2026-04-21')
const retro = w('Retrospektive', 'Musterwerk GmbH', '2025-09-16', { location: 'online' })
const mission = w('Leitbild', 'Musterwerk  GmbH', '2025-03-04')
const open = w('Open Space', '', '2024-06-18')
const all = [retro, kickoff, open, strategy, draft, roles, team, mission, retreat]

describe('the zone of a workshop', () => {
  it('is coming from today on, over before it, and without a date apart', () => {
    expect(zoneOf(strategy, today)).toBe('upcoming')
    expect(zoneOf(retreat, today)).toBe('past')
    expect(zoneOf(draft, today)).toBe('undated')
    expect(zoneOf(w('Heute', '', today), today)).toBe('upcoming')
  })

  it('keeps a workshop that still runs among the coming ones', () => {
    const running = w('Läuft', '', '2026-11-18', { lastDate: '2026-11-19', days: 2 })
    expect(zoneOf(running, today)).toBe('upcoming')
    expect(untilOf(running, today)).toEqual({ unit: 'running' })
    expect(zoneOf(running, '2026-11-20')).toBe('past')
  })
})

describe('how far away a workshop is', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-11-19', '2026-11-24')).toBe(5)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2) // over the change to summer time
    expect(daysBetween('2026-11-24', '2026-11-19')).toBe(-5)
  })

  it('says it in the unit one would use', () => {
    expect(untilOf(w('a', '', today), today)).toEqual({ unit: 'today' })
    expect(untilOf(w('a', '', '2026-11-20'), today)).toEqual({ unit: 'tomorrow' })
    expect(untilOf(strategy, today)).toEqual({ unit: 'days', count: 5 })
    expect(untilOf(w('a', '', '2026-12-03'), today)).toEqual({ unit: 'weeks', count: 2 })
    expect(untilOf(kickoff, today)).toEqual({ unit: 'weeks', count: 8 })
    expect(untilOf(w('a', '', '2027-03-18'), today)).toEqual({ unit: 'months', count: 4 })
    expect(untilOf(retreat, today)).toBeNull()
    expect(untilOf(draft, today)).toBeNull()
  })
})

describe('the list by time', () => {
  const view = timeView(all, today)

  it('puts the nearest coming workshop first and the others after it, nearest first', () => {
    expect(view.next).toBe(strategy)
    expect(view.planned).toEqual([team, kickoff])
    expect(view.undated).toEqual([draft])
  })

  it('orders what is over by year, the latest first, each year newest first', () => {
    expect(view.years.map((y) => y.year)).toEqual([2026, 2025, 2024])
    expect(view.years[0].workshops).toEqual([retreat, roles])
    expect(view.years[1].workshops).toEqual([retro, mission])
    expect(view.past).toBe(5)
  })

  it('says of a year how many days it held and for whom', () => {
    expect(view.years[0].days).toBe(3)
    expect(view.years[1].clients).toEqual([{ name: 'Musterwerk GmbH', count: 2 }])
    expect(view.years[2].clients).toEqual([])
  })

  it('has nothing next when nothing is coming', () => {
    const over = timeView([retreat, draft], today)
    expect(over.next).toBeNull()
    expect(over.planned).toEqual([])
  })

  it('cuts a year into its months', () => {
    expect(monthsOf(view.years[0].workshops).map((m) => [m.month, m.workshops.length])).toEqual([
      ['2026-11', 1],
      ['2026-04', 1],
    ])
  })
})

describe('the clients', () => {
  it('are one however they were typed, under the spelling used most', () => {
    expect(clientKey('  Musterwerk   GmbH ')).toBe(clientKey('musterwerk gmbh'))
    expect(clientNames(all)).toEqual(['Musterwerk GmbH', 'Stadtwerke Beispielstadt', 'Klinikum Musterstadt', 'Volkshochschule Neudorf'])
  })

  const view = clientsView(all, today, 'active')

  it('lists those with several workshops: who has a workshop coming first, the nearest before the others, then who was last worked for', () => {
    expect(view.clients.map((c) => c.name)).toEqual(['Musterwerk GmbH', 'Stadtwerke Beispielstadt'])
    const more = [...all, w('Supervision', 'Schule am Hafen', '2026-10-01'), w('Supervision 2', 'Schule am Hafen', '2026-02-01'), w('Alt', 'Brauerei Beispiel', '2023-05-01'), w('Älter', 'Brauerei Beispiel', '2022-05-01')]
    expect(clientsView(more, today, 'active').clients.map((c) => c.name)).toEqual(['Musterwerk GmbH', 'Stadtwerke Beispielstadt', 'Schule am Hafen', 'Brauerei Beispiel'])
    expect(clientsView(all, today, 'name').clients.map((c) => c.name)).toEqual(['Musterwerk GmbH', 'Stadtwerke Beispielstadt'])
  })

  it('knows of each what comes next and what was last', () => {
    const musterwerk = view.byKey.get(clientKey('Musterwerk GmbH'))!
    expect(musterwerk.workshops).toHaveLength(4)
    expect(musterwerk.next).toBe(strategy)
    expect(musterwerk.last).toBe(roles)
  })

  it('counts the workshops per year for the last six years up to the latest workshop', () => {
    expect(view.years).toEqual([2024, 2025, 2026, 2027])
    expect(view.byKey.get(clientKey('Musterwerk GmbH'))!.perYear).toEqual([0, 2, 2, 0])
    expect(view.most).toBe(2)
    const long = clientsView([w('alt', 'A', '2015-01-01'), w('neu', 'A', '2026-01-01')], today, 'name')
    expect(long.years).toEqual([2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('gathers the clients with a single workshop, and the workshops without a client', () => {
    expect(view.singleClients).toBe(2)
    expect(view.singles?.workshops.map((x) => x.title).sort()).toEqual(['Moderationstraining', 'Teamtag'])
    expect(view.none?.workshops).toEqual([open])
    expect(view.byKey.get(SINGLES)).toBe(view.singles)
    expect(view.byKey.get(NO_CLIENT)).toBe(view.none)
    // one of them can still be opened by its name
    expect(view.byKey.get(clientKey('Klinikum Musterstadt'))?.workshops).toEqual([team])
  })

  it('stands without them where there are none', () => {
    const plain = clientsView([strategy, roles], today, 'name')
    expect(plain.singles).toBeNull()
    expect(plain.none).toBeNull()
  })
})

describe('the search', () => {
  it('finds nothing while nothing is typed', () => {
    expect(searchView(all, today, '  ')).toBeNull()
  })

  it('finds clients by their name, the one with the most workshops first', () => {
    const found = searchView(all, today, 'werk')!
    expect(found.clients.map((c) => c.name)).toEqual(['Musterwerk GmbH', 'Stadtwerke Beispielstadt'])
  })

  it('finds workshops by title, client, place and year, every word somewhere, newest first', () => {
    expect(searchView(all, today, 'beispielstadt')!.workshops).toEqual([kickoff, retreat])
    expect(searchView(all, today, 'musterwerk 2025')!.workshops).toEqual([retro, mission])
    expect(searchView(all, today, 'eichenhof')!.workshops).toEqual([strategy])
    expect(searchView(all, today, 'ONLINE')!.workshops).toEqual([retro])
    expect(searchView(all, today, 'nichts davon')).toEqual({ clients: [], workshops: [] })
  })

  it('puts workshops without a date last', () => {
    expect(searchView(all, today, 'tag')!.workshops).toEqual([team, strategy])
    expect(searchView([draft, retro, w('Training', '', '2026-01-10')], today, 'r')!.workshops.map((x) => x.title)).toEqual(['Training', 'Retrospektive', 'Moderationstraining'])
  })
})
