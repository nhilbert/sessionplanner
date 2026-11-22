import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkshopState } from '@/domain/types'
import { markOffline } from '@/offline/state'

/** The snapshots wait until the test hands them out; one from the offline copy is marked as the API client marks it. */
const server = vi.hoisted(() => ({ loads: [] as ((state: unknown) => void)[], sent: 0, source: null as { hello: () => void; fail: () => void } | null }))

vi.mock('@/api', () => ({
  ApiError: class extends Error {
    status = 500
  },
  api: {
    eventsUrl: (id: string) => `/events/${id}`,
    loadWorkshop: () => new Promise((resolve) => server.loads.push(resolve)),
    sendOps: async (_id: string, _tag: string, ops: unknown[]) => {
      server.sent++
      return { ops }
    },
  },
}))

const { usePlanner } = await import('./usePlanner')

const settle = () => new Promise((r) => setTimeout(r))
const snapshot = (title: string, revision: number) => ({ workshop: { id: 'w', title }, days: [], groups: [], items: [], attachments: [], revision }) as unknown as WorkshopState
const fromServer = async (state: WorkshopState) => {
  server.loads.shift()!(state)
  await settle()
}
const fromCopy = async (state: WorkshopState, at = '2026-11-21T17:04:00.000Z') => {
  markOffline(state, at)
  await fromServer(state)
}
const rename = (title: string) => usePlanner.getState().change([{ op: 'set', entity: 'workshop', id: 'w', fields: { title } }])

describe('the offline copy in the open workshop', () => {
  beforeEach(() => {
    server.loads.length = 0
    server.sent = 0
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((e: { data: string }) => void) | null = null
        onerror: (() => void) | null = null
        private hellos: ((e: { data: string }) => void)[] = []
        constructor() {
          server.source = { hello: () => this.hellos.forEach((h) => h({ data: '' })), fail: () => this.onerror?.() }
        }
        addEventListener(name: string, listener: (e: { data: string }) => void) {
          if (name === 'hello') this.hellos.push(listener)
        }
        close() {}
      },
    )
  })
  afterEach(() => usePlanner.getState().close())

  it('shows a workshop opened without a connection from the copy, read-only', async () => {
    usePlanner.getState().open('w')
    await settle()
    await fromCopy(snapshot('Kopie', 3))
    expect(usePlanner.getState()).toMatchObject({ status: 'ready', offlineAt: '2026-11-21T17:04:00.000Z' })
    expect(usePlanner.getState().data?.workshop.title).toBe('Kopie')
    rename('neu')
    await settle()
    expect(usePlanner.getState().data?.workshop.title).toBe('Kopie')
    expect(server.sent).toBe(0)
  })

  it('keeps what it shows when the connection breaks: the copy may be older', async () => {
    usePlanner.getState().open('w')
    await settle()
    server.source!.hello()
    await fromServer(snapshot('aktuell', 7))
    expect(usePlanner.getState().offlineAt).toBeNull()
    server.source!.fail()
    await settle()
    await fromCopy(snapshot('älter', 5))
    expect(usePlanner.getState().data?.workshop.title).toBe('aktuell')
    expect(usePlanner.getState().offlineAt).not.toBeNull()
    expect(server.loads).toHaveLength(0)
  })

  it('reads the workshop from the server again once the stream is back, and may change it then', async () => {
    usePlanner.getState().open('w')
    await settle()
    await fromCopy(snapshot('Kopie', 3))
    server.source!.hello()
    await settle()
    await fromServer(snapshot('Server', 8))
    expect(usePlanner.getState()).toMatchObject({ offlineAt: null })
    expect(usePlanner.getState().data?.workshop.title).toBe('Server')
    rename('neu')
    await settle()
    expect(server.sent).toBe(1)
  })
})
