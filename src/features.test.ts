import { afterEach, describe, expect, it } from 'vitest'
import { ownerOnlyPart, productName, setOwnerOnly, setProduct } from './features'

describe('the name the app shows', () => {
  afterEach(() => setProduct())

  it('is Session Planner unless a build gives its own', () => {
    expect(productName()).toBe('Session Planner')
    setProduct('Beispiel')
    expect(productName()).toBe('Beispiel')
    setProduct(undefined)
    expect(productName()).toBe('Session Planner')
  })
})

describe('a part of the app for the real owner alone', () => {
  afterEach(() => setOwnerOnly(undefined))

  it('shows as it is unless a build wraps it', () => {
    expect(ownerOnlyPart('section')).toBe('section')
  })

  it('shows as a build wants it, and a build can hold it back', () => {
    setOwnerOnly((section) => ['wrapped', section])
    expect(ownerOnlyPart('section')).toEqual(['wrapped', 'section'])
    setOwnerOnly(() => null)
    expect(ownerOnlyPart('section')).toBeNull()
  })

  it('shows as it is again when the build takes its wrapper away', () => {
    setOwnerOnly(() => null)
    setOwnerOnly(undefined)
    expect(ownerOnlyPart('section')).toBe('section')
  })
})
