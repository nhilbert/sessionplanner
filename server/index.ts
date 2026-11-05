/**
 * Session Planner server – one process: JSON API + SQLite + live updates + (after `npm run build`) the web UI.
 * Binds to 127.0.0.1 unless SP_HOST says otherwise (0.0.0.0 inside the container, which is reachable
 * only through the reverse proxy with its login).
 *
 *   npm run dev    Vite dev server (UI) + this server (API)
 *   npm start      this server serving dist/ on http://127.0.0.1:5175
 *
 * This file reads the environment and owns the port; everything else starts in server/runtime.ts.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createRuntime, RefusedStart, type Runtime } from './runtime.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const PORT = Number(process.env.SP_PORT || 5175)
const HOST = process.env.SP_HOST || '127.0.0.1'
// Hosted behind the login proxy: the public address, e.g. https://sessions.example.com.
const PUBLIC_URL = process.env.SP_PUBLIC_URL?.trim() ? new URL(process.env.SP_PUBLIC_URL.trim()) : undefined
const OWNERS = (process.env.SP_OWNERS ?? '')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean)
const DIST = 'dist'
const MCP_TOKEN = process.env.SP_MCP_TOKEN?.trim() || undefined
const list = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const hasUi = existsSync(path.join(DIST, 'index.html'))

let runtime: Runtime
try {
  runtime = createRuntime({
    dataDir: process.env.SP_DATA_DIR || 'data',
    publicUrl: PUBLIC_URL,
    owners: OWNERS,
    ownerHeader: process.env.SP_OWNER_HEADER?.trim().toLowerCase() || 'x-auth-request-email',
    // Hosted: the login proxy adds this secret to every request it forwards, so the e-mail header it sets cannot be
    // forged by whoever reaches the port some other way (docs/mcp.md, Hosting).
    proxySecret: process.env.SP_PROXY_SECRET?.trim() || undefined,
    staticDir: hasUi ? DIST : undefined,
    guestsFile: process.env.SP_GUESTS_FILE?.trim() || undefined,
    linkToken: process.env.SP_LINK_TOKEN?.trim() || undefined,
    mcpToken: MCP_TOKEN,
    mcpOAuth: process.env.SP_MCP_OAUTH === '1' ? { baseUrl: PUBLIC_URL ?? new URL(`http://127.0.0.1:${PORT}`), extraRedirects: list(process.env.SP_OAUTH_REDIRECTS) } : undefined,
  })
} catch (err) {
  if (!(err instanceof RefusedStart)) throw err
  console.error(err.message)
  process.exit(1)
}
const { app, dbFile, backup, mcp, oauth } = runtime

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`Session Planner on http://${HOST}:${PORT}${PUBLIC_URL ? ` (public ${PUBLIC_URL.origin})` : ''} · database ${dbFile}${backup ? ` · backup ${backup}` : ''}`)
  if (!hasUi) console.log('No dist/ build found: serving the API only (fine with npm run dev; run npm run build for npm start).')
  console.log(mcp ? `MCP: ${oauth ? oauth.resource : `http://${HOST}:${PORT}/mcp`} (${[MCP_TOKEN && 'token', oauth && 'OAuth'].filter(Boolean).join(' + ')})` : 'MCP: off over HTTP (set SP_MCP_OAUTH=1 or SP_MCP_TOKEN); stdio via npm run mcp')
})
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use: another Session Planner is probably still running. Find it with  ss -lptn 'sport = :${PORT}'`)
  else console.error('Server failed to start:', err.message)
  process.exit(1)
})
