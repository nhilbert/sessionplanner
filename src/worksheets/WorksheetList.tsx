import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, BookmarkPlus, Code, Copy, Eye, FilePlus, Pencil, Plus, Printer, Search, Shuffle, Trash2 } from 'lucide-react'
import { matchesWords } from '@/store/useLibrary'
import { reportFailure } from '@/api'
import { sampleSets, seeded, variant } from '@/domain/sampleSets'
import { SHEET_STARTERS, starterSheet, starterWords } from '@/domain/sheetStarters'
import { SheetEditor } from './editor/SheetEditor'
import { entryItems } from '@/domain/copy'
import { newId } from '@/domain/ops'
import { slideText } from '@/domain/slides'
import { MAX_SHEET_PAGES, MAX_WORKSHEETS, newWorksheets, normalizeSheetHtml, splitPages } from '@/domain/sheets'
import { type ItemContent, PAPERS, type Paper, type PrintRule, type Worksheet } from '@/domain/types'
import { ruleOf, rulesWithNewSheets } from '@/domain/printing'
import { PrintRuleField } from '@/planner/PrintRuleField'
import type { AssetScope } from '@/api'
import { Button, cx, Field, Input, Modal, SearchField, SectionLabel } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { useLibrary } from '@/store/useLibrary'
import { SheetPage, useSheetChrome } from './SheetView'

/**
 * The worksheets of a step or library entry (docs/worksheets.md, section 6): a thumbnail per sheet, a click opens the
 * viewer; each sheet's ⋯ views, edits its source, duplicates and removes it. A new sheet starts empty from its source
 * or as a copy of a sheet in the library. The editor proper is stage 3.
 */
/** How a step prints its sheets (docs/worksheets.md): shown under each sheet in a workshop, not in the library. */
export interface SheetPrinting {
  rules: Record<string, PrintRule>
  groups: number
  participants: number | null
  onParticipants?: (n: number) => void
  onRule: (sheetId: string, rule: PrintRule) => void
  onGroups: (groups: number) => void
}

export function WorksheetList({ sheets, onChange, scope, theme, logo, onPrint, printing, facts, onCopiedToLibrary, heading = true }: { /** Off where the place names the sheets itself (a section of the details that folds). */ heading?: boolean; /** Who may change the library copies a step's sheet into an entry; called with the entry's title. */ onCopiedToLibrary?: (title: string) => void; /** The step's facts, for the facts block of its sheets. */ facts?: string; sheets: Worksheet[]; onChange?: (next: Worksheet[]) => void; scope: AssetScope; theme: string; logo: string | null; onPrint?: (sheetId: string) => void; printing?: SheetPrinting }) {
  const { t } = useTranslation()
  /** The sheet open in the editor, and whether it opened for editing. */
  const [viewing, setViewing] = useState<string | null>(null)
  const [startEditing, setStartEditing] = useState(false)
  const [starting, setStarting] = useState(false)
  /** The sheet being copied into a library entry. */
  const [copying, setCopying] = useState<Worksheet | null>(null)
  const open = (id: string, edit = false) => (setStartEditing(edit), setViewing(id))
  const [editing, setEditing] = useState<{ sheet: Worksheet; isNew: boolean } | null>(null)
  const [picking, setPicking] = useState(false)
  const canEdit = !!onChange
  const full = sheets.length >= MAX_WORKSHEETS
  if (!sheets.length && !canEdit) return null
  const now = () => new Date().toISOString()
  const replace = (sheet: Worksheet) => onChange?.(sheets.some((s) => s.id === sheet.id) ? sheets.map((s) => (s.id === sheet.id ? sheet : s)) : [...sheets, sheet])
  const viewed = sheets.find((s) => s.id === viewing)

  const menu = (sheet: Worksheet): MenuItem[] => [
    { label: t('sheets.view'), icon: <Eye size={14} />, onSelect: () => open(sheet.id) },
    ...(canEdit ? [{ label: t('sheetEditor.edit'), icon: <Pencil size={14} />, onSelect: () => open(sheet.id, true) }] : []),
    ...(onPrint ? [{ label: t('sheets.print'), icon: <Printer size={14} />, onSelect: () => onPrint(sheet.id) }] : []),
    ...(canEdit
      ? [
          { label: t('sheets.source'), icon: <Code size={14} />, onSelect: () => setEditing({ sheet, isNew: false }) },
          ...(onCopiedToLibrary ? [{ label: t('sheets.toLibrary'), icon: <BookmarkPlus size={14} />, onSelect: () => setCopying(sheet) }] : []),
          { label: t('sheets.duplicate'), icon: <Copy size={14} />, disabled: full, onSelect: () => onChange?.([...sheets, { ...newWorksheets([sheet], newId)[0], title: t('sheets.copyTitle', { title: sheet.title }), updatedAt: now() }]) },
          { label: t('sheets.remove'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: () => onChange?.(sheets.filter((s) => s.id !== sheet.id)) },
        ]
      : []),
  ]

  return (
    <div>
      {heading && <SectionLabel>{t('sheets.title')}</SectionLabel>}
      {sheets.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
          {sheets.map((sheet) => (
            <li key={sheet.id} className="min-w-0">
              <Thumb sheet={sheet} scope={scope} theme={theme} logo={logo} facts={facts} onOpen={() => open(sheet.id)} />
              <div className="mt-1 flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]" title={sheet.title}>
                    {sheet.title || t('sheets.untitled')}
                  </div>
                  <div className="text-[11px] text-ink-3">{t('sheets.facts', { count: sheet.pages.length, paper: sheet.paper })}</div>
                </div>
                <Menu items={menu(sheet)} label={t('sheets.actions', { title: sheet.title })} float />
              </div>
              {printing && (
                <PrintRuleField
                  name={sheet.title}
                  rule={ruleOf({ printRules: printing.rules }, sheet.id)}
                  groups={printing.groups}
                  participants={printing.participants}
                  onParticipants={printing.onParticipants}
                  paper={sheet.paper}
                  onRule={(rule) => printing.onRule(sheet.id, rule)}
                  onGroups={printing.onGroups}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Menu
          label={t('sheets.add')}
          align="left"
          float
          className={cx('mt-1.5', full && 'pointer-events-none opacity-50')}
          triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
          trigger={
            <>
              <Plus size={13} />
              {t('sheets.add')}
            </>
          }
          items={[
            { label: t('sheets.addNew'), icon: <FilePlus size={14} />, onSelect: () => setStarting(true) },
            { label: t('sheets.addFromLibrary'), icon: <BookOpen size={14} />, onSelect: () => setPicking(true) },
          ]}
        />
      )}
      {viewed && <SheetEditor key={viewed.id} sheet={viewed} scope={scope} theme={theme} logo={logo} facts={facts} canEdit={canEdit} startEditing={startEditing} onSave={(sheet) => replace({ ...sheet, updatedAt: now() })} onClose={() => setViewing(null)} onPrint={onPrint && (() => onPrint(viewed.id))} />}
      {copying && (
        <LibraryTargetPicker
          sheet={copying}
          onClose={() => setCopying(null)}
          onCopied={(title) => {
            setCopying(null)
            onCopiedToLibrary?.(title)
          }}
        />
      )}
      {starting && (
        <StarterPicker
          scope={scope}
          theme={theme}
          logo={logo}
          onClose={() => setStarting(false)}
          onPick={(title, pages, paper) => {
            const sheet: Worksheet = { id: newId(), title, paper: paper ?? 'A4', updatedAt: now(), pages: pages.map((html) => ({ id: newId(), html })) }
            onChange?.([...sheets, sheet])
            setStarting(false)
            open(sheet.id, true)
          }}
        />
      )}
      {editing && <SheetSource key={editing.sheet.id} sheet={editing.sheet} isNew={editing.isNew} scope={scope} theme={theme} logo={logo} onClose={() => setEditing(null)} onSave={(sheet) => (replace({ ...sheet, updatedAt: now() }), setEditing(null))} />}
      {picking && <LibrarySheetPicker theme={theme} logo={logo} onClose={() => setPicking(false)} onPick={(sheet) => (onChange?.([...sheets, { ...newWorksheets([sheet], newId)[0], updatedAt: now() }]), setPicking(false))} />}
    </div>
  )
}

function Thumb({ sheet, scope, theme, logo, facts, onOpen }: { sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; facts?: string; onOpen: () => void }) {
  const chrome = useSheetChrome(sheet, logo, facts)
  return <SheetPage html={sheet.pages[0]?.html ?? ''} paper={sheet.paper} theme={theme} scope={scope} chrome={chrome(1)} onClick={onOpen} label={sheet.title} />
}

/** All pages of a sheet, large, one under the other. */
export function SheetViewer({ sheet, scope, theme, logo, facts, onClose, onSource, onPrint }: { facts?: string; sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; onClose: () => void; onSource?: () => void; onPrint?: () => void }) {
  const { t } = useTranslation()
  const chrome = useSheetChrome(sheet, logo, facts)
  return (
    <Modal open onClose={onClose} width="max-w-3xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[4vh]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-medium">{sheet.title || t('sheets.untitled')}</h2>
          <div className="text-[12px] text-ink-3">{t('sheets.facts', { count: sheet.pages.length, paper: sheet.paper })}</div>
        </div>
        {onPrint && (
          <Button size="sm" variant="ghost" onClick={onPrint}>
            <Printer size={14} />
            {t('sheets.print')}
          </Button>
        )}
        {onSource && (
          <Button size="sm" variant="ghost" onClick={onSource}>
            <Code size={14} />
            {t('sheets.source')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      <div className="space-y-5 bg-surface-2 p-3 md:p-5">
        {sheet.pages.map((p, i) => (
          <SheetPage key={p.id} html={p.html} paper={sheet.paper} theme={theme} scope={scope} chrome={chrome(i + 1)} label={t('sheets.page', { n: i + 1 })} />
        ))}
      </div>
    </Modal>
  )
}

/**
 * A sheet as its source: its title, paper size and pages written as one text, each page a <section class="sheet">.
 * The preview beside it shows the pages as they will be stored (sanitised); saving keeps the ids of pages in place.
 */
function SheetSource({ sheet, isNew, scope, theme, logo, onClose, onSave }: { sheet: Worksheet; isNew: boolean; scope: AssetScope; theme: string; logo: string | null; onClose: () => void; onSave: (sheet: Worksheet) => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(sheet.title)
  const [paper, setPaper] = useState<Paper>(sheet.paper)
  const [source, setSource] = useState(() => sheet.pages.map((p) => p.html).join('\n\n'))
  const deferred = useDeferredValue(source)
  const pages = useMemo(() => splitPages(deferred).map(normalizeSheetHtml), [deferred])
  const draft: Worksheet = { ...sheet, title, paper, pages: pages.map((html, i) => ({ id: sheet.pages[i]?.id ?? `p${i}`, html })) }
  const chrome = useSheetChrome(draft, logo)
  const problem = !pages.length ? t('sheets.noPages') : pages.length > MAX_SHEET_PAGES ? t('sheets.tooManyPages', { max: MAX_SHEET_PAGES }) : ''
  const save = () => {
    const now = splitPages(source).map(normalizeSheetHtml)
    onSave({ ...sheet, title: title.trim(), paper, pages: now.map((html, i) => ({ id: sheet.pages[i]?.id ?? newId(), html })) })
  }
  return (
    <Modal open onClose={onClose} width="max-w-6xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[4vh]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!problem) save()
        }}
      >
        <h2 className="text-lg font-medium">{isNew ? t('sheets.addBlank') : t('sheets.source')}</h2>
        <div className="flex flex-wrap gap-3">
          <Field label={t('sheets.titleField')} className="min-w-[14rem] flex-1">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('sheets.paper')}>
            <select className="field h-9 text-[14px]" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
              {PAPERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,22rem)]">
          <div>
            <textarea className="field h-[60vh] w-full resize-none p-3 font-mono text-[12px] leading-[1.45]" spellCheck={false} aria-label={t('sheets.source')} value={source} onChange={(e) => setSource(e.target.value)} />
            <p className="mt-1 text-[12px] text-ink-3">{t('sheets.sourceHint')}</p>
          </div>
          <div className="max-h-[64vh] space-y-3 overflow-y-auto bg-surface-2 p-3">
            {pages.slice(0, MAX_SHEET_PAGES).map((html, i) => (
              <SheetPage key={i} html={html} paper={paper} theme={theme} scope={scope} chrome={chrome(i + 1)} label={t('sheets.page', { n: i + 1 })} />
            ))}
          </div>
        </div>
        {problem && (
          <p role="alert" className="text-[13px] text-rose">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={!!problem || !title.trim()}>
            {t('sheets.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** The sheets of the library, by entry: picking one makes a copy for the step. */
function LibrarySheetPicker({ theme, logo, onClose, onPick }: { theme: string; logo: string | null; onClose: () => void; onPick: (sheet: Worksheet) => void }) {
  const { t } = useTranslation()
  const entries = useLibrary((s) => s.entries)
  const load = useLibrary((s) => s.load)
  useEffect(() => void load(), [load])
  const [query, setQuery] = useState('')
  // every sheet of the library with where it lies; found by its title, its entry, its step and what its pages say
  const found = useMemo(
    () =>
      entries.flatMap((e) =>
        entryItems(e).flatMap((c) =>
          (c.worksheets ?? []).map((sheet) => {
            const entry = e.kind === 'group' && c.title ? `${e.title} › ${c.title}` : e.title
            return { entry, sheet, text: `${sheet.title} ${entry} ${e.tags.join(' ')} ${sheet.pages.map((p) => slideText(p.html)).join(' ')}`.toLowerCase() }
          }),
        ),
      ),
    [entries],
  )
  const shown = query.trim() ? found.filter((x) => matchesWords(x.text, query)) : found
  return (
    <Modal open onClose={onClose} width="max-w-3xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-medium">{t('sheets.addFromLibrary')}</h2>
        {found.length > 0 && <SearchField value={query} onChange={setQuery} placeholder={t('sheets.pickSearch')} className="w-full md:w-64" />}
      </div>
      <p className="mb-4 text-[13px] text-ink-3">{t('sheets.pickHint')}</p>
      {!found.length ? (
        <p className="text-[14px] text-ink-2">{t('sheets.noneInLibrary')}</p>
      ) : !shown.length ? (
        <p className="py-8 text-center text-[14px] text-ink-2">{t('library.noMatch', { q: query.trim() })}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
          {shown.map(({ entry, sheet }) => (
            <li key={sheet.id} className="min-w-0">
              <PickThumb sheet={sheet} scope="library" theme={theme} logo={logo} onPick={() => onPick(sheet)} />
              <div className="mt-1 truncate text-[13px]" title={sheet.title}>
                {sheet.title || t('sheets.untitled')}
              </div>
              <div className="truncate text-[11px] text-ink-3" title={entry}>
                {entry}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function PickThumb({ sheet, scope, theme, logo, onPick }: { sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; onPick: () => void }) {
  const chrome = useSheetChrome(sheet, logo)
  return <SheetPage html={sheet.pages[0]?.html ?? ''} paper={sheet.paper} theme={theme} scope={scope} chrome={chrome(1)} onClick={onPick} label={sheet.title} />
}

/** "New worksheet": the starter sheets, filled with a made-up subject drawn at random (Shuffle draws again). */
function StarterPicker({ scope, theme, logo, onClose, onPick }: { scope: AssetScope; theme: string; logo: string | null; onClose: () => void; onPick: (title: string, pages: string[], paper?: Paper) => void }) {
  const { t, i18n } = useTranslation()
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const starters = useMemo(() => {
    const random = seeded(seed)
    const sets = sampleSets(i18n.language)
    const words = starterWords(i18n.language)
    return SHEET_STARTERS.map((kind) => ({ kind, ...starterSheet(kind, variant(sets[Math.floor(random() * sets.length)], random), words) }))
  }, [seed, i18n.language])
  return (
    <Modal open onClose={onClose} width="max-w-4xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="flex-1 text-lg font-medium">{t('sheets.addNew')}</h2>
        <Button size="sm" variant="ghost" onClick={() => setSeed((x) => x + 1)}>
          <Shuffle size={14} />
          {t('sheets.shuffle')}
        </Button>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
        {starters.map((s) => (
          <li key={s.kind} className="min-w-0">
            <SheetPage html={s.pages[0]} paper={s.paper ?? 'A4'} theme={theme} scope={scope} chrome={{ date: '', n: 1, total: 1, logo }} onClick={() => onPick(s.title, s.pages, s.paper)} label={t(`sheets.starter.${s.kind}`)} />
            {/* the name picks it too; the page above is the one stop for the keyboard */}
            <button type="button" tabIndex={-1} className="mt-1 block w-full text-left text-[13px] hover:text-accent-strong" onClick={() => onPick(s.title, s.pages, s.paper)}>
              {t(`sheets.starter.${s.kind}`)}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/**
 * A step's sheet copied into an existing library entry (a unit, or a unit inside a group): the entries to choose
 * from, searchable; the copy gets ids of its own and joins the entry's sheets at the end. Its print rule stays with
 * the workshop.
 */
function LibraryTargetPicker({ sheet, onClose, onCopied }: { sheet: Worksheet; onClose: () => void; onCopied: (title: string) => void }) {
  const { t } = useTranslation()
  const entries = useLibrary((st) => st.entries)
  const load = useLibrary((st) => st.load)
  const save = useLibrary((st) => st.save)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => void load(), [load])
  const targets = entries.flatMap((e) =>
    entryItems(e).flatMap((c, n) => (c.kind === 'block' ? [{ entry: e, n, label: e.kind === 'group' ? `${e.title} › ${c.title || t('sheets.untitled')}` : e.title, count: (c.worksheets ?? []).length, same: (c.worksheets ?? []).some((w) => w.title === sheet.title) }] : [])),
  )
  const shown = targets.filter((x) => !query.trim() || matchesWords(x.label.toLowerCase(), query))
  const pick = async (x: (typeof targets)[number]) => {
    const copy = { ...newWorksheets([sheet], newId)[0], updatedAt: new Date().toISOString() }
    // new in the entry: printed once wherever the entry is inserted, until said otherwise there
    const add = (c: ItemContent): ItemContent => ({ ...c, worksheets: [...(c.worksheets ?? []), copy], printRules: rulesWithNewSheets(c.printRules, c.worksheets, [...(c.worksheets ?? []), copy]) })
    const e = x.entry
    setBusy(true)
    try {
      if (e.kind === 'group') await save({ kind: 'group', title: e.title, data: { items: e.data.items.map((c, n) => (n === x.n ? add(c) : c)) } }, e.id)
      else await save({ kind: 'item', title: e.title, data: add(e.data) }, e.id)
      onCopied(x.label)
    } catch (err) {
      reportFailure(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} width="max-w-lg">
      <h2 className="mb-1 text-lg font-medium">{t('sheets.toLibrary')}</h2>
      <p className="mb-3 text-[13px] text-ink-3">{t('sheets.toLibraryHint', { title: sheet.title })}</p>
      <label className="relative mb-3 block">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('sheets.toLibrarySearch')} className="pl-8" />
      </label>
      {!targets.length ? (
        <p className="text-[14px] text-ink-2">{t('sheets.toLibraryNone')}</p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {shown.map((x) => {
            const full = x.count >= MAX_WORKSHEETS
            return (
              <li key={`${x.entry.id}:${x.n}`}>
                <button type="button" disabled={busy || full} onClick={() => void pick(x)} className="flex w-full items-baseline gap-3 px-2 py-2 text-left text-[14px] hover:bg-surface-2 disabled:opacity-40">
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                  {/* a second copy is allowed, but said: the entry holds a sheet of this title already */}
                  <span className={cx('shrink-0 text-[12px]', x.same && !full ? 'text-amber' : 'text-ink-3')}>{full ? t('sheets.toLibraryFull') : x.same ? t('sheets.toLibrarySame') : t('sheets.count', { count: x.count })}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
