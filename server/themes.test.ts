import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { Ops } from './ops.ts'
import type { Theme, ThemeInfo } from '../src/domain/theme.ts'
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
    expect(theme.tokens.colors.bg).toBe('#FBFAF8')
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
    // edited at any time: never kept by the browser without asking
    expect(css.headers.get('cache-control')).toBe('private, no-cache')
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
    // A dark theme's logo is made for its dark ground: the printouts do not take it.
    const listed = (await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as ThemeInfo[]
    expect(listed.find((x) => x.id === theme.id)?.printLogo).toBeNull()
    // and the host learns to ask for the cut-outs made for a dark ground
    expect(listed.find((x) => x.id === theme.id)?.dark).toBe(true)
    expect(listed.find((x) => x.id === 'default')?.dark).toBe(false)
    expect((await post(app, `/api/themes/${theme.id}`, { tokens: { colors: { accent: 'red' } } }, OWNER, 'PUT')).status).toBe(400)
    expect((await post(app, `/api/themes/${theme.id}`, { tokens: { fonts: { display: 'comic' } } }, OWNER, 'PUT')).status).toBe(400)
    expect((await post(app, '/api/themes', { name: 'x', extra: 1 })).status).toBe(400)
    const del = await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'DELETE', headers: H() })
    expect(((await del.json()) as Theme).logo).toBeNull()

  })

  it("lists a light theme's logo for its printouts, to guests too, and none once it is removed", async () => {
    const { app } = setup()
    const theme = (await (await post(app, '/api/themes', { name: 'Hell' })).json()) as Theme
    const list = async () => ((await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as ThemeInfo[]).find((x) => x.id === theme.id)
    expect((await list())?.printLogo).toBeNull()
    const form = new FormData()
    form.append('file', new File([PNG], 'logo.png', { type: 'image/png' }))
    const withLogo = (await (await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': OWNER }, body: form })).json()) as Theme
    expect((await list())?.printLogo).toBe(`/api/themes/${theme.id}/logo?v=${encodeURIComponent(withLogo.logo!.updatedAt)}`)
    await app.request(`${BASE}/api/themes/${theme.id}/logo`, { method: 'DELETE', headers: H() })
    expect((await list())?.printLogo).toBeNull()
  })

  it('tells whether a theme folder sets a dark ground', async () => {
    const { app, themesDir } = setup()
    const list = async () => (await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as ThemeInfo[]
    expect((await list()).find((x) => x.id === 'demo')?.dark).toBe(false)
    mkdirSync(path.join(themesDir, 'night'))
    writeFileSync(path.join(themesDir, 'night', 'theme.css'), '[data-theme="night"] {\n  --bg: #22272E; --fg: #F4F2EE;\n}')
    expect((await list()).find((x) => x.id === 'night')?.dark).toBe(true)
  })

  it('lists the logo a theme folder keeps beside its theme.css', async () => {
    const { app, themesDir } = setup()
    const list = async () => (await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as ThemeInfo[]
    expect((await list()).find((x) => x.id === 'demo')?.printLogo).toBeNull()
    writeFileSync(path.join(themesDir, 'demo', 'logo.png'), PNG)
    expect((await list()).find((x) => x.id === 'demo')?.printLogo).toBe('/api/themes/demo/logo.png')
    const res = await app.request(`${BASE}/api/themes/demo/logo.png`, { headers: H(GUEST) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
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

    const deck = repo.createDeck({ title: 'Pool', theme: theme.id, source: '', slides: [] })
    const ws = (await (await post(app, '/api/workshops', { title: 'W' })).json()) as WorkshopState
    await post(app, `/api/workshops/${ws.workshop.id}/ops`, { clientId: 'c', ops: [{ op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { theme: theme.id } }] })
    await post(app, '/api/settings', { ...repo.getSettings(), logo: undefined, theme: theme.id }, OWNER, 'PUT')
    expect(repo.getSettings().theme).toBe(theme.id)
    const events: unknown[] = []
    hub.subscribe(ws.workshop.id, (e) => events.push(e))
    expect((await app.request(`${BASE}/api/themes/${theme.id}`, { method: 'DELETE', headers: H() })).status).toBe(200)
    expect(repo.loadWorkshop(ws.workshop.id)?.workshop.theme).toBe('')
    expect(repo.getSettings().theme).toBe('')
    expect(repo.getDeck(deck.deck.id)?.deck.theme).toBe('')
    // a window that still has the old settings cannot set the deleted theme as the default again
    await post(app, '/api/settings', { ...repo.getSettings(), logo: undefined, theme: theme.id }, OWNER, 'PUT')
    expect(repo.getSettings().theme).toBe('')
    expect(events).toEqual([{ type: 'ops', clientId: 'server', ops: [{ op: 'set', entity: 'workshop', id: ws.workshop.id, fields: { theme: '' } }] }])
    expect((await app.request(`${BASE}/api/themes/${theme.id}/theme.css`, { headers: H() })).status).toBe(404)
    expect((await app.request(`${BASE}/api/themes/${copy.id}/theme.css`, { headers: H() })).status).toBe(200)
  })

  it('keeps own rules and files: served under the theme, copied with it, gone with it', async () => {
    const { app, filesDir } = setup()
    const theme = (await (await post(app, '/api/themes', { name: 'Marke', css: ':scope .slide h1 { font-weight: 900; }', tokens: { displayWeight: 900 } })).json()) as Theme
    expect(theme.css).toBe(':scope .slide h1 { font-weight: 900; }')
    expect(theme.tokens.displayWeight).toBe(900)
    const upload = (filePath: string | null, name = 'x.ttf', id = theme.id) => {
      const form = new FormData()
      form.append('file', new File([PNG], name, { type: 'application/octet-stream' }))
      if (filePath !== null) form.append('path', filePath)
      return app.request(`${BASE}/api/themes/${id}/files`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': OWNER }, body: form })
    }
    expect((await upload('fonts/Brand.ttf')).status).toBe(201)
    const withFiles = (await (await upload(null, 'mark.svg')).json()) as Theme
    expect(withFiles.files.map((f) => [f.path, f.mime])).toEqual([
      ['fonts/Brand.ttf', 'font/ttf'],
      ['mark.svg', 'image/svg+xml'],
    ])
    for (const bad of ['../x.ttf', 'theme.css', 'fonts/x.js']) expect((await upload(bad)).status).toBe(400)
    await post(app, `/api/themes/${theme.id}`, { css: "@font-face { font-family: 'Brand'; src: url(fonts/Brand.ttf); }\n:scope { --mark: url('mark.svg'); }" }, OWNER, 'PUT')
    const css = await (await app.request(`${BASE}/api/themes/${theme.id}/theme.css`, { headers: H(GUEST) })).text()
    expect(css).toContain(`src: url(/api/themes/${theme.id}/fonts/Brand.ttf?v=`)
    expect(css).toContain(`[data-theme="${theme.id}"] { --mark: url('/api/themes/${theme.id}/mark.svg?v=`)
    expect(css).toContain('--display-weight: 900;')
    const font = await app.request(`${BASE}/api/themes/${theme.id}/fonts/Brand.ttf`, { headers: H(GUEST) })
    expect(font.status).toBe(200)
    expect(font.headers.get('content-type')).toBe('font/ttf')
    expect((await app.request(`${BASE}/api/themes/${theme.id}/fonts/Other.ttf`, { headers: H(GUEST) })).status).toBe(404)
    // own rules stay inside the stylesheet and the theme
    expect((await post(app, `/api/themes/${theme.id}`, { css: '</style><script>' }, OWNER, 'PUT')).status).toBe(400)
    expect((await post(app, `/api/themes/${theme.id}`, { css: "@import url('https://example.com/x.css');" }, OWNER, 'PUT')).status).toBe(400)
    // a copy takes rules and files along
    const copy = (await (await post(app, '/api/themes', { name: 'Kopie', from: theme.id })).json()) as Theme
    expect(copy.css).toContain('--mark')
    expect(copy.files.map((f) => f.path)).toEqual(['fonts/Brand.ttf', 'mark.svg'])
    expect((await app.request(`${BASE}/api/themes/${copy.id}/mark.svg`, { headers: H() })).status).toBe(200)
    // removing a file and deleting the theme take the files from the disk
    const without = await app.request(`${BASE}/api/themes/${theme.id}/files?path=mark.svg`, { method: 'DELETE', headers: H() })
    expect(((await without.json()) as Theme).files.map((f) => f.path)).toEqual(['fonts/Brand.ttf'])
    expect((await app.request(`${BASE}/api/themes/${theme.id}/mark.svg`, { headers: H() })).status).toBe(404)
    expect((await app.request(`${BASE}/api/themes/${theme.id}/files`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': GUEST }, body: new FormData() })).status).toBe(403)
    await app.request(`${BASE}/api/themes/${theme.id}`, { method: 'DELETE', headers: H() })
    expect(existsSync(path.join(filesDir, 'theme-files', theme.id))).toBe(false)
    expect(existsSync(path.join(filesDir, 'theme-files', copy.id, 'mark.svg'))).toBe(true)
  })

  it('takes over a theme folder when created with its name as id', async () => {
    const { app } = setup()
    expect((await (await app.request(`${BASE}/api/themes/demo/theme.css`, { headers: H() })).text())).toContain('--bg: #fff')
    const taken = (await (await post(app, '/api/themes', { id: 'demo', name: 'Demo als Daten' })).json()) as Theme
    expect(taken.id).toBe('demo')
    const list = (await (await app.request(`${BASE}/api/themes`, { headers: H(GUEST) })).json()) as { id: string; kind: string }[]
    expect(list.map((t) => [t.id, t.kind])).toEqual([
      ['default', 'builtin'],
      ['demo', 'data'],
    ])
    expect((await (await app.request(`${BASE}/api/themes/demo/theme.css`, { headers: H() })).text())).toContain('--bg: #FBFAF8')
    expect((await post(app, '/api/themes', { id: 'demo', name: 'Noch einmal' })).status).toBe(400)
    expect((await post(app, '/api/themes', { id: 'default', name: 'Standard' })).status).toBe(400)
    expect((await post(app, '/api/themes', { id: 'Bad Id', name: 'x' })).status).toBe(400)
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

describe('the asset pool of a theme', () => {
  const upload = (app: ReturnType<typeof setup>['app'], url: string, fields: Record<string, string>, email = OWNER) => {
    const form = new FormData()
    form.append('file', new File([PNG], 'pic.png', { type: 'image/png' }))
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    return app.request(`${BASE}${url}`, { method: 'POST', headers: { 'x-sp': '1', 'x-auth-request-email': email }, body: form })
  }
  it('takes uploads and known assets with tags, is read by guests, travels with a copy, goes with the theme, and keeps its assets from the sweep', async () => {
    const { app, repo } = setup()
    const theme = (await (await post(app, '/api/themes', { name: 'Pool' })).json()) as Theme
    // an upload with its kind and tags typed as one line
    const res = await upload(app, `/api/themes/${theme.id}/pool`, { kind: 'icon', tags: 'Team, Gespräch,, team' })
    expect(res.status).toBe(201)
    const icon = (await res.json()) as { hash: string; kind: string; tags: string[] }
    expect(icon.kind).toBe('icon')
    expect(icon.tags).toEqual(['team', 'gespräch'])
    // the same bytes again, as a picture this time: the asset is one, the pool entry keeps its kind and takes the new tags
    const again = (await (await upload(app, `/api/themes/${theme.id}/pool`, { kind: 'picture', tags: 'see' })).json()) as { hash: string; kind: string; tags: string[] }
    expect(again.hash).toBe(icon.hash)
    expect(again.kind).toBe('icon')
    expect(again.tags).toEqual(['see'])
    expect((await upload(app, `/api/themes/${theme.id}/pool`, { kind: 'banner' })).status).toBe(400)
    expect((await upload(app, `/api/themes/${theme.id}/pool`, { kind: 'icon' }, GUEST)).status).toBe(403)
    // a known asset by hash
    const other = repo.addAsset({ hash: 'a'.repeat(64), mime: 'image/png', size: 1 })
    expect((await post(app, `/api/themes/${theme.id}/pool`, { hash: other.hash, kind: 'picture', tags: ['Luftbild'] })).status).toBe(201)
    expect((await post(app, `/api/themes/${theme.id}/pool`, { hash: 'b'.repeat(64), kind: 'picture' })).status).toBe(404)
    // listed for everyone who sees the theme, in kind order
    const list = (await (await app.request(`${BASE}/api/themes/${theme.id}/pool`, { headers: H(GUEST) })).json()) as { hash: string; kind: string; tags: string[] }[]
    expect(list.map((e) => [e.kind, e.tags])).toEqual([
      ['icon', ['see']],
      ['picture', ['luftbild']],
    ])
    // tags and position change; the theme counts as changed
    const before = (await (await app.request(`${BASE}/api/themes/${theme.id}`, { headers: H() })).json()) as Theme
    await new Promise((r) => setTimeout(r, 2))
    expect((await post(app, `/api/themes/${theme.id}/pool/${icon.hash}`, { tags: ['Zwei Personen'] }, OWNER, 'PUT')).status).toBe(200)
    expect(repo.getPoolAsset(theme.id, icon.hash)?.tags).toEqual(['zwei personen'])
    const after = (await (await app.request(`${BASE}/api/themes/${theme.id}`, { headers: H() })).json()) as Theme
    expect(after.updatedAt > before.updatedAt).toBe(true)
    // a guest of a workshop loads a pool asset through the workshop's route although no slide shows it
    const ws = (await (await post(app, '/api/workshops', { title: 'Teamtag', date: '2026-11-10' })).json()) as WorkshopState
    await app.request(`${BASE}/api/workshops/${ws.workshop.id}/members/${GUEST}`, { method: 'PUT', headers: H(), body: JSON.stringify({ role: 'view', showNotes: false }) })
    expect((await app.request(`${BASE}/api/workshops/${ws.workshop.id}/assets/${icon.hash}`, { headers: H(GUEST) })).status).toBe(200)
    // the sweep leaves pool assets alone
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 0 })
    // a copy takes the pool along
    const copy = (await (await post(app, '/api/themes', { name: 'Kopie', from: theme.id })).json()) as Theme
    expect(repo.listPool(copy.id).map((e) => e.hash).sort()).toEqual([icon.hash, other.hash].sort())
    // removed from the pool, and the pool goes with the theme
    expect((await post(app, `/api/themes/${theme.id}/pool/${other.hash}`, undefined, OWNER, 'DELETE')).status).toBe(200)
    expect(repo.listPool(theme.id).map((e) => e.hash)).toEqual([icon.hash])
    await post(app, `/api/themes/${copy.id}`, undefined, OWNER, 'DELETE')
    expect(repo.listPool(copy.id)).toEqual([])
    // once no pool holds it and no slide shows it, the sweep removes it
    await post(app, `/api/themes/${theme.id}/pool/${icon.hash}`, undefined, OWNER, 'DELETE')
    expect(await (await app.request(`${BASE}/api/assets/sweep`, { method: 'POST', headers: H() })).json()).toEqual({ removed: 2 })
  })
})
