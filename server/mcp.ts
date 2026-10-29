import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type { Repo } from './repo.ts'
import { BadRequest } from './validate.ts'
import { Ops, type OpsOptions } from './ops.ts'
import type { OAuthServer } from './oauth.ts'
import { PALETTE } from '../src/domain/types.ts'

/**
 * MCP server: lets an AI agent (Claude, Claude Code, …) read workshops with their computed times, draft
 * and rework agendas, move and group items, keep notes and material, and use the library. Tools are
 * thin wrappers around Ops. Served over Streamable HTTP at /mcp (bearer token, see mcpRoutes) and over
 * stdio (server/mcp-stdio.ts).
 */

const INSTRUCTIONS = `Session Planner holds workshop agendas: a workshop has days (date, start, target end) and a parking lot; each day is an ordered list of items (block, break, marker, note), optionally under group headings. Start and end times are computed from the order and the durations, never typed: an item with a fixed start stays at that time, and the tool answers show gaps, overlaps and items that no longer fit.
- Read workshop_get before changing an agenda; it returns every day with computed times and warnings. Report the day's computed end after your changes.
- Workshops, days, items, groups and library entries may be given by id or by title; days also by date or number (1 = first day). Clock times are HH:mm, durations are minutes.
- Drafting from a brief: workshop_create, then item_create_many per day in order, with goal, method and lead where known. Use kind "break" for pauses, "marker" for points in time (arrival, end) and "note" for cues. Keep stretches without a break under 90 minutes.
- Facilitation notes (notes) are the facilitator's own; appendNotes adds to them instead of replacing.
- The packing list is computed from the material of all placed items (largest quantity per label, not the sum); packing_update ticks lines, overrides quantities and adds workshop-wide material.
- Prefer small, reversible changes and say what you changed. Workshops cannot be deleted through these tools; archive instead.`

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
// Same rule as parseTime (src/domain/time.ts), spelled as a pattern so it shows in the tool's JSON schema.
const time = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'HH:mm')
const kind = z.enum(['block', 'break', 'marker', 'note'])
const color = z.enum(PALETTE)
const workshopRef = z.string().describe('Workshop id or title')
const itemRef = z.string().describe('Item id or title')
const groupRef = z.string().describe('Group id or title')
const dayRef = z.union([z.string(), z.number().int().positive(), z.null()]).describe('Day id, date (YYYY-MM-DD) or number (1 = first day); null = parking lot')

const material = z.object({ label: z.string().min(1), qty: z.number().int().min(0).optional().describe('Default 1'), link: z.string().optional().describe('http(s) or mailto link') })
const placement = {
  at: z.number().int().min(0).optional().describe('0-based index among the entries of the day (or group); default: at the end'),
  after: z.string().optional().describe('Place it right after this item or group (id or title) instead'),
}
const itemFields = {
  kind: kind.optional().describe('Default block'),
  duration: z.number().int().min(0).max(1440).optional().describe('Minutes (default 30, breaks 15); markers and notes take none'),
  fixedStart: time.nullable().optional().describe('Fixed start HH:mm (lunch at 12:30); null lets it flow'),
  description: z.string().optional().describe('Short description, shown to the client'),
  goal: z.string().optional(),
  method: z.string().optional(),
  lead: z.string().optional().describe('Who leads it'),
  notes: z.string().nullable().optional().describe('Facilitation notes; null clears'),
  appendNotes: z.string().optional().describe('Adds a paragraph to the notes'),
  materials: z.array(material).optional().describe('Replaces the item\'s material'),
  category: z.string().nullable().optional().describe('Category id or name (settings_get lists them); null clears'),
  color: color.nullable().optional().describe('Overrides the category colour'),
}
const workshopFields = {
  client: z.string().optional(),
  location: z.string().optional(),
  goal: z.string().optional(),
  notes: z.string().nullable().optional().describe('Notes on the workshop as a whole; null clears'),
}

type Input = Record<string, unknown>

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

/** Runs a tool body; validation errors go back to the agent as a tool error instead of failing the call. */
async function run(fn: () => unknown) {
  try {
    return result(await fn())
  } catch (err) {
    if (err instanceof BadRequest) return { ...result({ error: err.message }), isError: true }
    throw err
  }
}

export function createMcpServer(repo: Repo, options: OpsOptions = {}): McpServer {
  const ops = new Ops(repo, options)
  const server = new McpServer({ name: 'sessionplanner', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  /** `destructive`: may delete or overwrite what the user wrote, so clients should ask first; `write` only adds or reversibly changes. */
  const tool = (name: string, description: string, inputSchema: z.ZodRawShape, fn: (a: Input) => unknown, kind: 'read' | 'write' | 'destructive' = 'write') =>
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: kind === 'read', destructiveHint: kind === 'destructive' } }, (a: Input) => run(() => fn(a)))

  // ---------- workshops ----------
  tool(
    'workshop_list',
    'List workshops (title, client, dates, item count), newest first. Default: current ones.',
    { includeArchived: z.boolean().optional(), query: z.string().optional().describe('Text in title or client') },
    (a) => ops.workshopList(a as never),
    'read',
  )
  tool(
    'workshop_get',
    'Everything about one workshop: details, every day with computed times (start/end per item, gaps, overlaps, items that do not fit, totals, warnings), groups, parking lot, packing list, files.',
    { workshop: workshopRef },
    (a) => ops.workshopGet(a.workshop as string),
    'read',
  )
  tool(
    'workshop_create',
    'Set up a workshop with one or more consecutive days (times default to the settings). Add the agenda with item_create_many afterwards.',
    {
      title: z.string().min(1),
      ...workshopFields,
      date: date.optional().describe('First day; default today'),
      days: z.number().int().min(1).max(14).optional().describe('Number of consecutive days, default 1'),
      start: time.optional().describe('Day start HH:mm'),
      end: time.nullable().optional().describe('Target end HH:mm; null = open end'),
    },
    (a) => ops.workshopCreate(a as never),
  )
  tool(
    'workshop_update',
    'Change workshop details. Only given fields change; notes replaces (null clears), appendNotes adds a paragraph. archived true/false archives or restores.',
    { workshop: workshopRef, title: z.string().optional(), ...workshopFields, appendNotes: z.string().optional(), archived: z.boolean().optional() },
    (a) => ops.workshopUpdate(a.workshop as string, a as never),
    'destructive',
  )
  tool(
    'workshop_duplicate',
    'Copy a workshop under a new title with its days moved so the first one falls on firstDate; agenda, material and files come along, ticks in the packing list are cleared.',
    { workshop: workshopRef, title: z.string().min(1), firstDate: date.optional() },
    (a) => ops.workshopDuplicate(a.workshop as string, a as never),
  )

  // ---------- days ----------
  tool(
    'day_add',
    'Add a day to a workshop (times default to the first day\'s).',
    { workshop: workshopRef, date, start: time.optional(), end: time.nullable().optional(), at: z.number().int().min(0).optional().describe('0-based position among the days; default last') },
    (a) => ops.dayAdd(a.workshop as string, a as never),
  )
  tool(
    'day_update',
    'Change the date, start or target end of a day. The items keep their order; times recompute.',
    { workshop: workshopRef, day: dayRef, date: date.optional(), start: time.optional(), end: time.nullable().optional().describe('null = open end') },
    (a) => ops.dayUpdate(a.workshop as string, a.day as never, a as never),
    'destructive',
  )
  tool('day_remove', 'Remove a day; its items and groups move to the parking lot.', { workshop: workshopRef, day: dayRef }, (a) => ops.dayRemove(a.workshop as string, a.day as never), 'destructive')

  // ---------- items ----------
  tool(
    'item_create',
    'Add one item to a day (or the parking lot), by default at the end. Returns it with its computed times and the day\'s warnings.',
    { workshop: workshopRef, day: dayRef, title: z.string().min(1), ...itemFields, group: groupRef.optional().describe('Put it into this group of the day'), ...placement },
    (a) => ops.itemCreate(a.workshop as string, a.day as never, a as never),
  )
  tool(
    'item_create_many',
    'Add several items in order, e.g. a whole agenda drafted from a brief. They are placed one after the other at the given place (default: the end of the day).',
    {
      workshop: workshopRef,
      day: dayRef,
      items: z.array(z.object({ title: z.string().min(1), ...itemFields })).min(1),
      group: groupRef.optional().describe('Put them into this group of the day'),
      ...placement,
    },
    (a) => ops.itemCreateMany(a.workshop as string, a.day as never, a.items as never, a as never),
  )
  tool(
    'item_update',
    'Change an item. Only given fields change; null clears a field. Changing the kind to marker or note drops the duration.',
    { workshop: workshopRef, item: itemRef, title: z.string().optional(), ...itemFields },
    (a) => ops.itemUpdate(a.workshop as string, a.item as string, a as never),
    'destructive',
  )
  tool(
    'item_move',
    'Move an item within its day, to another day, into or out of a group, or to the parking lot (day null). Without at/after it goes to the end.',
    { workshop: workshopRef, item: itemRef, day: dayRef.optional().describe('Default: stays on its day'), group: groupRef.nullable().optional().describe('Group to join; null leaves the group'), ...placement },
    (a) => ops.itemMove(a.workshop as string, a.item as string, a as never),
  )
  tool('item_delete', 'Delete an item for good. Prefer item_move to the parking lot unless the user asks to delete.', { workshop: workshopRef, item: itemRef }, (a) => ops.itemDelete(a.workshop as string, a.item as string), 'destructive')

  // ---------- groups ----------
  tool(
    'group_create',
    'Put a heading over items (a topic or sub-session). The named items move into the group in the given order; without a place the group stands where its first item was.',
    { workshop: workshopRef, day: dayRef, title: z.string(), items: z.array(itemRef).optional(), ...placement },
    (a) => ops.groupCreate(a.workshop as string, a.day as never, a as never),
  )
  tool(
    'group_update',
    'Rename a group or move it (with its items) within the day, to another day or to the parking lot.',
    { workshop: workshopRef, group: groupRef, title: z.string().optional(), day: dayRef.optional(), ...placement },
    (a) => ops.groupUpdate(a.workshop as string, a.group as string, a as never),
    'destructive',
  )
  tool('group_delete', 'Remove a heading; its items stay in place, ungrouped.', { workshop: workshopRef, group: groupRef }, (a) => ops.groupDelete(a.workshop as string, a.group as string), 'destructive')

  // ---------- packing list ----------
  tool('packing_list', 'The packing list: per material the quantity to pack (largest of any single item, or the override), which items need it, ticked off, at the venue.', { workshop: workshopRef }, (a) => ops.packingList(a.workshop as string), 'read')
  tool(
    'packing_update',
    'Tick lines off, mark them as at the venue or override quantities; add material for the workshop as a whole (not tied to an item); remove such material.',
    {
      workshop: workshopRef,
      lines: z.array(z.object({ label: z.string().min(1), qty: z.number().int().min(0).nullable().optional().describe('Override; null back to the suggestion'), checked: z.boolean().optional(), venue: z.boolean().optional() })).optional(),
      add: z.array(material).optional().describe('Workshop-wide material to add'),
      remove: z.array(z.string()).optional().describe('Labels of workshop-wide material to remove (their ticks go too)'),
    },
    (a) => ops.packingUpdate(a.workshop as string, a as never),
  )

  // ---------- library ----------
  tool('library_list', 'Reusable items and groups shared by all workshops.', {}, () => ops.libraryList(), 'read')
  tool(
    'library_save',
    'Save an item, or a group with its items, of a workshop to the library (a copy; later edits do not affect the workshop).',
    { workshop: workshopRef, item: itemRef.optional(), group: groupRef.optional(), title: z.string().optional().describe('Library title; default the item\'s or group\'s') },
    (a) => ops.librarySave(a.workshop as string, a as never),
  )
  tool(
    'library_insert',
    'Insert a copy of a library entry (item or group) into a day or the parking lot.',
    { workshop: workshopRef, entry: z.string().describe('Library entry id or title'), day: dayRef, ...placement },
    (a) => ops.libraryInsert(a.workshop as string, a.entry as string, a.day as never, a as never),
  )

  // ---------- settings ----------
  tool('settings_get', 'The categories (id, name, colour), the default day times and what the item kinds mean.', {}, () => ops.settingsGet(), 'read')
  return server
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface McpAuth {
  /** Static bearer token (SP_MCP_TOKEN), for clients configured by hand. */
  token?: string
  /** OAuth (server/oauth.ts), for Claude's connectors: access tokens it issued are accepted. */
  oauth?: OAuthServer
}

/**
 * Streamable HTTP endpoint, stateless: a fresh server and transport per request (the tools keep no
 * session state). Every request needs `Authorization: Bearer` with the static token or an OAuth access
 * token; without either configured the route is not mounted at all (see index.ts). The 401 points
 * OAuth clients to the protected resource metadata, which starts their sign-in.
 */
export function mcpRoutes(repo: Repo, auth: McpAuth, options: OpsOptions = {}): Hono {
  const app = new Hono()
  app.all('/', async (c) => {
    const header = c.req.header('authorization') ?? ''
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const ok = !!given && ((auth.token !== undefined && sameToken(given, auth.token)) || auth.oauth?.verifyAccess(given) != null)
    if (!ok) {
      const challenge = auth.oauth ? `Bearer resource_metadata="${auth.oauth.resourceMetadataUrl}", scope="sessionplanner"` : 'Bearer'
      return c.json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': challenge })
    }
    const server = createMcpServer(repo, options)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    try {
      return await transport.handleRequest(c.req.raw)
    } finally {
      void server.close()
    }
  })
  return app
}
