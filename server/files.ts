import { copyFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { newId } from '../src/domain/ops.ts'
import { entryItems } from '../src/domain/copy.ts'
import type { Attachment, ItemContent, LibraryEntry } from '../src/domain/types.ts'
import type { LibraryFile, Repo } from './repo.ts'

/**
 * Attachment files going between the library and the workshops. A copy is a file of its own under its own id:
 * replacing or deleting the original leaves it alone (docs/concept.md, section 5). Files are small, so this runs
 * synchronously, which keeps a copy and its record together for the app's routes and the agents' tools alike.
 */

/** The files of one workshop together, in bytes. */
export const MAX_WORKSHOP_FILES = 500 * 1024 * 1024

/** Where the files live; the agents' tools can run without (tests), and then no file moves. */
type Dir = string | undefined

const copied = (filesDir: Dir, from: string, to: string): boolean => {
  if (!filesDir) return false
  try {
    copyFileSync(path.join(filesDir, from), path.join(filesDir, to))
    return true
  } catch {
    return false
  }
}

export function removeFiles(filesDir: Dir, ids: string[]): void {
  if (filesDir) for (const id of ids) rmSync(path.join(filesDir, id), { force: true })
}

/**
 * Copies the files of a library entry into a workshop: library attachment id → the workshop's copy. A file missing on
 * disk is left out. Null when the copies would not fit the workshop's limit; nothing is copied then.
 */
export function copyEntryFiles(repo: Repo, filesDir: Dir, entry: LibraryEntry, workshopId: string, limit: number): Record<string, Attachment> | null {
  if (repo.attachmentBytes(workshopId) + entry.attachments.reduce((s, a) => s + a.size, 0) > limit) return null
  const copies: Record<string, Attachment> = {}
  for (const a of entry.attachments) {
    const id = newId()
    if (!copied(filesDir, a.id, id)) continue
    const copy = repo.addAttachment(workshopId, { id, name: a.name, mime: a.mime, size: a.size })
    if (copy) copies[a.id] = copy
    else removeFiles(filesDir, [id])
  }
  return copies
}

/**
 * Files for a new library entry saved from a workshop: the draft's attachmentIds name workshop attachments; each
 * becomes a copy of the library, and the draft comes back naming the copies. Anything else in the list is dropped.
 */
export function copyToLibrary<E extends Pick<LibraryEntry, 'kind' | 'title' | 'data'>>(repo: Repo, filesDir: Dir, draft: E): { entry: E; files: LibraryFile[] } {
  const copies = new Map<string, LibraryFile>()
  const withCopies = (c: ItemContent): ItemContent => ({
    ...c,
    attachmentIds: c.attachmentIds.flatMap((source) => {
      if (!copies.has(source)) {
        const a = repo.getAttachment(source)
        const id = newId()
        if (!a || !copied(filesDir, a.id, id)) return []
        copies.set(source, { id, name: a.name, mime: a.mime, size: a.size })
      }
      return [copies.get(source)!.id]
    }),
  })
  const data = draft.kind === 'group' ? { items: entryItems(draft).map(withCopies) } : withCopies(draft.data as ItemContent)
  return { entry: { ...draft, data }, files: [...copies.values()] }
}
