import { describe, expect, it } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { createApp } from './app.ts'
import { mcpRoutes } from './mcp.ts'
import { OAuthServer, type OAuthConfig } from './oauth.ts'

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

/** A server; `db` lets a second server start on the same database, as after a restart with a changed configuration. */
function setup(cfg: Partial<OAuthConfig> = {}, owners: string[] = [], db = openDb(':memory:')) {
  const repo = new Repo(db)
  const oauth = new OAuthServer(db, { baseUrl: new URL('http://127.0.0.1:5175'), remoteAddress: () => '127.0.0.1', ...cfg })
  const app = createApp({
    repo,
    hub: new Hub(),
    filesDir: mkdtempSync(path.join(tmpdir(), 'sp-files-')),
    owners,
    ownerHeader: 'x-auth-request-email',
    proxySecret: cfg.proxySecret,
    publicUrl: owners.length ? cfg.baseUrl : undefined,
    mcp: mcpRoutes(repo, { oauth }),
    oauth: { routes: oauth.routes(), admin: oauth.adminRoutes() },
  })
  return { app, oauth, repo, db }
}

const LOCAL = { host: '127.0.0.1:5175' }
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { ...LOCAL, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() })
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function register(app: ReturnType<typeof setup>['app'], redirect_uris = [CALLBACK]) {
  const res = await app.request('/oauth/register', { method: 'POST', headers: { ...LOCAL, 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris }) })
  return { status: res.status, body: (await res.json()) as { client_id: string } }
}

/** Runs authorize → consent → code; returns the redirect URL. */
async function authorize(app: ReturnType<typeof setup>['app'], clientId: string, challenge: string, headers: Record<string, string> = LOCAL, redirect = CALLBACK, resource = 'http://127.0.0.1:5175/mcp') {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource })
  const page = await app.request(`/oauth/authorize?${q}`, { headers })
  if (page.status !== 200) return { status: page.status, url: page.headers.get('location') }
  const html = await page.text()
  const request = /name="request" value="([^"]+)"/.exec(html)![1]
  const res = await app.request('/oauth/authorize', { ...form({ request, decision: 'allow' }), headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' } })
  return { status: res.status, url: res.headers.get('location'), html }
}

async function connect(ctx: ReturnType<typeof setup>) {
  const { body } = await register(ctx.app)
  const { verifier, challenge } = pkce()
  const { url } = await authorize(ctx.app, body.client_id, challenge)
  const code = new URL(url!).searchParams.get('code')!
  const res = await ctx.app.request('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: body.client_id, code_verifier: verifier }))
  return { clientId: body.client_id, tokens: (await res.json()) as { access_token: string; refresh_token: string; expires_in: number } }
}

const callMcp = (app: ReturnType<typeof setup>['app'], token?: string) =>
  app.request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'workshop_list', arguments: {} } }),
  })

describe('OAuth for /mcp', () => {
  it('points unauthenticated clients to the metadata', async () => {
    const { app } = setup()
    const res = await callMcp(app)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="http://127.0.0.1:5175/.well-known/oauth-protected-resource/mcp"')
    const prm = await (await app.request('/.well-known/oauth-protected-resource/mcp')).json()
    expect(prm).toMatchObject({ resource: 'http://127.0.0.1:5175/mcp', authorization_servers: ['http://127.0.0.1:5175'] })
    const as = await (await app.request('/.well-known/oauth-authorization-server')).json()
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.registration_endpoint).toBe('http://127.0.0.1:5175/oauth/register')
  })

  it('runs the full flow: register, consent, token, call, refresh with rotation', async () => {
    const ctx = setup()
    const { clientId, tokens } = await connect(ctx)
    expect(tokens.expires_in).toBe(3600)
    expect((await callMcp(ctx.app, tokens.access_token)).status).toBe(200)
    const refresh = async (rt: string) => ctx.app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId }))
    const r1 = await refresh(tokens.refresh_token)
    expect(r1.status).toBe(200)
    const t2 = (await r1.json()) as { access_token: string; refresh_token: string }
    expect(t2.refresh_token).not.toBe(tokens.refresh_token)
    expect((await callMcp(ctx.app, tokens.access_token)).status).toBe(401) // the old access token went with the rotation
    expect((await callMcp(ctx.app, t2.access_token)).status).toBe(200)
    expect((await refresh(tokens.refresh_token)).status).toBe(400) // reuse is refused
    expect(ctx.oauth.connections().map((c) => c.name)).toEqual(['Claude'])
  })

  it('revokes the whole family when an old refresh token is replayed later', async () => {
    const ctx = setup()
    const { clientId, tokens } = await connect(ctx)
    const r1 = (await (await ctx.app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }))).json()) as { access_token: string }
    const realNow = Date.now
    Date.now = () => realNow() + 60_000
    try {
      expect((await ctx.app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }))).status).toBe(400)
      expect((await callMcp(ctx.app, r1.access_token)).status).toBe(401)
    } finally {
      Date.now = realNow
    }
  })

  it('rejects wrong verifiers, reused codes, foreign redirects and unknown clients', async () => {
    const ctx = setup()
    expect((await register(ctx.app, ['https://evil.example/cb'])).status).toBe(400)
    const { body } = await register(ctx.app, [CALLBACK, 'http://127.0.0.1/callback'])
    const { verifier, challenge } = pkce()
    const { url } = await authorize(ctx.app, body.client_id, challenge)
    const code = new URL(url!).searchParams.get('code')!
    const bad = await ctx.app.request('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: body.client_id, code_verifier: pkce().verifier }))
    expect(bad.status).toBe(400)
    const again = await ctx.app.request('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: body.client_id, code_verifier: verifier }))
    expect(again.status).toBe(400) // the code was consumed by the failed attempt
    const loop = await authorize(ctx.app, body.client_id, challenge, LOCAL, 'http://127.0.0.1:43123/callback')
    expect(loop.html).toContain('program on this computer')
    expect(new URL(loop.url!).port).toBe('43123')
    const foreign = await ctx.app.request(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: body.client_id, redirect_uri: 'https://claude.com/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256' })}`, { headers: LOCAL })
    expect(foreign.status).toBe(400)
    expect((await ctx.app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: 'x', client_id: 'nope' }))).status).toBe(401)
  })

  it('locally only a browser on this machine may approve', async () => {
    const ctx = setup()
    const { body } = await register(ctx.app)
    expect((await authorize(ctx.app, body.client_id, pkce().challenge, { host: 'sessions.example.com' })).status).toBe(403)
    // a forged Host header from another machine is not enough
    const lan = setup({ remoteAddress: () => '192.168.1.20' })
    const reg = await register(lan.app)
    expect((await authorize(lan.app, reg.body.client_id, pkce().challenge)).status).toBe(403)
  })

  it('keeps registration open under a flood by dropping the oldest idle clients', async () => {
    const ctx = setup()
    for (let i = 0; i < 205; i++) await register(ctx.app)
    const { status, body } = await register(ctx.app)
    expect(status).toBe(201)
    expect((await authorize(ctx.app, body.client_id, pkce().challenge)).status).toBe(302)
  })

  it('a flood during sign-in does not drop the client that is signing in', async () => {
    const ctx = setup()
    const { body } = await register(ctx.app)
    const { verifier, challenge } = pkce()
    const { url } = await authorize(ctx.app, body.client_id, challenge)
    for (let i = 0; i < 205; i++) await register(ctx.app)
    const code = new URL(url!).searchParams.get('code')!
    const res = await ctx.app.request('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: body.client_id, code_verifier: verifier }))
    expect(res.status).toBe(200)
  })

  it('hosted, only allowed users from the login proxy header may approve', async () => {
    const ctx = setup({ baseUrl: new URL('https://sessions.example.com'), allowedUsers: ['Me@Example.com'], userHeader: 'X-Auth-Request-Email' })
    ctx.oauth.arm('me@example.com') // started in Settings (see the next test)
    const reg = await ctx.app.request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CALLBACK] }) })
    const { client_id } = (await reg.json()) as { client_id: string }
    const host = { host: 'sessions.example.com' }
    const q = (challenge: string) => new URLSearchParams({ response_type: 'code', client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://sessions.example.com/mcp' })
    expect((await ctx.app.request(`/oauth/authorize?${q('c'.repeat(43))}`, { headers: host })).status).toBe(403)
    expect((await ctx.app.request(`/oauth/authorize?${q('c'.repeat(43))}`, { headers: { ...host, 'x-auth-request-email': 'other@example.com' } })).status).toBe(403)
    expect((await ctx.app.request(`/oauth/authorize?${q('c'.repeat(43))}`, { headers: { ...host, 'x-auth-request-email': 'me@example.com' } })).status).toBe(200)
    const wrongResource = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: CALLBACK, code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', resource: 'https://other.example/mcp' })
    const res = await ctx.app.request(`/oauth/authorize?${wrongResource}`, { headers: { ...host, 'x-auth-request-email': 'me@example.com' } })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invalid_target')
  })

  it('hosted, a new connection is approved only after the owner started it in Settings, and only once', async () => {
    const pub = 'https://sessions.example.com'
    const ctx = setup({ baseUrl: new URL(pub), allowedUsers: ['me@example.com'], userHeader: 'x-auth-request-email' }, ['me@example.com'])
    const me = { host: 'sessions.example.com', 'x-auth-request-email': 'me@example.com' }
    const api = (path: string, email: string, method = 'GET') => ctx.app.request(`${pub}/api/mcp${path}`, { method, headers: { 'x-auth-request-email': email, 'x-sp': '1' } })
    const { body } = await register(ctx.app)
    const consent = () => authorize(ctx.app, body.client_id, pkce().challenge, me, CALLBACK, `${pub}/mcp`)
    // a consent link someone sends out of the blue is refused, with a warning
    const cold = await ctx.app.request(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: body.client_id, redirect_uri: CALLBACK, code_challenge: pkce().challenge, code_challenge_method: 'S256' })}`, { headers: me })
    expect(cold.status).toBe(403)
    expect(await cold.text()).toContain('Start the connection in Session Planner first')
    expect(await (await api('/connections', 'me@example.com')).json()).toMatchObject({ resource: `${pub}/mcp`, armRequired: true, armedUntil: null })
    // only the owner starts one, and only with the app's header
    expect((await api('/arm', 'guest@example.com', 'POST')).status).toBe(403)
    expect((await ctx.app.request(`${pub}/api/mcp/arm`, { method: 'POST', headers: { 'x-auth-request-email': 'me@example.com' } })).status).toBe(403)
    const armed = await api('/arm', 'me@example.com', 'POST')
    expect(armed.status).toBe(200)
    expect(await armed.json()).toMatchObject({ resource: `${pub}/mcp` })
    expect((await (await api('/connections', 'me@example.com')).json()).armedUntil).not.toBeNull()
    // one approval, then it is used up
    expect((await consent()).status).toBe(302)
    expect((await consent()).status).toBe(403)
    // a page opened while it was armed cannot be approved after another approval used it
    await api('/arm', 'me@example.com', 'POST')
    const q = new URLSearchParams({ response_type: 'code', client_id: body.client_id, redirect_uri: CALLBACK, code_challenge: pkce().challenge, code_challenge_method: 'S256' })
    const stale = /name="request" value="([^"]+)"/.exec(await (await ctx.app.request(`/oauth/authorize?${q}`, { headers: me })).text())![1]
    expect((await consent()).status).toBe(302)
    const late = await ctx.app.request('/oauth/authorize', { method: 'POST', headers: { ...me, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request: stale, decision: 'allow' }).toString() })
    expect(late.status).toBe(403)
    // and a start runs out after ten minutes
    await api('/arm', 'me@example.com', 'POST')
    const realNow = Date.now
    Date.now = () => realNow() + 11 * 60_000
    try {
      expect((await consent()).status).toBe(403)
    } finally {
      Date.now = realNow
    }
  })

  it('locally needs no start in Settings', async () => {
    const ctx = setup()
    expect(await (await ctx.app.request('/api/mcp/connections', { headers: { 'x-sp': '1', host: '127.0.0.1:5175' } })).json()).toMatchObject({ armRequired: false, armedUntil: null })
    const { body } = await register(ctx.app)
    expect((await authorize(ctx.app, body.client_id, pkce().challenge)).status).toBe(302)
  })

  it('hosted with a proxy secret, the login e-mail counts only together with it', async () => {
    const secret = 'a'.repeat(64)
    const ctx = setup({ baseUrl: new URL('https://sessions.example.com'), allowedUsers: ['me@example.com'], userHeader: 'x-auth-request-email', proxySecret: secret }, ['me@example.com'])
    ctx.oauth.arm('me@example.com')
    const { body } = await register(ctx.app)
    const me = { host: 'sessions.example.com', 'x-auth-request-email': 'me@example.com' }
    const tryWith = (headers: Record<string, string>) => authorize(ctx.app, body.client_id, pkce().challenge, headers, CALLBACK, 'https://sessions.example.com/mcp')
    expect((await tryWith(me)).status).toBe(403)
    expect((await tryWith({ ...me, 'x-sp-proxy-secret': 'b'.repeat(64) })).status).toBe(403)
    expect((await tryWith({ ...me, 'x-sp-proxy-secret': secret })).status).toBe(302)
  })

  it('lists connections for Settings and disconnects them', async () => {
    const ctx = setup()
    const { clientId, tokens } = await connect(ctx)
    const H = { 'x-sp': '1', host: '127.0.0.1:5175' }
    const list = await (await ctx.app.request('/api/mcp/connections', { headers: H })).json()
    expect(list.connections).toMatchObject([{ id: clientId, name: 'Claude', user: 'local' }])
    expect((await ctx.app.request(`/api/mcp/connections/${clientId}`, { method: 'DELETE', headers: H })).status).toBe(200)
    expect((await callMcp(ctx.app, tokens.access_token)).status).toBe(401)
    expect(ctx.oauth.connections()).toEqual([])
  })

  it('a guest (co-facilitator with a shared workshop) can neither approve a connection nor see connections', async () => {
    const ctx = setup({ baseUrl: new URL('https://sessions.example.com'), allowedUsers: ['me@example.com'], userHeader: 'x-auth-request-email' }, ['me@example.com'])
    const ws = ctx.repo.createWorkshop({ title: 'Shared' })
    ctx.repo.setMember(ws.workshop.id, 'anna@example.com', 'edit', true)
    const guest = { host: 'sessions.example.com', 'x-auth-request-email': 'anna@example.com' }
    expect((await ctx.app.request('https://sessions.example.com/api/workshops', { headers: guest })).status).toBe(200) // she is signed in and sees her workshop
    const reg = await ctx.app.request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CALLBACK] }) })
    const { client_id } = (await reg.json()) as { client_id: string }
    const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: CALLBACK, code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', resource: 'https://sessions.example.com/mcp' })
    const page = await ctx.app.request(`/oauth/authorize?${q}`, { headers: guest })
    expect(page.status).toBe(403)
    expect(await page.text()).toContain('may not approve')
    expect((await ctx.app.request('https://sessions.example.com/api/mcp/connections', { headers: guest })).status).toBe(403)
    expect(ctx.oauth.connections()).toEqual([])
  })

  it('hosted, an owner taken off the list is refused with the next call, and the refresh ends the connection', async () => {
    const hosted = { baseUrl: new URL('https://sessions.example.com'), userHeader: 'x-auth-request-email' }
    const ctx = setup({ ...hosted, allowedUsers: ['me@example.com'] }, ['me@example.com'])
    const me = { host: 'sessions.example.com', 'x-auth-request-email': 'me@example.com' }
    ctx.oauth.arm('me@example.com')
    const { body } = await register(ctx.app)
    const { verifier, challenge } = pkce()
    const { url } = await authorize(ctx.app, body.client_id, challenge, me, CALLBACK, 'https://sessions.example.com/mcp')
    const code = new URL(url!).searchParams.get('code')!
    const issued = await ctx.app.request('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: body.client_id, code_verifier: verifier }))
    expect(issued.status).toBe(200)
    const tokens = (await issued.json()) as { access_token: string; refresh_token: string }
    expect((await callMcp(ctx.app, tokens.access_token)).status).toBe(200)
    // The owner list changes (SP_OWNERS, restart): the same database, a server that no longer lists me.
    const later = setup({ ...hosted, allowedUsers: ['other@example.com'] }, ['other@example.com'], ctx.db)
    expect((await callMcp(later.app, tokens.access_token)).status).toBe(401)
    const refresh = await later.app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: body.client_id }))
    expect(refresh.status).toBe(400)
    expect(later.oauth.connections()).toEqual([])
  })

  it('hosted, only the owner sees and disconnects connections', async () => {
    const ctx = setup({ baseUrl: new URL('https://sessions.example.com'), allowedUsers: ['me@example.com'], userHeader: 'x-auth-request-email' }, ['me@example.com'])
    const url = 'https://sessions.example.com/api/mcp/connections'
    expect((await ctx.app.request(url, { headers: { 'x-auth-request-email': 'guest@example.com' } })).status).toBe(403)
    expect((await ctx.app.request(url, { headers: { 'x-auth-request-email': 'me@example.com' } })).status).toBe(200)
    expect((await ctx.app.request(`${url}/x`, { method: 'DELETE', headers: { 'x-auth-request-email': 'guest@example.com', 'x-sp': '1' } })).status).toBe(403)
  })
})

describe('request bodies', () => {
  it('refuses a registration over a megabyte before reading it', async () => {
    const { app } = setup()
    const res = await app.request('/oauth/register', { method: 'POST', headers: { ...LOCAL, 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'x'.repeat(1.5 * 1024 * 1024), redirect_uris: [CALLBACK] }) })
    expect(res.status).toBe(413)
  })
})

describe('several protected addresses (a build with OAuthResources)', () => {
  const ORIGIN = 'https://app.example.com'
  const A = `${ORIGIN}/spaces/aaaa/mcp`
  const B = `${ORIGIN}/spaces/bbbb/mcp`
  const NAMES: Record<string, string> = { [A]: 'Team <A>', [B]: 'Team B' }

  function hosted() {
    const owners: Record<string, string> = { [A]: 'ann', [B]: 'ben' }
    const db = openDb(':memory:')
    const oauth = new OAuthServer(db, {
      baseUrl: new URL(ORIGIN),
      resources: {
        find: (given) => (given !== undefined && NAMES[given] ? { resource: given, name: NAMES[given] } : null),
        signedIn: (c) => c.req.header('x-who') ?? null,
        allowed: (user, resource) => owners[resource] === user,
        displayName: (user) => `${user}@example.com`,
      },
      product: 'Example',
      texts: (c) => (c.req.header('accept-language') === 'de' ? { lang: 'de', allow: 'Erlauben', consentNote: 'Daten gehen an den Anbieter.' } : {}),
    })
    return { db, oauth, owners, app: oauth.routes() }
  }
  type Hosted = ReturnType<typeof hosted>

  const consent = async (ctx: Hosted, who: string, resource: string | undefined, headers: Record<string, string> = {}) => {
    const reg = await ctx.app.request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK] }) })
    const { client_id } = (await reg.json()) as { client_id: string }
    const { verifier, challenge } = pkce()
    const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', ...(resource ? { resource } : {}) })
    const page = await ctx.app.request(`/oauth/authorize?${q}`, { headers: { 'x-who': who, ...headers } })
    return { client_id, verifier, page }
  }
  const approve = async (ctx: Hosted, who: string, html: string) => {
    const request = /name="request" value="([^"]+)"/.exec(html)![1]
    return ctx.app.request('/oauth/authorize', { method: 'POST', headers: { 'x-who': who, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, decision: 'allow' }).toString() })
  }
  const tokenRequest = (ctx: Hosted, fields: Record<string, string>) =>
    ctx.app.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
  const connect = async (ctx: Hosted, who: string, resource: string) => {
    ctx.oauth.arm(who, resource)
    const { client_id, verifier, page } = await consent(ctx, who, resource)
    const done = await approve(ctx, who, await page.text())
    const code = new URL(done.headers.get('location')!).searchParams.get('code')!
    const res = await tokenRequest(ctx, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id, code_verifier: verifier, resource })
    return { clientId: client_id, tokens: (await res.json()) as { access_token: string; refresh_token: string } }
  }

  it('ties a token to the address that was named and the person who approved', async () => {
    const ctx = hosted()
    const { tokens, clientId } = await connect(ctx, 'ann', A)
    expect(ctx.oauth.verifyAccess(tokens.access_token)).toEqual({ clientId, user: 'ann', resource: A })
  })

  it('leaves the metadata of a single address out, and describes each address on request', async () => {
    const ctx = hosted()
    expect((await ctx.app.request('/.well-known/oauth-protected-resource')).status).toBe(404)
    expect((await ctx.app.request('/.well-known/oauth-protected-resource/mcp')).status).toBe(404)
    expect(ctx.oauth.protectedResourceMetadata(A)).toMatchObject({ resource: A, authorization_servers: [ORIGIN], resource_name: 'Example' })
  })

  it.each([[undefined], [`${ORIGIN}/mcp`], [`${ORIGIN}/spaces/cccc/mcp`]])('refuses a client naming %s', async (resource) => {
    const ctx = hosted()
    ctx.oauth.arm('ann', A)
    const { page } = await consent(ctx, 'ann', resource)
    expect(page.status).toBe(302)
    expect(new URL(page.headers.get('location')!).searchParams.get('error')).toBe('invalid_target')
  })

  it('shows consent only to whom the address allows, and only when signed in', async () => {
    const ctx = hosted()
    ctx.oauth.arm('ben', A)
    expect((await consent(ctx, 'ben', A)).page.status).toBe(403)
    const page = (await ctx.app.request(`/oauth/authorize?x=1`)).status
    expect(page).toBe(400)
    const { client_id } = await consent(ctx, 'ann', A)
    const { challenge } = pkce()
    const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource: A })
    expect((await ctx.app.request(`/oauth/authorize?${q}`)).status).toBe(403)
  })

  it('a start in Settings opens one address for one person', async () => {
    const ctx = hosted()
    ctx.owners[B] = 'ann'
    ctx.oauth.arm('ann', A)
    expect((await consent(ctx, 'ann', B)).page.status).toBe(403)
    expect((await consent(ctx, 'ann', A)).page.status).toBe(200)
  })

  it('names the place in the consent, escaped, with the texts of the build', async () => {
    const ctx = hosted()
    ctx.oauth.arm('ann', A)
    const html = await (await consent(ctx, 'ann', A, { 'accept-language': 'de' })).page.text()
    expect(html).toContain('Team &lt;A&gt;')
    expect(html).not.toContain('Team <A>')
    expect(html).toContain('Erlauben')
    expect(html).toContain('Daten gehen an den Anbieter.')
    expect(html).toContain('ann@example.com')
    expect(html).toContain('<html lang="de">')
  })

  it('a code gives nothing for another address, and nothing to someone who lost the address meanwhile', async () => {
    const ctx = hosted()
    ctx.oauth.arm('ann', A)
    const first = await consent(ctx, 'ann', A)
    const code = new URL((await approve(ctx, 'ann', await first.page.text())).headers.get('location')!).searchParams.get('code')!
    const other = await tokenRequest(ctx, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: first.client_id, code_verifier: first.verifier, resource: B })
    expect(other.status).toBe(400)
    expect(await other.json()).toEqual({ error: 'invalid_target' })

    ctx.oauth.arm('ann', A)
    const second = await consent(ctx, 'ann', A)
    const code2 = new URL((await approve(ctx, 'ann', await second.page.text())).headers.get('location')!).searchParams.get('code')!
    ctx.owners[A] = 'ben'
    const gone = await tokenRequest(ctx, { grant_type: 'authorization_code', code: code2, redirect_uri: CALLBACK, client_id: second.client_id, code_verifier: second.verifier })
    expect(await gone.json()).toEqual({ error: 'invalid_grant' })
  })

  it('an approval made after losing the address is refused', async () => {
    const ctx = hosted()
    ctx.oauth.arm('ann', A)
    const html = await (await consent(ctx, 'ann', A)).page.text()
    ctx.owners[A] = 'ben'
    expect((await approve(ctx, 'ann', html)).status).toBe(403)
  })

  it('losing an address ends the connection for good, and only that one', async () => {
    const ctx = hosted()
    ctx.owners[B] = 'ann'
    const a = await connect(ctx, 'ann', A)
    const b = await connect(ctx, 'ann', B)
    ctx.owners[A] = 'ben'
    expect(ctx.oauth.connections(A)).toEqual([])
    expect(ctx.oauth.verifyAccess(a.tokens.access_token)).toBeNull()
    ctx.owners[A] = 'ann'
    expect(ctx.oauth.verifyAccess(a.tokens.access_token)).toBeNull()
    expect(ctx.oauth.connections(A)).toEqual([])
    expect(ctx.oauth.verifyAccess(b.tokens.access_token)?.resource).toBe(B)
  })

  it('a refresh stays with its address, and ends with the standing', async () => {
    const ctx = hosted()
    const { clientId, tokens } = await connect(ctx, 'ann', A)
    const res = await tokenRequest(ctx, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    const next = (await res.json()) as { access_token: string; refresh_token: string }
    expect(ctx.oauth.verifyAccess(next.access_token)?.resource).toBe(A)
    ctx.owners[A] = 'ben'
    expect((await tokenRequest(ctx, { grant_type: 'refresh_token', refresh_token: next.refresh_token, client_id: clientId })).status).toBe(400)
  })

  it('lists and disconnects per address: one owner cannot end another address\'s connection', async () => {
    const ctx = hosted()
    const a = await connect(ctx, 'ann', A)
    const b = await connect(ctx, 'ben', B)
    expect(ctx.oauth.connections(A).map((c) => c.id)).toEqual([a.clientId])
    expect(ctx.oauth.connections(B).map((c) => c.id)).toEqual([b.clientId])
    expect(ctx.oauth.disconnect(b.clientId, A)).toBe(false)
    expect(ctx.oauth.verifyAccess(b.tokens.access_token)?.user).toBe('ben')
    expect(ctx.oauth.disconnect(a.clientId, A)).toBe(true)
    expect(ctx.oauth.verifyAccess(a.tokens.access_token)).toBeNull()
    expect(ctx.db.prepare('SELECT id FROM oauth_clients WHERE id = ?').get(a.clientId)).toBeUndefined()
  })

  it('a client connected to two addresses keeps the other when one is disconnected', async () => {
    const ctx = hosted()
    ctx.owners[B] = 'ann'
    const a = await connect(ctx, 'ann', A)
    ctx.oauth.arm('ann', B)
    const { challenge, verifier } = pkce()
    const q = new URLSearchParams({ response_type: 'code', client_id: a.clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', resource: B })
    const page = await ctx.app.request(`/oauth/authorize?${q}`, { headers: { 'x-who': 'ann' } })
    const code = new URL((await approve(ctx, 'ann', await page.text())).headers.get('location')!).searchParams.get('code')!
    const b = (await (await tokenRequest(ctx, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: a.clientId, code_verifier: verifier, resource: B })).json()) as { access_token: string }
    expect(ctx.oauth.disconnect(a.clientId, A)).toBe(true)
    expect(ctx.oauth.verifyAccess(a.tokens.access_token)).toBeNull()
    expect(ctx.oauth.verifyAccess(b.access_token)?.resource).toBe(B)
    expect(ctx.oauth.connections(B).map((c) => c.id)).toEqual([a.clientId])
  })
})
