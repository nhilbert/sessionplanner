import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  Archive,
  ArchiveRestore,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileText,
  FileCode,
  FileStack,
  MonitorSpeaker,
  PanelRight,
  Play,
  Presentation,
  Printer,
  Redo2,
  Rows2,
  Rows3,
  Rows4,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react'
import type { Op } from '@/domain/ops'
import type { WorkshopState } from '@/domain/types'
import { PRINT_VARIANTS } from '@/domain/print'
import { pageUrl } from '@/domain/addresses'
import { formatDate } from '@/i18n'
import { api } from '@/api'
import { VARIANT_LABEL } from '@/print/options'
import { hasWorkshopSharing, workshopToolFor } from '@/features'
import { cx, IconButton, Modal } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { useDeckExport } from '@/slides/useDeckExport'
import { TextField } from './fields'
import { AccessPanel, deleteWorkshop, DuplicateDialog } from './panels'
import { sortedDays } from '@/domain/order'
import { formatStamp } from '@/offline/OfflineNotice'
import { PrintPackageDialog } from './PrintPackageDialog'

/** The trigger of a labelled menu or button in the header: quiet, with its label where the header has room. */
const headerButton = 'tap inline-flex h-9 items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3.5 text-[14px] font-bold text-brand-ink transition-colors hover:bg-surface-2'

interface Props {
  data: WorkshopState
  owner: boolean
  phone: boolean
  live: boolean
  /** Shown from the offline copy, as of when (docs/offline.md). */
  offlineAt?: string | null
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  change: (ops: Op[]) => void
  showDescription: boolean
  onShowDescription: (on: boolean) => void
  zoom: string
  onZoom: (zoom: string) => void
  onAddDay: () => void
  /** Phones: the sidebar as a full screen. */
  onOpenSidebar: () => void
}

/**
 * The workshop's header: what belongs to the workshop as a whole, one place per kind of thing. Its title; undo and
 * redo; how the agenda is shown (View); who has access (Share); everything the workshop gives out on paper or as a
 * file (Output); presenting it, the one main action; and the workshop's own actions in ⋯ (a day more, duplicate,
 * archive, then delete apart). On a phone the same groups sit in one ⋯, with Present beside it.
 */
export default function WorkshopHeader(p: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const w = p.data.workshop
  const [sharing, setSharing] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [printing, setPrinting] = useState(false)
  const { save, progress } = useDeckExport(p.data)
  const days = [...p.data.days].sort((a, b) => a.date.localeCompare(b.date))
  const dates = days.length ? (days.length === 1 ? formatDate(days[0].date) : `${formatDate(days[0].date)} – ${formatDate(days[days.length - 1].date)}`) : ''
  const share = p.owner && hasWorkshopSharing()
  const open = (path: string) => window.open(pageUrl(`/w/${w.id}/${path}`), '_blank', 'noopener')
  const downloadZip = () => {
    const a = document.createElement('a')
    a.href = api.workshopExportUrl(w.id)
    a.download = ''
    a.click()
  }

  // ---- the groups of actions, shared by the desktop's menus and the phone's one menu ------------------------------
  const view: MenuItem[] = [
    { label: t('planner.showDescription'), icon: <AlignLeft size={14} />, checked: p.showDescription, onSelect: () => p.onShowDescription(!p.showDescription) },
    { label: t('planner.zoomS'), icon: <Rows4 size={14} />, checked: p.zoom === 's', separated: true, onSelect: () => p.onZoom('s') },
    { label: t('planner.zoomM'), icon: <Rows3 size={14} />, checked: p.zoom === 'm', onSelect: () => p.onZoom('m') },
    { label: t('planner.zoomL'), icon: <Rows2 size={14} />, checked: p.zoom === 'l', onSelect: () => p.onZoom('l') },
  ]
  const output: MenuItem[] = [
    ...PRINT_VARIANTS.map((v) => ({ label: t(VARIANT_LABEL[v]), icon: <Printer size={14} />, onSelect: () => open(`print/${v}`) })),
    { label: t('slides.printSlides'), icon: <Printer size={14} />, onSelect: () => open('print/slides') },
    { label: t('sheets.printAll'), hint: t('sheets.printHint'), icon: <Printer size={14} />, onSelect: () => open('print/sheets') },
    { label: t('output.printPackage'), hint: t('output.printPackageHint'), icon: <FileStack size={14} />, onSelect: () => setPrinting(true) },
    { label: t('output.pptx'), hint: t('output.pptxHint'), icon: <Presentation size={14} />, separated: true, disabled: !!progress, onSelect: () => void save('pptx') },
    { label: t('output.pdf'), hint: t('output.pdfHint'), icon: <FileText size={14} />, disabled: !!progress, onSelect: () => void save('pdf') },
    { label: t('output.html'), hint: t('output.htmlHint'), icon: <FileCode size={14} />, disabled: !!progress, onSelect: () => void save('html') },
    ...(p.owner ? [{ label: t('output.zip'), hint: t('output.zipHint'), icon: <FileArchive size={14} />, separated: true, onSelect: downloadZip }] : []),
  ]
  const present: MenuItem[] = [
    { label: t('output.presentFull'), hint: t('output.presentFullHint'), icon: <Play size={14} />, onSelect: () => open('present') },
    { label: t('slides.presenter'), hint: t('output.presenterHint'), icon: <MonitorSpeaker size={14} />, onSelect: () => open('presenter') },
  ]
  const own: MenuItem[] = [
    { label: t('planner.addDay'), icon: <CalendarPlus size={14} />, onSelect: p.onAddDay },
    ...(p.owner
      ? [
          { label: t('workshop.duplicate'), icon: <Copy size={14} />, onSelect: () => setDuplicating(true) },
          {
            label: w.archived ? t('workshop.unarchive') : t('workshop.archive'),
            icon: w.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
            onSelect: () => p.change([{ op: 'set', entity: 'workshop', id: w.id, fields: { archived: !w.archived } }]),
          },
          { label: t('workshop.delete'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: () => void deleteWorkshop(w, t, navigate) },
        ]
      : []),
  ]
  // From the offline copy the workshop's own actions stay in the menu, but say that they need the connection.
  const workshop: MenuItem[] = p.offlineAt ? own.map((it) => ({ ...it, disabled: true, hint: t('offline.needsConnection') })) : own
  const exporting = progress && (progress.kind === 'html' ? t('output.exportingHtml') : t('slides.exporting', progress))

  const title = (
    <div className="min-w-0 flex-1">
      <TextField
        value={w.title}
        onCommit={(title) => p.change([{ op: 'set', entity: 'workshop', id: w.id, fields: { title } }])}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={t('workshops.untitled')}
        aria-label={t('workshop.title')}
        className="app-title field-bare -ml-2 h-9 w-full max-w-xl text-ellipsis px-2 text-[19px] md:text-[21px]"
      />
      <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
        <span title={p.live ? t('planner.live') : t('planner.offline')} className={cx('h-1.5 w-1.5 shrink-0 rounded-full', p.live ? 'bg-[var(--c-sage)]' : 'bg-amber')} />
        {!p.live && <span className="shrink-0 text-amber">{p.offlineAt ? t('offline.short', { at: formatStamp(p.offlineAt) }) : t('planner.offline')}</span>}
        <span className="truncate">{[w.client, w.location, dates].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  )
  const dialogs: ReactNode = (
    <>
      {p.owner && <DuplicateDialog source={{ id: w.id, title: w.title, firstDate: sortedDays(p.data.days)[0]?.date ?? '', days: p.data.days.length }} open={duplicating} onClose={() => setDuplicating(false)} />}
      <PrintPackageDialog data={p.data} open={printing} change={p.change} onClose={() => setPrinting(false)} />
      {share && (
        <Modal open={sharing} onClose={() => setSharing(false)}>
          <h2 className="mb-3 text-lg font-medium">{t('access.share', { title: w.title || t('workshops.untitled') })}</h2>
          <AccessPanel data={p.data} />
        </Modal>
      )}
    </>
  )

  if (p.phone)
    return (
      <>
      <header className="nav-surface no-print flex items-center gap-x-1 bg-brand px-3 py-2">
        <Link to="/" aria-label={t('common.back')} title={t('common.back')} className="tap -ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink">
          <ChevronLeft size={20} />
        </Link>
        {title}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={t('common.undo')} onClick={p.undo} disabled={!p.canUndo}>
            <Undo2 size={15} />
          </IconButton>
          <button type="button" aria-label={t('slides.present')} title={t('slides.present')} onClick={() => open('present')} className="tap mx-0.5 inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Play size={15} />
          </button>
          {workshopToolFor(w.id)}
          <Menu
            label={t('planner.actions')}
            title={w.title || t('workshops.untitled')}
            items={[
              ...(p.canRedo ? [{ label: t('common.redo'), icon: <Redo2 size={14} />, onSelect: p.redo }] : []),
              ...view.map((it, i) => ({ ...it, separated: i === 0 ? p.canRedo : it.separated })),
              ...present.map((it, i) => ({ ...it, hint: undefined, separated: i === 0 })),
              ...output.map((it, i) => ({ ...it, hint: undefined, separated: i === 0 || it.separated })),
              ...(share ? [{ label: t('access.shareButton'), icon: <Users size={14} />, separated: true, onSelect: () => setSharing(true) }] : []),
              ...workshop.map((it, i) => ({ ...it, separated: i === 0 || it.separated })),
            ]}
          />
          <IconButton label={t('toolbox.open')} onClick={p.onOpenSidebar}>
            <PanelRight size={15} />
          </IconButton>
        </div>
      </header>
      {/* Outside the header: inside it the text colours are the light ones of the brand ground. */}
      {dialogs}
      </>
    )

  return (
    <header className="no-print @container flex items-center gap-x-3 px-6 pb-2 pt-4 md:px-8">
      {title}
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton label={t('common.undo')} onClick={p.undo} disabled={!p.canUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label={t('common.redo')} onClick={p.redo} disabled={!p.canRedo}>
          <Redo2 size={15} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Menu label={t('planner.view')} items={view} trigger={<Eye size={15} />} />
        {share && (
          <button type="button" onClick={() => setSharing(true)} className={headerButton} title={t('access.shareButton')}>
            <Users size={14} />
            <span className="@max-2xl:hidden">{t('access.shareButton')}</span>
          </button>
        )}
        <Menu
          label={t('output.menu')}
          items={output}
          triggerClassName={headerButton}
          trigger={
            <>
              <Download size={14} />
              <span className={cx(!exporting && '@max-2xl:hidden')}>{exporting || t('output.menu')}</span>
              <ChevronDown size={13} />
            </>
          }
        />
        {workshopToolFor(w.id)}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => open('present')}
            className="tap inline-flex h-9 items-center gap-1.5 rounded-l-full bg-accent pl-4 pr-3 text-[14px] font-bold text-accent-ink transition-opacity hover:opacity-90"
          >
            <Play size={14} />
            {t('slides.present')}
          </button>
          <Menu
            label={t('output.presentMenu')}
            items={present}
            triggerClassName="tap inline-flex h-9 items-center rounded-r-full border-l border-accent-ink/25 bg-accent pl-1.5 pr-2.5 text-accent-ink transition-opacity hover:opacity-90"
            trigger={<ChevronDown size={14} />}
          />
        </div>
        <Menu label={t('workshop.menu')} title={w.title || t('workshops.untitled')} items={workshop} />
      </div>
      {dialogs}
    </header>
  )
}
