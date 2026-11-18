import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import type { Item, LibraryEntry, WorkshopState, Worksheet } from '../src/domain/types.ts'

/** Worksheets of steps (docs/worksheets.md, stage 2): stored sanitised, carried by copies, their pictures held. */

const BASE = 'http://127.0.0.1'
const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'
const H = (email = OWNER) => ({ 'content-type': 'application/json', 'x-sp': '1', 'x-auth-request-email': email })
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function setup() {
  const repo = new Repo(openDb(':memory:'))
  const app = createApp({ repo, hub: new Hub(), filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')), themesDir: mkdtempSync(path.join(tmpdir(), 'sp-themes-')), owners: [OWNER], ownerHeader: 'x-auth-request-email' })
  return { app, repo }
}

const sheet = (html: string): Worksheet => ({ id: 'w1', title: 'Mein Teamtag', paper: 'A4', pages: [{ id: 'p1', html }], updatedAt: '2026-11-18T10:00:00.000Z' })

const item = (workshopId: string, dayId: string, worksheets: Worksheet[]): Item => ({
  id: 'i1', workshopId, dayId, position: 1, groupId: null, kind: 'block', title: 'Rückblick', description: '', duration: 30, fixedStart: null, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [],
  printRules: {}, groups: 1, slides: [], worksheets, categoryId: null, color: null,
})

async function workshop(app: ReturnType<typeof setup>['app']): Promise<WorkshopState> {
  return (await (await app.request(`${BASE}/api/workshops`, { method: 'POST', headers: H(), body: JSON.stringify({ title: 'Teamtag', date: '2026-11-10' }) })).json()) as WorkshopState
}

const ops = (app: ReturnType<typeof setup>['app'], id: string, list: unknown[], email = OWNER) => app.request(`${BASE}/api/workshops/${id}/ops`, { method: 'POST', headers: H(email), body: JSON.stringify({ clientId: 'c', ops: list }) })

async function picture(app: ReturnType<typeof setup>['app'], workshopId: string): Promise<string> {
  const form = new FormData()
  form.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
  const res = await app.request(`${BASE}/api/workshops/${workshopId}/assets`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': OWNER }, body: form })
  return ((await res.json()) as { hash: string }).hash
}

describe('worksheets of a step', () => {
  it('are stored sanitised, each page one section.sheet with its circles drawn', async () => {
    const { app } = setup()
    const ws = await workshop(app)
    const dirty = '<section class="sheet"><h1 onclick="x()">T</h1><script>alert(1)</script><div class="block circle"><ol><li></li><li></li><li></li></ol></div></section><p>after</p>'
    expect((await ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: item(ws.workshop.id, ws.days[0].id, [sheet(dirty)]) }])).status).toBe(200)
    const state = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H() })).json()) as WorkshopState
    const html = state.items[0].worksheets[0].pages[0].html
    expect(html).toMatch(/^<section class="sheet"><h1>T<\/h1><div class="block circle"><svg class="drawn"/)
    expect(html).not.toContain('script')
    expect(html).not.toContain('after')
    expect((html.match(/class="spoke"/g) ?? []).length).toBe(3)
  })

  it('refuses a sheet without pages, too many pages or an unknown paper size', async () => {
    const { app } = setup()
    const ws = await workshop(app)
    const bad = (w: object) => ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: item(ws.workshop.id, ws.days[0].id, [{ ...sheet('<section class="sheet"></section>'), ...w } as Worksheet]) }])
    expect((await bad({ pages: [] })).status).toBe(400)
    expect((await bad({ pages: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, html: '<section class="sheet"></section>' })) })).status).toBe(400)
    expect((await bad({ paper: 'Letter' })).status).toBe(400)
  })

  it('hold their pictures: a guest may load them, the sweep keeps them', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    const hash = await picture(app, ws.workshop.id)
    await ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: item(ws.workshop.id, ws.days[0].id, [sheet(`<section class="sheet"><figure class="block picture"><img src="asset:${hash}" alt=""></figure></section>`)]) }])
    repo.setMember(ws.workshop.id, GUEST, 'view', false)
    expect(repo.assetInWorkshop(ws.workshop.id, hash)).toBe(true)
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/assets/${hash}`, { headers: H(GUEST) })).status).toBe(200)
    expect(repo.sweepAssets()).not.toContain(hash)
  })

  it('are shown to guests as slides are, also to guests without the notes', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    await ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: item(ws.workshop.id, ws.days[0].id, [sheet('<section class="sheet"><div class="block text"><p>x</p></div></section>')]) }])
    repo.setMember(ws.workshop.id, GUEST, 'view', false)
    const seen = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H(GUEST) })).json()) as WorkshopState
    expect(seen.items[0].worksheets[0].title).toBe('Mein Teamtag')
    // a guest who may only view cannot change them
    expect((await ops(app, ws.workshop.id, [{ op: 'set', entity: 'item', id: 'i1', fields: { worksheets: [] } }], GUEST)).status).toBe(403)
  })

  it('come along when a workshop is duplicated, with ids of their own', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    await ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: item(ws.workshop.id, ws.days[0].id, [sheet('<section class="sheet"><div class="block text"><p>x</p></div></section>')]) }])
    const copy = repo.duplicateWorkshop(ws.workshop.id, { title: 'Kopie' })!.state
    const w = copy.items[0].worksheets[0]
    expect(w.title).toBe('Mein Teamtag')
    expect(w.pages[0].html).toContain('<p>x</p>')
    expect(w.id).not.toBe('w1')
    expect(w.pages[0].id).not.toBe('p1')
  })

  it('keep their print rule: saved to the library under the same id, duplicated under the new one', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    const rule = { mode: 'person', paper: 'A4', duplex: true }
    await ops(app, ws.workshop.id, [{ op: 'create', entity: 'item', record: { ...item(ws.workshop.id, ws.days[0].id, [sheet('<section class="sheet"></section>')]), printRules: { w1: rule } } }])
    const copy = repo.duplicateWorkshop(ws.workshop.id, { title: 'Kopie' })!.state.items[0]
    expect(copy.printRules).toEqual({ [copy.worksheets[0].id]: rule })
    const content = { kind: 'block', title: 'Rückblick', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], printRules: { w1: rule }, slides: [], worksheets: [sheet('<section class="sheet"></section>')], categoryId: null, color: null }
    const entry = (await (await app.request(`${BASE}/api/library`, { method: 'POST', headers: H(), body: JSON.stringify({ kind: 'item', title: 'Rückblick', data: content }) })).json()) as LibraryEntry
    expect((entry.data as { printRules: object }).printRules).toEqual({ w1: rule })
  })

  it('travel into the library and back into a workshop as copies', async () => {
    const { app } = setup()
    const ws = await workshop(app)
    const data = { ...item(ws.workshop.id, ws.days[0].id, [sheet('<section class="sheet"><div class="block text"><p>x</p></div></section>')]) }
    const content = { kind: data.kind, title: data.title, description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], printRules: {}, slides: [], worksheets: data.worksheets, categoryId: null, color: null }
    const saved = await app.request(`${BASE}/api/library`, { method: 'POST', headers: H(), body: JSON.stringify({ kind: 'item', title: 'Rückblick', data: content }) })
    expect(saved.status).toBe(201)
    const entry = (await saved.json()) as LibraryEntry
    expect((entry.data as { worksheets: Worksheet[] }).worksheets[0].pages[0].html).toContain('<p>x</p>')
  })
})
