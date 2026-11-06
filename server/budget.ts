import type { Repo } from './repo.ts'
import { BadRequest } from './validate.ts'

/** The files of one workshop together, in bytes. */
export const MAX_WORKSHOP_FILES = 500 * 1024 * 1024

/** Why a write has no room: the workshop's files are full, or the whole set of data is. */
export type NoRoom = 'quota' | 'storage_full'

export interface Room {
  release(): void
}

/** The largest logo: logos keep no size of their own, so each counts as this much. */
const LOGO_BYTES = 2 * 1024 * 1024

/** A copy that does not fit, thrown where a write has no answer of its own to give. */
export class StorageFull extends BadRequest {
  constructor() {
    super('storage_full: this workspace has used up its storage. Deleting files or emptying the trash makes room.')
  }
}

/**
 * What a set of data may hold on disk: the files of workshops (those in the trash too, until they go) and of the library,
 * pictures, and the files and logos of themes. The limit is a function, as a build can change it while the app runs; without
 * one there is none. A write holds its room first and lets go once its record is stored. Holding is one step that nothing
 * can come between, so writes running side by side cannot pass a limit together, as they could when each looked before
 * writing and booked after. Cut-outs turned for a dark ground are left out: they are made from what is counted.
 */
export class StorageBudget {
  private held = 0
  private heldIn = new Map<string, number>()
  private repo: Repo
  private limit: () => number
  private workshopFiles: number

  constructor(repo: Repo, limit: () => number = () => Infinity, workshopFiles = MAX_WORKSHOP_FILES) {
    this.repo = repo
    this.limit = limit
    this.workshopFiles = workshopFiles
  }

  /** What may be stored; null without a limit. */
  allowed(): number | null {
    const limit = this.limit()
    return limit === Infinity ? null : limit
  }

  /** What is stored now. */
  used(): number {
    return this.repo.storedBytes(LOGO_BYTES)
  }

  /** Holds room for `bytes`, in a workshop's files when one is named; or says why there is none. */
  hold(bytes: number, workshopId?: string): Room | NoRoom {
    const inWorkshop = workshopId ? (this.heldIn.get(workshopId) ?? 0) : 0
    if (workshopId && this.repo.attachmentBytes(workshopId) + inWorkshop + bytes > this.workshopFiles) return 'quota'
    const limit = this.limit()
    if (limit !== Infinity && this.used() + this.held + bytes > limit) return 'storage_full'
    this.held += bytes
    if (workshopId) this.heldIn.set(workshopId, inWorkshop + bytes)
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.held -= bytes
        if (!workshopId) return
        const left = (this.heldIn.get(workshopId) ?? bytes) - bytes
        if (left > 0) this.heldIn.set(workshopId, left)
        else this.heldIn.delete(workshopId)
      },
    }
  }
}
