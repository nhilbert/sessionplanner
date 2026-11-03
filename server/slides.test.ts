import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { decodePng, encodePng } from './cutout.ts'
import type { Item, WorkshopState } from '../src/domain/types.ts'

const BASE = 'http://127.0.0.1'
const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'
const H = (email = OWNER) => ({ 'content-type': 'application/json', 'x-sp': '1', 'x-auth-request-email': email })
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function setup() {
  const repo = new Repo(openDb(':memory:'))
  const themesDir = mkdtempSync(path.join(tmpdir(), 'sp-themes-'))
  mkdirSync(path.join(themesDir, 'demo', 'fonts'), { recursive: true })
  writeFileSync(path.join(themesDir, 'demo', 'theme.css'), '[data-theme="demo"] { --bg: #fff; }')
  writeFileSync(path.join(themesDir, 'demo', 'fonts', 'x.woff2'), 'font')
  mkdirSync(path.join(themesDir, 'broken'))
  const app = createApp({ repo, hub: new Hub(), filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')), themesDir, owners: [OWNER], ownerHeader: 'x-auth-request-email' })
  return { app, repo }
}

const upload = (app: ReturnType<typeof setup>['app'], url: string, bytes: Buffer, email = OWNER, name = 'pic.png') => {
  const form = new FormData()
  form.append('file', new File([bytes], name, { type: 'image/png' }))
  return app.request(`${BASE}${url}`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': email }, body: form })
}

const item = (id: string, workshopId: string, dayId: string, html: string): Item => ({
  id, workshopId, dayId, position: 1, groupId: null, kind: 'block', title: id, description: '', duration: 30, fixedStart: null, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [],
  slides: [{ id: 's1', html }], categoryId: null, color: null,
})

async function workshop(app: ReturnType<typeof setup>['app']): Promise<WorkshopState> {
  const res = await app.request(`${BASE}/api/workshops`, { method: 'POST', headers: H(), body: JSON.stringify({ title: 'Teamtag', date: '2026-11-10' }) })
  return (await res.json()) as WorkshopState
}

describe('slide assets', () => {
  it('stores a picture once by its content and serves it to the owner from the library', async () => {
    const { app } = setup()
    const first = await upload(app, '/api/library/assets', PNG)
    expect(first.status).toBe(201)
    const asset = (await first.json()) as { hash: string; mime: string; size: number }
    expect(asset.mime).toBe('image/png')
    expect(asset.hash).toMatch(/^[0-9a-f]{64}$/)
    const again = (await (await upload(app, '/api/library/assets', PNG)).json()) as { hash: string }
    expect(again.hash).toBe(asset.hash)
    const got = await app.request(`${BASE}/api/library/assets/${asset.hash}`, { headers: H() })
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect(got.headers.get('cache-control')).toContain('immutable')
    // Guests have no library.
    expect((await app.request(`${BASE}/api/library/assets/${asset.hash}`, { headers: H(GUEST) })).status).toBe(403)
    expect((await upload(app, '/api/library/assets', PNG, GUEST)).status).toBe(403)
  })

  it('refuses what is not a raster image, whatever its name says', async () => {
    const { app } = setup()
    expect((await upload(app, '/api/library/assets', Buffer.from('<svg onload="x()"></svg>'), OWNER, 'x.png')).status).toBe(400)
    expect((await upload(app, '/api/library/assets', Buffer.from('<html><script>x()</script>'), OWNER, 'x.html')).status).toBe(400)
  })

  it('serves a workshop asset only where a slide of that workshop shows it, to its guests too', async () => {
    const { app } = setup()
    const ws = await workshop(app)
    const other = await workshop(app)
    const asset = (await (await upload(app, `/api/workshops/${ws.workshop.id}/assets`, PNG)).json()) as { hash: string }
    const url = (id: string) => `${BASE}/api/workshops/${id}/assets/${asset.hash}`
    // Not referenced yet: not visible.
    expect((await app.request(url(ws.workshop.id), { headers: H() })).status).toBe(404)
    const html = `<section class="slide figure"><figure class="main"><img src="asset:${asset.hash}" alt=""></figure></section>`
    const ops = { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('i1', ws.workshop.id, ws.days[0].id, html) }] }
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify(ops) })).status).toBe(200)
    expect((await app.request(url(ws.workshop.id), { headers: H() })).status).toBe(200)
    expect((await app.request(url(other.workshop.id), { headers: H() })).status).toBe(404)
    // A guest with view access sees it through the workshop; a stranger does not.
    expect((await app.request(url(ws.workshop.id), { headers: H(GUEST) })).status).toBe(404)
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${GUEST}`, { method: 'PUT', headers: H(), body: JSON.stringify({ role: 'view', showNotes: false }) })
    expect((await app.request(url(ws.workshop.id), { headers: H(GUEST) })).status).toBe(200)
    // Guests who may edit upload; viewers do not.
    expect((await upload(app, `/api/workshops/${ws.workshop.id}/assets`, PNG, GUEST)).status).toBe(403)
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${GUEST}`, { method: 'PUT', headers: H(), body: JSON.stringify({ role: 'edit', showNotes: true }) })
    expect((await upload(app, `/api/workshops/${ws.workshop.id}/assets`, PNG, GUEST)).status).toBe(201)
    // Once no slide shows it, the sweep removes it.
    expect((await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).status).toBe(200)
    expect((await app.request(url(ws.workshop.id), { headers: H() })).status).toBe(200)
    const clear = { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'i1', fields: { slides: [] } }] }
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify(clear) })
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 1 })
    expect((await app.request(url(ws.workshop.id), { headers: H() })).status).toBe(404)
  })

  it('stores slides sanitised and carries them into the library', async () => {
    const { app } = setup()
    const ws = await workshop(app)
    const dirty = '<section class="slide list"><h2 onclick="x()">T</h2><script>alert(1)</script><p>ok</p></section>'
    const ops = { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('i1', ws.workshop.id, ws.days[0].id, dirty) }] }
    const res = await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify(ops) })
    expect(res.status).toBe(200)
    const state = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H() })).json()) as WorkshopState
    expect(state.items[0].slides).toEqual([{ id: 's1', html: '<section class="slide list"><h2>T</h2><p>ok</p></section>' }])
    const entry = { kind: 'item', title: 'T', data: { ...state.items[0], workshopId: undefined, id: undefined, dayId: undefined, position: undefined, groupId: undefined, fixedStart: undefined, attachmentIds: undefined } }
    const saved = await app.request(`${BASE}/api/library`, { method: 'POST', headers: H(), body: JSON.stringify(entry) })
    expect(saved.status).toBe(201)
    expect(((await saved.json()) as { data: Item }).data.slides).toHaveLength(1)
    // A slide without a section root gets one; too many slides are refused.
    const loose = { clientId: 'c', ops: [{ op: 'set', entity: 'item', id: 'i1', fields: { slides: [{ id: 's2', html: '<p>nur Text</p>' }] } }] }
    const out = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify(loose) })).json()) as { ops: { fields: { slides: { html: string }[] } }[] }
    expect(out.ops[0].fields.slides[0].html).toBe('<section class="slide list"><p>nur Text</p></section>')
  })

  it('keeps nothing after the slide, even from a guest with edit access', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    repo.setMember(ws.workshop.id, GUEST, 'edit', true)
    const overlay = '<section class="slide list"><p>ok</p></section><div class="fixed inset-0 z-50 bg-black">Sitzung abgelaufen</div>'
    const ops = { clientId: 'g', ops: [{ op: 'create', entity: 'item', record: item('i1', ws.workshop.id, ws.days[0].id, overlay) }] }
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(GUEST), body: JSON.stringify(ops) })).status).toBe(200)
    const state = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H() })).json()) as WorkshopState
    expect(state.items[0].slides[0].html).toBe('<section class="slide list"><p>ok</p></section>')
  })

  it('lists the themes that have a stylesheet and serves their files, nothing outside them', async () => {
    const { app } = setup()
    expect(await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()).toEqual([
      { id: 'default', name: 'default', kind: 'builtin' },
      { id: 'demo', name: 'demo', kind: 'folder' },
    ])
    const css = await app.request(`${BASE}/api/themes/demo/theme.css`, { headers: H(GUEST) })
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toContain('text/css')
    expect((await app.request(`${BASE}/api/themes/demo/fonts/x.woff2`, { headers: H() })).headers.get('content-type')).toBe('font/woff2')
    expect((await app.request(`${BASE}/api/themes/demo/theme.txt`, { headers: H() })).status).toBe(404)
    expect((await app.request(`${BASE}/api/themes/demo/..%2Fbroken%2Ftheme.css`, { headers: H() })).status).toBe(404)
    expect((await app.request(`${BASE}/api/themes/Bad%20Name/theme.css`, { headers: H() })).status).toBe(404)
  })
})

describe('the slide pool', () => {
  it('keeps uploaded decks with sanitised slides for the owner, and the sweep respects what they show', async () => {
    const { app } = setup()
    const asset = (await (await upload(app, '/api/library/assets', PNG)).json()) as { hash: string }
    const body = { title: 'Resilienz', theme: 'sr-light', source: 'resilienz.pptx', slides: [{ html: `<section class="slide figure"><figure class="main"><img src="asset:${asset.hash}"></figure><script>x()</script></section>`, caption: 'Bild' }, { html: '<p>zwei</p>' }] }
    const created = await app.request(`${BASE}/api/decks`, { method: 'POST', headers: H(), body: JSON.stringify(body) })
    expect(created.status).toBe(201)
    const { deck, slides } = (await created.json()) as { deck: { id: string; slides: number }; slides: { html: string; position: number }[] }
    expect(deck.slides).toBe(2)
    expect(slides[0].html).not.toContain('script')
    expect(slides[1]).toMatchObject({ position: 2, html: '<section class="slide list"><p>zwei</p></section>' })
    expect(await (await app.request(`${BASE}/api/decks`, { headers: H() })).json()).toMatchObject([{ title: 'Resilienz', slides: 2 }])
    expect((await app.request(`${BASE}/api/decks`, { headers: H(GUEST) })).status).toBe(403)
    // The asset stays while the deck shows it, and goes with the deck.
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 0 })
    expect((await app.request(`${BASE}/api/decks/${deck.id}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ title: 'Resilienz 2026' }) })).status).toBe(200)
    expect((await app.request(`${BASE}/api/decks/${deck.id}`, { method: 'DELETE', headers: H() })).status).toBe(200)
    expect((await app.request(`${BASE}/api/decks/${deck.id}`, { headers: H() })).status).toBe(404)
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 1 })
  })
})

describe('cut-outs at upload', () => {
  it('stores the cut-out of a PNG with a flat background next to the original, tells both apart, and keeps them together', async () => {
    const { app, repo } = setup()
    const rgba = new Uint8Array(40 * 40 * 4)
    for (let i = 0; i < 1600; i++) {
      const x = i % 40
      const y = (i - x) / 40
      rgba.set(x >= 15 && x < 25 && y >= 15 && y < 25 ? [20, 30, 40, 255] : [220, 218, 214, 255], i * 4)
    }
    const png = encodePng({ width: 40, height: 40, rgba })
    const res = await upload(app, '/api/library/assets', png)
    expect(res.status).toBe(201)
    const asset = (await res.json()) as { hash: string; cutout: string | null }
    expect(asset.cutout).toMatch(/^[0-9a-f]{64}$/)
    expect(asset.cutout).not.toBe(asset.hash)
    const cut = await app.request(`${BASE}/api/library/assets/${asset.cutout}`, { headers: H() })
    expect(cut.status).toBe(200)
    const img = decodePng(Buffer.from(await cut.arrayBuffer()))!
    expect([img.width, img.height]).toEqual([26, 26])
    expect(img.rgba[3]).toBe(0)
    // both know each other
    expect(await (await app.request(`${BASE}/api/library/assets/${asset.hash}/info`, { headers: H() })).json()).toEqual({ hash: asset.hash, original: asset.hash, cutout: asset.cutout })
    expect(await (await app.request(`${BASE}/api/library/assets/${asset.cutout}/info`, { headers: H() })).json()).toEqual({ hash: asset.cutout, original: asset.hash, cutout: asset.cutout })
    // uploaded again: the same answer, no second cut-out
    expect(await (await upload(app, '/api/library/assets', png)).json()).toMatchObject({ hash: asset.hash, cutout: asset.cutout })
    expect(repo.getCutout(asset.hash)?.hash).toBe(asset.cutout)
    // a tiny PNG without a subject gets none
    expect(((await (await upload(app, '/api/library/assets', PNG)).json()) as { cutout: string | null }).cutout).toBeNull()
    // a slide showing the cut-out keeps the original too; a guest sees both through the workshop
    const ws = await workshop(app)
    const html = `<section class="slide figure"><figure class="main"><img src="asset:${asset.cutout}" alt=""></figure></section>`
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify({ clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('i1', ws.workshop.id, ws.days[0].id, html) }] }) })
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${GUEST}`, { method: 'PUT', headers: H(), body: JSON.stringify({ role: 'view', showNotes: false }) })
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/assets/${asset.hash}`, { headers: H(GUEST) })).status).toBe(200)
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/assets/${asset.hash}/info`, { headers: H(GUEST) })).status).toBe(200)
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 1 })
    expect(repo.getAsset(asset.hash)).not.toBeNull()
    expect(repo.getAsset(asset.cutout!)).not.toBeNull()
  })
})

describe('cut-outs for the pictures on slides', () => {
  it('puts the cut-out where an illustration stands whole on the ground, in workshops, the library, the pool and the templates, once', async () => {
    const { app, repo } = setup()
    const rgba = new Uint8Array(40 * 40 * 4)
    for (let i = 0; i < 1600; i++) {
      const x = i % 40
      const y = (i - x) / 40
      rgba.set(x >= 15 && x < 25 && y >= 15 && y < 25 ? [20, 30, 40, 255] : [220, 218, 214, 255], i * 4)
    }
    const asset = (await (await upload(app, '/api/library/assets', encodePng({ width: 40, height: 40, rgba }))).json()) as { hash: string; cutout: string }
    const img = `<img src="asset:${asset.hash}" alt="">`
    const split = `<section class="slide split"><header><h2>Selbstregulation</h2></header><div class="split"><div class="text"><p>Text</p></div><figure>${img}</figure></div></section>`
    const cards = `<section class="slide cards"><header><h2>Stress</h2></header><ul class="cards plain cols-2"><li>${img}<h3>Auslöser</h3></li><li>${img}<h3>Verhalten</h3></li></ul></section>`
    const full = `<section class="slide figure full"><header><h2>Weit</h2></header><figure class="main">${img}</figure></section>`
    const ws = await workshop(app)
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify({ clientId: 'c', ops: [{ op: 'create', entity: 'item', record: item('i1', ws.workshop.id, ws.days[0].id, split) }] }) })
    const entry = repo.saveLibraryEntry(null, { kind: 'item', title: 'Stress', data: { ...item('x', '', '', cards), id: undefined } as never })!
    const { slides: pool } = repo.createDeck({ title: 'Resilienz', theme: '', source: '', slides: [{ html: full, caption: '' }, { html: cards, caption: '' }] })
    const template = repo.saveSlideTemplate(null, { name: 'Bild', layout: 'figure', html: split })!
    const run = async () => (await app.request(`${BASE}/api/assets/cutouts`, { method: 'POST', headers: H() })).json()
    expect(await run()).toEqual({ pictures: 1, made: 0, slides: 4 })
    const cut = `<img src="asset:${asset.cutout}" alt="">`
    const state = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H() })).json()) as WorkshopState
    expect(state.items[0].slides[0].html).toContain(`<div class="split contain">`)
    expect(state.items[0].slides[0].html).toContain(cut)
    expect(JSON.stringify(repo.getLibraryEntry(entry.id)!.data)).toContain('cards plain cols-2 contain')
    expect(repo.getDeckSlide(pool[0].id)!.html).toBe(full)
    expect(repo.getDeckSlide(pool[1].id)!.html.split(cut).length).toBe(3)
    expect(repo.listSlideTemplates().find((t) => t.id === template.id)!.html).toContain(cut)
    // a second run finds nothing to do; guests may not run it
    expect(await run()).toEqual({ pictures: 1, made: 0, slides: 0 })
    expect((await app.request(`${BASE}/api/assets/cutouts`, { method: 'POST', headers: H(GUEST) })).status).toBe(403)
  })
})

describe('pictures chosen for generated slides', () => {
  it('are kept on the workshop, served to its guests and spared by the sweep; a bad hash is refused', async () => {
    const { app, repo } = setup()
    const ws = await workshop(app)
    const asset = (await (await upload(app, `/api/workshops/${ws.workshop.id}/assets`, PNG)).json()) as { hash: string }
    const set = (pictures: unknown) => app.request(`${BASE}/api/workshops/${ws.workshop.id}/ops`, { method: 'POST', headers: H(), body: JSON.stringify({ clientId: 'c', ops: [{ op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { pictures } }] }) })
    expect((await set({ 'title:x': 'nope' })).status).toBe(400)
    expect((await set({ [`title:${ws.days[0].id}`]: asset.hash })).status).toBe(200)
    expect(((await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}`, { headers: H() })).json()) as WorkshopState).workshop.pictures).toEqual({ [`title:${ws.days[0].id}`]: asset.hash })
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${GUEST}`, { method: 'PUT', headers: H(), body: JSON.stringify({ role: 'view', showNotes: false }) })
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/assets/${asset.hash}`, { headers: H(GUEST) })).status).toBe(200)
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 0 })
    expect(repo.getAsset(asset.hash)).not.toBeNull()
    // the choice travels with a duplicate of the workshop
    const copy = (await (await app.request(`${BASE}/api/workshops/${ws.workshop.id}/duplicate`, { method: 'POST', headers: H(), body: JSON.stringify({ title: 'Kopie', firstDate: '2026-12-01' }) })).json()) as WorkshopState
    expect(Object.values(copy.workshop.pictures)).toEqual([asset.hash])
  })
})
