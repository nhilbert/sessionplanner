import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '@/domain/ops'
import type { Item, WorkshopState } from '@/domain/types'

/** The snapshots wait until the test hands them out, as a slow line would. */
const server = vi.hoisted(() => ({ loads: [] as ((state: unknown) => void)[], source: null as { emit: (e: unknown) => void; hello: () => void } | null }))

vi.mock('@/api', () => ({
  ApiError: class extends Error {
    status = 500
  },
  api: {
    eventsUrl: (id: string) => `/events/${id}`,
    loadWorkshop: () => new Promise((resolve) => server.loads.push(resolve)),
    sendOps: async (_id: string, _tag: string, ops: unknown[]) => ({ ops }),
  },
}))

const { usePlanner } = await import('./usePlanner')

const settle = () => new Promise((r) => setTimeout(r))
const snapshot = (title: string, revision?: number, items: Partial<Item>[] = []) => ({ workshop: { id: 'w', title }, days: [], groups: [], items, attachments: [], ...(revision === undefined ? {} : { revision }) }) as unknown as WorkshopState
const titled = (title: string, revision?: number, clientId = 'other'): ServerEvent => ({ type: 'ops', clientId, ops: [{ op: 'set', entity: 'workshop', id: 'w', fields: { title } }], ...(revision === undefined ? {} : { revision }) }) as ServerEvent
const load = async (state: WorkshopState) => {
  server.loads.shift()!(state)
  await settle()
}
const title = () => usePlanner.getState().data?.workshop.title

describe('a snapshot and the live stream', () => {
  beforeEach(() => {
    server.loads.length = 0
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((e: { data: string }) => void) | null = null
        onerror: (() => void) | null = null
        private hellos: ((e: { data: string }) => void)[] = []
        constructor() {
          server.source = { emit: (e) => this.onmessage?.({ data: JSON.stringify(e) }), hello: () => this.hellos.forEach((h) => h({ data: '' })) }
        }
        addEventListener(name: string, listener: (e: { data: string }) => void) {
          if (name === 'hello') this.hellos.push(listener)
        }
        close() {}
      },
    )
  })
  afterEach(() => usePlanner.getState().close())

  const opened = async () => {
    usePlanner.getState().open('w')
    await settle()
    server.source!.hello()
  }

  it('keeps a change that comes in before the first snapshot', async () => {
    await opened()
    server.source!.emit(titled('neu', 6))
    await load(snapshot('alt', 5))
    expect(title()).toBe('neu')
  })

  it('does not apply twice what the snapshot already holds', async () => {
    await opened()
    const item = { id: 'i', workshopId: 'w', dayId: null, position: 1, groupId: null, title: 'Eins' }
    server.source!.emit({ type: 'ops', clientId: 'other', ops: [{ op: 'create', entity: 'item', record: item }], revision: 5 })
    await load(snapshot('alt', 5, [item]))
    expect(usePlanner.getState().data?.items).toHaveLength(1)
  })

  it('takes what comes after the snapshot, and leaves out what comes with an older number', async () => {
    await opened()
    await load(snapshot('alt', 5))
    server.source!.emit(titled('eins', 6))
    expect(title()).toBe('eins')
    server.source!.emit(titled('veraltet', 5))
    expect(title()).toBe('eins')
  })

  it('lets a late snapshot not overwrite a newer change, and reads again', async () => {
    await opened()
    await load(snapshot('alt', 5))
    server.source!.hello()
    await settle()
    expect(server.loads).toHaveLength(1)
    server.source!.emit(titled('neu', 7))
    await load(snapshot('alt', 6))
    expect(title(), 'the older snapshot is passed over').toBe('neu')
    expect(server.loads, 'and read again, as changes may have been missed').toHaveLength(1)
    await load(snapshot('neu und mehr', 7))
    expect(title()).toBe('neu und mehr')
  })

  it('still takes a window\'s own change back from the stream when the snapshot holds it', async () => {
    await opened()
    await load(snapshot('alt', 5))
    usePlanner.getState().change([{ op: 'set', entity: 'workshop', id: 'w', fields: { title: 'mein' } }])
    await settle()
    server.source!.hello()
    await settle()
    await load(snapshot('mein', 6))
    expect(title()).toBe('mein')
  })

  it('works with a server that sends no numbers', async () => {
    await opened()
    server.source!.emit(titled('früh'))
    await load(snapshot('alt'))
    expect(title()).toBe('früh')
    server.source!.emit(titled('später'))
    expect(title()).toBe('später')
  })

  it('forgets what came in for a workshop that was left', async () => {
    await opened()
    server.source!.emit(titled('fremd', 9))
    usePlanner.getState().close()
    await opened()
    await load(snapshot('alt', 1))
    expect(title()).toBe('alt')
  })
})
