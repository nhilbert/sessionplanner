import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp, MAX_FILE } from './app.ts'
import { adjustedOps, type Op, type ServerEvent } from '../src/domain/ops.ts'
import type { Item, WorkshopState } from '../src/domain/types.ts'

const BASE = 'http://127.0.0.1'
const H = { 'content-type': 'application/json', 'x-sp': '1' }

function setup(opts: { owners?: string[]; publicUrl?: URL; staticDir?: string; db?: DatabaseSync; linkToken?: string } = {}) {
  const db = opts.db ?? openDb(':memory:')
  const repo = new Repo(db)
  const hub = new Hub()
  const app = createApp({
    repo,
    hub,
    filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')),
    owners: opts.owners ?? [],
    ownerHeader: 'x-auth-request-email',
    publicUrl: opts.publicUrl,
    staticDir: opts.staticDir,
    linkToken: opts.linkToken,
  })
  return { app, repo, hub, db }
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
    // signed in, but not the owner: a guest who sees only what is shared with them (here: nothing)
    const guest = await app.request(url, { headers: { 'x-auth-request-email': 'other@example.com' } })
    expect(guest.status).toBe(200)
    expect(await guest.json()).toEqual([])
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

  it('echoes a batch so that nothing counts as adjusted, and marks what it did adjust', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const day = ws.days[0].id
    const sent: Op[] = [
      { op: 'create', entity: 'item', record: item('a', id, day) },
      // the fields in an order of the browser's choosing, not the schema's
      { op: 'set', entity: 'item', id: 'a', fields: { groupId: null, position: 2, dayId: day } },
    ]
    const echoed = ((await (await ops(app, id, { clientId: 'c', ops: sent })).json()) as { ops: Op[] }).ops
    expect(echoed).toHaveLength(2)
    expect(adjustedOps(sent, echoed)).toEqual([])
    const parked: Op[] = [{ op: 'create', entity: 'item', record: item('b', id, 'gone-day') }]
    const stored = ((await (await ops(app, id, { clientId: 'c', ops: parked })).json()) as { ops: Op[] }).ops
    expect(adjustedOps(parked, stored)).toMatchObject([{ op: 'create', record: { id: 'b', dayId: null } }])
  })

  it('refuses dates that are not calendar dates', async () => {
    const { app } = setup()
    const post = (date: string) => app.request(`${BASE}/api/workshops`, { method: 'POST', headers: H, body: JSON.stringify({ date }) })
    expect((await post('2026-99-99')).status).toBe(400)
    expect((await post('2026-02-29')).status).toBe(400)
    expect((await post('2028-02-29')).status).toBe(201)
    const ws = await create(app)
    const id = ws.workshop.id
    expect((await ops(app, id, { clientId: 'c', ops: [{ op: 'set', entity: 'day', id: ws.days[0].id, fields: { date: '2026-13-01' } }] })).status).toBe(400)
    expect((await ops(app, id, { clientId: 'c', ops: [{ op: 'create', entity: 'day', record: { id: 'd2', workshopId: id, position: 2, date: '2026-04-31', startMin: 540, endMin: null } }] })).status).toBe(400)
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

  it('keeps only a well-formed media type, as sent or as stored', async () => {
    const { app, db } = setup()
    const ws = await create(app)
    const upload = async (type: string) => {
      const form = new FormData()
      form.append('file', new File(['x'], 'a.bin', { type }))
      return (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).json()) as { id: string; mime: string }
    }
    expect((await upload('application/pdf')).mime).toBe('application/pdf')
    expect((await upload('text/plain; charset="utf-8"')).mime).toBe('text/plain; charset="utf-8"')
    expect((await upload('')).mime).toBe('application/octet-stream')
    const odd = await upload('text/plain; charset=utf-8; ' + 'x'.repeat(5000))
    expect(odd.mime).toBe('application/octet-stream')
    // stored before the check
    db.prepare('UPDATE attachments SET mime = ? WHERE id = ?').run('text/html; ' + 'y'.repeat(300), odd.id)
    expect((await app.request(`${BASE}/api/attachments/${odd.id}`)).headers.get('content-type')).toBe('application/octet-stream')
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

describe('duplicate', () => {
  it('copies days (moved), groups, items and files, with fresh ids and an unticked packing list', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const day = ws.days[0].id
    const form = new FormData()
    form.append('file', new File(['handout'], 'handout.pdf', { type: 'application/pdf' }))
    const att = await (await app.request(`${BASE}/api/workshops/${id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).json()
    await ops(app, id, {
      clientId: 'c',
      ops: [
        { op: 'create', entity: 'day', record: { id: 'd2', workshopId: id, position: 2, date: '2026-11-11', startMin: 540, endMin: 1020 } },
        { op: 'create', entity: 'group', record: { id: 'g', workshopId: id, dayId: day, position: 1, title: 'Einstieg' } },
        { op: 'create', entity: 'item', record: item('a', id, day, { groupId: 'g', attachmentIds: [att.id] }) },
        { op: 'create', entity: 'item', record: item('b', id, 'd2') },
        { op: 'set', entity: 'workshop', id, fields: { packing: { flipchart: { checked: true, qty: 3 } } } },
      ],
    })
    const res = await app.request(`${BASE}/api/workshops/${id}/duplicate`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'Teamtag 2', firstDate: '2027-03-01' }) })
    expect(res.status).toBe(201)
    const copy = (await res.json()) as WorkshopState
    expect(copy.workshop.title).toBe('Teamtag 2')
    expect(copy.days.map((d) => d.date)).toEqual(['2027-03-01', '2027-03-02'])
    expect(copy.groups[0].title).toBe('Einstieg')
    const a = copy.items.find((i) => i.title === 'a')!
    expect(a.id).not.toBe('a')
    expect(a.groupId).toBe(copy.groups[0].id)
    expect(a.dayId).toBe(copy.days[0].id)
    expect(copy.workshop.packing).toEqual({ flipchart: { checked: false, qty: 3 } })
    expect(await (await app.request(`${BASE}/api/attachments/${a.attachmentIds[0]}`)).text()).toBe('handout')
    // the original is untouched
    const orig = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(orig.items.map((i) => i.id).sort()).toEqual(['a', 'b'])
  })
})

describe('duplicate dates', () => {
  it('refuses a first date that is not a calendar date, and leaves a stored date it cannot shift as it is', async () => {
    const { app, db } = setup()
    const ws = await create(app)
    const dup = (firstDate: string) => app.request(`${BASE}/api/workshops/${ws.workshop.id}/duplicate`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'copy', firstDate }) })
    expect((await dup('2027-99-99')).status).toBe(400)
    // older data, stored before the API checked calendar dates
    db.prepare('UPDATE days SET date = ? WHERE id = ?').run('2026-99-99', ws.days[0].id)
    const res = await dup('2027-03-01')
    expect(res.status).toBe(201)
    expect(((await res.json()) as WorkshopState).days[0].date).toBe('2026-99-99')
  })

  it('answers a missing or malformed body with 400, not 500', async () => {
    const { app } = setup()
    const ws = await create(app)
    const post = (path: string, body?: string) => app.request(`${BASE}${path}`, { method: 'POST', headers: H, body })
    expect((await post(`/api/workshops/${ws.workshop.id}/duplicate`)).status).toBe(400)
    expect((await post(`/api/workshops/${ws.workshop.id}/ops`, '{not json')).status).toBe(400)
    expect((await post('/api/library', '')).status).toBe(400)
  })
})

describe('member addresses', () => {
  it('answers 400, not 500, for an address the path cannot carry, and decodes only once', async () => {
    const { app } = setup()
    const ws = await create(app)
    const put = (raw: string) => app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${raw}`, { method: 'PUT', headers: H, body: JSON.stringify({ role: 'view', showNotes: false }) })
    expect((await put('a%25zz%40example.com')).status).toBe(400) // "%zz" is no percent sequence
    expect((await put('a%2540example.com')).status).toBe(400) // encoded twice is not an address
    const ok = await put(encodeURIComponent('User+Tag@Example.com'))
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { email: string }).email).toBe('user+tag@example.com')
  })
})

describe('built UI', () => {
  it('sends the content-security policy with every HTML page and with nothing else', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-dist-'))
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Session Planner</title>')
    writeFileSync(path.join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const { app } = setup({ staticDir: dir })
    for (const p of ['/', '/index.html', '/w/abc', '/settings']) {
      const res = await app.request(`${BASE}${p}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    }
    expect((await app.request(`${BASE}/favicon.svg`)).headers.get('content-security-policy')).toBeNull()
    expect((await app.request(`${BASE}/api/health`)).headers.get('content-security-policy')).toBeNull()
    expect((await app.request(`${BASE}/assets/old-build.js`)).status).toBe(404)
  })
})

describe('request bodies', () => {
  const big = (bytes: number) => 'x'.repeat(bytes)
  it('refuses JSON over a megabyte on every route, while uploads and operation batches keep their room', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const put = await app.request(`${BASE}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ categories: [{ id: 'a', name: big(1.5 * 1024 * 1024), color: 'slate' }], dayStart: 540, dayEnd: null }) })
    expect(put.status).toBe(413)
    expect(await put.json()).toEqual({ error: 'too_large' })
    expect((await app.request(`${BASE}/api/library`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'item', title: big(1.5 * 1024 * 1024), data: {} }) })).status).toBe(413)
    // 15 items with 100 kB of notes each: 1.5 MB, within the 4 MB of a batch
    const batch = { clientId: 'c', ops: Array.from({ length: 15 }, (_, i) => ({ op: 'create', entity: 'item', record: item(`n${i}`, id, ws.days[0].id, { notes: big(100_000) }) })) }
    expect((await ops(app, id, batch)).status).toBe(200)
    const upload = async (bytes: number) => {
      const form = new FormData()
      form.append('file', new File([new Uint8Array(bytes)], 'f.bin', { type: 'application/octet-stream' }))
      return (await app.request(`${BASE}/api/workshops/${id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).status
    }
    expect(await upload(2 * 1024 * 1024)).toBe(201)
    expect(await upload(MAX_FILE + 1)).toBe(413)
  })
})

describe('caching', () => {
  it('marks API answers as not to be stored, while the logo keeps its own short cache', async () => {
    const { app } = setup()
    const ws = await create(app)
    for (const p of ['/api/workshops', `/api/workshops/${ws.workshop.id}`, '/api/settings', '/api/me', '/api/health']) {
      expect((await app.request(`${BASE}${p}`)).headers.get('cache-control')).toBe('no-store')
    }
    const form = new FormData()
    form.append('file', new File(['x'], 'a.png', { type: 'image/png' }))
    await app.request(`${BASE}/api/settings/logo`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })
    expect((await app.request(`${BASE}/api/settings/logo`)).headers.get('cache-control')).toBe('private, max-age=300')
  })
})

describe('link list for the CRM', () => {
  const pub = 'https://sessions.example.com'
  const TOKEN = 'a'.repeat(64)
  const link = (app: ReturnType<typeof setup>['app'], headers: Record<string, string> = {}) => app.request(`${pub}/api/link/workshops`, { headers })

  it('answers only with its own token, with id, title, client and dates and nothing else', async () => {
    const { app } = setup({ owners: ['me@example.com'], publicUrl: new URL(pub), linkToken: TOKEN })
    const owner = { 'x-auth-request-email': 'me@example.com', 'x-sp': '1', 'content-type': 'application/json' }
    await app.request(`${pub}/api/workshops`, { method: 'POST', headers: owner, body: JSON.stringify({ title: 'Teamtag', client: 'Beispiel GmbH', date: '2026-11-10' }) })
    expect((await link(app)).status).toBe(401)
    expect((await link(app, { authorization: `Bearer ${'b'.repeat(64)}` })).status).toBe(401)
    expect((await link(app, { authorization: TOKEN })).status).toBe(401)
    expect((await link(app, { authorization: 'Bearer' })).status).toBe(401)
    // The signed-in owner's header is no substitute for the token
    expect((await link(app, { 'x-auth-request-email': 'me@example.com' })).status).toBe(401)
    // The scheme is case-insensitive (RFC 6750), as some HTTP clients send it
    expect((await link(app, { authorization: `bearer ${TOKEN}` })).status).toBe(200)
    const res = await link(app, { authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const list = (await res.json()) as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(Object.keys(list[0]).sort()).toEqual(['archived', 'client', 'firstDate', 'id', 'lastDate', 'title'])
    expect(list[0]).toMatchObject({ title: 'Teamtag', firstDate: '2026-11-10', lastDate: '2026-11-10' })
  })

  it('does not exist without a configured token, and the token opens nothing else', async () => {
    const off = setup({ owners: ['me@example.com'], publicUrl: new URL(pub) })
    expect((await link(off.app, { authorization: `Bearer ${TOKEN}` })).status).toBe(401)
    const { app } = setup({ owners: ['me@example.com'], publicUrl: new URL(pub), linkToken: TOKEN })
    for (const p of ['/api/workshops', '/api/settings', '/api/me', '/api/link/other']) {
      expect((await app.request(`${pub}${p}`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(401)
    }
    expect((await app.request(`${pub}/api/link/workshops`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'x-sp': '1' } })).status).toBe(401)
  })
})

describe('guests', () => {
  const pub = 'https://sessions.example.com'
  const hosted = () => setup({ owners: ['me@example.com'], publicUrl: new URL(pub) })
  const as = (email: string, extra: Record<string, string> = {}) => ({ 'x-auth-request-email': email, 'x-sp': '1', 'content-type': 'application/json', ...extra })
  const OWNER = as('me@example.com')
  const ANNA = as('anna@example.com')
  const BEN = as('ben@example.com')

  async function prepared() {
    const { app, hub } = hosted()
    const ws = (await (await app.request(`${pub}/api/workshops`, { method: 'POST', headers: OWNER, body: JSON.stringify({ title: 'Geteilt' }) })).json()) as WorkshopState
    const other = (await (await app.request(`${pub}/api/workshops`, { method: 'POST', headers: OWNER, body: JSON.stringify({ title: 'Privat' }) })).json()) as WorkshopState
    const id = ws.workshop.id
    await app.request(`${pub}/api/workshops/${id}/ops`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({
        clientId: 'c',
        ops: [
          { op: 'create', entity: 'item', record: item('a', id, ws.days[0].id, { notes: 'internal hint' }) },
          { op: 'create', entity: 'item', record: item('n', id, ws.days[0].id, { kind: 'note', title: 'cue', duration: 0 }) },
          { op: 'set', entity: 'workshop', id, fields: { notes: 'internal' } },
        ],
      }),
    })
    return { app, hub, id, otherId: other.workshop.id }
  }
  const share = (app: ReturnType<typeof setup>['app'], id: string, email: string, role: string, showNotes: boolean, headers = OWNER) =>
    app.request(`${pub}/api/workshops/${id}/members/${encodeURIComponent(email)}`, { method: 'PUT', headers, body: JSON.stringify({ role, showNotes }) })

  it('see only the workshops shared with them, and nothing else exists for them', async () => {
    const { app, id, otherId } = await prepared()
    expect((await share(app, id, 'Anna@Example.com', 'view', false)).status).toBe(200)
    const list = await (await app.request(`${pub}/api/workshops`, { headers: ANNA })).json()
    expect(list.map((w: { id: string }) => w.id)).toEqual([id])
    expect((await app.request(`${pub}/api/workshops/${otherId}`, { headers: ANNA })).status).toBe(404)
    expect((await app.request(`${pub}/api/workshops/${id}`, { headers: BEN })).status).toBe(404)
    expect((await app.request(`${pub}/api/workshops/${otherId}/events`, { headers: ANNA })).status).toBe(404)
  })

  it('without the notes get neither notes nor note items; edit guests get everything', async () => {
    const { app, id } = await prepared()
    await share(app, id, 'anna@example.com', 'view', false)
    await share(app, id, 'ben@example.com', 'edit', false)
    const view = (await (await app.request(`${pub}/api/workshops/${id}`, { headers: ANNA })).json()) as WorkshopState
    expect(view.access).toEqual({ role: 'view', showNotes: false })
    expect(view.workshop.notes).toBe('')
    expect(view.items.map((i) => [i.id, i.notes])).toEqual([['a', '']])
    const edit = (await (await app.request(`${pub}/api/workshops/${id}`, { headers: BEN })).json()) as WorkshopState
    expect(edit.access).toEqual({ role: 'edit', showNotes: true })
    expect(edit.items.length).toBe(2)
  })

  it('may change the agenda only with edit access, and never archive or delete', async () => {
    const { app, id } = await prepared()
    await share(app, id, 'anna@example.com', 'view', true)
    await share(app, id, 'ben@example.com', 'edit', false)
    const change = (headers: Record<string, string>, fields: object) =>
      app.request(`${pub}/api/workshops/${id}/ops`, { method: 'POST', headers, body: JSON.stringify({ clientId: 'g', ops: [{ op: 'set', entity: 'item', id: 'a', fields }] }) })
    expect((await change(ANNA, { duration: 90 })).status).toBe(403)
    expect((await change(BEN, { duration: 90 })).status).toBe(200)
    const archive = await app.request(`${pub}/api/workshops/${id}/ops`, { method: 'POST', headers: BEN, body: JSON.stringify({ clientId: 'g', ops: [{ op: 'set', entity: 'workshop', id, fields: { archived: true } }] }) })
    expect(archive.status).toBe(403)
    expect((await app.request(`${pub}/api/workshops/${id}`, { method: 'DELETE', headers: BEN })).status).toBe(403)
    expect((await app.request(`${pub}/api/workshops/${id}/duplicate`, { method: 'POST', headers: BEN, body: JSON.stringify({ title: 'x' }) })).status).toBe(403)
  })

  it('cannot manage access, settings or the library', async () => {
    const { app, id } = await prepared()
    await share(app, id, 'ben@example.com', 'edit', true)
    expect((await share(app, id, 'eve@example.com', 'edit', true, BEN)).status).toBe(403)
    expect((await app.request(`${pub}/api/workshops/${id}/members`, { headers: BEN })).status).toBe(403)
    expect((await app.request(`${pub}/api/settings`, { method: 'PUT', headers: BEN, body: JSON.stringify({ categories: [], dayStart: 0, dayEnd: null }) })).status).toBe(403)
    expect((await app.request(`${pub}/api/library`, { headers: BEN })).status).toBe(403)
    expect((await app.request(`${pub}/api/workshops`, { method: 'POST', headers: BEN, body: '{}' })).status).toBe(403)
    expect((await app.request(`${pub}/api/settings`, { headers: BEN })).status).toBe(200)
  })

  it('lose access at once when removed, also on an open live-update stream', async () => {
    const { app, hub, id } = await prepared()
    await share(app, id, 'anna@example.com', 'view', false)
    const events: string[] = []
    hub.subscribe(id, (e) => events.push(e.type))
    expect((await app.request(`${pub}/api/workshops/${id}/members/anna%40example.com`, { method: 'DELETE', headers: OWNER })).status).toBe(200)
    expect(events).toContain('members-changed')
    expect((await app.request(`${pub}/api/workshops/${id}`, { headers: ANNA })).status).toBe(404)
  })

  it('reach files only of workshops shared with them', async () => {
    const { app, id, otherId } = await prepared()
    await share(app, id, 'anna@example.com', 'view', false)
    const upload = async (wid: string) => {
      const form = new FormData()
      form.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }))
      return (await (await app.request(`${pub}/api/workshops/${wid}/attachments`, { method: 'POST', headers: { 'x-auth-request-email': 'me@example.com', 'x-sp': '1' }, body: form })).json()).id
    }
    const mine = await upload(otherId)
    const shared = await upload(id)
    expect((await app.request(`${pub}/api/attachments/${shared}`, { headers: ANNA })).status).toBe(200)
    expect((await app.request(`${pub}/api/attachments/${mine}`, { headers: ANNA })).status).toBe(404)
    expect((await app.request(`${pub}/api/attachments/${shared}`, { method: 'DELETE', headers: ANNA })).status).toBe(403)
  })
})

describe('people to share with', () => {
  it('lists the allow-list (without owners) and everyone shared with, for the owner only', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-guests-'))
    const file = path.join(dir, 'guests.txt')
    writeFileSync(file, '# comment\nme@example.com\nAnna@Example.com\nnot-an-address\n')
    const repo = new Repo(openDb(':memory:'))
    const app = createApp({ repo, hub: new Hub(), filesDir: dir, owners: ['me@example.com'], ownerHeader: 'x-auth-request-email', publicUrl: new URL('https://sessions.example.com'), guestsFile: file })
    const pub = 'https://sessions.example.com'
    const owner = { 'x-auth-request-email': 'me@example.com', 'x-sp': '1', 'content-type': 'application/json' }
    const ws = (await (await app.request(`${pub}/api/workshops`, { method: 'POST', headers: owner, body: '{}' })).json()) as WorkshopState
    await app.request(`${pub}/api/workshops/${ws.workshop.id}/members/ben%40example.com`, { method: 'PUT', headers: owner, body: JSON.stringify({ role: 'view', showNotes: false }) })
    const people = await (await app.request(`${pub}/api/people`, { headers: owner })).json()
    expect(people).toEqual([
      { email: 'anna@example.com', allowed: true, workshops: 0 },
      { email: 'ben@example.com', allowed: false, workshops: 1 },
    ])
    expect((await app.request(`${pub}/api/people`, { headers: { 'x-auth-request-email': 'anna@example.com' } })).status).toBe(403)
  })
})
