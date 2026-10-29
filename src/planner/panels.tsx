import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react'
import type { Attachment, PackingState, WorkshopState } from '@/domain/types'
import { newId, type Op, type WorkshopFields } from '@/domain/ops'
import { agendaOrder } from '@/domain/order'
import { packingList } from '@/domain/packing'
import { api } from '@/api'
import { Button, Checkbox, cx, Field, IconButton } from '@/components/ui'
import { TextField, formatSize } from './fields'
import { uploadFiles } from './upload'

export function WorkshopPanel({ data, change }: { data: WorkshopState; change: (ops: Op[]) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const w = data.workshop
  const set = (fields: Partial<WorkshopFields>) => change([{ op: 'set', entity: 'workshop', id: w.id, fields }])
  return (
    <div className="space-y-4">
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

export function PackingPanel({ data, change }: { data: WorkshopState; change: (ops: Op[]) => void }) {
  const { t } = useTranslation()
  const placed = agendaOrder(data.days, data)
  const lines = packingList(placed, data.workshop.packing, data.workshop.materials)
  const w = data.workshop
  const update = (key: string, patch: PackingState) => {
    const packing = { ...w.packing, [key]: { ...w.packing[key], ...patch } }
    change([{ op: 'set', entity: 'workshop', id: w.id, fields: { packing } }])
  }
  const removeWorkshopMaterial = (ids: string[]) => change([{ op: 'set', entity: 'workshop', id: w.id, fields: { materials: w.materials.filter((m) => !ids.includes(m.id)) } }])

  return (
    <div>
      <AddMaterial data={data} change={change} />
      {!lines.length && <p className="mt-4 text-[14px] text-ink-2">{t('packing.empty')}</p>}
      <ul className="mt-3 divide-y divide-line">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2.5 py-2">
            <Checkbox checked={!!l.state.checked} label={l.label} onChange={(checked) => update(l.key, { checked })} />
            <div className={cx('min-w-0 flex-1', l.state.checked && 'text-ink-3 line-through')}>
              <div className="truncate text-[14px]">{l.label}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                {l.itemIds.length > 0 && <span>{t('packing.usedIn', { count: l.itemIds.length })}</span>}
                {l.workshopMaterialIds.length > 0 && <span>{t('packing.general')}</span>}
                {l.state.qty !== undefined && l.state.qty !== l.suggested && <span>· {t('packing.suggested', { n: l.suggested })}</span>}
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={!!l.state.venue} onChange={(e) => update(l.key, { venue: e.target.checked })} />
                  {t('packing.venue')}
                </label>
                {l.links.map((href) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center hover:text-ink">
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
            <input
              type="number"
              min={0}
              value={l.qty}
              aria-label={t('item.qty')}
              onChange={(e) => {
                const qty = Math.round(Number(e.target.value))
                if (qty >= 0) update(l.key, { qty })
              }}
              className="field tnum h-8 w-14 shrink-0 px-1.5 text-center text-[13px]"
            />
            {l.workshopMaterialIds.length > 0 && !l.itemIds.length ? (
              <IconButton label={t('item.removeMaterial')} onClick={() => removeWorkshopMaterial(l.workshopMaterialIds)}>
                <X size={14} />
              </IconButton>
            ) : (
              <span className="w-7 shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Adds material for the whole workshop or for one item, right from the packing list. */
function AddMaterial({ data, change }: { data: WorkshopState; change: (ops: Op[]) => void }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState(1)
  const [target, setTarget] = useState('')
  const items = agendaOrder(data.days, data).filter((i) => i.kind !== 'note')
  const add = () => {
    const text = label.trim()
    if (!text) return
    const material = { id: newId(), label: text, qty: Math.max(0, qty) }
    const item = items.find((i) => i.id === target)
    change(
      item
        ? [{ op: 'set', entity: 'item', id: item.id, fields: { materials: [...item.materials, material] } }]
        : [{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { materials: [...data.workshop.materials, material] } }],
    )
    setLabel('')
    setQty(1)
  }
  return (
    <form
      className="space-y-2 rounded-lg bg-surface-2/60 p-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <div className="flex gap-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('packing.addPlaceholder')} aria-label={t('item.materialLabel')} className="field h-8 min-w-0 flex-1 text-[13px]" />
        <input type="number" min={0} value={qty} onChange={(e) => setQty(Math.round(Number(e.target.value)))} aria-label={t('item.qty')} className="field tnum h-8 w-14 px-1.5 text-center text-[13px]" />
      </div>
      <div className="flex gap-1.5">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('packing.for')} className="field h-8 min-w-0 flex-1 text-[13px]">
          <option value="">{t('packing.general')}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title || t(`kinds.${i.kind}`)}
            </option>
          ))}
        </select>
        <Button size="sm" type="submit" disabled={!label.trim()}>
          <Plus size={13} />
          {t('packing.add')}
        </Button>
      </div>
    </form>
  )
}

export function FilesPanel({ data, onAttachment, onRemove }: { data: WorkshopState; onAttachment: (a: Attachment) => void; onRemove: (id: string) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const uses = (id: string) => data.items.filter((i) => i.attachmentIds.includes(id)).length
  return (
    <div>
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
