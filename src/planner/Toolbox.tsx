import { type ReactNode, useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Archive, ArrowLeft, BookMarked, FolderOpen, Info, Package, Paperclip, PanelRightClose, PanelRightOpen, Plus, Search, Users, X } from 'lucide-react'
import type { Attachment, ItemKind, LibraryEntry, WorkshopState } from '@/domain/types'
import type { Op } from '@/domain/ops'
import { durationOf, formatDuration } from '@/domain/time'
import { useLibrary } from '@/store/useLibrary'
import { itemColor, useSettings } from '@/store/useSettings'
import { cx, IconButton } from '@/components/ui'
import { AddBar, Entries, List } from './DayColumn'
import ItemPanel from './ItemPanel'
import { AccessPanel, FilesPanel, PackingPanel, WorkshopPanel } from './panels'
import { LIB, PARKING } from './board'

export type Tab = 'parking' | 'library' | 'packing' | 'files' | 'details' | 'access'

const TABS = [
  { id: 'parking', icon: Archive, key: 'planner.parking' },
  { id: 'library', icon: BookMarked, key: 'nav.library' },
  { id: 'packing', icon: Package, key: 'planner.packing' },
  { id: 'files', icon: Paperclip, key: 'planner.files' },
  { id: 'details', icon: Info, key: 'planner.details' },
  { id: 'access', icon: Users, key: 'access.title' },
] as const satisfies readonly { id: Tab; icon: typeof Archive; key: string }[]

interface Props {
  data: WorkshopState
  /** Guests see neither the library nor the access tab, and none of the owner's actions. */
  owner: boolean
  change: (ops: Op[]) => void
  tab: Tab
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
  onSelect: (id: string) => void
  onAddParked: (kind: ItemKind | 'group') => void
  onLibraryInsert: (entry: LibraryEntry) => void
  onAttachment: (a: Attachment) => void
  onRemoveAttachment: (id: string) => void
  onNotice: (text: string) => void
}

/** The right-hand sidebar: parking lot, library, packing list, files and details; item details open here too. */
export default function Toolbox(p: Props) {
  const { t } = useTranslation()
  const item = p.itemId ? p.data.items.find((i) => i.id === p.itemId) : undefined
  const counts: Partial<Record<Tab, number>> = { parking: p.parkingIds.length, files: p.data.attachments.length }
  const tabs = TABS.filter((x) => p.owner || (x.id !== 'library' && x.id !== 'access'))
  const tab: Tab = tabs.some((x) => x.id === p.tab) ? p.tab : 'parking'

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
    <ItemPanel
      key={item.id}
      item={item}
      computedStart={p.computedStart}
      data={p.data}
      change={p.change}
      onAttachment={p.onAttachment}
      onClose={p.onCloseItem}
      onSelect={p.onSelect}
      onSaved={(title) => p.onNotice(t('library.saved', { title }))}
      owner={p.owner}
    />
  ) : tab === 'parking' ? (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-ink-3">{t('planner.parkingHint')}</p>
      <List id={PARKING} ids={p.parkingIds} empty={t('planner.parkingEmpty')}>
        <Entries list={PARKING} ids={p.parkingIds} />
      </List>
      <AddBar onAdd={p.onAddParked} />
    </div>
  ) : tab === 'library' ? (
    <LibraryTab onInsert={p.onLibraryInsert} />
  ) : tab === 'packing' ? (
    <PackingPanel data={p.data} change={p.change} />
  ) : tab === 'files' ? (
    <FilesPanel data={p.data} onAttachment={p.onAttachment} onRemove={p.onRemoveAttachment} owner={p.owner} />
  ) : tab === 'access' ? (
    <AccessPanel data={p.data} />
  ) : (
    <WorkshopPanel data={p.data} change={p.change} owner={p.owner} />
  )

  return (
    <aside
      className={cx(
        'no-print flex flex-col bg-surface',
        p.mobile ? 'fixed inset-0 z-40 pb-[env(safe-area-inset-bottom)]' : 'hidden w-[340px] shrink-0 border-l border-line md:flex lg:w-[360px]',
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1.5">
        {item ? (
          <button type="button" onClick={p.onCloseItem} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            <ArrowLeft size={15} />
            {t(TABS.find((x) => x.id === tab)!.key)}
          </button>
        ) : (
          tabs.map(({ id, icon: Icon, key }) => (
            <button
              key={id}
              type="button"
              title={t(key)}
              onClick={() => p.onTab(id)}
              className={cx(
                'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] transition-colors',
                tab === id ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon size={15} />
              {tab === id && <span className="max-w-[110px] truncate">{t(key)}</span>}
              {!!counts[id] && tab !== id && <span className="text-[11px] tnum">{counts[id]}</span>}
            </button>
          ))
        )}
        <span className="flex-1" />
        {p.mobile ? (
          <IconButton label={t('common.close')} onClick={p.onCloseMobile}>
            <X size={16} />
          </IconButton>
        ) : (
          <IconButton label={t('toolbox.close')} onClick={() => p.onOpen(false)}>
            <PanelRightClose size={16} />
          </IconButton>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  )
}

function LibraryTab({ onInsert }: { onInsert: (entry: LibraryEntry) => void }) {
  const { t } = useTranslation()
  const { entries, loaded, load } = useLibrary()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  const q = query.trim().toLowerCase()
  const shown = entries.filter((e) => !q || e.title.toLowerCase().includes(q) || (e.kind === 'group' ? e.data.items.some((i) => i.title.toLowerCase().includes(q)) : e.data.description.toLowerCase().includes(q)))
  return (
    <div>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.search')} className="field h-8 pl-8 text-[13px]" />
      </div>
      {loaded && !entries.length && <p className="text-[13px] leading-snug text-ink-2">{t('library.emptyHint')}</p>}
      <ul className="space-y-1">
        {shown.map((e) => (
          <LibraryRow key={e.id} entry={e} onInsert={() => onInsert(e)} />
        ))}
      </ul>
      {entries.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-3">
          {t('library.dragHint')}{' '}
          <Link to="/library" className="hover:text-ink hover:underline">
            {t('library.manage')}
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
      {entry.kind === 'group' ? <FolderOpen size={13} className="shrink-0 text-ink-3" /> : <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: color ? `var(--c-${color})` : 'var(--line-2)' }} />}
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
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
