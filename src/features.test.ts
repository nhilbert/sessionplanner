import { afterEach, describe, expect, it } from 'vitest'
import { productName, setProduct } from './features'

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
