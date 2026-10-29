import { type ReactNode, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Paperclip, Trash2, Upload, X } from 'lucide-react'
import type { Attachment, PackingState, WorkshopState } from '@/domain/types'
import type { Op, WorkshopFields } from '@/domain/ops'
import { agendaOrder } from '@/domain/order'
import { packingList } from '@/domain/packing'
import { api } from '@/api'
import { Button, Checkbox, cx, Field, IconButton } from '@/components/ui'
import { TextField, formatSize } from './fields'
import { uploadFiles } from './upload'

/** Side panel next to the board (not modal: the board stays usable for dragging). */
export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <aside className="fade-in fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-line bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[var(--shadow)] md:w-[440px] md:p-6">
      {children}
    </aside>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-medium">{title}</h2>
      <IconButton label={t('common.close')} onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  )
}

export function WorkshopPanel({ data, change, onClose }: { data: WorkshopState; change: (ops: Op[]) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const w = data.workshop
  const set = (fields: Partial<WorkshopFields>) => change([{ op: 'set', entity: 'workshop', id: w.id, fields }])
  return (
    <div className="space-y-4">
      <PanelHeader title={t('workshop.details')} onClose={onClose} />
      <Field label={t('workshop.title')}>
        <TextField value={w.title} onCommit={(title) => set({ title })} />
      </Field>
      <Field label={t('workshop.client')}>
        <TextField value={w.client} onCommit={(client) => set({ client })} />
      </Field>
      <Field label={t('workshop.location')}>
        <TextField value={w.location} onCommit={(location) => set({ location })} />
      </Field>
      <Field label={t('workshop.goal')}>
        <TextField multiline value={w.goal} onCommit={(goal) => set({ goal })} className="min-h-[64px]" />
      </Field>
      <Field label={t('workshop.notes')}>
        <TextField multiline value={w.notes} onCommit={(notes) => set({ notes })} className="min-h-[160px]" />
      </Field>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" onClick={() => set({ archived: !w.archived })}>
          {w.archived ? t('workshop.unarchive') : t('workshop.archive')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            if (!window.confirm(t('workshop.deleteConfirm', { title: w.title || t('workshops.untitled') }))) return
            await api.deleteWorkshop(w.id)
            navigate('/')
          }}
        >
          <Trash2 size={13} />
          {t('workshop.delete')}
        </Button>
      </div>
    </div>
  )
}

export function PackingPanel({ data, change, onClose }: { data: WorkshopState; change: (ops: Op[]) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const lines = packingList(agendaOrder(data.days, data.items), data.workshop.packing)
  const update = (key: string, patch: PackingState) => {
    const packing = { ...data.workshop.packing, [key]: { ...data.workshop.packing[key], ...patch } }
    change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { packing } }])
  }
  return (
    <div>
      <PanelHeader title={t('planner.packing')} onClose={onClose} />
      {!lines.length && <p className="text-[14px] text-ink-2">{t('packing.empty')}</p>}
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 py-2">
            <Checkbox checked={!!l.state.checked} label={l.label} onChange={(checked) => update(l.key, { checked })} />
            <div className={cx('min-w-0 flex-1', l.state.checked && 'text-ink-3 line-through')}>
              <div className="truncate text-[14px]">{l.label}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                <span>{t('packing.usedIn', { count: l.itemIds.length })}</span>
                {l.state.qty !== undefined && l.state.qty !== l.suggested && <span>· {t('packing.suggested', { n: l.suggested })}</span>}
                {l.links.map((href) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-ink">
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-1 text-[12px] text-ink-2">
              <input type="checkbox" checked={!!l.state.venue} onChange={(e) => update(l.key, { venue: e.target.checked })} />
              {t('packing.venue')}
            </label>
            <input
              type="number"
              min={0}
              value={l.qty}
              aria-label={t('item.qty')}
              onChange={(e) => {
                const qty = Math.round(Number(e.target.value))
                if (qty >= 0) update(l.key, { qty })
              }}
              className="field tnum h-8 w-16 shrink-0 px-1.5 text-center text-[13px]"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FilesPanel({ data, onAttachment, onRemove, onClose }: { data: WorkshopState; onAttachment: (a: Attachment) => void; onRemove: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const uses = (id: string) => data.items.filter((i) => i.attachmentIds.includes(id)).length
  return (
    <div>
      <PanelHeader title={t('planner.files')} onClose={onClose} />
      <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={13} />
        {busy ? t('common.uploading') : t('common.upload')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          setBusy(true)
          ;(await uploadFiles(data.workshop.id, files, t)).forEach(onAttachment)
          setBusy(false)
        }}
      />
      {!data.attachments.length && <p className="mt-4 text-[14px] text-ink-2">{t('files.empty')}</p>}
      <ul className="mt-4 divide-y divide-line">
        {data.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2">
            <Paperclip size={14} className="shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <a href={api.downloadUrl(a.id)} download className="block truncate text-[14px] hover:underline">
                {a.name}
              </a>
              <div className="text-[12px] text-ink-3">
                {formatSize(a.size)} · {t('files.linked', { count: uses(a.id) })}
              </div>
            </div>
            <IconButton
              label={t('common.delete')}
              onClick={async () => {
                if (!window.confirm(t('files.deleteConfirm', { name: a.name }))) return
                await api.deleteAttachment(a.id)
                onRemove(a.id)
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
