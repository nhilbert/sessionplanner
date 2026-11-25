/**
 * The variants of a title slide (docs/slides.md, section 3): where its picture stands. A variant is a class on the
 * slide (`pic-band`); a title slide without one is shown as its theme says, and a theme that says nothing shows the
 * column at the right edge, as before the variants.
 *
 * The rules are written once, here: `slides.css` carries them for the classes (the block between the two marks, kept
 * in step by a test), and a theme's stylesheet carries the rules of its own default for the slides without a class.
 * Both are of low specificity (`:where`), so a family's or a theme's own rules for the title slide still decide.
 */

export const TITLE_VARIANTS = ['none', 'column', 'background', 'whole', 'band', 'small'] as const
export type TitleVariant = (typeof TITLE_VARIANTS)[number]

export const isTitleVariant = (v: unknown): v is TitleVariant => typeof v === 'string' && (TITLE_VARIANTS as readonly string[]).includes(v)

/** The class a title slide carries for a variant. */
export const titleVariantClass = (v: TitleVariant): string => `pic-${v}`

/** The variant a title slide's classes name, or null when they name none. */
export function titleVariantOf(classNames: string[]): TitleVariant | null {
  for (const c of classNames) if (c.startsWith('pic-') && isTitleVariant(c.slice(4))) return c.slice(4) as TitleVariant
  return null
}

/** What a theme says about its title slides: the variant of those that chose none, the variants a workshop may choose, and a picture of its pool that stands on them ('' = the pool's pictures in turn). */
export interface ThemeTitle {
  variant: TitleVariant
  choices: TitleVariant[]
  picture: string
}

/** A theme that says nothing: the column, every variant on offer, the pool in turn. */
export const DEFAULT_THEME_TITLE: ThemeTitle = { variant: 'column', choices: [...TITLE_VARIANTS], picture: '' }

/**
 * The variants a family can show. The playful family sets its own title (the figure whole on the disc), so it offers
 * that, under the name of the column, and the title without a picture.
 */
export const familyTitleChoices = (family: string): TitleVariant[] => (family === 'playful' ? ['none', 'column'] : [...TITLE_VARIANTS])

/** A theme's title settings made consistent: the choices within what its family shows, the default among the choices. */
export function themeTitle(tokens: { family?: string; titleVariant?: TitleVariant; titleChoices?: TitleVariant[] | null; titlePicture?: string }): ThemeTitle {
  const family = familyTitleChoices(tokens.family ?? 'calm')
  const asked = (tokens.titleChoices ?? family).filter((v) => family.includes(v))
  const choices = family.filter((v) => asked.includes(v))
  const offered = choices.length ? choices : family
  const wanted = tokens.titleVariant ?? 'column'
  return { variant: offered.includes(wanted) ? wanted : offered.includes('column') ? 'column' : offered[0], choices: offered, picture: tokens.titlePicture ?? '' }
}

/** The variant a title slide shows: the one chosen for it where its theme offers that, else the theme's. */
export const resolveTitleVariant = (chosen: string | undefined, theme: ThemeTitle): TitleVariant => (isTitleVariant(chosen) && theme.choices.includes(chosen) ? chosen : theme.variant)

/** Whether the logo of a title slide lies on its picture (and so takes the light variant). */
export const logoOnPicture = (v: TitleVariant): boolean => v === 'column' || v === 'background'

/** The dark tone of the gradient over a background picture, as "r,g,b"; a theme may set `--scrim`. */
const SCRIM = 'var(--scrim, 31,36,40)'

/**
 * The rules of one variant for the title slides `slide` selects (sizes in px of the 1280 × 720 slide). The column
 * needs none: it is what the layout does.
 */
export function titleVariantRules(variant: TitleVariant, slide: string): string[] {
  switch (variant) {
    case 'none':
      return [`${slide} > figure { display: none; }`]
    case 'column':
      return []
    case 'background':
      return [
        `${slide} > figure { width: 100%; }`,
        `${slide} > figure::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(${SCRIM},0.9) 0%, rgba(${SCRIM},0.7) 45%, rgba(${SCRIM},0.1) 100%); }`,
        `${slide}:has(figure) { color: #FFFFFF; }`,
        `${slide}:has(figure) h1, ${slide}:has(figure) .subtitle, ${slide}:has(figure) .meta { color: #FFFFFF; }`,
        `${slide}:has(figure) .eyebrow { color: rgba(255,255,255,0.8); }`,
      ]
    case 'whole':
      return [`${slide} > figure { top: 96px; right: 64px; bottom: 96px; width: 512px; }`, `${slide} > figure img { object-fit: contain; }`]
    case 'band':
      return [`${slide} > figure { left: 0; bottom: auto; width: auto; height: 320px; }`, `${slide}:has(figure) > .text { max-width: 1100px; }`, `${slide}:has(figure) .eyebrow { position: static; }`]
    case 'small':
      return [`${slide} > figure { left: 64px; right: auto; top: 120px; bottom: auto; width: 336px; height: 192px; }`, `${slide} > figure img { object-fit: contain; object-position: left center; }`]
  }
}

/** The marks around the block in slides.css. */
export const TITLE_VARIANTS_BEGIN = '/* title variants: written by src/domain/titleVariants.ts (titleVariantsCss), kept in step by its test */'
export const TITLE_VARIANTS_END = '/* end of the title variants */'

/** The rules of every variant for the slides that carry its class: the block slides.css holds. */
export function titleVariantsCss(): string {
  const rules = TITLE_VARIANTS.flatMap((v) => titleVariantRules(v, `.slide.title:where(.${titleVariantClass(v)})`))
  return [TITLE_VARIANTS_BEGIN, ...rules, TITLE_VARIANTS_END].join('\n')
}

/** A selector part for a title slide that carries none of the variants' classes (another class that merely contains "pic-" does not count). */
export const NO_VARIANT = `:not(${TITLE_VARIANTS.map((v) => `.${titleVariantClass(v)}`).join(', ')})`

/** The rules of a theme's default variant, for the title slides under `sel` that carry no variant's class. */
export const themeTitleCss = (sel: string, variant: TitleVariant): string[] => titleVariantRules(variant, `${sel} .slide.title:where(${NO_VARIANT})`)
