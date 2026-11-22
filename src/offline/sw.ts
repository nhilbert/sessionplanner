/// <reference lib="webworker" />
/**
 * The service worker of the offline copy (docs/offline.md). Registered only while the switch on this device is on.
 *
 * - The app's own files (code, styles, fonts) are kept per build, so the app starts without the server.
 * - The app's page is kept as the server last sent it, with its security policy, and answers when the server cannot.
 * - The API answers the copy holds (src/offline/policy.ts) go to the server first; what comes back is kept, and when
 *   nothing comes back (no network, the server out of reach, or no answer in a few seconds) the kept one answers,
 *   marked as such. Changes, the live stream and everything else go to the server as before.
 *
 * Built by scripts/offlineWorker.ts into dist/sw.js, with the list of files and the build's version filled in.
 */
import { API_ROOT } from '../domain/addresses'
import { apiTarget, belongsTo, DATA_CACHE, isAppPage, isAppRoute, keepKey, DOWN_MS, NETWORK_WAIT_MS, OFFLINE_HEADER, PAGE_KEY, PROBE_PARAM, PAGE_WAIT_MS, SHELL_PREFIX, STORED_AT, SWITCH_KEY, unreachable, type ApiTarget } from './policy'

declare const self: ServiceWorkerGlobalScope
declare const __SP_PRECACHE__: string[]
declare const __SP_VERSION__: string
/** The build's base ('/' at the root), where its files lie. */
declare const __SP_BASE__: string

const SHELL = `${SHELL_PREFIX}${__SP_VERSION__}`
const PRECACHE = new Set(__SP_PRECACHE__)

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      await cache.addAll([...PRECACHE])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith(SHELL_PREFIX) && name !== SHELL) await caches.delete(name)
      await self.clients.claim()
      // The page of the build before refers to files that are gone now: keep this build's, from a window that shows the app.
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const w of windows) {
        const res = await fetch(w.url, { credentials: 'same-origin' }).catch(() => null)
        if (res && (await keepPage(res))) break
      }
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // The app asking whether the server is back: only the server can answer that.
  if (url.searchParams.has(PROBE_PARAM)) return
  if (request.mode === 'navigate') {
    // A file, an export or a download from the API is never answered with the page.
    if (!url.pathname.includes(`${API_ROOT}/`)) event.respondWith(page(event, url.pathname))
    return
  }
  if (PRECACHE.has(url.pathname) || url.pathname.startsWith(`${__SP_BASE__}assets/`)) return event.respondWith(builtFile(event))
  const target = apiTarget(url.pathname)
  if (target) event.respondWith(api(event, target))
})

/** A file of the build: from the cache, else from the server (a CJK font subset, say), and kept while the switch is on. */
async function builtFile(event: FetchEvent): Promise<Response> {
  const cache = await caches.open(SHELL)
  const kept = await cache.match(event.request)
  if (kept) return kept
  if (serverGone()) return Response.error()
  const res = await fetch(event.request)
  if (res.ok) {
    const copy = res.clone()
    event.waitUntil(switchedOn().then((on) => (on ? cache.put(event.request, copy) : undefined)).catch(() => undefined))
  }
  return res
}

/** Keeps `res` as the app's page when it is that page (and the switch is still on). */
async function keepPage(res: Response): Promise<boolean> {
  if (res.status !== 200 || !res.headers.get('content-type')?.startsWith('text/html')) return false
  const html = await res.text()
  if (!isAppPage(html) || !(await switchedOn())) return false
  const cache = await caches.open(SHELL)
  await cache.put(PAGE_KEY, new Response(html, { status: 200, headers: res.headers }))
  return true
}

/** The base paths whose workshops are kept, among those `pathname` could lie under ('' for the root, then each step down). */
async function keptBases(cache: Cache, pathname: string): Promise<string[]> {
  const parts = pathname.split('/').filter(Boolean)
  const candidates = ['', ...parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`)]
  const found: string[] = []
  for (const base of candidates) if (await cache.match(keepKey(base))) found.push(base)
  return found
}

/**
 * A page: from the server, kept for later when it is the app's; without the server the kept one, but only for a page
 * of an app whose workshops are kept. Anything else (a sign-in, a choice of workspaces) goes to the server as before.
 */
async function page(event: FetchEvent, pathname: string): Promise<Response> {
  const cache = await switchedOn()
  const network = fetch(event.request)
  if (!cache || !isAppRoute(pathname, await keptBases(cache, pathname))) return network
  // The page goes to the browser as soon as it starts to arrive; keeping it happens beside.
  event.waitUntil(network.then((res) => keepPage(res.clone())).catch(() => false))
  const kept = await (await caches.open(SHELL)).match(PAGE_KEY)
  return firstOf(network, kept, PAGE_WAIT_MS, (r) => r)
}

/** Whether the switch is (still) on: turning it off deletes the cache, so nothing is kept from then on. */
async function switchedOn(): Promise<Cache | null> {
  if (!(await caches.has(DATA_CACHE))) return null
  const cache = await caches.open(DATA_CACHE)
  return (await cache.match(SWITCH_KEY)) ? cache : null
}

async function keeps(cache: Cache, target: ApiTarget): Promise<boolean> {
  if (!target.workshop) return true
  const kept = await cache.match(keepKey(target.base))
  const ids = kept ? ((await kept.json().catch(() => [])) as string[]) : []
  return Array.isArray(ids) && ids.includes(target.workshop)
}

/** An answer of the API the copy may hold. */
async function api(event: FetchEvent, target: ApiTarget): Promise<Response> {
  const request = event.request
  const cache = await switchedOn()
  if (!cache || !(await keeps(cache, target))) return fetch(request)
  const kept = await cache.match(request)
  const network = fetch(request)
  // The answer counts as soon as it starts to arrive; storing it happens beside, so a slow line is not taken for none.
  event.waitUntil(network.then((res) => store(cache, request, target, res.clone())).catch(() => undefined))
  return firstOf(network, kept, NETWORK_WAIT_MS, served)
}

async function store(cache: Cache, request: Request, target: ApiTarget, res: Response): Promise<void> {
  if (res.status === 404 && target.workshop) return void (await cache.delete(request))
  if (res.status !== 200 || res.redirected) return
  if (target.path === '/me') await forgetOthers(cache, target.base, res.clone())
  const headers = new Headers(res.headers)
  headers.set(STORED_AT, new Date().toISOString())
  await cache.put(request, new Response(await res.clone().blob(), { status: 200, statusText: res.statusText, headers }))
}

/**
 * Someone else signed in at this app on this device (no sign-out in between): what was kept for the one before goes,
 * so it never shows to the next one.
 */
async function forgetOthers(cache: Cache, base: string, me: Response): Promise<void> {
  const now = ((await me.json().catch(() => ({}))) as { email?: string }).email
  const before = await cache.match(`${base}${API_ROOT}/me`)
  const was = before ? ((await before.json().catch(() => ({}))) as { email?: string }).email : undefined
  if (!was || was === now) return
  for (const key of await cache.keys()) if (belongsTo(new URL(key.url).pathname, base)) await cache.delete(key)
  await cache.delete(keepKey(base))
}

/** A kept answer as the copy gives it: as stored, marked with when. */
function served(kept: Response): Response {
  const headers = new Headers(kept.headers)
  headers.set(OFFLINE_HEADER, kept.headers.get(STORED_AT) ?? '')
  return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers })
}

/**
 * Whether the server counts as out of reach: the browser says it is offline, or a request lately got no answer. Then
 * the copy answers at once instead of after waiting for each request in turn (a list, a theme, its fonts, every
 * picture), and what the copy does not hold fails at once. Every request still goes to the server beside; the first
 * answer from it ends this.
 */
let downUntil = 0

// The app heard the server again (src/offline/client.ts, its probe): the copy stops answering at once.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'online') downUntil = 0
})

const serverGone = (): boolean => self.navigator.onLine === false || Date.now() < downUntil

function heard(res: Response): void {
  if (unreachable(res.status)) downUntil = Date.now() + DOWN_MS
  else downUntil = 0
}

/**
 * The server's answer; the kept one instead when the server gives none (no network, out of reach, no first answer in
 * time). The request to the server goes on meanwhile, so a late answer is still kept.
 */
function firstOf(network: Promise<Response>, kept: Response | undefined, wait: number, fallback: (kept: Response) => Response): Promise<Response> {
  const gone = serverGone()
  // Settles what the server's state is, whichever answer the page gets.
  void network.then(heard, () => {
    downUntil = Date.now() + DOWN_MS
  })
  if (gone) return Promise.resolve(kept ? fallback(kept) : Response.error())
  if (!kept) return network.catch(() => Response.error())
  return new Promise((resolve) => {
    let done = false
    const finish = (res: Response) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(res)
    }
    const timer = setTimeout(() => {
      downUntil = Date.now() + DOWN_MS
      finish(fallback(kept))
    }, wait)
    network.then(
      (res) => finish(unreachable(res.status) ? fallback(kept) : res),
      () => finish(fallback(kept)),
    )
  })
}
