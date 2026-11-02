import { z } from 'zod'
import type { Op } from '../src/domain/ops.ts'
import { PALETTE, type ItemContent, type Settings } from '../src/domain/types.ts'
import { normalizeSlideHtml, slideLayout } from '../src/domain/slides.ts'
import { DERIVED_COLOR_KEYS, FONT_KEYS, THEME_COLOR_KEYS, THEME_ID, type ThemeTokens, withDefaults } from '../src/domain/theme.ts'

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
  displayWeight: z.union([z.literal(500), z.literal(600), z.literal(700)]).optional(),
  radius: z.number().int().min(0).max(40).optional(),
  chrome: z.boolean().optional(),
  titleScrim: z.boolean().optional(),
  logo: z.enum(['none', 'title', 'all']).optional(),
})
const themeBody = z.strictObject({ name: text(100), tokens: tokensBody.optional(), from: text(60).optional() })
const themePatch = z.strictObject({ name: text(100).optional(), tokens: tokensBody.optional() })

/** A new theme: its name, and either tokens or the id of a theme to copy them from (`from`). */
export function validateTheme(body: unknown): { name: string; tokens?: ThemeTokens; from?: string } {
  const parsed = themeBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid theme: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { name: parsed.data.name.trim(), tokens: parsed.data.tokens ? withDefaults(parsed.data.tokens as Partial<ThemeTokens>) : undefined, from: parsed.data.from }
}

export function validateThemePatch(body: unknown, current: ThemeTokens): { name?: string; tokens?: ThemeTokens } {
  const parsed = themePatch.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid theme: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  // The patch is complete tokens as the editor sends them: what it leaves out keeps the current value.
  return { name: parsed.data.name?.trim(), tokens: parsed.data.tokens ? withDefaults(parsed.data.tokens as Partial<ThemeTokens>, current) : undefined }
}

export const isThemeId = (value: string): boolean => THEME_ID.test(value)

const templateBody = z.strictObject({ name: text(200), html: text(200_000).transform(normalizeSlideHtml), position: z.number().finite().optional() })

/** A template slide: its name, its markup (sanitised like every slide; the layout is read from it) and an optional position. */
export function validateSlideTemplate(body: unknown): { name: string; layout: string; html: string; position?: number } {
  const parsed = templateBody.safeParse(body)
  if (!parsed.success) throw new BadRequest(`invalid template: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  return { name: parsed.data.name.trim(), layout: slideLayout(parsed.data.html), html: parsed.data.html, position: parsed.data.position }
}
