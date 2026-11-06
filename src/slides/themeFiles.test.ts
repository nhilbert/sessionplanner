import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS, themeCss, themeFileUrls, type Theme } from '@/domain/theme'
import { inlineThemeFiles, isThemeMedia, themeFileAddress } from './themeFiles'

const ORIGIN = 'https://app.example.com'
const BASE = '/spaces/abc/api/themes/mein-theme/'
const address = (ref: string) => themeFileAddress(ref, BASE, ORIGIN)

describe('what a theme may bring into an export', () => {
  it.each([
    ['logo.svg', `${ORIGIN}${BASE}logo.svg`],
    ['./fonts/a.woff2', `${ORIGIN}${BASE}fonts/a.woff2`],
    ['a/b/c.png', `${ORIGIN}${BASE}a/b/c.png`],
    [`${BASE}logo?v=2026-11-06T10%3A00%3A00.000Z`, `${ORIGIN}${BASE}logo?v=2026-11-06T10%3A00%3A00.000Z`],
    [`${BASE}fonts/a.woff2?v=1`, `${ORIGIN}${BASE}fonts/a.woff2?v=1`],
  ])('a file of its own: %s', (ref, expected) => {
    expect(address(ref)).toBe(expected)
  })

  it.each([
    '../../export/data',
    '../../../../other/api/export/data',
    './../../export/media',
    'fonts/../../../export/data',
    '%2e%2e/%2e%2e/export/data',
    '%2E%2E/%2e%2E/export/data',
    '..%2f..%2fexport/data',
    '..%5c..%5cexport/data',
    '..\\..\\export\\data',
    '/spaces/abc/api/export/data',
    '/spaces/other/api/themes/mein-theme/logo',
    '/spaces/abc/api/themes/anderes/logo',
    '/spaces/abc/api/themes/mein-theme-2/logo',
    '/spaces/abc/api/workshops/w1/export',
    '//evil.example.com/x.png',
    'HTTPS://evil.example.com/x.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
    `${BASE}`,
    `${BASE}../logo`,
    'bad name.png',
    '',
  ])('nothing else: %s', (ref) => {
    expect(address(ref)).toBeNull()
  })

  it('takes pictures and fonts, and no other answer', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'IMAGE/PNG']) expect(isThemeMedia(type), type).toBe(true)
    for (const type of ['application/zip', 'application/json', 'application/json; charset=utf-8', 'text/css; charset=utf-8', 'text/html', 'application/octet-stream', '', 'image/pngx', 'x-image/png']) expect(isThemeMedia(type), type).toBe(false)
  })
})

describe('inlining a theme for an export', () => {
  const load = (seen: string[]) => async (url: string) => {
    seen.push(url)
    return `data:x;base64,${seen.length}`
  }

  it('inlines everything a data theme really has: logos and its own files, in the stylesheet the server writes', async () => {
    const at = '2026-11-06T10:00:00.000Z'
    const theme = { id: 'mein-theme', files: [{ path: 'fonts/a.woff2', mime: 'font/woff2', size: 1, updatedAt: at }, { path: 'paper.png', mime: 'image/png', size: 1, updatedAt: at }] } as unknown as Theme
    const css = themeCss('mein-theme', DEFAULT_TOKENS, {
      logoUrl: `${BASE}logo?v=1`,
      logoLightUrl: `${BASE}logo-light?v=1`,
      css: `@font-face { font-family: Eigen; src: url('fonts/a.woff2') } :scope { background: url(./paper.png) }`,
      fileUrls: themeFileUrls(theme, '/spaces/abc'),
    })
    const seen: string[] = []
    const inlined = await inlineThemeFiles(css, BASE, load(seen), ORIGIN)
    expect(seen.map((u) => u.replace(ORIGIN, '').split('?')[0]).sort()).toEqual([`${BASE}fonts/a.woff2`, `${BASE}logo`, `${BASE}logo-light`, `${BASE}paper.png`])
    expect(inlined).not.toContain(BASE)
  })

  it('never asks for what lies outside the theme, and leaves it as it stands', async () => {
    const css = `a { background: url(../../export/data) } b { background: url('/spaces/other/api/export/data') } c { background: url(logo.png) } d { background: url(data:image/png;base64,AAAA) } e { background: url(https://example.com/x.png) }`
    const seen: string[] = []
    const inlined = await inlineThemeFiles(css, BASE, load(seen), ORIGIN)
    expect(seen).toEqual([`${ORIGIN}${BASE}logo.png`])
    expect(inlined).toContain('url(../../export/data)')
    expect(inlined).toContain("url('/spaces/other/api/export/data')")
    expect(inlined).toContain('url(data:x;base64,1)')
    expect(inlined).toContain('url(data:image/png;base64,AAAA)')
    expect(inlined).toContain('url(https://example.com/x.png)')
  })

  it('leaves a reference as it is when the file does not come', async () => {
    expect(await inlineThemeFiles('a { background: url(logo.png) }', BASE, async () => null, ORIGIN)).toBe('a { background: url(logo.png) }')
  })
})
