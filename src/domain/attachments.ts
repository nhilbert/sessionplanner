/** What may be attached, in the browser and on the server (docs/concept.md, section 5). */

export const MAX_ATTACHMENT = 5 * 1024 * 1024

const KINDS = {
  pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'],
  document: ['doc', 'docx', 'odt', 'rtf', 'txt'],
  markdown: ['md', 'markdown'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv'],
  presentation: ['ppt', 'pptx', 'odp'],
} as const

export type FileKind = keyof typeof KINDS

/** The file picker's filter. */
export const ACCEPTED_FILES = Object.values(KINDS)
  .flat()
  .map((x) => `.${x}`)
  .join(',')

/** The ending of a file name in lower case, without the dot; '' when it has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** What kind of file a name stands for; null for anything that may not be attached (older files may still be of such a type). */
export function fileKind(name: string): FileKind | null {
  const ext = extensionOf(name)
  return (Object.keys(KINDS) as FileKind[]).find((k) => (KINDS[k] as readonly string[]).includes(ext)) ?? null
}
