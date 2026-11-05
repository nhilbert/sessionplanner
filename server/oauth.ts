import { Hono, type Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { createHash, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type Env, fromProxy } from './guard.ts'

/**
 * OAuth 2.1 authorization server for the MCP endpoint, as Claude's connectors expect it
 * (protected resource metadata RFC 9728, server metadata RFC 8414, dynamic client registration
 * RFC 7591, authorization code with S256 PKCE, rotating refresh tokens, revocation RFC 7009).
 *
 * Session Planner has no passwords: who may approve a connection is decided by the login in front of it.
 *  - hosted: oauth2-proxy (Entra ID, MFA) guards /oauth/authorize and passes the signed-in e-mail in
 *    a header (SP_OWNER_HEADER); only the owners (SP_OWNERS) may approve.
 *  - local: only a browser on this machine (loopback host) may approve.
 * Discovery, /oauth/register, /oauth/token, /oauth/revoke and /mcp must be reachable without the login.
 *
 * Hosted, an owner approves a new connection only after starting it in Settings (arm, ARM_TTL_MS): a consent
 * link someone else sends cannot connect their agent to the owner's workshops at any other time. Locally a code
 * can only reach a program on this machine (loopback redirects; Claude's servers cannot reach it), so no arming.
 *
 * A build that hosts several protected addresses gives `resources` (OAuthResources): one sign-in service at the root,
 * every token tied to the one address a client named and the person who approved it. The build then serves the
 * resource metadata and the addresses themselves, and answers for who may connect.
 */

export interface OAuthConfig {
  /** Public origin of the app, e.g. https://sessions.example.com (issuer and resource are derived from it). */
  baseUrl: URL
  /** Hosted: header the login proxy sets with the signed-in user's e-mail, e.g. x-auth-request-email. */
  userHeader?: string
  /** Hosted: e-mail addresses allowed to approve connections. Empty = local mode (loopback only). */
  allowedUsers?: string[]
  /** Hosted: the login proxy's secret (SP_PROXY_SECRET); with it, the e-mail header counts only together with it. */
  proxySecret?: string
  /** Extra redirect URIs accepted at registration besides Claude's callbacks and loopback. */
  extraRedirects?: string[]
  accessTtlSeconds?: number
  refreshTtlDays?: number
  /** Address of the connecting peer; defaults to the socket's. Injectable for tests. */
  remoteAddress?: (c: Context) => string | undefined
  /** Several protected addresses instead of the one /mcp, decided by the build; `allowedUsers` and `userHeader` then do not count. */
  resources?: OAuthResources
  /** The name people see on the pages and in the metadata: plain text from the build, without characters HTML treats specially. */
  product?: string
  /** What a page says, for a build with other languages; what is left out stays English. */
  texts?: (c: Context) => Partial<OAuthTexts>
}

/** What a build answers when it hosts several protected addresses (see OAuthServer). */
export interface OAuthResources {
  /** The address a client named, spelled the one way a token keeps it, and what the consent page calls it. Null for anything else, also when none is named. */
  find(given: string | undefined): { resource: string; name: string } | null
  /** Who is signed in, whatever they may do. */
  signedIn(c: Context): string | null
  /** Whether `user` may connect to `resource`. Asked at every step, so a change counts from the next call on. */
  allowed(user: string, resource: string): boolean
  /** How the consent page names `user`, when the id means nothing to a person. */
  displayName?(user: string): string
}

/** What the approval pages say. The pages' bodies are HTML, and what is given to them is already escaped; titles are plain text, escaped when written. */
export interface OAuthTexts {
  lang: string
  notArmedTitle: string
  notArmed: (minutes: number) => string
  unknownClientTitle: string
  unknownClient: string
  badRedirectTitle: string
  badRedirect: string
  notAllowedTitle: string
  notAllowedLocal: string
  notAllowedUser: string
  sameUser: string
  expiredTitle: string
  expired: string
  consentTitle: (target: string | null) => string
  consent: (client: string | null, target: string | null) => string
  /** Where the data goes beyond this app; empty says nothing. */
  consentNote: string
  sentTo: (host: string) => string
  loopbackWarning: string
  signedInAs: (user: string) => string
  allow: string
  deny: string
}

const englishTexts = (product: string): OAuthTexts => ({
  lang: 'en',
  notArmedTitle: `Start the connection in ${product} first`,
  notArmed: (minutes) =>
    `<p>A new connection can be approved only within ${minutes} minutes after you started it in ${product}: Settings → AI agents → <strong>Connect an agent</strong>. Then add or reconnect it in your application again.</p>` +
    '<p class="warn">If you did not just set up a connection yourself, close this page: someone may be trying to connect their own agent to your workshops.</p>',
  unknownClientTitle: 'Unknown client',
  unknownClient: `<p>This application is not registered with ${product}.</p>`,
  badRedirectTitle: 'Invalid redirect',
  badRedirect: '<p>The redirect address is not registered for this application.</p>',
  notAllowedTitle: 'Not allowed',
  notAllowedLocal: `<p>Connections can only be approved in a browser on the computer running ${product}.</p>`,
  notAllowedUser: `<p>Your account may not approve connections to ${product}.</p>`,
  sameUser: '<p>The approval must come from the same signed-in user.</p>',
  expiredTitle: 'Request expired',
  expired: '<p>Start the connection again from your application.</p>',
  consentTitle: (target) => `Connect to ${target ?? product}?`,
  consent: (client, target) => `<p><strong>${client ?? 'An application'}</strong> wants to read and change ${target ? `the workshops of <strong>${target}</strong>` : 'your workshops'}: agendas, notes, material, packing lists and the library.</p>`,
  consentNote: '',
  sentTo: (host) => `After approval you are sent to <code>${host}</code>.`,
  loopbackWarning: 'That is a program on this computer – approve only if you just started the connection yourself (e.g. in Claude Code).',
  signedInAs: (user) => `Signed in as ${user}. You can disconnect it any time in ${product} under Settings.`,
  allow: 'Allow',
  deny: 'Deny',
})

export interface AccessInfo {
  clientId: string
  user: string
  /** The address the token was issued for; with several, whoever serves an address must compare it. */
  resource: string
}

export const CLAUDE_CALLBACKS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']
const SCOPE = 'sessionplanner'
const CODE_TTL_MS = 60_000
const PENDING_TTL_MS = 10 * 60_000
/** After an owner pressed "Connect an agent" in Settings, one connection may be approved within this time. */
export const ARM_TTL_MS = 10 * 60_000
/** A refresh token presented again within this window is a retry, not theft: refuse it, keep the family. */
const REUSE_GRACE_MS = 30_000
/** A registration is followed by sign-in within minutes; clients still without tokens after this are dropped. */
const IDLE_CLIENT_TTL_MS = 15 * 60_000
const MAX_IDLE_CLIENTS = 200

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const randomToken = () => randomBytes(32).toString('base64url')
/** A start in Settings counts for one person and one address, so that it opens nothing else. */
const armKey = (user: string, resource: string) => JSON.stringify([user, resource])
const isLoopbackHost = (host: string) => host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
const isLoopbackAddress = (addr: string | undefined) => !!addr && (addr === '::1' || /^(::ffff:)?127\./.test(addr))

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address
  } catch {
    return undefined // not running on @hono/node-server
  }
}

/**
 * Who is approving: the e-mail from the login proxy (hosted) or "local" for a browser on this machine.
 * Locally both the socket's peer and the Host header must be loopback: the Host header alone is set by
 * the client, and in a container (SP_HOST=0.0.0.0) other machines may reach the port. Hosted, the
 * header is only as trustworthy as the rule that the port is reachable through the proxy alone, unless the
 * proxy also sends its secret (SP_PROXY_SECRET), which is then required.
 * An empty `allowedUsers` means local mode.
 */
export function signedInUser(
  c: Context,
  cfg: { allowedUsers: string[]; userHeader?: string; proxySecret?: string; remoteAddress?: (c: Context) => string | undefined },
): string | null {
  if (!fromProxy(c.req.raw.headers, cfg.proxySecret)) return null
  if (cfg.allowedUsers.length) {
    const email = cfg.userHeader ? c.req.header(cfg.userHeader)?.trim().toLowerCase() : undefined
    return email && cfg.allowedUsers.includes(email) ? email : null
  }
  const host = (c.req.header('host') ?? new URL(c.req.url).host).replace(/:\d+$/, '')
  return isLoopbackAddress((cfg.remoteAddress ?? socketAddress)(c)) && isLoopbackHost(host) && !c.req.header('x-forwarded-for') ? 'local' : null
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

/** A small self-contained page (no scripts, not framable) for the approval steps. */
export function simplePage(c: Context, title: string, body: string, status: 200 | 400 | 403 | 502 = 200, lang = 'en') {
  c.header('X-Frame-Options', 'DENY')
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  return c.html(
    `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1f2421;line-height:1.5}` +
      `button{font:inherit;padding:.5rem 1.1rem;border-radius:.5rem;border:1px solid #9aa59c;background:#fff;margin-right:.5rem;cursor:pointer}` +
      `button.ok{background:#4f6b55;color:#fff;border-color:#4f6b55}code{background:#eef1ee;padding:0 .25rem;border-radius:.25rem}.warn{color:#8a5a00}</style></head>` +
      `<body><h1 style="font-size:1.3rem">${escapeHtml(title)}</h1>${body}</body></html>`,
    status,
  )
}

interface Client {
  client_id: string
  client_name?: string
  redirect_uris: string[]
  client_id_issued_at: number
}

interface AuthRequest {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state?: string
  resource: string
  user: string
}

export class OAuthServer {
  private db: DatabaseSync
  private cfg: Required<Omit<OAuthConfig, 'userHeader' | 'proxySecret' | 'remoteAddress' | 'resources' | 'texts'>> &
    Pick<OAuthConfig, 'userHeader' | 'proxySecret' | 'resources' | 'texts'> & { remoteAddress: (c: Context) => string | undefined }
  private pending = new Map<string, AuthRequest & { expires: number }>()
  private codes = new Map<string, AuthRequest & { expires: number }>()
  /** Hosted: owners who started a connection in Settings for an address, until when (see arm). */
  private armed = new Map<string, number>()

  constructor(db: DatabaseSync, cfg: OAuthConfig) {
    this.db = db
    this.cfg = {
      accessTtlSeconds: 3600,
      refreshTtlDays: 30,
      allowedUsers: [],
      extraRedirects: [],
      product: 'Session Planner',
      remoteAddress: socketAddress,
      ...cfg,
      userHeader: cfg.userHeader?.toLowerCase(),
    }
    this.cfg.allowedUsers = this.cfg.allowedUsers.map((u) => u.trim().toLowerCase()).filter(Boolean)
  }

  get issuer(): string {
    return this.cfg.baseUrl.origin
  }
  get resource(): string {
    return `${this.issuer}/mcp`
  }
  get resourceMetadataUrl(): string {
    return `${this.issuer}/.well-known/oauth-protected-resource/mcp`
  }
  private get local(): boolean {
    return !this.cfg.resources && this.cfg.allowedUsers.length === 0
  }
  /** Whether the user a token was issued to may still use it: an owner, or anyone in local mode; with several addresses, the build's word. */
  private allowed(user: string, resource: string): boolean {
    if (this.cfg.resources) return this.cfg.resources.allowed(user, resource)
    return this.local || this.cfg.allowedUsers.includes(user)
  }
  /** The metadata of a protected address (RFC 9728), for a build that serves it itself. */
  protectedResourceMetadata(resource: string) {
    return { resource, authorization_servers: [this.issuer], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: this.cfg.product }
  }

  // ---------- policy ----------

  /** Who is approving (see signedInUser). */
  private approver(c: Context): string | null {
    return this.cfg.resources ? this.cfg.resources.signedIn(c) : signedInUser(c, this.cfg)
  }

  private texts(c: Context): OAuthTexts {
    return { ...englishTexts(this.cfg.product), ...this.cfg.texts?.(c) }
  }

  /** Redirect URIs a client may register: Claude's callbacks, loopback (Claude Code, RFC 8252) and configured extras. */
  private redirectAllowed(uri: string): boolean {
    if (CLAUDE_CALLBACKS.includes(uri) || this.cfg.extraRedirects.includes(uri)) return true
    try {
      const u = new URL(uri)
      return u.protocol === 'http:' && isLoopbackHost(u.hostname) && !u.username && !u.password && !u.hash
    } catch {
      return false
    }
  }

  /** Exact match, except that loopback redirects match on any port (RFC 8252 section 7.3). */
  private redirectMatches(client: Client, uri: string): boolean {
    if (client.redirect_uris.includes(uri)) return true
    let u: URL
    try {
      u = new URL(uri)
    } catch {
      return false
    }
    if (u.protocol !== 'http:' || !isLoopbackHost(u.hostname)) return false
    return client.redirect_uris.some((r) => {
      // Registered addresses passed redirectAllowed, but a configured extra (SP_OAUTH_REDIRECTS) need not parse.
      if (!URL.canParse(r)) return false
      const v = new URL(r)
      return v.protocol === 'http:' && v.hostname === u.hostname && v.pathname === u.pathname && v.search === u.search
    })
  }

  /** The resource indicator (RFC 8707) must name this MCP endpoint; locally any loopback spelling of it. */
  private resourceOk(resource: string | undefined): boolean {
    if (this.cfg.resources) return this.cfg.resources.find(resource) !== null
    if (!resource) return true
    try {
      const u = new URL(resource)
      const path = u.pathname.replace(/\/$/, '')
      if (path !== '/mcp') return false
      if (u.origin === this.issuer) return true
      return this.local && isLoopbackHost(u.hostname) && isLoopbackHost(this.cfg.baseUrl.hostname)
    } catch {
      return false
    }
  }

  // ---------- storage ----------

  private client(id: string | undefined): Client | null {
    if (!id) return null
    const row = this.db.prepare('SELECT data FROM oauth_clients WHERE id = ?').get(id) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as Client) : null
  }

  private issueTokens(clientId: string, user: string, resource: string, family: string = crypto.randomUUID()) {
    const access = randomToken()
    const refresh = randomToken()
    const now = Date.now()
    const insert = this.db.prepare('INSERT INTO oauth_tokens(hash, kind, client_id, family, user, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    insert.run(sha256(access), 'access', clientId, family, user, resource, now + this.cfg.accessTtlSeconds * 1000, new Date(now).toISOString())
    insert.run(sha256(refresh), 'refresh', clientId, family, user, resource, now + this.cfg.refreshTtlDays * 86_400_000, new Date(now).toISOString())
    this.db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now)
    return { access_token: access, token_type: 'Bearer', expires_in: this.cfg.accessTtlSeconds, refresh_token: refresh, scope: SCOPE }
  }

  private revokeFamily(family: string): void {
    this.db.prepare('DELETE FROM oauth_tokens WHERE family = ?').run(family)
  }

  /** Checks a bearer token from /mcp; returns who it belongs to, or null. */
  verifyAccess(token: string): AccessInfo | null {
    const row = this.db.prepare(`SELECT client_id, user, resource, expires_at FROM oauth_tokens WHERE hash = ? AND kind = 'access'`).get(sha256(token)) as
      | { client_id: string; user: string; resource: string; expires_at: number }
      | undefined
    if (!row || row.expires_at < Date.now()) return null
    // The owner list decides who may use the tools, not only who may approve: someone taken off it (SP_OWNERS,
    // restart) is refused with their next call, however long their tokens would still live.
    if (!this.allowed(row.user, row.resource)) {
      // With several addresses a person's standing is the build's and can change for good: the connection ends with it.
      if (this.cfg.resources) this.db.prepare('DELETE FROM oauth_tokens WHERE user = ? AND resource = ?').run(row.user, row.resource)
      return null
    }
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString()
    this.db.prepare('UPDATE oauth_clients SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)').run(new Date().toISOString(), row.client_id, cutoff)
    return { clientId: row.client_id, user: row.user, resource: row.resource }
  }

  /** Connected agents (clients holding a valid refresh token), for Settings; with several addresses, those of `resource`. */
  connections(resource?: string): { id: string; name: string; user: string; createdAt: string; lastUsedAt: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.data, c.created_at, c.last_used_at, MIN(t.user) AS user FROM oauth_clients c
         JOIN oauth_tokens t ON t.client_id = c.id AND t.kind = 'refresh' AND t.used_at IS NULL AND t.expires_at > ? ${resource === undefined ? '' : 'AND t.resource = ?'}
         GROUP BY c.id ORDER BY c.created_at`,
      )
      .all(...(resource === undefined ? [Date.now()] : [Date.now(), resource])) as { id: string; data: string; created_at: string; last_used_at: string | null; user: string }[]
    return rows.filter((r) => resource === undefined || this.allowed(r.user, resource)).map((r) => ({ id: r.id, name: (JSON.parse(r.data) as Client).client_name ?? 'MCP client', user: r.user, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
  }

  /** Disconnect an agent: all its tokens stop working at once. With `resource`, only those for that address, and the client goes when nothing else is left. */
  disconnect(clientId: string, resource?: string): boolean {
    if (resource !== undefined) {
      const removed = Number(this.db.prepare('DELETE FROM oauth_tokens WHERE client_id = ? AND resource = ?').run(clientId, resource).changes) > 0
      if (removed) this.db.prepare('DELETE FROM oauth_clients WHERE id = ? AND id NOT IN (SELECT client_id FROM oauth_tokens)').run(clientId)
      return removed
    }
    this.db.prepare('DELETE FROM oauth_tokens WHERE client_id = ?').run(clientId)
    return Number(this.db.prepare('DELETE FROM oauth_clients WHERE id = ?').run(clientId).changes) > 0
  }

  /** Hosted: lets `user` approve one new connection to `resource` within ARM_TTL_MS (Settings → AI agents → Connect an agent). */
  arm(user: string, resource: string = this.resource): string {
    const until = Date.now() + ARM_TTL_MS
    this.armed.set(armKey(user, resource), until)
    return new Date(until).toISOString()
  }

  /** Until when `user` may approve a new connection to `resource`, or null; locally always (no arming). */
  armedUntil(user: string, resource: string = this.resource): number | null {
    if (this.local) return Number.POSITIVE_INFINITY
    const key = armKey(user, resource)
    const until = this.armed.get(key)
    if (until === undefined || until < Date.now()) {
      this.armed.delete(key)
      return null
    }
    return until
  }

  // ---------- HTTP ----------

  private page(c: Context, title: string, body: string, status: 200 | 400 | 403 = 200) {
    return simplePage(c, title, body, status, this.texts(c).lang)
  }

  private notArmed(c: Context) {
    const t = this.texts(c)
    return this.page(c, t.notArmedTitle, t.notArmed(ARM_TTL_MS / 60_000), 403)
  }

  routes(): Hono {
    const app = new Hono()
    if (!this.cfg.resources) {
      const protectedResource = (c: Context) => c.json(this.protectedResourceMetadata(this.resource))
      app.get('/.well-known/oauth-protected-resource', protectedResource)
      app.get('/.well-known/oauth-protected-resource/mcp', protectedResource)
    }
    app.get('/.well-known/oauth-authorization-server', (c) =>
      c.json({
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/oauth/authorize`,
        token_endpoint: `${this.issuer}/oauth/token`,
        registration_endpoint: `${this.issuer}/oauth/register`,
        revocation_endpoint: `${this.issuer}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        revocation_endpoint_auth_methods_supported: ['none'],
        scopes_supported: [SCOPE],
        authorization_response_iss_parameter_supported: true,
      }),
    )

    app.post('/oauth/register', async (c) => {
      const body = (await c.req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null
      const uris = body?.redirect_uris
      if (!Array.isArray(uris) || !uris.length || !uris.every((u) => typeof u === 'string')) {
        return c.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris required' }, 400)
      }
      const bad = (uris as string[]).filter((u) => !this.redirectAllowed(u))
      if (bad.length) return c.json({ error: 'invalid_redirect_uri', error_description: `not allowed: ${bad.join(', ')}` }, 400)
      // Registration is open, and clients register again on every fresh connection: drop those that got no
      // tokens soon after, and beyond the cap the oldest of them, so a flood cannot lock the owner out.
      // A client in the middle of signing in (consent pending or code issued) is never dropped.
      const now = Date.now()
      const signingIn = JSON.stringify([...this.pending.values(), ...this.codes.values()].filter((r) => r.expires >= now).map((r) => r.clientId))
      const idle = 'id NOT IN (SELECT client_id FROM oauth_tokens) AND id NOT IN (SELECT value FROM json_each(?))'
      this.db.prepare(`DELETE FROM oauth_clients WHERE created_at < ? AND ${idle}`).run(new Date(now - IDLE_CLIENT_TTL_MS).toISOString(), signingIn)
      this.db
        .prepare(`DELETE FROM oauth_clients WHERE id IN (SELECT id FROM oauth_clients WHERE ${idle} ORDER BY created_at DESC LIMIT -1 OFFSET ?)`)
        .run(signingIn, MAX_IDLE_CLIENTS - 1)
      const client: Client = {
        client_id: crypto.randomUUID(),
        client_name: typeof body?.client_name === 'string' ? body.client_name.slice(0, 100) : undefined,
        redirect_uris: uris as string[],
        client_id_issued_at: Math.floor(Date.now() / 1000),
      }
      this.db.prepare('INSERT INTO oauth_clients(id, data, created_at) VALUES (?, ?, ?)').run(client.client_id, JSON.stringify(client), new Date().toISOString())
      return c.json({ ...client, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPE }, 201)
    })

    app.get('/oauth/authorize', (c) => {
      const q = c.req.query()
      const t = this.texts(c)
      const client = this.client(q.client_id)
      // Until client and redirect URI are known to be good, errors are shown here and never redirected.
      if (!client) return this.page(c, t.unknownClientTitle, t.unknownClient, 400)
      if (!q.redirect_uri || !this.redirectMatches(client, q.redirect_uri)) return this.page(c, t.badRedirectTitle, t.badRedirect, 400)
      const fail = (error: string) => {
        const u = new URL(q.redirect_uri)
        u.searchParams.set('error', error)
        if (q.state) u.searchParams.set('state', q.state)
        u.searchParams.set('iss', this.issuer)
        return c.redirect(u.toString(), 302)
      }
      if (q.response_type !== 'code') return fail('unsupported_response_type')
      if (!q.code_challenge || q.code_challenge_method !== 'S256') return fail('invalid_request')
      if (!this.resourceOk(q.resource)) return fail('invalid_target')
      const named = this.cfg.resources?.find(q.resource) ?? null
      const resource = named?.resource ?? this.resource
      const user = this.approver(c)
      if (!user || !this.allowed(user, resource)) return this.page(c, t.notAllowedTitle, this.local ? t.notAllowedLocal : t.notAllowedUser, 403)
      if (this.armedUntil(user, resource) === null) return this.notArmed(c)
      const id = randomToken()
      const now = Date.now()
      for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k)
      this.pending.set(id, { clientId: client.client_id, redirectUri: q.redirect_uri, codeChallenge: q.code_challenge, state: q.state, resource, user, expires: now + PENDING_TTL_MS })
      const target = new URL(q.redirect_uri)
      const loopback = isLoopbackHost(target.hostname)
      const place = named ? escapeHtml(named.name) : null
      return this.page(
        c,
        t.consentTitle(named ? named.name : null),
        t.consent(client.client_name === undefined ? null : escapeHtml(client.client_name), place) +
          (t.consentNote ? `<p>${t.consentNote}</p>` : '') +
          `<p>${t.sentTo(escapeHtml(target.host))}${loopback ? ` <span class="warn">${t.loopbackWarning}</span>` : ''}</p>` +
          `<p style="color:#5d665f;font-size:.9rem">${t.signedInAs(escapeHtml(this.cfg.resources?.displayName?.(user) ?? user))}</p>` +
          `<form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${id}">` +
          `<button class="ok" name="decision" value="allow">${t.allow}</button><button name="decision" value="deny">${t.deny}</button></form>`,
      )
    })

    app.post('/oauth/authorize', async (c) => {
      const form = await c.req.parseBody()
      const id = typeof form.request === 'string' ? form.request : ''
      const req = this.pending.get(id)
      this.pending.delete(id)
      const t = this.texts(c)
      if (!req || req.expires < Date.now()) return this.page(c, t.expiredTitle, t.expired, 400)
      if (this.approver(c) !== req.user || !this.allowed(req.user, req.resource)) return this.page(c, t.notAllowedTitle, t.sameUser, 403)
      const u = new URL(req.redirectUri)
      if (form.decision === 'allow') {
        // One approval per start in Settings: a second consent page opened meanwhile (someone else's link) is refused.
        if (this.armedUntil(req.user, req.resource) === null) return this.notArmed(c)
        this.armed.delete(armKey(req.user, req.resource))
        const code = randomToken()
        // A code is removed when it is exchanged; one that never is (closed tab, crashed client) would stay for the
        // life of the process, so the expired ones go whenever a new one is issued, as with the pending requests.
        const now = Date.now()
        for (const [k, v] of this.codes) if (v.expires < now) this.codes.delete(k)
        this.codes.set(sha256(code), { ...req, expires: now + CODE_TTL_MS })
        u.searchParams.set('code', code)
      } else u.searchParams.set('error', 'access_denied')
      if (req.state) u.searchParams.set('state', req.state)
      u.searchParams.set('iss', this.issuer)
      return c.redirect(u.toString(), 302)
    })

    app.post('/oauth/token', async (c) => {
      c.header('Cache-Control', 'no-store')
      const form = await c.req.parseBody()
      const f = (k: string) => (typeof form[k] === 'string' ? (form[k] as string) : undefined)
      const err = (error: string, status: 400 | 401 = 400) => c.json({ error }, status)
      const client = this.client(f('client_id'))
      if (!client) return err('invalid_client', 401)

      if (f('grant_type') === 'authorization_code') {
        const code = f('code')
        const key = code ? sha256(code) : ''
        const entry = this.codes.get(key)
        this.codes.delete(key) // single use, also when the checks below fail
        if (!entry || entry.expires < Date.now() || entry.clientId !== client.client_id || entry.redirectUri !== f('redirect_uri')) return err('invalid_grant')
        const verifier = f('code_verifier') ?? ''
        if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) || createHash('sha256').update(verifier).digest('base64url') !== entry.codeChallenge) return err('invalid_grant')
        if (this.cfg.resources) {
          // The code was approved for one address, so naming it again is optional and only that one comes out of it; the person may have lost it in between.
          if (f('resource') !== undefined && this.cfg.resources.find(f('resource'))?.resource !== entry.resource) return err('invalid_target')
          if (!this.allowed(entry.user, entry.resource)) return err('invalid_grant')
        } else if (!this.resourceOk(f('resource'))) return err('invalid_target')
        return c.json(this.issueTokens(client.client_id, entry.user, entry.resource))
      }

      if (f('grant_type') === 'refresh_token') {
        const token = f('refresh_token') ?? ''
        const row = this.db.prepare(`SELECT client_id, family, user, resource, expires_at, used_at FROM oauth_tokens WHERE hash = ? AND kind = 'refresh'`).get(sha256(token)) as
          | { client_id: string; family: string; user: string; resource: string; expires_at: number; used_at: number | null }
          | undefined
        if (!row || row.client_id !== client.client_id || row.expires_at < Date.now()) return err('invalid_grant')
        if (!this.allowed(row.user, row.resource)) {
          // No longer an owner: the connection ends instead of being renewed for another 30 days.
          this.revokeFamily(row.family)
          return err('invalid_grant')
        }
        if (row.used_at !== null) {
          // Rotated before: a late retry is refused; a replay after that means the token leaked, so the whole family goes.
          if (Date.now() - row.used_at > REUSE_GRACE_MS) this.revokeFamily(row.family)
          return err('invalid_grant')
        }
        this.db.prepare(`DELETE FROM oauth_tokens WHERE family = ? AND kind = 'access'`).run(row.family)
        this.db.prepare('UPDATE oauth_tokens SET used_at = ? WHERE hash = ?').run(Date.now(), sha256(token))
        return c.json(this.issueTokens(client.client_id, row.user, row.resource, row.family))
      }
      return err('unsupported_grant_type')
    })

    app.post('/oauth/revoke', async (c) => {
      const form = await c.req.parseBody()
      const token = typeof form.token === 'string' ? form.token : ''
      const row = this.db.prepare('SELECT family FROM oauth_tokens WHERE hash = ?').get(sha256(token)) as { family: string } | undefined
      if (row) this.revokeFamily(row.family)
      return c.body(null, 200)
    })
    return app
  }

  /**
   * Settings → AI agents (under /api/mcp, behind the guard, owner only): the connections, disconnecting one, and
   * starting a new one (arm). `armRequired` is false locally, where approving needs no start in Settings.
   */
  adminRoutes(): Hono<Env> {
    const app = new Hono<Env>()
    const who = (c: Context<Env>) => c.get('user').email ?? 'local'
    const until = (user: string) => {
      const t = this.local ? null : this.armedUntil(user)
      return t === null ? null : new Date(t).toISOString()
    }
    app.get('/connections', (c) => c.json({ connections: this.connections(), resource: this.resource, armRequired: !this.local, armedUntil: until(who(c)) }))
    app.post('/arm', (c) => c.json({ armedUntil: this.arm(who(c)), resource: this.resource }))
    app.delete('/connections/:id', (c) => c.json({ ok: this.disconnect(c.req.param('id')) }))
    return app
  }
}
