import type { Context, Hono, MiddlewareHandler, Next } from 'hono'
import type { Op, ServerEvent } from '../src/domain/ops.ts'
import type { Access, WorkshopState, WorkshopSummary } from '../src/domain/types.ts'
import type { Env, User } from './guard.ts'
import type { Repo } from './repo.ts'

/**
 * What a caller may do. server/guard.ts says who is asking; everything about what they then get is decided here, for
 * routes, the live-update stream and what a guest sees. Print views and exports have no routes of their own: they run
 * in the browser on the workshop and the pictures these rules hand out.
 *
 * - `public`, `own-token`: the login does not count; the route is open or checks a token of its own.
 * - `signed-in`: anybody the login lets in, shared workshop or not.
 * - `workshop-view`, `workshop-edit`: the owner and the guests of that workshop, or those of them who may edit.
 * - `owner`: the owner only.
 */
export type Rule = 'public' | 'own-token' | 'signed-in' | 'workshop-view' | 'workshop-edit' | 'owner'

/** What a caller has on one workshop. */
export type WorkshopAccess = 'owner' | Access

/** The owner sees every workshop; a guest only those shared with them (null: not found, as if it did not exist). */
export function workshopAccess(repo: Repo, user: User, workshopId: string): WorkshopAccess | null {
  if (user.owner) return 'owner'
  const member = user.email ? repo.getMember(workshopId, user.email) : null
  return member ? { role: member.role, showNotes: member.showNotes } : null
}

export const mayEdit = (access: WorkshopAccess | null): boolean => access === 'owner' || access?.role === 'edit'

/**
 * The one check: null lets the caller through, a status refuses. A workshop the caller has no access to answers 404,
 * so that nobody learns it exists. Whatever is not named here is refused.
 */
export function decide(rule: Rule, user: User | undefined, workshop: WorkshopAccess | null): 401 | 403 | 404 | null {
  if (rule === 'public' || rule === 'own-token') return null
  if (!user) return 401
  if (rule === 'signed-in') return null
  if (rule === 'owner') return user.owner ? null : 403
  if (rule === 'workshop-view') return workshop ? null : 404
  if (rule === 'workshop-edit') return !workshop ? 404 : mayEdit(workshop) ? null : 403
  return 403
}

const REFUSALS = { 401: 'login_required', 403: 'forbidden', 404: 'not_found' }
const RULE = Symbol('rule')

/** Which workshop a request is about; null when there is none, which answers as a workshop without access. */
type WorkshopOf = (c: Context<Env>) => string | null

/**
 * The `allow` of an app: a route's rule, put in front of its handler. A workshop rule looks at the route's :id unless
 * `workshopOf` says otherwise, and hands the caller's access to the handler as `c.get('access')`.
 */
export function rulesFor(repo: Repo) {
  return (rule: Rule, workshopOf: WorkshopOf = (c) => c.req.param('id') ?? null): MiddlewareHandler<Env> => {
    const check = async (c: Context<Env>, next: Next): Promise<Response | void> => {
      const user = c.get('user') as User | undefined
      const id = user && (rule === 'workshop-view' || rule === 'workshop-edit') ? workshopOf(c) : null
      const workshop = user && id ? workshopAccess(repo, user, id) : null
      const refused = decide(rule, user, workshop)
      if (refused) return c.json({ error: REFUSALS[refused] }, refused)
      if (workshop) c.set('access', workshop)
      await next()
    }
    return Object.assign(check, { [RULE]: rule })
  }
}

/** Whether a rule at `layer` (an address, or a group ending in /*) also holds for `route`. */
const covers = (layer: string, route: string) => layer === route || (layer.endsWith('/*') && (route === layer.slice(0, -2) || route.startsWith(layer.slice(0, -1))))

/**
 * Deny by default: an app with an /api/ route that has no rule does not start. A rule counts when it stands in front
 * of the route, on the route itself or on a group around it (`app.use`, which also answers unknown addresses there).
 * `ALL /api/*` is not a route but what every request passes: the login's guard, body limits, the answer to an unknown address.
 */
export function requireRules(app: Hono<Env>): void {
  const rules: { method: string; path: string }[] = []
  const missing = new Set<string>()
  for (const { method, path, handler } of app.routes) {
    if (RULE in handler) {
      rules.push({ method, path })
      continue
    }
    if (!path.startsWith('/api/') || (method === 'ALL' && path === '/api/*')) continue
    if (!rules.some((r) => (r.method === method && r.path === path) || (r.method === 'ALL' && covers(r.path, path)))) missing.add(`${method} ${path}`)
  }
  if (missing.size) throw new Error(`Routes without an access rule (server/access.ts): ${[...missing].join(', ')}`)
}

/** The workshops a caller sees in the list. */
export function visibleWorkshops(repo: Repo, user: User): WorkshopSummary[] {
  return user.owner ? repo.listWorkshops() : repo.listWorkshops(user.email ?? '')
}

/** Guests plan along; archiving and the branding (theme: slides and the logo on the printouts) stay with the owner. */
export function mayApply(access: WorkshopAccess, ops: Op[]): boolean {
  return access === 'owner' || !ops.some((o) => o.op === 'set' && o.entity === 'workshop' && ('archived' in o.fields || 'theme' in o.fields))
}

const seesNotes = (access: Access) => access.role === 'edit' || access.showNotes

/** What a guest without the notes may not see: facilitation notes, note items and the files only note items link to. */
export function forGuest(state: WorkshopState, access: Access): WorkshopState {
  if (seesNotes(access)) return { ...state, access }
  const items = state.items.filter((i) => i.kind !== 'note')
  const shown = new Set(items.flatMap((i) => i.attachmentIds))
  const notesOnly = new Set(state.items.flatMap((i) => (i.kind === 'note' ? i.attachmentIds : [])).filter((id) => !shown.has(id)))
  return {
    ...state,
    access,
    workshop: { ...state.workshop, notes: '' },
    items: items.map((i) => ({ ...i, notes: '' })),
    attachments: state.attachments.filter((a) => !notesOnly.has(a.id)),
  }
}

/** Whether a caller gets a file of a workshop: a guest the files their copy of it lists, nothing else. The workshop is loaded only when that takes looking. */
export function mayDownload(access: WorkshopAccess, attachmentId: string, workshop: () => WorkshopState | null): boolean {
  if (access === 'owner' || seesNotes(access)) return true
  const state = workshop()
  return !!state && forGuest(state, access).attachments.some((a) => a.id === attachmentId)
}

/** What the live-update stream passes on of an event; null: nothing. A change of who has access is the stream's to handle. */
export function eventFor(access: WorkshopAccess, event: ServerEvent): ServerEvent | { type: 'changed' } | null {
  if (event.type === 'members-changed') return null
  if (event.type === 'present' && !mayEdit(access)) return null
  // Without the notes, guests only learn that something changed and load their filtered copy again.
  const filtered = access !== 'owner' && access.role === 'view' && !access.showNotes && event.type !== 'workshop-deleted'
  return filtered ? { type: 'changed' } : event
}
