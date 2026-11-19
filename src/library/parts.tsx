import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { FileText, Paperclip, Presentation } from 'lucide-react'
import type { Category, ItemContent, LibraryEntry, Slide, Worksheet } from '@/domain/types'
import { entryItems } from '@/domain/copy'
import { durationOf } from '@/domain/time'
import { GROUPS, holdsOf, NO_CATEGORY } from '@/domain/libraryView'
import { slideAssets } from '@/domain/slides'
import { api } from '@/api'
import { useLibrary } from '@/store/useLibrary'
import { categoryName, stripColor } from '@/store/useSettings'
import { cx } from '@/components/ui'
import { FileManager } from '@/planner/FileManager'
import { SlideEditor } from '@/slides/editor/SlideEditor'
import { listSource } from '@/slides/editor/source'
import { WorksheetList } from '@/worksheets/WorksheetList'
import { useSheetBrand, useStepFacts } from '@/worksheets/SheetView'

/** What the library's pages share: how an entry is named, coloured and summed up, and the editors of what it holds. */

/** Where the page of an entry is. */
export const entryPath = (id: string): string => `/library/${encodeURIComponent(id)}`

/** The name of a section of the library: its category's, or the two that are not one. */
export const sectionName = (key: string, categories: Category[], t: TFunction): string => {
  if (key === GROUPS) return t('library.groups')
  const category = categories.find((c) => c.id === key)
  return category ? categoryName(category, t) : t('library.noCategory')
}

/** The colour of a section's dot; the two sections that are no category have a quiet one. */
export const sectionColor = (key: string, categories: Category[]): string => {
  const category = key === NO_CATEGORY || key === GROUPS ? undefined : categories.find((c) => c.id === key)
  return category ? `var(--c-${category.color})` : 'var(--line-2)'
}

/**
 * The rail of an entry, as the agenda draws it: an item's own colour or its category's; a group shows what is inside,
 * its items' colours, each as long as the item lasts (as a folded group does in the agenda).
 */
export function railOf(entry: LibraryEntry, categories: Category[]): string {
  if (entry.kind === 'item') return stripColor(entry.data, categories)
  const timed = entry.data.items.filter((i) => durationOf(i) > 0)
  const total = timed.reduce((sum, i) => sum + durationOf(i), 0)
  if (!total) return 'var(--line-2)'
  let at = 0
  const stops = timed.map((i) => {
    const from = (at / total) * 100
    at += durationOf(i)
    return `${stripColor(i, categories)} ${from.toFixed(1)}% ${((at / total) * 100).toFixed(1)}%`
  })
  return `linear-gradient(${stops.join(', ')})`
}

/** The slide that stands for an entry: its first one, over a group's items in their order. */
export const coverOf = (entry: LibraryEntry): Slide | null => entryItems(entry).flatMap((i) => i.slides)[0] ?? null

/** One line of what an entry is: an item's description (or its goal or method), a group's items. */
export function summaryOf(entry: LibraryEntry, t: TFunction): string {
  if (entry.kind === 'group') return `${t('library.items', { count: entry.data.items.length })}: ${entry.data.items.map((i) => i.title || t(`kinds.${i.kind}`)).join(' · ')}`
  const i = entry.data
  return (i.description || i.goal || i.method).trim()
}

/** What an entry holds, as signs with numbers: slides, worksheets, files. Nothing for an entry that holds none. */
export function HoldsLine({ entry, className }: { entry: LibraryEntry; className?: string }) {
  const { t } = useTranslation()
  const holds = holdsOf(entry)
  if (!holds.slides && !holds.sheets && !holds.files) return null
  const sign = (count: number, label: string, icon: React.ReactNode) =>
    count > 0 && (
      <span className="inline-flex items-center gap-1" title={label} aria-label={label}>
        {icon}
        <span aria-hidden>{count}</span>
      </span>
    )
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-2.5 text-[12.5px] text-ink-2 tnum', className)}>
      {sign(holds.slides, t('slides.count', { count: holds.slides }), <Presentation size={14} strokeWidth={1.75} aria-hidden />)}
      {sign(holds.sheets, t('sheets.count', { count: holds.sheets }), <FileText size={14} strokeWidth={1.75} aria-hidden />)}
      {sign(holds.files, t('files.count', { count: holds.files }), <Paperclip size={14} strokeWidth={1.75} aria-hidden />)}
    </span>
  )
}

/** An entry's slides as the store has them now, and how to store a new list (shown at once, saved in order). */
export function slideList(entryId: string, failed: (err: unknown) => void) {
  const entryNow = () => {
    const e = useLibrary.getState().entries.find((x) => x.id === entryId)
    return e?.kind === 'item' ? e : undefined
  }
  return {
    get: (): Slide[] => entryNow()?.data.slides ?? [],
    set: (slides: Slide[]) => {
      const e = entryNow()
      if (e) void useLibrary.getState().save({ kind: 'item', title: e.title, data: { ...e.data, slides } }, entryId).catch(failed)
    },
  }
}

/** The slide editor on one library entry: who changes the library edits its slides, everybody else pages through them. */
export function LibrarySlideEditor({ entryId, start, mode, theme, owner, onClose, onFailed }: { entryId: string; start: string; mode: 'view' | 'edit'; theme: string; owner: boolean; onClose: () => void; onFailed: (err: unknown) => void }) {
  const { t } = useTranslation()
  const entry = useLibrary((s) => s.entries.find((e) => e.id === entryId))
  if (!entry || entry.kind !== 'item') return null
  const list = slideList(entryId, onFailed)
  const source = listSource({ context: t('editor.ctx.library'), label: entry.title, get: list.get, set: list.set, editable: owner })
  const known = [...new Set(entry.data.slides.flatMap((s) => slideAssets(s.html)))]
  return <SlideEditor source={source} start={start} mode={owner ? mode : 'view'} onClose={onClose} theme={theme} scope="library" owner={owner} canEdit={owner} known={known} />
}

/** The files of one item of an entry; a workshop gets copies of them when the entry is inserted, and keeps those whatever happens here. */
export function EntryFiles({ entry, item, compact }: { entry: LibraryEntry; item: number; compact?: boolean }) {
  const { t } = useTranslation()
  const changeFiles = useLibrary((s) => s.changeFiles)
  const files = entryItems(entry)[item].attachmentIds.flatMap((id) => entry.attachments.filter((a) => a.id === id))
  return (
    <FileManager
      files={files}
      href={api.libraryFileUrl}
      compact={compact}
      onUpload={(file) => changeFiles(entry.id, () => api.uploadLibraryFile(entry.id, item, file))}
      onRename={(id, name) => changeFiles(entry.id, () => api.renameLibraryFile(id, name))}
      onReplace={(id, file) => changeFiles(entry.id, () => api.replaceLibraryFile(id, file))}
      remove={{
        label: t('common.delete'),
        danger: true,
        run: async (a) => {
          if (window.confirm(t('files.deleteLibraryConfirm', { name: a.name }))) await changeFiles(entry.id, () => api.deleteLibraryFile(a.id))
        },
      }}
    />
  )
}

/** The files of one item of an entry to download, for who only reads the library. */
export function EntryFileLinks({ entry, item }: { entry: LibraryEntry; item: number }) {
  const files = entryItems(entry)[item].attachmentIds.flatMap((id) => entry.attachments.filter((a) => a.id === id))
  if (!files.length) return null
  return (
    <ul className="space-y-1 text-[13.5px]">
      {files.map((a) => (
        <li key={a.id}>
          <a href={api.libraryFileUrl(a.id)} download={a.name} className="inline-flex min-h-7 items-center gap-1.5 text-ink-2 hover:text-ink hover:underline">
            <Paperclip size={13} className="shrink-0 text-ink-3" aria-hidden />
            {a.name}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** An entry's worksheets in the theme and with the logo of the settings, as a new workshop would print them. */
export function LibrarySheets({ sheets, step, onChange }: { sheets: Worksheet[]; step: ItemContent; onChange?: (next: Worksheet[]) => void }) {
  const brand = useSheetBrand('')
  const facts = useStepFacts()
  return <WorksheetList sheets={sheets} onChange={onChange} scope="library" theme={brand.theme} logo={brand.logo} facts={facts(step)} />
}
