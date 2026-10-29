import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { newId } from '../src/domain/ops.ts'
import type { Repo } from './repo.ts'
import type { Hub } from './hub.ts'
import { guard, type GuardOptions } from './guard.ts'
import { BadRequest, validateDuplicate, validateLibraryEntry, validateNewWorkshop, validateOps, validateSettings } from './validate.ts'

export const MAX_FILE = 25 * 1024 * 1024
export const MAX_LOGO = 2 * 1024 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export interface AppOptions extends GuardOptions {
  repo: Repo
  hub: Hub
  /** Where attachment files live (data/files). */
  filesDir: string
  /** Directory with the built client (dist). When set, the server serves the UI too. */
  staticDir?: string
  /** Seconds between keep-alive pings on the live-update stream. */
  pingSeconds?: number
}

// The built UI loads only its own files; nothing a user typed can run as script.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

export function createApp({ repo, hub, filesDir, staticDir, publicUrl, owners, ownerHeader, pingSeconds = 25 }: AppOptions): Hono {
  const app = new Hono()
  const filePath = (id: string) => path.join(filesDir, id)

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
  })
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.use('/api/*', guard({ publicUrl, owners, ownerHeader }))
  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400)
    console.error('API error:', err)
    return c.json({ error: 'error' }, 500)
  })

  app.get('/api/workshops', (c) => c.json(repo.listWorkshops()))
  app.post('/api/workshops', async (c) => c.json(repo.createWorkshop(validateNewWorkshop(await c.req.json().catch(() => ({})))), 201))
  app.get('/api/workshops/:id', (c) => {
    const state = repo.loadWorkshop(c.req.param('id'))
    return state ? c.json(state) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/workshops/:id', async (c) => {
    const id = c.req.param('id')
    const files = repo.deleteWorkshop(id)
    if (!files) return c.json({ error: 'not_found' }, 404)
    await Promise.all(files.map((f) => rm(filePath(f), { force: true })))
    hub.publish(id, { type: 'workshop-deleted' })
    return c.json({ ok: true })
  })

  app.post('/api/workshops/:id/duplicate', async (c) => {
    const result = repo.duplicateWorkshop(c.req.param('id'), validateDuplicate(await c.req.json()))
    if (!result) return c.json({ error: 'not_found' }, 404)
    await mkdir(filesDir, { recursive: true })
    // A file missing on disk stays listed but fails its download, as in the original.
    await Promise.all(Object.entries(result.files).map(([from, to]) => copyFile(filePath(from), filePath(to)).catch(() => undefined)))
    return c.json(result.state, 201)
  })

  app.post('/api/workshops/:id/ops', bodyLimit({ maxSize: 4 * 1024 * 1024 }), async (c) => {
    const id = c.req.param('id')
    const { clientId, ops } = validateOps(await c.req.json())
    const stored = repo.applyOps(id, ops)
    if (!stored) return c.json({ error: 'not_found' }, 404)
    if (stored.length) hub.publish(id, { type: 'ops', clientId, ops: stored })
    return c.json({ ok: true, ops: stored })
  })

  app.get('/api/workshops/:id/events', (c) => {
    const id = c.req.param('id')
    if (!repo.loadWorkshop(id)) return c.json({ error: 'not_found' }, 404)
    c.header('Cache-Control', 'no-store')
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(id, (event) => void stream.writeSSE({ data: JSON.stringify(event) }))
      stream.onAbort(unsubscribe)
      await stream.writeSSE({ event: 'hello', data: '' })
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(pingSeconds * 1000)
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' })
      }
      unsubscribe()
    })
  })

  app.post('/api/workshops/:id/attachments', bodyLimit({ maxSize: MAX_FILE + 64 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }), async (c) => {
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (file.size > MAX_FILE) return c.json({ error: 'too_large' }, 413)
    const id = newId()
    await mkdir(filesDir, { recursive: true })
    await writeFile(filePath(id), Buffer.from(await file.arrayBuffer()))
    const name = (file.name || 'file').replace(/[\\/\r\n]/g, '_').slice(0, 250)
    const attachment = repo.addAttachment(c.req.param('id'), { id, name, mime: file.type || 'application/octet-stream', size: file.size })
    if (!attachment) {
      await rm(filePath(id), { force: true })
      return c.json({ error: 'not_found' }, 404)
    }
    hub.publish(attachment.workshopId, { type: 'attachment', attachment })
    return c.json(attachment, 201)
  })

  app.get('/api/attachments/:id', async (c) => {
    const att = repo.getAttachment(c.req.param('id'))
    if (!att) return c.json({ error: 'not_found' }, 404)
    const data = await readFile(filePath(att.id)).catch(() => null)
    if (!data) return c.json({ error: 'not_found' }, 404)
    // Always a download, never rendered in the app's origin (an uploaded HTML or SVG file must not run).
    return c.body(new Uint8Array(data), 200, {
      'Content-Type': att.mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    })
  })

  app.delete('/api/attachments/:id', async (c) => {
    const result = repo.deleteAttachment(c.req.param('id'))
    if (!result) return c.json({ error: 'not_found' }, 404)
    await rm(filePath(c.req.param('id')), { force: true })
    hub.publish(result.workshopId, { type: 'attachment-deleted', id: c.req.param('id') })
    if (result.ops.length) hub.publish(result.workshopId, { type: 'ops', clientId: 'server', ops: result.ops })
    return c.json({ ok: true })
  })

  // ---- settings and logo -------------------------------------------------------------------------
  const logoPath = path.join(filesDir, 'logo')
  app.get('/api/settings', (c) => c.json(repo.getSettings()))
  app.put('/api/settings', async (c) => c.json(repo.saveSettings({ ...validateSettings(await c.req.json()), logo: repo.getSettings().logo })))

  app.post('/api/settings/logo', bodyLimit({ maxSize: MAX_LOGO + 64 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }), async (c) => {
    const file = (await c.req.parseBody()).file
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (!LOGO_TYPES.includes(file.type)) throw new BadRequest('png, jpeg, webp or svg only')
    if (file.size > MAX_LOGO) return c.json({ error: 'too_large' }, 413)
    await mkdir(filesDir, { recursive: true })
    await writeFile(logoPath, Buffer.from(await file.arrayBuffer()))
    return c.json(repo.saveSettings({ ...repo.getSettings(), logo: { mime: file.type, updatedAt: new Date().toISOString() } }))
  })
  app.get('/api/settings/logo', async (c) => {
    const logo = repo.getSettings().logo
    const data = logo && (await readFile(logoPath).catch(() => null))
    if (!logo || !data) return c.json({ error: 'not_found' }, 404)
    // Shown as <img>; opened on its own, an SVG still cannot run script in the app's origin.
    return c.body(new Uint8Array(data), 200, { 'Content-Type': logo.mime, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=300' })
  })
  app.delete('/api/settings/logo', async (c) => {
    await rm(logoPath, { force: true })
    return c.json(repo.saveSettings({ ...repo.getSettings(), logo: null }))
  })

  // ---- library -------------------------------------------------------------------------------------
  app.get('/api/library', (c) => c.json(repo.listLibrary()))
  app.post('/api/library', async (c) => c.json(repo.saveLibraryEntry(null, validateLibraryEntry(await c.req.json())), 201))
  app.put('/api/library/:id', async (c) => {
    const entry = repo.saveLibraryEntry(c.req.param('id'), validateLibraryEntry(await c.req.json()))
    return entry ? c.json(entry) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/library/:id', (c) => (repo.deleteLibraryEntry(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)))

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  if (staticDir) {
    app.use('/*', serveStatic({ root: staticDir }))
    // A file of an earlier build (an open tab after a deploy) must fail as such, not load the page as script.
    app.get('/assets/*', (c) => c.text('not found', 404))
    const index = path.join(staticDir, 'index.html')
    app.get('*', async (c) => {
      c.header('Content-Security-Policy', CSP)
      return c.html(await readFile(index, 'utf8'))
    })
  }
  return app
}
