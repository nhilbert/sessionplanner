import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createRuntime, RefusedStart, type Runtime, type RuntimeOptions } from './runtime.ts'
import type { ServerEvent } from '../src/domain/ops.ts'
import type { WorkshopState } from '../src/domain/types.ts'

/** Lets the start fail after the database is open. */
const startup = vi.hoisted(() => ({ fails: false }))
vi.mock('./app.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./app.ts')>()
  return {
    ...real,
    createApp: (...args: Parameters<typeof real.createApp>) => {
      if (startup.fails) throw new Error('no app')
      return real.createApp(...args)
    },
  }
})

const dirs: string[] = []
const open: Runtime[] = []

/** A local runtime in a folder of its own. */
function start(options: Partial<RuntimeOptions> = {}): Runtime {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sp-runtime-'))
  dirs.push(dataDir)
  const runtime = createRuntime({ dataDir, owners: [], ownerHeader: 'x-auth-request-email', ...options })
  open.push(runtime)
  return runtime
}

const call = (r: Runtime, url: string, init: RequestInit = {}) =>
  r.app.request(`http://127.0.0.1${url}`, { ...init, headers: { 'x-sp': '1', 'content-type': 'application/json', ...init.headers } })
const create = async (r: Runtime, title: string) => (await (await call(r, '/api/workshops', { method: 'POST', body: JSON.stringify({ title }) })).json()) as WorkshopState
const titles = async (r: Runtime) => ((await (await call(r, '/api/workshops')).json()) as { title: string }[]).map((w) => w.title)

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const r of open.splice(0)) await r.close()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('createRuntime', () => {
  it('keeps two runtimes in one process apart', async () => {
    const a = start()
    const b = start()
    const made = await create(a, 'Only in A')
    await create(b, 'Only in B')
    expect(await titles(a)).toEqual(['Only in A'])
    expect(await titles(b)).toEqual(['Only in B'])
    expect((await call(b, `/api/workshops/${made.workshop.id}`)).status).toBe(404)
  })

  it('passes live updates only within a runtime', () => {
    const a = start()
    const b = start()
    const heard: ServerEvent[] = []
    b.hub.subscribe('same-id', (e) => heard.push(e))
    a.hub.publish('same-id', { type: 'workshop-deleted' })
    expect(heard).toEqual([])
    b.hub.publish('same-id', { type: 'workshop-deleted' })
    expect(heard).toEqual([{ type: 'workshop-deleted' }])
  })

  it('keeps database, backups and files in its own folder', async () => {
    const r = start()
    const dataDir = path.dirname(r.dbFile)
    expect(r.dbFile).toBe(path.join(dataDir, 'sessions.db'))
    expect(r.backup).toMatch(new RegExp(`^${dataDir}/backups/sessions-\\d{4}-\\d{2}-\\d{2}\\.db$`))
    expect(existsSync(r.backup!)).toBe(true)
    const made = await create(r, 'With a file')
    const form = new FormData()
    form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    const res = await r.app.request(`http://127.0.0.1/api/workshops/${made.workshop.id}/attachments`, { method: 'POST', headers: { 'x-sp': '1' }, body: form })
    expect(res.status).toBe(201)
    expect(readdirSync(path.join(dataDir, 'files'))).toHaveLength(1)
  })

  it('refuses a hosted start without owners, before it touches the disk', () => {
    const dataDir = path.join(tmpdir(), `sp-runtime-refused-${process.pid}`)
    expect(() => createRuntime({ dataDir, publicUrl: new URL('https://sessions.example.com'), owners: [], ownerHeader: 'x-auth-request-email' })).toThrow(RefusedStart)
    expect(existsSync(dataDir)).toBe(false)
  })

  it('warns once per hosted runtime without a proxy secret, and not with one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const hosted = { publicUrl: new URL('https://sessions.example.com'), owners: ['owner@example.com'] }
    start({ ...hosted, proxySecret: 'secret' })
    expect(warn).not.toHaveBeenCalled()
    start(hosted)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('writes each runtime\'s own base path into the addresses of its themes', async () => {
    const png = new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], 'logo.png', { type: 'image/png' })
    const logoOf = async (r: Runtime) => {
      await call(r, '/api/themes', { method: 'POST', body: JSON.stringify({ name: 'Marke', id: 'marke' }) })
      const form = new FormData()
      form.set('file', png)
      await r.app.request('http://127.0.0.1/api/themes/marke/logo', { method: 'POST', headers: { 'x-sp': '1' }, body: form })
      const css = await (await call(r, '/api/themes/marke/theme.css')).text()
      const list = (await (await call(r, '/api/themes')).json()) as { id: string; printLogo?: string | null }[]
      return { css, printLogo: list.find((t) => t.id === 'marke')!.printLogo }
    }
    const [a, b, root] = [await logoOf(start({ basePath: '/base/a' })), await logoOf(start({ basePath: '/base/b' })), await logoOf(start())]
    expect(a.printLogo).toMatch(/^\/base\/a\/api\/themes\/marke\/logo\?v=/)
    expect(b.printLogo).toMatch(/^\/base\/b\/api\/themes\/marke\/logo\?v=/)
    expect(root.printLogo).toMatch(/^\/api\/themes\/marke\/logo\?v=/)
    expect(a.css).toContain('/base/a/api/themes/marke/logo')
    expect(b.css).not.toContain('/base/a/')
  })

  it('offers MCP and OAuth only when asked', async () => {
    const off = start()
    expect(off.mcp).toBeUndefined()
    expect(off.oauth).toBeUndefined()
    const token = start({ mcpToken: 'token' })
    expect(token.mcp).toBeDefined()
    expect(token.oauth).toBeUndefined()
    const both = start({ mcpOAuth: { baseUrl: new URL('http://127.0.0.1:5175'), extraRedirects: [] } })
    expect(both.mcp).toBeDefined()
    expect(both.oauth?.resource).toBe('http://127.0.0.1:5175/mcp')
  })

  it('keeps a bad data folder from stopping another one', async () => {
    const bad = mkdtempSync(path.join(tmpdir(), 'sp-runtime-'))
    dirs.push(bad)
    writeFileSync(path.join(bad, 'sessions.db'), 'this is not a database, and it is long enough to be read as one')
    expect(() => createRuntime({ dataDir: bad, owners: [], ownerHeader: 'x-auth-request-email' })).toThrow()
    const good = start()
    await create(good, 'Still here')
    expect(await titles(good)).toEqual(['Still here'])
  })

  it('closes the database again when the start fails after opening it', () => {
    const close = vi.spyOn(DatabaseSync.prototype, 'close')
    const dataDir = mkdtempSync(path.join(tmpdir(), 'sp-runtime-'))
    dirs.push(dataDir)
    startup.fails = true
    expect(() => createRuntime({ dataDir, owners: [], ownerHeader: 'x-auth-request-email' })).toThrow('no app')
    startup.fails = false
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('starts although the backup at start fails, says so, and the hourly check makes it up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
    const failed = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dataDir = mkdtempSync(path.join(tmpdir(), 'sp-runtime-'))
    dirs.push(dataDir)
    const backups = path.join(dataDir, 'backups')
    writeFileSync(backups, 'a file where the folder belongs')
    const r = createRuntime({ dataDir, owners: [], ownerHeader: 'x-auth-request-email' })
    open.push(r)
    expect(r.backup).toBeNull()
    expect(failed).toHaveBeenCalledTimes(1)
    await create(r, 'Up')
    expect(await titles(r)).toEqual(['Up'])
    rmSync(backups)
    vi.advanceTimersByTime(60 * 60 * 1000)
    await vi.waitFor(() => expect(existsSync(path.join(backups, 'sessions-2026-11-05.db'))).toBe(true))
  })

  it('can make the day\'s backup after the start, for a runtime opened while others are in use', async () => {
    const r = start({ backupInBackground: true })
    expect(r.backup).toBeNull()
    const backups = path.join(path.dirname(r.dbFile), 'backups')
    await vi.waitFor(() => expect(existsSync(backups) && readdirSync(backups).filter((f) => f.endsWith('.db'))).toHaveLength(1))
  })

  it('may be closed twice', async () => {
    const r = start()
    open.splice(open.indexOf(r), 1)
    await r.close()
    await expect(r.close()).resolves.toBeUndefined()
  })

  it('refuses OAuth under a base path, which would announce the wrong addresses', () => {
    const dataDir = path.join(tmpdir(), `sp-runtime-oauth-${process.pid}`)
    expect(() => createRuntime({ dataDir, owners: [], ownerHeader: 'x', basePath: '/base', mcpOAuth: { baseUrl: new URL('https://sessions.example.com'), extraRedirects: [] } })).toThrow(RefusedStart)
    expect(existsSync(dataDir)).toBe(false)
  })

  it('refuses a base path that would make every address wrong, and tidies a slash at the end', async () => {
    expect(() => start({ basePath: 'base' })).toThrow('Not a base path')
    const r = start({ basePath: '/base/' })
    await call(r, '/api/themes', { method: 'POST', body: JSON.stringify({ name: 'Marke', id: 'marke' }) })
    const form = new FormData()
    form.set('file', new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], 'logo.png', { type: 'image/png' }))
    await r.app.request('http://127.0.0.1/api/themes/marke/logo', { method: 'POST', headers: { 'x-sp': '1' }, body: form })
    const list = (await (await call(r, '/api/themes')).json()) as { id: string; printLogo?: string | null }[]
    expect(list.find((t) => t.id === 'marke')!.printLogo).toMatch(/^\/base\/api\/themes\//)
  })

  it('survives a failed backup, says so, and tries again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
    const failed = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = start()
    const backups = path.join(path.dirname(r.dbFile), 'backups')
    rmSync(backups, { recursive: true })
    writeFileSync(backups, 'a file where the folder belongs')
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1))
    expect(failed.mock.calls[0][0]).toContain('Backup of')
    await create(r, 'Still answering')
    expect(await titles(r)).toEqual(['Still answering'])

    rmSync(backups)
    vi.advanceTimersByTime(60 * 60 * 1000)
    await vi.waitFor(() => expect(existsSync(path.join(backups, 'sessions-2026-11-06.db'))).toBe(true))
  })

  it('waits for a backup under way before it closes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
    const r = start()
    const backups = path.join(path.dirname(r.dbFile), 'backups')
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    open.splice(open.indexOf(r), 1)
    await r.close()
    expect(readdirSync(backups).sort()).toEqual(['sessions-2026-11-05.db', 'sessions-2026-11-06.db'])
  })

  it('checks hourly for a new day, and close stops that', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
    const r = start()
    const backups = path.join(path.dirname(r.dbFile), 'backups')
    expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db'])
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    await vi.waitFor(() => expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db', 'sessions-2026-11-06.db']))

    open.splice(open.indexOf(r), 1)
    await r.close()
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(readdirSync(backups)).toHaveLength(2)
  })
})
