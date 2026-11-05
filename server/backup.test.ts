import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupDaily, backupDailyInBackground } from './backup.ts'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'

/** Lets a copy fail halfway, as with a full disk or a server stopped in the middle. */
const copy = vi.hoisted(() => ({ cutOff: false }))
vi.mock('node:sqlite', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:sqlite')>()
  const { writeFileSync } = await import('node:fs')
  return {
    ...real,
    backup: (...args: Parameters<typeof real.backup>) => {
      if (!copy.cutOff) return real.backup(...args)
      writeFileSync(args[1] as string, 'half a copy')
      return Promise.reject(new Error('disk full'))
    },
  }
})

let dir: string
let db: DatabaseSync
let dbFile: string
let backups: string

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  dir = mkdtempSync(path.join(tmpdir(), 'sp-backup-'))
  dbFile = path.join(dir, 'sessions.db')
  backups = path.join(dir, 'backups')
  db = openDb(dbFile)
  new Repo(db).createWorkshop({ title: 'Kept' })
})
afterEach(() => {
  vi.useRealTimers()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const titlesIn = (file: string) => {
  const copy = openDb(file)
  const titles = new Repo(copy).listWorkshops().map((w) => w.title)
  const check = copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  copy.close()
  return { titles, check: check.integrity_check }
}

describe.each<[string, (keep?: number) => string | null | Promise<string | null>]>([
  ['at start-up', (keep) => backupDaily(db, dbFile, backups, keep)],
  ['in the background', (keep) => backupDailyInBackground(dbFile, backups, keep)],
])('a backup %s', (_when, make) => {
  const today = () => path.join(backups, 'sessions-2026-11-05.db')

  it('makes one copy a day, and leaves nothing else in the folder', async () => {
    expect(await make()).toBe(today())
    expect(await make()).toBeNull()
    expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db'])
  })

  it('can be restored: it opens as the database, whole, with the data', async () => {
    await make()
    const restored = path.join(dir, 'restored', 'sessions.db')
    mkdirSync(path.dirname(restored))
    copyFileSync(today(), restored)
    expect(titlesIn(restored)).toEqual({ titles: ['Kept'], check: 'ok' })
  })

  it('replaces what an interrupted copy left behind', async () => {
    mkdirSync(backups)
    writeFileSync(`${today()}.new`, 'half a copy')
    expect(await make()).toBe(today())
    expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db'])
    expect(titlesIn(today()).titles).toEqual(['Kept'])
  })

  it('clears what an earlier day left unfinished', async () => {
    mkdirSync(backups)
    writeFileSync(path.join(backups, 'sessions-2026-11-04.db.new'), 'half a copy')
    await make()
    expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db'])
  })

  it('keeps the newest copies, today\'s among them', async () => {
    mkdirSync(backups)
    for (const d of ['01', '02', '03']) writeFileSync(path.join(backups, `sessions-2026-11-${d}.db`), 'old')
    await make(2)
    expect(readdirSync(backups).sort()).toEqual(['sessions-2026-11-03.db', 'sessions-2026-11-05.db'])
  })
})

it('at start-up leaves nothing behind when it fails', () => {
  mkdirSync(backups)
  const closed = openDb(path.join(dir, 'other.db'))
  closed.close()
  expect(() => backupDaily(closed, dbFile, backups)).toThrow()
  expect(readdirSync(backups)).toEqual([])
})

it('has nothing to do for a database in memory', () => {
  const memory = openDb(':memory:')
  expect(backupDaily(memory, ':memory:', backups)).toBeNull()
  memory.close()
  expect(existsSync(backups)).toBe(false)
})

describe('a backup in the background', () => {
  const today = () => path.join(backups, 'sessions-2026-11-05.db')

  it('does not count when cut off halfway, and the next try makes the day\'s copy', async () => {
    copy.cutOff = true
    await expect(backupDailyInBackground(dbFile, backups)).rejects.toThrow('disk full')
    copy.cutOff = false
    expect(existsSync(today())).toBe(false)
    expect(readdirSync(backups), 'what is left of it may be what fills the disk').toEqual([])
    expect(await backupDailyInBackground(dbFile, backups)).toBe(today())
    expect(titlesIn(today())).toEqual({ titles: ['Kept'], check: 'ok' })
  })

  it('is one plain file, like the one at start-up: it opens read-only and leaves nothing beside it', async () => {
    await backupDailyInBackground(dbFile, backups)
    const copied = new DatabaseSync(today(), { readOnly: true })
    expect(copied.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
    copied.close()
    expect(readdirSync(backups)).toEqual(['sessions-2026-11-05.db'])
  })

  it('stays whole while the server goes on writing, every time', async () => {
    const repo = new Repo(db)
    for (let round = 0; round < 25; round++) {
      rmSync(backups, { recursive: true, force: true })
      const made = backupDailyInBackground(dbFile, backups)
      for (let i = 0; i < 40; i++) repo.createWorkshop({ title: `During ${round}.${i}` })
      const { titles, check } = titlesIn((await made)!)
      expect(check).toBe('ok')
      expect(titles).toContain('Kept')
    }
  })
})
