import { describe, expect, it } from 'vitest'
import type { DeckSlideRef } from '@/domain/deck'
import type { PresentPosition } from '@/domain/ops'
import { createFollower, indexOf, type Spot } from './follower'

const deck: DeckSlideRef[] = ['title:d', 'a:1', 'a:2', 'b:1', 'b:2'].map((key) => ({ key, html: '', caption: '' }))

function window_(o: { lead?: boolean; canLead?: boolean; deck?: DeckSlideRef[]; start?: number } = {}) {
  let spot: Spot = { key: null, n: o.start ?? 1 }
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
    show: (s) => (spot = s),
    send: (p) => (sent.push(p), fail.on ? Promise.reject(new Error('offline')) : Promise.resolve()),
    broadcast: (s) => broadcast.push(s),
    later: (fn) => timers.push(fn),
  })
  return { f, sent, broadcast, fail, timers, state, at: () => indexOf(state.deck, spot) }
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
    expect(w.sent).toEqual([{ key: 'a:1', n: 2, tag: 't.1' }])
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
    expect(w.broadcast).toEqual([{ key: 'b:1', n: 4 }])
    w.fail.on = false
    w.f.news({ position: { key: 'title:d', n: 1, tag: 'x.1' }, hello: true })
    expect(w.at()).toBe(3)
    expect(w.sent.at(-1)).toMatchObject({ key: 'b:1', n: 4 })
  })

  it('follows a window of this browser that pages without the server', () => {
    const w = window_()
    w.f.local({ key: 'a:2', n: 3 })
    expect(w.at()).toBe(2)
  })

  it('as a view guest pages only the windows of this browser', () => {
    const w = window_({ canLead: false })
    w.f.go(2)
    expect(w.sent).toEqual([])
    expect(w.broadcast).toEqual([{ key: 'a:2', n: 3 }])
  })
})
