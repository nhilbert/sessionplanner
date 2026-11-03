import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { DEFAULT_TOKENS } from '../src/domain/theme.ts'
import { mcpRoutes } from './mcp.ts'

const TOKEN = 'test-token'

function connect(app: ReturnType<typeof createApp>, token = TOKEN) {
  const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5175/mcp'), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: (url, init) => app.request(String(url), init as RequestInit),
  })
  const client = new Client({ name: 'test', version: '1' })
  return { client, ready: client.connect(transport) }
}

const json = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text)

describe('MCP endpoint', () => {
  const repo = new Repo(openDb(':memory:'))
  const hub = new Hub()
  const app = createApp({ repo, hub, filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')), owners: [], ownerHeader: 'x-auth-request-email', mcp: mcpRoutes(repo, { token: TOKEN }, { hub }) })

  it('rejects requests without the token', async () => {
    const res = await app.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
    const { ready } = connect(app, 'wrong')
    await expect(ready).rejects.toThrow()
  })

  it('takes calls as large as an operation batch, refuses larger bodies, and checks a new workshop like the app', async () => {
    const call = (title: string) =>
      app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'workshop_create', arguments: { title } } }),
      })
    expect((await call('x'.repeat(4.5 * 1024 * 1024))).status).toBe(413)
    // Within the limit the body is read, and the title is refused as too long for a workshop.
    const res = await call('x'.repeat(1.5 * 1024 * 1024))
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('isError')
  })

  it('lists the tools, creates a workshop and drafts an agenda with computed times', async () => {
    const { client, ready } = connect(app)
    await ready
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['workshop_list', 'workshop_get', 'workshop_create', 'item_create_many', 'item_move', 'group_create', 'packing_update', 'library_insert', 'library_create', 'library_update', 'library_delete', 'settings_get']))
    const tools = (await client.listTools()).tools
    expect(tools.find((t) => t.name === 'workshop_get')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === 'item_delete')?.annotations?.destructiveHint).toBe(true)
    const ws = json(await client.callTool({ name: 'workshop_create', arguments: { title: 'Strategietag', client: 'Beispiel GmbH', date: '2026-12-01', start: '09:30', end: '16:00' } }))
    expect(ws.days[0]).toMatchObject({ date: '2026-12-01', start: '09:30', end: '16:00' })
    const items = json(await client.callTool({ name: 'item_create_many', arguments: { workshop: 'Strategietag', day: 1, items: [{ title: 'Check-in', duration: 20 }, { title: 'Lagebild', duration: 70, method: 'Input + Fragen' }] } }))
    expect(items.map((i: { title: string; start: string; end: string }) => [i.title, i.start, i.end])).toEqual([
      ['Check-in', '09:30', '09:50'],
      ['Lagebild', '09:50', '11:00'],
    ])
    expect(repo.listWorkshops()[0]).toMatchObject({ title: 'Strategietag', itemCount: 2 })
    await client.close()
  })

  it('returns validation problems as tool errors', async () => {
    const { client, ready } = connect(app)
    await ready
    const r = await client.callTool({ name: 'item_create', arguments: { workshop: 'does not exist', day: 1, title: 'x' } })
    expect(r.isError).toBe(true)
    expect(json(r).error).toMatch(/no workshop/)
    const bad = await client.callTool({ name: 'item_create', arguments: { workshop: 'Strategietag', day: 1, title: 'x', materials: [{ label: 'x', link: 'javascript:alert(1)' }] } })
    expect(bad.isError).toBe(true)
    expect(json(bad).error).toMatch(/invalid ops/)
    await client.close()
  })

  it('reads the slide format and writes, edits and reads the slides of a step', async () => {
    const { client, ready } = connect(app)
    await ready
    const tools = (await client.listTools()).tools
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['slide_format', 'slide_list', 'slide_get', 'slide_add', 'slide_update', 'slide_remove', 'slide_set', 'pool_search', 'theme_pool', 'deck_outline']))
    expect(tools.find((t) => t.name === 'slide_update')?.annotations?.destructiveHint).toBe(true)
    const format = json(await client.callTool({ name: 'slide_format', arguments: { layout: 'statement' } }))
    expect(format.example).toMatch(/^<section class="slide statement">/)
    const added = json(await client.callTool({ name: 'slide_add', arguments: { workshop: 'Strategietag', item: 'Check-in', html: format.example } }))
    expect(added).toMatchObject({ item: 'Check-in', count: 1, added: [1] })
    const edited = json(await client.callTool({ name: 'slide_update', arguments: { workshop: 'Strategietag', item: 'Check-in', slide: 1, replace: [{ find: 'Leitfrage', with: 'Einstieg' }] } }))
    expect(edited.updated.html).toContain('<div class="eyebrow">Einstieg</div>')
    const one = json(await client.callTool({ name: 'slide_get', arguments: { workshop: 'Strategietag', item: 'Check-in', slide: 1 } }))
    expect(one).toMatchObject({ n: 1, layout: 'statement', html: edited.updated.html })
    const outline = json(await client.callTool({ name: 'deck_outline', arguments: { workshop: 'Strategietag', agenda: false } }))
    expect(outline.deck.map((d: { generated?: string; item?: string }) => d.generated ?? d.item)).toEqual(['title', 'Check-in'])
    expect(json(await client.callTool({ name: 'settings_get', arguments: {} })).themes).toEqual([{ id: 'default', name: 'default' }])
    // the picture pool of a theme: empty for the built-in one, the entries with their tags for a data theme
    expect(json(await client.callTool({ name: 'theme_pool', arguments: {} }))).toEqual({ theme: 'default', pictures: [], icons: [] })
    repo.createTheme({ id: 'sr', name: 'SR', tokens: DEFAULT_TOKENS })
    repo.addAsset({ hash: 'a'.repeat(64), mime: 'image/png', size: 1 })
    repo.addPoolAsset('sr', { hash: 'a'.repeat(64), kind: 'icon', tags: ['team', 'gespräch'] })
    expect(json(await client.callTool({ name: 'theme_pool', arguments: { theme: 'sr' } }))).toEqual({ theme: 'sr', pictures: [], icons: [{ asset: 'a'.repeat(64), tags: ['team', 'gespräch'] }] })
    await client.close()
  })

  it('adds, changes and deletes library entries', async () => {
    const { client, ready } = connect(app)
    await ready
    const tools = (await client.listTools()).tools
    expect(tools.find((t) => t.name === 'library_get')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === 'library_update')?.annotations?.destructiveHint).toBe(true)
    const created = json(await client.callTool({ name: 'library_create', arguments: { title: 'Einstieg', items: [{ title: 'Check-in', duration: 20, category: 'energizer' }, { title: 'Erwartungen', duration: 45, materials: [{ label: 'Karten', qty: 100 }] }] } }))
    expect(created).toMatchObject({ kind: 'group', title: 'Einstieg', items: [{ title: 'Check-in', category: 'energizer' }, { title: 'Erwartungen', materials: [{ label: 'Karten', qty: 100 }] }] })
    const changed = json(await client.callTool({ name: 'library_update', arguments: { entry: 'Einstieg', item: 2, duration: 60, category: null, notes: 'Karten an die Pinnwand', at: 0 } }))
    expect(changed.items.map((i: { title: string; duration: number }) => [i.title, i.duration])).toEqual([
      ['Erwartungen', 60],
      ['Check-in', 20],
    ])
    expect(json(await client.callTool({ name: 'library_get', arguments: { entry: 'Einstieg' } })).items[0]).toMatchObject({ notes: 'Karten an die Pinnwand' })
    const bad = await client.callTool({ name: 'library_update', arguments: { entry: 'Einstieg', duration: 5 } })
    expect(bad.isError).toBe(true)
    expect(json(bad).error).toMatch(/give the item inside it/)
    expect(json(await client.callTool({ name: 'library_delete', arguments: { entry: 'Einstieg' } }))).toEqual({ deleted: 'Einstieg', kind: 'group' })
    expect(repo.listLibrary()).toEqual([])
    await client.close()
  })
})
