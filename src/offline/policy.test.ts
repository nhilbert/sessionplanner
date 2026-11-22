import { describe, expect, it } from 'vitest'
import { addDays, apiTarget, assetHashes, belongsTo, isAppPage, isAppRoute, pickKept, precacheable, touchRecent } from './policy'

describe('what the offline copy holds', () => {
  it('holds a workshop and its pictures, under the workshop', () => {
    expect(apiTarget('/api/workshops/w1')).toEqual({ base: '', path: '/workshops/w1', workshop: 'w1' })
    expect(apiTarget('/spaces/abc/api/workshops/w1/assets/0123456789abcdef')).toEqual({ base: '/spaces/abc', path: '/workshops/w1/assets/0123456789abcdef', workshop: 'w1' })
  })

  it('holds what showing a workshop needs besides it', () => {
    for (const path of ['/me', '/settings', '/settings/logo', '/workshops', '/themes', '/themes/sr', '/themes/sr/theme.css', '/themes/sr/pool', '/themes/sr/fonts/a.woff2', '/themes/sr/logo-light'])
      expect(apiTarget(`/api${path}`)).toEqual({ base: '', path })
  })

  it('leaves everything else to the server: the live stream, members, exports, the library, decks', () => {
    for (const path of ['/workshops/w1/events', '/workshops/w1/members', '/workshops/w1/export', '/workshops/w1/print-package', '/workshops/w1/assets/0123456789abcdef/info', '/library', '/library/assets/0123456789abcdef', '/decks', '/trash', '/storage', '/export/data', '/attachments/a1', '/mcp/connections'])
      expect(apiTarget(`/api${path}`)).toBeNull()
    expect(apiTarget('/assets/index.js')).toBeNull()
    expect(apiTarget('/w/w1/present')).toBeNull()
  })

  it('keeps workspaces apart', () => {
    expect(belongsTo('/spaces/a/api/workshops/w1', '/spaces/a')).toBe(true)
    expect(belongsTo('/spaces/b/api/workshops/w1', '/spaces/a')).toBe(false)
    expect(belongsTo('/spaces/a/api/me', '')).toBe(false)
    expect(belongsTo('/api/me', '')).toBe(true)
  })

  it('takes only the app’s own page for the app', () => {
    expect(isAppPage('<html><body><div id="root"></div><script type="module" crossorigin src="/assets/index.js"></script></body></html>')).toBe(true)
    expect(isAppPage('<html><body><form>Choose a workspace</form></body></html>')).toBe(false)
  })

  it('stands in with the kept page only for pages of an app whose workshops are kept', () => {
    // The core at the root of its host.
    for (const path of ['/', '/w/w1', '/w/w1/present', '/w/w1/print/plan', '/settings']) expect(isAppRoute(path, [''])).toBe(true)
    // Never for files, exports and downloads, the agents' endpoint and its sign-in.
    for (const path of ['/api/attachments/a1', '/api/export/data', '/api/workshops/w1/export', '/api', '/mcp', '/oauth/authorize', '/oauth-consent', '/.well-known/oauth-authorization-server', '/sw.js']) expect(isAppRoute(path, [''])).toBe(false)
    // A build with workspaces: only inside a kept one; the login and the choice of workspaces in front go to the server.
    const bases = ['/spaces/a']
    for (const path of ['/spaces/a', '/spaces/a/', '/spaces/a/w/w1/presenter']) expect(isAppRoute(path, bases)).toBe(true)
    for (const path of ['/', '/auth/callback', '/oauth2/sign_out', '/spaces/b/w/w1', '/spaces/ab', '/spaces/a/api/export/data']) expect(isAppRoute(path, bases)).toBe(false)
    expect(isAppRoute('/w/w1', [])).toBe(false)
  })

  it('keeps the code, styles and fonts of the build, not the CJK subsets or the page itself', () => {
    expect(precacheable('assets/index-abc.js')).toBe(true)
    expect(precacheable('assets/index-abc.css')).toBe(true)
    expect(precacheable('assets/inter-latin-wght-normal-abc.woff2')).toBe(true)
    expect(precacheable('favicon.svg')).toBe(true)
    expect(precacheable('assets/noto-sans-jp-12-400-normal-abc.woff2')).toBe(false)
    expect(precacheable('assets/lato-latin-400-normal-abc.woff')).toBe(false)
    expect(precacheable('index.html')).toBe(false)
    expect(precacheable('sw.js')).toBe(false)
  })
})

describe('which workshops a device keeps', () => {
  const w = (id: string, firstDate: string | null, lastDate: string | null = firstDate) => ({ id, firstDate, lastDate })
  const today = '2026-11-22'

  it('counts days from ten days back to thirty ahead', () => {
    expect(addDays(today, -10)).toBe('2026-11-12')
    expect(addDays(today, 30)).toBe('2026-12-22')
  })

  it('keeps the workshops with a day in that window, and a longer one that reaches into it', () => {
    const list = [w('past', '2026-11-11'), w('edge-before', '2026-11-12'), w('today', today), w('edge-after', '2026-12-22'), w('later', '2026-12-23'), w('long', '2026-11-01', '2026-11-13'), w('undated', null)]
    expect(pickKept(list, [], today)).toEqual(['edge-before', 'today', 'edge-after', 'long'])
  })

  it('also keeps the last ten opened here, if they still exist', () => {
    const list = [w('a', '2025-01-01'), w('b', null), w('c', '2026-11-25')]
    expect(pickKept(list, ['b', 'gone', 'a'], today)).toEqual(['c', 'b', 'a'])
  })

  it('remembers the last ten opened, the newest first', () => {
    let recent: string[] = []
    for (let i = 0; i < 12; i++) recent = touchRecent(recent, `w${i}`)
    recent = touchRecent(recent, 'w5')
    expect(recent).toHaveLength(10)
    expect(recent.slice(0, 2)).toEqual(['w5', 'w11'])
  })

  it('finds the pictures a workshop shows', () => {
    const json = JSON.stringify({ items: [{ slides: [{ html: '<img src="asset:0123456789abcdef">' }], worksheets: [{ pages: ['<img src="asset:fedcba9876543210"> <img src="asset:0123456789abcdef">'] }] }] })
    expect(assetHashes(json)).toEqual(['0123456789abcdef', 'fedcba9876543210'])
  })
})
