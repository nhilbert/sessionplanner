import { describe, expect, it } from 'vitest'
import { BadRequest, validatePoolEntry, validatePoolPatch } from './validate.ts'

const hash = 'a'.repeat(64)

describe('pool tags', () => {
  // Adding an asset and changing its tags follow one rule: up to 20 tags of up to 40 characters, stored lower-case and once.
  it('stores the tags of a new pool entry as they are stored on a change', () => {
    expect(validatePoolEntry({ hash, kind: 'icon', tags: ['Team', ' team ', 'Feedback'] }).tags).toEqual(['team', 'feedback'])
  })

  it('refuses a tag too long or too many, on adding as on changing', () => {
    const long = ['x'.repeat(41)]
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`)
    expect(() => validatePoolEntry({ hash, kind: 'icon', tags: long })).toThrow(BadRequest)
    expect(() => validatePoolPatch({ tags: long })).toThrow(BadRequest)
    expect(() => validatePoolEntry({ hash, kind: 'icon', tags: many })).toThrow(BadRequest)
    expect(() => validatePoolPatch({ tags: many })).toThrow(BadRequest)
  })
})
