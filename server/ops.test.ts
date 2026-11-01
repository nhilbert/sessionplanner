import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { Hub } from './hub.ts'
import { Ops } from './ops.ts'
import type { ServerEvent } from '../src/domain/ops.ts'

function setup() {
  const repo = new Repo(openDb(':memory:'))
  const hub = new Hub()
  const filesDir = mkdtempSync(path.join(tmpdir(), 'sp-mcp-'))
  const ops = new Ops(repo, { hub, filesDir, today: () => '2026-11-10' })
  return { repo, hub, ops, filesDir }
}

type View = ReturnType<Ops['workshopGet']>
type DayView = NonNullable<View['days']>[number]
type ItemView = { id: string; title: string; start?: string; end?: string; group?: string; day?: string; late?: boolean; gap?: number; overlap?: number }
const flat = (d: DayView): ItemView[] => (d.entries ?? []).flatMap((e) => ('group' in e ? e.items : [e]) as ItemView[])
const titles = (d: DayView) => flat(d).map((i) => i.title)

/** A one-day workshop with a morning agenda. */
function teamDay(ops: Ops) {
  const ws = ops.workshopCreate({ title: 'Teamtag', client: 'Beispiel GmbH', date: '2026-11-10', start: '09:00', end: '17:00' })
  ops.itemCreateMany(ws.id!, 1, [
    { title: 'Ankommen', kind: 'marker' },
    { title: 'Begrüßung', duration: 30, lead: 'N.', materials: [{ label: 'Flipchart', qty: 2 }] },
    { title: 'Erwartungen', duration: 60, method: 'Kartenabfrage', materials: [{ label: 'Moderationskarten', qty: 100 }, { label: 'Flipchart', qty: 1 }] },
    { title: 'Pause', kind: 'break', duration: 15 },
    { title: 'Rollen', duration: 90, category: 'discussion' },
  ])
  return ws.id!
}

describe('workshops and days', () => {
  it('creates a workshop with consecutive days and the given times', () => {
    const { ops } = setup()
    const ws = ops.workshopCreate({ title: 'Klausur', days: 2, start: '10:00', end: null, location: 'Bonn' })
    expect(ws.days?.map((d) => [d.date, d.start, d.end])).toEqual([
      ['2026-11-10', '10:00', undefined],
      ['2026-11-11', '10:00', undefined],
    ])
    expect(ws.location).toBe('Bonn')
    expect(ops.workshopList()).toMatchObject([{ title: 'Klausur', firstDate: '2026-11-10', lastDate: '2026-11-11', items: 0 }])
  })

  it('refuses dates that are not on the calendar, as the HTTP API does', () => {
    const { ops } = setup()
    expect(() => ops.workshopCreate({ title: 'Teamtag', date: '2026-02-30' })).toThrow(/date YYYY-MM-DD/)
    expect(() => ops.workshopCreate({ title: 'Teamtag', date: '2026-13-01' })).toThrow(/date YYYY-MM-DD/)
    expect(ops.workshopCreate({ title: 'Teamtag', date: '2028-02-29', days: 2 }).days?.map((d) => d.date)).toEqual(['2028-02-29', '2028-03-01'])
  })

  it('finds workshops by title, current before archived, and complains about ambiguity', () => {
    const { ops } = setup()
    const a = ops.workshopCreate({ title: 'Teamtag' })
    ops.workshopCreate({ title: 'Teamtag Vertrieb' })
    expect(ops.workshopGet('teamtag').id).toBe(a.id)
    expect(() => ops.workshopGet('team')).toThrow(/several workshops/)
    expect(() => ops.workshopGet('nope')).toThrow(/no workshop/)
    ops.workshopUpdate(a.id!, { archived: true })
    expect(ops.workshopList().map((w) => w.title)).toEqual(['Teamtag Vertrieb'])
    expect(ops.workshopList({ includeArchived: true })).toHaveLength(2)
  })

  it('updates details, appends notes, adds, changes and removes days (parking their items)', () => {
    const { ops } = setup()
    const id = teamDay(ops)
    ops.workshopUpdate(id, { notes: 'Vorab: Ziele klären', client: 'Beispiel AG' })
    const w = ops.workshopUpdate(id, { appendNotes: 'Nachtrag: Raum ab 8 Uhr' })
    expect(w.notes).toBe('Vorab: Ziele klären\n\nNachtrag: Raum ab 8 Uhr')
    expect(w.client).toBe('Beispiel AG')
    ops.dayAdd(id, { date: '2026-11-11' })
    const first = ops.dayAdd(id, { date: '2026-11-09', at: 0, start: '13:00' })
    expect(first.days?.map((d) => [d.day, d.date, d.start])).toEqual([
      [1, '2026-11-09', '13:00'],
      [2, '2026-11-10', '09:00'],
      [3, '2026-11-11', '09:00'],
    ])
    const changed = ops.dayUpdate(id, '2026-11-11', { end: null, start: '08:30' })
    expect(changed).toMatchObject({ date: '2026-11-11', start: '08:30' })
    expect(changed.end).toBeUndefined()
    const removed = ops.dayRemove(id, 2)
    expect(removed).toEqual({ removed: '2026-11-10', parkedItems: 5, days: ['2026-11-09', '2026-11-11'] })
    expect(ops.workshopGet(id).parkingLot?.map((e) => ('title' in e ? e.title : ''))).toEqual(['Ankommen', 'Begrüßung', 'Erwartungen', 'Pause', 'Rollen'])
  })
})

describe('items', () => {
  it('drafts an agenda in order with computed times and reports what does not fit', () => {
    const { ops, hub } = setup()
    const seen: ServerEvent[] = []
    const id = teamDay(ops)
    hub.subscribe(id, (e) => seen.push(e))
    const day = ops.workshopGet(id).days![0]
    expect(flat(day).map((i) => [i.title, i.start, i.end])).toEqual([
      ['Ankommen', '09:00', undefined],
      ['Begrüßung', '09:00', '09:30'],
      ['Erwartungen', '09:30', '10:30'],
      ['Pause', '10:30', '10:45'],
      ['Rollen', '10:45', '12:15'],
    ])
    expect(day).toMatchObject({ computedEnd: '12:15', workMinutes: 180, breakMinutes: 15, longestStretch: 90 })
    expect(day.warnings).toBeUndefined()
    const lunch = ops.itemCreate(id, 1, { title: 'Mittag', kind: 'break', duration: 60, fixedStart: '12:00' })
    expect(lunch).toMatchObject({ start: '12:00', end: '13:00', overlap: 15, day: '2026-11-10' })
    expect(lunch.dayWarnings).toEqual(['"Rollen" ends after the next fixed start or the target end', '"Mittag" (fixed 12:00): the items before run 15 min into it'])
    expect(seen.at(-1)).toMatchObject({ type: 'ops', clientId: 'mcp' })
    // shrinking the discussion resolves it; the category came by name
    const rollen = ops.itemUpdate(id, 'Rollen', { duration: 75 })
    expect(rollen).toMatchObject({ end: '12:00', category: 'discussion' })
    expect(rollen.dayWarnings).toBeUndefined()
    expect(() => ops.itemUpdate(id, 'Rollen', { category: 'Nonsense' })).toThrow(/no category/)
    expect(() => ops.itemCreate(id, 1, { title: 'x', fixedStart: '25:00' })).toThrow(/HH:mm/)
  })

  it('places items after a named entry and moves them between days, groups and the parking lot', () => {
    const { ops } = setup()
    const id = teamDay(ops)
    ops.itemCreate(id, 1, { title: 'Energizer', duration: 10, after: 'Pause' })
    ops.dayAdd(id, { date: '2026-11-11' })
    let [d1] = ops.workshopGet(id).days!
    expect(titles(d1)).toEqual(['Ankommen', 'Begrüßung', 'Erwartungen', 'Pause', 'Energizer', 'Rollen'])
    expect(ops.itemMove(id, 'Rollen', { day: 2 })).toMatchObject({ day: '2026-11-11', start: '09:00' })
    expect(ops.itemMove(id, 'Energizer', { day: null }).day).toBe('parking lot')
    ops.itemMove(id, 'Begrüßung', { at: 0 })
    ;[d1] = ops.workshopGet(id).days!
    expect(titles(d1)).toEqual(['Begrüßung', 'Ankommen', 'Erwartungen', 'Pause'])
    expect(ops.itemDelete(id, 'Energizer')).toEqual({ deleted: 'Energizer' })
    expect(() => ops.itemMove(id, 'Energizer', {})).toThrow(/no item/)
  })
})

describe('groups', () => {
  it('groups items where the first one stood, moves the group and ungroups in place', () => {
    const { ops } = setup()
    const id = teamDay(ops)
    const g = ops.groupCreate(id, 1, { title: 'Einstieg', items: ['Begrüßung', 'Erwartungen'] })
    expect(g.items?.map((i) => [i.title, i.start])).toEqual([
      ['Begrüßung', '09:00'],
      ['Erwartungen', '09:30'],
    ])
    let day = ops.workshopGet(id).days![0]
    expect(day.entries?.map((e) => ('group' in e ? `[${e.title}]` : e.title))).toEqual(['Ankommen', '[Einstieg]', 'Pause', 'Rollen'])
    expect(ops.itemMove(id, 'Rollen', { group: 'Einstieg' }).group).toBe('Einstieg')
    day = ops.workshopGet(id).days![0]
    expect(titles(day)).toEqual(['Ankommen', 'Begrüßung', 'Erwartungen', 'Rollen', 'Pause'])
    // the group goes to the parking lot and back, with its items
    expect(ops.groupUpdate(id, 'Einstieg', { day: null, title: 'Start' }).day).toBe('parking lot')
    expect(ops.workshopGet(id).parkingLot).toHaveLength(1)
    ops.groupUpdate(id, 'Start', { day: 1, at: 0 })
    day = ops.workshopGet(id).days![0]
    expect(titles(day)).toEqual(['Begrüßung', 'Erwartungen', 'Rollen', 'Ankommen', 'Pause'])
    expect(ops.groupDelete(id, 'Start')).toEqual({ deleted: 'Start', ungroupedItems: ['Begrüßung', 'Erwartungen', 'Rollen'] })
    day = ops.workshopGet(id).days![0]
    expect(titles(day)).toEqual(['Begrüßung', 'Erwartungen', 'Rollen', 'Ankommen', 'Pause'])
    expect(flat(day).every((i) => !i.group)).toBe(true)
  })
})

describe('packing list and library', () => {
  it('computes the list from placed items and takes ticks, overrides and workshop-wide material', () => {
    const { ops } = setup()
    const id = teamDay(ops)
    expect(ops.packingList(id).lines).toEqual([
      { label: 'Flipchart', qty: 2, items: ['Begrüßung', 'Erwartungen'] },
      { label: 'Moderationskarten', qty: 100, items: ['Erwartungen'] },
    ])
    const updated = ops.packingUpdate(id, { lines: [{ label: 'moderationskarten', qty: 250, checked: true }], add: [{ label: 'Beamer', link: 'https://example.com/beamer' }] })
    expect(updated.lines).toEqual([
      { label: 'Beamer', qty: 1, links: ['https://example.com/beamer'] },
      { label: 'Flipchart', qty: 2, items: ['Begrüßung', 'Erwartungen'] },
      { label: 'Moderationskarten', qty: 250, suggested: 100, checked: true, items: ['Erwartungen'] },
    ])
    expect(() => ops.packingUpdate(id, { lines: [{ label: 'Kekse', checked: true }] })).toThrow(/no line/)
    expect(ops.packingUpdate(id, { remove: ['Beamer'], lines: [{ label: 'Moderationskarten', qty: null }] }).lines.map((l) => [l.label, l.qty])).toEqual([
      ['Flipchart', 2],
      ['Moderationskarten', 100],
    ])
    ops.itemMove(id, 'Erwartungen', { day: null })
    expect(ops.packingList(id).lines.map((l) => l.label)).toEqual(['Flipchart'])
    // A parked step packs nothing, so its material is no line to tick; a step's material is not removed here but on the item.
    expect(() => ops.packingUpdate(id, { lines: [{ label: 'Moderationskarten', checked: true }] })).toThrow(/no line/)
    expect(() => ops.packingUpdate(id, { remove: ['Flipchart'] })).toThrow(/material of a step/)
    // Workshop-wide material that a step also needs: removing the workshop's entry keeps the line and its tick.
    ops.packingUpdate(id, { add: [{ label: 'Flipchart' }], lines: [{ label: 'Flipchart', checked: true }] })
    expect(ops.packingUpdate(id, { remove: ['Flipchart'] }).lines).toEqual([{ label: 'Flipchart', qty: 2, checked: true, items: ['Begrüßung'] }])
  })

  it('saves items and groups to the library and inserts copies', () => {
    const { ops, repo } = setup()
    const id = teamDay(ops)
    const saved = ops.librarySave(id, { item: 'Erwartungen' })
    expect(saved).toMatchObject({ kind: 'item', title: 'Erwartungen', item: { duration: 60, method: 'Kartenabfrage' } })
    ops.groupCreate(id, 1, { title: 'Einstieg', items: ['Begrüßung', 'Erwartungen'] })
    expect(ops.librarySave(id, { group: 'Einstieg', title: 'Standard-Einstieg' })).toMatchObject({ kind: 'group', items: [{ title: 'Begrüßung' }, { title: 'Erwartungen' }] })
    expect(ops.libraryList().map((e) => e.title)).toEqual(['Erwartungen', 'Standard-Einstieg'])
    const other = ops.workshopCreate({ title: 'Anderer Tag' })
    const inserted = ops.libraryInsert(other.id!, 'Standard-Einstieg', 1)
    expect(inserted.map((i) => [i.title, i.start, i.group])).toEqual([
      ['Begrüßung', '09:00', 'Standard-Einstieg'],
      ['Erwartungen', '09:30', 'Standard-Einstieg'],
    ])
    ops.libraryInsert(other.id!, 'Erwartungen', 1, { at: 0 })
    expect(titles(ops.workshopGet(other.id!).days![0])).toEqual(['Erwartungen', 'Begrüßung', 'Erwartungen'])
    // copies: the library entry stays as it was when the workshop changes
    ops.itemUpdate(other.id!, inserted[1].id!, { duration: 20 })
    expect(repo.listLibrary().find((e) => e.title === 'Erwartungen')).toMatchObject({ data: { duration: 60 } })
  })
})

describe('duplicate and settings', () => {
  it('copies a workshop with its files to a new first date', async () => {
    const { ops, repo, filesDir } = setup()
    const id = teamDay(ops)
    const att = repo.addAttachment(id, { id: 'f1', name: 'handout.pdf', mime: 'application/pdf', size: 7 })!
    writeFileSync(path.join(filesDir, att.id), 'handout')
    ops.itemUpdate(id, 'Rollen', { appendNotes: 'Handout verteilen' })
    const copy = await ops.workshopDuplicate(id, { title: 'Teamtag 2', firstDate: '2027-01-05' })
    expect(copy.days?.[0]).toMatchObject({ date: '2027-01-05', computedEnd: '12:15' })
    expect(copy.attachments).toMatchObject([{ name: 'handout.pdf' }])
    expect(readFileSync(path.join(filesDir, copy.attachments![0].id), 'utf8')).toBe('handout')
    expect(ops.workshopList().map((w) => w.title)).toEqual(['Teamtag 2', 'Teamtag'])
  })

  it('tells the agent the categories and default times', () => {
    const { ops } = setup()
    const s = ops.settingsGet()
    expect(s.categories.map((c) => c.id)).toContain('discussion')
    expect(s).toMatchObject({ dayStart: '09:00', dayEnd: '17:00' })
  })
})

describe('slides', () => {
  it('lists, sets, adds and removes slides of an item, with copies from the pool', () => {
    const { ops, repo } = setup()
    const id = teamDay(ops)
    expect(ops.slideList(id, 'Begrüßung').slides).toEqual([])
    const { slides: pool } = repo.createDeck({ title: 'Resilienz', theme: '', source: '', slides: [{ html: '<section class="slide statement"><div class="text"><p class="big">Stress entsteht.</p></div></section>', caption: 'Stress entsteht.' }] })
    ops.slideAdd(id, 'Begrüßung', { html: '<section class="slide list"><header><h2>Willkommen</h2></header><ul class="list"><li>a</li></ul><script>x()</script></section>' })
    const after = ops.slideAdd(id, 'Begrüßung', { pool: pool[0].id, at: 0 })
    expect(after.slides.map((s) => [s.n, s.layout, s.title])).toEqual([[1, 'statement', 'Stress entsteht.'], [2, 'list', 'Willkommen']])
    expect(ops.slideList(id, 'Begrüßung', { html: true }).slides[1].html).not.toContain('script')
    // Reorder by keeping, drop one, add markup.
    const set = ops.slideSet(id, 'Begrüßung', { slides: [{ keep: 2 }, { html: '<p>neu</p>' }] })
    expect(set.slides.map((s) => s.title)).toEqual(['Willkommen', 'neu'])
    expect(ops.slideRemove(id, 'Begrüßung', 1).slides.map((s) => s.title)).toEqual(['neu'])
    expect(() => ops.slideAdd(id, 'Ankommen', { html: '<p>x</p>' })).toThrow(/no slides/)
    expect(() => ops.slideAdd(id, 'Begrüßung', { pool: 'nope' })).toThrow(/pool/)
    const found = ops.poolSearch({ query: 'stress entsteht' })
    expect(found.total).toBe(1)
    expect(found.slides[0]).toMatchObject({ deck: 'Resilienz', layout: 'statement' })
    expect(ops.poolSearch({ query: 'nirgends' }).total).toBe(0)
    const outline = ops.deckOutline(id)
    expect(outline.deck.map((d) => d.generated ?? d.item)).toEqual(['title', 'agenda', 'Begrüßung', 'break'])
    expect(ops.workshopGet(id).days![0].entries!.some((e) => 'slides' in e && (e as { slides?: number }).slides === 1)).toBe(true)
  })
})
