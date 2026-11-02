import { create } from 'zustand'
import { api, ApiError } from '@/api'
import { inverseOps, type Op, type ServerEvent } from '@/domain/ops'
import { addLocal, applyRemote, fromSnapshot, markSent, patchConfirmed, settle, type Sync, syncView } from '@/domain/sync'
import type { Attachment, WorkshopState } from '@/domain/types'

/**
 * The open workshop (docs/concept.md, section 7): changes apply here at once and go to the server in
 * order; every stored change, this window's own included, comes back over server-sent events in the
 * server's order (src/domain/sync.ts). Undo/redo covers this window's changes.
 */

const WINDOW_ID = crypto.randomUUID()
const MAX_UNDO = 200
/** A broken stream retries every few seconds; asking the API what is going on once in a while is enough. */
const ERROR_RELOAD_MS = 10_000

interface Entry {
  redo: Op[]
  undo: Op[]
  /** Changes made under one session (the slide editor open on this workshop) share one entry. */
  group?: string
}

type Status = 'idle' | 'loading' | 'ready' | 'missing' | 'login' | 'error'

interface PlannerStore {
  id: string | null
  data: WorkshopState | null
  status: Status
  live: boolean
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
/** The open session whose changes share one undo entry (beginGroup). */
let group: string | null = null

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
      show(fromSnapshot(sync, fresh))
      set({ status: 'ready' })
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

  function send(ops: Op[]) {
    const id = get().id
    if (!id || !ops.length || !sync) return
    const tag = `${WINDOW_ID}.${++batchNo}`
    show(addLocal(sync, tag, ops))
    queue = queue.then(async () => {
      if (get().id !== id || !sync) return
      sync = markSent(sync, tag)
      try {
        const res = await api.sendOps(id, tag, ops)
        // Nothing stored (its records were gone meanwhile): no echo will come.
        if (!res.ops.length && sync && get().id === id) show(settle(sync, tag))
      } catch (err) {
        if (get().id !== id || !sync) return
        show(settle(sync, tag))
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
    source.addEventListener('hello', () => {
      set({ live: true })
      // Back after a lost connection: changes may have been missed meanwhile.
      if (connectedBefore) reload()
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
      if (!sync || get().id !== id) return
      if (event.type === 'ops') show(applyRemote(sync, event.clientId, event.ops))
      else if (event.type === 'attachment') show(patchConfirmed(sync, (s) => (s.attachments.some((a) => a.id === event.attachment.id) ? s : { ...s, attachments: [...s.attachments, event.attachment] })))
      else if (event.type === 'attachment-deleted') show(patchConfirmed(sync, (s) => ({ ...s, attachments: s.attachments.filter((a) => a.id !== event.id) })))
      else if (event.type === 'workshop-deleted' || event.type === 'revoked') {
        source?.close()
        show(null)
        set({ status: 'missing' })
      } else if (event.type === 'changed') {
        // A guest without the notes gets no details, only the news that something changed.
        reload()
      }
    }
  }

  return {
    id: null,
    data: null,
    status: 'idle',
    live: false,
    syncError: false,
    past: [],
    future: [],

    open: (id) => {
      if (get().id === id) return
      sync = null
      group = null
      reloadQueued = false
      set({ id, data: null, status: 'loading', live: false, past: [], future: [], syncError: false })
      // Nothing of this workshop is on its way yet: no need to wait for the queue.
      void load(id)
      connect(id)
    },

    close: () => {
      source?.close()
      source = null
      sync = null
      set({ id: null, data: null, status: 'idle', live: false, past: [], future: [] })
    },

    change: (ops) => {
      const data = get().data
      if (!data || !ops.length) return
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
      if (!entry || !get().data) return
      set({ past: get().past.slice(0, -1), future: [...get().future, entry] })
      send(entry.undo)
    },

    redo: () => {
      const entry = get().future.at(-1)
      if (!entry || !get().data) return
      set({ future: get().future.slice(0, -1), past: [...get().past, entry] })
      send(entry.redo)
    },

    addAttachment: (a) => {
      if (sync) show(patchConfirmed(sync, (s) => (s.attachments.some((x) => x.id === a.id) ? s : { ...s, attachments: [...s.attachments, a] })))
    },

    removeAttachment: (id) => {
      // The server unlinks it from items too and tells every window, this one included.
      if (sync) show(patchConfirmed(sync, (s) => ({ ...s, attachments: s.attachments.filter((a) => a.id !== id), items: s.items.map((i) => (i.attachmentIds.includes(id) ? { ...i, attachmentIds: i.attachmentIds.filter((x) => x !== id) } : i)) })))
    },

    dismissSyncError: () => set({ syncError: false }),
  }
})
