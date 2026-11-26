import { describe, expect, it } from 'vitest'
import type { DeckSlideRef } from '@/domain/deck'
import type { PresentPosition } from '@/domain/ops'
import { createFollower, indexOf, type Spot, WHOLE } from './follower'

const deck: DeckSlideRef[] = ['title:d', 'a:1', 'a:2', 'b:1', 'b:2'].map((key) => ({ key, html: '', caption: '' }))

function window_(o: { lead?: boolean; canLead?: boolean; deck?: DeckSlideRef[]; start?: number } = {}) {
  let spot: Spot = { key: null, n: o.start ?? 1, stage: 0 }
  const state = { deck: o.deck ?? deck }
  const sent: PresentPosition[] = []
  const broadcast: Spot[] = []
  const fail = { on: false }
  const timers: (() => void)[] = []
  const f = createFollower({
    tab: 't',
    lead: o.lead ?? false,
    canLead: () => o.canLead ?? true,
    deck: () => state.deck,
    at: () => indexOf(state.deck, spot),
    stage: () => spot.stage,
    show: (s) => (spot = s),
    send: (p) => (sent.push(p), fail.on ? Promise.reject(new Error('offline')) : Promise.resolve()),
    broadcast: (s) => broadcast.push(s),
    later: (fn) => timers.push(fn),
  })
  return { f, sent, broadcast, fail, timers, state, at: () => indexOf(state.deck, spot), stage: () => spot.stage }
}
const pos = (key: string, n: number, tag = 'other.1') => ({ position: { key, n, tag }, hello: false })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('a presentation window', () => {
  it('joins where the presentation stands', () => {
    const w = window_({ start: 1 })
    w.f.news({ position: { key: 'b:1', n: 4, tag: 'x.3' }, hello: true })
    expect(w.at()).toBe(3)
    expect(w.sent).toEqual([])
  })

  it('claims the position when no presentation runs, once the deck is there', () => {
    const w = window_({ start: 2, deck: [] })
    w.f.news({ position: null, hello: true })
    expect(w.sent).toEqual([])
    w.state.deck = deck
    w.f.ready()
    expect(w.sent).toEqual([{ key: 'a:1', n: 2, tag: 't.1', stage: 0 }])
  })

  it('leads from its slide when opened to present from there', () => {
    const w = window_({ start: 3, lead: true })
    w.f.news({ position: { key: 'b:2', n: 5, tag: 'x.9' }, hello: true })
    expect(w.at()).toBe(2)
    expect(w.sent.map((p) => p.key)).toEqual(['a:2'])
  })

  it('ignores news from before its own paging, and follows once its echo is through', () => {
    const w = window_()
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    w.f.go(1)
    w.f.go(2)
    // its first paging comes back, then another window's that the server took before the second
    w.f.news(pos('a:1', 2, 't.1'))
    w.f.news(pos('b:2', 5, 'x.2'))
    expect(w.at()).toBe(2)
    w.f.news(pos('a:2', 3, 't.2'))
    expect(w.at()).toBe(2)
    // nothing on its way any more: the next window's paging leads
    w.f.news(pos('b:1', 4, 'x.3'))
    expect(w.at()).toBe(3)
  })

  it('follows others again when its echo never comes', () => {
    const w = window_()
    w.f.news({ position: null, hello: false })
    w.f.go(1)
    w.f.news(pos('b:1', 4))
    expect(w.at()).toBe(1)
    w.timers.forEach((fn) => fn())
    w.f.news(pos('b:2', 5))
    expect(w.at()).toBe(4)
  })

  it('keeps to the slide by its key when slides are added before it, and by number when it is gone', () => {
    expect(indexOf(deck, { key: 'b:1', n: 4 })).toBe(3)
    expect(indexOf([{ key: 'new', html: '', caption: '' }, ...deck], { key: 'b:1', n: 4 })).toBe(4)
    expect(indexOf(deck, { key: 'gone', n: 2 })).toBe(1)
    expect(indexOf(deck, { key: null, n: 99 })).toBe(4)
  })

  it('without the server pages the windows of this browser, and tells the server where it stands when back', async () => {
    const w = window_()
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    w.fail.on = true
    w.f.go(3)
    await flush()
    expect(w.broadcast).toEqual([{ key: 'b:1', n: 4, stage: 0 }])
    w.fail.on = false
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    expect(w.at()).toBe(3)
    expect(w.sent.at(-1)).toMatchObject({ key: 'b:1', n: 4 })
  })

  it('follows a window of this browser that pages without the server', () => {
    const w = window_()
    w.f.local({ key: 'a:2', n: 3, stage: 2 })
    expect(w.at()).toBe(2)
    expect(w.stage()).toBe(2)
  })

  it('as a view guest pages only the windows of this browser', () => {
    const w = window_({ canLead: false })
    w.f.go(2)
    expect(w.sent).toEqual([])
    expect(w.broadcast).toEqual([{ key: 'a:2', n: 3, stage: 0 }])
  })
})

describe('a slide that builds', () => {
  it('is paged to a stage, and a slide comes on at its first', () => {
    const w = window_()
    w.f.news({ position: null, hello: false })
    w.f.go(1, 2)
    expect(w.at()).toBe(1)
    expect(w.stage()).toBe(2)
    expect(w.sent.at(-1)).toEqual({ key: 'a:1', n: 2, tag: 't.1', stage: 2 })
    w.f.go(2)
    expect(w.stage()).toBe(0)
    // the stage always goes along, so a window that follows can tell this window from one that knows no builds
    expect(w.sent.at(-1)).toEqual({ key: 'a:2', n: 3, tag: 't.2', stage: 0 })
  })

  it('is followed to the stage another window paged to, and joined at the stage the presentation stands at', () => {
    const w = window_()
    w.f.news({ position: { key: 'a:1', n: 2, tag: 'x.1', stage: 3 }, hello: true })
    expect([w.at(), w.stage()]).toEqual([1, 3])
    w.f.news({ position: { key: 'a:1', n: 2, tag: 'x.2', stage: 4 }, hello: false })
    expect(w.stage()).toBe(4)
    w.f.news({ position: { key: 'a:2', n: 3, tag: 'x.3', stage: 0 }, hello: false })
    expect([w.at(), w.stage()]).toEqual([2, 0])
  })

  it('shows a slide whole when a window from before the builds pages to it (a tab left open over an update)', () => {
    const w = window_()
    w.f.news({ position: { key: 'a:1', n: 2, tag: 'old.1' }, hello: true })
    expect(w.at()).toBe(1)
    expect(w.stage()).toBe(WHOLE)
    w.f.news(pos('a:2', 3, 'old.2'))
    expect(w.stage()).toBe(WHOLE)
  })

  it('keeps its stage when it tells the server where it stands after paging without it', async () => {
    const w = window_()
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    w.fail.on = true
    w.f.go(3, 2)
    await flush()
    expect(w.broadcast).toEqual([{ key: 'b:1', n: 4, stage: 2 }])
    w.fail.on = false
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    expect(w.sent.at(-1)).toMatchObject({ key: 'b:1', n: 4, stage: 2 })
  })
})

describe('the deck a presentation runs with', () => {
  const own = { agenda: true, breaks: true, groups: false, pictures: true, shift: 0 }
  const theirs = { agenda: false, breaks: true, groups: false, pictures: true, shift: 0 }

  it('is named by the window that pages, and taken over by the windows that follow', () => {
    let shared: typeof own | undefined
    const sent: PresentPosition[] = []
    let spot: Spot = { key: null, n: 1, stage: 0 }
    const f = createFollower({
      tab: 't', lead: false, canLead: () => true, deck: () => deck, at: () => indexOf(deck, spot), stage: () => spot.stage,
      options: () => shared ?? own,
      show: (s) => { spot = s; if (s.deck) shared = s.deck },
      send: (p) => (sent.push(p), Promise.resolve()), broadcast: () => undefined, later: () => undefined,
    })
    // nobody presents yet: this window starts with its own
    f.news({ position: null, hello: true })
    expect(sent.at(-1)?.deck).toEqual(own)
    // another window's presentation, with other options: followed, and paged on with theirs
    f.news({ position: { key: 'a:1', n: 2, tag: 'x.1', stage: 0, deck: theirs }, hello: false })
    // (its own claim is still on its way: the echo first)
    f.news({ position: { key: 'title:d', n: 1, tag: 't.1', stage: 0, deck: own }, hello: false })
    f.news({ position: { key: 'a:1', n: 2, tag: 'x.2', stage: 0, deck: theirs }, hello: false })
    expect(shared).toEqual(theirs)
    f.go(2)
    expect(sent.at(-1)).toMatchObject({ key: 'a:2', deck: theirs })
  })
})
