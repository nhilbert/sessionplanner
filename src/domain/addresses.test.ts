import { afterEach, describe, expect, it } from 'vitest'
import { apiUrl, isApiUrl, pageUrl, setBasePath, themeUrl } from './addresses'
import { themeFileUrls, themeLogoUrl } from './theme'

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

describe('a base path', () => {
  afterEach(() => setBasePath(''))

  it('goes in front of the pages and the API in the browser', () => {
    setBasePath('/base/one')
    expect(pageUrl('/w/1/present')).toBe('/base/one/w/1/present')
    expect(apiUrl('/me')).toBe('/base/one/api/me')
    expect(themeUrl('brand', 'theme.css')).toBe('/base/one/api/themes/brand/theme.css')
    expect(isApiUrl('/base/one/api/themes/brand/logo')).toBe(true)
    expect(isApiUrl('/api/themes/brand/logo')).toBe(false)
  })

  it('can be handed in, as a server holding several apps does, whatever the page has set', () => {
    const logo = { mime: 'image/png', updatedAt: 't' }
    const theme = { id: 'brand', logo, logoLight: null, files: [{ path: 'a.woff2', mime: 'font/woff2', size: 1, updatedAt: 't' }] }
    expect(themeLogoUrl(theme, 'logo', '/base/two')).toBe('/base/two/api/themes/brand/logo?v=t')
    expect(themeFileUrls(theme, '/base/two')).toEqual({ 'a.woff2': '/base/two/api/themes/brand/a.woff2?v=t' })
    expect(apiUrl('/me', '')).toBe('/api/me')
  })

  it('is empty by default, and nothing changes', () => {
    expect(pageUrl('/w/1')).toBe('/w/1')
    expect(apiUrl('/me')).toBe('/api/me')
  })
})
