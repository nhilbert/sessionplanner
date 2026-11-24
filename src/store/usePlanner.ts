import { create } from 'zustand'
import { api, ApiError } from '@/api'
import { inverseOps, type Op, type PresentPosition, type ServerEvent } from '@/domain/ops'
import { addLocal, applyRemote, fromSnapshot, markSent, patchConfirmed, settle, type Sync, syncView } from '@/domain/sync'
import type { Attachment, WorkshopState } from '@/domain/types'
import { offlineStamp } from '@/offline/state'
import type { LiveTimes } from '@/domain/live'

/**
 * The open workshop (docs/concept.md, section 7): changes apply here at once and go to the server in
 * order; every stored change, this window's own included, comes back over server-sent events in the
 * server's order (src/domain/sync.ts). Undo/redo covers this window's changes.
 */

const WINDOW_ID = crypto.randomUUID()
const MAX_UNDO = 200
/** A broken stream retries every few seconds; asking the API what is going on once in a while is enough. */
const ERROR_RELOAD_MS = 10_000
/** How soon a workshop the offline copy answered for, while the live stream is up, is read again from the server. */
const RETRY_COPY_MS = 5_000

/** A file new to the workshop joins the list; a known one (renamed, replaced) takes its place there. */
const withAttachment = (s: WorkshopState, a: Attachment): WorkshopState => ({
  ...s,
  attachments: s.attachments.some((x) => x.id === a.id) ? s.attachments.map((x) => (x.id === a.id ? a : x)) : [...s.attachments, a],
})

interface Entry {
  redo: Op[]
  undo: Op[]
  /** Changes made under one session (the slide editor open on this workshop) share one entry. */
  group?: string
}

type Status = 'idle' | 'loading' | 'ready' | 'missing' | 'login' | 'error'

/** The server's latest word on the workshop's presentation: on connecting (`hello`, null when none runs) and on every paging. */
export interface PresentNews {
  position: PresentPosition | null
  hello: boolean
}

interface PlannerStore {
  id: string | null
  data: WorkshopState | null
  status: Status
  live: boolean
  /**
   * Shown from the offline copy (docs/offline.md): as of when. The workshop is then read-only; it is read again from
   * the server as soon as the live stream is back.
   */
  offlineAt: string | null
  /** Only for those who can edit; a new object for every message, so listeners see each one. */
  presenting: PresentNews | null
  /** The breaks set live in the presenter view (src/domain/live.ts); only for those who can edit, empty for others. */
  liveTimes: LiveTimes
  /** Sets a break live, or back to the plan (both null); what the server answers shows in every window. A break put in live ("Break now") also gives its place. */
  setLive: (itemId: string, until: number | null, minutes: number | null, place?: { after: string; step: string | null }) => Promise<void>
  /** A change the server refused; the workshop was reloaded. */
  syncError: boolean
  past: Entry[]
  future: Entry[]
  open: (id: string) => void
  close: () => void
  change: (ops: Op[]) => void
  /**
   * From here on until `endGroup`, every change joins one undo entry: the slide editor's session is one step in the
   * planner's history (the editor has its own history for the steps inside).
   */
  beginGroup: (key: string) => void
  endGroup: (key: string) => void
  undo: () => void
  redo: () => void
  /** A file new to the workshop, or one renamed or replaced. */
  addAttachment: (a: Attachment) => void
  removeAttachment: (id: string) => void
  dismissSyncError: () => void
}

let source: EventSource | null = null
/** Sends and reloads, one after the other: a reload never overtakes a change on its way. */
let queue: Promise<unknown> = Promise.resolve()
let sync: Sync | null = null
let batchNo = 0
let reloadQueued = false
let lastErrorReload = 0
/** Counts the openings: a change knows the one it was made in, even when the same workshop is open again by now. */
let opening = 0
/** A change failed with no workshop open to say so: the next one to open does. */
let failedAway = false
/** What the stream brought before the first snapshot was there: it follows the snapshot, or would be lost. */
let early: ServerEvent[] = []
/** The revision of the snapshot in use: what the stream brings up to it is in there already. */
let snapshotAt = 0
/** The highest revision the stream has brought: a snapshot older than that must not replace what is shown. */
let heard = 0
/** Counts the live-time messages of the stream: an answer to setLive older than the last one is not applied. */
let liveHeard = 0
/** The open session whose changes share one undo entry (beginGroup). */
let group: string | null = null
/** When the server last confirmed what is shown: a snapshot it sent, or the live stream. */
let liveAt: string | null = null

export const usePlanner = create<PlannerStore>((set, get) => {
  /** Shows the synced state. */
  function show(next: Sync | null) {
    sync = next
    set({ data: next ? syncView(next) : null })
  }

  async function load(id: string) {
    try {
      const fresh = await api.loadWorkshop(id)
      if (get().id !== id) return
      const stamp = offlineStamp(fresh)
      if (stamp !== null) {
        // The copy answered while the stream is up: the server is there but was slow, so read again in a moment.
        if (get().live) setTimeout(() => get().id === id && get().offlineAt && reload(), RETRY_COPY_MS)
        if (sync) {
          // What is shown is never older than the copy (read from the server, or from the copy itself): it stays, read-only,
          // as of when the server last confirmed it.
          if (!get().offlineAt) set({ status: 'ready', offlineAt: liveAt ?? stamp, past: [], future: [] })
          return
        }
      } else liveAt = new Date().toISOString()
      // Read before a change the stream has brought: it would take that back. Read again, as it was asked for because something may be missing.
      if (stamp === null && sync && fresh.revision !== undefined && fresh.revision < heard) return reload()
      show(fromSnapshot(sync, fresh))
      snapshotAt = fresh.revision ?? 0
      const waiting = early
      early = []
      for (const event of waiting) receive(event)
      set({ status: 'ready', offlineAt: stamp, ...(stamp !== null ? { past: [], future: [] } : {}) })
    } catch (err) {
      if (get().id !== id) return
      if (err instanceof ApiError && err.status === 404) {
        show(null)
        set({ status: 'missing' })
      } else if (err instanceof ApiError && err.status === 401) set({ status: 'login' })
      else set({ status: get().data ? 'ready' : 'error' })
    }
  }

  /** Loads the workshop again once the changes before it are through; several requests meanwhile make one load. */
  function reload() {
    const id = get().id
    if (!id || reloadQueued) return
    reloadQueued = true
    queue = queue.then(async () => {
      reloadQueued = false
      if (get().id === id) await load(id)
    })
  }

  /** An event of the live stream, for the synced state. What the snapshot holds already only settles this window's own change. */
  function receive(event: ServerEvent) {
    if (!sync) return
    const known = event.revision !== undefined && event.revision <= snapshotAt
    heard = Math.max(heard, event.revision ?? 0)
    if (event.type === 'ops') show(known ? settle(sync, event.clientId) : applyRemote(sync, event.clientId, event.ops))
    else if (event.type === 'attachment') {
      if (!known) show(patchConfirmed(sync, (s) => withAttachment(s, event.attachment)))
    } else if (event.type === 'attachment-deleted') {
      if (!known) show(patchConfirmed(sync, (s) => ({ ...s, attachments: s.attachments.filter((a) => a.id !== event.id) })))
    } else if (event.type === 'workshop-deleted' || event.type === 'revoked') {
      source?.close()
      show(null)
      set({ status: 'missing' })
    } else if (event.type === 'changed') {
      // A guest without the notes gets no details, only the news that something changed.
      reload()
    }
  }

  function send(ops: Op[]) {
    const id = get().id
    if (!id || !ops.length || !sync) return
    const tag = `${WINDOW_ID}.${++batchNo}`
    const made = opening
    show(addLocal(sync, tag, ops))
    queue = queue.then(async () => {
      // The change was shown as made, so it goes out even when the workshop was left meanwhile; only the view of it ends there.
      const here = () => made === opening && sync !== null
      if (here()) sync = markSent(sync!, tag)
      try {
        const res = await api.sendOps(id, tag, ops)
        // Nothing stored (its records were gone meanwhile): no echo will come.
        if (!res.ops.length && here()) show(settle(sync!, tag))
      } catch (err) {
        if (!here()) {
          failedAway = !get().id
          set({ syncError: true })
          return
        }
        show(settle(sync!, tag))
        // The undo history was built on a state the server never had.
        set({ past: [], future: [] })
        if (err instanceof ApiError && err.status === 401) set({ status: 'login' })
        else set({ syncError: true })
        await load(id)
      }
    })
  }

  function connect(id: string) {
    source?.close()
    let connectedBefore = false
    source = new EventSource(api.eventsUrl(id))
    source.addEventListener('hello', (e: MessageEvent<string>) => {
      set({ live: true })
      liveAt = new Date().toISOString()
      try {
        const hello = e.data ? (JSON.parse(e.data) as { present?: PresentPosition | null; live?: LiveTimes }) : {}
        if (hello.present !== undefined && get().id === id) set({ presenting: { position: hello.present, hello: true } })
        if (hello.live && get().id === id) set({ liveTimes: hello.live })
      } catch {
        // an older server says hello without data
      }
      // Back after a lost connection: changes may have been missed meanwhile, and the offline copy gives way to the server's.
      if (connectedBefore || get().offlineAt) reload()
      connectedBefore = true
    })
    source.onerror = () => {
      set({ live: false })
      // Behind the login an expired session looks like a broken stream; ask the API what is going on.
      if (Date.now() - lastErrorReload < ERROR_RELOAD_MS) return
      lastErrorReload = Date.now()
      reload()
    }
    source.onmessage = (e) => {
      let event: ServerEvent
      try {
        event = JSON.parse(e.data) as ServerEvent
      } catch {
        return
      }
      if (event.type === 'present') {
        if (get().id === id) set({ presenting: { position: { key: event.key, n: event.n, tag: event.tag }, hello: false } })
        return
      }
      if (event.type === 'live') {
        liveHeard++
        if (get().id === id) set({ liveTimes: event.times })
        return
      }
      if (get().id !== id) return
      liveAt = new Date().toISOString()
      if (sync) receive(event)
      else early.push(event)
    }
  }

  return {
    id: null,
    data: null,
    status: 'idle',
    live: false,
    offlineAt: null,
    presenting: null,
    liveTimes: {},
    syncError: false,
    past: [],
    future: [],

    open: (id) => {
      if (get().id === id) return
      const mine = ++opening
      sync = null
      group = null
      reloadQueued = false
      early = []
      snapshotAt = 0
      heard = 0
      liveAt = null
      set({ id, data: null, status: 'loading', live: false, offlineAt: null, presenting: null, liveTimes: {}, past: [], future: [], syncError: failedAway })
      failedAway = false
      // Changes from a moment ago may still be on their way: the workshop is read after them, so it shows them.
      void queue.then(() => (mine === opening ? load(id) : undefined))
      connect(id)
    },

    close: () => {
      opening++
      source?.close()
      source = null
      sync = null
      set({ id: null, data: null, status: 'idle', live: false, offlineAt: null, presenting: null, liveTimes: {}, past: [], future: [] })
    },

    change: (ops) => {
      const data = get().data
      // The offline copy is read-only: a change could not reach the server, and the copy would be taken for it.
      if (!data || !ops.length || get().offlineAt) return
      const undo = inverseOps(data, ops)
      const past = get().past
      const last = past.at(-1)
      if (group && last?.group === group) set({ past: [...past.slice(0, -1), { redo: [...last.redo, ...ops], undo: [...undo, ...last.undo], group }], future: [] })
      else set({ past: [...past, { redo: ops, undo, ...(group ? { group } : {}) }].slice(-MAX_UNDO), future: [] })
      send(ops)
    },

    beginGroup: (key) => {
      group = key
    },

    endGroup: (key) => {
      if (group === key) group = null
    },

    undo: () => {
      const entry = get().past.at(-1)
      if (!entry || !get().data || get().offlineAt) return
      set({ past: get().past.slice(0, -1), future: [...get().future, entry] })
      send(entry.undo)
    },

    redo: () => {
      const entry = get().future.at(-1)
      if (!entry || !get().data || get().offlineAt) return
      set({ future: get().future.slice(0, -1), past: [...get().past, entry] })
      send(entry.redo)
    },

    addAttachment: (a) => {
      if (sync) show(patchConfirmed(sync, (s) => withAttachment(s, a)))
    },

    removeAttachment: (id) => {
      // The server unlinks it from items too and tells every window, this one included.
      if (sync) show(patchConfirmed(sync, (s) => ({ ...s, attachments: s.attachments.filter((a) => a.id !== id), items: s.items.map((i) => (i.attachmentIds.includes(id) ? { ...i, attachmentIds: i.attachmentIds.filter((x) => x !== id) } : i)) })))
    },

    dismissSyncError: () => set({ syncError: false }),

    setLive: async (itemId, until, minutes, place) => {
      const id = get().id
      if (!id) return
      const before = liveHeard
      const res = await api.live(id, { itemId, until, minutes, ...place })
      // The stream told every window already, perhaps of a newer change by another one: the answer counts only without it.
      if (get().id === id && liveHeard === before) set({ liveTimes: res.times })
    },
  }
})
