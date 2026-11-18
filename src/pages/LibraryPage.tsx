import { type ReactNode, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coffee, Flag, FolderOpen, LayoutGrid, List, NotebookPen, Package, Paperclip, Pencil, Presentation, Square, StickyNote, Trash2 } from 'lucide-react'
import { type Category, type ItemContent, type ItemKind, type LibraryEntry, type LibraryEntryInput, type PaletteKey, TRASH_DAYS } from '@/domain/types'
import { durationOf, formatDuration } from '@/domain/time'
import { libraryText, matchesWords, useLibrary } from '@/store/useLibrary'
import { categoryName, itemColor, useLibraryEdit, useSettings } from '@/store/useSettings'
import { Button, cx, Empty, Field, Modal, PageHeader, SearchField, SectionLabel, Segmented, useLocalState } from '@/components/ui'
import { ariaSort, BulkBar, NoticeBar, SelectAll, SelectBox, type Selection, shortDate, SortControl, SortHead, type SortOption, TagEditor, TagFilter, TagInput, TagList, TrashSection, useNotice, useSelection, useSort } from '@/components/collection'
import { hasTag, tagCounts } from '@/domain/tags'
import { api, reportFailure } from '@/api'
import { entryItems } from '@/domain/copy'
import { FileManager } from '@/planner/FileManager'
import Swatches from '@/components/Swatches'
import { DurationField, TextField } from '@/planner/fields'
import { SlideStrip } from '@/slides/SlideStrip'
import { WorksheetList } from '@/worksheets/WorksheetList'
import { useSheetBrand, useStepFacts } from '@/worksheets/SheetView'
import { SlideView } from '@/slides/SlideView'
import { SlideEditor } from '@/slides/editor/SlideEditor'
import { listSource } from '@/slides/editor/source'
import { slideAssets } from '@/domain/slides'
import { useViewTheme, ViewThemeSelect } from '@/slides/ThemeSelect'
import type { Slide, Worksheet } from '@/domain/types'

const KIND_ICON: Record<ItemKind, ReactNode> = {
  block: <Square size={12} />,
  break: <Coffee size={12} />,
  marker: <Flag size={12} />,
  note: <StickyNote size={12} />,
}
const GROUP_PREVIEW = 6

const minutesOf = (e: LibraryEntry) => entryItems(e).reduce((s, i) => s + durationOf(i), 0)

/**
 * The shared library, as a list to sort or as cards with what each entry holds. A search and the tags narrow it;
 * ticked entries are tagged, coloured or deleted together. A tap opens an entry; its slides open to look at, with
 * editing a click away. Deleted entries wait in the trash at the end. Inserting happens in a workshop (library tab).
 * Who may only read it (a guest with the library switched on, server/access.ts; a reader the host names, `Me.libraryEdit`)
 * gets it as it is, without ticks, editing or the trash.
 */
export default function LibraryPage() {
  const { t } = useTranslation()
  const { entries, loaded, load, loadTrash, save, change, trash, restore, purge } = useLibrary()
  const categories = useSettings((s) => s.settings.categories)
  // Who changes the library; everybody else who gets here reads it.
  const owner = useLibraryEdit()
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  /** Only entries that hold a worksheet. */
  const [withSheets, setWithSheets] = useState(false)
  const [layout, setLayout] = useLocalState('sp.library.view', 'list')
  const [open, setOpen] = useState<string | null>(null)
  const [bulkEdit, setBulkEdit] = useState(false)
  /** The slide editor on an entry's slides (from a thumbnail on its card or in its details). */
  const [editing, setEditing] = useState<{ entryId: string; key: string; mode: 'view' | 'edit' } | null>(null)
  /** The slides shown in another theme, to see how they look there. */
  const [view, setView] = useViewTheme('sp.library.theme')
  const usual = useSettings((s) => s.settings.theme)
  const theme = view || usual || 'default'
  const { notice, show, close } = useNotice()
  useEffect(() => {
    const read = () => {
      void load()
      if (owner) void loadTrash()
    }
    read()
    // Back in this tab: an agent (or another window) may have changed entries meanwhile, and an edit here is laid
    // over the entry as this page has it.
    const again = () => {
      if (document.visibilityState === 'visible') read()
    }
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load, loadTrash, owner])
  /** A failed save or delete (the entry may be gone): say so, and show the library as it is now. */
  const failed = (err: unknown) => {
    reportFailure(err)
    void load()
    void loadTrash()
  }

  const options: SortOption<LibraryEntry>[] = [
    { key: 'title', label: t('list.title'), value: (e) => e.title },
    { key: 'duration', label: t('item.duration'), value: minutesOf, first: 'desc' },
    { key: 'created', label: t('list.created'), value: (e) => e.createdAt, first: 'desc' },
    { key: 'updated', label: t('list.updated'), value: (e) => e.updatedAt, first: 'desc' },
  ]
  const { sort, setSort, toggle, sorted } = useSort('sp.library.sort', options, { key: 'title', dir: 'asc' })
  const searching = query.trim() !== ''
  const found = entries.filter((e) => !searching || matchesWords(libraryText(e, categories, t), query))
  const shown = sorted(found.filter((e) => tags.every((tag) => hasTag(e.tags, tag)) && (!withSheets || hasWorksheet(e))))
  const selection = useSelection(shown.map((e) => e.id))
  const known = tagCounts(entries.map((e) => e.tags)).map((c) => c.tag)
  const picked = shown.filter((e) => selection.has(e.id))

  /** Into the trash without asking: the note offers the way back, and the trash keeps them TRASH_DAYS days. */
  const toTrash = (ids: string[]) =>
    change({ ids, trash: true }).then(() => {
      selection.clear()
      if (open && ids.includes(open)) setOpen(null)
      show({ text: t('library.trashed', { count: ids.length }), undo: () => void restore(ids).then(loadTrash, failed) })
    }, failed)
  const saveEntry = (id: string) => (x: LibraryEntryInput) => void save(x, id).catch(failed)
  const row = (e: LibraryEntry) => ({
    entry: e,
    theme,
    open: open === e.id,
    selection: owner ? selection : null,
    onToggle: () => setOpen(open === e.id ? null : e.id),
    onOpenSlide: (key: string, mode: 'view' | 'edit') => setEditing({ entryId: e.id, key, mode: owner ? mode : 'view' }),
    details: !owner ? <EntryView entry={e} theme={theme} onOpenSlide={(key) => setEditing({ entryId: e.id, key, mode: 'view' })} /> : <EntryDetails entry={e} theme={theme} known={known} onSave={saveEntry(e.id)} onDelete={() => void toTrash([e.id])} onOpenSlide={(key, mode) => setEditing({ entryId: e.id, key, mode })} list={slideList(e.id, failed)} />,
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className={cx('mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-10', selection.ids.length > 0 && 'pb-28')}>
        <PageHeader title={t('nav.library')} subtitle={t('library.subtitle')} right={entries.length > 0 && <ViewThemeSelect value={view} onChange={setView} />} />
        {entries.length > 0 && (
          <div className="mb-4 space-y-3">
            <SearchField value={query} onChange={setQuery} placeholder={t('library.search')} shortcut />
            <TagFilter rows={found.map((e) => e.tags)} active={tags} onChange={setTags} />
            {entries.some(hasWorksheet) && (
              <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={withSheets} onChange={(e) => setWithSheets(e.target.checked)} />
                {t('sheets.filter')}
              </label>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {owner ? <SelectAll selection={selection} count={shown.length} /> : <span className="text-[13px] text-ink-3">{t('library.readOnly')}</span>}
              <span className="ml-auto" />
              <SortControl options={options} sort={sort} onChange={setSort} />
              <Segmented
                size="sm"
                value={layout === 'cards' ? 'cards' : 'list'}
                onChange={setLayout}
                options={[
                  { value: 'list', label: <span className="inline-flex items-center gap-1" title={t('list.asList')}><List size={13} /><span className="sr-only md:not-sr-only">{t('list.asList')}</span></span> },
                  { value: 'cards', label: <span className="inline-flex items-center gap-1" title={t('list.asCards')}><LayoutGrid size={13} /><span className="sr-only md:not-sr-only">{t('list.asCards')}</span></span> },
                ]}
              />
            </div>
          </div>
        )}
        {loaded && !entries.length && <Empty title={t('library.empty')} body={t(owner ? 'library.emptyHint' : 'library.emptyGuest')} />}
        {entries.length > 0 && !shown.length && (
          <div className="py-10 text-center text-[14px] text-ink-2">
            <p>{searching ? t('library.noMatch', { q: query.trim() }) : t('library.noTagMatch')}</p>
            {tags.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTags([])}>
                {t('tags.clear')}
              </Button>
            )}
          </div>
        )}
        {shown.length > 0 &&
          (layout === 'cards' ? (
            <ul className="grid items-start gap-3 md:grid-cols-2">
              {shown.map((e) => (
                <li key={e.id} className={cx('card overflow-hidden', open === e.id && 'md:col-span-2', selection.has(e.id) && 'ring-1 ring-accent')}>
                  <CardRow {...row(e)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left text-[14px]">
                <thead className="hidden border-b border-line md:table-header-group">
                  <tr>
                    {owner && <th className="w-10" />}
                    <th scope="col" aria-sort={ariaSort('title', sort)} className="px-2 py-2 font-normal">
                      <SortHead id="title" label={t('list.title')} sort={sort} onToggle={toggle} />
                    </th>
                    <th scope="col" aria-sort={ariaSort('duration', sort)} className="w-24 px-2 py-2 text-right font-normal">
                      <SortHead id="duration" label={t('item.duration')} sort={sort} onToggle={toggle} />
                    </th>
                    <th scope="col" aria-sort={ariaSort('created', sort)} className="hidden w-32 px-2 py-2 font-normal lg:table-cell">
                      <SortHead id="created" label={t('list.created')} sort={sort} onToggle={toggle} />
                    </th>
                    <th scope="col" aria-sort={ariaSort('updated', sort)} className="w-32 px-2 py-2 pr-4 font-normal">
                      <SortHead id="updated" label={t('list.updated')} sort={sort} onToggle={toggle} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => (
                    <ListRow key={e.id} {...row(e)} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        <TrashSection
          rows={!owner || searching || tags.length ? [] : trash}
          hint={t('library.trashHint', { days: TRASH_DAYS })}
          meta={(r) => <span>{r.kind === 'group' ? t('library.kindGroup') : t('library.kindItem')}</span>}
          onRestore={(r) => void restore([r.id]).then(loadTrash, failed)}
          onPurge={(rows) => void purge(rows.map((r) => r.id)).catch(failed)}
          purgeConfirm={(rows) => (rows.length === 1 ? t('library.purgeConfirm', { title: rows[0].title }) : t('library.purgeAllConfirm', { count: rows.length }))}
        />
        <BulkBar count={owner ? selection.ids.length : 0} onClear={selection.clear}>
          <Button size="sm" onClick={() => setBulkEdit(true)}>
            <Pencil size={13} />
            {t('library.bulkEdit')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void toTrash(selection.ids)}>
            <Trash2 size={13} />
            {t('common.delete')}
          </Button>
        </BulkBar>
        {bulkEdit && (
          <BulkEdit
            entries={picked}
            known={known}
            onClose={() => setBulkEdit(false)}
            onApply={(patch) =>
              change({ ids: picked.map((e) => e.id), ...patch }).then(() => {
                setBulkEdit(false)
                show({ text: t('library.changed', { count: picked.length }) })
              }, failed)
            }
          />
        )}
        <NoticeBar notice={notice} onClose={close} raised={selection.ids.length > 0} />
        {editing && <LibrarySlideEditor key={editing.entryId} theme={theme} entryId={editing.entryId} start={editing.key} mode={editing.mode} owner={owner} onClose={() => setEditing(null)} onFailed={failed} />}
      </div>
    </div>
  )
}

type TagChoice = 'keep' | 'all' | 'none'

/**
 * Tags, category and colour for all ticked entries at once. A tag some of them carry starts as it is and is, click by
 * click, given to all, taken from all, or left again; nothing changes that is not chosen here.
 */
function BulkEdit({ entries, known, onClose, onApply }: { entries: LibraryEntry[]; known: string[]; onClose: () => void; onApply: (patch: { addTags?: string[]; removeTags?: string[]; categoryId?: string | null; color?: PaletteKey | null }) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const categories = useSettings((s) => s.settings.categories)
  const present = tagCounts(entries.map((e) => e.tags))
  const [choice, setChoice] = useState<Record<string, TagChoice>>({})
  const [added, setAdded] = useState<string[]>([])
  const [category, setCategory] = useState('keep')
  const [color, setColor] = useState<PaletteKey | null | undefined>(undefined)
  const cycle = (tag: string, partial: boolean) => {
    const now = choice[tag] ?? 'keep'
    const next: TagChoice = now === 'keep' ? (partial ? 'all' : 'none') : now === 'all' ? 'none' : 'keep'
    setChoice({ ...choice, [tag]: next })
  }
  const addTags = [...present.filter((c) => choice[c.tag] === 'all').map((c) => c.tag), ...added]
  const removeTags = present.filter((c) => choice[c.tag] === 'none').map((c) => c.tag)
  const dirty = addTags.length > 0 || removeTags.length > 0 || category !== 'keep' || color !== undefined
  return (
    <Modal open onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (dirty) onApply({ addTags, removeTags, ...(category !== 'keep' ? { categoryId: category || null } : {}), ...(color !== undefined ? { color } : {}) })
        }}
      >
        <h2 className="text-lg font-medium">{t('library.bulkTitle', { count: entries.length })}</h2>
        <Field label={t('tags.label')} hint={present.length ? t('library.bulkTagsHint') : undefined}>
          <div className="flex flex-wrap items-center gap-1.5">
            {present.map((c) => {
              const state = choice[c.tag] ?? 'keep'
              const partial = c.count < entries.length
              const label = state === 'all' ? t('library.tagToAll', { tag: c.tag }) : state === 'none' ? t('library.tagFromAll', { tag: c.tag }) : t('library.tagKept', { tag: c.tag, count: c.count, total: entries.length })
              return (
                <button
                  key={c.tag}
                  type="button"
                  role="checkbox"
                  aria-checked={state === 'all' || (state === 'keep' && !partial) ? true : state === 'none' ? false : 'mixed'}
                  aria-label={label}
                  title={label}
                  onClick={() => cycle(c.tag, partial)}
                  className={cx(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] pointer-coarse:h-9',
                    state === 'all' && 'border-accent bg-accent-soft text-accent',
                    state === 'none' && 'border-line text-ink-3 line-through',
                    state === 'keep' && 'border-line bg-surface-2 text-ink-2',
                  )}
                >
                  {c.tag}
                  {state === 'keep' && partial && (
                    <span className="text-[12px] text-ink-3 tnum">
                      {c.count}/{entries.length}
                    </span>
                  )}
                </button>
              )
            })}
            {added.map((tag) => (
              <button key={tag} type="button" title={t('tags.remove', { tag })} onClick={() => setAdded(added.filter((x) => x !== tag))} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 text-[13px] text-accent pointer-coarse:h-9">
                + {tag}
              </button>
            ))}
            <TagInput id={id} known={known.filter((k) => !hasTag(added, k) && !present.some((c) => hasTag([c.tag], k) && c.count === entries.length))} onAdd={(more) => setAdded([...added, ...more.filter((m) => !hasTag(added, m))])} />
          </div>
        </Field>
        <Field label={t('item.category')}>
          <select className="field h-8 text-[13px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="keep">{t('library.unchanged')}</option>
            <option value="">{t('item.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c, t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('item.color')}>
          {color === undefined ? (
            <Button size="sm" onClick={() => setColor(null)}>
              {t('library.changeColor')}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Swatches value={color} allowNone onChange={setColor} />
              <Button size="sm" variant="ghost" onClick={() => setColor(undefined)}>
                {t('library.unchanged')}
              </Button>
            </div>
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={!dirty}>
            {t('library.apply')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** An entry's slides as the store has them now, and how to store a new list (shown at once, saved in order). */
function slideList(entryId: string, failed: (err: unknown) => void) {
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

/** The slide editor on one library entry. */
/** The owner edits an entry's slides; a guest pages through them. */
function LibrarySlideEditor({ entryId, start, mode, theme, owner, onClose, onFailed }: { entryId: string; start: string; mode: 'view' | 'edit'; theme: string; owner: boolean; onClose: () => void; onFailed: (err: unknown) => void }) {
  const { t } = useTranslation()
  const entry = useLibrary((s) => s.entries.find((e) => e.id === entryId))
  if (!entry || entry.kind !== 'item') return null
  const list = slideList(entryId, onFailed)
  const source = listSource({ context: t('editor.ctx.library'), label: entry.title, get: list.get, set: list.set, editable: owner })
  const known = [...new Set(entry.data.slides.flatMap((s) => slideAssets(s.html)))]
  return <SlideEditor source={source} start={start} mode={owner ? mode : 'view'} onClose={onClose} theme={theme} scope="library" owner={owner} canEdit={owner} known={known} />
}

/** The files of one item of an entry; a workshop gets copies of them when the entry is inserted, and keeps those whatever happens here. */
function EntryFiles({ entry, item, compact }: { entry: LibraryEntry; item: number; compact?: boolean }) {
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

/** How many files an entry holds, for its card. */
function FileCount({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1">
      <Paperclip size={12} />
      {t('files.count', { count: entry.attachments.length })}
    </span>
  )
}

/** A small coloured dot with the category's name (or the colour alone when the item has its own colour only). */
function CategoryTag({ item, categories }: { item: ItemContent; categories: Category[] }) {
  const { t } = useTranslation()
  const category = categories.find((c) => c.id === item.categoryId)
  const color = itemColor(item, categories)
  if (!category && !color) return null
  return (
    <span className="inline-flex items-center gap-1">
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--c-${color})` }} />}
      {category && categoryName(category, t)}
    </span>
  )
}

/** The face of an entry: everything worth knowing before inserting it. */
function EntryCard({ entry, theme, slides = true }: { entry: LibraryEntry; theme: string; /** Thumbnails inside the card (off where they are shown beside it, as buttons). */ slides?: boolean }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const items = entry.kind === 'group' ? entry.data.items : [entry.data]
  const minutes = items.reduce((s, i) => s + durationOf(i), 0)

  if (entry.kind === 'group') {
    const rest = entry.data.items.length - GROUP_PREVIEW
    return (
      <>
        <div className="flex items-baseline gap-2">
          <FolderOpen size={15} className="shrink-0 self-center text-ink-3" />
          <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
          <span className="shrink-0 text-[13px] text-ink-3 tnum">{formatDuration(minutes)}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-ink-3">{t('library.group', { count: items.length })}</div>
        <ol className="mt-2.5 space-y-1 border-l-2 border-line pl-3 text-[13px]">
          {entry.data.items.slice(0, GROUP_PREVIEW).map((i, n) => {
            const color = itemColor(i, categories)
            return (
              <li key={n} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />
                <span className={cx('min-w-0 flex-1 truncate', i.kind === 'break' && 'text-ink-2')}>{i.title || t(`kinds.${i.kind}`)}</span>
                <span className="shrink-0 text-[12px] text-ink-3 tnum">{durationOf(i) ? formatDuration(durationOf(i)) : ''}</span>
              </li>
            )
          })}
          {rest > 0 && <li className="text-[12px] text-ink-3">{t('library.more', { count: rest })}</li>}
        </ol>
        {entry.attachments.length > 0 && (
          <div className="mt-2 text-[12px] text-ink-3">
            <FileCount entry={entry} />
          </div>
        )}
      </>
    )
  }

  const i = entry.data
  const color = itemColor(i, categories)
  const facts = (
    [
      ['item.goal', i.goal],
      ['item.method', i.method],
      ['item.lead', i.lead],
    ] as const
  ).filter(([, v]) => v.trim())
  return (
    <div className="flex gap-3">
      <span className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
          {minutes > 0 && <span className="shrink-0 text-[13px] text-ink-3 tnum">{formatDuration(minutes)}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            {KIND_ICON[i.kind]}
            {t(`kinds.${i.kind}`)}
          </span>
          <CategoryTag item={i} categories={categories} />
        </div>
        {i.description && <p className="mt-2 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-ink-2">{i.description}</p>}
        {facts.length > 0 && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px] leading-snug">
            {facts.map(([key, v]) => (
              <div key={key} className="contents">
                <dt className="text-ink-3">{t(key)}</dt>
                <dd className="line-clamp-2 text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {slides && i.slides.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {i.slides.slice(0, 3).map((s) => (
              <SlideView key={s.id} html={s.html} theme={theme} scope="library" />
            ))}
          </div>
        )}
        {(i.materials.length > 0 || i.notes.trim() || i.slides.length > 3 || entry.attachments.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
            {i.slides.length > 3 && <span>{t('slides.count', { count: i.slides.length })}</span>}
            {i.materials.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Package size={12} className="shrink-0" />
                <span className="truncate">{i.materials.map((m) => (m.qty > 1 ? `${m.label} ×${m.qty}` : m.label)).join(', ')}</span>
              </span>
            )}
            {i.notes.trim() && (
              <span className="inline-flex items-center gap-1">
                <NotebookPen size={12} />
                {t('item.notes')}
              </span>
            )}
            {entry.attachments.length > 0 && <FileCount entry={entry} />}
          </div>
        )}
      </div>
    </div>
  )
}

interface RowProps {
  entry: LibraryEntry
  theme: string
  open: boolean
  /** The ticks: the owner's only. */
  selection: Selection | null
  onToggle: () => void
  onOpenSlide: (key: string, mode: 'view' | 'edit') => void
  /** The entry's fields, shown while it is open. */
  details: ReactNode
}

/** An entry as a line of the list: tick, title with what it is and its tags, length and dates. A click on the title opens it below. */
function ListRow({ entry, open, selection, onToggle, details }: RowProps) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const items = entryItems(entry)
  const minutes = minutesOf(entry)
  const color = entry.kind === 'item' ? itemColor(entry.data, categories) : null
  const slides = items.reduce((n, i) => n + i.slides.length, 0)
  const picked = !!selection?.has(entry.id)
  return (
    <>
      <tr className={cx('border-b border-line last:border-b-0', picked ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60', open && 'border-b-0')}>
        {selection && (
          <td className="w-10 py-1 pl-2 align-top">
            <SelectBox state={picked} onToggle={(range) => selection.toggle(entry.id, range)} label={t('list.select', { title: entry.title })} />
          </td>
        )}
        <td className={cx('px-2 py-1 align-top', !selection && 'pl-4')}>
          <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full py-1 text-left">
            <span className="flex items-center gap-2">
              {entry.kind === 'group' ? <FolderOpen size={14} className="shrink-0 text-ink-3" /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />}
              <span className="min-w-0 truncate font-medium">{entry.title}</span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                {entry.kind === 'group' ? t('library.group', { count: items.length }) : <>{KIND_ICON[entry.data.kind]}{t(`kinds.${entry.data.kind}`)}</>}
              </span>
              {entry.kind === 'item' && <CategoryTag item={entry.data} categories={categories} />}
              {slides > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Presentation size={12} />
                  {t('slides.count', { count: slides })}
                </span>
              )}
              {entry.attachments.length > 0 && <FileCount entry={entry} />}
              <span className="md:hidden">{t('list.updatedOn', { date: shortDate(entry.updatedAt) })}</span>
              <TagList tags={entry.tags} />
            </span>
          </button>
        </td>
        <td className="w-24 px-2 py-2 text-right align-top text-[13px] text-ink-2 tnum">{minutes > 0 ? formatDuration(minutes) : ''}</td>
        <td className="hidden w-32 px-2 py-2 align-top text-[13px] text-ink-3 lg:table-cell">{shortDate(entry.createdAt)}</td>
        <td className="hidden w-32 px-2 py-2 pr-4 align-top text-[13px] text-ink-3 md:table-cell">{shortDate(entry.updatedAt)}</td>
      </tr>
      {open && (
        <tr className="border-b border-line last:border-b-0">
          <td colSpan={selection ? 5 : 4} className="p-0">
            {details}
          </td>
        </tr>
      )}
    </>
  )
}

/** An entry as a card: tick beside it, the card opens its details. */
function CardRow({ entry, theme, open, selection, onToggle, onOpenSlide, details }: RowProps) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="flex items-start">
        {selection && <SelectBox state={selection.has(entry.id)} onToggle={(range) => selection.toggle(entry.id, range)} label={t('list.select', { title: entry.title })} className="ml-1.5 mt-2" />}
        <button type="button" onClick={onToggle} aria-expanded={open} className={cx('block min-w-0 flex-1 py-3 pr-4 text-left transition-colors hover:bg-surface-2/60', selection ? 'pl-1' : 'pl-4')}>
          <EntryCard entry={entry} theme={theme} slides={false} />
          <TagList tags={entry.tags} className="mt-2" />
        </button>
      </div>
      {/* The first slides: each opens the slide editor, as thumbnails do everywhere (the card itself opens the details). */}
      {!open && entry.kind === 'item' && entry.data.slides.length > 0 && (
        <div className={cx('-mt-1 grid grid-cols-3 gap-1.5 px-4 pb-3', selection ? 'pl-[52px]' : 'pl-[30px]')}>
          {entry.data.slides.slice(0, 3).map((s, n) => (
            <SlideView key={s.id} html={s.html} theme={theme} scope="library" onClick={() => onOpenSlide(s.id, 'view')} label={t('slides.slide', { n: n + 1 })} />
          ))}
        </div>
      )}
      {open && details}
    </div>
  )
}

/** An open entry as a guest reads it: its items with what they hold, the files to download, the slides to look at. */
function EntryView({ entry, theme, onOpenSlide }: { entry: LibraryEntry; theme: string; onOpenSlide: (key: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4 border-t border-line px-4 py-4 text-[14px]">
      {entryItems(entry).map((i, n) => {
        const facts = (
          [
            ['item.description', i.description],
            ['item.goal', i.goal],
            ['item.method', i.method],
            ['item.lead', i.lead],
            ['item.notes', i.notes],
          ] as const
        ).filter(([, v]) => v.trim())
        const files = i.attachmentIds.flatMap((id) => entry.attachments.filter((a) => a.id === id))
        return (
          <div key={n} className="space-y-2">
            {entry.kind === 'group' && (
              <div className="flex justify-between gap-3 font-medium">
                <span className="truncate">{i.title || t(`kinds.${i.kind}`)}</span>
                <span className="shrink-0 font-normal text-ink-3 tnum">{durationOf(i) ? formatDuration(durationOf(i)) : ''}</span>
              </div>
            )}
            {facts.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] leading-snug">
                {facts.map(([key, v]) => (
                  <div key={key} className="contents">
                    <dt className="text-ink-3">{t(key)}</dt>
                    <dd className="whitespace-pre-line text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {i.materials.length > 0 && (
              <p className="inline-flex items-center gap-1 text-[13px] text-ink-2">
                <Package size={12} className="shrink-0 text-ink-3" />
                {i.materials.map((m) => (m.qty > 1 ? `${m.label} ×${m.qty}` : m.label)).join(', ')}
              </p>
            )}
            {files.length > 0 && (
              <ul className="space-y-1 text-[13px]">
                {files.map((a) => (
                  <li key={a.id}>
                    <a href={api.libraryFileUrl(a.id)} download={a.name} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                      <Paperclip size={12} className="shrink-0 text-ink-3" />
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {entry.kind === 'item' && i.slides.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 md:grid-cols-4">
                {i.slides.map((s, k) => (
                  <SlideView key={s.id} html={s.html} theme={theme} scope="library" onClick={() => onOpenSlide(s.id)} label={t('slides.slide', { n: k + 1 })} />
                ))}
              </div>
            )}
            {entry.kind === 'item' && (i.worksheets ?? []).length > 0 && <LibrarySheets sheets={i.worksheets} step={i} />}
          </div>
        )
      })}
      <p className="text-[12px] text-ink-3">
        {t('list.createdOn', { date: shortDate(entry.createdAt) })} · {t('list.updatedOn', { date: shortDate(entry.updatedAt) })} · {t('library.insertHint')}
      </p>
    </div>
  )
}

/** The fields of an open entry. */
function EntryDetails({ entry, theme, known, onSave, onDelete, onOpenSlide, list }: { entry: LibraryEntry; theme: string; known: string[]; onSave: (e: LibraryEntryInput) => void; onDelete: () => void; onOpenSlide: (key: string, mode: 'view' | 'edit') => void; list: { get(): Slide[]; set(slides: Slide[]): void } }) {
  const { t } = useTranslation()
  const id = useId()
  const categories = useSettings((s) => s.settings.categories)
  const setItem = (patch: Partial<ItemContent>) => entry.kind === 'item' && onSave({ kind: 'item', title: patch.title ?? entry.title, data: { ...entry.data, ...patch } })
  const tagField = (
    <Field label={t('tags.label')}>
      <TagEditor id={id} tags={entry.tags} known={known} onChange={(tags) => onSave({ kind: entry.kind, title: entry.title, data: entry.data, tags } as LibraryEntryInput)} />
    </Field>
  )

  return (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {entry.kind === 'group' ? (
            <>
              <Field label={t('group.title')}>
                <TextField value={entry.title} onCommit={(title) => onSave({ kind: 'group', title, data: entry.data })} />
              </Field>
              <ol className="space-y-2 text-[14px]">
                {entry.data.items.map((i, n) => (
                  <li key={n}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{i.title || t(`kinds.${i.kind}`)}</span>
                      <span className="shrink-0 text-ink-3 tnum">{durationOf(i) ? formatDuration(durationOf(i)) : ''}</span>
                    </div>
                    {i.kind !== 'note' && <EntryFiles entry={entry} item={n} compact />}
                  </li>
                ))}
              </ol>
              {tagField}
            </>
          ) : (
            <>
              <Field label={t('item.title')}>
                <TextField value={entry.data.title} onCommit={(title) => setItem({ title })} />
              </Field>
              <Field label={t('item.description')}>
                <TextField multiline value={entry.data.description} onCommit={(description) => setItem({ description })} className="min-h-[64px]" />
              </Field>
              <div className="flex flex-wrap items-end gap-4">
                {(entry.data.kind === 'block' || entry.data.kind === 'break') && (
                  <Field label={t('item.duration')}>
                    <DurationField value={entry.data.duration} onChange={(duration) => setItem({ duration })} className="w-[104px]" aria-label={t('item.duration')} />
                  </Field>
                )}
                <Field label={t('item.category')}>
                  <select className="field h-8 text-[13px]" value={entry.data.categoryId ?? ''} onChange={(e) => setItem({ categoryId: e.target.value || null })}>
                    <option value="">{t('item.noCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryName(c, t)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t('item.color')} hint={t('item.colorHint')}>
                <Swatches value={entry.data.color} allowNone onChange={(c) => setItem({ color: c })} />
              </Field>
              {tagField}
              <Field label={t('item.notes')}>
                <TextField multiline value={entry.data.notes} onCommit={(notes) => setItem({ notes })} />
              </Field>
              {entry.data.kind !== 'note' && (
                <div>
                  <SectionLabel>{t('item.files')}</SectionLabel>
                  <EntryFiles entry={entry} item={0} />
                </div>
              )}
              <SlideStrip slides={entry.data.slides} list={list} onOpen={onOpenSlide} scope="library" theme={theme} canEdit owner />
              {entry.data.kind === 'block' && <LibrarySheets sheets={entry.data.worksheets ?? []} step={entry.data} onChange={(worksheets) => setItem({ worksheets })} />}
            </>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="mr-auto text-[12px] text-ink-3">
              {t('list.createdOn', { date: shortDate(entry.createdAt) })} · {t('list.updatedOn', { date: shortDate(entry.updatedAt) })}
            </span>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 size={14} />
              {t('common.delete')}
            </Button>
          </div>
        </div>
  )
}

/** Whether an entry holds a worksheet, on its item or on one of its group's. */
const hasWorksheet = (e: LibraryEntry): boolean => entryItems(e).some((c) => (c.worksheets ?? []).length > 0)

/** An entry's worksheets in the theme and with the logo of the settings, as a new workshop would print them. */
function LibrarySheets({ sheets, step, onChange }: { sheets: Worksheet[]; step: ItemContent; onChange?: (next: Worksheet[]) => void }) {
  const brand = useSheetBrand('')
  const facts = useStepFacts()
  return <WorksheetList sheets={sheets} onChange={onChange} scope="library" theme={brand.theme} logo={brand.logo} facts={facts(step)} />
}
