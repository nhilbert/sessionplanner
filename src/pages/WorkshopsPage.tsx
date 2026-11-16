import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Archive, ArchiveRestore, CalendarDays, Clock, MapPin, Plus, Trash2 } from 'lucide-react'
import { api, reportFailure } from '@/api'
import { TRASH_DAYS, type TrashedWorkshop, type WorkshopSummary } from '@/domain/types'
import { formatDuration } from '@/domain/time'
import { formatDate } from '@/i18n'
import { Button, Chip, cx, Empty, Field, Input, Modal, PageHeader, SearchField } from '@/components/ui'
import { BulkBar, NoticeBar, SelectAll, SelectBox, SortControl, type SortOption, TrashSection, useNotice, useSelection, useSort } from '@/components/collection'
import { newId } from '@/domain/ops'
import { useSettings } from '@/store/useSettings'

export default function WorkshopsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [list, setList] = useState<WorkshopSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const me = useSettings((s) => s.me)

  useEffect(() => {
    api.listWorkshops().then(setList, () => setFailed(true))
  }, [])
  // The trash is the owner's: deleted workshops wait there TRASH_DAYS days before they go for good.
  const [trash, setTrash] = useState<TrashedWorkshop[]>([])
  const { notice, show, close } = useNotice()
  /** The lists as the server has them now, after a change here (or one that failed half-way). */
  const reload = async () => {
    setList(await api.listWorkshops())
    if (me.owner) setTrash(await api.listTrash())
  }
  useEffect(() => {
    if (me.owner) api.listTrash().then(setTrash, () => undefined)
  }, [me.owner])
  /** One call per workshop, then the lists again, whatever happened. */
  const each = async (ids: string[], run: (id: string) => Promise<unknown>) => {
    try {
      for (const id of ids) await run(id)
    } catch (err) {
      reportFailure(err)
    } finally {
      await reload().catch(() => undefined)
    }
  }
  const restore = (ids: string[]) => each(ids, api.restoreWorkshop)
  const purge = (ids: string[]) => each(ids, api.purgeWorkshop)

  // A search looks through archived workshops too (they carry their chip); every word typed has to match somewhere.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (w: WorkshopSummary) => words.every((q) => [w.title, w.client, w.location].some((f) => f.toLowerCase().includes(q)))
  const options: SortOption<WorkshopSummary>[] = [
    { key: 'date', label: t('list.date'), value: (w) => w.firstDate, first: 'desc' },
    { key: 'title', label: t('list.title'), value: (w) => w.title },
    { key: 'client', label: t('workshops.client'), value: (w) => w.client || null },
    { key: 'created', label: t('list.created'), value: (w) => w.createdAt, first: 'desc' },
    { key: 'updated', label: t('list.updated'), value: (w) => w.updatedAt, first: 'desc' },
  ]
  const { sort, setSort, sorted } = useSort('sp.workshops.sort', options, { key: 'date', dir: 'desc' })
  const visible = sorted((list ?? []).filter((w) => (words.length ? matches(w) : showArchived || !w.archived)))
  const selection = useSelection(visible.map((w) => w.id))
  const picked = visible.filter((w) => selection.has(w.id))
  // Archiving is a field of the workshop, changed like any other; open windows of it follow.
  const archive = async (archived: boolean) => {
    const ids = picked.filter((w) => w.archived !== archived).map((w) => w.id)
    const set = (to: boolean) => each(ids, (id) => api.sendOps(id, newId(), [{ op: 'set', entity: 'workshop', id, fields: { archived: to } }]))
    selection.clear()
    await set(archived)
    show({ text: t(archived ? 'workshops.archivedCount' : 'workshops.unarchivedCount', { count: ids.length }), undo: () => void set(!archived) })
  }
  // Deleting ends the sharing, and a restore does not bring it back: so this asks first, trash or not.
  const toTrash = async () => {
    const ids = selection.ids
    if (!window.confirm(t('workshops.deleteManyConfirm', { count: ids.length, days: TRASH_DAYS }))) return
    selection.clear()
    await each(ids, api.deleteWorkshop)
    show({ text: t('workshops.trashedCount', { count: ids.length }), undo: () => void restore(ids) })
  }
  const hasArchived = (list ?? []).some((w) => w.archived)

  return (
    <div className="h-full overflow-y-auto">
    <div className={cx('mx-auto max-w-3xl px-4 py-8 md:px-10 md:py-10', selection.ids.length > 0 && 'pb-28')}>
      <PageHeader
        title={t('workshops.title')}
        subtitle={me.owner ? undefined : t('guest.shared')}
        right={
          me.owner && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              {t('workshops.new')}
            </Button>
          )
        }
      />
      {(list?.length ?? 0) > 0 && (
        <div className="mb-4 space-y-3">
          <SearchField value={query} onChange={setQuery} placeholder={t('workshops.search')} shortcut />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {me.owner && <SelectAll selection={selection} count={visible.length} />}
            <span className="ml-auto" />
            <SortControl options={options} sort={sort} onChange={setSort} />
          </div>
        </div>
      )}
      {failed && <p className="text-rose">{t('common.error')}</p>}
      {words.length > 0 && !visible.length && <p className="py-10 text-center text-[14px] text-ink-2">{t('workshops.noMatch', { q: query.trim() })}</p>}
      {list && !list.length && !failed && (
        me.owner ? (
          <Empty title={t('workshops.empty')} body={t('workshops.emptyBody')}>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              {t('workshops.new')}
            </Button>
          </Empty>
        ) : (
          <Empty title={t('guest.nothingShared')} body={t('guest.nothingSharedBody', { email: me.email ?? '' })} />
        )
      )}
      <ul className="space-y-2">
        {visible.map((w) => (
          <li key={w.id} className={cx('card flex items-start overflow-hidden', selection.has(w.id) && 'ring-1 ring-accent')}>
            {me.owner && <SelectBox state={selection.has(w.id)} onToggle={(range) => selection.toggle(w.id, range)} label={t('list.select', { title: w.title || t('workshops.untitled') })} className="ml-1.5 mt-2" />}
            <Link to={`/w/${w.id}`} className={cx('flex min-w-0 flex-1 items-start gap-3 py-3 pr-4 transition-colors hover:bg-surface-2', me.owner ? 'pl-1' : 'pl-4')}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w.title || t('workshops.untitled')}</div>
                {w.client && <div className="truncate text-[14px] text-ink-2">{w.client}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-3">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={13} className="shrink-0" />
                    {w.firstDate ? dateRange(w.firstDate, w.lastDate) : t('workshops.noDate')}
                  </span>
                  <span className="inline-flex items-center gap-1 tnum" title={t('workshops.length')}>
                    <Clock size={13} className="shrink-0" />
                    {lengthOf(w, t)}
                  </span>
                  {w.location && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">{w.location}</span>
                    </span>
                  )}
                </div>
              </div>
              {w.archived && <Chip className="mt-0.5">{t('workshops.archived')}</Chip>}
            </Link>
          </li>
        ))}
      </ul>
      {hasArchived && !words.length && (
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? t('workshops.hideArchived') : t('workshops.showArchived')}
          </Button>
        </div>
      )}
      {me.owner && (
        <TrashSection
          rows={words.length ? [] : trash}
          hint={t('workshops.trashHint', { days: TRASH_DAYS })}
          meta={(w) => (
            <>
              {w.client && <span>{w.client}</span>}
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={13} className="shrink-0" />
                {w.firstDate ? dateRange(w.firstDate, w.lastDate) : t('workshops.noDate')}
              </span>
            </>
          )}
          onRestore={(w) => void restore([w.id])}
          onPurge={(rows) => void purge(rows.map((w) => w.id))}
          purgeConfirm={(rows) => (rows.length === 1 ? t('workshops.purgeConfirm', { title: rows[0].title || t('workshops.untitled') }) : t('workshops.purgeAllConfirm', { count: rows.length }))}
        />
      )}
      <BulkBar count={selection.ids.length} onClear={selection.clear}>
        {picked.some((w) => !w.archived) && (
          <Button size="sm" onClick={() => void archive(true)}>
            <Archive size={13} />
            {t('workshop.archive')}
          </Button>
        )}
        {picked.some((w) => w.archived) && (
          <Button size="sm" onClick={() => void archive(false)}>
            <ArchiveRestore size={13} />
            {t('workshop.unarchive')}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => void toTrash()}>
          <Trash2 size={13} />
          {t('common.delete')}
        </Button>
      </BulkBar>
      <NoticeBar notice={notice} onClose={close} raised={selection.ids.length > 0} />
      <NewWorkshop open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/w/${id}`)} />
    </div>
    </div>
  )
}

/** "6 h 30 min" for one day, "2 days · 11 h 35 min" for several; nothing placed yet says so. */
function lengthOf(w: WorkshopSummary, t: TFunction): string {
  if (!w.minutes) return t('workshops.notPlanned')
  return w.days > 1 ? `${t('workshops.days', { count: w.days })} · ${formatDuration(w.minutes)}` : formatDuration(w.minutes)
}

function dateRange(first: string, last: string | null): string {
  return !last || last === first ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`
}

function NewWorkshop({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv'))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const ws = await api.createWorkshop({ title: title.trim(), client: client.trim(), date: date || undefined })
      onCreated(ws.workshop.id)
    } catch (err) {
      reportFailure(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="text-lg font-medium">{t('workshops.new')}</h2>
        <Field label={t('workshops.titleLabel')}>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('workshops.client')}>
          <Input value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label={t('workshops.firstDay')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
