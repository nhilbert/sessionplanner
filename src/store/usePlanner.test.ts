import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Op } from '@/domain/ops'
import type { WorkshopState } from '@/domain/types'

/** Answers of the server that wait until the test gives them. */
const server = vi.hoisted(() => ({
  sent: [] as { id: string; ops: unknown[] }[],
  answers: [] as ((ok: boolean) => void)[],
  loads: [] as string[],
  title: new Map<string, string>(),
}))

vi.mock('@/api', () => ({
  ApiError: class extends Error {
    status = 500
  },
  api: {
    eventsUrl: (id: string) => `/events/${id}`,
    loadWorkshop: async (id: string) => {
      server.loads.push(id)
      return { workshop: { id, title: server.title.get(id) ?? 'alt' }, days: [], groups: [], items: [], attachments: [] } as unknown as WorkshopState
    },
    sendOps: (id: string, _tag: string, ops: unknown[]) => {
      server.sent.push({ id, ops })
      return new Promise((resolve, reject) => server.answers.push((ok) => (ok ? resolve({ ops }) : reject(new Error('refused')))))
    },
  },
}))

const { usePlanner } = await import('./usePlanner')

const rename = (id: string, title: string): Op[] => [{ op: 'set', entity: 'workshop', id, fields: { title } }]
const settle = () => new Promise((r) => setTimeout(r))
const answer = async (ok = true) => {
  server.answers.shift()!(ok)
  await settle()
}
const titles = () => server.sent.map((s) => (s.ops[0] as { fields: { title: string } }).fields.title)

describe('changes on their way when the workshop is left', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', class { close() {} addEventListener() {} })
    server.sent.length = 0
    server.answers.length = 0
    server.loads.length = 0
    server.title.clear()
  })
  afterEach(async () => {
    usePlanner.getState().close()
    while (server.answers.length) await answer()
    usePlanner.getState().dismissSyncError()
  })

  const opened = async (id = 'w') => {
    usePlanner.getState().open(id)
    await settle()
  }

  it('still go out, every one of them, in the order they were made', async () => {
    await opened()
    const { change, close } = usePlanner.getState()
    change(rename('w', 'eins'))
    change(rename('w', 'zwei'))
    change(rename('w', 'drei'))
    await settle()
    close()
    await answer()
    expect(titles()).toEqual(['eins', 'zwei'])
    await answer()
    await answer()
    expect(titles()).toEqual(['eins', 'zwei', 'drei'])
  })

  it('go out for their own workshop when another one was opened meanwhile', async () => {
    await opened('a')
    usePlanner.getState().change(rename('a', 'eins'))
    usePlanner.getState().change(rename('a', 'zwei'))
    await settle()
    usePlanner.getState().close()
    usePlanner.getState().open('b')
    await answer()
    await answer()
    expect(server.sent.map((s) => s.id)).toEqual(['a', 'a'])
    expect(usePlanner.getState().id).toBe('b')
  })

  it('are in what the workshop shows when it is opened again: it loads after they are through', async () => {
    await opened()
    usePlanner.getState().change(rename('w', 'neu'))
    await settle()
    usePlanner.getState().close()
    server.loads.length = 0
    usePlanner.getState().open('w')
    await settle()
    expect(server.loads).toEqual([])
    server.title.set('w', 'neu')
    await answer()
    expect(server.loads).toEqual(['w'])
    expect(usePlanner.getState().data?.workshop.title).toBe('neu')
  })

  it('are reported when they fail after the workshop was left, at the next opening', async () => {
    await opened()
    usePlanner.getState().change(rename('w', 'neu'))
    await settle()
    usePlanner.getState().close()
    await answer(false)
    await opened('b')
    expect(usePlanner.getState().syncError).toBe(true)
    usePlanner.getState().dismissSyncError()
    usePlanner.getState().close()
    await opened('c')
    expect(usePlanner.getState().syncError).toBe(false)
  })

  it('are reported at once when they fail while another workshop is open, and leave it as it is', async () => {
    await opened('a')
    usePlanner.getState().change(rename('a', 'neu'))
    await settle()
    usePlanner.getState().close()
    await opened('b')
    await answer(false)
    expect(usePlanner.getState().syncError).toBe(true)
    expect(usePlanner.getState().id).toBe('b')
    expect(usePlanner.getState().data?.workshop.id).toBe('b')
  })

  it('leave an open workshop to its own course when nothing is left', async () => {
    await opened()
    usePlanner.getState().change(rename('w', 'neu'))
    await settle()
    await answer()
    expect(titles()).toEqual(['neu'])
    expect(usePlanner.getState().syncError).toBe(false)
  })
})
