/**
 * The route inventory: every route of the server says here who may use it, and the test holds the app to it.
 *
 * - A route that is not listed fails the test, so nothing reaches the API without someone deciding who may use it.
 * - Each listed route is called as every kind of caller, on an app of its own with real records, and the answers must
 *   match the rule of its row. An allowed caller must get through to the handler, so a refusal cannot pass for a typo
 *   in the address, and a 404 for an outsider means the record was hidden, not missing.
 *
 * New route: add a row. If it stands behind an option of createApp, switch that option on in `fixture` too.
 * The finer rules within a route (notes hidden from view guests, what a guest may set in a batch) are tested in
 * app.test.ts; here the question is only who gets in.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { PROXY_SECRET_HEADER } from './guard.ts'
import { mcpRoutes } from './mcp.ts'
import { OAuthServer } from './oauth.ts'
import type { Attachment, LibraryEntry, WorkshopState } from '../src/domain/types.ts'

const PUBLIC = 'https://sessions.example.com'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const EMAIL_HEADER = 'x-auth-request-email'
const PROXY_SECRET = 'proxy-secret'
const LINK_TOKEN = 'link-token'
const MCP_TOKEN = 'mcp-token'
const OWNER = 'owner@example.com'
const VIEWER = 'viewer@example.com'
const EDITOR = 'editor@example.com'
const OUTSIDER = 'outsider@example.com'

/** Everyone who can knock. All come through the proxy with its secret, except `forged`: the owner's address, sent past the proxy. */
const CALLERS = {
  nobody: {},
  forged: { [EMAIL_HEADER]: OWNER },
  link: { authorization: `Bearer ${LINK_TOKEN}` },
  agent: { authorization: `Bearer ${MCP_TOKEN}` },
  outsider: { [EMAIL_HEADER]: OUTSIDER },
  viewer: { [EMAIL_HEADER]: VIEWER },
  editor: { [EMAIL_HEADER]: EDITOR },
  owner: { [EMAIL_HEADER]: OWNER },
} satisfies Record<string, Record<string, string>>
type Caller = keyof typeof CALLERS
const CALLER_NAMES = Object.keys(CALLERS) as Caller[]

/**
 * Who may use a route:
 * - `public`: the app asks nobody. In front of it the login proxy decides, except for what it lets through (docs/mcp.md).
 * - `link`, `agent`: only with that token (the CRM's link list; agents over /mcp), and the login counts for nothing there.
 * - `approver`: the page where an owner approves an agent's connection.
 * - `signed-in`: anybody the login lets in, shared workshop or not.
 * - `workshop-view`, `workshop-edit`: the owner and the guests of that workshop, or those of them who may edit.
 * - `owner`: the owner only.
 */
type Access = 'public' | 'link' | 'agent' | 'approver' | 'signed-in' | 'workshop-view' | 'workshop-edit' | 'owner'
type Answer = 'through' | number

const each = (answer: Answer) => Object.fromEntries(CALLER_NAMES.map((who) => [who, answer])) as Record<Caller, Answer>
const NO_LOGIN = { nobody: 401, forged: 403, link: 401, agent: 401 } as const

const RULES: Record<Access, Record<Caller, Answer>> = {
  public: each('through'),
  link: { ...each(401), link: 'through' },
  agent: { ...each(401), agent: 'through' },
  approver: { ...each(403), owner: 'through' },
  'signed-in': { ...NO_LOGIN, outsider: 'through', viewer: 'through', editor: 'through', owner: 'through' },
  // An outsider learns nothing: the workshop answers as if it did not exist.
  'workshop-view': { ...NO_LOGIN, outsider: 404, viewer: 'through', editor: 'through', owner: 'through' },
  'workshop-edit': { ...NO_LOGIN, outsider: 404, viewer: 403, editor: 'through', owner: 'through' },
  owner: { ...NO_LOGIN, outsider: 403, viewer: 403, editor: 403, owner: 'through' },
}

interface Records {
  workshop: string
  /** A workshop in the trash. */
  trashed: string
  attachment: string
  entry: string
  entryAttachment: string
  deck: string
  theme: string
  template: string
  hash: string
  client: string
  /** The query of a consent page for that client. */
  consent: string
  /** A consent page the owner has open, waiting for the decision. */
  pending: string
}

interface Route {
  route: string
  access: Access
  /** JSON, or the form or upload a route takes. */
  body?: (r: Records) => unknown
  query?: (r: Records) => string
  /** The status of getting through, where it is not a success: the handler itself answers so. */
  through?: number
  /** The method to call a route for all methods with. */
  method?: string
}

const picture = () => new File([Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)], 'picture.jpg', { type: 'image/jpeg' })
const form = (fields: Record<string, string | File>) => {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.append(k, v)
  return data
}
const pictureForm = () => form({ file: picture() })
const fileForm = () => form({ file: new File(['text'], 'notes.md') })
const content = { kind: 'block', title: 'Fishbowl', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], categoryId: null, color: null }
const entry = { kind: 'item', title: 'Fishbowl', data: content }
const slide = '<section class="slide quote"><blockquote><p>Q</p></blockquote></section>'

const ROUTES: Route[] = [
  // Before the login's guard, or outside /api
  { route: 'GET /api/health', access: 'public' },
  { route: 'GET /.well-known/oauth-protected-resource', access: 'public' },
  { route: 'GET /.well-known/oauth-protected-resource/mcp', access: 'public' },
  { route: 'GET /.well-known/oauth-authorization-server', access: 'public' },
  { route: 'POST /oauth/register', access: 'public', body: () => ({ client_name: 'Agent', redirect_uris: [CALLBACK] }) },
  // Open by the protocol; what counts is the code or token they are given, which oauth.test.ts covers.
  { route: 'POST /oauth/token', access: 'public', body: (r) => new URLSearchParams({ grant_type: 'authorization_code', code: 'none', client_id: r.client }), through: 400 },
  { route: 'POST /oauth/revoke', access: 'public', body: () => new URLSearchParams({ token: 'none' }) },
  // The built client. A file of an earlier build fails as such.
  { route: 'GET /assets/*', access: 'public', through: 404 },
  { route: 'GET /*', access: 'public' },

  { route: 'GET /oauth/authorize', access: 'approver', query: (r) => r.consent },
  { route: 'POST /oauth/authorize', access: 'approver', body: (r) => new URLSearchParams({ request: r.pending, decision: 'deny' }) },

  { route: 'GET /api/link/workshops', access: 'link' },
  { route: 'ALL /mcp', access: 'agent', method: 'POST', body: () => ({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) },

  // Everybody signed in: what the app needs to start and to draw a guest's slides
  { route: 'GET /api/me', access: 'signed-in' },
  { route: 'GET /api/workshops', access: 'signed-in' },
  { route: 'GET /api/settings', access: 'signed-in' },
  { route: 'GET /api/settings/logo', access: 'signed-in' },
  { route: 'GET /api/themes', access: 'signed-in' },
  { route: 'GET /api/themes/:id/pool', access: 'signed-in' },
  { route: 'GET /api/themes/:name/*', access: 'signed-in' },

  // A workshop and what hangs on it
  { route: 'GET /api/workshops/:id', access: 'workshop-view' },
  { route: 'GET /api/workshops/:id/events', access: 'workshop-view' },
  { route: 'GET /api/workshops/:id/assets/:hash', access: 'workshop-view' },
  { route: 'GET /api/workshops/:id/assets/:hash/info', access: 'workshop-view' },
  { route: 'GET /api/attachments/:id', access: 'workshop-view' },
  { route: 'POST /api/workshops/:id/ops', access: 'workshop-edit', body: (r) => ({ clientId: 'c', ops: [{ op: 'set', entity: 'workshop', id: r.workshop, fields: { title: 'Renamed' } }] }) },
  { route: 'POST /api/workshops/:id/present', access: 'workshop-edit', body: () => ({ key: 'title:d1', n: 1, tag: 'w1.1' }) },
  { route: 'POST /api/workshops/:id/attachments', access: 'workshop-edit', body: fileForm },
  { route: 'POST /api/workshops/:id/assets', access: 'workshop-edit', body: pictureForm },
  { route: 'PATCH /api/attachments/:id', access: 'workshop-edit', body: () => ({ name: 'renamed.md' }) },

  // The owner's: workshops as a whole, sharing, replacing and deleting files
  { route: 'POST /api/workshops', access: 'owner', body: () => ({}) },
  { route: 'DELETE /api/workshops/:id', access: 'owner' },
  { route: 'POST /api/workshops/:id/duplicate', access: 'owner', body: () => ({ title: 'Copy' }) },
  { route: 'GET /api/trash', access: 'owner' },
  { route: 'POST /api/trash/:id/restore', access: 'owner' },
  { route: 'DELETE /api/trash/:id', access: 'owner' },
  { route: 'GET /api/workshops/:id/members', access: 'owner' },
  { route: 'PUT /api/workshops/:id/members/:email', access: 'owner', body: () => ({ role: 'view', showNotes: true }) },
  { route: 'DELETE /api/workshops/:id/members/:email', access: 'owner' },
  { route: 'GET /api/people', access: 'owner' },
  { route: 'PUT /api/attachments/:id/file', access: 'owner', body: fileForm },
  { route: 'DELETE /api/attachments/:id', access: 'owner' },

  // Settings
  { route: 'PUT /api/settings', access: 'owner', body: () => ({ categories: [], theme: '', dayStart: 540, dayEnd: null }) },
  { route: 'POST /api/settings/logo', access: 'owner', body: pictureForm },
  { route: 'DELETE /api/settings/logo', access: 'owner' },

  // Library
  { route: 'GET /api/library', access: 'owner' },
  { route: 'POST /api/library', access: 'owner', body: () => entry },
  { route: 'PUT /api/library/:id', access: 'owner', body: () => entry },
  { route: 'DELETE /api/library/:id', access: 'owner' },
  { route: 'POST /api/library/:id/attachments', access: 'owner', body: fileForm },
  { route: 'POST /api/library/:id/copies/:workshopId', access: 'owner' },
  { route: 'GET /api/library/attachments/:id', access: 'owner' },
  { route: 'PATCH /api/library/attachments/:id', access: 'owner', body: () => ({ name: 'renamed.md' }) },
  { route: 'PUT /api/library/attachments/:id/file', access: 'owner', body: fileForm },
  { route: 'DELETE /api/library/attachments/:id', access: 'owner' },
  { route: 'POST /api/library/assets', access: 'owner', body: pictureForm },
  { route: 'GET /api/library/assets/:hash', access: 'owner' },
  { route: 'GET /api/library/assets/:hash/info', access: 'owner' },

  // Slide pool, pictures on slides as a whole
  { route: 'GET /api/decks', access: 'owner' },
  { route: 'POST /api/decks', access: 'owner', body: () => ({ title: 'Deck', slides: [] }) },
  { route: 'GET /api/decks/:id', access: 'owner' },
  { route: 'PATCH /api/decks/:id', access: 'owner', body: () => ({ title: 'Renamed' }) },
  { route: 'DELETE /api/decks/:id', access: 'owner' },
  { route: 'POST /api/assets/cutouts', access: 'owner' },
  { route: 'POST /api/assets/sweep', access: 'owner' },

  // Themes and template slides
  { route: 'POST /api/themes', access: 'owner', body: () => ({ name: 'New' }) },
  { route: 'GET /api/themes/:id', access: 'owner' },
  { route: 'PUT /api/themes/:id', access: 'owner', body: () => ({ name: 'Renamed' }) },
  { route: 'DELETE /api/themes/:id', access: 'owner' },
  { route: 'POST /api/themes/:id/pool', access: 'owner', body: (r) => ({ hash: r.hash, kind: 'icon' }) },
  { route: 'PUT /api/themes/:id/pool/:hash', access: 'owner', body: () => ({ tags: ['team'] }) },
  { route: 'DELETE /api/themes/:id/pool/:hash', access: 'owner' },
  { route: 'POST /api/themes/:id/logo', access: 'owner', body: pictureForm },
  { route: 'DELETE /api/themes/:id/logo', access: 'owner' },
  { route: 'POST /api/themes/:id/files', access: 'owner', body: () => form({ file: picture(), path: 'mark.jpg' }) },
  { route: 'DELETE /api/themes/:id/files', access: 'owner', query: () => '?path=mark.jpg' },
  { route: 'GET /api/slide-templates', access: 'owner' },
  { route: 'POST /api/slide-templates', access: 'owner', body: () => ({ name: 'Quote', html: slide }) },
  { route: 'PUT /api/slide-templates/:id', access: 'owner', body: () => ({ name: 'Renamed', html: slide }) },
  { route: 'DELETE /api/slide-templates/:id', access: 'owner' },

  // Connections of agents
  { route: 'GET /api/mcp/connections', access: 'owner' },
  { route: 'POST /api/mcp/arm', access: 'owner' },
  { route: 'DELETE /api/mcp/connections/:id', access: 'owner' },
]

/**
 * What runs on the way to the routes without being one (`app.use`, which the router lists as a route for all methods).
 * `ALL /api/*` is also the answer to an unknown address behind the guard.
 */
const LAYERS = [
  'ALL /*', // security headers, the built client's files
  'ALL /api/*', // the login's guard, body limits, unknown addresses
  'ALL /oauth/*', // body limit
  'ALL /api/library', // the owner's rule for everything under these
  'ALL /api/library/*',
  'ALL /api/decks',
  'ALL /api/decks/*',
  'ALL /api/slide-templates',
  'ALL /api/slide-templates/*',
  'ALL /api/mcp/*',
]

const scratch = mkdtempSync(path.join(tmpdir(), 'sp-routes-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

type App = ReturnType<typeof createApp>

const call = (app: App, who: Caller, method: string, address: string, body?: unknown) => {
  const headers: Record<string, string> = { 'x-sp': '1', accept: 'application/json, text/event-stream', ...CALLERS[who] }
  if (who !== 'forged') headers[PROXY_SECRET_HEADER] = PROXY_SECRET
  const json = body !== undefined && !(body instanceof FormData || body instanceof URLSearchParams)
  if (json) headers['content-type'] = 'application/json'
  return app.request(`${PUBLIC}${address}`, { method, headers, body: json ? JSON.stringify(body) : (body as FormData | URLSearchParams | undefined) })
}

/** A hosted app with every option of createApp on, and one record of every kind, made by the owner. */
async function fixture(): Promise<{ app: App; records: Records }> {
  const dir = mkdtempSync(path.join(scratch, 'app-'))
  const staticDir = path.join(dir, 'dist')
  mkdirSync(staticDir)
  writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Session Planner</title>')
  const guestsFile = path.join(dir, 'guests.txt')
  writeFileSync(guestsFile, `${VIEWER}\n`)

  const db = openDb(':memory:')
  const repo = new Repo(db)
  const hub = new Hub()
  const filesDir = path.join(dir, 'files')
  const themesDir = path.join(dir, 'themes')
  const oauth = new OAuthServer(db, { baseUrl: new URL(PUBLIC), allowedUsers: [OWNER], userHeader: EMAIL_HEADER, proxySecret: PROXY_SECRET })
  const app = createApp({
    repo,
    hub,
    filesDir,
    themesDir,
    staticDir,
    publicUrl: new URL(PUBLIC),
    owners: [OWNER],
    ownerHeader: EMAIL_HEADER,
    proxySecret: PROXY_SECRET,
    guestsFile,
    pingSeconds: 1,
    mcp: mcpRoutes(repo, { token: MCP_TOKEN, oauth }, { hub, filesDir, themesDir }),
    oauth: { routes: oauth.routes(), admin: oauth.adminRoutes() },
    linkToken: LINK_TOKEN,
  })

  const made = async <T>(address: string, body: unknown): Promise<T> => {
    const res = await call(app, 'owner', 'POST', address, body)
    expect(res.status, `the fixture's ${address}`).toBeLessThan(300)
    return (await res.json()) as T
  }
  const { workshop, days } = await made<WorkshopState>('/api/workshops', { title: 'Teamtag', date: '2026-11-10' })
  const { hash } = await made<{ hash: string }>(`/api/workshops/${workshop.id}/assets`, pictureForm())
  const shown = { ...content, id: 'a', workshopId: workshop.id, dayId: days[0].id, position: 1, groupId: null, fixedStart: null, attachmentIds: [], slides: [{ id: 's1', html: `<section class="slide picture"><img src="asset:${hash}"></section>` }] }
  await made(`/api/workshops/${workshop.id}/ops`, { clientId: 'c', ops: [{ op: 'create', entity: 'item', record: shown }] })
  repo.setMember(workshop.id, VIEWER, 'view', false)
  repo.setMember(workshop.id, EDITOR, 'edit', true)
  const attachment = await made<Attachment>(`/api/workshops/${workshop.id}/attachments`, fileForm())
  await made('/api/settings/logo', pictureForm())

  const library = await made<LibraryEntry>('/api/library', entry)
  const withFile = await made<LibraryEntry & { data: { attachmentIds: string[] } }>(`/api/library/${library.id}/attachments`, fileForm())

  const { deck } = await made<{ deck: { id: string } }>('/api/decks', { title: 'Deck', slides: [] })
  const theme = await made<{ id: string }>('/api/themes', { name: 'Marke' })
  await made(`/api/themes/${theme.id}/pool`, { hash, kind: 'picture' })
  await made(`/api/themes/${theme.id}/logo`, pictureForm())
  await made(`/api/themes/${theme.id}/files`, form({ file: picture(), path: 'mark.jpg' }))
  const template = await made<{ id: string }>('/api/slide-templates', { name: 'Quote', html: slide })
  const trashed = (await made<WorkshopState>('/api/workshops', { title: 'Gelöscht' })).workshop.id
  expect((await call(app, 'owner', 'DELETE', `/api/workshops/${trashed}`)).status, "the fixture's trash").toBe(200)

  const client = await made<{ client_id: string }>('/oauth/register', { client_name: 'Agent', redirect_uris: [CALLBACK] })
  oauth.arm(OWNER)
  const consent = `?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: 'challenge', code_challenge_method: 'S256', resource: `${PUBLIC}/mcp` })}`
  const page = await (await call(app, 'owner', 'GET', `/oauth/authorize${consent}`)).text()
  const pending = /name="request" value="([^"]+)"/.exec(page)![1]

  return {
    app,
    records: { workshop: workshop.id, trashed, attachment: attachment.id, entry: library.id, entryAttachment: withFile.data.attachmentIds[0], deck: deck.id, theme: theme.id, template: template.id, hash, client: client.client_id, consent, pending },
  }
}

/** The address of a route, for the records of its app. */
const address = (route: string, r: Records) =>
  route
    .replace(/^\/\*$/, '/w/abc')
    .replace(/^\/assets\/\*$/, '/assets/old-build.js')
    .replace(/^(\/api\/themes\/:name)\/\*$/, '$1/theme.css')
    .replace(/^\/api\/workshops\/:id/, `/api/workshops/${r.workshop}`)
    .replace(/^\/api\/trash\/:id/, `/api/trash/${r.trashed}`)
    .replace(/^\/api\/attachments\/:id/, `/api/attachments/${r.attachment}`)
    .replace(/^\/api\/library\/attachments\/:id/, `/api/library/attachments/${r.entryAttachment}`)
    .replace(/^\/api\/library\/:id/, `/api/library/${r.entry}`)
    .replace(/^\/api\/decks\/:id/, `/api/decks/${r.deck}`)
    .replace(/^\/api\/themes\/:(id|name)/, `/api/themes/${r.theme}`)
    .replace(/^\/api\/slide-templates\/:id/, `/api/slide-templates/${r.template}`)
    .replace(/^\/api\/mcp\/connections\/:id/, '/api/mcp/connections/none')
    .replace(':workshopId', r.workshop)
    .replace(':hash', r.hash)
    .replace(':email', VIEWER)

/** One call on an app of its own, so that one that changes something cannot decide the next. */
async function answerTo({ route, body, query, through, method }: Route, who: Caller): Promise<Answer> {
  const { app, records } = await fixture()
  const [verb, pattern] = route.split(' ')
  const res = await call(app, who, method ?? verb, `${address(pattern, records)}${query?.(records) ?? ''}`, body?.(records))
  await res.body?.cancel()
  return res.status === through || (through === undefined && res.status < 400) ? 'through' : res.status
}

describe('route inventory', () => {
  const listed = [...ROUTES.map((r) => r.route), ...LAYERS].sort()

  it('names every route of the app, and nothing else', async () => {
    const { app } = await fixture()
    const actual = [...new Set(app.routes.map((r) => `${r.method} ${r.path}`))].sort()
    expect(actual).toEqual(listed)
  })

  it('names the routes in app.ts too that stand behind an option the fixture has not switched on', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'app.ts'), 'utf8')
    const written = [...source.matchAll(/\bapp\.(get|post|put|patch|delete|all)\('([^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2].replace(/^\*$/, '/*')}`)
    expect(written.length).toBeGreaterThan(50)
    expect(written.filter((r) => !listed.includes(r))).toEqual([])
  })

  it('names each route once', () => {
    expect(new Set(ROUTES.map((r) => r.route)).size).toBe(ROUTES.length)
  })

  it.each(ROUTES)('$route is for: $access', async (row) => {
    const answers = {} as Record<Caller, Answer>
    for (const who of CALLER_NAMES) answers[who] = await answerTo(row, who)
    expect(answers).toEqual(RULES[row.access])
  })
})
