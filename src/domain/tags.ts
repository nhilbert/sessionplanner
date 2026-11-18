/** Tags of library entries: free words to filter by. Shared by the app and the server. */

export const MAX_TAGS = 30
export const MAX_TAG_LENGTH = 50

/** The same tag whatever its capitals. */
const key = (tag: string) => tag.toLocaleLowerCase()

/** Tags as they are stored: trimmed, inner whitespace folded, no commas, none empty, none twice (capitals aside; the first spelling stays). */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.replace(/[,\s]+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
    if (!tag || seen.has(key(tag))) continue
    seen.add(key(tag))
    out.push(tag)
  }
  return out.slice(0, MAX_TAGS)
}

/** What was typed into a tag field: several tags separated by commas. */
export const parseTags = (typed: string): string[] => normalizeTags(typed.split(','))

/** The tags after adding some and removing others (capitals aside). */
export function changeTags(current: readonly string[], add: readonly string[] = [], remove: readonly string[] = []): string[] {
  const gone = new Set(remove.map(key))
  return normalizeTags([...current, ...add]).filter((t) => !gone.has(key(t)))
}

export const hasTag = (tags: readonly string[], tag: string): boolean => tags.some((t) => key(t) === key(tag))

/** Every tag in use with the number of entries that carry it, by name. The spelling is the first one met. */
export function tagCounts(lists: readonly (readonly string[])[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const tags of lists)
    for (const tag of tags) {
      const c = counts.get(key(tag))
      if (c) c.count++
      else counts.set(key(tag), { tag, count: 1 })
    }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }))
}

/** The tags of the rows by use: the most used first, equal counts by name (the filter's order). */
export const tagsByUse = (lists: readonly (readonly string[])[]): { tag: string; count: number }[] => tagCounts(lists).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }))
