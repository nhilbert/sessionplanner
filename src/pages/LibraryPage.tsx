import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Search, Trash2 } from 'lucide-react'
import type { ItemContent, LibraryEntry } from '@/domain/types'
import { durationOf, formatDuration } from '@/domain/time'
import { useLibrary } from '@/store/useLibrary'
import { categoryName, itemColor, useSettings } from '@/store/useSettings'
import { Empty, Field, IconButton, PageHeader } from '@/components/ui'
import Swatches from '@/components/Swatches'
import { TextField } from '@/planner/fields'

/** The shared library: rename, adjust and delete entries; inserting happens in a workshop (library tab). */
export default function LibraryPage() {
  const { t } = useTranslation()
  const { entries, loaded, load, save, remove } = useLibrary()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    void load()
  }, [load])
  const q = query.trim().toLowerCase()
  const shown = entries.filter((e) => !q || e.title.toLowerCase().includes(q))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader title={t('nav.library')} subtitle={t('library.subtitle')} />
        {entries.length > 0 && (
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.search')} className="field pl-9" />
          </div>
        )}
        {loaded && !entries.length && <Empty title={t('library.empty')} body={t('library.emptyHint')} />}
        <ul className="space-y-2">
          {shown.map((e) => (
            <li key={e.id} className="card">
              <Row entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onSave={(x) => void save(x, e.id)} onDelete={() => window.confirm(t('library.deleteConfirm', { title: e.title })) && void remove(e.id)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Row({ entry, open, onToggle, onSave, onDelete }: { entry: LibraryEntry; open: boolean; onToggle: () => void; onSave: (e: Pick<LibraryEntry, 'kind' | 'title' | 'data'>) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const items = entry.kind === 'group' ? entry.data.items : [entry.data]
  const minutes = items.reduce((s, i) => s + durationOf(i), 0)
  const color = entry.kind === 'item' ? itemColor(entry.data, categories) : null
  const setItem = (patch: Partial<ItemContent>) => entry.kind === 'item' && onSave({ kind: 'item', title: patch.title ?? entry.title, data: { ...entry.data, ...patch } })

  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {entry.kind === 'group' ? <FolderOpen size={15} className="shrink-0 text-ink-3" /> : <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />}
        <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
        <span className="shrink-0 text-[13px] text-ink-3 tnum">
          {entry.kind === 'group' && `${t('library.items', { count: items.length })} · `}
          {formatDuration(minutes)}
        </span>
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
                    <input
                      type="number"
                      min={5}
                      step={5}
                      defaultValue={entry.data.duration}
                      onBlur={(e) => {
                        const v = Math.round(Number(e.target.value))
                        if (v >= 1 && v <= 1440 && v !== entry.data.duration) setItem({ duration: v })
                      }}
                      className="field tnum h-8 w-20 text-center"
                    />
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
