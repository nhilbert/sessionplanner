import { describe, expect, it } from 'vitest'
import type { Category, ItemContent, LibraryAttachment, LibraryEntry, Slide, Worksheet } from './types.ts'
import { facetCounts, filterCount, GROUPS, holdsOf, minutesOf, neighbours, NO_CATEGORY, NO_FILTER, passes, sectionOf, sectionsOf } from './libraryView.ts'

const categories: Category[] = [
  { id: 'input', name: '', color: 'slate' },
  { id: 'exercise', name: '', color: 'sage' },
]

const content = (fields: Partial<ItemContent> = {}): ItemContent => ({ kind: 'block', title: '', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], printRules: {}, slides: [], worksheets: [], categoryId: null, color: null, ...fields })
const slide = (id: string): Slide => ({ id, html: '<section class="slide"></section>' })
const sheet = (id: string) => ({ id, title: id, pages: [] }) as unknown as Worksheet
const file = (id: string) => ({ id, entryId: 'e', name: `${id}.pdf`, size: 1 }) as unknown as LibraryAttachment
const base = { tags: [] as string[], attachments: [] as LibraryAttachment[], createdAt: '', updatedAt: '' }
const item = (id: string, fields: Partial<ItemContent> = {}, more: Partial<typeof base> = {}): LibraryEntry => ({ ...base, ...more, id, kind: 'item', title: id, data: content({ title: id, ...fields }) })
const group = (id: string, items: ItemContent[], more: Partial<typeof base> = {}): LibraryEntry => ({ ...base, ...more, id, kind: 'group', title: id, data: { items } })

const iceberg = item('Eisberg', { categoryId: 'input', duration: 20, slides: [slide('s1'), slide('s2')], worksheets: [sheet('w1')] }, { tags: ['Modell', 'Kommunikation'] })
const clock = item('Teamuhr', { categoryId: 'input', duration: 15, slides: [slide('s3')] }, { tags: ['Modell'] })
const listening = item('Zuhören', { categoryId: 'exercise', duration: 45, worksheets: [sheet('w2')] }, { tags: ['Kommunikation'], attachments: [file('f1')] })
const flash = item('Blitzlicht', { duration: 10 })
const gone = item('Alt', { categoryId: 'deleted', duration: 5 })
const start = group('Einstieg', [content({ kind: 'marker', duration: 0 }), content({ categoryId: 'input', duration: 15, slides: [slide('s4')] }), content({ kind: 'break', duration: 10 })])
const all = [flash, iceberg, start, clock, listening, gone]

describe('the sections of the library', () => {
  it('puts an item under its category, one without (or with a deleted one) apart, and the groups last', () => {
    expect(sectionOf(iceberg, categories)).toBe('input')
    expect(sectionOf(flash, categories)).toBe(NO_CATEGORY)
    expect(sectionOf(gone, categories)).toBe(NO_CATEGORY)
    expect(sectionOf(start, categories)).toBe(GROUPS)
  })

  it('orders the sections as the settings order the categories and keeps the entries as they come', () => {
    expect(sectionsOf(all, categories).map((s) => [s.key, s.entries.map((e) => e.id), s.minutes])).toEqual([
      ['input', ['Eisberg', 'Teamuhr'], 35],
      ['exercise', ['Zuhören'], 45],
      [NO_CATEGORY, ['Blitzlicht', 'Alt'], 15],
      [GROUPS, ['Einstieg'], 25],
    ])
  })

  it('leaves out a section without entries', () => {
    expect(sectionsOf([listening], categories).map((s) => s.key)).toEqual(['exercise'])
  })

  it('counts what an entry holds over all its items, and its minutes without markers', () => {
    expect(holdsOf(iceberg)).toEqual({ slides: 2, sheets: 1, files: 0 })
    expect(holdsOf(listening)).toEqual({ slides: 0, sheets: 1, files: 1 })
    expect(holdsOf(start)).toEqual({ slides: 1, sheets: 0, files: 0 })
    expect(minutesOf(start)).toBe(25)
  })
})

describe('the filters of the library', () => {
  const ids = (filter: Partial<typeof NO_FILTER>) => all.filter((e) => passes(e, { ...NO_FILTER, ...filter }, categories)).map((e) => e.id)

  it('shows everything while nothing is chosen', () => {
    expect(ids({})).toHaveLength(all.length)
    expect(filterCount(NO_FILTER)).toBe(0)
  })

  it('widens within the sections', () => {
    expect(ids({ sections: ['input', GROUPS] })).toEqual(['Eisberg', 'Einstieg', 'Teamuhr'])
    expect(ids({ sections: [GROUPS] })).toEqual(['Einstieg'])
  })

  it('narrows by what an entry holds and by its tags: all of them', () => {
    expect(ids({ holds: ['slides'] })).toEqual(['Eisberg', 'Einstieg', 'Teamuhr'])
    expect(ids({ holds: ['slides', 'sheets'] })).toEqual(['Eisberg'])
    expect(ids({ tags: ['modell', 'Kommunikation'] })).toEqual(['Eisberg'])
  })

  it('combines the facets: a section and what it has to hold', () => {
    expect(ids({ sections: ['input'], holds: ['sheets'] })).toEqual(['Eisberg'])
    expect(ids({ sections: [GROUPS], holds: ['sheets'] })).toEqual([])
  })

  it('counts beside a section what the other filters leave of it, whatever sections are chosen', () => {
    const counts = facetCounts(all, { ...NO_FILTER, sections: ['exercise'], holds: ['sheets'] }, categories)
    expect(counts.sections).toEqual({ input: 1, exercise: 1 })
  })

  it('counts beside a kind of content what is left of the result with it', () => {
    const counts = facetCounts(all, { ...NO_FILTER, sections: ['input'] }, categories)
    expect(counts.holds).toEqual({ slides: 2, sheets: 1, files: 0 })
  })
})

describe('paging through a section', () => {
  it('names the entry before and after within the same section', () => {
    expect(neighbours(all, 'Teamuhr', categories)).toMatchObject({ index: 1, total: 2, section: 'input', previous: iceberg, next: null })
    expect(neighbours(all, 'Eisberg', categories)).toMatchObject({ index: 0, previous: null, next: clock })
  })

  it('knows nothing about an entry that is gone', () => {
    expect(neighbours(all, 'weg', categories)).toBeNull()
  })
})
