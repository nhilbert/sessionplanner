import { copyFileSync, rmSync } from 'node:fs'
import { newId } from '../src/domain/ops.ts'
import { entryItems } from '../src/domain/copy.ts'
import type { Attachment, ItemContent, LibraryEntry } from '../src/domain/types.ts'
import type { LibraryFile, Repo } from './repo.ts'
import { type NoRoom, type StorageBudget, StorageFull } from './budget.ts'
import { filePaths } from './storage.ts'

/**
 * Attachment files going between the library and the workshops. A copy is a file of its own under its own id:
 * replacing or deleting the original leaves it alone (docs/concept.md, section 5). Files are small, so this runs
 * synchronously, which keeps a copy and its record together for the app's routes and the agents' tools alike.
 */

export { MAX_WORKSHOP_FILES } from './budget.ts'

/** Where the files live; the agents' tools can run without (tests), and then no file moves. */
type Dir = string | undefined

const copied = (filesDir: Dir, from: string, to: string): boolean => {
  if (!filesDir) return false
  try {
    const { file } = filePaths(filesDir)
    copyFileSync(file(from), file(to))
    return true
  } catch {
    return false
  }
}

export function removeFiles(filesDir: Dir, ids: string[]): void {
  if (filesDir) for (const id of ids) rmSync(filePaths(filesDir).file(id), { force: true })
}

/**
 * Deletes for good the workshops that have been in the trash for TRASH_DAYS days, with their files; answers the ids of
 * the files removed. Files first: a workshop whose files cannot go stays in the trash with its records, so the next
 * check knows what is left, and does not hold up the others.
 */
export function emptyTrash(repo: Repo, filesDir: Dir, at = new Date()): string[] {
  return repo.expiredTrash(at).flatMap((id) => {
    try {
      const files = repo.attachmentIdsOf(id)
      removeFiles(filesDir, files)
      repo.deleteWorkshop(id)
      return files
    } catch (err) {
      console.error(`Workshop ${id} could not leave the trash, trying again at the next check:`, (err as Error).message)
      return []
    }
  })
}

/**
 * Copies the files of a library entry into a workshop: library attachment id → the workshop's copy. A file missing on
 * disk is left out. When the copies would not fit it answers why, and nothing is copied.
 */
export function copyEntryFiles(repo: Repo, filesDir: Dir, entry: LibraryEntry, workshopId: string, budget: StorageBudget): Record<string, Attachment> | NoRoom {
  const room = budget.hold(entry.attachments.reduce((s, a) => s + a.size, 0), workshopId)
  if (typeof room === 'string') return room
  try {
    const copies: Record<string, Attachment> = {}
    for (const a of entry.attachments) {
      const id = newId()
      if (!copied(filesDir, a.id, id)) continue
      const copy = repo.addAttachment(workshopId, { id, name: a.name, mime: a.mime, size: a.size })
      if (copy) copies[a.id] = copy
      else removeFiles(filesDir, [id])
    }
    return copies
  } finally {
    room.release()
  }
}

/**
 * Files for a new library entry saved from a workshop: the draft's attachmentIds name workshop attachments; each
 * becomes a copy of the library, and the draft comes back naming the copies. Anything else in the list is dropped.
 */
export function copyToLibrary<E extends Pick<LibraryEntry, 'kind' | 'title' | 'data'>>(repo: Repo, filesDir: Dir, draft: E, budget: StorageBudget): { entry: E; files: LibraryFile[] } {
  const named = new Set(entryItems(draft).flatMap((c) => c.attachmentIds))
  const room = budget.hold([...named].reduce((s, id) => s + (repo.getAttachment(id)?.size ?? 0), 0))
  if (typeof room === 'string') throw new StorageFull()
  // Nothing can come between this and the caller storing the records: the room needs holding only for the check.
  room.release()
  const copies = new Map<string, LibraryFile>()
  const withCopies = (c: ItemContent): ItemContent => ({
    ...c,
    attachmentIds: c.attachmentIds.flatMap((source) => {
      if (!copies.has(source)) {
        const a = repo.getAttachment(source)
        const id = newId()
        if (!a || !repo.hasWorkshop(a.workshopId) || !copied(filesDir, a.id, id)) return []
        copies.set(source, { id, name: a.name, mime: a.mime, size: a.size })
      }
      return [copies.get(source)!.id]
    }),
  })
  const data = draft.kind === 'group' ? { items: entryItems(draft).map(withCopies) } : withCopies(draft.data as ItemContent)
  return { entry: { ...draft, data }, files: [...copies.values()] }
}
