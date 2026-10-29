import { create } from 'zustand'
import { api, ApiError } from '@/api'
import { applyOps, inverseOps, type Op, type ServerEvent } from '@/domain/ops'
import type { Attachment, WorkshopState } from '@/domain/types'

/**
 * The open workshop (docs/concept.md, section 7): changes apply here at once and go to the server in
 * order; changes from other windows arrive over server-sent events. Undo/redo covers this window's changes.
 */

const CLIENT_ID = crypto.randomUUID()
const MAX_UNDO = 200

interface Entry {
  redo: Op[]
  undo: Op[]
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
  undo: () => void
  redo: () => void
  addAttachment: (a: Attachment) => void
  removeAttachment: (id: string) => void
  dismissSyncError: () => void
}

let source: EventSource | null = null
let queue: Promise<unknown> = Promise.resolve()

export const usePlanner = create<PlannerStore>((set, get) => {
  async function reload() {
    const id = get().id
    if (!id) return
    try {
      const data = await api.loadWorkshop(id)
      if (get().id === id) set({ data, status: 'ready' })
    } catch (err) {
      if (get().id !== id) return
      if (err instanceof ApiError && err.status === 404) set({ status: 'missing', data: null })
      else if (err instanceof ApiError && err.status === 401) set({ status: 'login' })
      else set({ status: get().data ? 'ready' : 'error' })
    }
  }

  function send(ops: Op[]) {
    const id = get().id
    if (!id || !ops.length) return
    queue = queue.then(async () => {
      try {
        const res = await api.sendOps(id, CLIENT_ID, ops)
        // The server may have adjusted something (an item whose day is gone gets parked): take those over.
        const sent = new Set(ops.map((o) => JSON.stringify(o)))
        const extra = res.ops.filter((o) => !sent.has(JSON.stringify(o)))
        const data = get().data
        if (extra.length && data && get().id === id) set({ data: applyOps(data, extra) })
      } catch (err) {
        if (get().id !== id) return
        if (err instanceof ApiError && err.status === 401) set({ status: 'login' })
        else set({ syncError: true })
        await reload()
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
      if (connectedBefore) void reload()
      connectedBefore = true
    })
    source.onerror = () => {
      set({ live: false })
      // Behind the login an expired session looks like a broken stream; ask the API what is going on.
      void reload()
    }
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as ServerEvent
      const data = get().data
      if (!data || get().id !== id) return
      if (event.type === 'ops') {
        if (event.clientId !== CLIENT_ID) set({ data: applyOps(data, event.ops) })
      } else if (event.type === 'attachment') {
        if (!data.attachments.some((a) => a.id === event.attachment.id)) set({ data: { ...data, attachments: [...data.attachments, event.attachment] } })
      } else if (event.type === 'attachment-deleted') {
        set({ data: { ...data, attachments: data.attachments.filter((a) => a.id !== event.id) } })
      } else if (event.type === 'workshop-deleted') {
        set({ status: 'missing', data: null })
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
      set({ id, data: null, status: 'loading', live: false, past: [], future: [], syncError: false })
      void reload()
      connect(id)
    },

    close: () => {
      source?.close()
      source = null
      set({ id: null, data: null, status: 'idle', live: false, past: [], future: [] })
    },

    change: (ops) => {
      const data = get().data
      if (!data || !ops.length) return
      const undo = inverseOps(data, ops)
      set({ data: applyOps(data, ops), past: [...get().past, { redo: ops, undo }].slice(-MAX_UNDO), future: [] })
      send(ops)
    },

    undo: () => {
      const entry = get().past.at(-1)
      const data = get().data
      if (!entry || !data) return
      set({ data: applyOps(data, entry.undo), past: get().past.slice(0, -1), future: [...get().future, entry] })
      send(entry.undo)
    },

    redo: () => {
      const entry = get().future.at(-1)
      const data = get().data
      if (!entry || !data) return
      set({ data: applyOps(data, entry.redo), future: get().future.slice(0, -1), past: [...get().past, entry] })
      send(entry.redo)
    },

    addAttachment: (a) => {
      const data = get().data
      if (data && !data.attachments.some((x) => x.id === a.id)) set({ data: { ...data, attachments: [...data.attachments, a] } })
    },

    removeAttachment: (id) => {
      const data = get().data
      if (!data) return
      // The server unlinks it from items too and tells every window, this one included.
      set({ data: { ...data, attachments: data.attachments.filter((a) => a.id !== id), items: data.items.map((i) => (i.attachmentIds.includes(id) ? { ...i, attachmentIds: i.attachmentIds.filter((x) => x !== id) } : i)) } })
    },

    dismissSyncError: () => set({ syncError: false }),
  }
})
