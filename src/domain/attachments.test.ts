import { describe, expect, it } from 'vitest'
import { ACCEPTED_FILES, extensionOf, fileKind } from './attachments'
import { entryItems, fromLibrary, withFilesOf } from './copy'
import type { ItemContent, LibraryEntry } from './types'

describe('what may be attached', () => {
  it('knows the allowed kinds by their ending, in any case', () => {
    expect(['a.pdf', 'b.PNG', 'c.docx', 'd.md', 'e.xlsx', 'f.pptx'].map(fileKind)).toEqual(['pdf', 'image', 'document', 'markdown', 'spreadsheet', 'presentation'])
  })

  it('refuses everything else, macro documents and double endings too', () => {
    for (const name of ['a.exe', 'a.html', 'a.docm', 'a.pdf.exe', 'pdf', '.pdf', 'a.']) expect(fileKind(name)).toBeNull()
  })

  it('reads the ending and offers it to the file picker', () => {
    expect(extensionOf('Plan v2.final.PDF')).toBe('pdf')
    expect(extensionOf('Plan')).toBe('')
    expect(ACCEPTED_FILES.split(',')).toEqual(expect.arrayContaining(['.pdf', '.pptx', '.md']))
  })
})

describe('files of library entries', () => {
  const content = (title: string, attachmentIds: string[] = []): ItemContent => ({ kind: 'block', title, description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds, slides: [], categoryId: null, color: null })
  const base = { id: 'e', attachments: [], createdAt: '', updatedAt: '' }
  const group: LibraryEntry = { ...base, kind: 'group', title: 'G', data: { items: [content('A', ['l1']), content('B', ['l2', 'l3'])] } }

  it('links the new items to the workshop copies, and to nothing that was not copied', () => {
    const { items } = fromLibrary(group, 'w', null, null, 0, { l1: 'c1', l3: 'c3' })
    expect(items.map((i) => i.attachmentIds)).toEqual([['c1'], ['c3']])
    expect(fromLibrary(group, 'w', null, null, 0).items.map((i) => i.attachmentIds)).toEqual([[], []])
  })

  it('keeps the stored file lists through a save, item by item', () => {
    const saved = withFilesOf({ kind: 'group' as const, title: 'neu', data: { items: [content('A2'), content('B2', ['stale'])] } }, group)
    expect(entryItems(saved).map((c) => [c.title, c.attachmentIds])).toEqual([['A2', ['l1']], ['B2', ['l2', 'l3']]])
  })
})
