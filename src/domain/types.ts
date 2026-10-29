export type Locale = 'de' | 'en'

export type ItemKind = 'block' | 'break' | 'marker' | 'note'

/** Kinds that take no time on the timeline (docs/concept.md, section 2). */
export const ZERO_KINDS: readonly ItemKind[] = ['marker', 'note']

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

export interface Item {
  id: string
  workshopId: string
  /** null = parking lot */
  dayId: string | null
  position: number
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
