import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { Ops } from './ops.ts'
import type { Theme } from '../src/domain/theme.ts'
import type { SlideTemplate, WorkshopState } from '../src/domain/types.ts'

const BASE = 'http://127.0.0.1'
const OWNER = 'owner@example.com'
const GUEST = 'guest@example.com'
const H = (email = OWNER) => ({ 'content-type': 'application/json', 'x-sp': '1', 'x-auth-request-email': email })
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function setup() {
  const repo = new Repo(openDb(':memory:'))
  const themesDir = mkdtempSync(path.join(tmpdir(), 'sp-themes-'))
  mkdirSync(path.join(themesDir, 'demo'))
  writeFileSync(path.join(themesDir, 'demo', 'theme.css'), '[data-theme="demo"] { --bg: #fff; }')
  const hub = new Hub()
  const filesDir = mkdtempSync(path.join(tmpdir(), 'sp-files-'))
  const app = createApp({ repo, hub, filesDir, themesDir, owners: [OWNER], ownerHeader: 'x-auth-request-email' })
  return { app, repo, hub, themesDir, filesDir }
}

const post = (app: ReturnType<typeof setup>['app'], url: string, body: unknown, email = OWNER, method = 'POST') => app.request(`${BASE}${url}`, { method, headers: H(email), body: JSON.stringify(body) })

describe('slide themes as data', () => {
  it('creates a theme, serves its generated stylesheet to guests, lists it with the folder themes', async () => {
    const { app } = setup()
    const res = await post(app, '/api/themes', { name: 'Beispiel hell', tokens: { colors: { accent: '#AA3366' }, radius: 4, logo: 'all' } })
    expect(res.status).toBe(201)
    const theme = (await res.json()) as Theme
    expect(theme.id).toMatch(/^beispiel-hell-[a-z0-9]+$/)
    expect(theme.tokens.colors.accent).toBe('#AA3366')
    expect(theme.tokens.colors.bg).toBe('#FFFFFF')
    expect(theme.tokens.radius).toBe(4)
    const list = (await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as { id: string; kind: string; name: string }[]
    expect(list.map((t) => [t.id, t.kind])).toEqual([
      ['default', 'builtin'],
      ['demo', 'folder'],
      [theme.id, 'data'],
    ])
    const css = await app.request(`${BASE}/api/themes/${theme.id}/theme.css`, { headers: H(GUEST) })
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toContain('text/css')
    const text = await css.text()
    expect(text).toContain(`[data-theme="${theme.id}"]`)
    expect(text).toContain('--accent: #AA3366;')
    expect(text).toContain('--radius: 4px;')
    // No logo yet: nothing placed, no logo route.
    expect(text).not.toContain('--logo:')
    expect((await app.request(`${BASE}/api/themes/${theme.id}/logo`, { headers: H() })).status).toBe(404)
    // Guests read the stylesheet but may not change a theme.
    expect((await post(app, '/api/themes', { name: 'x' }, GUEST)).status).toBe(403)
    expect((await post(app, `/api/themes/${theme.id}`, { name: 'y' }, GUEST, 'PUT')).status).toBe(403)
    expect((await app.request(`${BASE}/api/themes/${theme.id}`, { headers: H(GUEST) })).status).toBe(403)
  })

  it('changes tokens and name, takes a logo and places it, refuses bad input', async () => {
    const { app } = setup()
    const theme = (await (await post(app, '/api/themes', { name: 'T' })).json()) as Theme
    const put = await post(app, `/api/themes/${theme.id}`, { name: 'Theme neu', tokens: { ...theme.tokens, colors: { ...theme.tokens.colors, bg: '#101214', fg: '#F0F0F0' }, fonts: { display: 'source-serif', body: 'manrope' }, logo: 'title' } }, OWNER, 'PUT')
    expect(put.status).toBe(200)
    const changed = (await put.json()) as Theme
    expect(changed.name).toBe('Theme neu')
    expect(changed.tokens.fonts).toEqual({ display: 'source-serif', body: 'manrope' })
    const form = new FormData()
    form.append('file', new File([PNG], 'logo.png', { type: 'image/png' }))
    const up = await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': OWNER }, body: form })
    expect(up.status).toBe(200)
    const withLogo = (await up.json()) as Theme
    expect(withLogo.logo?.mime).toBe('image/png')
    const css = await (await app.request(`${BASE}/api/themes/${theme.id}/theme.css`, { headers: H(GUEST) })).text()
    expect(css).toContain(`--logo: url("/api/themes/${theme.id}/logo?v=`)
    expect(css).toContain("'Source Serif 4 Variable'")
    expect(css).toContain('.slide.title::after')
    const logo = await app.request(`${BASE}/api/themes/${theme.id}/logo`, { headers: H(GUEST) })
    expect(logo.status).toBe(200)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(logo.headers.get('content-security-policy')).toBe('sandbox')
    expect((await post(app, `/api/themes/${theme.id}`, { tokens: { colors: { accent: 'red' } } }, OWNER, 'PUT')).status).toBe(400)
    expect((await post(app, `/api/themes/${theme.id}`, { tokens: { fonts: { display: 'comic' } } }, OWNER, 'PUT')).status).toBe(400)
    expect((await post(app, '/api/themes', { name: 'x', extra: 1 })).status).toBe(400)
    const del = await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'DELETE', headers: H() })
    expect(((await del.json()) as Theme).logo).toBeNull()
  })

  it('copies a theme with its logo, and deleting one resets the workshops and settings that used it', async () => {
    const { app, repo, hub } = setup()
    const theme = (await (await post(app, '/api/themes', { name: 'Original', tokens: { colors: { accent: '#123456' } } })).json()) as Theme
    const form = new FormData()
    form.append('file', new File([PNG], 'logo.png', { type: 'image/png' }))
    await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': OWNER }, body: form })
    const copy = (await (await post(app, '/api/themes', { name: 'Kopie', from: theme.id })).json()) as Theme
    expect(copy.tokens.colors.accent).toBe('#123456')
    expect(copy.logo?.mime).toBe('image/png')
    expect((await app.request(`${BASE}/api/themes/${copy.id}/logo`, { headers: H() })).status).toBe(200)
    const dark = (await (await post(app, '/api/themes', { name: 'Dunkel', from: 'dark' })).json()) as Theme
    expect(dark.tokens.colors.bg).toBe('#15181B')
    expect((await post(app, '/api/themes', { name: 'x', from: 'nope' })).status).toBe(400)

    const ws = (await (await post(app, '/api/workshops', { title: 'W' })).json()) as WorkshopState
    await post(app, `/api/workshops/${ws.workshop.id}/ops`, { clientId: 'c', ops: [{ op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { theme: theme.id } }] })
    await post(app, '/api/settings', { ...repo.getSettings(), logo: undefined, theme: theme.id }, OWNER, 'PUT')
    expect(repo.getSettings().theme).toBe(theme.id)
    const events: unknown[] = []
    hub.subscribe(ws.workshop.id, (e) => events.push(e))
    expect((await app.request(`${BASE}/api/themes/${theme.id}`, { method: 'DELETE', headers: H() })).status).toBe(200)
    expect(repo.loadWorkshop(ws.workshop.id)?.workshop.theme).toBe('')
    expect(repo.getSettings().theme).toBe('')
    expect(events).toEqual([{ type: 'ops', clientId: 'server', ops: [{ op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { theme: '' } }] }])
    expect((await app.request(`${BASE}/api/themes/${theme.id}/theme.css`, { headers: H() })).status).toBe(404)
    expect((await app.request(`${BASE}/api/themes/${copy.id}/theme.css`, { headers: H() })).status).toBe(200)
  })

  it('is known to the agents: settings list it, a workshop can choose it', () => {
    const { repo, themesDir } = setup()
    const theme = repo.createTheme({ id: 'firma-abc', name: 'Firma', tokens: { ...(repo.getTheme('x')?.tokens ?? {}), colors: {} } as never })
    const ops = new Ops(repo, { themesDir, today: () => '2026-11-10' })
    expect(ops.settingsGet().themes).toEqual([
      { id: 'default', name: 'default' },
      { id: 'demo', name: 'demo' },
      { id: 'firma-abc', name: 'Firma' },
    ])
    const ws = ops.workshopCreate({ title: 'Klausur', theme: theme.id })
    expect(ws.theme).toBe('firma-abc')
    expect(() => ops.workshopUpdate(ws.id!, { theme: 'nope' })).toThrow(/no theme "nope"/)
  })
})

describe('template slides', () => {
  it('stores named slides sanitised, in order, for the owner only', async () => {
    const { app } = setup()
    const res = await post(app, '/api/slide-templates', { name: 'Drei Karten', html: '<section class="slide cards"><header><h2>Titel</h2></header><ul class="cards cols-3"><li><h3>A</h3></li></ul><script>x()</script></section>' })
    expect(res.status).toBe(201)
    const tpl = (await res.json()) as SlideTemplate
    expect(tpl.layout).toBe('cards')
    expect(tpl.html).not.toContain('<script')
    const second = (await (await post(app, '/api/slide-templates', { name: 'Zitat', html: '<section class="slide quote"><blockquote><p>Q</p></blockquote></section>' })).json()) as SlideTemplate
    expect(second.position).toBeGreaterThan(tpl.position)
    const list = (await (await app.request(`${BASE}/api/slide-templates`, { headers: H() })).json()) as SlideTemplate[]
    expect(list.map((t) => t.name)).toEqual(['Drei Karten', 'Zitat'])
    const moved = (await (await post(app, `/api/slide-templates/${second.id}`, { name: 'Zitat', html: second.html, position: 0 }, OWNER, 'PUT')).json()) as SlideTemplate
    expect(moved.position).toBe(0)
    expect(((await (await app.request(`${BASE}/api/slide-templates`, { headers: H() })).json()) as SlideTemplate[]).map((t) => t.name)).toEqual(['Zitat', 'Drei Karten'])
    expect((await app.request(`${BASE}/api/slide-templates`, { headers: H(GUEST) })).status).toBe(403)
    expect((await post(app, '/api/slide-templates', { name: 'x', html: '<p>y</p>' }, GUEST)).status).toBe(403)
    expect((await app.request(`${BASE}/api/slide-templates/${tpl.id}`, { method: 'DELETE', headers: H() })).status).toBe(200)
    expect((await app.request(`${BASE}/api/slide-templates/${tpl.id}`, { method: 'DELETE', headers: H() })).status).toBe(404)
  })
})
