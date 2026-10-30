import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CalendarDays, Clock, MapPin, Plus } from 'lucide-react'
import { api } from '@/api'
import type { WorkshopSummary } from '@/domain/types'
import { formatDuration } from '@/domain/time'
import { formatDate } from '@/i18n'
import { Button, Chip, Empty, Field, Input, Modal, PageHeader, SearchField } from '@/components/ui'
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

  // A search looks through archived workshops too (they carry their chip); every word typed has to match somewhere.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (w: WorkshopSummary) => words.every((q) => [w.title, w.client, w.location].some((f) => f.toLowerCase().includes(q)))
  const visible = (list ?? []).filter((w) => (words.length ? matches(w) : showArchived || !w.archived))
  const hasArchived = (list ?? []).some((w) => w.archived)

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-10 md:py-10">
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
      {(list?.length ?? 0) > 0 && <SearchField value={query} onChange={setQuery} placeholder={t('workshops.search')} shortcut className="mb-4" />}
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
          <li key={w.id}>
            <Link to={`/w/${w.id}`} className="card flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
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
