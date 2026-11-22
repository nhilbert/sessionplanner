import { API_ROOT } from '../domain/addresses.ts'

/**
 * The offline copy (docs/offline.md): what the service worker keeps and what the browser asks it for. Pure, so the
 * worker (src/offline/sw.ts) and the page (src/offline/client.ts) read the same rules, and the tests check them.
 */

/** The cache with the workshops and what showing them needs; it exists only while the switch on this device is on. */
export const DATA_CACHE = 'sp-offline-data'
/** The caches of the app's own files, one per build. */
export const SHELL_PREFIX = 'sp-shell-'
/** The entry that says the switch is on. */
export const SWITCH_KEY = '/__sp-offline/on'
/** Where the app's page is kept: the same page answers every address of the app. */
export const PAGE_KEY = '/__sp-offline/page'
/** The header a stored answer carries: when it came from the server. */
export const STORED_AT = 'x-sp-stored-at'
/** The header an answer from the copy carries instead of the server's: when it was stored. */
export const OFFLINE_HEADER = 'x-sp-offline'
/** How long the server's first answer may take before the copy answers instead, when there is one. */
export const NETWORK_WAIT_MS = 4000
/** How long the page may take before the stored one is shown. */
export const PAGE_WAIT_MS = 4000
/** After a request got no answer, how long the copy answers at once (unless the server answers sooner). */
export const DOWN_MS = 30_000

/** The days a workshop is kept around: from ten days back to thirty days ahead. */
export const KEEP_DAYS_BEFORE = 10
export const KEEP_DAYS_AFTER = 30
/** And the last ones opened on this device, whatever their dates. */
export const KEEP_RECENT = 10

/** The entry with the ids kept for the app at `base` (workspaces under one host keep apart). */
export const keepKey = (base: string): string => `${base}/__sp-offline/keep`

/** A request to the API, read: the app it belongs to (its base path) and the path inside the API. */
export interface ApiTarget {
  base: string
  path: string
  /** The workshop the answer belongs to; kept only while that workshop is. */
  workshop?: string
}

const BASE = /^(\/[^/?#\s]+)*$/
const WORKSHOP = /^\/workshops\/([^/]+)(?:\/assets\/[0-9a-f]{16,64})?$/
/**
 * What showing a workshop and presenting it needs besides the workshop: who is signed in, the settings (categories,
 * default theme, logo), the list of workshops, the themes with their stylesheets, files and pools. Nothing else is
 * kept: not the library, the slide pool's decks, members, exports or the live stream.
 */
const SHARED = [/^\/me$/, /^\/settings$/, /^\/settings\/logo$/, /^\/workshops$/, /^\/themes$/, /^\/themes\/[^/]+$/, /^\/themes\/[^/]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/]

/** The API request at `pathname` that the copy may hold, or null: anything else goes to the server as it always did. */
export function apiTarget(pathname: string): ApiTarget | null {
  const at = pathname.indexOf(`${API_ROOT}/`)
  if (at === -1) return null
  const base = pathname.slice(0, at)
  if (!BASE.test(base)) return null
  const path = pathname.slice(at + API_ROOT.length)
  const workshop = WORKSHOP.exec(path)
  if (workshop) return { base, path, workshop: decodeURIComponent(workshop[1]) }
  return SHARED.some((r) => r.test(path)) ? { base, path } : null
}

/** Addresses beside the app's pages that a server of the core answers itself: the agents' endpoint and its sign-in. */
const NOT_PAGES = ['/mcp', '/oauth', '/.well-known']

/**
 * Whether a navigation to `pathname` opens a page of an app whose workshops are kept (`bases`, '' for the root), so
 * the kept page may stand in for it. Not the API (files, exports, downloads), not what the server answers beside the
 * app (agents, sign-in), and nothing outside those apps (a login or a choice of workspaces in front of them).
 */
export function isAppRoute(pathname: string, bases: string[]): boolean {
  return bases.some((base) => {
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return false
    const rest = pathname.slice(base.length) || '/'
    if (rest === API_ROOT || rest.startsWith(`${API_ROOT}/`)) return false
    if (rest === '/sw.js') return false
    return !NOT_PAGES.some((p) => rest === p || rest.startsWith(`${p}/`) || rest.startsWith(`${p}-`))
  })
}

/** Whether a stored answer belongs to the app at `base`: its API, not that of another workspace under the same host. */
export const belongsTo = (pathname: string, base: string): boolean => pathname.startsWith(`${base}${API_ROOT}/`)

/** Whether an HTML answer is the app's own page (and not a page of the login or the workspace choice in front of it). */
export const isAppPage = (html: string): boolean => /<div id="root"><\/div>/.test(html) && /<script type="module"/.test(html)

/** Whether a failed answer counts as no connection: the server is out of reach behind the proxy. */
export const unreachable = (status: number): boolean => status === 502 || status === 503 || status === 504

/** The built files kept for the app to start without the server: the code, styles and fonts, not the CJK font subsets (loaded when used). */
export const precacheable = (file: string): boolean =>
  file !== 'index.html' && file !== 'sw.js' && !/\.map$/.test(file) && !/\.woff$/.test(file) && !/noto-sans-jp/.test(file)

/** A day as YYYY-MM-DD, `days` from `day`. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The workshops this device keeps: those with a day from ten days back to thirty days ahead (a workshop that runs
 * over several days counts when any of them is in there), and the last ones opened here.
 */
export function pickKept(workshops: { id: string; firstDate: string | null; lastDate: string | null }[], recent: string[], today: string): string[] {
  const from = addDays(today, -KEEP_DAYS_BEFORE)
  const to = addDays(today, KEEP_DAYS_AFTER)
  const known = new Set(workshops.map((w) => w.id))
  const dated = workshops.filter((w) => w.firstDate && w.firstDate <= to && (w.lastDate ?? w.firstDate) >= from).map((w) => w.id)
  const opened = recent.filter((id) => known.has(id)).slice(0, KEEP_RECENT)
  return [...new Set([...dated, ...opened])]
}

/** The list of the last workshops opened, with `id` now the first. */
export const touchRecent = (recent: string[], id: string): string[] => [id, ...recent.filter((x) => x !== id)].slice(0, KEEP_RECENT)

/** The pictures a workshop's slides and worksheets show, by their hashes. */
export const assetHashes = (json: string): string[] => [...new Set([...json.matchAll(/asset:([0-9a-f]{16,64})/g)].map((m) => m[1]))]
