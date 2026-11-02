import { describe, expect, it } from 'vitest'
import { EMPTY_HISTORY, lastStep, record, recordEdit, redone, rekey, seal, TYPING_PAUSE_MS, undone } from './history'

const edit = (before: string, after: string, at: number, field: string | null = 'f-title', key = 'a') => ({ key, before, after, field, at })

describe('slide editor history', () => {
  it('joins typing in one field into one step, and starts a new one after a pause, another field or leaving', () => {
    let h = recordEdit(EMPTY_HISTORY, edit('A', 'AB', 0))
    h = recordEdit(h, edit('AB', 'ABC', 500))
    expect(h.past).toHaveLength(1)
    expect(h.past[0]).toMatchObject({ before: 'A', after: 'ABC' })
    h = recordEdit(h, edit('ABC', 'ABCD', 500 + TYPING_PAUSE_MS + 1))
    expect(h.past).toHaveLength(2)
    h = recordEdit(h, edit('ABCD', 'ABCDE', 2100, 'f-lead'))
    expect(h.past).toHaveLength(3)
    h = seal(h)
    h = recordEdit(h, edit('ABCDE', 'ABCDEF', 2200, 'f-lead'))
    expect(h.past).toHaveLength(4)
  })
  it('does not join clicks (no field) and drops edits that change nothing', () => {
    let h = recordEdit(EMPTY_HISTORY, edit('A', 'B', 0, null))
    h = recordEdit(h, edit('B', 'C', 10, null))
    expect(h.past).toHaveLength(2)
    expect(recordEdit(h, edit('C', 'C', 20))).toBe(h)
  })
  it('removes a typing step that ends where it began', () => {
    let h = recordEdit(EMPTY_HISTORY, edit('A', 'AB', 0))
    h = recordEdit(h, edit('AB', 'A', 100))
    expect(h.past).toHaveLength(0)
  })
  it('moves steps between undo and redo and clears redo on a new step', () => {
    let h = recordEdit(EMPTY_HISTORY, edit('A', 'B', 0, null))
    const step = lastStep(h)!
    h = undone(h, step)
    expect(h).toEqual({ past: [], future: [step] })
    h = redone(h, step)
    expect(h).toEqual({ past: [step], future: [] })
    h = undone(h, step)
    h = record(h, { kind: 'move', key: 'a', from: 0, to: 1 })
    expect(h.future).toEqual([])
  })
  it('follows a slide that got a new key', () => {
    let h = record(EMPTY_HISTORY, { kind: 'remove', group: 'g', at: 0, key: 'old', html: '<x>' })
    h = recordEdit(h, edit('1', '2', 0, null, 'old'))
    h = rekey(h, 'old', 'new')
    expect(h.past.map((s) => ('key' in s ? s.key : ''))).toEqual(['new', 'new'])
  })
})
