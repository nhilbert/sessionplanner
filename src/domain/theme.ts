import { isHex, mixHex } from './color.ts'

/**
 * Slide themes as data (docs/slides.md, section 4): a theme names a few colours, two fonts and a handful of
 * choices; everything the stylesheet needs (surfaces, lines, quieter text, the deeper accent) is derived from
 * them here, so the theme editor shows ten colours instead of twenty and every derived tone stays in step when
 * one of them changes. `themeCss` turns a theme into the stylesheet the slides use – on the server when the
 * theme is served, in the browser while it is being edited.
 */

export const THEME_COLOR_KEYS = ['bg', 'fg', 'title', 'accent', 'accent2', 'accent3', 'accent4', 'onAccent', 'field', 'onField'] as const
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export const DERIVED_COLOR_KEYS = ['surface', 'surface2', 'line', 'fg2', 'fg3', 'accentDeep', 'onField2'] as const
export type DerivedColorKey = (typeof DERIVED_COLOR_KEYS)[number]

export const FONT_KEYS = ['inter', 'manrope', 'source-serif', 'system-sans', 'system-serif', 'mono'] as const
export type FontKey = (typeof FONT_KEYS)[number]

/** The font stacks behind the keys; the first two and the serif are self-hosted by the app. */
export const FONT_STACKS: Record<FontKey, string> = {
  inter: "'Inter Variable', Inter, system-ui, 'Segoe UI', Roboto, sans-serif",
  manrope: "'Manrope Variable', Manrope, 'Inter Variable', system-ui, sans-serif",
  'source-serif': "'Source Serif 4 Variable', 'Source Serif 4', Georgia, 'Times New Roman', serif",
  'system-sans': "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  'system-serif': "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace",
}
/** The fonts the app ships (the others are the viewer's system fonts). */
export const HOSTED_FONTS: FontKey[] = ['inter', 'manrope', 'source-serif']

export type LogoPlacement = 'none' | 'title' | 'all'

export interface ThemeTokens {
  colors: Record<ThemeColorKey, string>
  /** Derived tones set by hand (the editor's advanced section); absent = derived. */
  overrides: Partial<Record<DerivedColorKey, string>>
  fonts: { display: FontKey; body: FontKey }
  displayWeight: 500 | 600 | 700
  /** Corner radius of cards and boxes, px. */
  radius: number
  /** The host's footer line (deck name, slide number). */
  chrome: boolean
  /** A picture on the title slide gets a dark gradient and light text. */
  titleScrim: boolean
  /** Where the host shows the theme's logo besides the closing slide. */
  logo: LogoPlacement
}

export interface ThemeLogo {
  mime: string
  updatedAt: string
}

/** A theme as stored: id (a folder-safe name), display name, tokens, the logos uploaded for it. */
export interface Theme {
  id: string
  name: string
  tokens: ThemeTokens
  logo: ThemeLogo | null
  /** A light variant of the logo for the field colour (section and closing slides). */
  logoLight: ThemeLogo | null
  createdAt: string
  updatedAt: string
}

/** What the app lists: the built-in theme, folder themes (data/themes) and data themes, with their names. */
export interface ThemeInfo {
  id: string
  name: string
  kind: 'builtin' | 'folder' | 'data'
  updatedAt?: string
}

/** The neutral default, the same colours as themes/default.css. */
export const DEFAULT_TOKENS: ThemeTokens = {
  colors: { bg: '#FFFFFF', fg: '#1F2428', title: '#1F2428', accent: '#2F6F8F', accent2: '#B5513D', accent3: '#C99A2E', accent4: '#5B8E7D', onAccent: '#FFFFFF', field: '#2F6F8F', onField: '#FFFFFF' },
  overrides: {},
  fonts: { display: 'inter', body: 'inter' },
  displayWeight: 600,
  radius: 12,
  chrome: false,
  titleScrim: true,
  logo: 'none',
}

/** A dark counterpart to the default: what "new dark theme" starts from. */
export const DARK_TOKENS: ThemeTokens = {
  ...DEFAULT_TOKENS,
  colors: { bg: '#15181B', fg: '#E8EAED', title: '#F3F4F6', accent: '#7FB3CF', accent2: '#E08A74', accent3: '#E0B85A', accent4: '#86BDA9', onAccent: '#15181B', field: '#24485A', onField: '#F3F4F6' },
}

/** The derived tones of a theme: tints of the text colour on the background, the deeper accent, the quieter text on the field. */
export function derivedColors(tokens: ThemeTokens): Record<DerivedColorKey, string> {
  const c = tokens.colors
  const dark = isDarkHex(c.bg)
  const derived: Record<DerivedColorKey, string> = {
    surface: mixHex(c.bg, c.fg, dark ? 0.08 : 0.06),
    surface2: mixHex(c.bg, c.fg, dark ? 0.05 : 0.03),
    line: mixHex(c.bg, c.fg, dark ? 0.18 : 0.14),
    fg2: mixHex(c.fg, c.bg, 0.22),
    fg3: mixHex(c.fg, c.bg, 0.48),
    accentDeep: mixHex(c.accent, dark ? '#FFFFFF' : '#000000', 0.2),
    onField2: mixHex(c.onField, c.field, 0.2),
  }
  for (const k of DERIVED_COLOR_KEYS) {
    const o = tokens.overrides[k]
    if (o && isHex(o)) derived[k] = o
  }
  return derived
}

function isDarkHex(hex: string): boolean {
  // a quick read of the background: dark themes tint their surfaces a little more
  const v = hex.replace('#', '')
  const n = v.length === 3 ? parseInt(v[0] + v[0] + v[1] + v[1] + v[2] + v[2], 16) : parseInt(v.slice(0, 6), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110
}

/** Fills a partial token set (older data, an agent's input) with the defaults. */
export function withDefaults(tokens: Partial<ThemeTokens> | undefined, base: ThemeTokens = DEFAULT_TOKENS): ThemeTokens {
  const t = tokens ?? {}
  return {
    colors: { ...base.colors, ...(t.colors ?? {}) },
    overrides: { ...(t.overrides ?? {}) },
    fonts: { ...base.fonts, ...(t.fonts ?? {}) },
    displayWeight: t.displayWeight ?? base.displayWeight,
    radius: t.radius ?? base.radius,
    chrome: t.chrome ?? base.chrome,
    titleScrim: t.titleScrim ?? base.titleScrim,
    logo: t.logo ?? base.logo,
  }
}

export interface ThemeCssOptions {
  /** The address of the uploaded logo (and its light variant), if any. */
  logoUrl?: string | null
  logoLightUrl?: string | null
}

/**
 * The stylesheet of a theme: the tokens slides.css reads on [data-theme="id"], and the decorations the tokens
 * ask for (the scrim on a title picture, the logo on the slides). Literal colours, no color-mix, so the file prints
 * and exports the same everywhere.
 */
export function themeCss(id: string, tokens: ThemeTokens, options: ThemeCssOptions = {}): string {
  const c = tokens.colors
  const d = derivedColors(tokens)
  const sel = `[data-theme="${id.replace(/[^a-zA-Z0-9_-]/g, '')}"]`
  const vars = [
    `--bg: ${c.bg}; --surface: ${d.surface}; --surface-2: ${d.surface2}; --line: ${d.line};`,
    `--fg: ${c.fg}; --fg-2: ${d.fg2}; --fg-3: ${d.fg3};`,
    `--title: ${c.title}; --accent: ${c.accent}; --accent-deep: ${d.accentDeep}; --accent-2: ${c.accent2}; --accent-3: ${c.accent3}; --accent-4: ${c.accent4}; --on-accent: ${c.onAccent};`,
    `--field: ${c.field}; --on-field: ${c.onField}; --on-field-2: ${d.onField2};`,
    `--font-display: ${FONT_STACKS[tokens.fonts.display]}; --font-body: ${FONT_STACKS[tokens.fonts.body]}; --font-mono: ${FONT_STACKS.mono};`,
    `--display-weight: ${tokens.displayWeight}; --radius: ${tokens.radius}px; --chrome: ${tokens.chrome ? 'flex' : 'none'};`,
    options.logoUrl ? `--logo: url("${options.logoUrl}");` : '',
    options.logoLightUrl ? `--logo-light: url("${options.logoLightUrl}");` : options.logoUrl ? `--logo-light: url("${options.logoUrl}");` : '',
  ]
  const lines = [`${sel} { ${vars.filter(Boolean).join(' ')} }`]
  if (tokens.titleScrim) {
    const ink = isDarkHex(c.bg) ? c.bg : '#1F2428'
    const rgb = hexToRgbList(ink)
    lines.push(`${sel} .slide.title > figure::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.7) 45%, rgba(${rgb},0.1) 100%); }`)
    lines.push(`${sel} .slide.title:has(figure) { color: #FFFFFF; }`)
    lines.push(`${sel} .slide.title:has(figure) h1, ${sel} .slide.title:has(figure) .subtitle, ${sel} .slide.title:has(figure) .meta { color: #FFFFFF; }`)
    lines.push(`${sel} .slide.title:has(figure) .eyebrow { color: rgba(255,255,255,0.8); }`)
  }
  if (options.logoUrl && tokens.logo !== 'none') {
    const where = tokens.logo === 'title' ? `${sel} .slide.title::after` : `${sel} .slide:not(.section):not(.closing):not(.figure.full)::after`
    lines.push(`${where} { content: ''; position: absolute; right: 64px; bottom: 28px; width: 150px; height: 44px; background: var(--logo) no-repeat right center / contain; pointer-events: none; z-index: 2; }`)
    if (tokens.logo === 'all') lines.push(`${sel} .slide.title::after, ${sel} .slide.break::after { height: 56px; width: 190px; }`)
    if (tokens.logo === 'all') lines.push(`${sel} .slide.title:has(figure)::after { background-image: var(--logo-light, var(--logo)); }`)
  }
  return lines.join('\n')
}

function hexToRgbList(hex: string): string {
  const v = hex.replace('#', '')
  const h = v.length === 3 ? [...v].map((x) => x + x).join('') : v.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')
}

/** The ids a theme may have: the same rule as theme folders (server/themes.ts). */
export const THEME_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/** A folder-safe id from a name, with a short random tail so two themes of the same name never collide. */
export function themeIdFrom(name: string, random: () => string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const tail = random().replace(/[^a-z0-9]/g, '').slice(0, 6)
  return `${slug || 'theme'}-${tail}`.replace(/--+/g, '-').slice(0, 40)
}

/** The contrast pairs a theme must keep readable, for the editor's checks: [what, foreground key, background]. */
export function contrastPairs(tokens: ThemeTokens): { key: string; fg: string; bg: string; large: boolean }[] {
  const c = tokens.colors
  const d = derivedColors(tokens)
  return [
    { key: 'text', fg: c.fg, bg: c.bg, large: false },
    { key: 'text2', fg: d.fg2, bg: c.bg, large: false },
    { key: 'text3', fg: d.fg3, bg: c.bg, large: false },
    { key: 'title', fg: c.title, bg: c.bg, large: true },
    { key: 'accent', fg: c.accent, bg: c.bg, large: true },
    { key: 'onAccent', fg: c.onAccent, bg: c.accent, large: false },
    { key: 'onField', fg: c.onField, bg: c.field, large: true },
    { key: 'onField2', fg: d.onField2, bg: c.field, large: false },
    { key: 'textOnSurface', fg: c.fg, bg: d.surface, large: false },
  ]
}
