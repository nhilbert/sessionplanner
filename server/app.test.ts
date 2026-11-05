import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp, PRESENT_HOURS, type QUOTAS } from './app.ts'
import { MAX_ATTACHMENT } from '../src/domain/attachments.ts'
import { decodePng, encodePng } from './cutout.ts'
import type { Op, ServerEvent } from '../src/domain/ops.ts'
import type { Attachment, Item, ItemContent, LibraryEntry, WorkshopState } from '../src/domain/types.ts'

const BASE = 'http://127.0.0.1'
const H = { 'content-type': 'application/json', 'x-sp': '1' }

function setup(opts: { owners?: string[]; publicUrl?: URL; staticDir?: string; db?: DatabaseSync; linkToken?: string; proxySecret?: string; quotas?: Partial<typeof QUOTAS>; pingSeconds?: number } = {}) {
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
    proxySecret: opts.proxySecret,
    quotas: opts.quotas,
    pingSeconds: opts.pingSeconds,
  })
  return { app, repo, hub, db }
}

/** Uploads a small file; the answer of the route (an attachment, or a library entry). */
async function attach(app: ReturnType<typeof setup>['app'], route: string, name: string, text: string, fields: Record<string, string> = {}): Promise<any> {
  const form = new FormData()
  form.append('file', new File([text], name))
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return (await app.request(`${BASE}${route}`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).json()
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
  slides: [],
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

  it('hosted with a proxy secret, trusts the login e-mail only together with it', async () => {
    const secret = 'a'.repeat(64)
    const { app } = setup({ owners: ['me@example.com'], publicUrl: new URL('https://sessions.example.com'), proxySecret: secret, linkToken: 'link-token' })
    const url = 'https://sessions.example.com/api/workshops'
    const me = { 'x-auth-request-email': 'me@example.com' }
    // someone who reaches the port without the proxy can set the e-mail header, but not the secret
    expect((await app.request(url, { headers: me })).status).toBe(403)
    expect((await app.request(url, { headers: { ...me, 'x-sp-proxy-secret': 'b'.repeat(64) } })).status).toBe(403)
    expect((await app.request(url, { headers: { ...me, 'x-sp-proxy-secret': secret } })).status).toBe(200)
    // the health check (from inside the container) and the CRM's link list (its own token) do not need it
    expect((await app.request('https://sessions.example.com/api/health')).status).toBe(200)
    expect((await app.request('https://sessions.example.com/api/link/workshops', { headers: { authorization: 'Bearer link-token' } })).status).toBe(200)
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

  it('passes every batch on as stored, with the sender\'s tag, so each window takes the server\'s version', async () => {
    const { app, hub } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const seen: ServerEvent[] = []
    hub.subscribe(id, (e) => seen.push(e))
    const parked: Op[] = [{ op: 'create', entity: 'item', record: item('b', id, 'gone-day') }]
    const stored = ((await (await ops(app, id, { clientId: 'window.7', ops: parked })).json()) as { ops: Op[] }).ops
    expect(stored).toMatchObject([{ op: 'create', record: { id: 'b', dayId: null } }])
    expect(seen).toEqual([{ type: 'ops', clientId: 'window.7', ops: stored }])
    // A batch that changes nothing (its record is gone) is answered with no ops and passed to nobody.
    const none = ((await (await ops(app, id, { clientId: 'window.8', ops: [{ op: 'set', entity: 'item', id: 'gone', fields: { title: 'x' } }] })).json()) as { ops: Op[] }).ops
    expect(none).toEqual([])
    expect(seen).toHaveLength(1)
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

describe('cut-outs on a dark ground', () => {
  it('serves a cut-out turned over for a dark ground on ?ground=dark, and every other picture as it is', async () => {
    const { app } = setup({ owners: ['me@example.com'] })
    const owner = { 'x-sp': '1', 'x-auth-request-email': 'me@example.com' }
    // paper with a dark square: the upload makes the cut-out
    const w = 40
    const h = 30
    const rgba = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const x = i % w
      const y = (i - x) / w
      rgba.set(x >= 10 && x < 20 && y >= 10 && y < 20 ? [20, 30, 40, 255] : [220, 218, 214, 255], i * 4)
    }
    const form = new FormData()
    form.append('file', new File([encodePng({ width: w, height: h, rgba })], 'ink.png', { type: 'image/png' }))
    const up = (await (await app.request(`${BASE}/api/library/assets`, { method: 'POST', headers: owner, body: form })).json()) as { hash: string; cutout: string | null }
    expect(up.cutout).toBeTruthy()
    const get = async (hash: string, ground?: string) => {
      const res = await app.request(`${BASE}/api/library/assets/${hash}${ground ? `?ground=${ground}` : ''}`, { headers: owner })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      return Buffer.from(await res.arrayBuffer())
    }
    const cut = await get(up.cutout!)
    const dark = await get(up.cutout!, 'dark')
    expect(dark.equals(cut)).toBe(false)
    // the square's ink is light now with its hue kept, its surroundings transparent as before
    const pixel = (png: Buffer, x: number, y: number) => {
      const image = decodePng(png)!
      return [...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]
    }
    const { width, height } = decodePng(dark)!
    const c = pixel(cut, width >> 1, height >> 1)
    const d = pixel(dark, width >> 1, height >> 1)
    expect(Math.max(...c.slice(0, 3))).toBeLessThan(40)
    expect(Math.min(...d.slice(0, 3))).toBe(255 - Math.max(...c.slice(0, 3)))
    expect([d[0] - d[1], d[1] - d[2]]).toEqual([c[0] - c[1], c[1] - c[2]])
    expect(d[3]).toBe(Math.round(((c[3] - 72) / 183) * 255))
    expect(pixel(dark, 0, 0)[3]).toBe(0)
    // the same bytes the second time (kept), the original untouched by the ground, an unknown ground ignored
    expect((await get(up.cutout!, 'dark')).equals(dark)).toBe(true)
    expect((await get(up.hash, 'dark')).equals(await get(up.hash))).toBe(true)
    expect((await get(up.cutout!, 'light')).equals(cut)).toBe(true)
  })
})

describe('attachments', () => {
  it('uploads, downloads as attachment only, and unlinks on delete', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const form = new FormData()
    form.append('file', new File(['<script>alert(1)</script>'], 'evil.svg', { type: 'image/svg+xml' }))
    const up = await app.request(`${BASE}/api/workshops/${id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })
    expect(up.status).toBe(201)
    const att = await up.json()
    await ops(app, id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('a', id, null, { attachmentIds: [att.id] }) }] })

    const down = await app.request(`${BASE}/api/attachments/${att.id}`)
    expect(down.headers.get('content-disposition')).toContain('attachment')
    expect(down.headers.get('content-security-policy')).toBe('sandbox')
    expect(down.headers.get('content-type')).toBe('application/octet-stream')
    expect(down.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await down.text()).toBe('<script>alert(1)</script>')

    expect((await app.request(`${BASE}/api/attachments/${att.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })).status).toBe(200)
    const state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.attachments).toEqual([])
    expect(state.items[0].attachmentIds).toEqual([])
  })

  it('never serves a file as something a page could run or style itself with', async () => {
    const { app } = setup()
    const ws = await create(app)
    for (const [name, type] of [['x.txt', 'text/javascript'], ['x.md', 'text/css'], ['x.svg', 'image/svg+xml'], ['x.pdf', 'application/pdf']]) {
      const form = new FormData()
      form.append('file', new File(['x'], name, { type }))
      const att = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).json()) as { id: string; mime: string }
      expect(att.mime).toBe(type) // listed as what it is
      const down = await app.request(`${BASE}/api/attachments/${att.id}`)
      expect(down.headers.get('content-type')).toBe('application/octet-stream')
      expect(down.headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''${name}`)
    }
  })

  it('keeps only a well-formed media type, as sent or as stored', async () => {
    const { app, db } = setup()
    const ws = await create(app)
    const upload = async (type: string) => {
      const form = new FormData()
      form.append('file', new File(['x'], 'a.pdf', { type }))
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

  it('takes the allowed types up to 5 MB and refuses the rest, whatever the browser calls them', async () => {
    const { app } = setup()
    const ws = await create(app)
    const status = async (name: string, bytes = 1, type = '') => {
      const form = new FormData()
      form.append('file', new File([new Uint8Array(bytes)], name, { type }))
      const res = await app.request(`${BASE}/api/workshops/${ws.workshop.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })
      return res.status
    }
    for (const name of ['a.pdf', 'a.PNG', 'a.jpeg', 'a.docx', 'a.md', 'a.xlsx', 'a.pptx', 'a.csv']) expect(await status(name)).toBe(201)
    for (const name of ['a.exe', 'a.html', 'a.js', 'a.zip', 'a.docm', 'a.pdf.exe', 'noending']) expect(await status(name, 1, 'application/pdf')).toBe(415)
    expect(await status('a.pdf', MAX_ATTACHMENT)).toBe(201)
    expect(await status('a.pdf', MAX_ATTACHMENT + 1)).toBe(413)
  })

  it('renames a file within its type, and replaces it keeping the links; guests may rename but not replace', async () => {
    const { app } = setup()
    const ws = await create(app)
    const id = ws.workshop.id
    const att = await attach(app, `/api/workshops/${id}/attachments`, 'plan.pdf', 'one')
    await ops(app, id, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('a', id, null, { attachmentIds: [att.id] }) }] })
    const rename = (name: string) => app.request(`${BASE}/api/attachments/${att.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ name }) })
    expect(((await (await rename('Ablauf.pdf')).json()) as { name: string }).name).toBe('Ablauf.pdf')
    for (const name of ['Ablauf.exe', 'Ablauf', 'a/b.pdf', '  ']) expect((await rename(name)).status).toBe(400)

    const form = new FormData()
    form.append('file', new File(['two!'], 'plan v2.docx'))
    const replaced = await (await app.request(`${BASE}/api/attachments/${att.id}/file`, { method: 'PUT', headers: { 'x-sp': '1' }, body: form })).json()
    expect(replaced).toMatchObject({ id: att.id, name: 'plan v2.docx', size: 4 })
    expect(await (await app.request(`${BASE}/api/attachments/${att.id}`)).text()).toBe('two!')
    const state = (await (await app.request(`${BASE}/api/workshops/${id}`)).json()) as WorkshopState
    expect(state.items[0].attachmentIds).toEqual([att.id])
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
      form.append('file', new File([new Uint8Array(bytes)], 'f.pdf', { type: 'application/pdf' }))
      return (await app.request(`${BASE}/api/workshops/${id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).status
    }
    expect(await upload(2 * 1024 * 1024)).toBe(201)
    expect(await upload(MAX_ATTACHMENT + 1)).toBe(413)
  })
})

describe('library attachments', () => {
  const entry = async (app: ReturnType<typeof setup>['app'], body: unknown) => (await (await app.request(`${BASE}/api/library`, { method: 'POST', headers: H, body: JSON.stringify(body) })).json()) as LibraryEntry
  const content = (title: string, attachmentIds: string[] = []) => ({ kind: 'block', title, description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds, categoryId: null, color: null })
  const copies = async (app: ReturnType<typeof setup>['app'], entryId: string, workshopId: string) => (await (await app.request(`${BASE}/api/library/${entryId}/copies/${workshopId}`, { method: 'POST', headers: H })).json()) as Record<string, Attachment>

  it('holds files on an entry, under the same rules as a workshop', async () => {
    const { app } = setup()
    const e = await entry(app, { kind: 'item', title: 'Fishbowl', data: content('Fishbowl') })
    const up = await attach(app, `/api/library/${e.id}/attachments`, 'Anleitung.pdf', 'text')
    expect(up.attachments.map((a: { name: string }) => a.name)).toEqual(['Anleitung.pdf'])
    expect(up.data.attachmentIds).toEqual([up.attachments[0].id])
    const down = await app.request(`${BASE}/api/library/attachments/${up.attachments[0].id}`)
    expect(down.headers.get('content-disposition')).toContain('attachment')
    expect(down.headers.get('content-type')).toBe('application/octet-stream')
    expect(await down.text()).toBe('text')
    const form = new FormData()
    form.append('file', new File(['x'], 'a.exe'))
    expect((await app.request(`${BASE}/api/library/${e.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })).status).toBe(415)
    const big = new FormData()
    big.append('file', new File([new Uint8Array(MAX_ATTACHMENT + 1)], 'a.pdf'))
    expect((await app.request(`${BASE}/api/library/${e.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: big })).status).toBe(413)
  })

  it('attaches to one item of a group entry and keeps the files through a save that does not know of them', async () => {
    const { app } = setup()
    const e = await entry(app, { kind: 'group', title: 'Einstieg', data: { items: [content('Ankommen'), content('Check-in')] } })
    const up = await attach(app, `/api/library/${e.id}/attachments`, 'Karten.pdf', 'x', { item: '1' })
    const [first, second] = up.data.items
    expect(first.attachmentIds).toEqual([])
    expect(second.attachmentIds).toEqual([up.attachments[0].id])
    // a save from a window that loaded the entry before the upload
    const saved = (await (await app.request(`${BASE}/api/library/${e.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ kind: 'group', title: 'Start', data: e.data }) })).json()) as LibraryEntry & { data: { items: ItemContent[] } }
    expect(saved.title).toBe('Start')
    expect(saved.data.items[1].attachmentIds).toEqual([up.attachments[0].id])
    expect(saved.attachments).toHaveLength(1)
  })

  it('gives a workshop copies that a later change in the library does not touch', async () => {
    const { app } = setup()
    const ws = await create(app)
    const e = await entry(app, { kind: 'item', title: 'Fishbowl', data: content('Fishbowl') })
    const up = await attach(app, `/api/library/${e.id}/attachments`, 'Anleitung.pdf', 'version 1')
    const source = up.attachments[0].id as string
    const copy = (await copies(app, e.id, ws.workshop.id))[source]
    expect(copy.id).not.toBe(source)
    expect(copy).toMatchObject({ workshopId: ws.workshop.id, name: 'Anleitung.pdf' })

    const form = new FormData()
    form.append('file', new File(['version 2'], 'Anleitung neu.pdf'))
    expect((await app.request(`${BASE}/api/library/attachments/${source}/file`, { method: 'PUT', headers: { 'x-sp': '1' }, body: form })).status).toBe(200)
    expect(await (await app.request(`${BASE}/api/library/attachments/${source}`)).text()).toBe('version 2')
    expect(await (await app.request(`${BASE}/api/attachments/${copy.id}`)).text()).toBe('version 1')

    expect((await app.request(`${BASE}/api/library/attachments/${source}`, { method: 'DELETE', headers: { 'x-sp': '1' } })).status).toBe(200)
    expect((await app.request(`${BASE}/api/library/attachments/${source}`)).status).toBe(404)
    expect(await (await app.request(`${BASE}/api/attachments/${copy.id}`)).text()).toBe('version 1')
  })

  it('refuses copies that would not fit the workshop, leaving nothing behind', async () => {
    const { app } = setup({ quotas: { workshopFiles: 8 } })
    const ws = await create(app)
    const e = await entry(app, { kind: 'item', title: 'Fishbowl', data: content('Fishbowl') })
    await attach(app, `/api/library/${e.id}/attachments`, 'a.pdf', '123456789')
    const res = await app.request(`${BASE}/api/library/${e.id}/copies/${ws.workshop.id}`, { method: 'POST', headers: H })
    expect(res.status).toBe(413)
    expect(((await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`)).json()) as WorkshopState).attachments).toEqual([])
  })

  it('saved from a workshop, an entry holds copies of the workshop files', async () => {
    const { app } = setup()
    const ws = await create(app)
    const att = await attach(app, `/api/workshops/${ws.workshop.id}/attachments`, 'Handout.docx', 'original')
    const e = await entry(app, { kind: 'item', title: 'Fishbowl', data: content('Fishbowl', [att.id, 'unknown']) })
    expect(e.attachments.map((a) => a.name)).toEqual(['Handout.docx'])
    expect(e.attachments[0].id).not.toBe(att.id)
    expect((e.data as ItemContent).attachmentIds).toEqual([e.attachments[0].id])
    await app.request(`${BASE}/api/attachments/${att.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })
    expect(await (await app.request(`${BASE}/api/library/attachments/${e.attachments[0].id}`)).text()).toBe('original')
  })

  it('removes the files with the entry', async () => {
    const { app } = setup()
    const e = await entry(app, { kind: 'item', title: 'Fishbowl', data: content('Fishbowl') })
    const up = await attach(app, `/api/library/${e.id}/attachments`, 'a.pdf', 'x')
    await app.request(`${BASE}/api/library/${e.id}`, { method: 'DELETE', headers: { 'x-sp': '1' } })
    expect((await app.request(`${BASE}/api/library/attachments/${up.attachments[0].id}`)).status).toBe(404)
  })

  it('stays the owner\'s: a guest neither reads nor changes library files', async () => {
    const pub = 'https://sessions.example.com'
    const { app } = setup({ owners: ['me@example.com'], publicUrl: new URL(pub) })
    const OWNER = { 'x-auth-request-email': 'me@example.com', origin: pub, 'x-sp': '1' }
    const GUEST = { 'x-auth-request-email': 'ben@example.com', origin: pub, 'x-sp': '1' }
    const e = (await (await app.request(`${pub}/api/library`, { method: 'POST', headers: { ...OWNER, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'item', title: 'F', data: content('F') }) })).json()) as LibraryEntry
    const form = new FormData()
    form.append('file', new File(['x'], 'a.pdf'))
    const up = (await (await app.request(`${pub}/api/library/${e.id}/attachments`, { method: 'POST', headers: OWNER, body: form })).json()) as LibraryEntry
    const file = up.attachments[0].id
    expect((await app.request(`${pub}/api/library/attachments/${file}`, { headers: GUEST })).status).toBe(403)
    expect((await app.request(`${pub}/api/library/attachments/${file}`, { method: 'DELETE', headers: GUEST })).status).toBe(403)
    expect((await app.request(`${pub}/api/library/attachments/${file}/file`, { method: 'PUT', headers: GUEST, body: form })).status).toBe(403)
    expect((await app.request(`${pub}/api/library/${e.id}/copies/x`, { method: 'POST', headers: GUEST })).status).toBe(403)
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
    const brand = await app.request(`${pub}/api/workshops/${id}/ops`, { method: 'POST', headers: BEN, body: JSON.stringify({ clientId: 'g', ops: [{ op: 'set', entity: 'workshop', id, fields: { theme: 'default' } }] }) })
    expect(brand.status).toBe(403)
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

  it('lead a presentation with edit access; every window that joins learns where it stands, view guests learn nothing', async () => {
    const { app, id, otherId } = await prepared()
    await share(app, id, 'anna@example.com', 'view', false)
    await share(app, id, 'ben@example.com', 'edit', false)
    const present = (headers: Record<string, string>, body: object, wid = id) => app.request(`${pub}/api/workshops/${wid}/present`, { method: 'POST', headers, body: JSON.stringify(body) })
    /** Reads a live-update stream until `until` shows up in it. */
    const read = async (res: Response, until: string) => {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
      let text = ''
      while (!text.includes(until)) text += (await reader.read()).value ?? ''
      await reader.cancel()
      return text
    }
    const stream = (headers: Record<string, string>) => app.request(`${pub}/api/workshops/${id}/events`, { headers })

    expect(await read(await stream(OWNER), 'event: hello')).toContain('data: {"present":null}')
    expect((await present(OWNER, { key: 'title:d1', n: 1, tag: 'w1.1' })).status).toBe(200)
    expect((await present(BEN, { key: 'a:s1', n: 3, tag: 'w2.1' })).status).toBe(200)
    expect(await read(await stream(OWNER), 'event: hello')).toContain('data: {"present":{"key":"a:s1","n":3,"tag":"w2.1"}}')

    const owner = await stream(OWNER)
    const anna = await stream(ANNA)
    await present(OWNER, { key: 'a:s2', n: 4, tag: 'w1.2' })
    expect(await read(owner, '"tag":"w1.2"')).toContain('data: {"type":"present","key":"a:s2","n":4,"tag":"w1.2"}')
    await app.request(`${pub}/api/workshops/${id}/ops`, { method: 'POST', headers: OWNER, body: JSON.stringify({ clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'a', fields: { duration: 45 } }] }) })
    const seen = await read(anna, '"type":"changed"')
    expect(seen).not.toContain('present')
    expect(seen).toMatch(/event: hello\ndata: \n/)

    expect((await present(ANNA, { key: 'a:s1', n: 3, tag: 'w3.1' })).status).toBe(403)
    expect((await present(BEN, { key: 'a:s1', n: 3, tag: 'w3.1' }, otherId)).status).toBe(404)
    expect((await present(OWNER, { key: 'a:s1', n: 3, tag: 't' }, 'nope')).status).toBe(404)
    expect((await present(OWNER, { key: 'a:s1', n: 0, tag: 't' })).status).toBe(400)
    expect((await present(OWNER, { key: 'a:s1', n: 2 })).status).toBe(400)

    // the next day nobody joins yesterday's slide
    const now = Date.now()
    const later = vi.spyOn(Date, 'now').mockReturnValue(now + (PRESENT_HOURS + 1) * 3_600_000)
    try {
      expect(await read(await stream(OWNER), 'event: hello')).toContain('data: {"present":null}')
    } finally {
      later.mockRestore()
    }
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

describe('limits', () => {
  const pub = 'https://sessions.example.com'
  const as = (email: string) => ({ 'x-auth-request-email': email, 'x-sp': '1' })
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  async function prepared(quotas: Partial<typeof QUOTAS>, pingSeconds?: number) {
    const ctx = setup({ owners: ['me@example.com'], publicUrl: new URL(pub), quotas, pingSeconds })
    const id = ctx.repo.createWorkshop({ title: 'Geteilt' }).workshop.id
    ctx.repo.setMember(id, 'anna@example.com', 'edit', true)
    const send = async (url: string, bytes: Buffer | string, email: string, name = 'x.txt') => {
      const form = new FormData()
      form.append('file', new File([bytes], name, { type: 'application/octet-stream' }))
      const res = await ctx.app.request(`${pub}${url}`, { method: 'POST', headers: as(email), body: form })
      return { status: res.status, body: (await res.json()) as { error?: string } }
    }
    return { ...ctx, id, file: (bytes: Buffer | string, email: string) => send(`/api/workshops/${id}/attachments`, bytes, email), picture: (bytes: Buffer, email: string) => send(`/api/workshops/${id}/assets`, bytes, email, 'p.png') }
  }

  it('keeps the files of a workshop under their limit, for the owner too', async () => {
    const { file } = await prepared({ workshopFiles: 10 })
    expect((await file('123456', 'me@example.com')).status).toBe(201)
    expect(await file('123456', 'me@example.com')).toEqual({ status: 413, body: { error: 'quota' } })
    expect((await file('1234', 'anna@example.com')).status).toBe(201)
  })

  it('lets a guest upload so much a day, files and slide pictures together; the owner is not counted', async () => {
    const { file, picture } = await prepared({ guestUploadsPerDay: PNG.length + 6 })
    expect((await file('123456', 'anna@example.com')).status).toBe(201)
    expect((await picture(PNG, 'anna@example.com')).status).toBe(201)
    expect(await picture(Buffer.concat([PNG, Buffer.from([0])]), 'anna@example.com')).toEqual({ status: 429, body: { error: 'upload_budget' } })
    expect((await file('1', 'anna@example.com')).status).toBe(429)
    // a picture the server already has takes no room, and the owner uploads as before
    expect((await picture(PNG, 'anna@example.com')).status).toBe(201)
    expect((await file('123456', 'me@example.com')).status).toBe(201)
  })

  it('lets a guest hold so many live-update streams; closing one frees its place, the owner is not counted', async () => {
    const { app, id } = await prepared({ guestStreams: 2 }, 0.02)
    const open = (email: string) => app.request(`${pub}/api/workshops/${id}/events`, { headers: as(email) })
    const first = await open('anna@example.com')
    const second = await open('anna@example.com')
    expect([first.status, second.status]).toEqual([200, 200])
    const third = await open('anna@example.com')
    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ error: 'too_many_streams' })
    const owners = [await open('me@example.com'), await open('me@example.com'), await open('me@example.com')]
    expect(owners.map((r) => r.status)).toEqual([200, 200, 200])
    await first.body!.cancel()
    await new Promise((r) => setTimeout(r, 30))
    const again = await open('anna@example.com')
    expect(again.status).toBe(200)
    await Promise.all([second, again, ...owners].map((r) => r.body!.cancel()))
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
