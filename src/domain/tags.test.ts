import { describe, expect, it } from 'vitest'
import { changeTags, hasTag, normalizeTags, parseTags, tagCounts } from './tags'

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
