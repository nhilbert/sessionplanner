import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Code, Copy, Eye, FilePlus, Plus, Printer, Trash2 } from 'lucide-react'
import { entryItems } from '@/domain/copy'
import { newId } from '@/domain/ops'
import { MAX_SHEET_PAGES, MAX_WORKSHEETS, newWorksheets, normalizeSheetHtml, splitPages } from '@/domain/sheets'
import { PAPERS, type Paper, type PrintRule, type Worksheet } from '@/domain/types'
import { ruleOf } from '@/domain/printing'
import { PrintRuleField } from '@/planner/PrintRuleField'
import type { AssetScope } from '@/api'
import { Button, cx, Field, Input, Modal, SectionLabel } from '@/components/ui'
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
  onRule: (sheetId: string, rule: PrintRule) => void
  onGroups: (groups: number) => void
}

export function WorksheetList({ sheets, onChange, scope, theme, logo, onPrint, printing }: { sheets: Worksheet[]; onChange?: (next: Worksheet[]) => void; scope: AssetScope; theme: string; logo: string | null; onPrint?: (sheetId: string) => void; printing?: SheetPrinting }) {
  const { t } = useTranslation()
  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ sheet: Worksheet; isNew: boolean } | null>(null)
  const [picking, setPicking] = useState(false)
  const canEdit = !!onChange
  const full = sheets.length >= MAX_WORKSHEETS
  if (!sheets.length && !canEdit) return null
  const now = () => new Date().toISOString()
  const replace = (sheet: Worksheet) => onChange?.(sheets.some((s) => s.id === sheet.id) ? sheets.map((s) => (s.id === sheet.id ? sheet : s)) : [...sheets, sheet])
  const blank = (): Worksheet => ({ id: newId(), title: t('sheets.newTitle'), paper: 'A4', updatedAt: now(), pages: [{ id: newId(), html: t('sheets.starter') }] })
  const viewed = sheets.find((s) => s.id === viewing)

  const menu = (sheet: Worksheet): MenuItem[] => [
    { label: t('sheets.view'), icon: <Eye size={14} />, onSelect: () => setViewing(sheet.id) },
    ...(onPrint ? [{ label: t('sheets.print'), icon: <Printer size={14} />, onSelect: () => onPrint(sheet.id) }] : []),
    ...(canEdit
      ? [
          { label: t('sheets.source'), icon: <Code size={14} />, onSelect: () => setEditing({ sheet, isNew: false }) },
          { label: t('sheets.duplicate'), icon: <Copy size={14} />, disabled: full, onSelect: () => onChange?.([...sheets, { ...newWorksheets([sheet], newId)[0], title: t('sheets.copyTitle', { title: sheet.title }), updatedAt: now() }]) },
          { label: t('sheets.remove'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: () => onChange?.(sheets.filter((s) => s.id !== sheet.id)) },
        ]
      : []),
  ]

  return (
    <div>
      <SectionLabel>{t('sheets.title')}</SectionLabel>
      {sheets.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
          {sheets.map((sheet) => (
            <li key={sheet.id} className="min-w-0">
              <Thumb sheet={sheet} scope={scope} theme={theme} logo={logo} onOpen={() => setViewing(sheet.id)} />
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
            { label: t('sheets.addBlank'), icon: <FilePlus size={14} />, onSelect: () => setEditing({ sheet: blank(), isNew: true }) },
            { label: t('sheets.addFromLibrary'), icon: <BookOpen size={14} />, onSelect: () => setPicking(true) },
          ]}
        />
      )}
      {viewed && <SheetViewer sheet={viewed} scope={scope} theme={theme} logo={logo} onClose={() => setViewing(null)} onSource={canEdit ? () => (setViewing(null), setEditing({ sheet: viewed, isNew: false })) : undefined} onPrint={onPrint && (() => onPrint(viewed.id))} />}
      {editing && <SheetSource key={editing.sheet.id} sheet={editing.sheet} isNew={editing.isNew} scope={scope} theme={theme} logo={logo} onClose={() => setEditing(null)} onSave={(sheet) => (replace({ ...sheet, updatedAt: now() }), setEditing(null))} />}
      {picking && <LibrarySheetPicker theme={theme} logo={logo} onClose={() => setPicking(false)} onPick={(sheet) => (onChange?.([...sheets, { ...newWorksheets([sheet], newId)[0], updatedAt: now() }]), setPicking(false))} />}
    </div>
  )
}

function Thumb({ sheet, scope, theme, logo, onOpen }: { sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; onOpen: () => void }) {
  const chrome = useSheetChrome(sheet, logo)
  return <SheetPage html={sheet.pages[0]?.html ?? ''} paper={sheet.paper} theme={theme} scope={scope} chrome={chrome(1)} onClick={onOpen} label={sheet.title} />
}

/** All pages of a sheet, large, one under the other. */
export function SheetViewer({ sheet, scope, theme, logo, onClose, onSource, onPrint }: { sheet: Worksheet; scope: AssetScope; theme: string; logo: string | null; onClose: () => void; onSource?: () => void; onPrint?: () => void }) {
  const { t } = useTranslation()
  const chrome = useSheetChrome(sheet, logo)
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
  const found = entries.flatMap((e) => entryItems(e).flatMap((c) => (c.worksheets ?? []).map((sheet) => ({ entry: e.title, sheet }))))
  return (
    <Modal open onClose={onClose} width="max-w-3xl">
      <h2 className="mb-1 text-lg font-medium">{t('sheets.addFromLibrary')}</h2>
      <p className="mb-4 text-[13px] text-ink-3">{t('sheets.pickHint')}</p>
      {!found.length ? (
        <p className="text-[14px] text-ink-2">{t('sheets.noneInLibrary')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
          {found.map(({ entry, sheet }) => (
            <li key={sheet.id} className="min-w-0">
              <PickThumb sheet={sheet} scope="library" theme={theme} logo={logo} onPick={() => onPick(sheet)} />
              <div className="mt-1 truncate text-[13px]">{sheet.title || t('sheets.untitled')}</div>
              <div className="truncate text-[11px] text-ink-3">{entry}</div>
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
