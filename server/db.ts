import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db', 'migrations')

/**
 * Opens (and creates) the SQLite database and applies pending migrations. Use ':memory:' in tests. A database that
 * cannot be brought up to date is closed again and the error thrown: it stays as it was, and whoever opened it decides.
 */
export function openDb(file: string, migrationsDir = MIGRATIONS_DIR): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  try {
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')
    runMigrations(db, migrationsDir)
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

const brokenLinks = (db: DatabaseSync) => db.prepare('PRAGMA foreign_key_check').all().length

/**
 * Migrations run with foreign keys off: rebuilding a table means dropping it, and with them on that deletes everything
 * that hangs on it by ON DELETE CASCADE. So a migration cannot lean on a cascade either: rows it leaves without their
 * parent are refused, and it is rolled back. SQLite ignores the pragma inside a transaction, so it is set around them.
 */
function runMigrations(db: DatabaseSync, migrationsDir: string): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const applied = Number(getMeta(db, 'schema') ?? '0')
  const pending = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > applied)
    .sort()
  if (!pending.length) return
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    for (const f of pending) {
      const sql = readFileSync(path.join(migrationsDir, f), 'utf8')
      const before = brokenLinks(db)
      db.exec('BEGIN')
      try {
        db.exec(sql)
        if (brokenLinks(db) > before) throw new Error(`Migration ${f} would leave rows without their parent`)
        setMeta(db, 'schema', String(Number(f.slice(0, 4))))
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

export function getMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}
