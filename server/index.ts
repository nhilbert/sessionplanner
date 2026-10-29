/**
 * Session Planner server – one process: JSON API + SQLite + live updates + (after `npm run build`) the web UI.
 * Binds to 127.0.0.1 unless SP_HOST says otherwise (0.0.0.0 inside the container, which is reachable
 * only through the reverse proxy with its login).
 *
 *   npm run dev    Vite dev server (UI) + this server (API)
 *   npm start      this server serving dist/ on http://127.0.0.1:5175
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { backupDaily } from './backup.ts'
import { createApp } from './app.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const PORT = Number(process.env.SP_PORT || 5175)
const HOST = process.env.SP_HOST || '127.0.0.1'
// Hosted behind the login proxy: the public address, e.g. https://sessions.example.com.
const PUBLIC_URL = process.env.SP_PUBLIC_URL?.trim() ? new URL(process.env.SP_PUBLIC_URL.trim()) : undefined
const OWNERS = (process.env.SP_OWNERS ?? '')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean)
const DATA_DIR = process.env.SP_DATA_DIR || 'data'
const DB_FILE = path.join(DATA_DIR, 'sessions.db')
const DIST = 'dist'

if (PUBLIC_URL && !OWNERS.length) {
  // Hosted without an owner list the API would trust the proxy alone; refuse instead of failing open.
  console.error('SP_PUBLIC_URL is set but SP_OWNERS is empty: name the e-mail address(es) the login lets in.')
  process.exit(1)
}

const db = openDb(DB_FILE)
const repo = new Repo(db)
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const backup = backupDaily(db, DB_FILE, BACKUP_DIR)
setInterval(() => backupDaily(db, DB_FILE, BACKUP_DIR), 60 * 60 * 1000).unref()

const hasUi = existsSync(path.join(DIST, 'index.html'))
const app = createApp({
  repo,
  hub: new Hub(),
  filesDir: path.join(DATA_DIR, 'files'),
  staticDir: hasUi ? DIST : undefined,
  publicUrl: PUBLIC_URL,
  owners: OWNERS,
  ownerHeader: process.env.SP_OWNER_HEADER?.trim().toLowerCase() || 'x-auth-request-email',
})

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`Session Planner on http://${HOST}:${PORT}${PUBLIC_URL ? ` (public ${PUBLIC_URL.origin})` : ''} · database ${DB_FILE}${backup ? ` · backup ${backup}` : ''}`)
  if (!hasUi) console.log('No dist/ build found: serving the API only (fine with npm run dev; run npm run build for npm start).')
})
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use: another Session Planner is probably still running. Find it with  ss -lptn 'sport = :${PORT}'`)
  else console.error('Server failed to start:', err.message)
  process.exit(1)
})
