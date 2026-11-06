import { afterEach, describe, expect, it } from 'vitest'
import { apiUrl, cleanBasePath, localName, pageUrl, setBasePath, themeUrl } from './addresses'
import { themeFileUrls, themeLogoUrl } from './theme'

describe('addresses of the API', () => {
  it('stay where they are', () => {
    expect(apiUrl('/me')).toBe('/api/me')
    expect(themeUrl('brand')).toBe('/api/themes/brand/')
    expect(themeUrl('my theme', 'theme.css')).toBe('/api/themes/my%20theme/theme.css')
  })
})

describe('a base path', () => {
  afterEach(() => setBasePath(''))

  it('goes in front of the pages and the API in the browser', () => {
    setBasePath('/base/one')
    expect(pageUrl('/w/1/present')).toBe('/base/one/w/1/present')
    expect(apiUrl('/me')).toBe('/base/one/api/me')
    expect(themeUrl('brand', 'theme.css')).toBe('/base/one/api/themes/brand/theme.css')
  })

  it('can be handed in, as a server holding several apps does, whatever the page has set', () => {
    const logo = { mime: 'image/png', updatedAt: 't' }
    const theme = { id: 'brand', logo, logoLight: null, files: [{ path: 'a.woff2', mime: 'font/woff2', size: 1, updatedAt: 't' }] }
    expect(themeLogoUrl(theme, 'logo', '/base/two')).toBe('/base/two/api/themes/brand/logo?v=t')
    expect(themeFileUrls(theme, '/base/two')).toEqual({ 'a.woff2': '/base/two/api/themes/brand/a.woff2?v=t' })
    expect(apiUrl('/me', '')).toBe('/api/me')
  })

  it('is cleaned or refused in one place', () => {
    expect(cleanBasePath()).toBe('')
    expect(cleanBasePath('')).toBe('')
    expect(cleanBasePath('/')).toBe('')
    expect(cleanBasePath('/app/')).toBe('/app')
    expect(cleanBasePath('/base/one')).toBe('/base/one')
    for (const bad of ['app', '//evil.example.com', '/a//b', 'https://example.com/a', '/a b', '/a?b']) expect(() => cleanBasePath(bad), bad).toThrow('Not a base path')
    setBasePath('/')
    expect(apiUrl('/me')).toBe('/api/me')
  })

  it('keeps what a browser stores and its channels apart between apps, and changes nothing at the root', () => {
    expect(localName('sp.deck')).toBe('sp.deck')
    setBasePath('/base/one')
    expect(localName('sp.deck')).toBe('/base/one:sp.deck')
  })

  it('is empty by default, and nothing changes', () => {
    expect(pageUrl('/w/1')).toBe('/w/1')
    expect(apiUrl('/me')).toBe('/api/me')
  })
})
