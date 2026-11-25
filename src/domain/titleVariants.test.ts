import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_TITLE, familyTitleChoices, resolveTitleVariant, TITLE_VARIANTS, TITLE_VARIANTS_BEGIN, TITLE_VARIANTS_END, themeTitle, themeTitleCss, titleVariantOf, titleVariantsCss } from './titleVariants.ts'

describe('the variants of a title slide', () => {
  it('slides.css carries the rules exactly as they are written here', () => {
    const css = readFileSync(new URL('../slides/slides.css', import.meta.url), 'utf8')
    const from = css.indexOf(TITLE_VARIANTS_BEGIN)
    const to = css.indexOf(TITLE_VARIANTS_END)
    expect(from).toBeGreaterThan(-1)
    // out of step: put the text of titleVariantsCss() between the two marks in src/slides/slides.css
    expect(css.slice(from, to + TITLE_VARIANTS_END.length)).toBe(titleVariantsCss())
  })

  it('the rules for the classes are of low specificity, so a family or a theme that sets its own title still does', () => {
    const rules = titleVariantsCss().split('\n').slice(1, -1)
    expect(rules.length).toBeGreaterThan(8)
    for (const rule of rules) expect(rule).toMatch(/^\.slide\.title:where\(\.pic-[a-z]+\)/)
    expect(titleVariantsCss()).not.toContain('pic-column')
    for (const rule of themeTitleCss('[data-theme="x"]', 'whole')) expect(rule).toMatch(/^\[data-theme="x"\] \.slide\.title:where\(:not\(\[class\*="pic-"\]\)\)/)
    expect(themeTitleCss('[data-theme="x"]', 'column')).toEqual([])
  })

  it('reads the variant from a slide\'s classes', () => {
    expect(titleVariantOf(['slide', 'title', 'pic-band'])).toBe('band')
    expect(titleVariantOf(['slide', 'title'])).toBeNull()
    expect(titleVariantOf(['slide', 'title', 'pic-nothing'])).toBeNull()
  })

  it('a theme\'s settings are made consistent: choices within the family, the default among the choices', () => {
    expect(themeTitle({})).toEqual(DEFAULT_THEME_TITLE)
    expect(themeTitle({ titleVariant: 'band', titleChoices: ['column', 'band'] })).toEqual({ variant: 'band', choices: ['column', 'band'], picture: '' })
    // a default that is not on offer gives way to the column, or to the first choice
    expect(themeTitle({ titleVariant: 'band', titleChoices: ['none', 'column'] }).variant).toBe('column')
    expect(themeTitle({ titleVariant: 'band', titleChoices: ['none'] })).toEqual({ variant: 'none', choices: ['none'], picture: '' })
    // the playful family sets its own title: with a picture or without
    expect(familyTitleChoices('playful')).toEqual(['none', 'column'])
    expect(themeTitle({ family: 'playful', titleVariant: 'background', titleChoices: ['background', 'band'] })).toEqual({ variant: 'column', choices: ['none', 'column'], picture: '' })
    expect(themeTitle({ titlePicture: 'a'.repeat(64) }).picture).toBe('a'.repeat(64))
    expect(familyTitleChoices('calm')).toEqual([...TITLE_VARIANTS])
  })

  it('a slide shows the variant chosen for it where its theme offers that, else the theme\'s', () => {
    const theme = { variant: 'column' as const, choices: ['none' as const, 'column' as const], picture: '' }
    expect(resolveTitleVariant('none', theme)).toBe('none')
    expect(resolveTitleVariant('band', theme)).toBe('column')
    expect(resolveTitleVariant(undefined, theme)).toBe('column')
    expect(resolveTitleVariant('nonsense', DEFAULT_THEME_TITLE)).toBe('column')
  })
})
