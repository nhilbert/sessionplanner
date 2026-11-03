import { describe, expect, it } from 'vitest'
import { contrastHex, mixHex, parseHex, toHex } from './color.ts'
import { contrastPairs, DEFAULT_TOKENS, derivedColors, themeCss, themeIdFrom, withDefaults } from './theme.ts'

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
