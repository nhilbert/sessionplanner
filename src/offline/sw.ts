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
import { apiTarget, belongsTo, DATA_CACHE, isAppPage, keepKey, NETWORK_WAIT_MS, OFFLINE_HEADER, PAGE_KEY, PAGE_WAIT_MS, SHELL_PREFIX, STORED_AT, SWITCH_KEY, unreachable, type ApiTarget } from './policy'

declare const self: ServiceWorkerGlobalScope
declare const __SP_PRECACHE__: string[]
declare const __SP_VERSION__: string

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
  if (request.mode === 'navigate') return event.respondWith(page(request))
  if (PRECACHE.has(url.pathname) || url.pathname.startsWith('/assets/')) return event.respondWith(builtFile(request))
  const target = apiTarget(url.pathname)
  if (target) event.respondWith(api(request, target))
})

/** A file of the build: from the cache, else from the server (a CJK font subset, say), and kept. */
async function builtFile(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL)
  const kept = await cache.match(request)
  if (kept) return kept
  const res = await fetch(request)
  if (res.ok) await cache.put(request, res.clone()).catch(() => undefined)
  return res
}

/** Keeps `res` as the app's page when it is that page. */
async function keepPage(res: Response): Promise<boolean> {
  if (res.status !== 200 || !res.headers.get('content-type')?.startsWith('text/html')) return false
  const html = await res.clone().text()
  if (!isAppPage(html)) return false
  const cache = await caches.open(SHELL)
  await cache.put(PAGE_KEY, new Response(html, { status: 200, headers: res.headers }))
  return true
}

/** The app's page: from the server, kept for later; without the server the kept one. */
async function page(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL)
  const kept = await cache.match(PAGE_KEY)
  const network = fetch(request).then(async (res) => {
    await keepPage(res).catch(() => false)
    return res
  })
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
async function api(request: Request, target: ApiTarget): Promise<Response> {
  const cache = await switchedOn()
  if (!cache || !(await keeps(cache, target))) return fetch(request)
  const kept = await cache.match(request)
  const network = fetch(request).then(async (res) => {
    await store(cache, request, target, res).catch(() => undefined)
    return res
  })
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
 * The server's answer; the kept one instead when the server gives none (no network, out of reach, too slow). The
 * request to the server goes on meanwhile, so a late answer is still kept.
 */
function firstOf(network: Promise<Response>, kept: Response | undefined, wait: number, fallback: (kept: Response) => Response): Promise<Response> {
  if (!kept) return network.catch(() => Response.error())
  return new Promise((resolve) => {
    let done = false
    const finish = (res: Response) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(res)
    }
    const timer = setTimeout(() => finish(fallback(kept)), wait)
    network.then(
      (res) => finish(unreachable(res.status) ? fallback(kept) : res),
      () => finish(fallback(kept)),
    )
  })
}
