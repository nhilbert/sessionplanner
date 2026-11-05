import { z } from 'zod'
import type { Op } from '../src/domain/ops.ts'
import { PALETTE, type ItemContent, type Settings } from '../src/domain/types.ts'
import { extensionOf } from '../src/domain/attachments.ts'
import { normalizeSlideHtml, slideLayout } from '../src/domain/slides.ts'
import { DERIVED_COLOR_KEYS, FAMILY_KEYS, FONT_KEYS, POOL_KINDS, type PoolKind, THEME_COLOR_KEYS, THEME_FILE_PATH, THEME_ID, type ThemeTokens, withDefaults } from '../src/domain/theme.ts'

export class BadRequest extends Error {}

const id = z.string().min(1).max(64)
const text = (max: number) => z.string().max(max)
const minutes = z.number().int().min(0).max(2 * 1440)
const position = z.number().finite()
// YYYY-MM-DD of a day that exists (no 2026-02-29, no 2026-99-99): a date that cannot be parsed would break shifting on duplicate.
const isoDate = z.iso.date()
/** The same calendar check for dates that arrive outside the HTTP bodies (the agents' tools). */
export const isCalendarDate = (value: string): boolean => isoDate.safeParse(value).success
// Links are rendered as <a href>: only web and mail addresses, never javascript: or data:.
const link = z.union([z.literal(''), z.string().max(2000).regex(/^(https?:\/\/|mailto:)/i)])

const material = z.strictObject({ id, label: text(200), qty: z.number().int().min(0).max(100_000), link: link.optional() })
// A slide is stored sanitised (src/domain/slides.ts): only the format's elements and attributes survive the write.
const slide = z.strictObject({ id, html: text(200_000).transform(normalizeSlideHtml) })
const slides = z.array(slide).max(60)
// A theme is a folder under data/themes; '' = the default.
const theme = text(60).regex(/^[a-z0-9-]*$/)
const color = z.enum(PALETTE)
const packingState = z.strictObject({ checked: z.boolean().optional(), venue: z.boolean().optional(), qty: z.number().int().min(0).max(100_000).optional() })

const workshopFields = z.strictObject({
  title: text(300),
  client: text(300),
  location: text(300),
  goal: text(5000),
  notes: text(100_000),
  packing: z.record(z.string().max(200), packingState),
  materials: z.array(material).max(200),
  // generated slides with a picture chosen by hand: slide key → asset hash (docs/slides.md)
  pictures: z.record(z.string().max(80), z.string().regex(/^[0-9a-f]{64}$/, 'an asset hash')).refine((r) => Object.keys(r).length <= 200, 'at most 200 pictures'),
  archived: z.boolean(),
  theme,
})

const dayFields = z.strictObject({
  position,
  date: isoDate,
  startMin: minutes,
  endMin: minutes.nullable(),
})

const groupFields = z.strictObject({
  dayId: id.nullable(),
  position,
  title: text(300),
})

const itemContent = z.strictObject({
  kind: z.enum(['block', 'break', 'marker', 'note']),
  title: text(300),
  description: text(5000),
  duration: z.number().int().min(0).max(1440),
  goal: text(2000),
  method: text(2000),
  lead: text(300),
  notes: text(100_000),
  materials: z.array(material).max(200),
  attachmentIds: z.array(id).max(200).default([]),
  slides: slides.default([]),
  categoryId: id.nullable(),
  color: color.nullable(),
})

const itemFields = z.strictObject({
  dayId: id.nullable(),
  position,
  groupId: id.nullable(),
  kind: z.enum(['block', 'break', 'marker', 'note']),
  title: text(300),
  description: text(5000),
  duration: z.number().int().min(0).max(1440),
  fixedStart: minutes.nullable(),
  goal: text(2000),
  method: text(2000),
  lead: text(300),
  notes: text(100_000),
  materials: z.array(material).max(200),
  attachmentIds: z.array(id).max(200),
  slides,
  categoryId: id.nullable(),
  color: color.nullable(),
})

const op = z.union([
  z.strictObject({ op: z.literal('set'), entity: z.literal('workshop'), id, fields: workshopFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('day'), id, fields: dayFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('group'), id, fields: groupFields.partial() }),
  z.strictObject({ op: z.literal('set'), entity: z.literal('item'), id, fields: itemFields.partial() }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('day'), record: dayFields.extend({ id, workshopId: id }) }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('group'), record: groupFields.extend({ id, workshopId: id }) }),
  z.strictObject({ op: z.literal('create'), entity: z.literal('item'), record: itemFields.extend({ id, workshopId: id, slides: slides.default([]) }) }),
  z.strictObject({ op: z.literal('delete'), entity: z.enum(['day', 'group', 'item']), id }),
])

const opsBody = z.strictObject({ clientId: z.string().max(64), ops: z.array(op).min(1).max(1000) })

export function validateOps(body: unknown): { clientId: string; ops: Op[] } {
  const parsed = opsBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid ops: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data as { clientId: string; ops: Op[] }
}

const newWorkshop = z.strictObject({
  title: text(300).optional(),
  client: text(300).optional(),
  date: isoDate.optional(),
})

export function validateNewWorkshop(body: unknown): z.infer<typeof newWorkshop> {
  const parsed = newWorkshop.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid workshop')
  return parsed.data
}

const settingsBody = z.strictObject({
  categories: z.array(z.strictObject({ id, name: text(100), color })).max(50),
  theme: theme.default(''),
  dayStart: minutes,
  dayEnd: minutes.nullable(),
})

/** Settings as sent by the app; the logo is managed by its own routes. */
export function validateSettings(body: unknown): Omit<Settings, 'logo'> {
  const parsed = settingsBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid settings: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

const libraryBody = z.union([
  z.strictObject({ kind: z.literal('item'), title: text(300), data: itemContent }),
  z.strictObject({ kind: z.literal('group'), title: text(300), data: z.strictObject({ items: z.array(itemContent).min(1).max(100) }) }),
])

export function validateLibraryEntry(body: unknown): { kind: 'item'; title: string; data: ItemContent } | { kind: 'group'; title: string; data: { items: ItemContent[] } } {
  const parsed = libraryBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid library entry: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

/** A new name for a file: readable as a file name, and with the ending it has, which says what the file is. */
export function validateFileName(body: unknown, current: string): string {
  const parsed = z.strictObject({ name: z.string().trim().min(1).max(250).regex(/^[^\\/\r\n]+$/) }).safeParse(body)
  if (!parsed.success || extensionOf(parsed.data.name) !== extensionOf(current)) throw new BadRequest('invalid file name')
  return parsed.data.name
}

const deckSlide = z.strictObject({ html: text(200_000).transform(normalizeSlideHtml), caption: text(300).default('') })
const deckBody = z.strictObject({ title: text(300), theme: theme.default(''), source: text(300).default(''), slides: z.array(deckSlide).max(500) })

export function validateDeck(body: unknown): z.infer<typeof deckBody> {
  const parsed = deckBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid deck: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

const deckPatch = z.strictObject({ title: text(300).optional(), theme: theme.optional() })

export function validateDeckPatch(body: unknown): z.infer<typeof deckPatch> {
  const parsed = deckPatch.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid deck')
  return parsed.data
}

const duplicateBody = z.strictObject({ title: text(300), firstDate: isoDate.optional() })

export function validateDuplicate(body: unknown): z.infer<typeof duplicateBody> {
  const parsed = duplicateBody.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid duplicate request')
  return parsed.data
}

const presentBody = z.strictObject({ key: text(300), n: z.number().int().min(1).max(10_000), tag: text(100) })

export function validatePresent(body: unknown): z.infer<typeof presentBody> {
  const parsed = presentBody.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid position')
  return parsed.data
}

const memberBody = z.strictObject({ role: z.enum(['view', 'edit']), showNotes: z.boolean() })

export function validateMember(body: unknown): z.infer<typeof memberBody> {
  const parsed = memberBody.safeParse(body)
  if (!parsed.success) throw new BadRequest('invalid access')
  return parsed.data
}

/** An e-mail as the login reports it, in lower case. `value` is the path parameter, which the router has decoded already. */
export function validEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!z.email().safeParse(email).success || email.length > 254) throw new BadRequest('invalid e-mail')
  return email
}

// type/subtype with optional parameters (text/plain; charset="utf-8"), as a browser reports it.
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;\s*[a-z0-9!#$&^_.+-]+=(?:"[^"\\\r\n]*"|[a-z0-9!#$&^_.+-]+))*$/

/** The media type of an uploaded file, stored and sent back as the Content-Type of its download; anything that is not one (or over 255 characters) is a plain download. */
export function safeMime(value: string): string {
  const mime = value.trim().toLowerCase()
  return mime.length <= 255 && MIME.test(mime) ? mime : 'application/octet-stream'
}

// ---- slide themes as data and template slides (docs/slides.md) -------------------------------------------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #rrggbb')
const colorKey = z.enum(THEME_COLOR_KEYS)
const derivedKey = z.enum(DERIVED_COLOR_KEYS)
const tokensBody = z.strictObject({
  colors: z.partialRecord(colorKey, hex).optional(),
  overrides: z.partialRecord(derivedKey, hex).optional(),
  fonts: z.strictObject({ display: z.enum(FONT_KEYS).optional(), body: z.enum(FONT_KEYS).optional() }).optional(),
  displayWeight: z.union([z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900)]).optional(),
  radius: z.number().int().min(0).max(40).optional(),
  chrome: z.boolean().optional(),
  titleScrim: z.boolean().optional(),
  logo: z.enum(['none', 'title', 'all']).optional(),
  mark: z.enum(['square', 'circle', 'none']).optional(),
  family: z.enum(FAMILY_KEYS).optional(),
})
/** The size of a theme's own rules (a whole stylesheet kept for a partner's brand is about 45 kB). */
export const MAX_THEME_CSS = 256 * 1024
// A theme's own rules end up inside a <style> of an exported deck, and stay within the theme: no closing tag, no imports.
const themeRules = z
  .string()
  .max(MAX_THEME_CSS)
  .refine((css) => !/<\/style/i.test(css), 'no </style>')
  .refine((css) => !/@import/i.test(css), 'no @import')
const themeBody = z.strictObject({ name: text(100), id: z.string().regex(THEME_ID, 'a folder-safe id').optional(), tokens: tokensBody.optional(), css: themeRules.optional(), from: text(60).optional() })
const themePatch = z.strictObject({ name: text(100).optional(), tokens: tokensBody.optional(), css: themeRules.optional() })

/** A new theme: its name, and either tokens or the id of a theme to copy them from (`from`). */
export function validateTheme(body: unknown): { name: string; id?: string; tokens?: ThemeTokens; css?: string; from?: string } {
  const parsed = themeBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid theme: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { name: parsed.data.name.trim(), id: parsed.data.id, tokens: parsed.data.tokens ? withDefaults(parsed.data.tokens as Partial<ThemeTokens>) : undefined, css: parsed.data.css, from: parsed.data.from }
}

export function validateThemePatch(body: unknown, current: ThemeTokens): { name?: string; tokens?: ThemeTokens; css?: string } {
  const parsed = themePatch.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid theme: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  // The patch is complete tokens as the editor sends them: what it leaves out keeps the current value.
  return { name: parsed.data.name?.trim(), tokens: parsed.data.tokens ? withDefaults(parsed.data.tokens as Partial<ThemeTokens>, current) : undefined, css: parsed.data.css }
}

/** The path of an uploaded theme file, as its rules address it (`fonts/Brand.woff2`). */
export function validateThemeFilePath(value: unknown): string {
  const p = typeof value === 'string' ? value.trim() : ''
  if (!THEME_FILE_PATH.test(p)) throw new BadRequest('path: up to three parts of letters, digits, dot, dash or underscore, ending in a font or picture extension')
  return p
}

export const isThemeId = (value: string): boolean => THEME_ID.test(value)

// ---- the asset pool of a theme ----------------------------------------------------------------------------------

const ASSET_HASH = /^[0-9a-f]{64}$/
const poolKind = z.enum(POOL_KINDS as [PoolKind, ...PoolKind[]])
const tags = z.array(text(40)).max(20)
const poolEntry = z.strictObject({ hash: z.string().regex(ASSET_HASH, 'an asset hash'), kind: poolKind, tags: tags.optional() })
const poolPatch = z.strictObject({ tags: tags.optional(), position: z.number().finite().optional(), kind: poolKind.optional() })

/** Tags typed as one line – words or phrases separated by commas – as the list they are stored as: trimmed, lower-case, no doubles. */
export const parseTags = (line: string): string[] => [...new Set(line.split(/[,;\n]+/).map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20)

/** An asset the server has already, put into a theme's pool: its hash, its kind and optional tags. */
export function validatePoolEntry(body: unknown): { hash: string; kind: PoolKind; tags: string[] } {
  const parsed = poolEntry.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid pool entry: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { hash: parsed.data.hash, kind: parsed.data.kind, tags: parseTags((parsed.data.tags ?? []).join(',')) }
}

/** The kind of a pool upload, from a form field. */
export function validatePoolKind(value: unknown): PoolKind {
  const parsed = poolKind.safeParse(value)
  if (!parsed.success) throw new BadRequest('kind: picture or icon')
  return parsed.data
}

export function validatePoolPatch(body: unknown): { tags?: string[]; position?: number; kind?: PoolKind } {
  const parsed = poolPatch.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid pool entry: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { tags: parsed.data.tags ? parseTags(parsed.data.tags.join(',')) : undefined, position: parsed.data.position, kind: parsed.data.kind }
}

const templateBody = z.strictObject({ name: text(200), html: text(200_000).transform(normalizeSlideHtml), position: z.number().finite().optional() })

/** A template slide: its name, its markup (sanitised like every slide; the layout is read from it) and an optional position. */
export function validateSlideTemplate(body: unknown): { name: string; layout: string; html: string; position?: number } {
  const parsed = templateBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid template: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { name: parsed.data.name.trim(), layout: slideLayout(parsed.data.html), html: parsed.data.html, position: parsed.data.position }
}
