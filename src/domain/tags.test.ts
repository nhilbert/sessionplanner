import { describe, expect, it } from 'vitest'
import { changeTags, hasTag, normalizeTags, parseTags, tagCounts, tagsByUse } from './tags'

describe('tags', () => {
  it('stores tags trimmed, once, without empty ones', () => {
    expect(normalizeTags([' Warm-up ', 'warm-up', '', 'check  in', 'a,b'])).toEqual(['Warm-up', 'check in', 'a b'])
  })
  it('reads several tags typed with commas', () => {
    expect(parseTags('Einstieg, Energizer ,, einstieg')).toEqual(['Einstieg', 'Energizer'])
  })
  it('adds and removes whatever the capitals', () => {
    expect(changeTags(['Einstieg', 'Online'], ['online', 'Kurz'], ['EINSTIEG'])).toEqual(['Online', 'Kurz'])
    expect(hasTag(['Online'], 'online')).toBe(true)
  })
  it('counts the entries per tag, by name', () => {
    expect(tagCounts([['b', 'A'], ['a'], []])).toEqual([
      { tag: 'A', count: 2 },
      { tag: 'b', count: 1 },
    ])
  })
})

describe('the tag filter', () => {
  it('shows the most used tags first, equal counts by name', () => {
    expect(tagsByUse([['Werte', 'Übung'], ['übung', 'Antreiber'], ['Übung', 'Werte'], ['Abschluss']]).map((c) => [c.tag, c.count])).toEqual([
      ['Übung', 3],
      ['Werte', 2],
      ['Abschluss', 1],
      ['Antreiber', 1],
    ])
  })
})
