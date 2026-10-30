import { describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import type { Item } from '../src/domain/types.ts'
import type { Op } from '../src/domain/ops.ts'

const item = (workshopId: string, dayId: string | null, position: number, fields: Partial<Item>): Op => ({
  op: 'create',
  entity: 'item',
  record: {
    id: crypto.randomUUID(), workshopId, dayId, position, groupId: null, kind: 'block', title: 'Einheit', description: '', duration: 30, fixedStart: null,
    goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], categoryId: null, color: null, ...fields,
  },
})

describe('workshop list', () => {
  it('gives each workshop its location, number of days and agenda length', () => {
    const repo = new Repo(openDb(':memory:'))
    const ws = repo.createWorkshop({ title: 'Klausur', client: 'Beispiel GmbH', date: '2026-11-12' })
    const id = ws.workshop.id
    const day1 = ws.days[0]
    const day2 = crypto.randomUUID()
    repo.applyOps(id, [
      { op: 'set', entity: 'workshop', id, fields: { location: 'Tagungshaus am See' } },
      { op: 'set', entity: 'day', id: day1.id, fields: { startMin: 9 * 60 } },
      { op: 'create', entity: 'day', record: { id: day2, workshopId: id, position: 2, date: '2026-11-13', startMin: 9 * 60, endMin: null } },
      // Day 1: 30 min, 60 min, then lunch fixed at 12:30 for 60 min: the gap counts, the day runs 09:00–13:30.
      item(id, day1.id, 1, { duration: 30 }),
      item(id, day1.id, 2, { duration: 60 }),
      item(id, day1.id, 3, { kind: 'break', duration: 60, fixedStart: 12 * 60 + 30 }),
      item(id, day1.id, 4, { kind: 'marker', duration: 0 }),
      // Day 2: 90 min. Parked items take no time.
      item(id, day2, 1, { duration: 90 }),
      item(id, null, 1, { duration: 45 }),
    ])
    expect(repo.listWorkshops()[0]).toMatchObject({ location: 'Tagungshaus am See', days: 2, minutes: 4 * 60 + 30 + 90, itemCount: 6 })
  })

  it('counts an empty workshop as nothing planned', () => {
    const repo = new Repo(openDb(':memory:'))
    repo.createWorkshop({ title: 'Leer', date: '2026-11-12' })
    expect(repo.listWorkshops()[0]).toMatchObject({ days: 1, minutes: 0 })
  })
})
