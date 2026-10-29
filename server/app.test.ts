import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import type { ServerEvent } from '../src/domain/ops.ts'
import type { Item, WorkshopState } from '../src/domain/types.ts'

const BASE = 'http://127.0.0.1'
const H = { 'content-type': 'application/json', 'x-sp': '1' }

function setup(opts: { owners?: string[]; publicUrl?: URL } = {}) {
  const repo = new Repo(openDb(':memory:'))
  const hub = new Hub()
  const app = createApp({
    repo,
    hub,
    filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')),
    owners: opts.owners ?? [],
    ownerHeader: 'x-auth-request-email',
    publicUrl: opts.publicUrl,
  })
  return { app, repo, hub }
}

const item = (id: string, workshopId: string, dayId: string | null, over: Partial<Item> = {}): Item => ({
  id,
  workshopId,
  dayId,
  position: 1,
  groupId: null,
  kind: 'block',
  title: id,
  description: '',
  duration: 30,
  fixedStart: null,
  goal: '',
  method: '',
  lead: '',
  notes: '',
  materials: [],
  attachmentIds: [],
  categoryId: null,
  color: null,
  ...over,
})

async function create(app: ReturnType<typeof setup>['app'], title = 'Teamtag'): Promise<WorkshopState> {
  const res = await app.request(`${BASE}/api/workshops`, { method: 'POST', headers: H, body: JSON.stringify({ title, date: '2026-11-10' }) })
  expect(res.status).toBe(201)
  return (await res.json()) as WorkshopState
}

const ops = (app: ReturnType<typeof setup>['app'], id: string, body: unknown) =>
  app.request(`${BASE}/api/workshops/${id}/ops`, { method: 'POST', headers: H, body: JSON.stringify(body) })

describe('guard', () => {
  it('refuses changes without the app header, foreign origins and foreign hosts', async () => {
    const { app } = setup()
    expect((await app.request(`${BASE}/api/workshops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(403)
    expect((await app.request(`${BASE}/api/workshops`, { headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await app.request('http://evil.example/api/workshops')).status).toBe(403)
    expect((await app.request(`${BASE}/api/workshops`)).status).toBe(200)
  })

  it('hosted, requires the login e-mail of an owner', async () => {
    const publicUrl = new URL('https://sessions.example.com')
    const { app } = setup({ owners: ['me@example.com'], publicUrl })
    const url = 'https://sessions.example.com/api/workshops'
    expect((await app.request(url)).status).toBe(401)
    expect((await app.request(url, { headers: { 'x-auth-request-email': 'other@example.com' } })).status).toBe(401)
    expect((await app.request(url, { headers: { 'x-auth-request-email': 'Me@Example.com' } })).status).toBe(200)
  })
})

describe('workshops and operations', () => {
  it('creates a workshop with one day and lists it', async () => {
    const { app } = setup()
    const ws = await create(app)
    expect(ws.days).toHaveLength(1)
    expect(ws.days[0]).toMatchObject({ date: '2026-11-10', startMin: 540, endMin: 1020 })
    const list = await (await app.request(`${BASE}/api/workshops`)).json()
    expect(list[0]).toMatchObject({ title: 'Teamtag', firstDate: '2026-11-10', itemCount: 0 })
  })

  it('applies a batch, passes it to other windows and stores it', async () => {
    const { app, hub } = setup()
    const ws = await create(app)
    const day = ws.days[0].id
    const seen: ServerEvent[] = []
    hub.subscribe(ws.workshop.id, (e) => seen.push(e))
    const res = await ops(app, ws.workshop.id, {
      clientId: 'c1',
      ops: [
        { op: 'create', entity: 'item', record: item('a', ws.workshop.id, day, { materials: [{ id: 'm', label: 'Flipchart', qty: 2 }] }) },
        { op: 'set', entity: 'item', id: 'a', fields: { duration: 45, fixedStart: 600 } },
        { op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { packing: { flipchart: { checked: true } } } },
      ],
    })
    expect(res.status).toBe(200)
    expect(seen[0]).toMatchObject({ type: 'ops', clientId: 'c1' })
    const state = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`)).json()) as WorkshopState
    expect(state.items[0]).toMatchObject({ id: 'a', duration: 45, fixedStart: 600, dayId: day, materials: [{ label: 'Flipchart', qty: 2 }] })
    expect(state.workshop.packing).toEqual({ flipchart: { checked: true } })
  })

  it('parks the items of a deleted day and items sent to a day that is gone', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const day = ws.days[0].id
    await ops(app, id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('a', id, day) }] })
    const res = await ops(app, id, { clientId: 'c', ops: [{ op: 'delete', entity: 'day', id: day }, { op: 'create', entity: 'item', record: item('b', id, day) }] })
    const body = await res.json()
    expect(body.ops[0]).toEqual({ op: 'set', entity: 'item', id: 'a', fields: { dayId: null } })
    const state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.items.map((i) => i.dayId)).toEqual([null, null])
  })

  it('refuses records of another workshop and invalid fields', async () => {
    const { app } = setup()
    const a = await create(app, 'A')
    const b = await create(app, 'B')
    await ops(app, a.workshop.id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('x', a.workshop.id, null) }] })
    expect((await ops(app, b.workshop.id, { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'x', fields: { title: 'stolen' } }] })).status).toBe(400)
    expect((await ops(app, b.workshop.id, { clientId: 'c', ops: [{ op: 'set', entity: 'day', id: a.days[0].id, fields: { startMin: 1 } }] })).status).toBe(400)
    expect((await ops(app, a.workshop.id, { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'x', fields: { secret: 1 } }] })).status).toBe(400)
    const badLink = { materials: [{ id: 'm', label: 'x', qty: 1, link: 'javascript:alert(1)' }] }
    expect((await ops(app, a.workshop.id, { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'x', fields: badLink }] })).status).toBe(400)
  })

  it('ignores changes to records that are gone', async () => {
    const { app } = setup()
    const ws = await create(app)
    const res = await ops(app, ws.workshop.id, { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'gone', fields: { title: 'x' } }] })
    expect((await res.json()).ops).toEqual([])
  })
})

describe('attachments', () => {
  it('uploads, downloads as attachment only, and unlinks on delete', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const form = new FormData()
    form.append('file', new File(['<script>alert(1)</script>'], 'evil.html', { type: 'text/html' }))
    const up = await app.request(`${BASE}/api/workshops/${id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })
    expect(up.status).toBe(201)
    const att = await up.json()
    await ops(app, id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('a', id, null, { attachmentIds: [att.id] }) }] })

    const down = await app.request(`${BASE}/api/attachments/${att.id}`)
    expect(down.headers.get('content-disposition')).toContain('attachment')
    expect(down.headers.get('content-security-policy')).toBe('sandbox')
    expect(await down.text()).toBe('<script>alert(1)</script>')

    expect((await app.request(`${BASE}/api/attachments/${att.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })).status).toBe(200)
    const state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.attachments).toEqual([])
    expect(state.items[0].attachmentIds).toEqual([])
  })

  it('removes the files with the workshop', async () => {
    const { app } = setup()
    const ws = await create(app)
    const form = new FormData()
    form.append('file', new File(['x'], 'a.txt', { type: 'text/plain' }))
    const att = await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).json()
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })).status).toBe(200)
    expect((await app.request(`${BASE}/api/attachments/${att.id}`)).status).toBe(404)
  })
})

describe('groups', () => {
  it('ungroups the members of a deleted group and parks groups of a deleted day', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const day = ws.days[0].id
    await ops(app, id, {
      clientId: 'c',
      ops: [
        { op: 'create', entity: 'group', record: { id: 'g', workshopId: id, dayId: day, position: 1, title: 'Rollen' } },
        { op: 'create', entity: 'item', record: item('a', id, day, { groupId: 'g' }) },
        { op: 'create', entity: 'item', record: item('b', id, day, { groupId: 'g', position: 2 }) },
      ],
    })
    let state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.groups).toMatchObject([{ id: 'g', title: 'Rollen', dayId: day }])
    expect(state.items.map((i) => i.groupId)).toEqual(['g', 'g'])

    await ops(app, id, { clientId: 'c', ops: [{ op: 'delete', entity: 'day', id: day }] })
    state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.groups[0].dayId).toBeNull()

    const res = await ops(app, id, { clientId: 'c', ops: [{ op: 'delete', entity: 'group', id: 'g' }] })
    expect((await res.json()).ops.filter((o: { fields?: { groupId: null } }) => o.fields?.groupId === null)).toHaveLength(2)
    state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.items.map((i) => i.groupId)).toEqual([null, null])
  })

  it('does not let an item join a group of another workshop', async () => {
    const { app } = setup()
    const a = await create(app, 'A')
    const b = await create(app, 'B')
    await ops(app, a.workshop.id, { clientId: 'c', ops: [{ op: 'create', entity: 'group', record: { id: 'ga', workshopId: a.workshop.id, dayId: null, position: 1, title: '' } }] })
    await ops(app, b.workshop.id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('x', b.workshop.id, null, { groupId: 'ga' }) }] })
    const state = (await (await app.request(`${BASE}/api/workshops/${b.workshop.id}`)).json()) as WorkshopState
    expect(state.items[0].groupId).toBeNull()
  })
})

describe('settings and library', () => {
  it('stores settings and uses the day times for new workshops', async () => {
    const { app } = setup()
    expect((await (await app.request(`${BASE}/api/settings`)).json()).categories.length).toBeGreaterThan(0)
    const put = await app.request(`${BASE}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ categories: [{ id: 'input', name: 'Impuls', color: 'slate' }], dayStart: 510, dayEnd: 960 }) })
    expect(put.status).toBe(200)
    const ws = await create(app)
    expect(ws.days[0]).toMatchObject({ startMin: 510, endMin: 960 })
    const bad = await app.request(`${BASE}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ categories: [{ id: 'x', name: 'x', color: '#ff0000' }], dayStart: 0, dayEnd: null }) })
    expect(bad.status).toBe(400)
  })

  it('accepts image logos only', async () => {
    const { app } = setup()
    const form = (name: string, type: string) => {
      const f = new FormData()
      f.append('file', new File(['x'], name, { type }))
      return f
    }
    expect((await app.request(`${BASE}/api/settings/logo`, { method: 'POST', headers: { 'x-sp': '1' }, body: form('a.html', 'text/html') })).status).toBe(400)
    expect((await app.request(`${BASE}/api/settings/logo`, { method: 'POST', headers: { 'x-sp': '1' }, body: form('a.png', 'image/png') })).status).toBe(200)
    const logo = await app.request(`${BASE}/api/settings/logo`)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect((await (await app.request(`${BASE}/api/settings`)).json()).logo.mime).toBe('image/png')
  })

  it('saves, lists, updates and deletes library entries', async () => {
    const { app } = setup()
    const content = { kind: 'block', title: 'Fishbowl', description: '', duration: 60, goal: '', method: '', lead: '', notes: '', materials: [], categoryId: 'discussion', color: null }
    const res = await app.request(`${BASE}/api/library`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'item', title: 'Fishbowl', data: content }) })
    expect(res.status).toBe(201)
    const entry = await res.json()
    const group = { kind: 'group', title: 'Feedbackrunde', data: { items: [content, { ...content, title: 'Blitzlicht', duration: 10 }] } }
    expect((await app.request(`${BASE}/api/library`, { method: 'POST', headers: H, body: JSON.stringify(group) })).status).toBe(201)
    expect((await app.request(`${BASE}/api/library/${entry.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ kind: 'item', title: 'Fishbowl lang', data: { ...content, duration: 90 } }) })).status).toBe(200)
    const list = await (await app.request(`${BASE}/api/library`)).json()
    expect(list.map((e: { title: string }) => e.title)).toEqual(['Feedbackrunde', 'Fishbowl lang'])
    expect((await app.request(`${BASE}/api/library/${entry.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })).status).toBe(200)
  })
})
