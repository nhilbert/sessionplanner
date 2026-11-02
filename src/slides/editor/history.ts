/**
 * The slide editor's own history (docs/slides.md, section 7): every change made in the editor is a step that undo
 * takes back and redo puts again – typing in a field, a layout or an option, a picture, and inserting, removing or
 * moving a slide. Typing in one field is one step as long as it goes on (a pause or leaving the field ends it), as
 * in a text editor. Steps refer to slides by key, never by position, so slides moving meanwhile do not matter.
 *
 * Pure functions over plain data; the editor applies the steps to its slide source.
 */

export type Step =
  /** A slide's markup changed from `before` to `after`; `open` while typing in `field` may still join it. */
  | { kind: 'edit'; key: string; before: string; after: string; field: string | null; open: boolean; at: number }
  /** Slides inserted into a group at a position (their keys as they are now). */
  | { kind: 'insert'; group: string; at: number; keys: string[]; html: string[] }
  /** A slide removed from a group at a position (its key as it was, its markup to put it back). */
  | { kind: 'remove'; group: string; at: number; key: string; html: string }
  /** A slide moved within its group. */
  | { kind: 'move'; key: string; from: number; to: number }

export interface History {
  past: Step[]
  future: Step[]
}

export const EMPTY_HISTORY: History = { past: [], future: [] }
/** A pause longer than this ends a typing step. */
export const TYPING_PAUSE_MS = 1500
export const MAX_STEPS = 300

/**
 * Records an edit of one slide. While the same field of the same slide is being typed in, it joins the open step;
 * an edit that changes nothing is not a step, and typing that ends where it began removes its step.
 */
export function recordEdit(h: History, e: { key: string; before: string; after: string; field: string | null; at: number }): History {
  if (e.before === e.after) return h
  const last = h.past[h.past.length - 1]
  if (last?.kind === 'edit' && last.open && e.field && last.field === e.field && last.key === e.key && e.at - last.at < TYPING_PAUSE_MS && last.after === e.before) {
    if (last.before === e.after) return { past: h.past.slice(0, -1), future: [] }
    return { past: [...h.past.slice(0, -1), { ...last, after: e.after, at: e.at }], future: [] }
  }
  return { past: [...h.past, { kind: 'edit' as const, ...e, open: !!e.field }].slice(-MAX_STEPS), future: [] }
}

/** Records a change of the slides themselves (insert, remove, move). */
export function record(h: History, step: Step): History {
  return { past: [...h.past, step].slice(-MAX_STEPS), future: [] }
}

/** Ends the open typing step (the field was left, the editor paged): the next edit is a step of its own. */
export function seal(h: History): History {
  const last = h.past[h.past.length - 1]
  if (last?.kind !== 'edit' || !last.open) return h
  return { ...h, past: [...h.past.slice(0, -1), { ...last, open: false }] }
}

/** The step undo takes back, and the history without it (the caller puts it on `future` once it is applied). */
export const lastStep = (h: History): Step | undefined => h.past[h.past.length - 1]
export const nextStep = (h: History): Step | undefined => h.future[h.future.length - 1]

/** After undo applied `step` (possibly with new keys): it moves to the redo side. */
export const undone = (h: History, step: Step): History => ({ past: h.past.slice(0, -1), future: [...h.future, step] })
/** After redo applied `step`: back on the undo side. */
export const redone = (h: History, step: Step): History => ({ past: [...h.past, step], future: h.future.slice(0, -1) })
/** A step that can no longer be applied (the slide was changed or removed elsewhere): dropped from the side it was on. */
export const dropUndo = (h: History): History => ({ ...h, past: h.past.slice(0, -1) })
export const dropRedo = (h: History): History => ({ ...h, future: h.future.slice(0, -1) })

/** The key a slide has after a step was undone or redone that gave it a new one (a removed slide put back). */
export function rekey(h: History, from: string, to: string): History {
  const swap = (s: Step): Step =>
    s.kind === 'edit' && s.key === from ? { ...s, key: to } : s.kind === 'move' && s.key === from ? { ...s, key: to } : s.kind === 'remove' && s.key === from ? { ...s, key: to } : s.kind === 'insert' && s.keys.includes(from) ? { ...s, keys: s.keys.map((k) => (k === from ? to : k)) } : s
  return { past: h.past.map(swap), future: h.future.map(swap) }
}
