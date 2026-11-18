import { describe, expect, it } from 'vitest'
import { fromLibrary, withFilesOf } from './copy.ts'
import { workshopPacking } from './packing.ts'
import { copiesOf, copyPrinted, jobLabel, jobTitle, mapRules, needsParticipants, packageFileName, printKeys, printLines, printListMarkdown, printWords, rulesOfLinked, sheetJobs, withRule } from './printing.ts'
import type { Item, ItemContent, LibraryEntry, PrintRule, Worksheet, WorkshopState } from './types.ts'

const rule = (mode: PrintRule['mode'], over: Partial<PrintRule> = {}): PrintRule => ({ mode, paper: 'A4', duplex: false, ...over })

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  workshopId: 'w',
  dayId: 'd1',
  position: 1,
  groupId: null,
  kind: 'block',
  title: id,
  description: '',
  duration: 30,
  fixedStart: null,
  goal: '',
  method: '',
  lead: '',
  notes: '',
  materials: [],
  attachmentIds: [],
  printRules: {},
  groups: 1,
  slides: [],
  worksheets: [],
  categoryId: null,
  color: null,
  ...over,
})

const file = (id: string, name: string) => ({ id, workshopId: 'w', name, mime: 'application/pdf', size: 10, createdAt: '' })

const state = (items: Item[], participants: number | null = 12): WorkshopState => ({
  workshop: { id: 'w', title: 'Teamtag', client: '', location: '', goal: '', notes: '', timezone: 'Europe/Berlin', theme: '', packing: {}, pictures: {}, materials: [], participants, archived: false, createdAt: '', updatedAt: '' },
  days: [{ id: 'd1', workshopId: 'w', position: 1, date: '2026-12-01', startMin: 540, endMin: null }],
  groups: [],
  items,
  attachments: [file('f1', 'Handout.pdf'), file('f2', 'Reflexion.pdf'), file('f3', 'Bild.png'), file('f4', 'Poster.pdf')],
})

describe('copies of a print rule', () => {
  it('counts per person, per group, once and a number', () => {
    expect(copiesOf(rule('person'), 14, 3)).toBe(14)
    expect(copiesOf(rule('group'), 14, 3)).toBe(3)
    expect(copiesOf(rule('once'), 14, 3)).toBe(1)
    expect(copiesOf(rule('count', { count: 5 }), 14, 3)).toBe(5)
    expect(copiesOf(rule('off'), 14, 3)).toBe(0)
  })
  it('needs the participants only per person', () => {
    expect(copiesOf(rule('person'), null, 1)).toBeNull()
    expect(copiesOf(rule('group'), null, 2)).toBe(2)
  })
})

describe('rules on a step', () => {
  it('keeps no record of a rule that prints nothing on A4 one-sided', () => {
    expect(withRule({ f1: rule('once') }, 'f1', rule('off'))).toEqual({})
    expect(withRule({}, 'f1', rule('off', { paper: 'A3' }))).toEqual({ f1: rule('off', { paper: 'A3' }) })
  })
  it('keeps a count only where the mode is count', () => {
    expect(withRule({}, 'f1', { ...rule('person'), count: 9 })).toEqual({ f1: rule('person') })
    expect(withRule({}, 'f1', rule('count'))).toEqual({ f1: rule('count', { count: 1 }) })
  })
  it('maps rules to new file ids and drops those whose file did not come along', () => {
    expect(mapRules({ a: rule('once'), b: rule('person') }, (id) => ({ a: 'x' })[id])).toEqual({ x: rule('once') })
    expect(rulesOfLinked({ a: rule('once'), b: rule('person') }, ['b'])).toEqual({ b: rule('person') })
  })
})

describe('print lines', () => {
  const items = [
    item('Einstieg', { position: 1, attachmentIds: ['f1', 'f3'], printRules: { f1: rule('person'), f3: rule('once') } }),
    item('Gruppenarbeit', { position: 2, attachmentIds: ['f2'], groups: 3, printRules: { f2: rule('group', { paper: 'A3', duplex: true }) } }),
    item('Geparkt', { dayId: null, attachmentIds: ['f4'], printRules: { f4: rule('once') } }),
    item('Notiz', { kind: 'note', position: 3, attachmentIds: ['f4'], printRules: { f4: rule('once') } }),
  ]

  it('takes PDFs of placed steps in agenda order, with the reserve on each job', () => {
    const lines = printLines(state(items), { reserve: 2 })
    expect(lines.map((l) => [l.itemTitle, l.name, l.copies, l.job])).toEqual([
      ['Einstieg', 'Handout.pdf', 12, { copies: 14, paper: 'A4', duplex: false }],
      ['Gruppenarbeit', 'Reflexion.pdf', 3, { copies: 5, paper: 'A3', duplex: true }],
    ])
  })

  it('asks for participants when a rule is per person and none are set', () => {
    expect(needsParticipants(state(items, null))).toBe(true)
    expect(needsParticipants(state(items, 8))).toBe(false)
    expect(needsParticipants(state([items[1]], null))).toBe(false)
    expect(printLines(state(items, null), { participants: 20 })[0].copies).toBe(20)
  })

  it('names the files after their job', () => {
    const w = printWords('de')
    const [first, second] = printLines(state(items))
    expect(packageFileName(first, w)).toBe('12x A4 einseitig – Handout.pdf')
    expect(packageFileName(second, w)).toBe('3x A3 doppelseitig – Reflexion.pdf')
    expect(jobLabel({ copies: 30, paper: 'A4', duplex: false }, printWords('en'))).toBe('30x A4 single-sided')
  })

  it('writes the print list', () => {
    const md = printListMarkdown(state(items), printLines(state(items), { reserve: 1 }), printWords('de'), 1)
    expect(md).toContain('# Druckliste – Teamtag')
    expect(md).toContain('Jeder Auftrag mit 1 Reserve.')
    expect(md).toContain('| Handout.pdf | Datei | Einstieg | pro Person | 12 | 13x A4 einseitig |')
    expect(md).toContain('| Reflexion.pdf | Datei | Gruppenarbeit | pro Gruppe (3) | 3 | 4x A3 doppelseitig |')
    expect(md).not.toContain('nicht im Paket')
  })

  it('puts the sheets into the packing list, the same file once with its larger count', () => {
    const twice = [...items, item('Transfer', { position: 4, attachmentIds: ['f1'], printRules: { f1: rule('count', { count: 30 }) } })]
    const lines = workshopPacking(state(twice)).filter((l) => l.sheet)
    expect(lines.map((l) => [l.label, l.qty, l.itemIds])).toEqual([
      ['Handout.pdf', 30, ['Einstieg', 'Transfer']],
      ['Reflexion.pdf', 3, ['Gruppenarbeit']],
    ])
    expect(workshopPacking(state(items, null)).find((l) => l.label === 'Handout.pdf')?.unknown).toBe(true)
  })
})

describe('rules travel with copies', () => {
  const content = (over: Partial<ItemContent> = {}): ItemContent => ({ kind: 'block', title: 'A', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], printRules: {}, slides: [], worksheets: [], categoryId: null, color: null, ...over })
  const entry = (data: ItemContent): LibraryEntry => ({ id: 'e', kind: 'item', title: 'A', data, tags: [], attachments: [], createdAt: '', updatedAt: '' })

  it('inserting a library entry maps the rules to the workshop copies, groups start at 1', () => {
    const { items } = fromLibrary(entry(content({ attachmentIds: ['l1', 'l2'], printRules: { l1: rule('person'), l2: rule('once') } })), 'w', 'd1', null, 1, { l1: 'w1' })
    expect(items[0].attachmentIds).toEqual(['w1'])
    expect(items[0].printRules).toEqual({ w1: rule('person') })
    expect(items[0].groups).toBe(1)
  })

  it('a saved entry keeps the rule of a file that was added to it meanwhile', () => {
    const stored = entry(content({ attachmentIds: ['l1', 'l2'], printRules: { l2: rule('once') } }))
    const saved = withFilesOf({ kind: 'item', data: content({ attachmentIds: ['l1'], printRules: { l1: rule('person') } }) }, stored)
    expect((saved.data as ItemContent).printRules).toEqual({ l1: rule('person'), l2: rule('once') })
  })
})

describe('worksheets in print', () => {
  const ws = (id: string, title: string, paper: Worksheet['paper'] = 'A4', pages = 1): Worksheet => ({ id, title, paper, updatedAt: '2026-11-18T10:00:00.000Z', pages: Array.from({ length: pages }, (_, i) => ({ id: `${id}p${i}`, html: '<section class="sheet"></section>' })) })
  const items = [
    item('Einstieg', { position: 1, attachmentIds: ['f1'], printRules: { f1: rule('person'), s1: rule('person', { paper: 'A3', duplex: true }) }, worksheets: [ws('s1', 'Mein Tag', 'A4', 3)] }),
    item('Rückblick', { position: 2, groups: 4, printRules: { s2: rule('person', { duplex: true }), s3: rule('group') }, worksheets: [ws('s2', 'Transfer'), ws('s3', 'Plakat', 'A3')] }),
    item('Geparkt', { dayId: null, printRules: { s4: rule('once') }, worksheets: [ws('s4', 'Nie')] }),
  ]

  it('prints sheets with their own paper after the step\'s files, parked steps not', () => {
    const lines = printLines(state(items), { reserve: 1 })
    expect(lines.map((l) => [l.kind, l.name, l.job])).toEqual([
      ['file', 'Handout.pdf', { copies: 13, paper: 'A4', duplex: false }],
      // the rule says A3, the sheet is A4: the sheet's paper wins
      ['sheet', 'Mein Tag', { copies: 13, paper: 'A4', duplex: true }],
      ['sheet', 'Transfer', { copies: 13, paper: 'A4', duplex: true }],
      ['sheet', 'Plakat', { copies: 5, paper: 'A3', duplex: false }],
    ])
  })

  it('groups the sheets by job, in agenda order, with the job as the print view\'s title', () => {
    const jobs = sheetJobs(printLines(state(items)))
    expect(jobs.map((j) => [j.key, j.lines.map((l) => l.name)])).toEqual([
      ['12-A4-2', ['Mein Tag', 'Transfer']],
      ['4-A3-1', ['Plakat']],
    ])
    expect(jobTitle(jobs[0].job, 'Teamtag', printWords('de'))).toBe('12x A4 doppelseitig – Teamtag')
  })

  it('lists sheets in the print list as not in the package', () => {
    const md = printListMarkdown(state(items), printLines(state(items)), printWords('de'))
    expect(md).toContain('nicht im Paket')
    expect(md).toContain('| Mein Tag | Arbeitsblatt | Einstieg | pro Person | 12 | 12x A4 doppelseitig |')
  })

  it('copies sheets with new ids and keys their rules anew; files follow the map', () => {
    let n = 0
    const copied = copyPrinted({ worksheets: [ws('s1', 'A')], printRules: { s1: rule('once'), f1: rule('person'), gone: rule('once') } }, (id) => ({ f1: 'g1' })[id], () => `new${++n}`)
    expect(copied.worksheets[0].id).toBe('new1')
    expect(copied.worksheets[0].pages[0].id).toBe('new2')
    expect(copied.printRules).toEqual({ new1: rule('once'), g1: rule('person') })
  })

  it('keeps a sheet\'s rule when a file is unlinked', () => {
    expect(rulesOfLinked({ s1: rule('once'), f1: rule('once') }, printKeys({ attachmentIds: [], worksheets: [ws('s1', 'A')] }))).toEqual({ s1: rule('once') })
  })
})
