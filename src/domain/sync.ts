import { applyOps, type Op } from './ops.ts'
import type { WorkshopState } from './types.ts'

/**
 * How a window keeps its copy of a workshop in step with the server (docs/concept.md, section 7).
 *
 * The server decides the order of all changes and passes every stored batch to every open window, the
 * sender's included, over one ordered stream. A window keeps two things:
 *  - `confirmed`: the workshop as the server has it, built by applying every batch of that stream in order;
 *  - `pending`: its own batches not yet seen on the stream, in the order they were made.
 * What it shows is `confirmed` with `pending` laid over it. So the window's own changes show at once, and
 * once they come back they take their place in the server's order: when two windows change the same field,
 * both end with the change the server stored last ("the later change wins" everywhere, not only on the server).
 *
 * Each batch is sent with a tag (the window's id and a number), which the server passes back with it.
 */

export interface Batch {
  tag: string
  ops: Op[]
  /** Posted to the server: its fate is known once the answer or its echo arrives. */
  sent: boolean
}

export interface Sync {
  confirmed: WorkshopState
  pending: Batch[]
}

export const startSync = (state: WorkshopState): Sync => ({ confirmed: state, pending: [] })

/** What the window shows: the server's state with this window's own changes that are still on their way. */
export const syncView = (s: Sync): WorkshopState => s.pending.reduce((state, b) => applyOps(state, b.ops), s.confirmed)

/** A change made in this window, shown at once and queued for the server. */
export const addLocal = (s: Sync, tag: string, ops: Op[]): Sync => ({ ...s, pending: [...s.pending, { tag, ops, sent: false }] })

export const markSent = (s: Sync, tag: string): Sync => ({ ...s, pending: s.pending.map((b) => (b.tag === tag ? { ...b, sent: true } : b)) })

/** A batch from the server's stream (another window's, or this window's own coming back as stored). */
export const applyRemote = (s: Sync, tag: string, ops: Op[]): Sync => ({ confirmed: applyOps(s.confirmed, ops), pending: s.pending.filter((b) => b.tag !== tag) })

/** A batch that will not come back: the server refused it, or stored nothing of it (its records were gone). */
export const settle = (s: Sync, tag: string): Sync => ({ ...s, pending: s.pending.filter((b) => b.tag !== tag) })

/**
 * The workshop loaded afresh (after a lost connection or a refused change). It holds every batch that was sent
 * before it was loaded, so only those not yet sent stay pending. Echoes of earlier batches that still arrive are
 * applied over it in the stream's order, which leaves the same result.
 */
export const fromSnapshot = (s: Sync | null, state: WorkshopState): Sync => ({ confirmed: state, pending: s ? s.pending.filter((b) => !b.sent) : [] })

/** A change that is not an operation (an attachment uploaded or removed), applied to the server's state. */
export const patchConfirmed = (s: Sync, fn: (state: WorkshopState) => WorkshopState): Sync => ({ ...s, confirmed: fn(s.confirmed) })
