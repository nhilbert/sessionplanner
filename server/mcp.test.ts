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

  it('lists the tools, creates a workshop and drafts an agenda with computed times', async () => {
    const { client, ready } = connect(app)
    await ready
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['workshop_list', 'workshop_get', 'workshop_create', 'item_create_many', 'item_move', 'group_create', 'packing_update', 'library_insert', 'settings_get']))
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
})
