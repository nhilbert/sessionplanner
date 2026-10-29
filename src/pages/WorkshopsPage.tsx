import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus } from 'lucide-react'
import { api } from '@/api'
import type { WorkshopSummary } from '@/domain/types'
import { formatDate } from '@/i18n'
import { Button, Chip, Empty, Field, Input, Modal, PageHeader } from '@/components/ui'
import { useSettings } from '@/store/useSettings'

export default function WorkshopsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [list, setList] = useState<WorkshopSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const me = useSettings((s) => s.me)

  useEffect(() => {
    api.listWorkshops().then(setList, () => setFailed(true))
  }, [])

  const visible = (list ?? []).filter((w) => showArchived || !w.archived)
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
      {failed && <p className="text-rose">{t('common.error')}</p>}
      {list && !visible.length && !failed && (
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
            <Link to={`/w/${w.id}`} className="card flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2">
              <CalendarDays size={18} className="shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w.title || t('workshops.untitled')}</div>
                <div className="truncate text-[13px] text-ink-2">
                  {[w.client, w.firstDate ? dateRange(w.firstDate, w.lastDate) : t('workshops.noDate'), t('workshops.items', { count: w.itemCount })].filter(Boolean).join(' · ')}
                </div>
              </div>
              {w.archived && <Chip>{t('workshops.archived')}</Chip>}
            </Link>
          </li>
        ))}
      </ul>
      {hasArchived && (
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
