import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibraryEntry, PaletteKey } from '@/domain/types'
import { hasTag, tagCounts } from '@/domain/tags'
import { categoryName, useSettings } from '@/store/useSettings'
import { Button, cx, Field, Modal } from '@/components/ui'
import { TagInput } from '@/components/collection'
import Swatches from '@/components/Swatches'

type TagChoice = 'keep' | 'all' | 'none'

/**
 * Tags, category and colour for all ticked entries at once. A tag some of them carry starts as it is and is, click by
 * click, given to all, taken from all, or left again; nothing changes that is not chosen here.
 */
export function BulkEdit({ entries, known, onClose, onApply }: { entries: LibraryEntry[]; known: string[]; onClose: () => void; onApply: (patch: { addTags?: string[]; removeTags?: string[]; categoryId?: string | null; color?: PaletteKey | null }) => void }) {
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
                    state === 'all' && 'border-accent bg-accent-soft text-accent-strong',
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
              <button key={tag} type="button" title={t('tags.remove', { tag })} onClick={() => setAdded(added.filter((x) => x !== tag))} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 text-[13px] text-accent-strong pointer-coarse:h-9">
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
