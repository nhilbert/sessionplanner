import { type ReactNode, useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import type { Category, ItemContent, LibraryEntry, LibraryEntryInput } from '@/domain/types'
import { durationOf, formatDuration } from '@/domain/time'
import { minutesOf, neighbours } from '@/domain/libraryView'
import { rulesWithNewSheets } from '@/domain/printing'
import { tagCounts } from '@/domain/tags'
import { useLibrary } from '@/store/useLibrary'
import { categoryName, itemColor, stripColor, useLibraryEdit, useSettings } from '@/store/useSettings'
import { Button, cx, Empty, Field, IconButton } from '@/components/ui'
import { shortDate, TagEditor, TagList } from '@/components/collection'
import Menu from '@/components/Menu'
import Swatches from '@/components/Swatches'
import { reportFailure } from '@/api'
import { DurationField, TextField } from '@/planner/fields'
import { Materials } from '@/planner/ItemPanel'
import { EntryFileLinks, EntryFiles, entryPath, LibrarySheets, LibrarySlideEditor, railOf, sectionName, slideList } from '@/library/parts'
import { SlideStrip } from '@/slides/SlideStrip'
import { SlideView } from '@/slides/SlideView'
import { useViewTheme } from '@/slides/ThemeSelect'

/**
 * One entry of the library on a page of its own. It reads first: what the entry is about, its slides and worksheets
 * at a size to look at, the notes for the facilitator, and beside them its facts (length, category, tags, material,
 * files). Who changes the library edits where the entry stands: a pencil turns a section into its fields (they save
 * as they are left, as everywhere), the facts are fields at once. The arrows page through the entry's section of the
 * library. Who only reads the library gets the same page without the pencils.
 */
export default function LibraryEntryPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { entries, loaded, load } = useLibrary()
  useEffect(() => {
    void load()
    // Back in this tab: an agent (or another window) may have changed the entry meanwhile.
    const again = () => document.visibilityState === 'visible' && void load()
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load])
  const entry = entries.find((e) => e.id === id)
  if (!entry)
    return loaded ? (
      <Empty title={t('library.missing')}>
        <Link to="/library" className="inline-flex h-9 items-center rounded-full border border-line-2 bg-surface px-4 text-sm font-semibold text-brand-ink hover:bg-surface-2">
          {t('nav.library')}
        </Link>
      </Empty>
    ) : null
  // A page of its own per entry: paging to the next one starts at its top, with nothing left open.
  return <EntryPage key={entry.id} entry={entry} />
}

function EntryPage({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entries, load, save, change } = useLibrary()
  const categories = useSettings((s) => s.settings.categories)
  const owner = useLibraryEdit()
  const [view] = useViewTheme('sp.library.theme')
  const usual = useSettings((s) => s.settings.theme)
  const theme = view || usual || 'default'
  const [titling, setTitling] = useState(false)
  /** The slide editor on the entry's slides. */
  const [slide, setSlide] = useState<{ key: string; mode: 'view' | 'edit' } | null>(null)
  const failed = (err: unknown) => {
    reportFailure(err)
    void load()
  }
  const saveEntry = (x: LibraryEntryInput) => void save(x, entry.id).catch(failed)
  const setTitle = (title: string) => saveEntry(entry.kind === 'item' ? { kind: 'item', title, data: { ...entry.data, title } } : { kind: 'group', title, data: entry.data })
  const setTags = (tags: string[]) => saveEntry({ kind: entry.kind, title: entry.title, data: entry.data, tags } as LibraryEntryInput)
  const toTrash = () => change({ ids: [entry.id], trash: true }).then(() => navigate('/library', { state: { trashed: [entry.id] } }), failed)
  const place = neighbours(entries, entry.id, categories)
  const minutes = minutesOf(entry)
  const known = tagCounts(entries.map((e) => e.tags)).map((c) => c.tag)
  const section = place ? sectionName(place.section, categories, t) : ''

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-wrap items-center gap-1">
          <Link to="/library" className="-ml-2 inline-flex h-9 items-center gap-0.5 rounded-full pl-1.5 pr-3 text-[14px] font-semibold text-brand-ink transition-colors hover:bg-surface-2 pointer-coarse:h-11">
            <ChevronLeft size={18} strokeWidth={1.75} />
            {t('nav.library')}
          </Link>
          <span className="ml-auto" />
          {place && <span className="px-1.5 text-[13px] text-ink-2 tnum">{t('library.position', { n: place.index + 1, total: place.total, section })}</span>}
          <PageArrow to={place?.previous} label={t('library.previous')}>
            <ChevronLeft size={17} strokeWidth={1.75} />
          </PageArrow>
          <PageArrow to={place?.next} label={t('library.next')}>
            <ChevronRight size={17} strokeWidth={1.75} />
          </PageArrow>
          {owner && <Menu label={t('library.entryMenu')} title={entry.title} items={[{ label: t('library.toTrash'), icon: <Trash2 size={14} />, danger: true, onSelect: () => void toTrash() }]} />}
        </div>

        <header className="mt-3 flex gap-3.5">
          <span aria-hidden className="w-[6px] shrink-0 rounded-[3px]" style={{ background: railOf(entry, categories) }} />
          <div className="min-w-0 flex-1">
            {titling ? (
              <TextField
                value={entry.title}
                onCommit={setTitle}
                autoFocus
                aria-label={t('item.title')}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== 'Escape') return
                  // Leaving the field saves what was typed; then the title reads again.
                  e.currentTarget.blur()
                  setTitling(false)
                }}
                className="app-title h-12 text-[22px] md:text-[26px]"
              />
            ) : (
              <h1 className="app-title text-[26px] leading-[1.08] md:text-[34px]">{entry.title}</h1>
            )}
            <p className="mt-1.5 text-[14px] text-ink-2">
              <b className="font-semibold text-ink">{entry.kind === 'group' ? t('library.group', { count: entry.data.items.length }) : section}</b>
              {minutes > 0 && (
                <>
                  {' · '}
                  <b className="font-semibold text-ink tnum">{formatDuration(minutes)}</b>
                </>
              )}
              {' · '}
              {t('list.updatedOn', { date: shortDate(entry.updatedAt) })}
            </p>
          </div>
          {owner && (
            <IconButton label={titling ? t('library.selectDone') : t('library.editTitle')} onClick={() => setTitling(!titling)} className="mt-1">
              {titling ? <Check size={16} /> : <Pencil size={15} />}
            </IconButton>
          )}
        </header>

        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          {entry.kind === 'item' ? (
            <ItemBody entry={entry} owner={owner} theme={theme} categories={categories} known={known} onSave={saveEntry} onTags={setTags} onSlide={(key, mode) => setSlide({ key, mode: owner ? mode : 'view' })} failed={failed} />
          ) : (
            <GroupBody entry={entry} owner={owner} categories={categories} known={known} onTags={setTags} />
          )}
        </div>
        {slide && <LibrarySlideEditor theme={theme} entryId={entry.id} start={slide.key} mode={slide.mode} owner={owner} onClose={() => setSlide(null)} onFailed={failed} />}
      </div>
    </div>
  )
}

/** A round arrow to a neighbouring entry; without one it stands there faded, so the pair keeps its place. */
function PageArrow({ to, label, children }: { to: LibraryEntry | null | undefined; label: string; children: ReactNode }) {
  const look = 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-surface text-brand-ink pointer-coarse:h-11 pointer-coarse:w-11'
  if (!to)
    return (
      <span aria-hidden className={cx(look, 'opacity-35')}>
        {children}
      </span>
    )
  return (
    <Link to={entryPath(to.id)} aria-label={`${label}: ${to.title}`} title={`${label}: ${to.title}`} className={cx(look, 'transition-colors hover:bg-surface-2')}>
      {children}
    </Link>
  )
}

/** A part of the page with its heading; who changes the library gets a pencil that turns it into its fields, and "Done" to read it again. */
function Block({ title, edit, tinted, children }: { title: ReactNode; edit?: { on: boolean; label: string; toggle: () => void }; tinted?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className={cx('rounded-[14px] px-5 pb-5 pt-3', tinted ? 'bg-surface-2' : 'border border-line bg-surface')}>
      <div className="mb-1 flex min-h-8 items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-brand-ink">{title}</h2>
        {edit &&
          (edit.on ? (
            <Button size="sm" onClick={edit.toggle}>
              {t('library.selectDone')}
            </Button>
          ) : (
            <IconButton label={edit.label} onClick={edit.toggle} className="-mr-1.5">
              <Pencil size={15} />
            </IconButton>
          ))}
      </div>
      {children}
    </section>
  )
}

/** A fact of the entry: its name on the left, its value or field on the right; `stacked` puts the value below (tags, material, files). */
function Fact({ label, hint, stacked, action, children }: { label: string; hint?: string; stacked?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('border-b border-line py-3 last:border-b-0', !stacked && 'flex min-h-[52px] items-center justify-between gap-3 py-2')}>
      <div className={cx('flex items-center justify-between gap-2', stacked && 'mb-2 min-h-7')}>
        <span className="text-[13px] font-semibold text-brand-ink">
          {label}
          {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

const facts = (i: ItemContent) =>
  (
    [
      ['item.goal', i.goal],
      ['item.method', i.method],
      ['item.lead', i.lead],
    ] as const
  ).filter(([, v]) => v.trim())

function ItemBody({ entry, owner, theme, categories, known, onSave, onTags, onSlide, failed }: { entry: Extract<LibraryEntry, { kind: 'item' }>; owner: boolean; theme: string; categories: Category[]; known: string[]; onSave: (x: LibraryEntryInput) => void; onTags: (tags: string[]) => void; onSlide: (key: string, mode: 'view' | 'edit') => void; failed: (err: unknown) => void }) {
  const { t } = useTranslation()
  const id = useId()
  /** The section whose fields show. */
  const [editing, setEditing] = useState<'about' | 'notes' | 'material' | null>(null)
  const i = entry.data
  const set = (patch: Partial<ItemContent>) => onSave({ kind: 'item', title: entry.title, data: { ...i, ...patch } })
  const edit = (part: NonNullable<typeof editing>, label: string) => (owner ? { on: editing === part, label, toggle: () => setEditing(editing === part ? null : part) } : undefined)
  const category = categories.find((c) => c.id === i.categoryId)
  const color = itemColor(i, categories)
  const timed = i.kind === 'block' || i.kind === 'break'
  const sheets = i.worksheets ?? []
  const about = facts(i)

  return (
    <>
      <div className="min-w-0 flex-1 space-y-4">
        {(owner || i.description.trim() || about.length > 0) && (
          <Block title={t('library.about')} edit={edit('about', t('library.editAbout'))}>
            {editing === 'about' ? (
              <div className="space-y-3 pt-1">
                <Field label={t('item.description')}>
                  <TextField multiline value={i.description} onCommit={(description) => set({ description })} className="min-h-[96px]" />
                </Field>
                {i.kind === 'block' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t('item.goal')} className="sm:col-span-2">
                      <TextField value={i.goal} onCommit={(goal) => set({ goal })} />
                    </Field>
                    <Field label={t('item.method')}>
                      <TextField value={i.method} onCommit={(method) => set({ method })} />
                    </Field>
                    <Field label={t('item.lead')}>
                      <TextField value={i.lead} onCommit={(lead) => set({ lead })} />
                    </Field>
                  </div>
                )}
              </div>
            ) : (
              <>
                {i.description.trim() ? <p className="max-w-[64ch] whitespace-pre-line text-[16px] leading-normal">{i.description}</p> : <p className="text-[14px] text-ink-3">{t('library.noDescription')}</p>}
                {about.length > 0 && (
                  <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14.5px]">
                    {about.map(([key, v]) => (
                      <div key={key} className="contents">
                        <dt className="text-ink-2">{t(key)}</dt>
                        <dd className="whitespace-pre-line">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}
          </Block>
        )}

        {owner ? (
          <section className="rounded-[14px] border border-line bg-surface px-5 py-4">
            <SlideStrip slides={i.slides} list={slideList(entry.id, failed)} onOpen={onSlide} scope="library" theme={theme} canEdit owner tile="w-[calc(50%-4px)]" />
          </section>
        ) : (
          i.slides.length > 0 && (
            <Block title={t('slides.count', { count: i.slides.length })}>
              <div className="grid grid-cols-2 gap-2">
                {i.slides.map((s, n) => (
                  <SlideView key={s.id} html={s.html} theme={theme} scope="library" onClick={() => onSlide(s.id, 'view')} label={t('slides.slide', { n: n + 1 })} />
                ))}
              </div>
            </Block>
          )
        )}

        {i.kind === 'block' && (owner || sheets.length > 0) && (
          <section className="rounded-[14px] border border-line bg-surface px-5 py-4">
            <LibrarySheets sheets={sheets} step={i} onChange={owner ? (worksheets) => set({ worksheets, printRules: rulesWithNewSheets(i.printRules, i.worksheets, worksheets) }) : undefined} />
          </section>
        )}

        {(owner || i.notes.trim()) && (
          <Block tinted title={t('library.notes')} edit={edit('notes', t('library.editNotes'))}>
            {editing === 'notes' ? (
              <TextField multiline value={i.notes} onCommit={(notes) => set({ notes })} aria-label={t('library.notes')} className="mt-1 min-h-[120px]" />
            ) : i.notes.trim() ? (
              <p className="max-w-[64ch] whitespace-pre-line text-[14.5px] leading-relaxed">{i.notes}</p>
            ) : (
              <p className="text-[14px] text-ink-3">{t('library.noNotes')}</p>
            )}
          </Block>
        )}
      </div>

      <aside aria-label={t('library.facts')} className="w-full space-y-3 lg:w-[330px] lg:shrink-0">
        <div className="rounded-[14px] border border-line bg-surface px-5 py-1">
          {timed && (
            <Fact label={t('item.duration')}>
              {owner ? <DurationField value={i.duration} onChange={(duration) => set({ duration })} className="h-9 w-[112px] text-right font-semibold" aria-label={t('item.duration')} /> : <span className="font-semibold tnum">{formatDuration(durationOf(i))}</span>}
            </Fact>
          )}
          {i.kind !== 'note' && (owner || category) && (
            <Fact label={t('item.category')}>
              {owner ? (
                <select className="field h-9 w-auto max-w-[60%] text-[14px]" aria-label={t('item.category')} value={i.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || null })}>
                  <option value="">{t('item.noCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryName(c, t)}
                    </option>
                  ))}
                </select>
              ) : (
                category && (
                  <span className="inline-flex items-center gap-2 font-semibold">
                    {color && <span aria-hidden className="h-[9px] w-[9px] rounded-full" style={{ background: `var(--c-${color})` }} />}
                    {categoryName(category, t)}
                  </span>
                )
              )}
            </Fact>
          )}
          {owner && i.kind !== 'note' && (
            <Fact stacked label={t('item.color')} hint={t('item.colorHint')}>
              <Swatches value={i.color} allowNone onChange={(c) => set({ color: c })} />
            </Fact>
          )}
          {(owner || entry.tags.length > 0) && (
            <Fact stacked label={t('tags.label')}>
              {owner ? <TagEditor id={id} tags={entry.tags} known={known} onChange={onTags} /> : <TagList tags={entry.tags} />}
            </Fact>
          )}
          {i.kind !== 'note' &&
            (editing === 'material' ? (
              <div className="border-b border-line py-3 last:border-b-0">
                <Materials materials={i.materials} onChange={(materials) => set({ materials })} />
                <div className="mt-2 text-right">
                  <Button size="sm" onClick={() => setEditing(null)}>
                    {t('library.selectDone')}
                  </Button>
                </div>
              </div>
            ) : (
              (owner || i.materials.length > 0) && (
                <Fact
                  stacked
                  label={t('item.materials')}
                  action={
                    owner && (
                      <IconButton label={t('library.editMaterial')} onClick={() => setEditing('material')} className="-mr-1.5">
                        <Pencil size={15} />
                      </IconButton>
                    )
                  }
                >
                  {i.materials.length > 0 ? (
                    <ul className="space-y-1 text-[14.5px]">
                      {i.materials.map((m) => (
                        <li key={m.id} className="flex justify-between gap-3">
                          {m.link ? (
                            <a href={m.link} target="_blank" rel="noreferrer" className="min-w-0 truncate underline decoration-line-2 underline-offset-2 hover:decoration-ink-3">
                              {m.label}
                            </a>
                          ) : (
                            <span className="min-w-0 truncate">{m.label}</span>
                          )}
                          <span className="shrink-0 font-semibold tnum">{m.qty}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] text-ink-3">{t('library.noMaterial')}</p>
                  )}
                </Fact>
              )
            ))}
          {i.kind !== 'note' && (owner || i.attachmentIds.length > 0) && (
            <Fact stacked label={t('item.files')}>
              {owner ? <EntryFiles entry={entry} item={0} /> : <EntryFileLinks entry={entry} item={0} />}
            </Fact>
          )}
        </div>
        <Foot entry={entry} />
      </aside>
    </>
  )
}

/** A group: its items in their order, each with what it is and its files, and the group's tags beside them. */
function GroupBody({ entry, owner, categories, known, onTags }: { entry: Extract<LibraryEntry, { kind: 'group' }>; owner: boolean; categories: Category[]; known: string[]; onTags: (tags: string[]) => void }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <>
      <div className="min-w-0 flex-1">
        <Block title={t('library.points')}>
          <ol>
            {entry.data.items.map((i, n) => {
              const category = categories.find((c) => c.id === i.categoryId)
              return (
                <li key={n} className="flex gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
                  <span aria-hidden className="w-[6px] shrink-0 rounded-[3px]" style={{ background: stripColor(i, categories) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-semibold">{i.title || t(`kinds.${i.kind}`)}</span>
                      <span className="shrink-0 text-[13.5px] font-semibold text-brand-ink tnum">{durationOf(i) ? formatDuration(durationOf(i)) : ''}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
                      <span>{category ? categoryName(category, t) : t(`kinds.${i.kind}`)}</span>
                      {i.slides.length > 0 && <span>{t('slides.count', { count: i.slides.length })}</span>}
                      {(i.worksheets ?? []).length > 0 && <span>{t('sheets.count', { count: (i.worksheets ?? []).length })}</span>}
                    </div>
                    {i.description.trim() && <p className="mt-1.5 max-w-[64ch] whitespace-pre-line text-[14.5px]">{i.description}</p>}
                    {i.kind !== 'note' && (owner ? <div className="mt-2"><EntryFiles entry={entry} item={n} compact /></div> : <div className="mt-2 empty:hidden"><EntryFileLinks entry={entry} item={n} /></div>)}
                  </div>
                </li>
              )
            })}
          </ol>
        </Block>
      </div>
      <aside aria-label={t('library.facts')} className="w-full space-y-3 lg:w-[330px] lg:shrink-0">
        {(owner || entry.tags.length > 0) && (
          <div className="rounded-[14px] border border-line bg-surface px-5 py-1">
            <Fact stacked label={t('tags.label')}>
              {owner ? <TagEditor id={id} tags={entry.tags} known={known} onChange={onTags} /> : <TagList tags={entry.tags} />}
            </Fact>
          </div>
        )}
        <Foot entry={entry} />
      </aside>
    </>
  )
}

/** When the entry was made and changed, and how it gets into a workshop. */
function Foot({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation()
  return (
    <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
      {t('list.createdOn', { date: shortDate(entry.createdAt) })} · {t('list.updatedOn', { date: shortDate(entry.updatedAt) })}. {t('library.insertHint')}
    </p>
  )
}
