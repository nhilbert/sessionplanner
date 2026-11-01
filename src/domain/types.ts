export type Locale = 'de' | 'en'

export type ItemKind = 'block' | 'break' | 'marker' | 'note'

/** Kinds that take no time on the timeline (docs/concept.md, section 2). */
export const ZERO_KINDS: readonly ItemKind[] = ['marker', 'note']

/** Muted palette keys (src/index.css, --c-*); stored as keys so light and dark mode each get their shade. */
export const PALETTE = ['slate', 'sage', 'ochre', 'plum', 'clay', 'moss', 'dusk', 'sand', 'neutral'] as const
export type PaletteKey = (typeof PALETTE)[number]

/** A method category with its colour. An empty name shows the translated default (categories.<id>). */
export interface Category {
  id: string
  name: string
  color: PaletteKey
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'input', name: '', color: 'slate' },
  { id: 'exercise', name: '', color: 'sage' },
  { id: 'discussion', name: '', color: 'ochre' },
  { id: 'reflection', name: '', color: 'plum' },
  { id: 'energizer', name: '', color: 'clay' },
  { id: 'organisation', name: '', color: 'neutral' },
]

export interface Settings {
  categories: Category[]
  /** The slide theme of new workshops (docs/slides.md); '' = the built-in default. */
  theme: string
  /** Start and target end of new days, minutes after midnight. */
  dayStart: number
  dayEnd: number | null
  /** Set by the server when a logo is uploaded (GET /api/settings/logo). */
  logo: { mime: string; updatedAt: string } | null
}

export const DEFAULT_SETTINGS: Settings = { categories: DEFAULT_CATEGORIES, theme: '', dayStart: 540, dayEnd: 1020, logo: null }

export interface Material {
  id: string
  label: string
  qty: number
  link?: string
}

/** Per packing-list line (key = normalised label): ticked off, at the venue, overridden quantity. */
export interface PackingState {
  checked?: boolean
  venue?: boolean
  qty?: number
}

export interface Workshop {
  id: string
  title: string
  client: string
  location: string
  goal: string
  notes: string
  timezone: string
  /** Slide theme (a folder in data/themes); '' = the settings' default. */
  theme: string
  packing: Record<string, PackingState>
  /** Material for the workshop as a whole, not tied to an item (added in the packing list). */
  materials: Material[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface Day {
  id: string
  workshopId: string
  position: number
  /** YYYY-MM-DD */
  date: string
  /** Minutes after midnight in the workshop's time zone. */
  startMin: number
  endMin: number | null
}

/** A heading over consecutive items (a topic or sub-session). */
export interface Group {
  id: string
  workshopId: string
  /** null = parking lot */
  dayId: string | null
  /** Shared with the ungrouped items of the same day. */
  position: number
  title: string
}

export interface Item {
  id: string
  workshopId: string
  /** null = parking lot; members of a group have their group's day. */
  dayId: string | null
  /** Among the day's groups and ungrouped items, or within the group when groupId is set. */
  position: number
  groupId: string | null
  kind: ItemKind
  title: string
  description: string
  /** Minutes; always 0 for markers and notes. */
  duration: number
  /** Minutes after midnight, or null when the item flows. */
  fixedStart: number | null
  goal: string
  method: string
  lead: string
  notes: string
  materials: Material[]
  attachmentIds: string[]
  /** Slides shown for this step, in order (docs/slides.md). */
  slides: Slide[]
  categoryId: string | null
  /** Overrides the category's colour. */
  color: PaletteKey | null
}

/** One slide: markup in the slide format, sanitised on write and on render (src/domain/slides.ts). */
export interface Slide {
  id: string
  html: string
}

/** A picture slides show, stored once by content hash (data/files/assets). */
export interface Asset {
  hash: string
  mime: string
  size: number
  createdAt: string
}

/** A deck in the slide pool: uploaded once, its slides are picked into items and library entries as copies. */
export interface Deck {
  id: string
  title: string
  theme: string
  /** Where it came from (the file name of the original). */
  source: string
  createdAt: string
  slides: number
}

export interface DeckSlide {
  id: string
  deckId: string
  position: number
  html: string
  /** A short caption for the picker (the slide's title). */
  caption: string
}

/** A named slide to start new slides from (docs/slides.md, section 7), shared by all workshops; inserting makes a copy. */
export interface SlideTemplate {
  id: string
  name: string
  /** The layout of its markup, for grouping in the picker. */
  layout: string
  html: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: string
  workshopId: string
  name: string
  mime: string
  size: number
  createdAt: string
}

/** Everything the planner needs for one workshop. */
export interface WorkshopState {
  workshop: Workshop
  days: Day[]
  groups: Group[]
  items: Item[]
  attachments: Attachment[]
  /** Set when a guest opens the workshop. */
  access?: Access
}

/** One row of the workshops list. */
export interface WorkshopSummary {
  id: string
  title: string
  client: string
  location: string
  archived: boolean
  firstDate: string | null
  lastDate: string | null
  itemCount: number
  /** Number of days. */
  days: number
  /** Length of the agenda: per day from its start to its computed end (breaks included, parked items not), summed. */
  minutes: number
  updatedAt: string
}

/** The content of an item without its place in a workshop (library entries, copies). */
export type ItemContent = Pick<Item, 'kind' | 'title' | 'description' | 'duration' | 'goal' | 'method' | 'lead' | 'notes' | 'materials' | 'slides' | 'categoryId' | 'color'>

export type LibraryEntry =
  | { id: string; kind: 'item'; title: string; data: ItemContent; createdAt: string; updatedAt: string }
  | { id: string; kind: 'group'; title: string; data: { items: ItemContent[] }; createdAt: string; updatedAt: string }

export type MemberRole = 'view' | 'edit'

/** A guest with access to one workshop; e-mail as the login reports it (lower case). */
export interface Member {
  workshopId: string
  email: string
  role: MemberRole
  /** Facilitation notes visible; always true for edit. */
  showNotes: boolean
  addedAt: string
  lastSeenAt: string | null
}

/** Who is signed in: the owner sees everything, a guest only the workshops shared with them. */
export interface Me {
  email: string | null
  owner: boolean
}

/** A guest's access to the open workshop (absent for the owner). */
export interface Access {
  role: MemberRole
  showNotes: boolean
}
