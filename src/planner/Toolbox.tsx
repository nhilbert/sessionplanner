import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Archive, BookMarked, ChevronDown, ChevronUp, FolderOpen, Info, Maximize2, Minimize2, Package, Paperclip, PanelRightClose, PanelRightOpen, Plus, Presentation, Redo2, Undo2, X } from 'lucide-react'
import type { Attachment, Item, ItemKind, LibraryEntry, WorkshopState } from '@/domain/types'
import { plainLine } from '@/domain/markdown'
import type { Op } from '@/domain/ops'
import { durationOf, formatDuration, formatTime } from '@/domain/time'
import { libraryText, matchesWords, useLibrary } from '@/store/useLibrary'
import { itemColor, useLibraryEdit, useSettings } from '@/store/useSettings'
import { cx, IconButton, isTyping, SearchField, useLocalState } from '@/components/ui'
import { useOverlay } from '@/components/overlay'
import { AddBar, Entries, List } from './DayColumn'
import Menu from '@/components/Menu'
import ItemPanel, { itemActions, kindFields, KINDS } from './ItemPanel'
import { MaterialPanel, WorkshopPanel } from './panels'
import { DeckPanel } from '@/slides/DeckPanel'
import { LIB, PARKING } from './board'

export type Tab = 'parking' | 'library' | 'material' | 'deck' | 'details'

const TABS = [
  // A tab is about 64 px wide at the sidebar's default width: the parking lot's tab says it short, its tooltip in full.
  { id: 'parking', icon: Archive, key: 'planner.parking', short: 'planner.parkingTab' },
  { id: 'library', icon: BookMarked, key: 'nav.library' },
  { id: 'material', icon: Package, key: 'planner.material' },
  { id: 'deck', icon: Presentation, key: 'slides.tab' },
  { id: 'details', icon: Info, key: 'planner.details' },
] as const satisfies readonly { id: Tab; icon: typeof Archive; key: string; short?: string }[]

/** A tab remembered from before the tabs were merged: the packing list and the files are the material now; sharing moved to the header. */
/** The tab the sidebar shows for a stored choice: a tab that is not offered (the library, for a guest without it) falls back to the parking lot. */
export const shownTab = (raw: string, owner: boolean, data: WorkshopState): Tab => {
  const wanted = tabOf(raw)
  return wanted !== 'library' || owner || !!data.access?.library ? wanted : 'parking'
}

const tabOf = (raw: string): Tab => (raw === 'packing' || raw === 'files' ? 'material' : (TABS.find((x) => x.id === raw)?.id ?? 'parking'))

interface Props {
  data: WorkshopState
  /** Guests (who may edit: view guests get the agenda only) see none of the owner's actions; the library tab only with the library switched on for them here. */
  owner: boolean
  onDayDate: (dayId: string, date: string) => void
  change: (ops: Op[]) => void
  tab: string
  onTab: (tab: Tab) => void
  open: boolean
  onOpen: (open: boolean) => void
  /** Phones: shown full screen over the agenda. */
  mobile: boolean
  onCloseMobile: () => void
  parkingIds: string[]
  itemId: string | null
  computedStart: number | null
  onCloseItem: () => void
  /** Phones: the details were opened by a tap on the agenda; they show alone, and closing them returns there. */
  itemFromAgenda?: boolean
  onSelect: (id: string) => void
  onAddParked: (kind: ItemKind | 'group') => void
  onLibraryInsert: (entry: LibraryEntry) => void
  onAttachment: (a: Attachment) => void
  onRemoveAttachment: (id: string) => void
  onNotice: (text: string) => void
  /** From a list of the sidebar to an entry of the agenda: its details open and the agenda shows it. */
  onJump: (itemId: string) => void
  /** The details are shown large, in place of the agenda (not on a phone, where they fill the screen anyway). */
  wide: boolean
  onWide: (wide: boolean) => void
  /** Where the open entry stands among the others, and the way to its neighbours (shown with the large details). */
  nav?: ItemNav
  /** What the workshop's header says and does, which the large details hide with the agenda: shown in their head instead. */
  status?: WorkshopStatus
  /** Shown above the large details: what the agenda would have said above itself (a save that failed). */
  notice?: ReactNode
}

export interface WorkshopStatus {
  /** Changes reach the server and arrive from it. */
  live: boolean
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

export interface ItemNav {
  /** Counted from 1. */
  index: number
  count: number
  onPrev?: () => void
  onNext?: () => void
}

/**
 * The right-hand sidebar, in two modes. Its tabs are the workshop's tools: parking lot, library, material (packing
 * list and files), the deck and the details. A step chosen on the agenda opens over them as an inspector, headed by
 * what it is and when, with its actions in a ⋯ menu and × to close; the tabs stay in reach, and choosing one closes it.
 * From there the details can be shown large: they take the agenda's place, without the tabs, until they are made
 * small again or closed.
 */
export default function Toolbox(p: Props) {
  const { t } = useTranslation()
  const [widthRaw, setWidthRaw] = useLocalState('sp.toolboxWidth', String(DEFAULT_WIDTH))
  const width = clampWidth(Number(widthRaw) || DEFAULT_WIDTH)
  const item = p.itemId ? p.data.items.find((i) => i.id === p.itemId) : undefined
  // Whether the details are large is the page's to say (it hides the agenda for them); without an entry there is nothing to enlarge.
  const wide = p.wide && !!item
  const counts: Partial<Record<Tab, number>> = { parking: p.parkingIds.length, material: p.data.attachments.length }
  const tabs = TABS.filter((x) => x.id !== 'library' || p.owner || !!p.data.access?.library)
  const tab = shownTab(p.tab, p.owner, p.data)
  // Full screen on a phone it is an overlay like a dialog: the focus goes into it, Tab stays inside (the agenda below
  // is covered), Escape closes it, and the focus returns to what opened it.
  const panel = useRef<HTMLElement>(null)
  useOverlay(
    p.mobile,
    // Escape in a field leaves the field first, as on the wide screen, where the page ignores keys typed into fields.
    () => (isTyping(document.activeElement) ? (document.activeElement as HTMLElement).blur() : p.onCloseMobile()),
    { root: panel, page: true },
  )

  if (!p.open && !p.mobile)
    return (
      <aside className="no-print hidden w-11 shrink-0 flex-col items-center gap-1 border-l border-line py-3 md:flex">
        <IconButton label={t('toolbox.open')} onClick={() => p.onOpen(true)}>
          <PanelRightOpen size={16} />
        </IconButton>
        {tabs.map(({ id, icon: Icon, key }) => (
          <IconButton
            key={id}
            label={t(key)}
            onClick={() => {
              p.onTab(id)
              p.onOpen(true)
            }}
          >
            <Icon size={15} />
          </IconButton>
        ))}
      </aside>
    )

  const body: ReactNode = item ? (
    <ItemPanel key={item.id} item={item} computedStart={p.computedStart} data={p.data} change={p.change} onAttachment={p.onAttachment} onNotice={p.onNotice} owner={p.owner} wide={wide} />
  ) : tab === 'parking' ? (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-ink-3">{t('planner.parkingHint')}</p>
      <List id={PARKING} ids={p.parkingIds} empty={t('planner.parkingEmpty')}>
        <Entries list={PARKING} ids={p.parkingIds} />
      </List>
      <AddBar onAdd={p.onAddParked} />
    </div>
  ) : tab === 'library' ? (
    <LibraryTab onInsert={p.onLibraryInsert} owner={p.owner} />
  ) : tab === 'material' ? (
    <MaterialPanel data={p.data} change={p.change} onAttachment={p.onAttachment} onRemove={p.onRemoveAttachment} owner={p.owner} onJump={p.onJump} />
  ) : tab === 'deck' ? (
    <DeckPanel data={p.data} change={p.change} onNotice={p.onNotice} />
  ) : (
    <WorkshopPanel data={p.data} change={p.change} owner={p.owner} onDayDate={p.onDayDate} />
  )
  // On a phone, details opened from the agenda are a sheet of their own: no tabs above them. Nor above the large details.
  const showTabs = !(item && (wide || (p.mobile && p.itemFromAgenda)))

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      style={p.mobile || wide ? undefined : { width }}
      className={cx('no-print flex flex-col bg-surface outline-none', p.mobile ? 'fixed inset-0 z-40 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]' : cx('relative hidden border-l border-line md:flex', wide ? 'min-w-0 flex-1' : 'shrink-0'))}
    >
      {!p.mobile && !wide && <ResizeEdge width={width} onWidth={(w) => setWidthRaw(String(w))} label={t('toolbox.resize')} />}
      {showTabs && (
        <div className="flex items-stretch gap-0.5 border-b border-line px-1.5 py-1.5">
          <div role="tablist" aria-label={t('toolbox.tabs')} className="flex min-w-0 flex-1 gap-0.5">
            {tabs.map((x) => {
              const { id, icon: Icon, key } = x
              const active = !item && tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={t(key)}
                  title={t(key)}
                  onClick={() => p.onTab(id)}
                  className={cx(
                    'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[11px] leading-tight transition-colors pointer-coarse:py-1.5',
                    active ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon size={15} />
                  <span className="max-w-full truncate">{t('short' in x ? x.short : key)}</span>
                  {!!counts[id] && <span className="absolute right-1 top-0.5 text-[10px] text-ink-3 tnum">{counts[id]}</span>}
                </button>
              )
            })}
          </div>
          {p.mobile ? (
            <IconButton label={t('common.close')} onClick={p.onCloseMobile} className="self-center">
              <X size={16} />
            </IconButton>
          ) : (
            <IconButton label={t('toolbox.close')} onClick={() => p.onOpen(false)} className="self-center">
              <PanelRightClose size={16} />
            </IconButton>
          )}
        </div>
      )}
      {item && <InspectorHeader item={item} start={p.computedStart} data={p.data} change={p.change} owner={p.owner} onSelect={p.onSelect} onClose={p.onCloseItem} onNotice={p.onNotice} wide={wide} onWide={p.mobile ? undefined : p.onWide} nav={p.nav} status={p.status} />}
      {wide && p.notice}
      {/* Large, the details scroll in their own columns. */}
      {wide ? <div className="@container flex min-h-0 flex-1">{body}</div> : <div className="flex-1 overflow-y-auto overscroll-contain p-4">{body}</div>}
    </aside>
  )
}

/**
 * The head of a step's details: what it is (a menu, since the kind is rarely changed) and when, the way to the large
 * details and back, its actions, and × back to where the sidebar was. Large, it also leads to the entries before and after.
 */
function InspectorHeader({ item, start, data, change, owner, onSelect, onClose, onNotice, wide, onWide, nav, status }: { item: Item; start: number | null; data: WorkshopState; change: (ops: Op[]) => void; owner: boolean; onSelect: (id: string) => void; onClose: () => void; onNotice: (text: string) => void; wide: boolean; /** Left out where the details cannot be shown large (a phone). */ onWide?: (wide: boolean) => void; nav?: ItemNav; status?: WorkshopStatus }) {
  const { t } = useTranslation()
  const save = useLibrary((s) => s.save)
  const mayChangeLibrary = useLibraryEdit()
  const length = durationOf(item)
  const when = item.dayId === null ? t('planner.parking') : start === null ? '' : length > 0 ? `${formatTime(start)}–${formatTime(start + length)}` : formatTime(start)
  const actions = itemActions({ item, data, change, t, mayChangeLibrary: owner && mayChangeLibrary, onSelect, onClose, onSaved: (title) => onNotice(t('library.saved', { title })), save })
  const place = wide && nav ? t('item.position', { n: nav.index, count: nav.count }) : ''
  return (
    <div className="flex items-center gap-1 border-b border-line bg-surface-2/50 py-1.5 pl-2 pr-1.5">
      {wide && nav && (
        <>
          <IconButton label={t('item.prev')} disabled={!nav.onPrev} onClick={nav.onPrev} className="border border-line-2 bg-surface text-brand-ink">
            <ChevronUp size={15} />
          </IconButton>
          <IconButton label={t('item.next')} disabled={!nav.onNext} onClick={nav.onNext} className="mr-1 border border-line-2 bg-surface text-brand-ink">
            <ChevronDown size={15} />
          </IconButton>
        </>
      )}
      <Menu
        align="left"
        label={`${t('item.kind')}: ${t(`kinds.${item.kind}`)}`}
        title={t('item.kind')}
        triggerClassName="tap inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-surface-2 pointer-coarse:h-9"
        trigger={
          <>
            {t(`kinds.${item.kind}`)}
            <ChevronDown size={13} className="text-ink-3" />
          </>
        }
        items={KINDS.map((kind) => ({ label: t(`kinds.${kind}`), checked: kind === item.kind, onSelect: () => kind !== item.kind && change([{ op: 'set', entity: 'item', id: item.id, fields: kindFields(item, kind) }]) }))}
      />
      <div className="min-w-0 flex-1 truncate text-[13px] text-ink-2 tnum">{[when, place].filter(Boolean).join(' · ')}</div>
      {/* Large, the workshop's header is out of sight: what it says and undoes stands here. */}
      {wide && status && !status.live && <span className="shrink-0 text-[12px] text-amber">{t('planner.offline')}</span>}
      {wide && status && (
        <>
          <IconButton label={t('common.undo')} onClick={status.undo} disabled={!status.canUndo}>
            <Undo2 size={15} />
          </IconButton>
          <IconButton label={t('common.redo')} onClick={status.redo} disabled={!status.canRedo}>
            <Redo2 size={15} />
          </IconButton>
        </>
      )}
      {onWide && (
        // One button for both ways, so that it keeps the focus when the details change their size under it.
        <button
          type="button"
          aria-label={wide ? t('item.shrink') : t('item.enlarge')}
          title={wide ? t('item.shrink') : t('item.enlarge')}
          onClick={() => onWide(!wide)}
          className={cx('tap inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors hover:bg-surface-2 hover:text-ink pointer-coarse:h-9', wide ? 'px-3 text-ink-2' : 'w-7 text-ink-3 pointer-coarse:w-9')}
        >
          {wide ? <Minimize2 size={13} /> : <Maximize2 size={14} />}
          {wide && t('item.shrink')}
        </button>
      )}
      <Menu label={t('item.menu')} title={item.title || t(`kinds.${item.kind}`)} items={actions} />
      <IconButton label={t('item.close')} onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  )
}

const DEFAULT_WIDTH = 360
const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, 280), Math.max(320, window.innerWidth * 0.6)))

/** The left edge of the sidebar: drag to make it wider or narrower (remembered on this device); double-click resets. */
function ResizeEdge({ width, onWidth, label }: { width: number; onWidth: (w: number) => void; label: string }) {
  const start = useRef<{ x: number; w: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: width }
      }}
      onPointerMove={(e) => start.current && onWidth(clampWidth(start.current.w + (start.current.x - e.clientX)))}
      onPointerUp={() => void (start.current = null)}
      onPointerCancel={() => void (start.current = null)}
      onDoubleClick={() => onWidth(DEFAULT_WIDTH)}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-accent/30 active:bg-accent/40"
    />
  )
}

function LibraryTab({ onInsert, owner: isOwner }: { onInsert: (entry: LibraryEntry) => void; owner: boolean }) {
  const { t } = useTranslation()
  const mayChange = useLibraryEdit()
  const owner = isOwner && mayChange
  const { entries, loaded, load } = useLibrary()
  const categories = useSettings((s) => s.settings.categories)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  const shown = entries.filter((e) => matchesWords(libraryText(e, categories, t), query))
  return (
    <div>
      <SearchField value={query} onChange={setQuery} placeholder={t('library.search')} className="mb-3" />
      {loaded && !entries.length && <p className="text-[13px] leading-snug text-ink-2">{t(owner ? 'library.emptyHint' : 'library.emptyGuest')}</p>}
      <ul className="space-y-1">
        {shown.map((e) => (
          <LibraryRow key={e.id} entry={e} onInsert={() => onInsert(e)} />
        ))}
      </ul>
      {entries.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-3">
          {t('library.dragHint')}{' '}
          <Link to="/library" className="hover:text-ink hover:underline">
            {t(owner ? 'library.manage' : 'library.browse')}
          </Link>
        </p>
      )}
    </div>
  )
}

function LibraryRow({ entry, onInsert }: { entry: LibraryEntry; onInsert: () => void }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: LIB + entry.id })
  const items = entry.kind === 'group' ? entry.data.items : [entry.data]
  const color = entry.kind === 'item' ? itemColor(entry.data, categories) : null
  const minutes = items.reduce((s, i) => s + durationOf(i), 0)
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cx('flex cursor-grab touch-manipulation items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] hover:bg-surface-2 active:cursor-grabbing', isDragging && 'opacity-40')}
    >
      {entry.kind === 'group' ? <FolderOpen size={13} className="shrink-0 self-start mt-0.5 text-ink-3" /> : <span className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entry.title}</span>
        {/* one line of what it is: the description, or a group's items */}
        {(entry.kind === 'group' ? entry.data.items.length > 0 : !!entry.data.description) && (
          <span className="block truncate text-[12px] text-ink-3">{entry.kind === 'group' ? entry.data.items.map((i) => i.title || t(`kinds.${i.kind}`)).join(' · ') : entry.data.kind === 'note' ? plainLine(entry.data.description) : entry.data.description}</span>
        )}
      </span>
      {entry.attachments.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-ink-3 tnum" title={t('files.count', { count: entry.attachments.length })}>
          <Paperclip size={11} aria-hidden />
          {entry.attachments.length}
        </span>
      )}
      <span className="shrink-0 text-[11px] text-ink-3 tnum">
        {entry.kind === 'group' && `${t('library.items', { count: items.length })} · `}
        {formatDuration(minutes)}
      </span>
      <IconButton label={t('library.toParking')} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={onInsert}>
        <Plus size={14} />
      </IconButton>
    </li>
  )
}
