import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import { copyFile, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { newId, type PresentPosition } from '../src/domain/ops.ts'
import type { Repo } from './repo.ts'
import type { Hub } from './hub.ts'
import { bearerToken, type Env, guard, type GuardOptions, sameToken } from './guard.ts'
import { eventFor, forGuest, mayApply, mayEdit, requireRules, rulesFor, visibleWorkshops, workshopAccess, type WorkshopAccess } from './access.ts'
import type { Asset } from '../src/domain/types.ts'
import type { Context } from 'hono'
import { listThemes, THEME_NAME } from './themes.ts'
import { BadRequest, isThemeId, parseTags, safeMime, validateDeck, validateDeckPatch, validateDuplicate, validateFileName, validateLibraryEntry, validateMember, validateNewWorkshop, validateOps, validatePoolEntry, validatePoolKind, validatePoolPatch, validatePresent, validateSettings, validateSlideTemplate, validateTheme, validateThemeFilePath, validateThemePatch, validEmail } from './validate.ts'
import { DARK_TOKENS, DEFAULT_TOKENS, type PoolKind, themeCss, themeFileUrls, themeIdFrom, themeLogoUrl } from '../src/domain/theme.ts'
import { cutoutPng, darkCutoutPng } from './cutout.ts'
import { copyEntryFiles, copyToLibrary, MAX_WORKSHOP_FILES, removeFiles } from './files.ts'
import { filePaths, themeFolderFile } from './storage.ts'
import { fileKind, MAX_ATTACHMENT } from '../src/domain/attachments.ts'
import { withFilesOf } from '../src/domain/copy.ts'
import { withCutouts } from '../src/domain/cutouts.ts'

export const MAX_LOGO = 2 * 1024 * 1024
/** A theme's own file: a font or a picture its rules use. */
export const MAX_THEME_FILE = 5 * 1024 * 1024
/** A presentation nobody paged for this long is over: windows opened afterwards start where their link says. */
export const PRESENT_HOURS = 6
/** A picture on a slide (docs/slides.md): stored once per content hash, shown inline. */
export const MAX_ASSET = 10 * 1024 * 1024
/** Limits that keep the disk and the server's connections from being filled, by guests in particular. */
export const QUOTAS = {
  /** The files of one workshop together, in bytes. */
  workshopFiles: MAX_WORKSHOP_FILES,
  /** What one guest may upload per day, files and slide pictures together, in bytes. The owner has no such limit. */
  guestUploadsPerDay: 250 * 1024 * 1024,
  /** Live-update streams one guest may hold open at once (one per open window). */
  guestStreams: 10,
}
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export interface AppOptions extends GuardOptions {
  repo: Repo
  hub: Hub
  /** Where attachment files live (data/files); slide assets in its assets/ subfolder. */
  filesDir: string
  /** Slide themes (data/themes/<name>/theme.css with fonts and logos next to it); none without it. */
  themesDir?: string
  /** Directory with the built client (dist). When set, the server serves the UI too. */
  staticDir?: string
  /** Seconds between keep-alive pings on the live-update stream. */
  pingSeconds?: number
  /** The login's allow-list for this app (read-only): offered as people to share with. */
  guestsFile?: string
  /** MCP endpoint for AI agents (server/mcp.ts), mounted at /mcp; it checks its own bearer token. */
  mcp?: Hono
  /** OAuth for the MCP endpoint (server/oauth.ts): discovery and /oauth/* at the root, connection admin under /api/mcp. */
  oauth?: { routes: Hono; admin: Hono<Env> }
  /** Token for GET /api/link/workshops (SP_LINK_TOKEN): another app (the CRM) reads the list to link to workshops. */
  linkToken?: string
  /** Other limits than QUOTAS (tests). */
  quotas?: Partial<typeof QUOTAS>
}

// The built UI loads only its own files; nothing a user typed can run as script.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

/** A request's JSON body; a missing or malformed one is the client's mistake (400), not the server's. */
const jsonBody = (c: Context): Promise<unknown> => c.req.json().catch(() => { throw new BadRequest('invalid JSON body') })

export function createApp({ repo, hub, filesDir, themesDir, staticDir, publicUrl, owners, ownerHeader, proxySecret, pingSeconds = 25, guestsFile, mcp, oauth, linkToken, quotas }: AppOptions): Hono<Env> {
  const app = new Hono<Env>()
  const quota = { ...QUOTAS, ...quotas }
  const { file: filePath, asset: assetPath, darkAsset: darkAssetPath, logo: logoPath, assetsDir, darkAssetsDir, themeLogosDir, themeLogo: themeLogoPath, themeFilesDir, themeFile } = filePaths(filesDir)
  const allow = rulesFor(repo)
  /** The workshop an attachment belongs to, for the rule of a route that names only the file. */
  const attachmentWorkshop = (c: Context<Env>) => repo.getAttachment(c.req.param('id')!)?.workshopId ?? null

  // Guests' uploads per day and their open live-update streams, kept in memory: a restart starts afresh.
  const uploaded = new Map<string, { day: string; bytes: number }>()
  /** Books an upload of a guest against the day's budget; false when it would go over. The owner has none. */
  const guestUpload = (c: Context<Env>, access: WorkshopAccess, size: number): boolean => {
    if (access === 'owner') return true
    const email = c.get('user').email ?? ''
    const day = new Date().toISOString().slice(0, 10)
    const before = uploaded.get(email)
    const bytes = before?.day === day ? before.bytes : 0
    if (bytes + size > quota.guestUploadsPerDay) return false
    uploaded.set(email, { day, bytes: bytes + size })
    return true
  }
  const streams = new Map<string, number>()
  // The slide each workshop's presentation shows now (docs/slides.md, Presenting): every window that joins starts there,
  // unless nobody paged for PRESENT_HOURS (the next day's presentation starts afresh).
  const positions = new Map<string, PresentPosition & { at: number }>()
  const positionOf = (id: string): PresentPosition | null => {
    const p = positions.get(id)
    if (!p || Date.now() - p.at > PRESENT_HOURS * 3_600_000) return null
    return { key: p.key, n: p.n, tag: p.tag }
  }

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    // Every HTML page carries the app's policy, whichever handler produced it (the static handler serves / and
    // /index.html itself). A response with a policy of its own (a downloaded HTML attachment: sandbox) keeps it.
    if (c.res.headers.get('content-type')?.startsWith('text/html') && !c.res.headers.has('content-security-policy')) c.header('Content-Security-Policy', CSP)
    // API answers are personal (a guest's workshop, the owner's list) and change often: never stored by a browser or
    // a proxy. A route with a policy of its own (the logo's short cache) keeps it.
    if (c.req.path.startsWith('/api/') && !c.res.headers.has('cache-control')) c.header('Cache-Control', 'no-store')
  })
  app.get('/api/health', allow('public'), (c) => c.json({ ok: true }))
  // Another app (the CRM) links its deliveries to workshops: with its own token, before the login's guard, it
  // reads id, title, client and dates of all workshops – nothing else, and nothing it could change.
  if (linkToken) {
    app.get('/api/link/workshops', allow('own-token'), (c) => {
      const given = bearerToken(c.req.raw.headers)
      if (given === null || !sameToken(given, linkToken)) return c.json({ error: 'unauthorized' }, 401)
      return c.json(repo.listWorkshops().map(({ id, title, client, archived, firstDate, lastDate }) => ({ id, title, client, archived, firstDate, lastDate })))
    })
  }
  app.use('/api/*', guard({ publicUrl, owners, ownerHeader, proxySecret }))
  // Every request body is bounded, checked after the guard so that a foreign request is refused before its body is
  // read. Uploads, operation batches and the agents' JSON-RPC have their room; everything else (JSON of a few
  // kilobytes, the OAuth forms and registrations) gets a megabyte.
  const tooLarge = (c: Context) => c.json({ error: 'too_large' }, 413)
  const limits = {
    attachment: bodyLimit({ maxSize: MAX_ATTACHMENT + 64 * 1024, onError: tooLarge }),
    upload: bodyLimit({ maxSize: MAX_ASSET + 64 * 1024, onError: tooLarge }),
    logo: bodyLimit({ maxSize: MAX_LOGO + 64 * 1024, onError: tooLarge }),
    themeFile: bodyLimit({ maxSize: MAX_THEME_FILE + 64 * 1024, onError: tooLarge }),
    ops: bodyLimit({ maxSize: 4 * 1024 * 1024, onError: tooLarge }),
    json: bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge }),
  }
  app.use('/api/*', (c, next) => {
    const p = c.req.path
    const limit = /^\/api\/((workshops|library)\/[^/]+\/attachments|(library\/)?attachments\/[^/]+\/file)$/.test(p) ? limits.attachment : /^\/api\/(workshops\/[^/]+\/assets|library\/assets|themes\/[^/]+\/pool)$/.test(p) ? limits.upload : /^\/api\/(workshops\/[^/]+\/ops|decks|slide-templates(\/[^/]+)?)$/.test(p) ? limits.ops : p === '/api/settings/logo' || /^\/api\/themes\/[^/]+\/logo$/.test(p) ? limits.logo : /^\/api\/themes\/[^/]+\/files$/.test(p) ? limits.themeFile : limits.json
    return limit(c, next)
  })
  // Agents write whole agendas and slide decks in one call, like the app's operation batches.
  app.use('/mcp', limits.ops)
  app.use('/oauth/*', limits.json)
  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400)
    console.error('API error:', err)
    return c.json({ error: 'error' }, 500)
  })

  app.get('/api/me', allow('signed-in'), (c) => c.json(c.get('user')))
  app.get('/api/workshops', allow('signed-in'), (c) => c.json(visibleWorkshops(repo, c.get('user'))))
  app.post('/api/workshops', allow('owner'), async (c) => c.json(repo.createWorkshop(validateNewWorkshop(await c.req.json().catch(() => ({})))), 201))
  app.get('/api/workshops/:id', allow('workshop-view'), (c) => {
    const id = c.req.param('id')!
    const access = c.get('access')
    const state = repo.loadWorkshop(id)
    if (!state) return c.json({ error: 'not_found' }, 404)
    if (access === 'owner') return c.json(state)
    repo.touchMember(id, c.get('user').email!)
    return c.json(forGuest(state, access))
  })
  app.delete('/api/workshops/:id', allow('owner'), async (c) => {
    const id = c.req.param('id')!
    const files = repo.deleteWorkshop(id)
    if (!files) return c.json({ error: 'not_found' }, 404)
    await Promise.all(files.map((f) => rm(filePath(f), { force: true })))
    positions.delete(id)
    hub.publish(id, { type: 'workshop-deleted' })
    return c.json({ ok: true })
  })

  app.post('/api/workshops/:id/duplicate', allow('owner'), async (c) => {
    const result = repo.duplicateWorkshop(c.req.param('id')!, validateDuplicate(await jsonBody(c)))
    if (!result) return c.json({ error: 'not_found' }, 404)
    await mkdir(filesDir, { recursive: true })
    // A file missing on disk stays listed but fails its download, as in the original.
    await Promise.all(Object.entries(result.files).map(([from, to]) => copyFile(filePath(from), filePath(to)).catch(() => undefined)))
    return c.json(result.state, 201)
  })

  app.post('/api/workshops/:id/ops', allow('workshop-edit'), async (c) => {
    const id = c.req.param('id')!
    const { clientId, ops } = validateOps(await jsonBody(c))
    if (!mayApply(c.get('access'), ops)) return c.json({ error: 'forbidden' }, 403)
    const stored = repo.applyOps(id, ops)
    if (!stored) return c.json({ error: 'not_found' }, 404)
    if (stored.length) hub.publish(id, { type: 'ops', clientId, ops: stored })
    return c.json({ ok: true, ops: stored })
  })

  // Paging in a presentation, presenter view or remote: those who can edit lead it, and all their windows follow.
  app.post('/api/workshops/:id/present', allow('workshop-edit'), async (c) => {
    const id = c.req.param('id')!
    if (!repo.hasWorkshop(id)) return c.json({ error: 'not_found' }, 404)
    const position = validatePresent(await jsonBody(c))
    positions.set(id, { ...position, at: Date.now() })
    hub.publish(id, { type: 'present', ...position })
    return c.json({ ok: true })
  })

  app.get('/api/workshops/:id/events', allow('workshop-view'), (c) => {
    const id = c.req.param('id')!
    let access = c.get('access')
    if (!repo.loadWorkshop(id)) return c.json({ error: 'not_found' }, 404)
    const user = c.get('user')
    const email = user.email
    // A guest holds a bounded number of streams; the owner is not counted.
    const guest = access === 'owner' ? null : (email ?? '')
    if (guest !== null && (streams.get(guest) ?? 0) >= quota.guestStreams) return c.json({ error: 'too_many_streams' }, 429)
    if (guest !== null) streams.set(guest, (streams.get(guest) ?? 0) + 1)
    c.header('Cache-Control', 'no-store')
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(id, (event) => {
        if (access !== 'owner' && event.type === 'members-changed') {
          // A guest whose access ended loses the stream at once; changed access applies from here on.
          const now = workshopAccess(repo, user, id)
          if (!now) {
            void stream.writeSSE({ data: JSON.stringify({ type: 'revoked' }) }).then(() => stream.abort())
            return
          }
          access = now
          void stream.writeSSE({ data: JSON.stringify({ type: 'changed' }) })
          return
        }
        const shown = eventFor(access, event)
        if (shown) void stream.writeSSE({ data: JSON.stringify(shown) })
      })
      let released = false
      const release = () => {
        if (released) return
        released = true
        unsubscribe()
        if (guest === null) return
        const left = (streams.get(guest) ?? 1) - 1
        if (left > 0) streams.set(guest, left)
        else streams.delete(guest)
      }
      stream.onAbort(release)
      try {
        // Those who lead presentations learn where one stands as they connect (null: none yet since the server started).
        await stream.writeSSE({ event: 'hello', data: mayEdit(access) ? JSON.stringify({ present: positionOf(id) }) : '' })
        while (!stream.aborted && !stream.closed) {
          await stream.sleep(pingSeconds * 1000)
          if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' })
        }
      } finally {
        release()
      }
    })
  })

  /** The uploaded file of a request, or the answer refusing it: every attachment keeps to the same size and types. */
  const attachmentUpload = async (c: Context<Env>): Promise<{ file: File; fields: Record<string, unknown> } | Response> => {
    const fields = await c.req.parseBody()
    const file = fields.file
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (file.size > MAX_ATTACHMENT) return c.json({ error: 'too_large' }, 413)
    if (!fileKind(file.name)) return c.json({ error: 'file_type' }, 415)
    return { file, fields }
  }
  const facts = (file: File) => ({ name: (file.name || 'file').replace(/[\\/\r\n]/g, '_').slice(0, 250), mime: safeMime(file.type), size: file.size })
  /** Writes the file under its id; a file replaced is whole until the new one is. */
  const storeAttachment = async (id: string, file: File) => {
    await mkdir(filesDir, { recursive: true })
    const temp = filePath(`${id}.new`)
    await writeFile(temp, Buffer.from(await file.arrayBuffer()))
    await rename(temp, filePath(id))
  }
  const sendAttachment = async (c: Context<Env>, att: { id: string; name: string }) => {
    const data = await readFile(filePath(att.id)).catch(() => null)
    if (!data) return c.json({ error: 'not_found' }, 404)
    // Always a download, never rendered in the app's origin (an uploaded HTML or SVG file must not run), and never
    // of a type a page could load as script or stylesheet: with nosniff, <script src> refuses an octet-stream. The
    // stored type stays in the list of files; the file name keeps its extension for the program that opens it.
    return c.body(new Uint8Array(data), 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    })
  }

  app.post('/api/workshops/:id/attachments', allow('workshop-edit'), async (c) => {
    const upload = await attachmentUpload(c)
    if (upload instanceof Response) return upload
    const { file } = upload
    if (repo.attachmentBytes(c.req.param('id')!) + file.size > quota.workshopFiles) return c.json({ error: 'quota' }, 413)
    if (!guestUpload(c, c.get('access'), file.size)) return c.json({ error: 'upload_budget' }, 429)
    const id = newId()
    await storeAttachment(id, file)
    const attachment = repo.addAttachment(c.req.param('id')!, { id, ...facts(file) })
    if (!attachment) {
      await rm(filePath(id), { force: true })
      return c.json({ error: 'not_found' }, 404)
    }
    hub.publish(attachment.workshopId, { type: 'attachment', attachment })
    return c.json(attachment, 201)
  })

  app.get('/api/attachments/:id', allow('workshop-view', attachmentWorkshop), async (c) => {
    const att = repo.getAttachment(c.req.param('id')!)
    const access = c.get('access')
    const state = att && access !== 'owner' ? repo.loadWorkshop(att.workshopId) : null
    // A guest gets the files their copy of the workshop lists, nothing else.
    const listed = access === 'owner' || (state && forGuest(state, access).attachments.some((a) => a.id === att?.id))
    return att && listed ? sendAttachment(c, att) : c.json({ error: 'not_found' }, 404)
  })

  app.patch('/api/attachments/:id', allow('workshop-edit', attachmentWorkshop), async (c) => {
    const att = repo.getAttachment(c.req.param('id')!)
    if (!att) return c.json({ error: 'not_found' }, 404)
    const attachment = repo.updateAttachment(att.id, { name: validateFileName(await jsonBody(c), att.name) })!
    hub.publish(att.workshopId, { type: 'attachment', attachment })
    return c.json(attachment)
  })

  // A new version under the same id: the links to the items stay. It wipes the old file, so like deleting it is the owner's.
  app.put('/api/attachments/:id/file', allow('owner'), async (c) => {
    const att = repo.getAttachment(c.req.param('id')!)
    if (!att) return c.json({ error: 'not_found' }, 404)
    const upload = await attachmentUpload(c)
    if (upload instanceof Response) return upload
    if (repo.attachmentBytes(att.workshopId) - att.size + upload.file.size > quota.workshopFiles) return c.json({ error: 'quota' }, 413)
    await storeAttachment(att.id, upload.file)
    const attachment = repo.updateAttachment(att.id, facts(upload.file))
    if (!attachment) return c.json({ error: 'not_found' }, 404)
    hub.publish(att.workshopId, { type: 'attachment', attachment })
    return c.json(attachment)
  })

  app.delete('/api/attachments/:id', allow('owner'), async (c) => {
    const result = repo.deleteAttachment(c.req.param('id')!)
    if (!result) return c.json({ error: 'not_found' }, 404)
    await rm(filePath(c.req.param('id')!), { force: true })
    hub.publish(result.workshopId, { type: 'attachment-deleted', id: c.req.param('id')! })
    if (result.ops.length) hub.publish(result.workshopId, { type: 'ops', clientId: 'server', ops: result.ops })
    return c.json({ ok: true })
  })

  // ---- settings and logo -------------------------------------------------------------------------
  app.get('/api/settings', allow('signed-in'), (c) => c.json(repo.getSettings()))
  app.put('/api/settings', allow('owner'), async (c) => {
    const settings = validateSettings(await jsonBody(c))
    // A theme that is gone (deleted in another window) is not set as the default again.
    if (settings.theme && !listThemes(themesDir, repo.listThemes()).some((t) => t.id === settings.theme)) settings.theme = ''
    return c.json(repo.saveSettings({ ...settings, logo: repo.getSettings().logo }))
  })

  app.post('/api/settings/logo', allow('owner'), async (c) => {
    const file = (await c.req.parseBody()).file
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (!LOGO_TYPES.includes(file.type)) throw new BadRequest('png, jpeg, webp or svg only')
    if (file.size > MAX_LOGO) return c.json({ error: 'too_large' }, 413)
    await mkdir(filesDir, { recursive: true })
    await writeFile(logoPath, Buffer.from(await file.arrayBuffer()))
    return c.json(repo.saveSettings({ ...repo.getSettings(), logo: { mime: file.type, updatedAt: new Date().toISOString() } }))
  })
  app.get('/api/settings/logo', allow('signed-in'), async (c) => {
    const logo = repo.getSettings().logo
    const data = logo && (await readFile(logoPath).catch(() => null))
    if (!logo || !data) return c.json({ error: 'not_found' }, 404)
    // Shown as <img>; opened on its own, an SVG still cannot run script in the app's origin.
    return c.body(new Uint8Array(data), 200, { 'Content-Type': logo.mime, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=300' })
  })
  app.delete('/api/settings/logo', allow('owner'), async (c) => {
    await rm(logoPath, { force: true })
    return c.json(repo.saveSettings({ ...repo.getSettings(), logo: null }))
  })

  // ---- guests (owner only) ----------------------------------------------------------------------------
  /** People to share with: the login's allow-list (without the owners) and everyone shared with before. */
  app.get('/api/people', allow('owner'), async (c) => {
    const listed = guestsFile
      ? (await readFile(guestsFile, 'utf8').catch(() => ''))
          .split('\n')
          .map((l) => l.trim().toLowerCase())
          .filter((l) => l && !l.startsWith('#') && l.includes('@') && !owners.includes(l))
      : []
    const shared = repo.sharedEmails()
    const emails = [...new Set([...listed, ...shared.map((s) => s.email)])].sort()
    return c.json(
      emails.map((email) => ({ email, allowed: guestsFile ? listed.includes(email) : null, workshops: shared.find((s) => s.email === email)?.workshops ?? 0 })),
    )
  })
  app.get('/api/workshops/:id/members', allow('owner'), (c) => c.json(repo.listMembers(c.req.param('id')!)))
  app.put('/api/workshops/:id/members/:email', allow('owner'), async (c) => {
    const id = c.req.param('id')!
    const { role, showNotes } = validateMember(await jsonBody(c))
    const member = repo.setMember(id, validEmail(c.req.param('email')!), role, showNotes)
    if (!member) return c.json({ error: 'not_found' }, 404)
    hub.publish(id, { type: 'members-changed' })
    return c.json(member)
  })
  app.delete('/api/workshops/:id/members/:email', allow('owner'), (c) => {
    const id = c.req.param('id')!
    if (!repo.removeMember(id, validEmail(c.req.param('email')!))) return c.json({ error: 'not_found' }, 404)
    hub.publish(id, { type: 'members-changed' })
    return c.json({ ok: true })
  })

  // ---- library (owner only) ---------------------------------------------------------------------------
  app.use('/api/library', allow('owner'))
  app.use('/api/library/*', allow('owner'))
  app.get('/api/library', (c) => c.json(repo.listLibrary()))
  // Saved from a workshop: the file lists name its attachments, and the entry gets copies of its own.
  app.post('/api/library', async (c) => {
    const { entry, files } = copyToLibrary(repo, filesDir, validateLibraryEntry(await jsonBody(c)))
    return c.json(repo.saveLibraryEntry(null, entry, files), 201)
  })
  app.put('/api/library/:id', async (c) => {
    const id = c.req.param('id')!
    const body = validateLibraryEntry(await jsonBody(c))
    const stored = repo.getLibraryEntry(id)
    if (!stored) return c.json({ error: 'not_found' }, 404)
    repo.saveLibraryEntry(id, withFilesOf(body, stored))
    removeFiles(filesDir, repo.pruneLibraryAttachments(id))
    return c.json(repo.getLibraryEntry(id))
  })
  app.delete('/api/library/:id', (c) => {
    const files = repo.deleteLibraryEntry(c.req.param('id')!)
    if (!files) return c.json({ error: 'not_found' }, 404)
    removeFiles(filesDir, files)
    return c.json({ ok: true })
  })

  // Files of an entry; an answer is the entry as it now is. In a group entry `item` says which of its items holds the file.
  app.post('/api/library/:id/attachments', async (c) => {
    const entryId = c.req.param('id')!
    if (!repo.getLibraryEntry(entryId)) return c.json({ error: 'not_found' }, 404)
    const upload = await attachmentUpload(c)
    if (upload instanceof Response) return upload
    const item = Number(upload.fields.item ?? 0)
    const id = newId()
    await storeAttachment(id, upload.file)
    const entry = repo.addLibraryAttachment(entryId, item, { id, ...facts(upload.file) })
    if (!entry) {
      await rm(filePath(id), { force: true })
      return c.json({ error: 'not_found' }, 404)
    }
    return c.json(entry, 201)
  })
  app.get('/api/library/attachments/:id', async (c) => {
    const att = repo.getLibraryAttachment(c.req.param('id')!)
    return att ? sendAttachment(c, att) : c.json({ error: 'not_found' }, 404)
  })
  app.patch('/api/library/attachments/:id', async (c) => {
    const att = repo.getLibraryAttachment(c.req.param('id')!)
    if (!att) return c.json({ error: 'not_found' }, 404)
    return c.json(repo.updateLibraryAttachment(att.id, { name: validateFileName(await jsonBody(c), att.name) }))
  })
  // The entry's next version; the copies in workshops stay as they are.
  app.put('/api/library/attachments/:id/file', async (c) => {
    const att = repo.getLibraryAttachment(c.req.param('id')!)
    if (!att) return c.json({ error: 'not_found' }, 404)
    const upload = await attachmentUpload(c)
    if (upload instanceof Response) return upload
    await storeAttachment(att.id, upload.file)
    const entry = repo.updateLibraryAttachment(att.id, facts(upload.file))
    return entry ? c.json(entry) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/library/attachments/:id', async (c) => {
    const entry = repo.deleteLibraryAttachment(c.req.param('id')!)
    if (!entry) return c.json({ error: 'not_found' }, 404)
    await rm(filePath(c.req.param('id')!), { force: true })
    return c.json(entry)
  })
  /** Copies an entry's files into a workshop, before the entry is placed there: library attachment id → the workshop's copy. */
  app.post('/api/library/:id/copies/:workshopId', (c) => {
    const entry = repo.getLibraryEntry(c.req.param('id')!)
    const workshopId = c.req.param('workshopId')!
    if (!entry || !repo.loadWorkshop(workshopId)) return c.json({ error: 'not_found' }, 404)
    const copies = copyEntryFiles(repo, filesDir, entry, workshopId, quota.workshopFiles)
    if (!copies) return c.json({ error: 'quota' }, 413)
    for (const attachment of Object.values(copies)) hub.publish(workshopId, { type: 'attachment', attachment })
    return c.json(copies, 201)
  })

  // ---- the slide pool (owner only): decks uploaded once, slides picked from them as copies ----------------
  app.use('/api/decks', allow('owner'))
  app.use('/api/decks/*', allow('owner'))
  app.get('/api/decks', (c) => c.json(repo.listDecks()))
  app.post('/api/decks', async (c) => c.json(repo.createDeck(validateDeck(await jsonBody(c))), 201))
  app.get('/api/decks/:id', (c) => {
    const deck = repo.getDeck(c.req.param('id')!)
    return deck ? c.json(deck) : c.json({ error: 'not_found' }, 404)
  })
  app.patch('/api/decks/:id', async (c) => {
    const deck = repo.updateDeck(c.req.param('id')!, validateDeckPatch(await jsonBody(c)))
    return deck ? c.json(deck) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/decks/:id', (c) => (repo.deleteDeck(c.req.param('id')!) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)))

  // ---- slide assets: pictures, once per content hash, shown inline ---------------------------------------
  // The file's own bytes decide the type (a renamed HTML file is refused); only raster images, so nothing can run.
  const sniff = (b: Buffer): string | null => {
    if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png'
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
    if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
    if (b.length > 6 && /^GIF8[79]a/.test(b.toString('latin1', 0, 6))) return 'image/gif'
    return null
  }
  const HASH = /^[0-9a-f]{64}$/
  /**
   * Stores an uploaded picture once by its content; the record (with the hash of the cut-out made from a PNG with a
   * flat background, server/cutout.ts), or the answer that refuses it (too large, over the guest's budget).
   */
  const saveUpload = async (c: Context<Env>, access: WorkshopAccess, file: unknown): Promise<(Asset & { cutout: string | null }) | Response> => {
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (file.size > MAX_ASSET) return c.json({ error: 'too_large' }, 413)
    const data = Buffer.from(await file.arrayBuffer())
    const mime = sniff(data)
    if (!mime) throw new BadRequest('png, jpeg, webp or gif only')
    const hash = createHash('sha256').update(data).digest('hex')
    // A picture the server has already takes no more room.
    if (!repo.getAsset(hash) && !guestUpload(c, access, data.length)) return c.json({ error: 'upload_budget' }, 429)
    const known = repo.getAsset(hash)
    await mkdir(assetsDir, { recursive: true })
    await writeFile(assetPath(hash), data)
    const asset = known ?? repo.addAsset({ hash, mime, size: data.length })
    // An illustration on a flat background gets its cut-out, stored next to it as an asset of its own, once.
    let cutout = repo.getCutout(hash)?.hash ?? null
    if (!cutout && !known && mime === 'image/png' && !asset.cutoutOf) {
      const cut = cutoutPng(data)
      if (cut && guestUpload(c, access, cut.length)) cutout = await storeCutout(hash, cut)
    }
    return { ...asset, cutout }
  }
  /** Stores a cut-out next to its original, once; its hash. */
  const storeCutout = async (original: string, cut: Buffer): Promise<string> => {
    const hash = createHash('sha256').update(cut).digest('hex')
    if (!repo.getAsset(hash)) await writeFile(assetPath(hash), cut)
    return repo.addAsset({ hash, mime: 'image/png', size: cut.length, cutoutOf: original }).hash
  }
  /** An asset with its original and its cut-out, for the picture field's switch between them. */
  const assetInfo = (c: Context<Env>, hash: string) => {
    const pair = HASH.test(hash) ? repo.assetPair(hash) : null
    return pair ? c.json({ hash, ...pair }) : c.json({ error: 'not_found' }, 404)
  }
  const storeAsset = async (c: Context<Env>, access: WorkshopAccess) => {
    const saved = await saveUpload(c, access, (await c.req.parseBody()).file)
    return saved instanceof Response ? saved : c.json(saved, 201)
  }
  const sendAsset = async (c: Context<Env>, hash: string, ground?: string) => {
    const asset = HASH.test(hash) ? repo.getAsset(hash) : null
    const stored = asset && (await readFile(assetPath(hash)).catch(() => null))
    if (!asset || !stored) return c.json({ error: 'not_found' }, 404)
    let data: Buffer = stored
    // Under a dark theme the host asks for ?ground=dark: a cut-out comes as its dark variant, made once and kept;
    // every other picture as it is.
    if (ground === 'dark' && asset.cutoutOf && asset.mime === 'image/png') {
      const dark = await readFile(darkAssetPath(hash)).catch(() => null)
      if (dark) data = dark
      else {
        const made = darkCutoutPng(data)
        if (made) {
          await mkdir(darkAssetsDir, { recursive: true })
          await writeFile(darkAssetPath(hash), made)
          data = made
        }
      }
    }
    // Content-addressed: the same address always holds the same bytes, so a browser may keep it for good.
    return c.body(new Uint8Array(data), 200, { 'Content-Type': asset.mime, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=31536000, immutable' })
  }
  app.post('/api/workshops/:id/assets', allow('workshop-edit'), async (c) => storeAsset(c, c.get('access')))
  app.get('/api/workshops/:id/assets/:hash/info', allow('workshop-view'), (c) => {
    const id = c.req.param('id')!
    const hash = c.req.param('hash')!
    if (!HASH.test(hash) || !repo.assetInWorkshop(id, hash)) return c.json({ error: 'not_found' }, 404)
    return assetInfo(c, hash)
  })
  app.get('/api/workshops/:id/assets/:hash', allow('workshop-view'), (c) => {
    const id = c.req.param('id')!
    const hash = c.req.param('hash')!
    // A guest of the workshop sees what its slides show, nothing else.
    if (!HASH.test(hash) || !repo.assetInWorkshop(id, hash)) return c.json({ error: 'not_found' }, 404)
    return sendAsset(c, hash, c.req.query('ground'))
  })
  app.post('/api/library/assets', (c) => storeAsset(c, 'owner'))
  app.get('/api/library/assets/:hash/info', (c) => assetInfo(c, c.req.param('hash')!))
  app.get('/api/library/assets/:hash', (c) => sendAsset(c, c.req.param('hash')!, c.req.query('ground')))
  /**
   * Cut-outs for the pictures already on slides (owner): every PNG a stored slide shows gets its cut-out made with
   * the current routine (from the original, when the slide shows an older cut-out), and the slides that show an
   * illustration whole on the ground take it (src/domain/cutouts.ts) – in the workshops, the library, the pool and
   * the templates. Running it again changes nothing; the editor's switch still leads back to the original.
   */
  app.post('/api/assets/cutouts', allow('owner'), async (c) => {
    const shown = new Set<string>()
    repo.rewriteSlides((html) => {
      for (const m of html.matchAll(/asset:([0-9a-f]{64})/g)) shown.add(m[1])
      return html
    })
    const current = new Map<string, string | null>()
    let made = 0
    for (const hash of shown) {
      const asset = repo.getAsset(hash)
      if (!asset || asset.mime !== 'image/png') continue
      const original = asset.cutoutOf && repo.getAsset(asset.cutoutOf) ? asset.cutoutOf : asset.hash
      if (!current.has(original)) {
        const data = await readFile(assetPath(original)).catch(() => null)
        const cut = data && cutoutPng(data)
        const known = cut ? repo.getAsset(createHash('sha256').update(cut).digest('hex')) : null
        current.set(original, cut ? await storeCutout(original, cut) : null)
        if (cut && !known) made++
      }
      const cut = current.get(original)
      if (cut) current.set(hash, cut)
    }
    const slides = repo.rewriteSlides((html) => withCutouts(html, (h) => current.get(h) ?? null))
    return c.json({ pictures: new Set([...current.values()].filter(Boolean)).size, made, slides })
  })
  app.post('/api/assets/sweep', allow('owner'), async (c) => {
    const gone = repo.sweepAssets()
    await Promise.all(gone.flatMap((h) => [rm(assetPath(h), { force: true }), rm(darkAssetPath(h), { force: true })]))
    return c.json({ removed: gone.length })
  })

  // ---- slide themes: kept as data (colours, fonts, logo; the stylesheet is generated) or as folders in data/themes ----
  const THEME_TYPES: Record<string, string> = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' }
  app.get('/api/themes', allow('signed-in'), (c) => c.json(listThemes(themesDir, repo.listThemes())))
  /** The full record of a data theme (owner): tokens and logos, for the theme editor. */
  app.get('/api/themes/:id', allow('owner'), (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    return theme ? c.json(theme) : c.json({ error: 'not_found' }, 404)
  })
  // ---- the asset pool of a theme: pictures the generated slides take in turn, icons for cards (docs/slides.md, section 4) ----
  app.get('/api/themes/:id/pool', allow('signed-in'), (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    return theme ? c.json(repo.listPool(theme.id)) : c.json({ error: 'not_found' }, 404)
  })
  /** A picture into the pool: uploaded (multipart: file, kind, tags) or one the server has already (JSON: hash, kind, tags). */
  app.post('/api/themes/:id/pool', allow('owner'), async (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    if (!theme) return c.json({ error: 'not_found' }, 404)
    let entry: { hash: string; kind: PoolKind; tags: string[] }
    if (c.req.header('content-type')?.includes('multipart/form-data')) {
      const body = await c.req.parseBody()
      const saved = await saveUpload(c, 'owner', body.file)
      if (saved instanceof Response) return saved
      entry = { hash: saved.hash, kind: validatePoolKind(body.kind), tags: parseTags(typeof body.tags === 'string' ? body.tags : '') }
    } else {
      entry = validatePoolEntry(await jsonBody(c))
      if (!repo.getAsset(entry.hash)) return c.json({ error: 'not_found' }, 404)
    }
    return c.json(repo.addPoolAsset(theme.id, entry), 201)
  })
  app.put('/api/themes/:id/pool/:hash', allow('owner'), async (c) => {
    const entry = repo.updatePoolAsset(c.req.param('id')!, c.req.param('hash')!, validatePoolPatch(await jsonBody(c)))
    return entry ? c.json(entry) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/themes/:id/pool/:hash', allow('owner'), (c) => (repo.removePoolAsset(c.req.param('id')!, c.req.param('hash')!) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)))
  app.get('/api/themes/:name/*', allow('signed-in'), async (c) => {
    const name = c.req.param('name')!
    const rel = c.req.path.slice(`/api/themes/${name}/`.length).split('/')
    if (!THEME_NAME.test(name) || !rel.length || rel.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s === '..')) return c.json({ error: 'not_found' }, 404)
    const data = repo.getTheme(name)
    if (data) {
      if (rel.length === 1 && rel[0] === 'theme.css') {
        const css = themeCss(data.id, data.tokens, { logoUrl: themeLogoUrl(data, 'logo'), logoLightUrl: themeLogoUrl(data, 'logoLight'), css: data.css, fileUrls: themeFileUrls(data) })
        // Changed in the theme editor at any time: asked for again on every load (it is small).
        return c.body(css, 200, { 'Content-Type': THEME_TYPES['.css'], 'Cache-Control': 'private, no-cache' })
      }
      if (rel.length === 1 && (rel[0] === 'logo' || rel[0] === 'logo-light')) {
        const variant = rel[0] === 'logo' ? 'logo' : 'logoLight'
        const logo = variant === 'logo' ? data.logo : data.logoLight
        const bytes = logo && (await readFile(themeLogoPath(data.id, variant)).catch(() => null))
        if (!logo || !bytes) return c.json({ error: 'not_found' }, 404)
        return c.body(new Uint8Array(bytes), 200, { 'Content-Type': logo.mime, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=300' })
      }
      // the theme's own files, addressed by its rules (versioned there, so they may be kept)
      const file = data.files.find((f) => f.path === rel.join('/'))
      const bytes = file && (await readFile(themeFile(data.id, rel.join('/'))).catch(() => null))
      if (!file || !bytes) return c.json({ error: 'not_found' }, 404)
      return c.body(new Uint8Array(bytes), 200, { 'Content-Type': file.mime, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=86400' })
    }
    if (!themesDir) return c.json({ error: 'not_found' }, 404)
    const type = THEME_TYPES[path.extname(rel[rel.length - 1]).toLowerCase()]
    const bytes = type && (await readFile(themeFolderFile(themesDir, name, ...rel)).catch(() => null))
    if (!type || !bytes) return c.json({ error: 'not_found' }, 404)
    return c.body(new Uint8Array(bytes), 200, { 'Content-Type': type, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=300' })
  })
  app.post('/api/themes', allow('owner'), async (c) => {
    const input = validateTheme(await jsonBody(c))
    // Copied from another theme, started dark, or the neutral default.
    const from = input.from ? repo.getTheme(input.from) : null
    if (input.from && !from && input.from !== 'default' && input.from !== 'dark') throw new BadRequest(`no theme "${input.from}" to copy`)
    const tokens = input.tokens ?? from?.tokens ?? (input.from === 'dark' ? DARK_TOKENS : DEFAULT_TOKENS)
    // An id given takes over a theme folder of that name (the data theme hides it, docs/slides.md); otherwise one from the name.
    if (input.id && (input.id === 'default' || repo.getTheme(input.id))) throw new BadRequest(`theme "${input.id}" exists`)
    let id = input.id ?? themeIdFrom(input.name, newId)
    while (!input.id && (repo.getTheme(id) || listThemes(themesDir).some((t) => t.id === id))) id = themeIdFrom(input.name, newId)
    repo.createTheme({ id, name: input.name, tokens, css: input.css ?? from?.css })
    if (from) {
      // The logos, the files and the pool come along with a copy.
      repo.copyPool(from.id, id)
      if (from.files.length) {
        await cp(themeFilesDir(from.id), themeFilesDir(id), { recursive: true }).catch(() => undefined)
        for (const f of from.files) repo.setThemeFile(id, f.path, { mime: f.mime, size: f.size, updatedAt: new Date().toISOString() })
      }
      await mkdir(themeLogosDir, { recursive: true })
      for (const variant of ['logo', 'logoLight'] as const) {
        const logo = from[variant]
        if (!logo) continue
        await copyFile(themeLogoPath(from.id, variant), themeLogoPath(id, variant)).catch(() => undefined)
        repo.setThemeLogo(id, variant, { ...logo, updatedAt: new Date().toISOString() })
      }
    }
    return c.json(repo.getTheme(id), 201)
  })
  app.put('/api/themes/:id', allow('owner'), async (c) => {
    const current = repo.getTheme(c.req.param('id')!)
    if (!current) return c.json({ error: 'not_found' }, 404)
    const theme = repo.updateTheme(current.id, validateThemePatch(await jsonBody(c), current.tokens))
    return c.json(theme)
  })
  app.delete('/api/themes/:id', allow('owner'), async (c) => {
    const id = c.req.param('id')!
    if (!isThemeId(id)) return c.json({ error: 'not_found' }, 404)
    const result = repo.deleteTheme(id)
    if (!result) return c.json({ error: 'not_found' }, 404)
    await Promise.all([rm(themeLogoPath(id, 'logo'), { force: true }), rm(themeLogoPath(id, 'logoLight'), { force: true }), rm(themeFilesDir(id), { recursive: true, force: true })])
    // Workshops that used the theme fall back to the default: the open windows learn it like any other change.
    for (const w of result.workshops) hub.publish(w, { type: 'ops', clientId: 'server', ops: [{ op: 'set', entity: 'workshop', id: w, fields: { theme: '' } }] })
    return c.json({ ok: true })
  })
  const logoVariant = (c: Context): 'logo' | 'logoLight' => (c.req.query('variant') === 'light' ? 'logoLight' : 'logo')
  app.post('/api/themes/:id/logo', allow('owner'), async (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    if (!theme) return c.json({ error: 'not_found' }, 404)
    const file = (await c.req.parseBody()).file
    if (!(file instanceof File)) throw new BadRequest('file required')
    if (!LOGO_TYPES.includes(file.type)) throw new BadRequest('png, jpeg, webp or svg only')
    if (file.size > MAX_LOGO) return c.json({ error: 'too_large' }, 413)
    const variant = logoVariant(c)
    await mkdir(themeLogosDir, { recursive: true })
    await writeFile(themeLogoPath(theme.id, variant), Buffer.from(await file.arrayBuffer()))
    return c.json(repo.setThemeLogo(theme.id, variant, { mime: file.type, updatedAt: new Date().toISOString() }))
  })
  /** A file of the theme (multipart: file, path), addressed by its rules relative to the stylesheet; one with the same path is replaced. */
  app.post('/api/themes/:id/files', allow('owner'), async (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    if (!theme) return c.json({ error: 'not_found' }, 404)
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) throw new BadRequest('file required')
    const filePath = validateThemeFilePath(body.path ?? file.name)
    if (file.size > MAX_THEME_FILE) return c.json({ error: 'too_large' }, 413)
    // served by its extension, whatever the browser called it
    const mime = THEME_TYPES[path.extname(filePath).toLowerCase()]!
    const target = themeFile(theme.id, filePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, Buffer.from(await file.arrayBuffer()))
    return c.json(repo.setThemeFile(theme.id, filePath, { mime, size: file.size, updatedAt: new Date().toISOString() }), 201)
  })
  app.delete('/api/themes/:id/files', allow('owner'), async (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    const filePath = c.req.query('path') ?? ''
    if (!theme || !theme.files.some((f) => f.path === filePath)) return c.json({ error: 'not_found' }, 404)
    await rm(themeFile(theme.id, filePath), { force: true })
    return c.json(repo.setThemeFile(theme.id, filePath, null))
  })
  app.delete('/api/themes/:id/logo', allow('owner'), async (c) => {
    const theme = repo.getTheme(c.req.param('id')!)
    if (!theme) return c.json({ error: 'not_found' }, 404)
    const variant = logoVariant(c)
    await rm(themeLogoPath(theme.id, variant), { force: true })
    return c.json(repo.setThemeLogo(theme.id, variant, null))
  })

  // ---- template slides (owner only): named slides to start from, shared by all workshops --------------------------
  app.use('/api/slide-templates', allow('owner'))
  app.use('/api/slide-templates/*', allow('owner'))
  app.get('/api/slide-templates', (c) => c.json(repo.listSlideTemplates()))
  app.post('/api/slide-templates', async (c) => c.json(repo.saveSlideTemplate(null, validateSlideTemplate(await jsonBody(c))), 201))
  app.put('/api/slide-templates/:id', async (c) => {
    const saved = repo.saveSlideTemplate(c.req.param('id')!, validateSlideTemplate(await jsonBody(c)))
    return saved ? c.json(saved) : c.json({ error: 'not_found' }, 404)
  })
  app.delete('/api/slide-templates/:id', (c) => (repo.deleteSlideTemplate(c.req.param('id')!) ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)))

  // ---- AI agents (owner only): connections approved over OAuth, each can be disconnected ------------------
  if (oauth) {
    app.use('/api/mcp/*', allow('owner'))
    app.route('/api/mcp', oauth.admin)
  }

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))
  // Outside /api: authenticated with a bearer token (MCP) or by OAuth itself, not with the app's header.
  if (mcp) app.route('/mcp', mcp)
  if (oauth) app.route('/', oauth.routes)

  if (staticDir) {
    app.use('/*', serveStatic({ root: staticDir }))
    // A file of an earlier build (an open tab after a deploy) must fail as such, not load the page as script.
    app.get('/assets/*', (c) => c.text('not found', 404))
    const index = path.join(staticDir, 'index.html')
    app.get('*', async (c) => c.html(await readFile(index, 'utf8')))
  }
  requireRules(app)
  return app
}
