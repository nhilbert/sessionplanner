import { beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({
  saves: [] as Record<string, unknown>[],
  answers: [] as ((ok: boolean) => void)[],
  stored: { dayStart: 540 } as Record<string, unknown>,
  loads: 0,
}))

vi.mock('@/api', () => ({
  api: {
    saveSettings: (body: Record<string, unknown>) => {
      server.saves.push(body)
      return new Promise((resolve, reject) =>
        server.answers.push((ok) => {
          if (ok) server.stored = body
          if (ok) resolve(body)
          else reject(new Error('refused'))
        }),
      )
    },
    getSettings: async () => {
      server.loads++
      return server.stored
    },
  },
}))

const { useSettings } = await import('./useSettings')

const settle = () => new Promise((r) => setTimeout(r))
const answer = async (ok = true) => {
  server.answers.shift()!(ok)
  await settle()
}

describe('saving the settings', () => {
  beforeEach(() => {
    server.saves.length = 0
    server.answers.length = 0
    server.loads = 0
  })

  it('sends one change after the other, so the last one made is the one that stays', async () => {
    const { update } = useSettings.getState()
    update({ dayStart: 600 })
    update({ dayStart: 660 })
    await settle()
    expect(server.saves.map((s) => s.dayStart)).toEqual([600])
    await answer()
    expect(server.saves.map((s) => s.dayStart)).toEqual([600, 660])
    await answer()
    expect(server.stored.dayStart).toBe(660)
    expect(useSettings.getState().settings.dayStart).toBe(660)
  })

  it('reloads after a failed save only when no newer one follows', async () => {
    const { update } = useSettings.getState()
    update({ dayStart: 610 })
    update({ dayStart: 620 })
    await settle()
    await answer(false)
    expect(server.loads).toBe(0)
    await answer()
    expect(useSettings.getState().settings.dayStart).toBe(620)
    update({ dayStart: 630 })
    await settle()
    await answer(false)
    expect(server.loads).toBe(1)
    expect(useSettings.getState().settings.dayStart).toBe(620)
  })
})
