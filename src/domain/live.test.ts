import { describe, expect, it } from 'vitest'
import type { DeckSlideRef } from './deck.ts'
import { breakLine, liveSchedule, MINUTE, minutesLeft, momentAt, slideOf, started, withEnd, withLiveBreak, withMinutes, type BreakLabels, type LiveTimes } from './live.ts'
import type { TimedItem } from './time.ts'

const TZ = 'Europe/Berlin'
// 2026-11-24 in Berlin (UTC+1): the clock time hh:mm is the moment hh-1:mm UTC.
const at = (hhmm: string) => Date.parse(`2026-11-24T${String(Number(hhmm.slice(0, 2)) - 1).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const day = { date: '2026-11-24', startMin: 9 * 60, endMin: 17 * 60 }
const block = (id: string, duration: number, fixedStart: number | null = null): TimedItem => ({ id, kind: 'block', duration, fixedStart })
const brk = (id: string, duration: number, fixedStart: number | null = null): TimedItem => ({ id, kind: 'break', duration, fixedStart })
// 9:00 a (90) · 10:30 coffee (15) · 10:45 b (60) · 11:45 c (45) · 12:30 lunch fixed (60)
const items = [block('a', 90), brk('coffee', 15), block('b', 60), block('c', 45), brk('lunch', 60, 750)]
const labels: BreakLabels = { minutes: (n) => `${n} Minuten`, left: (n) => `noch ${n} Minuten`, until: (t) => `bis ${t}`, over: 'Es geht weiter' }

describe('setting a break live', () => {
  it('keeps a length until the break begins, then counts it from its start', () => {
    expect(withMinutes(undefined, 20)).toEqual({ from: null, until: null, minutes: 20 })
    const began = started(withMinutes(undefined, 20), at('11:12'))
    expect(began).toEqual({ from: at('11:12'), until: at('11:32'), minutes: null })
    expect(withMinutes(began, 25)).toEqual({ from: at('11:12'), until: at('11:37'), minutes: null })
  })

  it('takes an end as it is and learns the start when the slide goes on screen', () => {
    const end = withEnd(withMinutes(undefined, 20), at('11:30'))
    expect(end).toEqual({ from: null, until: at('11:30'), minutes: null })
    expect(started(end, at('11:12'))).toEqual({ from: at('11:12'), until: at('11:30'), minutes: null })
    // shown only after the end: the break began at its end
    expect(started(end, at('11:40')).from).toBe(at('11:30'))
    expect(started(started(end, at('11:12')), at('11:20')).from).toBe(at('11:12'))
  })

  it('knows the slides of a break: the generated one and its own', () => {
    expect(slideOf('break:coffee', 'coffee')).toBe(true)
    expect(slideOf('coffee:s1', 'coffee')).toBe(true)
    expect(slideOf('agenda:d1:0', 'coffee')).toBe(false)
    expect(slideOf('coffee2:s1', 'coffee')).toBe(false)
  })

  it('turns a clock time of today into a moment, and counts the minutes left rounded up', () => {
    const now = at('11:12') + 25_000
    expect(momentAt(now, 11 * 60 + 12, 11 * 60 + 30)).toBe(at('11:30'))
    expect(minutesLeft(at('11:30'), now)).toBe(18)
    expect(minutesLeft(at('11:30'), at('11:29') + 59_000)).toBe(1)
    expect(minutesLeft(at('11:30'), at('11:30'))).toBe(0)
  })
})

describe('the re-forecast', () => {
  it('is the plan without live times', () => {
    const s = liveSchedule(day, items, {}, TZ)
    expect([s.slots.coffee.start, s.slots.b.start, s.slots.c.end]).toEqual([630, 645, 750])
  })

  it('moves what follows a break that began late to its agreed end, up to the next fixed start', () => {
    const live: LiveTimes = { coffee: { from: at('11:12'), until: at('11:30'), minutes: null } }
    const s = liveSchedule(day, items, live, TZ)
    expect(s.slots.coffee).toMatchObject({ start: 11 * 60 + 12, end: 11 * 60 + 30 })
    expect([s.slots.b.start, s.slots.c.start, s.slots.c.end]).toEqual([690, 750, 795])
    expect(s.slots.lunch).toMatchObject({ start: 750, overlap: 45 })
  })

  it('ends a break at an end set before it began, where the plan starts it', () => {
    const s = liveSchedule(day, items, { coffee: { from: null, until: at('11:00'), minutes: null } }, TZ)
    expect(s.slots.coffee).toMatchObject({ start: 630, end: 660 })
    expect(s.slots.b.start).toBe(660)
    // an end before the planned start: the break moves forward with its length
    const early = liveSchedule(day, items, { coffee: { from: null, until: at('10:20'), minutes: null } }, TZ)
    expect(early.slots.coffee).toMatchObject({ start: 605, end: 620 })
  })

  it('counts a waiting length as the break\'s length', () => {
    const s = liveSchedule(day, items, { coffee: { from: null, until: null, minutes: 30 } }, TZ)
    expect(s.slots.b.start).toBe(660)
  })

  it('leaves out live times of another day and of items that are no breaks', () => {
    const yesterday = at('11:30') - 24 * 60 * MINUTE
    expect(liveSchedule(day, items, { coffee: { from: yesterday - 18 * MINUTE, until: yesterday, minutes: null } }, TZ).slots.b.start).toBe(645)
    expect(liveSchedule(day, items, { a: { from: null, until: null, minutes: 5 } }, TZ).slots.coffee.start).toBe(630)
  })
})

describe('the break slide', () => {
  const slide: DeckSlideRef = {
    key: 'break:coffee',
    generated: 'break',
    itemId: 'coffee',
    caption: 'Kaffeepause',
    html: '<section class="slide break"><div class="text"><h1>Kaffeepause</h1><p class="until">15 Minuten · <strong>bis 10:45</strong></p></div></section>',
  }

  it('shows the minutes left and the end, then that it goes on', () => {
    const entry = { from: at('11:12'), until: at('11:30'), minutes: null }
    expect(breakLine(entry, at('11:18'), TZ, labels)).toBe('noch 12 Minuten · <strong>bis 11:30</strong>')
    expect(breakLine(entry, at('11:31'), TZ, labels)).toBe('<strong>Es geht weiter</strong>')
    expect(breakLine({ from: null, until: null, minutes: 20 }, at('11:00'), TZ, labels)).toBe('20 Minuten')
  })

  it('takes the live line in place of the planned one, and leaves every other slide alone', () => {
    const live: LiveTimes = { coffee: { from: at('11:12'), until: at('11:30'), minutes: null } }
    expect(withLiveBreak(slide, live, at('11:18'), TZ, labels)).toContain('<p class="until">noch 12 Minuten · <strong>bis 11:30</strong></p>')
    expect(withLiveBreak(slide, {}, at('11:18'), TZ, labels)).toBe(slide.html)
    const own = { ...slide, key: 'coffee:s1', generated: undefined }
    expect(withLiveBreak(own, live, at('11:18'), TZ, labels)).toBe(slide.html)
  })
})
