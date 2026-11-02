import { describe, expect, it } from 'vitest'
import { clockIn, formatDuration, formatTime, parseClock, parseDuration, parseTime, scheduleDay, type TimedItem } from './time.ts'

const block = (id: string, duration: number, fixedStart: number | null = null): TimedItem => ({ id, kind: 'block', duration, fixedStart })
const brk = (id: string, duration: number, fixedStart: number | null = null): TimedItem => ({ id, kind: 'break', duration, fixedStart })
const marker = (id: string, fixedStart: number | null = null): TimedItem => ({ id, kind: 'marker', duration: 30, fixedStart })

describe('scheduleDay', () => {
  it('chains items from the day start', () => {
    const s = scheduleDay(540, null, [block('a', 30), block('b', 45), block('c', 15)])
    expect([s.slots.a.start, s.slots.b.start, s.slots.c.start, s.end]).toEqual([540, 570, 615, 630])
    expect(s.overTarget).toBeNull()
  })

  it('gives markers and notes no time, whatever their stored duration', () => {
    const s = scheduleDay(540, null, [block('a', 30), marker('m'), { id: 'n', kind: 'note', duration: 20, fixedStart: null }, block('b', 30)])
    expect(s.slots.m).toMatchObject({ start: 570, end: 570 })
    expect(s.slots.n).toMatchObject({ start: 570, end: 570 })
    expect(s.slots.b.start).toBe(570)
  })

  it('shows a gap before a fixed start that the items do not reach', () => {
    const s = scheduleDay(540, null, [block('a', 60), brk('lunch', 60, 750)])
    expect(s.slots.lunch).toMatchObject({ start: 750, gap: 150, overlap: 0 })
  })

  it('keeps a fixed start in place and shows the overlap when the items before run into it', () => {
    const s = scheduleDay(540, null, [block('a', 120), block('b', 120), brk('lunch', 60, 750)])
    expect(s.slots.lunch).toMatchObject({ start: 750, overlap: 30 })
    expect(s.slots.b.late).toBe(true)
    expect(s.slots.a.late).toBe(false)
  })

  it('cuts the day into segments at fixed starts and the target end', () => {
    const s = scheduleDay(540, 1020, [block('a', 90), block('b', 60), brk('lunch', 60, 750), block('c', 120)])
    expect(s.segments.map((g) => [g.start, g.end, g.planned, g.available])).toEqual([
      [540, 750, 150, 210],
      [750, 1020, 180, 270],
    ])
    expect(s.overTarget).toBe(930 - 1020)
  })

  it('treats fixed starts out of order as an overlap', () => {
    const s = scheduleDay(540, null, [block('a', 30, 900), block('b', 30, 750)])
    expect(s.slots.b).toMatchObject({ start: 750, overlap: 180 })
  })

  it('drops the empty first segment when the day opens with a fixed start', () => {
    const s = scheduleDay(540, null, [marker('start', 540), block('a', 30)])
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0].anchorId).toBe('start')
  })

  it('marks items running past the target end', () => {
    const s = scheduleDay(540, 600, [block('a', 45), block('b', 30)])
    expect(s.slots.b.late).toBe(true)
    expect(s.overTarget).toBe(15)
  })

  it('sums work and break time and finds the longest stretch without a break', () => {
    const s = scheduleDay(540, null, [block('a', 60), block('b', 45), brk('p', 15), block('c', 30), block('d', 120, 720)])
    expect(s.workMinutes).toBe(255)
    expect(s.breakMinutes).toBe(15)
    // c ends 11:00, d starts 12:00: the gap ends that stretch, d alone is 120
    expect(s.longestStretch).toBe(120)
  })

  it('handles an empty day', () => {
    const s = scheduleDay(540, 1020, [])
    expect(s.end).toBe(540)
    expect(s.segments).toEqual([{ start: 540, end: 1020, anchorId: null, itemIds: [], planned: 0, available: 480 }])
  })
})

describe('formatting', () => {
  it('formats and parses times', () => {
    expect(formatTime(570)).toBe('09:30')
    expect(formatTime(1500)).toBe('01:00')
    expect(parseTime('9:05')).toBe(545)
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('nope')).toBeNull()
  })
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(-15)).toBe('−15 min')
  })
})

describe('typed lengths and times', () => {
  it('reads lengths in every common form', () => {
    expect(['90', '90 min', '90min', '1:30', '1h30', '1 h 30 min', '1,5 h', '1.5h', '2h', '120 Minuten'].map(parseDuration)).toEqual([90, 90, 90, 90, 90, 90, 90, 90, 120, 120])
    expect(['1 h 30 Minuten', '1 Std 30', '2 Stunden'].map(parseDuration)).toEqual([90, 90, 120])
    expect(['', 'abc', '0', '25 h', '-5', '1,5', '1:60', '1h75'].map(parseDuration)).toEqual(Array(8).fill(undefined))
  })
  it('gives blocks and breaks at least five minutes', () => {
    expect(['2', '1 min', '0:03'].map(parseDuration)).toEqual([5, 5, 5])
  })
  it('reads clock times in every common form', () => {
    expect(['9', '930', '0930', '9:30', '9.30', '9h30', '14', '9 Uhr', '9h', '9.30 h', '9:30 Uhr'].map(parseClock)).toEqual([540, 570, 570, 570, 570, 570, 840, 540, 540, 570, 570])
    expect(['25', 'x', '9:75'].map(parseClock)).toEqual([null, null, null])
  })
})

describe('clockIn', () => {
  it('gives date and time in the workshop\'s zone, not in UTC or the device\'s', () => {
    // 00:30 in Berlin (winter) is still the evening before in UTC and in New York.
    const at = new Date('2026-11-01T23:30:00Z')
    expect(clockIn(at, 'Europe/Berlin')).toEqual({ date: '2026-11-02', minutes: 30 })
    expect(clockIn(at, 'America/New_York')).toEqual({ date: '2026-11-01', minutes: 18 * 60 + 30 })
    expect(clockIn(new Date('2026-07-01T10:00:00Z'), 'Europe/Berlin')).toEqual({ date: '2026-07-01', minutes: 12 * 60 })
  })
  it('falls back to the device\'s clock for an unknown zone', () => {
    expect(clockIn(new Date(2026, 10, 2, 9, 15), 'Nowhere/Else')).toEqual({ date: '2026-11-02', minutes: 555 })
  })
})
