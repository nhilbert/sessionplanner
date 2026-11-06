import { afterEach, describe, expect, it } from 'vitest'
import { fullExportOf, productName, setFullExport, setProduct } from './features'

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

describe('the export of all data and media in the settings', () => {
  afterEach(() => setFullExport(undefined))

  it('shows as it is unless a build wraps it', () => {
    expect(fullExportOf('section')).toBe('section')
  })

  it('shows as a build wants it, and a build can hold it back', () => {
    setFullExport((section) => ['wrapped', section])
    expect(fullExportOf('section')).toEqual(['wrapped', 'section'])
    setFullExport(() => null)
    expect(fullExportOf('section')).toBeNull()
  })

  it('shows as it is again when the build takes its wrapper away', () => {
    setFullExport(() => null)
    setFullExport(undefined)
    expect(fullExportOf('section')).toBe('section')
  })
})
