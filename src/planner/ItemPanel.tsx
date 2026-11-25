import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, BookmarkPlus, CalendarPlus, ChevronDown, ChevronRight, Copy, Link2, Minus, Pin, Plus, Trash2, X } from 'lucide-react'
import type { Attachment, Item, ItemKind, Material, PaletteKey, WorkshopState } from '@/domain/types'
import { newId, type ItemFields, type Op } from '@/domain/ops'
import { entriesIn, membersOf, placeIn, positionAtEnd, sortedDays } from '@/domain/order'
import { contentOf } from '@/domain/copy'
import { newSlides } from '@/domain/slides'
import { categoryName, colorVar, itemColor, useLibraryEdit, useSettings } from '@/store/useSettings'
import Swatches from '@/components/Swatches'
import { formatTime, MAX_DURATION, SNAP } from '@/domain/time'
import { plainLine } from '@/domain/markdown'
import { api, reportFailure } from '@/api'
import type { TFunction } from 'i18next'
import { formatDate } from '@/i18n'
import { cx, IconButton, SectionLabel, useLocalState } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { DEFAULT_DURATION, DurationField, QtyField, TextField, TimeField } from './fields'
import NotesField from './NotesField'
import { afterPress } from './press'
import { FileManager } from './FileManager'
import { WorksheetList } from '@/worksheets/WorksheetList'
import { useSheetBrand, useStepFacts } from '@/worksheets/SheetView'
import { pageUrl } from '@/domain/addresses'
import { PrintRuleField } from './PrintRuleField'
import { copyPrinted, isPrintable, printKeys, ruleOf, rulesOfLinked, rulesWithNewSheets, withRule } from '@/domain/printing'
import { SlideStrip } from '@/slides/SlideStrip'
import { themeOf } from '@/slides/SlideView'
import { usePlanner } from '@/store/usePlanner'
import { useSlideEditing, useSlideMoving } from '@/slides/PlannerSlides'

export const KINDS: ItemKind[] = ['block', 'break', 'marker', 'note']

/** What changes with an entry's kind: a marker or note turned into a unit or a break gets a sensible length again. */
export const kindFields = (item: Item, kind: ItemKind): Partial<ItemFields> => {
  const fields: Partial<ItemFields> = { kind }
  if ((kind === 'block' || kind === 'break') && item.duration < SNAP) fields.duration = DEFAULT_DURATION[kind]
  return fields
}

/** The lines of a unit that show only once they say something; until then each is a small "+ …" below the others. */
type Optional = 'goal' | 'method' | 'lead'

/** Something to add, as a quiet pill: an optional line, a fixed start. */
const CHIP = 'tap inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-line-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink pointer-coarse:h-9'
/** The short facts of an entry: the name on the left, the value beside it. */
const FACTS = 'grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5'

/**
 * The details of an entry (docs/ui.md, "The details of an entry"). In the sidebar they are one column: title and
 * short description as text, the short facts as lines (a line that says nothing is a "+ …" instead), then sections
 * that fold, each with how much it holds. Shown large, the same parts stand in two columns: what is written on the
 * left (title, goal, notes, slides), the facts on the right (time, category, material, files, worksheets).
 */
export default function ItemPanel({
  item,
  data,
  change,
  onAttachment,
  onNotice,
  computedStart,
  owner,
  wide,
}: {
  /** Guests cannot replace files of the workshop. */
  owner: boolean
  item: Item
  /** The item's start as computed now; a fixed start switched on takes this time. */
  computedStart: number | null
  data: WorkshopState
  change: (ops: Op[]) => void
  onAttachment: (a: Attachment) => void
  onNotice: (text: string) => void
  /** Shown large in place of the agenda: two columns where there is room for them. */
  wide?: boolean
}) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  // From the offline copy the slides and sheets open to be looked at, not changed (docs/offline.md).
  const readOnly = usePlanner((s) => !!s.offlineAt)
  const brand = useSheetBrand(data.workshop.theme)
  const stepFacts = useStepFacts()
  // who may change the library copies a sheet into an entry
  const libraryEdit = useLibraryEdit()
  const set = (fields: Partial<ItemFields>) => change([{ op: 'set', entity: 'item', id: item.id, fields }])
  /** The workshop's number of participants, asked for where a print rule per person misses it. */
  const setParticipants = (participants: number) => change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { participants } }])
  const timed = item.kind === 'block' || item.kind === 'break'
  const unit = item.kind === 'block'
  /** A note is its title and text only. */
  const more = item.kind !== 'note'

  const notes = useSection('notes')
  const material = useSection('material')
  const files = useSection('files')
  const slides = useSection('slides')
  const sheets = useSection('sheets')

  // A line opened by its "+ …" (or being typed in) stays, also while it is empty; left empty, it is a "+ …" again.
  const [opened, setOpened] = useState<ReadonlySet<Optional>>(new Set())
  const open = (k: Optional) => setOpened((now) => (now.has(k) ? now : new Set(now).add(k)))
  const leave = (k: Optional, text: string) => {
    if (text.trim()) return
    afterPress(() =>
      setOpened((now) => {
        const next = new Set(now)
        next.delete(k)
        return next
      }),
    )
  }
  const shown = (k: Optional) => !!item[k] || opened.has(k)
  // Shown large, the goal stands with the text, not among the facts.
  const optional: Optional[] = unit ? (wide ? ['method', 'lead'] : ['goal', 'method', 'lead']) : []
  /** The material just added: its name takes the focus, once. */
  const [freshMaterial, setFreshMaterial] = useState<string | null>(null)
  const linkedFiles = item.attachmentIds.map((id) => data.attachments.find((a) => a.id === id)).filter((a): a is Attachment => !!a)
  /** The entry as the store has it now: for what arrives later than this view of it (a file that was on its way). */
  const current = (): Item => usePlanner.getState().data?.items.find((i) => i.id === item.id) ?? item

  const title = (
    <div className="-mx-2">
      <TextField wrap value={item.title} onCommit={(title) => set({ title })} placeholder={t('item.title')} aria-label={t('item.title')} autoFocus={!item.title} className={cx('font-bold text-brand-ink', wide ? 'app-title text-[28px]' : 'text-[18px]')} />
    </div>
  )
  // A note's text is Markdown like the facilitation notes, with their toolbar and preview.
  const description = item.kind === 'note' ? (
    <div className="mt-2">
      <NotesField tall={wide} value={item.description} onCommit={(description) => set({ description })} label={t('item.noteText')} />
    </div>
  ) : (
    <div className="-mx-2">
      <TextField multiline bare value={item.description} onCommit={(description) => set({ description })} placeholder={t('item.descriptionAdd')} aria-label={t('item.description')} className={cx('text-ink-2', wide ? 'text-[15px]' : 'text-[14px]')} />
    </div>
  )

  const durationRow = timed && (
    <>
      <FactLabel>{t('item.duration')}</FactLabel>
      <div className="flex items-center gap-1">
        <IconButton label="−5" className="border border-line-2 text-brand-ink" onClick={() => set({ duration: Math.max(SNAP, item.duration - SNAP) })}>
          <Minus size={13} />
        </IconButton>
        <DurationField value={item.duration} onChange={(duration) => set({ duration })} className="field-bare w-[88px] font-bold text-brand-ink" aria-label={t('item.duration')} />
        <IconButton label="+5" className="border border-line-2 text-brand-ink" onClick={() => set({ duration: Math.min(MAX_DURATION, item.duration + SNAP) })}>
          <Plus size={13} />
        </IconButton>
      </div>
    </>
  )
  const startRow = (
    <>
      <FactLabel>{t('item.start')}</FactLabel>
      {item.fixedStart === null ? (
        <div className="flex min-h-8 items-center gap-2">
          <span className="px-2 text-[13px] font-bold text-brand-ink tnum">{computedStart === null ? '–' : formatTime(computedStart)}</span>
          <button type="button" className={CHIP} title={t('item.fixedStart')} onClick={() => set({ fixedStart: computedStart ?? 540 })}>
            <Pin size={12} />
            {t('item.fix')}
          </button>
        </div>
      ) : (
        <div className="flex min-h-8 items-center gap-1.5">
          <TimeField value={item.fixedStart} onChange={(v) => v !== null && set({ fixedStart: v })} className="w-[68px] shrink-0 font-bold text-brand-ink" aria-label={t('item.fixedStart')} />
          <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-[12px] text-ink-3">
            <Pin size={12} className="shrink-0" aria-hidden />
            <span className="truncate">{t('item.fixedStart')}</span>
          </span>
          <IconButton label={t('item.unfix')} onClick={() => set({ fixedStart: null })}>
            <X size={13} />
          </IconButton>
        </div>
      )}
    </>
  )
  const categoryRow = more && (
    <>
      <FactLabel>{t('item.category')}</FactLabel>
      <CategoryMenu item={item} onSet={set} />
    </>
  )
  const optionalRows = optional.filter(shown).map((k) => (
    <Fragment key={k}>
      <FactLabel top={k === 'goal'}>{t(`item.${k}`)}</FactLabel>
      <div className="-ml-2 min-w-0">
        <TextField
          bare
          wrap={k === 'goal'}
          value={item[k]}
          onCommit={(text) => set({ [k]: text } as Partial<ItemFields>)}
          aria-label={t(`item.${k}`)}
          autoFocus={opened.has(k) && !item[k]}
          onFocus={() => open(k)}
          onLeave={(text) => leave(k, text)}
          className={k === 'goal' ? 'text-[14px]' : 'h-8 px-2'}
        />
      </div>
    </Fragment>
  ))
  const missing = optional.filter((k) => !shown(k))
  const chips = missing.length > 0 && (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {missing.map((k) => (
        <button key={k} type="button" className={CHIP} onClick={() => open(k)}>
          <Plus size={12} />
          {t(`item.${k}`)}
        </button>
      ))}
    </div>
  )

  const addMaterial = () => {
    const id = newId()
    setFreshMaterial(id)
    set({ materials: [...item.materials, { id, label: '', qty: 1 }] })
    material.set(true)
  }
  const materialSection = more && (
    <Section
      state={material}
      title={t('item.materials')}
      count={item.materials.length}
      empty={!item.materials.length}
      summary={item.materials.map((m) => m.label).filter(Boolean).join(', ')}
      action={
        <IconButton label={t('item.addMaterial')} onClick={addMaterial}>
          <Plus size={15} />
        </IconButton>
      }
    >
      <Materials materials={item.materials} fresh={freshMaterial} onFresh={() => setFreshMaterial(null)} onChange={(materials) => set({ materials })} />
    </Section>
  )
  const filesSection = more && (
    <Section keep state={files} title={t('item.files')} count={linkedFiles.length} summary={linkedFiles.map((f) => f.name).join(', ')}>
      <Files
        item={item}
        current={current}
        linked={linkedFiles}
        data={data}
        owner={owner}
        onLink={(attachmentIds) => {
          const now = current()
          set({ attachmentIds, printRules: rulesOfLinked(now.printRules ?? {}, printKeys({ attachmentIds, worksheets: now.worksheets })) })
        }}
        onSet={set} onParticipants={setParticipants} onAttachment={onAttachment} />
    </Section>
  )
  const slideStrip = (heading: boolean) => (
    <SlideStrip
      heading={heading}
      slides={item.slides}
      list={{ get: () => usePlanner.getState().data?.items.find((i) => i.id === item.id)?.slides ?? [], set: (slides) => set({ slides }) }}
      onOpen={(key, mode) => useSlideEditing.getState().open({ kind: 'step', itemId: item.id, key, mode })}
      scope={{ workshopId: data.workshop.id }}
      theme={themeOf(data.workshop, settings)}
      canEdit={!readOnly}
      owner={owner}
      onMove={(slideId) => useSlideMoving.getState().ask(item.id, slideId)}
      onRemoved={() => onNotice(t('slides.removed'))}
    />
  )
  const sheetsSection = unit && (
    <Section state={sheets} title={t('sheets.title')} count={(item.worksheets ?? []).length} summary={(item.worksheets ?? []).map((w) => w.title || t('sheets.untitled')).join(', ')}>
      <WorksheetList
        heading={false}
        facts={stepFacts(item)}
        onCopiedToLibrary={libraryEdit ? (title) => onNotice(t('sheets.copiedToLibrary', { title })) : undefined}
        sheets={item.worksheets ?? []}
        // a removed sheet takes its print rule along; a new one is printed once until said otherwise
        onChange={readOnly ? undefined : (worksheets) => set({ worksheets, printRules: rulesOfLinked(rulesWithNewSheets(item.printRules, item.worksheets, worksheets), printKeys({ attachmentIds: item.attachmentIds, worksheets })) })}
        printing={{
          rules: item.printRules ?? {},
          groups: item.groups ?? 1,
          participants: data.workshop.participants ?? null,
          onParticipants: setParticipants,
          onRule: (sheetId, rule) => set({ printRules: withRule(item.printRules ?? {}, sheetId, rule) }),
          onGroups: (groups) => set({ groups }),
        }}
        scope={{ workshopId: data.workshop.id }}
        theme={brand.theme}
        logo={brand.logo}
        onPrint={(sheetId) => window.open(pageUrl(`/w/${data.workshop.id}/print/sheets?sheet=${encodeURIComponent(sheetId)}`), '_blank', 'noopener')}
      />
    </Section>
  )

  if (wide)
    return (
      <div className="grid w-full grid-cols-1 content-start overflow-y-auto overscroll-contain @3xl:grid-cols-[minmax(0,1fr)_340px] @3xl:grid-rows-[minmax(0,1fr)] @3xl:overflow-hidden">
        <div className="min-w-0 px-5 py-5 @3xl:overflow-y-auto @3xl:overscroll-contain @3xl:px-9 @3xl:py-6">
          <div className="max-w-[820px] space-y-5">
            <div>
              {title}
              {description}
            </div>
            {unit && (
              <div className="rounded-xl bg-surface-2 px-3.5 pb-1.5 pt-2.5">
                <div className="text-[13px] font-semibold text-brand-ink">{t('item.goal')}</div>
                <div className="-mx-2">
                  <TextField wrap value={item.goal} onCommit={(goal) => set({ goal })} placeholder={t('item.goalAdd')} aria-label={t('item.goal')} className="text-[15px]" />
                </div>
              </div>
            )}
            {more && <NotesField tall value={item.notes} onCommit={(notes) => set({ notes })} label={t('item.notes')} hint={t('item.notesHint')} />}
            {timed && slideStrip(true)}
          </div>
        </div>
        <div className="min-w-0 border-t border-line bg-surface-2/40 px-5 py-5 @3xl:overflow-y-auto @3xl:overscroll-contain @3xl:border-l @3xl:border-t-0">
          <SectionLabel>{t('item.time')}</SectionLabel>
          <div className={FACTS}>
            {durationRow}
            {startRow}
          </div>
          {more && (
            <>
              <SectionLabel className="mt-5">{t('item.placing')}</SectionLabel>
              <div className={FACTS}>
                {categoryRow}
                {optionalRows}
              </div>
              {chips}
              <div className="mt-5 border-b border-line">
                {materialSection}
                {filesSection}
                {sheetsSection}
              </div>
            </>
          )}
        </div>
      </div>
    )

  return (
    <div>
      {title}
      {description}
      <div className={cx(FACTS, 'mt-2')}>
        {durationRow}
        {startRow}
        {categoryRow}
        {optionalRows}
      </div>
      {chips}
      {more && (
        <div className="mt-4 border-b border-line">
          <NotesField
            value={item.notes}
            onCommit={(text) => set({ notes: text })}
            label={t('item.notes')}
            hint={t('item.notesHint')}
            frame={({ tools, body }) => (
              <Section state={notes} title={t('item.notes')} hint={t('item.notesHint')} summary={plainLine(item.notes)} action={notes.open ? tools : undefined}>
                {body}
              </Section>
            )}
          />
          {materialSection}
          {filesSection}
          {timed && (
            <Section state={slides} title={t('slides.title')} count={item.slides.length}>
              {slideStrip(false)}
            </Section>
          )}
          {sheetsSection}
        </div>
      )}
    </div>
  )
}

/** Whether a section of the details is unfolded, remembered on this device for all entries. */
function useSection(id: string): { open: boolean; set: (open: boolean) => void } {
  const [raw, setRaw] = useLocalState(`sp.details.${id}`, '1')
  return { open: raw === '1', set: (open) => setRaw(open ? '1' : '0') }
}

/**
 * A part of the details that folds: its name, how much it holds and, folded, a line of what that is. A part that
 * holds nothing yet is its head alone, with the way to add to it.
 */
function Section({ state, title, hint, count, summary, action, empty, keep, children }: { state: { open: boolean; set: (open: boolean) => void }; title: string; hint?: string; count?: number; summary?: string; action?: ReactNode; empty?: boolean; /** Folded, its content stays where it is, only out of sight: for what is under way there (a file being sent). */ keep?: boolean; children: ReactNode }) {
  const open = state.open && !empty
  return (
    <section className="border-t border-line">
      <div className="flex items-center gap-0.5">
        <button type="button" disabled={empty} aria-expanded={empty ? undefined : open} onClick={() => state.set(!state.open)} className="flex h-10 min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default pointer-coarse:h-11">
          <ChevronRight size={14} aria-hidden className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-90', empty && 'invisible')} />
          <span className="shrink-0 text-[13px] font-semibold text-brand-ink">{title}</span>
          {!!count && <span className="shrink-0 text-[12px] text-ink-2 tnum">{count}</span>}
          {open ? hint && <span className="truncate text-[12px] text-ink-3">{hint}</span> : summary && <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{summary}</span>}
        </button>
        {action}
      </div>
      {(open || keep) && (
        <div hidden={!open} className="pb-3">
          {children}
        </div>
      )}
    </section>
  )
}

function FactLabel({ children, top }: { children: ReactNode; top?: boolean }) {
  return <div className={cx('text-[13px] text-ink-2', top && 'self-start pt-[7px]')}>{children}</div>
}

/** The category as a dot and its name; the menu holds the categories and, apart from them, an own colour instead of the category's. */
function CategoryMenu({ item, onSet }: { item: Item; onSet: (fields: Partial<ItemFields>) => void }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const category = categories.find((c) => c.id === item.categoryId)
  const name = category ? categoryName(category, t) : t('item.noCategory')
  const dot = (key: PaletteKey | null, className?: string) => <span aria-hidden className={cx('block h-2.5 w-2.5 shrink-0 rounded-full', !key && 'border border-dashed border-line-2', className)} style={{ background: colorVar(key) }} />
  return (
    <Menu
      float
      align="left"
      label={`${t('item.category')}: ${name}`}
      title={t('item.category')}
      className="-ml-2 min-w-0"
      triggerClassName="tap inline-flex h-8 max-w-full items-center gap-2 rounded-[10px] px-2 text-left text-[14px] transition-colors hover:bg-surface-2 pointer-coarse:h-10"
      trigger={
        <>
          {dot(itemColor(item, categories))}
          <span className={cx('truncate', category ? 'font-semibold' : 'text-ink-3')}>{name}</span>
          <ChevronDown size={13} className="shrink-0 text-ink-3" />
        </>
      }
      items={[
        ...categories.map((c) => ({ label: categoryName(c, t), icon: dot(c.color, 'mt-[3px]'), checked: c.id === item.categoryId, onSelect: () => onSet({ categoryId: c.id }) })),
        { label: t('item.noCategory'), icon: dot(null, 'mt-[3px]'), checked: !item.categoryId, separated: true, onSelect: () => onSet({ categoryId: null }) },
      ]}
      footer={
        <>
          <div className="mb-1.5 text-[12px] text-ink-2">
            {t('item.color')} <span className="text-ink-3">{t('item.colorHint')}</span>
          </div>
          <Swatches value={item.color} allowNone onChange={(color) => onSet({ color })} />
        </>
      }
    />
  )
}

/**
 * What can be done with an item, in the order every object's menu has: duplicate, keep in the library, move to the
 * parking lot, then (apart) delete. Shown in the ⋯ of the item's details.
 */
export function itemActions({
  item,
  data,
  change,
  t,
  mayChangeLibrary,
  onSelect,
  onClose,
  onSaved,
  save,
}: {
  item: Item
  data: WorkshopState
  change: (ops: Op[]) => void
  t: TFunction
  /** The owner who may change the library (useLibraryEdit); guests and read-only owners may not. */
  mayChangeLibrary: boolean
  onSelect: (id: string) => void
  onClose: () => void
  onSaved: (title: string) => void
  save: (entry: { kind: 'item'; title: string; data: ReturnType<typeof contentOf> }) => Promise<unknown>
}): MenuItem[] {
  const duplicate = () => {
    const grouped = item.groupId !== null && data.groups.some((g) => g.id === item.groupId)
    const siblings = grouped ? membersOf(data.items, item.groupId!) : entriesIn(data, item.dayId)
    const index = siblings.findIndex((s) => s.id === item.id) + 1
    const copy: Item = { ...item, id: newId(), fixedStart: null, materials: item.materials.map((m) => ({ ...m, id: newId() })), slides: newSlides(item.slides, newId), ...copyPrinted(item, (id) => id, newId) }
    const { position, ops } = placeIn(data, siblings.map((s) => s.id), copy.id, index)
    ops.push({ op: 'create', entity: 'item', record: { ...copy, position } })
    change(ops)
    onSelect(copy.id)
  }
  const toLibrary = async () => {
    try {
      await save({ kind: 'item', title: item.title || t(`kinds.${item.kind}`), data: contentOf(item) })
      onSaved(item.title || t(`kinds.${item.kind}`))
    } catch (err) {
      reportFailure(err)
    }
  }
  return [
    { label: t('item.duplicate'), icon: <Copy size={14} />, onSelect: duplicate },
    ...(mayChangeLibrary && item.kind !== 'note' ? [{ label: t('item.saveToLibrary'), icon: <BookmarkPlus size={14} />, onSelect: () => void toLibrary() }] : []),
    // To the end of a day: the way back from the parking lot, and to another day, with a place that is known beforehand.
    // The days in the order and with the numbers of the day tabs, so two days of one date can be told apart.
    ...sortedDays(data.days)
      .map((d, i, all) => ({ d, name: `${all.length > 1 ? `${i + 1} · ` : ''}${formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}` }))
      .filter(({ d }) => d.id !== item.dayId)
      .map(({ d, name }) => ({
        label: t('item.toDay', { day: name }),
        icon: <CalendarPlus size={14} />,
        onSelect: () => change([{ op: 'set', entity: 'item', id: item.id, fields: { dayId: d.id, groupId: null, position: positionAtEnd(entriesIn(data, d.id)) } }]),
      })),
    ...(item.dayId !== null
      ? [{ label: t('item.toParking'), icon: <Archive size={14} />, onSelect: () => change([{ op: 'set', entity: 'item', id: item.id, fields: { dayId: null, groupId: null, position: positionAtEnd(entriesIn(data, null)) } }]) }]
      : []),
    {
      label: t('item.delete'),
      icon: <Trash2 size={14} />,
      danger: true,
      separated: true,
      onSelect: () => {
        change([{ op: 'delete', entity: 'item', id: item.id }])
        onClose()
      },
    },
  ]
}

/** The material of an entry: how many, what, and a link where one helps (it shows once it is asked for or set). */
export function Materials({ materials, fresh, onFresh, onChange }: { materials: Material[]; /** The row just added. */ fresh: string | null; /** It has taken the focus: it is new no longer (shown again, it would take the focus again). */ onFresh: () => void; onChange: (m: Material[]) => void }) {
  const { t } = useTranslation()
  const [links, setLinks] = useState<ReadonlySet<string>>(new Set())
  const update = (id: string, fields: Partial<Material>) => onChange(materials.map((m) => (m.id === id ? { ...m, ...fields } : m)))
  const showLink = (id: string, on: boolean) =>
    setLinks((now) => {
      const next = new Set(now)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return (
    <ul className="space-y-0.5">
      {materials.map((m) => {
        const linked = !!m.link || links.has(m.id)
        return (
          <li key={m.id}>
            <div className="flex items-start">
              {/* Without the browser's own arrows: in a field this narrow they would cut a number of two digits. */}
              <QtyField value={m.qty} aria-label={t('item.qty')} onChange={(qty) => update(m.id, { qty })} style={{ width: 42 }} className={cx('field-bare shrink-0 font-bold text-brand-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} />
              <span aria-hidden className="mt-[7px] w-3 shrink-0 text-center text-[12px] text-ink-3">
                ×
              </span>
              <TextField wrap value={m.label} onCommit={(label) => update(m.id, { label })} placeholder={t('item.materialLabel')} aria-label={t('item.materialLabel')} autoFocus={m.id === fresh} onFocus={() => m.id === fresh && onFresh()} className="min-w-0 flex-1 text-[14px]" />
              {!linked && (
                <IconButton label={t('item.link')} className="mt-0.5 shrink-0" onClick={() => showLink(m.id, true)}>
                  <Link2 size={13} />
                </IconButton>
              )}
              <IconButton label={t('item.removeMaterial')} className="mt-0.5 shrink-0" onClick={() => onChange(materials.filter((x) => x.id !== m.id))}>
                <X size={14} />
              </IconButton>
            </div>
            {linked && (
              <div className="mb-1 pl-[54px] pr-7">
                <TextField
                  value={m.link ?? ''}
                  onCommit={(link) => {
                    const v = link.trim()
                    // Only web and mail links are stored (server/validate.ts); anything else gets https:// in front.
                    update(m.id, { link: v && !/^(https?:\/\/|mailto:)/i.test(v) ? `https://${v}` : v })
                  }}
                  onLeave={(text) => !text.trim() && afterPress(() => showLink(m.id, false))}
                  autoFocus={links.has(m.id) && !m.link}
                  placeholder={t('item.link')}
                  aria-label={t('item.link')}
                  className="h-8 text-[13px]"
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Files({ item, current, linked, data, owner, onLink, onSet, onParticipants: setParticipants, onAttachment }: { item: Item; /** The entry as the store has it now. */ current: () => Item; /** The files linked to the entry, in its order. */ linked: Attachment[]; data: WorkshopState; owner: boolean; onLink: (ids: string[]) => void; onSet: (fields: Partial<ItemFields>) => void; onParticipants: (n: number) => void; onAttachment: (a: Attachment) => void }) {
  const { t } = useTranslation()
  // Several files dropped at once arrive one after the other, and one may arrive after this list was taken down and
  // put up again (the details made large while it was on its way): each adds to the entry's list as the store has it
  // by then, not as this list saw it when the file was sent.
  const links = () => current().attachmentIds
  const link = onLink
  const others = data.attachments.filter((a) => !item.attachmentIds.includes(a.id))

  return (
    <FileManager
      files={linked}
      href={api.downloadUrl}
      onUpload={async (file) => {
        const a = await api.upload(data.workshop.id, file)
        onAttachment(a)
        link([...links(), a.id])
      }}
      onRename={async (id, name) => onAttachment(await api.renameAttachment(id, name))}
      onReplace={owner ? async (id, file) => onAttachment(await api.replaceAttachment(id, file)) : undefined}
      remove={{ label: t('item.unlink'), run: (a) => link(links().filter((x) => x !== a.id)) }}
      extra={(f) =>
        isPrintable(f.name) && (
          <PrintRuleField
            name={f.name}
            rule={ruleOf(item, f.id)}
            groups={item.groups ?? 1}
            participants={data.workshop.participants ?? null}
            onParticipants={setParticipants}
            onRule={(rule) => onSet({ printRules: withRule(item.printRules ?? {}, f.id, rule) })}
            onGroups={(groups) => onSet({ groups })}
          />
        )
      }
    >
      {others.length > 0 && (
        <select className="field mt-2 h-8 w-full text-[13px]" aria-label={t('item.linkFile')} value="" onChange={(e) => e.target.value && link([...links(), e.target.value])}>
          <option value="">{t('item.linkFile')}</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
    </FileManager>
  )
}
