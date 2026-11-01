import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coffee, Flag, FolderOpen, NotebookPen, Package, Square, StickyNote, Trash2 } from 'lucide-react'
import type { Category, ItemContent, ItemKind, LibraryEntry } from '@/domain/types'
import { durationOf, formatDuration } from '@/domain/time'
import { libraryText, matchesWords, useLibrary } from '@/store/useLibrary'
import { categoryName, itemColor, useSettings } from '@/store/useSettings'
import { cx, Empty, Field, IconButton, PageHeader, SearchField } from '@/components/ui'
import Swatches from '@/components/Swatches'
import { DurationField, TextField } from '@/planner/fields'
import { SlideStrip } from '@/slides/SlideStrip'
import { SlideView } from '@/slides/SlideView'

const KIND_ICON: Record<ItemKind, ReactNode> = {
  block: <Square size={12} />,
  break: <Coffee size={12} />,
  marker: <Flag size={12} />,
  note: <StickyNote size={12} />,
}
const GROUP_PREVIEW = 6

/** The shared library: cards with what each entry holds; a tap opens it for editing. Inserting happens in a workshop (library tab). */
export default function LibraryPage() {
  const { t } = useTranslation()
  const { entries, loaded, load, save, remove } = useLibrary()
  const categories = useSettings((s) => s.settings.categories)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    void load()
  }, [load])
  const searching = query.trim() !== ''
  const shown = entries.filter((e) => !searching || matchesWords(libraryText(e, categories, t), query))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader title={t('nav.library')} subtitle={t('library.subtitle')} />
        {entries.length > 0 && <SearchField value={query} onChange={setQuery} placeholder={t('library.search')} shortcut className="mb-4" />}
        {loaded && !entries.length && <Empty title={t('library.empty')} body={t('library.emptyHint')} />}
        {searching && !shown.length && <p className="py-10 text-center text-[14px] text-ink-2">{t('library.noMatch', { q: query.trim() })}</p>}
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {shown.map((e) => (
            <li key={e.id} className={cx('card overflow-hidden', open === e.id && 'md:col-span-2')}>
              <Row entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onSave={(x) => void save(x, e.id)} onDelete={() => window.confirm(t('library.deleteConfirm', { title: e.title })) && void remove(e.id)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
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
function EntryCard({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const theme = useSettings((s) => s.settings.theme) || 'default'
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
        {i.slides.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {i.slides.slice(0, 3).map((s) => (
              <SlideView key={s.id} html={s.html} theme={theme} scope="library" />
            ))}
          </div>
        )}
        {(i.materials.length > 0 || i.notes.trim() || i.slides.length > 3) && (
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
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ entry, open, onToggle, onSave, onDelete }: { entry: LibraryEntry; open: boolean; onToggle: () => void; onSave: (e: Pick<LibraryEntry, 'kind' | 'title' | 'data'>) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const theme = useSettings((s) => s.settings.theme) || 'default'
  const setItem = (patch: Partial<ItemContent>) => entry.kind === 'item' && onSave({ kind: 'item', title: patch.title ?? entry.title, data: { ...entry.data, ...patch } })

  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
        <EntryCard entry={entry} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {entry.kind === 'group' ? (
            <>
              <Field label={t('group.title')}>
                <TextField value={entry.title} onCommit={(title) => onSave({ kind: 'group', title, data: entry.data })} />
              </Field>
              <ol className="space-y-1 text-[14px]">
                {entry.data.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span className="truncate">{i.title || t(`kinds.${i.kind}`)}</span>
                    <span className="shrink-0 text-ink-3 tnum">{durationOf(i) ? formatDuration(durationOf(i)) : ''}</span>
                  </li>
                ))}
              </ol>
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
              <Field label={t('item.notes')}>
                <TextField multiline value={entry.data.notes} onCommit={(notes) => setItem({ notes })} />
              </Field>
              <SlideStrip slides={entry.data.slides} onChange={(slides) => setItem({ slides })} scope="library" theme={theme} canEdit owner />
            </>
          )}
          <div className="flex justify-end">
            <IconButton label={t('common.delete')} onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  )
}
