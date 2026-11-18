import { agendaOrder } from './order.ts'
import { sheetsToPack } from './printing.ts'
import type { Item, Material, PackingState, WorkshopState } from './types.ts'

/** The packing list of a workshop (docs/concept.md, section 5). */

export interface PackingLine {
  key: string
  label: string
  /** Largest quantity of any single item: two steps with two flipcharts each need two flipcharts. */
  suggested: number
  /** What to pack: the override when set, otherwise the suggestion. */
  qty: number
  itemIds: string[]
  /** Entries of the workshop-wide material on this line (removable from the packing list). */
  workshopMaterialIds: string[]
  links: string[]
  state: PackingState
  /** A file the workshop prints (docs/worksheets.md): its copies as the print rule asks. */
  sheet?: boolean
  /** A printed file whose copies need the number of participants, which is not set. */
  unknown?: boolean
}

/** A printed file as the packing list takes it: on its step, with the copies its rule asks for. */
export interface SheetToPack {
  itemId: string
  label: string
  qty: number | null
}

export const packingKey = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ')

/** Workshop-wide material first, then the items in agenda order (placed items only), in the order things are first needed. */
export function packingList(items: Item[], packing: Record<string, PackingState>, workshopMaterials: Material[] = [], sheets: SheetToPack[] = []): PackingLine[] {
  const lines = new Map<string, PackingLine>()
  const sources: { id: string | null; materials: Material[] }[] = [{ id: null, materials: workshopMaterials }, ...items]
  for (const item of sources) {
    for (const m of item.materials) {
      const key = packingKey(m.label)
      if (!key) continue
      let line = lines.get(key)
      if (!line) {
        line = { key, label: m.label.trim(), suggested: 0, qty: 0, itemIds: [], workshopMaterialIds: [], links: [], state: packing[key] ?? {} }
        lines.set(key, line)
      }
      line.suggested = Math.max(line.suggested, m.qty || 1)
      if (item.id === null) line.workshopMaterialIds.push(m.id)
      else if (!line.itemIds.includes(item.id)) line.itemIds.push(item.id)
      if (m.link && !line.links.includes(m.link)) line.links.push(m.link)
    }
  }
  // Printed files after the material, as their own lines (the same file on two steps is one line, the larger count).
  for (const sheet of sheets) {
    const key = packingKey(sheet.label)
    if (!key) continue
    let line = lines.get(key)
    if (!line) {
      line = { key, label: sheet.label.trim(), suggested: 0, qty: 0, itemIds: [], workshopMaterialIds: [], links: [], state: packing[key] ?? {}, sheet: true }
      lines.set(key, line)
    }
    if (sheet.qty === null) line.unknown = true
    else line.suggested = Math.max(line.suggested, sheet.qty)
    if (!line.itemIds.includes(sheet.itemId)) line.itemIds.push(sheet.itemId)
  }
  for (const line of lines.values()) line.qty = line.state.qty ?? line.suggested
  return [...lines.values()]
}

/** The workshop's packing list: placed steps only, in agenda order, with the files it prints. */
export const workshopPacking = (state: WorkshopState): PackingLine[] => packingList(agendaOrder(state.days, state), state.workshop.packing, state.workshop.materials, sheetsToPack(state))
