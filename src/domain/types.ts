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
  /** Start and target end of new days, minutes after midnight. */
  dayStart: number
  dayEnd: number | null
  /** Set by the server when a logo is uploaded (GET /api/settings/logo). */
  logo: { mime: string; updatedAt: string } | null
}

export const DEFAULT_SETTINGS: Settings = { categories: DEFAULT_CATEGORIES, dayStart: 540, dayEnd: 1020, logo: null }

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
  categoryId: string | null
  /** Overrides the category's colour. */
  color: PaletteKey | null
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
}

/** One row of the workshops list. */
export interface WorkshopSummary {
  id: string
  title: string
  client: string
  archived: boolean
  firstDate: string | null
  lastDate: string | null
  itemCount: number
  updatedAt: string
}

/** The content of an item without its place in a workshop (library entries, copies). */
export type ItemContent = Pick<Item, 'kind' | 'title' | 'description' | 'duration' | 'goal' | 'method' | 'lead' | 'notes' | 'materials' | 'categoryId' | 'color'>

export type LibraryEntry =
  | { id: string; kind: 'item'; title: string; data: ItemContent; createdAt: string; updatedAt: string }
  | { id: string; kind: 'group'; title: string; data: { items: ItemContent[] }; createdAt: string; updatedAt: string }
