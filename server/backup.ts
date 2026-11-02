import type { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { clockIn } from '../src/domain/time.ts'
import { DEFAULT_TIMEZONE } from '../src/domain/types.ts'

/** One consistent copy of the database per day in <dir>/sessions-YYYY-MM-DD.db; keeps the newest `keep`. */
export function backupDaily(db: DatabaseSync, dbFile: string, dir: string, keep = 14): string | null {
  if (dbFile === ':memory:' || !existsSync(dbFile)) return null
  mkdirSync(dir, { recursive: true })
  const today = clockIn(new Date(), DEFAULT_TIMEZONE).date
  const target = path.join(dir, `sessions-${today}.db`)
  if (existsSync(target)) return null
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  const old = readdirSync(dir)
    .filter((f) => /^sessions-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -keep)
  for (const f of old) unlinkSync(path.join(dir, f))
  return target
}
