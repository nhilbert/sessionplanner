import type { Hono } from 'hono'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { backupDaily } from './backup.ts'
import { type AppOptions, createApp } from './app.ts'
import type { Env, GuardOptions } from './guard.ts'
import { mcpRoutes } from './mcp.ts'
import { OAuthServer } from './oauth.ts'
import { dataPaths } from './storage.ts'

const BACKUP_CHECK_MS = 60 * 60 * 1000

/** Start-up was refused because of its configuration: the message says what to set, a stack trace would add nothing. */
export class RefusedStart extends Error {}

export interface RuntimeOptions extends GuardOptions, Pick<AppOptions, 'staticDir' | 'guestsFile' | 'linkToken'> {
  /** Holds everything of this runtime: sessions.db, backups/, files/ and themes/. Two runtimes never share one. */
  dataDir: string
  /** Static token for the MCP endpoint at /mcp. */
  mcpToken?: string
  /** OAuth for the MCP endpoint (docs/mcp.md): the address it issues tokens for, and redirects allowed beyond Claude's and loopback. */
  mcpOAuth?: { baseUrl: URL; extraRedirects: string[] }
}

export interface Runtime {
  app: Hono<Env>
  repo: Repo
  hub: Hub
  dbFile: string
  /** The backup made at start, if today had none yet. */
  backup: string | null
  mcp?: Hono
  oauth?: OAuthServer
  /** Stops the backup timer and closes the database. Not while requests or live-update streams are open. */
  close(): void
}

/**
 * Everything that belongs to one set of data: database, backups, live updates and the app on top of them. It can be
 * called several times in a process, with a `dataDir` each; what exists once per process (the environment, the port)
 * stays with the caller, as in server/index.ts.
 */
export function createRuntime({ dataDir, publicUrl, owners, ownerHeader, proxySecret, staticDir, guestsFile, linkToken, mcpToken, mcpOAuth }: RuntimeOptions): Runtime {
  // Hosted without an owner list the API would trust the proxy alone; refuse instead of failing open.
  if (publicUrl && !owners.length) throw new RefusedStart('SP_PUBLIC_URL is set but SP_OWNERS is empty: name the e-mail address(es) the login lets in.')
  if (publicUrl && !proxySecret) {
    console.warn('SP_PROXY_SECRET is not set: the login e-mail header is trusted from anyone who reaches this port. Set it here and in the reverse proxy (docs/mcp.md, Hosting).')
  }

  const { dbFile, backupDir, filesDir, themesDir } = dataPaths(dataDir)
  const db = openDb(dbFile)
  const repo = new Repo(db)
  const backup = backupDaily(db, dbFile, backupDir)
  const backupTimer = setInterval(() => backupDaily(db, dbFile, backupDir), BACKUP_CHECK_MS)
  backupTimer.unref()

  const hub = new Hub()

  // MCP endpoint for AI agents at /mcp: with a static token and/or OAuth for Claude's connectors (docs/mcp.md).
  // Hosted, the owners (checked by the login proxy) approve connections; locally a browser on this machine.
  const oauth = mcpOAuth && new OAuthServer(db, { baseUrl: mcpOAuth.baseUrl, allowedUsers: owners, userHeader: ownerHeader, proxySecret, extraRedirects: mcpOAuth.extraRedirects })
  const mcp = mcpToken || oauth ? mcpRoutes(repo, { token: mcpToken, oauth }, { hub, filesDir, themesDir }) : undefined

  const app = createApp({
    repo,
    hub,
    filesDir,
    themesDir,
    staticDir,
    publicUrl,
    owners,
    ownerHeader,
    proxySecret,
    guestsFile,
    mcp,
    oauth: oauth && { routes: oauth.routes(), admin: oauth.adminRoutes() },
    linkToken,
  })

  return {
    app,
    repo,
    hub,
    dbFile,
    backup,
    mcp,
    oauth,
    close() {
      clearInterval(backupTimer)
      db.close()
    },
  }
}
