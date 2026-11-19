import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, LayoutGrid, List, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { type Category, type LibraryEntry, TRASH_DAYS } from '@/domain/types'
import { formatDuration } from '@/domain/time'
import { facetCounts, type FacetCounts, filterCount, GROUPS, HOLDS, type Holds, knownFilter, type LibraryFilter, minutesOf, NO_FILTER, passes, sectionKeys, sectionsOf } from '@/domain/libraryView'
import { tagCounts } from '@/domain/tags'
import { libraryListView, libraryText, matchesWords, trashedOnPage, useLibrary } from '@/store/useLibrary'
import { useLibraryEdit, useSettings } from '@/store/useSettings'
import { Button, cx, Empty, isTyping, PageHeader, SearchField, Segmented, Sheet, useLocalState } from '@/components/ui'
import { BulkBar, NoticeBar, SelectAll, type Selection, SortControl, type SortOption, TagFilter, TrashSection, useNotice, useSelection, useSort } from '@/components/collection'
import { reportFailure } from '@/api'
import { BulkEdit } from '@/library/BulkEdit'
import { coverOf, entryPath, type FromList, HoldsLine, railOf, sectionColor, sectionName, summaryOf, useLibraryTheme, useReadOnReturn } from '@/library/parts'
import { SlideView } from '@/slides/SlideView'
import { ViewThemeSelect } from '@/slides/ThemeSelect'

/**
 * The shared library. The category orders the page: one section per category, the groups last. Beside it on a wide
 * screen stand the filters, each option with the number of entries it would show; a narrow screen has the sections as
 * chips under the search field, which stays in reach while the page scrolls, and the other filters in a sheet. The
 * entries show as lines to scan or as cards with their first slide; a click opens an entry's own page
 * (LibraryEntryPage), which pages through the list as it stood here; the way back finds the list as it was left. "Select" turns the entries into ticks, to tag, colour or delete several together. Deleted
 * entries wait in the trash at the end. Inserting happens in a workshop (library tab).
 * Who may only read the library (a guest with it switched on, server/access.ts; a reader the host names,
 * `Me.libraryEdit`) gets it as it is, without ticks and without the trash.
 */
export default function LibraryPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { entries, loaded, load, loadTrash, change, trash, restore, purge } = useLibrary()
  const categories = useSettings((s) => s.settings.categories)
  // Who changes the library; everybody else who gets here reads it.
  const owner = useLibraryEdit()
  // The list as it was left, for the way back from an entry's page (libraryListView): a fresh visit starts fresh.
  const [start] = useState(() => libraryListView.get(location.key))
  const [query, setQuery] = useState(start?.query ?? '')
  const [chosen, setFilter] = useState<LibraryFilter>(start?.filter ?? NO_FILTER)
  // A category deleted meanwhile no longer narrows the list.
  const filter = knownFilter(chosen, categories)
  const [layout, setLayout] = useLocalState('sp.library.view', 'list')
  const [selecting, setSelecting] = useState(false)
  const [bulkEdit, setBulkEdit] = useState(false)
  /** The filters as a sheet, where the screen has no room for them beside the entries. */
  const [sheet, setSheet] = useState(false)
  /** The slides shown in another theme, to see how they look there. */
  const { theme, view, setView } = useLibraryTheme()
  const { notice, show, close } = useNotice()
  // The place on the page and the entry last opened belong to what is remembered: the page returns there once it
  // has entries, and the focus to that entry's line.
  const page = useRef<HTMLDivElement>(null)
  const scrolled = useRef(start?.scroll ?? 0)
  const opened = useRef(start?.opened ?? null)
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || !entries.length || !page.current) return
    restored.current = true
    page.current.scrollTop = scrolled.current
    if (start?.opened) page.current.querySelector<HTMLElement>(`[data-entry="${CSS.escape(start.opened)}"]`)?.focus({ preventScroll: true })
  }, [entries.length, start])
  const remember = useRef(() => undefined as void)
  remember.current = () => libraryListView.set(location.key, { query, filter: chosen, scroll: scrolled.current, opened: opened.current })
  useEffect(() => () => remember.current(), [])
  useReadOnReturn(() => {
    void load()
    if (owner) void loadTrash()
  })
  /** A failed save or delete (the entry may be gone): say so, and show the library as it is now. */
  const failed = (err: unknown) => {
    reportFailure(err)
    void load()
    void loadTrash()
  }
  const trashedNote = (ids: string[]) => show({ text: t('library.trashed', { count: ids.length }), undo: () => void restore(ids).then(loadTrash, failed) })
  // An entry deleted on its own page: the way back is offered here, where the page returned to.
  useEffect(() => {
    const ids = trashedOnPage.take()
    if (ids.length) trashedNote(ids)
    // once, on arriving
  }, [])

  const options: SortOption<LibraryEntry>[] = [
    { key: 'title', label: t('list.title'), value: (e) => e.title },
    { key: 'duration', label: t('item.duration'), value: minutesOf, first: 'desc' },
    { key: 'created', label: t('list.created'), value: (e) => e.createdAt, first: 'desc' },
    { key: 'updated', label: t('list.updated'), value: (e) => e.updatedAt, first: 'desc' },
  ]
  const { sort, setSort, sorted } = useSort('sp.library.sort', options, { key: 'title', dir: 'asc' })
  const searching = query.trim() !== ''
  const found = entries.filter((e) => !searching || matchesWords(libraryText(e, categories, t), query))
  const sections = sectionsOf(sorted(found.filter((e) => passes(e, filter, categories))), categories)
  const shown = sections.flatMap((s) => s.entries)
  const counts = facetCounts(found, filter, categories)
  const active = filterCount(filter)
  const ids = shown.map((e) => e.id)
  const selection = useSelection(ids)
  const known = tagCounts(entries.map((e) => e.tags)).map((c) => c.tag)
  const picked = shown.filter((e) => selection.has(e.id))
  const cards = layout === 'cards'

  /** Into the trash without asking: the note offers the way back, and the trash keeps them TRASH_DAYS days. */
  const toTrash = (ids: string[]) =>
    change({ ids, trash: true }).then(() => {
      selection.clear()
      trashedNote(ids)
    }, failed)
  const endSelecting = () => {
    selection.clear()
    setSelecting(false)
  }
  // Escape takes the ticks off first (useSelection); with none left it ends selecting.
  const ticked = selection.ids.length
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ticked && !isTyping(e.target) && !document.querySelector('[role="dialog"]')) setSelecting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, ticked])
  /** What an entry's line or card needs to open its page: the list it stands in, for paging there, and a note of which one it was. */
  const opening = { ids, onOpen: (id: string) => void (opened.current = id) }
  const filters = (withSections: boolean) => <Filters filter={filter} onChange={setFilter} counts={counts} categories={categories} tagRows={found.filter((e) => passes(e, filter, categories, 'tags')).map((e) => e.tags)} withSections={withSections} />
  const sortControl = <SortControl options={options} sort={sort} onChange={setSort} />

  return (
    <div ref={page} onScroll={(e) => void (scrolled.current = e.currentTarget.scrollTop)} className="h-full overflow-y-auto">
      <div className={cx('mx-auto max-w-[1240px] px-4 py-8 md:px-8 md:py-10', selection.ids.length > 0 && 'pb-28')}>
        {/* A narrow screen keeps the head short, so the search stands near the top: the theme to look in moves into the filters' sheet. */}
        <PageHeader title={t('nav.library')} subtitle={<span className="max-md:hidden">{t('library.subtitle')}</span>} right={entries.length > 0 && <span className="max-lg:hidden"><ViewThemeSelect value={view} onChange={setView} /></span>} />
        {loaded && !entries.length && <Empty title={t('library.empty')} body={t(owner ? 'library.emptyHint' : 'library.emptyGuest')} />}
        {entries.length > 0 && (
          <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-x-7">
            {/* The search comes first in the page (Tab reaches it before the filters), though the filters stand to its left
                on a wide screen. On a narrow one it stays in reach while the page scrolls, the sections as chips under it. */}
            <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-paper px-4 py-2 md:-mx-8 md:px-8 lg:static lg:col-start-2 lg:row-start-1 lg:mx-0 lg:p-0">
                <div className="flex items-center gap-2">
                  <SearchField value={query} onChange={setQuery} placeholder={t('library.search')} shortcut className="min-w-0 flex-1" />
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={active ? t('library.filtersActive', { count: active }) : t('library.filters')}
                    title={t('library.filters')}
                    onClick={() => setSheet(true)}
                    className={cx('relative inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border transition-colors pointer-coarse:h-11 pointer-coarse:w-11 lg:hidden', active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-2 bg-surface text-brand-ink hover:bg-surface-2')}
                  >
                    <SlidersHorizontal size={16} strokeWidth={1.75} />
                  </button>
                </div>
                <SectionChips filter={filter} onChange={setFilter} counts={counts} categories={categories} total={found.filter((e) => passes(e, filter, categories, 'sections')).length} />
            </div>
            <aside aria-label={t('library.filters')} className="hidden lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
              {filters(true)}
            </aside>
            <div className="min-w-0 lg:col-start-2 lg:row-start-2">
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {owner && selecting ? <SelectAll selection={selection} count={shown.length} /> : <span className="text-[13.5px] font-semibold text-ink-2">{t('library.count', { count: shown.length })}</span>}
                <span className="ml-auto" />
                <span className="hidden lg:inline-flex">{sortControl}</span>
                {owner && (
                  <Button size="sm" variant={selecting ? 'default' : 'ghost'} onClick={() => (selecting ? endSelecting() : setSelecting(true))}>
                    {t(selecting ? 'library.selectDone' : 'library.selectMode')}
                  </Button>
                )}
                <Segmented
                  size="sm"
                  value={cards ? 'cards' : 'list'}
                  onChange={setLayout}
                  options={[
                    { value: 'list', label: <span className="inline-flex items-center gap-1" title={t('list.asList')}><List size={13} /><span className="sr-only xl:not-sr-only">{t('list.asList')}</span></span> },
                    { value: 'cards', label: <span className="inline-flex items-center gap-1" title={t('list.asCards')}><LayoutGrid size={13} /><span className="sr-only xl:not-sr-only">{t('list.asCards')}</span></span> },
                  ]}
                />
              </div>
              {!owner && <p className="mt-2 text-[13px] text-ink-3">{t('library.readOnly')}</p>}

              {!shown.length && (
                <div className="py-12 text-center text-[14px] text-ink-2">
                  <p>{searching && !active ? t('library.noMatch', { q: query.trim() }) : t('library.noFilterMatch')}</p>
                  {active > 0 && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFilter(NO_FILTER)}>
                      <X size={13} />
                      {t('library.clearFilters')}
                    </Button>
                  )}
                </div>
              )}
              {sections.map((s) => (
                <section key={s.key} aria-label={sectionName(s.key, categories, t)}>
                  <div className="flex items-baseline gap-2.5 px-1 pb-2 pt-5">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: sectionColor(s.key, categories) }} />
                    <h2 className="app-title text-[18px] leading-tight">{sectionName(s.key, categories, t)}</h2>
                    <span className="text-[13px] text-ink-2">{s.minutes > 0 ? t('library.sectionMeta', { count: s.entries.length, duration: formatDuration(s.minutes) }) : t('library.count', { count: s.entries.length })}</span>
                  </div>
                  {cards ? (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                      {s.entries.map((e) => (
                        <EntryCard key={e.id} entry={e} categories={categories} theme={theme} selection={owner && selecting ? selection : null} opening={opening} />
                      ))}
                    </ul>
                  ) : (
                    <ul className="card overflow-hidden">
                      {s.entries.map((e) => (
                        <EntryRow key={e.id} entry={e} categories={categories} selection={owner && selecting ? selection : null} opening={opening} />
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              <TrashSection
                rows={!owner || searching || active ? [] : trash}
                hint={t('library.trashHint', { days: TRASH_DAYS })}
                meta={(r) => <span>{r.kind === 'group' ? t('library.kindGroup') : t('library.kindItem')}</span>}
                onRestore={(r) => void restore([r.id]).then(loadTrash, failed)}
                onPurge={(rows) => void purge(rows.map((r) => r.id)).catch(failed)}
                purgeConfirm={(rows) => (rows.length === 1 ? t('library.purgeConfirm', { title: rows[0].title }) : t('library.purgeAllConfirm', { count: rows.length }))}
              />
            </div>
          </div>
        )}

        <Sheet open={sheet} onClose={() => setSheet(false)} label={t('library.filters')} title={t('library.filters')}>
          <div className="space-y-5 pb-2">
            {filters(false)}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-brand-ink">{t('list.sortBy')}</span>
              {sortControl}
            </div>
            <ViewThemeSelect value={view} onChange={setView} />
            <Button variant="primary" className="w-full" onClick={() => setSheet(false)}>
              {t('library.showResults', { count: shown.length })}
            </Button>
          </div>
        </Sheet>
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
      </div>
    </div>
  )
}

const toggled = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

/**
 * The filters: the sections (where they are not chips already), what an entry holds, and the tags. Every option says
 * how many entries it would show; one that would show none cannot be chosen.
 */
function Filters({ filter, onChange, counts, categories, tagRows, withSections }: { filter: LibraryFilter; onChange: (f: LibraryFilter) => void; counts: FacetCounts; categories: Category[]; /** The tags of every entry the other filters leave. */ tagRows: string[][]; withSections: boolean }) {
  const { t } = useTranslation()
  const sections = sectionKeys(categories).filter((key) => counts.sections[key] || filter.sections.includes(key))
  const holds: Record<Holds, string> = { slides: t('slides.title'), sheets: t('library.holdsSheets'), files: t('item.files') }
  return (
    <div className="space-y-5">
      {withSections && (
        <FilterGroup label={t('item.category')} action={filterCount(filter) > 0 && <button type="button" onClick={() => onChange(NO_FILTER)} className="tap text-[13px] font-semibold text-accent-strong hover:underline">{t('library.clearFilters')}</button>}>
          {sections.map((key) => (
            <Option key={key} on={filter.sections.includes(key)} count={counts.sections[key] ?? 0} onToggle={() => onChange({ ...filter, sections: toggled(filter.sections, key) })}>
              <span aria-hidden className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: sectionColor(key, categories) }} />
              <span className="min-w-0 flex-1 truncate">{sectionName(key, categories, t)}</span>
            </Option>
          ))}
        </FilterGroup>
      )}
      <FilterGroup label={t('library.holds')}>
        {HOLDS.map((h) => (
          <Option key={h} on={filter.holds.includes(h)} count={counts.holds[h]} onToggle={() => onChange({ ...filter, holds: toggled(filter.holds, h) })}>
            <span className="min-w-0 flex-1 truncate">{holds[h]}</span>
          </Option>
        ))}
      </FilterGroup>
      {(tagRows.some((tags) => tags.length) || filter.tags.length > 0) && (
        <FilterGroup label={t('tags.label')}>
          <TagFilter rows={tagRows} active={filter.tags} onChange={(tags) => onChange({ ...filter, tags })} />
        </FilterGroup>
      )}
    </div>
  )
}

function FilterGroup({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 flex min-h-6 items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-brand-ink">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

/** One option of a filter: a tick, what it is, and the number of entries it would show. */
function Option({ on, count, onToggle, children }: { on: boolean; count: number; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={!on && !count}
      onClick={onToggle}
      className={cx('-mx-1.5 flex min-h-9 w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-[10px] px-1.5 text-left text-[14px] transition-colors pointer-coarse:min-h-11', on ? 'bg-accent-soft font-semibold' : 'hover:bg-surface-2', !on && !count && 'opacity-40')}
    >
      <Tick on={on} />
      {children}
      <span className="shrink-0 text-[13px] font-normal text-ink-2 tnum">{count}</span>
    </button>
  )
}

/** The look of a tick, for a place that is a checkbox as a whole (an option, an entry while selecting). */
function Tick({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-2 bg-surface', className)}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}

/** The sections as chips, where the filters do not stand beside the entries: "All" and one per section that has entries. */
function SectionChips({ filter, onChange, counts, categories, total }: { filter: LibraryFilter; onChange: (f: LibraryFilter) => void; counts: FacetCounts; categories: Category[]; /** What the other filters leave over all sections. */ total: number }) {
  const { t } = useTranslation()
  const keys = sectionKeys(categories).filter((key) => counts.sections[key] || filter.sections.includes(key))
  const chip = (on: boolean) => cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold transition-colors pointer-coarse:h-11', on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:bg-surface-2')
  return (
    <div role="group" aria-label={t('item.category')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-8 md:px-8 lg:hidden">
      <button type="button" aria-pressed={!filter.sections.length} onClick={() => onChange({ ...filter, sections: [] })} className={chip(!filter.sections.length)}>
        {t('library.all')}
        <span className="text-[13px] font-normal opacity-80 tnum">{total}</span>
      </button>
      {keys.map((key) => {
        const on = filter.sections.includes(key)
        return (
          <button key={key} type="button" aria-pressed={on} onClick={() => onChange({ ...filter, sections: toggled(filter.sections, key) })} className={chip(on)}>
            {key !== GROUPS && <span aria-hidden className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: sectionColor(key, categories) }} />}
            {sectionName(key, categories, t)}
            <span className="text-[13px] font-normal opacity-80 tnum">{counts.sections[key] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The list an entry is opened from (its ids in the order shown), and how the list notes which entry it was. */
interface Opening {
  ids: string[]
  onOpen: (id: string) => void
}

/** What an entry is as a whole: a link to its page, or a tick while entries are being selected. */
function EntryTarget({ entry, selection, opening, className, children }: { entry: LibraryEntry; selection: Selection | null; opening: Opening; className?: string; children: ReactNode }) {
  const { t } = useTranslation()
  if (!selection)
    return (
      <Link to={entryPath(entry.id)} state={{ list: opening.ids } satisfies FromList} data-entry={entry.id} onClick={() => opening.onOpen(entry.id)} className={className}>
        {children}
      </Link>
    )
  return (
    <div
      role="checkbox"
      aria-checked={selection.has(entry.id)}
      aria-label={t('list.select', { title: entry.title })}
      tabIndex={0}
      onClick={(e) => selection.toggle(entry.id, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return
        e.preventDefault()
        selection.toggle(entry.id, e.shiftKey)
      }}
      className={cx(className, 'cursor-pointer select-none')}
    >
      {children}
    </div>
  )
}

/** An entry as a line: its rail, title and one line of what it is, what it holds and how long it runs. */
function EntryRow({ entry, categories, selection, opening }: { entry: LibraryEntry; categories: Category[]; selection: Selection | null; opening: Opening }) {
  const { t } = useTranslation()
  const minutes = minutesOf(entry)
  const picked = !!selection?.has(entry.id)
  const summary = summaryOf(entry, t)
  return (
    <li className={cx('border-b border-line last:border-b-0', picked && 'bg-accent-soft')}>
      <EntryTarget entry={entry} selection={selection} opening={opening} className={cx('flex min-h-12 items-center gap-3 px-3 py-2 transition-colors pointer-coarse:min-h-[60px]', !picked && 'hover:bg-surface-2/60')}>
        {selection && <Tick on={picked} />}
        <span aria-hidden className="my-0.5 w-[6px] shrink-0 self-stretch rounded-[3px]" style={{ background: railOf(entry, categories) }} />
        <span className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          {/* The title takes the room it needs; a summary, where there is one, keeps a third of the line. */}
          <span className={cx('block truncate font-semibold', summary ? 'md:max-w-[66%] md:shrink-0' : 'md:min-w-0 md:flex-1')}>{entry.title}</span>
          {summary && <span className="block truncate text-[13px] text-ink-2 md:min-w-0 md:flex-1 md:text-[13.5px]">{summary}</span>}
        </span>
        <span className="hidden w-[104px] shrink-0 md:block">
          <HoldsLine entry={entry} />
        </span>
        <span className="w-[4.5rem] shrink-0 text-right text-[13.5px] font-semibold text-brand-ink tnum">{minutes > 0 ? formatDuration(minutes) : ''}</span>
      </EntryTarget>
    </li>
  )
}

/** An entry as a card: its first slide as the picture (an entry without slides says there what it is), then title, length and what it holds. */
function EntryCard({ entry, categories, theme, selection, opening }: { entry: LibraryEntry; categories: Category[]; theme: string; selection: Selection | null; opening: Opening }) {
  const { t } = useTranslation()
  const minutes = minutesOf(entry)
  const cover = coverOf(entry)
  const picked = !!selection?.has(entry.id)
  return (
    <li className={cx('card overflow-hidden', picked && 'border-accent bg-accent-soft')}>
      <EntryTarget entry={entry} selection={selection} opening={opening} className="flex h-full flex-col">
        {cover ? (
          <SlideView html={cover.html} theme={theme} scope="library" className="rounded-none! border-b border-line" />
        ) : (
          <span className="flex aspect-video items-center border-b border-line bg-surface-2 px-5">
            <span className="line-clamp-4 text-[14px] leading-normal text-ink-2">{summaryOf(entry, t) || t(entry.kind === 'group' ? 'library.kindGroup' : `kinds.${entry.data.kind}`)}</span>
          </span>
        )}
        <span className="flex flex-1 gap-3 p-3">
          {selection && <Tick on={picked} className="mt-0.5" />}
          <span aria-hidden className="w-[6px] shrink-0 self-stretch rounded-[3px]" style={{ background: railOf(entry, categories) }} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold leading-snug">{entry.title}</span>
            <span className="mt-auto flex items-center gap-2.5 pt-1.5">
              <span className="flex-1 text-[13.5px] font-semibold text-brand-ink tnum">{minutes > 0 ? formatDuration(minutes) : ''}</span>
              <HoldsLine entry={entry} />
            </span>
          </span>
        </span>
      </EntryTarget>
    </li>
  )
}
