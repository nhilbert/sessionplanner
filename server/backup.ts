import { backup, DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { clockIn } from '../src/domain/time.ts'
import { DEFAULT_TIMEZONE } from '../src/domain/types.ts'

/** The file for today's copy, or null when there is nothing to do: no database on disk, or the copy exists. */
function dueToday(dbFile: string, dir: string): string | null {
  if (dbFile === ':memory:' || !existsSync(dbFile)) return null
  mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `sessions-${clockIn(new Date(), DEFAULT_TIMEZONE).date}.db`)
  return existsSync(target) ? null : target
}

/** A copy is written under this name and gets its real one only when whole, so one cut off halfway never counts as the day's copy. */
const unfinished = (target: string) => `${target}.new`

/** Gives a finished copy its name, and keeps the newest `keep`. */
function finish(target: string, dir: string, keep: number): string {
  renameSync(unfinished(target), target)
  const files = readdirSync(dir)
  for (const f of files.filter((f) => f.endsWith('.db.new'))) rmSync(path.join(dir, f), { force: true })
  const old = files
    .filter((f) => /^sessions-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -keep)
  for (const f of old) rmSync(path.join(dir, f), { force: true })
  return target
}

/**
 * One consistent copy of the database per day in <dir>/sessions-YYYY-MM-DD.db; keeps the newest `keep`. For start-up:
 * it holds up everything else for a moment (about a millisecond per megabyte), which nobody notices then.
 */
export function backupDaily(db: DatabaseSync, dbFile: string, dir: string, keep = 14): string | null {
  const target = dueToday(dbFile, dir)
  if (!target) return null
  rmSync(unfinished(target), { force: true })
  db.exec(`VACUUM INTO '${unfinished(target).replace(/'/g, "''")}'`)
  return finish(target, dir, keep)
}

/** Pages per step of a copy: more than a database here will have, so that it is one read of one moment. */
const WHOLE_DATABASE = 2 ** 30

/**
 * The same while the server is in use: requests go on being answered. The copy reads through a connection of its own,
 * as the server's would fail it now and then while writing; in WAL mode the two do not hold each other up. In one step,
 * because a step that sees another connection's write would have to start over.
 */
export async function backupDailyInBackground(dbFile: string, dir: string, keep = 14): Promise<string | null> {
  const target = dueToday(dbFile, dir)
  if (!target) return null
  rmSync(unfinished(target), { force: true })
  const source = new DatabaseSync(dbFile, { readOnly: true })
  try {
    await backup(source, unfinished(target), { rate: WHOLE_DATABASE })
  } finally {
    source.close()
  }
  return finish(target, dir, keep)
}
