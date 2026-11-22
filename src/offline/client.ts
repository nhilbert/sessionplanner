import { api, assetUrl } from '@/api'
import { apiUrl, basePath, localName, themeUrl } from '@/domain/addresses'
import type { PoolAsset, ThemeInfo } from '@/domain/theme'
import type { Me, Settings, WorkshopState, WorkshopSummary } from '@/domain/types'
import { usePlanner } from '@/store/usePlanner'
import { useSettings } from '@/store/useSettings'
import { inlineThemeFiles } from '@/slides/themeFiles'
import { apiTarget, assetHashes, belongsTo, DATA_CACHE, keepKey, OFFLINE_HEADER, pickKept, SHELL_PREFIX, STORED_AT, SWITCH_KEY, touchRecent } from './policy'
import { useOffline } from './state'

/**
 * The offline copy, the page's side (docs/offline.md): the switch on this device, the service worker it registers,
 * and the keeper that holds the workshops of the coming weeks and the last ones opened ready for a lost connection.
 */

const RECENT = 'sp.offline.recent'
/** How often the kept workshops are read again while the app is open. */
const REFRESH_MS = 15 * 60_000
/** A workshop being changed is read again for the copy once the changes rest this long. */
const SETTLE_MS = 5_000
/** At the root of the host: one worker for every app under it (workspaces each keep their own part of the copy). */
const WORKER = `${import.meta.env.BASE_URL}sw.js`

/** Whether this browser can hold the copy at all (a service worker needs a secure page; the dev server has none). */
export const offlineSupported = (): boolean => import.meta.env.PROD && 'serviceWorker' in navigator && typeof caches !== 'undefined' && window.isSecureContext

/** Whether the switch is on in this browser. */
export async function offlineOn(): Promise<boolean> {
  if (!offlineSupported() || !(await caches.has(DATA_CACHE))) return false
  return !!(await (await caches.open(DATA_CACHE)).match(SWITCH_KEY))
}

/** Turns the copy on in this browser: from now on what the app shows is kept, and the coming workshops are fetched. */
export async function turnOfflineOn(): Promise<void> {
  if (!offlineSupported()) return
  generation++
  await (await caches.open(DATA_CACHE)).put(SWITCH_KEY, new Response('1'))
  useOffline.setState({ enabled: true })
  await navigator.serviceWorker.register(WORKER)
  // Only what passes the worker is kept: the round waits until it is in charge of this page.
  await controlled()
  startKeeper()
  await refreshKept()
}

/** Resolves once a worker controls this page (at once when one does), or after a while without. */
function controlled(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, 15_000)
    navigator.serviceWorker.addEventListener('controllerchange', done, { once: true })
  })
}

/**
 * Turns the copy off and deletes it: the workshops, the files, the app's own files and the service worker. Also what
 * a build that has a sign-out calls before it signs out, so the copy never outlives the one who made it.
 */
export async function clearOfflineCopy(): Promise<void> {
  // A round still on its way stops at its next step and writes nothing more.
  generation++
  stopKeeper()
  useOffline.setState({ enabled: false })
  const pending = running
  const sweep = async () => {
    if (typeof caches !== 'undefined') for (const name of await caches.keys()) if (name === DATA_CACHE || name.startsWith(SHELL_PREFIX)) await caches.delete(name)
  }
  await sweep()
  if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) if ([r.active, r.installing, r.waiting].some((w) => w?.scriptURL.endsWith(WORKER))) await r.unregister()
  // What that round may have written between its last check and its write goes too.
  if (pending) {
    await pending.catch(() => undefined)
    await sweep()
  }
  try {
    localStorage.removeItem(localName(RECENT))
  } catch {
    // nothing remembered
  }
}

/** At the start of the app: with the switch on, the worker is registered (and so updated) and the keeper starts; with it off, a worker left over goes. */
export async function startOffline(): Promise<void> {
  if (!offlineSupported()) return
  if (await offlineOn()) {
    useOffline.setState({ enabled: true })
    await navigator.serviceWorker.register(WORKER).catch(() => undefined)
    startKeeper()
    setTimeout(() => void controlled().then(refreshKept), 3000)
  } else if ((await navigator.serviceWorker.getRegistrations()).some((r) => r.active?.scriptURL.endsWith(WORKER))) await clearOfflineCopy()
}

/** What the copy holds now, for the settings. */
export async function offlineSummary(): Promise<{ workshops: number; at: string | null }> {
  if (!(await offlineOn())) return { workshops: 0, at: null }
  const cache = await caches.open(DATA_CACHE)
  const kept = await cache.match(keepKey(basePath()))
  const ids = kept ? ((await kept.json()) as string[]) : []
  let stored = 0
  let at: string | null = null
  for (const id of ids) {
    const res = await cache.match(new URL(apiUrl(`/workshops/${id}`), location.origin).href)
    if (!res) continue
    stored++
    const when = res.headers.get(STORED_AT)
    if (when && (!at || when < at)) at = when
  }
  return { workshops: stored, at }
}


const readRecent = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(localName(RECENT)) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const writeRecent = (ids: string[]) => {
  try {
    localStorage.setItem(localName(RECENT), JSON.stringify(ids))
  } catch {
    // not remembered
  }
}

let timer: number | null = null
let settle: number | null = null
let unsubscribe: (() => void) | null = null
let running: Promise<void> | null = null
/** Counts switching on and off: a round started before the last switch writes nothing. */
let generation = 0

/**
 * Reads from the API for the copy, beside the app: the worker keeps what passes, and nothing here tells the app it is
 * offline (src/api.ts would put up the bar for a background request answered from the copy).
 */
async function read<T>(path: string): Promise<{ value: T; fromCopy: boolean }> {
  const res = await fetch(apiUrl(path), { headers: { 'x-sp': '1' } })
  if (!res.ok) throw new Error(`${res.status}`)
  return { value: (await res.json()) as T, fromCopy: res.headers.has(OFFLINE_HEADER) }
}
/** The settings' theme, for workshops that follow it; read with the list, else from the app's settings. */
let defaultTheme: string | null = null

function startKeeper() {
  if (unsubscribe) return
  timer = window.setInterval(() => void refreshKept(), REFRESH_MS)
  window.addEventListener('online', onOnline)
  unsubscribe = usePlanner.subscribe((s, before) => {
    // A workshop opened here is one of the last ones opened.
    if (s.id && s.id !== before.id) {
      const recent = touchRecent(readRecent(), s.id)
      writeRecent(recent)
      void addKept(s.id)
    }
    // A workshop changed while live: the copy follows once the changes rest.
    if (s.id && s.data !== before.data && s.status === 'ready' && !s.offlineAt) {
      if (settle) clearTimeout(settle)
      const id = s.id
      settle = window.setTimeout(() => void refreshWorkshop(id), SETTLE_MS)
    }
  })
}

function stopKeeper() {
  if (timer) clearInterval(timer)
  if (settle) clearTimeout(settle)
  timer = settle = null
  window.removeEventListener('online', onOnline)
  unsubscribe?.()
  unsubscribe = null
}

const onOnline = () => void refreshKept()

async function readKept(cache: Cache): Promise<string[]> {
  const res = await cache.match(keepKey(basePath()))
  return res ? ((await res.json().catch(() => [])) as string[]) : []
}

const writeKept = (cache: Cache, ids: string[]) => cache.put(keepKey(basePath()), new Response(JSON.stringify(ids), { headers: { 'content-type': 'application/json' } }))

/** A workshop just opened is kept at once, before the next round. */
async function addKept(id: string) {
  const gen = generation
  if (!(await offlineOn()) || gen !== generation) return
  const cache = await caches.open(DATA_CACHE)
  const ids = await readKept(cache)
  if (gen !== generation) return
  if (!ids.includes(id)) await writeKept(cache, [...ids, id])
  await refreshWorkshop(id)
}

/** Reads the list of workshops, decides which are kept, fetches them for the copy and lets go of the others. One round at a time. */
export function refreshKept(): Promise<void> {
  if (!running) running = round().finally(() => (running = null))
  return running
}

async function round(): Promise<void> {
  const gen = generation
  if (!(await offlineOn()) || !navigator.onLine || !navigator.serviceWorker.controller) return
  let list: WorkshopSummary[]
  try {
    // What the rest of the app needs to show a workshop without the server, kept on the way.
    const [workshops, settings] = await Promise.all([read<WorkshopSummary[]>('/workshops'), read<Settings>('/settings'), read<Me>('/me'), read<ThemeInfo[]>('/themes')])
    // Read from the copy: the server is out of reach, nothing to decide now.
    if (workshops.fromCopy || settings.fromCopy) return
    list = workshops.value
    defaultTheme = settings.value.theme
    const logo = api.logoUrl(settings.value)
    if (logo) await fetch(logo).catch(() => undefined)
  } catch {
    return
  }
  if (gen !== generation) return
  const cache = await caches.open(DATA_CACHE)
  const kept = pickKept(list, readRecent(), new Date().toLocaleDateString('sv'))
  await writeKept(cache, kept)
  for (const id of kept) {
    if (gen !== generation) return
    await refreshWorkshop(id)
  }
  if (gen === generation) await letGo(cache, new Set(kept))
}

/** Deletes what the copy holds of workshops no longer kept. */
async function letGo(cache: Cache, kept: Set<string>) {
  const base = basePath()
  for (const key of await cache.keys()) {
    const path = new URL(key.url).pathname
    if (!belongsTo(path, base)) continue
    const workshop = apiTarget(path)?.workshop
    if (workshop && !kept.has(workshop)) await cache.delete(key)
  }
}

/** Fetches one workshop for the copy (the worker keeps what passes), with its theme and the pictures its slides and worksheets show. */
async function refreshWorkshop(id: string): Promise<void> {
  const gen = generation
  if (!(await offlineOn()) || !navigator.onLine || !navigator.serviceWorker.controller) return
  let state: WorkshopState
  try {
    const got = await read<WorkshopState>(`/workshops/${encodeURIComponent(id)}`)
    if (got.fromCopy) return
    state = got.value
  } catch {
    return
  }
  const theme = state.workshop.theme || (defaultTheme ?? useSettings.getState().settings.theme) || 'default'
  const scope = { workshopId: id }
  const hashes = assetHashes(JSON.stringify(state))
  let dark = false
  if (theme !== 'default') {
    try {
      const info = (await read<ThemeInfo[]>('/themes')).value.find((t) => t.id === theme)
      dark = !!info?.dark
      const css = await fetch(api.themeCssUrl(theme, info?.updatedAt)).then((r) => (r.ok ? r.text() : ''))
      if (css) await inlineThemeFiles(css, themeUrl(theme), (url) => fetch(url).then(() => null, () => null))
      // The slides' logos come with the stylesheet; the worksheets' one is the printout logo.
      if (info?.printLogo) await fetch(info.printLogo).catch(() => undefined)
      // The generated slides (title, agenda, breaks) take their pictures from the theme's pool.
      const pool = (await read<PoolAsset[]>(`/themes/${encodeURIComponent(theme)}/pool`)).value
      for (const e of pool) if (e.kind === 'picture') hashes.push(e.hash)
    } catch {
      // the theme stays as the app last showed it
    }
  }
  if (gen !== generation) return
  const cache = await caches.open(DATA_CACHE)
  const urls = [...new Set(hashes)].flatMap((h) => [assetUrl(scope, h), ...(dark ? [assetUrl(scope, h, 'dark')] : [])])
  for (const url of urls) {
    if (gen !== generation) return
    if (await cache.match(new URL(url, location.origin).href)) continue
    await fetch(url).catch(() => undefined)
  }
}
