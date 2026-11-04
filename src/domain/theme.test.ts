import { describe, expect, it } from 'vitest'
import { contrastHex, mixHex, parseHex, toHex } from './color.ts'
import { contrastPairs, DEFAULT_TOKENS, derivedColors, THEME_FILE_PATH, themeCss, themeFileUrls, themeIdFrom, withDefaults, workshopBrand } from './theme.ts'

describe('colour', () => {
  it('parses and formats hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('2F6F8F')).toEqual([47, 111, 143])
    expect(parseHex('red')).toBeNull()
    expect(toHex([47, 111, 143])).toBe('#2F6F8F')
  })
  it('computes WCAG contrast', () => {
    expect(contrastHex('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastHex('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
    expect(contrastHex('#1F2428', '#FFFFFF')!).toBeGreaterThan(14)
  })
  it('mixes in OKLab towards the second colour', () => {
    const mid = mixHex('#000000', '#FFFFFF', 0.5)
    const [r, g, b] = parseHex(mid)!
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(r).toBeGreaterThan(90)
    expect(r).toBeLessThan(160)
    expect(mixHex('#2F6F8F', '#FFFFFF', 0)).toBe('#2F6F8F')
  })
})

describe('workshop branding', () => {
  const themes = [
    { id: 'default', name: 'default', kind: 'builtin' as const },
    { id: 'client', name: 'Client', kind: 'data' as const, printLogo: '/api/themes/client/logo?v=1' },
    { id: 'plain', name: 'Plain', kind: 'data' as const, printLogo: null },
  ]
  it("takes the workshop's theme, else the settings', else the default, and that theme's logo", () => {
    expect(workshopBrand('client', 'plain', themes, '/api/settings/logo')).toEqual({ theme: 'client', logo: '/api/themes/client/logo?v=1', source: 'theme' })
    expect(workshopBrand('', 'client', themes, null)).toEqual({ theme: 'client', logo: '/api/themes/client/logo?v=1', source: 'theme' })
    expect(workshopBrand('', '', themes, null)).toEqual({ theme: 'default', logo: null, source: null })
  })
  it("falls back to the owner's printout logo when the theme has none or is gone", () => {
    expect(workshopBrand('plain', '', themes, '/api/settings/logo')).toEqual({ theme: 'plain', logo: '/api/settings/logo', source: 'owner' })
    expect(workshopBrand('gone', '', themes, '/api/settings/logo').logo).toBe('/api/settings/logo')
    expect(workshopBrand('', '', themes, '/api/settings/logo').logo).toBe('/api/settings/logo')
  })
})

describe('theme', () => {
  it('derives surfaces and quieter text from the base colours', () => {
    const d = derivedColors(DEFAULT_TOKENS)
    expect(d.surface).not.toBe('#FFFFFF')
    expect(contrastHex(d.fg2, '#FFFFFF')!).toBeGreaterThan(7)
    expect(contrastHex(d.fg3, '#FFFFFF')!).toBeGreaterThan(3)
    expect(derivedColors({ ...DEFAULT_TOKENS, overrides: { line: '#FF0000' } }).line).toBe('#FF0000')
  })
  it('writes a stylesheet for the theme', () => {
    const css = themeCss('my-theme', DEFAULT_TOKENS, { logoUrl: '/api/themes/my-theme/logo?v=1' })
    expect(css).toContain('[data-theme="my-theme"] {')
    expect(css).toContain('--accent: #2F6F8F;')
    expect(css).toContain("--font-display: 'Manrope Variable'")
    expect(css).toContain('--tint: #')
    expect(css).toContain('--logo: url("/api/themes/my-theme/logo?v=1")')
    expect(css).not.toContain('figure::after')
    expect(css).not.toContain('.slide:not(.section)')
    // the calm family carries no decoration; the playful one lays its discs and waves under the theme's selector
    expect(css).not.toContain('radial-gradient')
    const playful = themeCss('p', { ...DEFAULT_TOKENS, family: 'playful' })
    expect(playful).toContain('[data-theme="p"] .slide.title {')
    expect(playful).toContain('radial-gradient(circle at 1040px 620px, var(--field)')
    expect(playful).toContain("stroke='%232F6F8F'")
    expect(playful).not.toContain('THEME')
    expect(playful).not.toContain('WAVE_')
    expect(withDefaults({}).family).toBe('calm')
    const scrim = themeCss('s', { ...DEFAULT_TOKENS, titleScrim: true })
    expect(scrim).toContain('.slide.title > figure { width: 100%; }')
    expect(scrim).toContain('.slide.title > figure::after')
    const withLogo = themeCss('x', { ...DEFAULT_TOKENS, logo: 'all', titleScrim: false }, { logoUrl: '/l' })
    expect(withLogo).toContain('.slide:not(.section):not(.closing)')
    expect(withLogo).not.toContain('figure::after')
  })
  it('lays a theme\'s own rules over the generated ones, under its selector and with its files', () => {
    const fileUrls = themeFileUrls({ id: 'brand', files: [{ path: 'fonts/Brand.ttf', mime: 'font/ttf', size: 1, updatedAt: '2026-11-03T10:00:00.000Z' }] })
    expect(fileUrls).toEqual({ 'fonts/Brand.ttf': '/api/themes/brand/fonts/Brand.ttf?v=2026-11-03T10%3A00%3A00.000Z' })
    const own = "@font-face { font-family: 'Brand'; src: url('fonts/Brand.ttf'); }\n:scope .slide h2, :scope .slide h3 { font-weight: 700; }\n:scope { --mark: url(assets/missing.svg); background: url(\"data:image/svg+xml;utf8,<svg fill='%23fff'/>\"); }"
    const css = themeCss('brand', { ...DEFAULT_TOKENS, family: 'playful' }, { css: own, fileUrls })
    expect(css).toContain(`src: url('${fileUrls['fonts/Brand.ttf']}')`)
    expect(css).toContain('[data-theme="brand"] .slide h2, [data-theme="brand"] .slide h3 { font-weight: 700; }')
    // a path without a file stays as written; data addresses are left alone
    expect(css).toContain('--mark: url(assets/missing.svg)')
    expect(css).toContain(`url("data:image/svg+xml;utf8,<svg fill='%23fff'/>")`)
    expect(css).not.toContain(':scope')
    // last, after the family's decoration, so the own rules win
    expect(css.indexOf('font-weight: 700')).toBeGreaterThan(css.indexOf('radial-gradient'))
    expect(themeCss('brand', DEFAULT_TOKENS, { css: '  ' })).toBe(themeCss('brand', DEFAULT_TOKENS))
    expect(['fonts/Lato-Black.ttf', 'assets/logo-mark.svg', 'logo.png', 'a/b/c.woff2'].every((p) => THEME_FILE_PATH.test(p))).toBe(true)
    expect(['../x.ttf', 'fonts/x.css', 'theme.css', 'logo', '/abs.png', 'a/b/c/d.png', 'fonts/.hidden.ttf'].some((p) => THEME_FILE_PATH.test(p))).toBe(false)
  })
  it('fills partial tokens and makes ids', () => {
    const t = withDefaults({ colors: { accent: '#123456' } as never, radius: 4 })
    expect(t.colors.accent).toBe('#123456')
    expect(t.colors.bg).toBe('#FBFAF8')
    expect(t.radius).toBe(4)
    expect(t.fonts.display).toBe('manrope')
    expect(themeIdFrom('Beispiel Beratung Köln – hell', () => 'abc123xyz')).toBe('beispiel-beratung-koln-h-abc123')
    expect(themeIdFrom('', () => 'abc123xyz')).toBe('theme-abc123')
    // a patch without overrides keeps those of the theme; given overrides replace them (that is how one is removed)
    const base = { ...DEFAULT_TOKENS, overrides: { line: '#FF0000' } }
    expect(withDefaults({ colors: { accent: '#123456' } } as never, base).overrides).toEqual({ line: '#FF0000' })
    expect(withDefaults({ overrides: {} }, base).overrides).toEqual({})
  })
  it('lists the contrast pairs the editor checks', () => {
    const pairs = contrastPairs(DEFAULT_TOKENS)
    expect(pairs.find((p) => p.key === 'text')?.fg).toBe('#22272E')
    expect(pairs.every((p) => contrastHex(p.fg, p.bg)! >= 3)).toBe(true)
  })
})
