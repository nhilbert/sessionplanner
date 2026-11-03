import { describe, expect, it } from 'vitest'
import { cjkCodePoints, deckOf, type DeckLabels } from './deck.ts'
import type { Item, WorkshopState } from './types.ts'

const labels: DeckLabels = { untitled: 'Ohne Titel', day: (n) => `Tag ${n}`, agenda: 'Agenda', breakTitle: 'Pause', until: (t) => `bis ${t}`, minutes: (n) => `${n} Minuten`, date: (d) => d }
const item = (id: string, over: Partial<Item>): Item => ({ id, workshopId: 'w', dayId: 'd1', position: 1, groupId: null, kind: 'block', title: id, description: '', duration: 30, fixedStart: null, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], slides: [], categoryId: null, color: null, ...over })
const state: WorkshopState = {
  workshop: { id: 'w', title: 'Teamtag <A&B>', client: 'Example Ltd', location: 'Bonn', goal: '', notes: '', timezone: 'Europe/Berlin', theme: '', packing: {}, materials: [], archived: false, createdAt: '', updatedAt: '' },
  days: [{ id: 'd1', workshopId: 'w', position: 1, date: '2026-11-10', startMin: 540, endMin: 1020 }],
  groups: [{ id: 'g', workshopId: 'w', dayId: 'd1', position: 2, title: 'Block A' }],
  items: [
    item('a', { position: 1, slides: [{ id: 's1', html: '<section class="slide list"><p>eins</p></section>' }, { id: 's2', html: '<section class="slide list"><p>zwei</p></section>' }] }),
    item('b', { position: 1, groupId: 'g', duration: 45 }),
    item('pause', { position: 3, kind: 'break', title: '', duration: 15 }),
    item('note', { position: 4, kind: 'note', duration: 0 }),
    item('parked', { dayId: null, slides: [{ id: 's3', html: '<p>x</p>' }] }),
  ],
  attachments: [],
}

describe('deckOf', () => {
  it('generates title, agenda and break slides around the items\' own, in agenda order, parked items left out', () => {
    const deck = deckOf(state, labels)
    expect(deck.map((s) => s.key)).toEqual(['title:d1', 'agenda:d1:0', 'a:s1', 'a:s2', 'break:pause'])
    expect(deck[0].html).toContain('<h1>Teamtag &lt;A&amp;B&gt;</h1>')
    expect(deck[0].html).toContain('2026-11-10')
    expect(deck[1].html).toContain('<span class="when">09:00</span><span>a</span>')
    expect(deck[1].html).toContain('<span class="when">09:30</span><span>Block A</span>')
    expect(deck[1].html).toContain('<span class="when">10:15</span><span class="break">Pause</span>')
    expect(deck[1].html).not.toContain('note')
    expect(deck[4].html).toContain('<h1>Pause</h1>')
    expect(deck[4].html).toContain('15 Minuten')
    expect(deck[4].html).toContain('bis 10:30')
    expect(deck[4].caption).toBe('Pause')
  })
  it('leaves out what is switched off, and a break with slides of its own uses them', () => {
    expect(deckOf(state, labels, { agenda: false, breaks: false }).map((s) => s.key)).toEqual(['title:d1', 'a:s1', 'a:s2'])
    const own = { ...state, items: state.items.map((i) => (i.id === 'pause' ? { ...i, slides: [{ id: 'p1', html: '<section class="slide break"><h1>Kaffee</h1></section>' }] } : i)) }
    expect(deckOf(own, labels).map((s) => s.key)).toEqual(['title:d1', 'agenda:d1:0', 'a:s1', 'a:s2', 'pause:p1'])
  })
  it('splits a long day over two agenda slides', () => {
    const many = { ...state, items: [...state.items, ...Array.from({ length: 12 }, (_, i) => item(`m${i}`, { position: 10 + i, duration: 10 }))] }
    const agendas = deckOf(many, labels, { agenda: true, breaks: false }).filter((s) => s.generated === 'agenda')
    expect(agendas.map((s) => s.caption)).toEqual(['Agenda 1/2', 'Agenda 2/2'])
    expect(agendas[0].html.match(/<li>/g)).toHaveLength(11)
    expect(agendas[1].html.match(/<li>/g)).toHaveLength(4)
  })
  it('names the days when there are several', () => {
    const two = { ...state, days: [...state.days, { id: 'd2', workshopId: 'w', position: 2, date: '2026-11-11', startMin: 540, endMin: null }] }
    const deck = deckOf(two, labels, { agenda: false, breaks: false })
    expect(deck.filter((s) => s.generated === 'title').map((s) => s.caption)).toEqual(['Tag 1', 'Tag 2'])
    expect(deck[deck.length - 1].html).toContain('Tag 2 · 2026-11-11')
  })
  it('finds the glyphs a standalone file must carry a font for', () => {
    expect([...cjkCodePoints('<div class="glyph">静<small>Ruhe</small></div>')]).toEqual(['静'.codePointAt(0)])
    expect(cjkCodePoints('<p>nur Text – „Zitat“</p>').size).toBe(0)
  })
})

describe('pictures from the pool', () => {
  const pool = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  it('gives the generated title, agenda and break slides a picture each, in turn from a place the workshop decides', () => {
    const deck = deckOf(state, labels, { agenda: true, breaks: true, pictures: true, shift: 0 }, pool)
    const pics = deck.filter((s) => s.generated).map((s) => /asset:([a-f]+)/.exec(s.html)?.[1]?.[0])
    expect(pics).toHaveLength(3)
    expect(new Set(pics).size).toBe(3)
    expect(deck[0].html).toMatch(/<\/div><figure><img src="asset:[a-f]{64}" alt=""><\/figure><\/section>$/)
    expect(deck[1].html).toContain('<div class="cols"><ol class="agenda">')
    // the same every time; a shift turns the rotation; another workshop starts elsewhere
    expect(deckOf(state, labels, undefined, pool).map((s) => s.html)).toEqual(deck.map((s) => s.html))
    const shifted = deckOf(state, labels, { agenda: true, breaks: true, pictures: true, shift: 1 }, pool).filter((s) => s.generated).map((s) => /asset:([a-f]+)/.exec(s.html)?.[1]?.[0])
    expect(shifted).toEqual([...pics.slice(1), pics[0]])
    const other = deckOf({ ...state, workshop: { ...state.workshop, id: 'w2' } }, labels, undefined, pool).filter((s) => s.generated).map((s) => /asset:([a-f]+)/.exec(s.html)?.[1]?.[0])
    expect(other).not.toEqual(pics)
    // off, or an empty pool: the slides as before
    expect(deckOf(state, labels, { agenda: true, breaks: true, pictures: false, shift: 0 }, pool).some((s) => s.html.includes('asset:'))).toBe(false)
    expect(deckOf(state, labels).some((s) => s.html.includes('asset:'))).toBe(false)
  })
})

describe('the section tracker', () => {
  const section = (id: string, title: string) => ({ id, html: `<section class="slide section"><div class="text"><h1>${title}</h1></div></section>` })
  const list = (id: string) => ({ id, html: '<section class="slide list"><p>x</p></section>' })
  it('numbers the parts from the first section slide on, once the deck has two sections', () => {
    const two: WorkshopState = { ...state, items: [item('a', { position: 1, slides: [list('s0'), section('s1', 'Eins'), list('s2')] }), item('b', { position: 2, slides: [section('s3', 'Zwei'), list('s4')] })] }
    const deck = deckOf(two, labels, { agenda: true, breaks: false, pictures: false, shift: 0 })
    expect(deck.map((s) => (s.part ? `${s.part.n}/${s.part.of}` : '-'))).toEqual(['-', '-', '-', '1/2', '1/2', '2/2', '2/2'])
    const one: WorkshopState = { ...state, items: [item('a', { position: 1, slides: [section('s1', 'Eins'), list('s2')] })] }
    expect(deckOf(one, labels).some((s) => s.part)).toBe(false)
  })
})
