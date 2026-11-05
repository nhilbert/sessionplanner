import { describe, expect, it } from 'vitest'
import { apiUrl, isApiUrl, themeUrl } from './addresses'

describe('addresses of the API', () => {
  it('stay where they are', () => {
    expect(apiUrl('/me')).toBe('/api/me')
    expect(themeUrl('brand')).toBe('/api/themes/brand/')
    expect(themeUrl('my theme', 'theme.css')).toBe('/api/themes/my%20theme/theme.css')
  })

  it('tell an address in the API from others', () => {
    expect(isApiUrl('/api/themes/brand/logo?v=1')).toBe(true)
    expect(isApiUrl('/apiary/x')).toBe(false)
    expect(isApiUrl('/assets/x.js')).toBe(false)
  })
})
