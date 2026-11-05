/**
 * Session Planner MCP server over stdio, for agents that start a local process (Claude Desktop, Claude Code):
 *
 *   npm run mcp        uses data/sessions.db (or SP_DATA_DIR) on this machine
 *
 * It opens the same SQLite database as the Session Planner server (WAL allows both at once). Open windows
 * do not learn about these changes live (that needs the server process); reload the page to see them.
 * Logs go to stderr, stdout belongs to the protocol.
 */
import { existsSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { createMcpServer } from './mcp.ts'
import { dataPaths } from './storage.ts'

if (existsSync('.env')) process.loadEnvFile('.env')

const { dbFile: DB_FILE, filesDir, themesDir } = dataPaths(process.env.SP_DATA_DIR || 'data')
const db = openDb(DB_FILE)
const server = createMcpServer(new Repo(db), { filesDir, themesDir })
await server.connect(new StdioServerTransport())
console.error(`Session Planner MCP (stdio) on ${DB_FILE}`)
