import { describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { StorageBudget } from './budget.ts'

const stage = (limit = 100, workshopFiles = 60) => {
  const repo = new Repo(openDb(':memory:'))
  const id = repo.createWorkshop({ title: 'W' }).workshop.id
  return { repo, id, budget: new StorageBudget(repo, () => limit, workshopFiles) }
}

describe('the storage budget', () => {
  it('holds room up to the limit and refuses more, also among holds that are not stored yet', () => {
    const { budget } = stage()
    const first = budget.hold(70)
    expect(first).not.toBeTypeOf('string')
    expect(budget.hold(31)).toBe('storage_full')
    expect(budget.hold(30)).not.toBeTypeOf('string')
  })

  it('gives room back when a hold ends, once', () => {
    const { budget } = stage()
    const room = budget.hold(100)
    if (typeof room === 'string') throw new Error('no room')
    expect(budget.hold(1)).toBe('storage_full')
    room.release()
    room.release()
    expect(budget.hold(100)).not.toBeTypeOf('string')
    expect(budget.hold(1)).toBe('storage_full')
  })

  it('counts what is stored: files, library files, pictures, theme files and logos', () => {
    const { repo, id, budget } = stage(10_000_000)
    expect(budget.used()).toBe(0)
    repo.addAttachment(id, { id: 'a', name: 'a.pdf', mime: 'application/pdf', size: 10 })
    repo.addAsset({ hash: 'a'.repeat(64), mime: 'image/png', size: 20 })
    repo.createTheme({ id: 'firma', name: 'Firma', tokens: {} as never })
    repo.setThemeFile('firma', 'a.png', { mime: 'image/png', size: 30, updatedAt: 't' })
    const entry = repo.saveLibraryEntry(null, { kind: 'item', title: 'E', data: { kind: 'block', title: 'E', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], slides: [], categoryId: null, color: null } })
    repo.addLibraryAttachment(entry!.id, 0, { id: 'l', name: 'l.pdf', mime: 'application/pdf', size: 40 })
    expect(budget.used()).toBe(100)
    repo.setThemeLogo('firma', 'logo', { mime: 'image/png', updatedAt: 't' })
    expect(budget.used()).toBeGreaterThan(100)
  })

  it('keeps counting a workshop in the trash until it is gone', () => {
    const { repo, id, budget } = stage()
    repo.addAttachment(id, { id: 'a', name: 'a.pdf', mime: 'application/pdf', size: 10 })
    repo.trashWorkshop(id)
    expect(budget.used()).toBe(10)
    repo.deleteWorkshop(id)
    expect(budget.used()).toBe(0)
  })

  it('holds a workshop to its own limit, among parallel holds too', () => {
    const { repo, id, budget } = stage(1000, 60)
    repo.addAttachment(id, { id: 'a', name: 'a.pdf', mime: 'application/pdf', size: 20 })
    expect(budget.hold(30, id)).not.toBeTypeOf('string')
    expect(budget.hold(11, id)).toBe('quota')
    expect(budget.hold(10, id)).not.toBeTypeOf('string')
    expect(budget.hold(500)).not.toBeTypeOf('string')
  })

  it('reads the limit each time, so a new one applies at once', () => {
    const repo = new Repo(openDb(':memory:'))
    let limit = 10
    const budget = new StorageBudget(repo, () => limit)
    expect(budget.hold(11)).toBe('storage_full')
    limit = 20
    expect(budget.hold(11)).not.toBeTypeOf('string')
  })

  it('has no limit unless one is given', () => {
    const repo = new Repo(openDb(':memory:'))
    expect(new StorageBudget(repo).hold(Number.MAX_SAFE_INTEGER)).not.toBeTypeOf('string')
  })
})
