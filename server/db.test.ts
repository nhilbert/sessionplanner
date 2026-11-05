import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getMeta, openDb } from './db.ts'

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const START = `
CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE children (id INTEGER PRIMARY KEY, parent INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE);
INSERT INTO parents VALUES (1, 'a');
INSERT INTO children VALUES (10, 1), (11, 1);
`
// The way SQLite changes a table it cannot alter: a new one, the rows across, the old one dropped.
const REBUILD = `
CREATE TABLE parents_new (id INTEGER PRIMARY KEY, name TEXT, extra TEXT NOT NULL DEFAULT '');
INSERT INTO parents_new (id, name) SELECT id, name FROM parents;
DROP TABLE parents;
ALTER TABLE parents_new RENAME TO parents;
`

/** A folder of migrations and a database file to run them on. */
function folder(migrations: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sp-db-'))
  dirs.push(dir)
  const set = (m: Record<string, string>) => {
    const sql = path.join(dir, 'migrations')
    rmSync(sql, { recursive: true, force: true })
    mkdirSync(sql)
    for (const [name, text] of Object.entries(m)) writeFileSync(path.join(sql, name), text)
    return sql
  }
  return { file: path.join(dir, 'sessions.db'), sql: set(migrations), set }
}

const count = (db: DatabaseSync, table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
const foreignKeys = (db: DatabaseSync) => (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys

describe('migrations', () => {
  it('rebuild a table without deleting what hangs on it, on a database that already holds data', () => {
    const { file, sql, set } = folder({ '0001_start.sql': START })
    openDb(file, sql).close()
    const db = openDb(file, set({ '0001_start.sql': START, '0002_rebuild.sql': REBUILD }))
    expect(count(db, 'children')).toBe(2)
    expect(getMeta(db, 'schema')).toBe('2')
    db.close()
  })

  it('leave foreign keys on afterwards, and cascades work again', () => {
    const { file, sql } = folder({ '0001_start.sql': START, '0002_rebuild.sql': REBUILD })
    const db = openDb(file, sql)
    expect(foreignKeys(db)).toBe(1)
    db.exec('DELETE FROM parents WHERE id = 1')
    expect(count(db, 'children')).toBe(0)
    db.close()
  })

  it('are refused when they would leave rows without their parent, and nothing of them stays', () => {
    const { file, sql, set } = folder({ '0001_start.sql': START })
    openDb(file, sql).close()
    const bad = set({ '0001_start.sql': START, '0002_drop.sql': 'DELETE FROM parents;' })
    expect(() => openDb(file, bad)).toThrow('0002_drop.sql would leave rows without their parent')
    const db = new DatabaseSync(file)
    expect(count(db, 'parents')).toBe(1)
    expect(getMeta(db, 'schema')).toBe('1')
    db.close()
  })

  it('do not stumble over broken links that were there before', () => {
    const { file, sql, set } = folder({ '0001_start.sql': START })
    openDb(file, sql).close()
    const raw = new DatabaseSync(file)
    raw.exec('PRAGMA foreign_keys = OFF; INSERT INTO children VALUES (12, 99);')
    raw.close()
    const db = openDb(file, set({ '0001_start.sql': START, '0002_more.sql': 'CREATE TABLE more (id INTEGER);' }))
    expect(getMeta(db, 'schema')).toBe('2')
    db.close()
  })

  it('that fail roll back, close the database and can be run again once fixed', () => {
    const close = vi.spyOn(DatabaseSync.prototype, 'close')
    const { file, sql, set } = folder({ '0001_start.sql': START })
    openDb(file, sql).close()
    close.mockClear()
    const broken = set({ '0001_start.sql': START, '0002_half.sql': 'CREATE TABLE half (id INTEGER); THIS IS NOT SQL;' })
    expect(() => openDb(file, broken)).toThrow()
    expect(close).toHaveBeenCalledTimes(1)
    const fixed = openDb(file, set({ '0001_start.sql': START, '0002_half.sql': 'CREATE TABLE half (id INTEGER);' }))
    expect(getMeta(fixed, 'schema')).toBe('2')
    expect(count(fixed, 'half')).toBe(0)
    fixed.close()
  })

  it('apply to a new database from the first on, the real ones included', () => {
    const { file } = folder({})
    const db = openDb(file)
    expect(Number(getMeta(db, 'schema'))).toBeGreaterThanOrEqual(11)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(foreignKeys(db)).toBe(1)
    db.close()
  })
})
