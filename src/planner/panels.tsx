import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink, Paperclip, Plus, Trash2, Upload, UserMinus, UserPlus, X } from 'lucide-react'
import type { Attachment, Member, MemberRole, PackingState, WorkshopState } from '@/domain/types'
import { newId, type Op, type WorkshopFields } from '@/domain/ops'
import { agendaOrder } from '@/domain/order'
import { packingList } from '@/domain/packing'
import { api } from '@/api'
import { Button, Checkbox, cx, Field, IconButton, Input, Modal, Segmented } from '@/components/ui'
import { sortedDays } from '@/domain/order'
import { TextField, TimeField, formatSize } from './fields'
import NotesField from './NotesField'
import { uploadFiles } from './upload'

export function WorkshopPanel({ data, change, owner, onDayDate }: { data: WorkshopState; change: (ops: Op[]) => void; owner: boolean; onDayDate: (dayId: string, date: string) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const w = data.workshop
  const set = (fields: Partial<WorkshopFields>) => change([{ op: 'set', entity: 'workshop', id: w.id, fields }])
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-[12px] font-medium text-ink-2">{t('workshop.days')}</div>
        <ul className="space-y-1.5">
          {sortedDays(data.days).map((d, i) => (
            <li key={d.id} className="flex items-center gap-1.5 text-[13px]">
              <span className="w-4 text-right text-[11px] text-ink-3 tnum">{i + 1}</span>
              <input type="date" value={d.date} onChange={(e) => e.target.value && e.target.value !== d.date && onDayDate(d.id, e.target.value)} aria-label={t('planner.date')} className="field h-8 w-[138px] px-2 text-[13px]" />
              <TimeField value={d.startMin} onChange={(v) => v !== null && change([{ op: 'set', entity: 'day', id: d.id, fields: { startMin: v } }])} className="w-[56px]" aria-label={t('planner.start')} />
              <span className="text-ink-3">–</span>
              <TimeField value={d.endMin} nullable onChange={(v) => change([{ op: 'set', entity: 'day', id: d.id, fields: { endMin: v } }])} className="w-[56px]" aria-label={t('planner.end')} />
            </li>
          ))}
        </ul>
      </div>
      <Field label={t('workshop.client')}>
        <TextField value={w.client} onCommit={(client) => set({ client })} />
      </Field>
      <Field label={t('workshop.location')}>
        <TextField value={w.location} onCommit={(location) => set({ location })} />
      </Field>
      <Field label={t('workshop.goal')}>
        <TextField multiline value={w.goal} onCommit={(goal) => set({ goal })} className="min-h-[64px]" />
      </Field>
      <NotesField value={w.notes} onCommit={(notes) => set({ notes })} label={t('workshop.notes')} />
      {owner && (
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <DuplicateButton data={data} />
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
      )}
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

export function FilesPanel({ data, onAttachment, onRemove, owner }: { data: WorkshopState; onAttachment: (a: Attachment) => void; onRemove: (id: string) => void; owner: boolean }) {
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
            {owner && <IconButton
              label={t('common.delete')}
              onClick={async () => {
                if (!window.confirm(t('files.deleteConfirm', { name: a.name }))) return
                await api.deleteAttachment(a.id)
                onRemove(a.id)
              }}
            >
              <Trash2 size={14} />
            </IconButton>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A copy of the workshop under a new title, its days moved to a new first date. */
function DuplicateButton({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const first = sortedDays(data.days)[0]?.date ?? ''
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setTitle(t('workshop.copyTitle', { title: data.workshop.title || t('workshops.untitled') }))
          setDate(first)
          setOpen(true)
        }}
      >
        <Copy size={13} />
        {t('workshop.duplicate')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const copy = await api.duplicateWorkshop(data.workshop.id, { title: title.trim(), firstDate: date || undefined })
              setOpen(false)
              navigate(`/w/${copy.workshop.id}`)
            } finally {
              setBusy(false)
            }
          }}
        >
          <h2 className="text-lg font-medium">{t('workshop.duplicate')}</h2>
          <Field label={t('workshop.title')}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {first && (
            <Field label={t('workshops.firstDay')} hint={data.days.length > 1 ? t('workshop.daysFollow') : undefined}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          <p className="text-[13px] text-ink-3">{t('workshop.duplicateHint')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" type="submit" disabled={busy || !title.trim()}>
              {t('workshop.duplicate')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/** Guests with access to this workshop (owner only): e-mail, view or edit, notes on or off. */
export function AccessPanel({ data }: { data: WorkshopState }) {
  const { t, i18n } = useTranslation()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('view')
  const [notes, setNotes] = useState(false)
  const [error, setError] = useState('')
  const id = data.workshop.id
  useEffect(() => {
    api.listMembers(id).then(setMembers, () => setMembers([]))
  }, [id])
  const save = async (address: string, r: MemberRole, n: boolean) => {
    const m = await api.setMember(id, address, r, n)
    setMembers((list) => [...(list ?? []).filter((x) => x.email !== m.email), m].sort((a, b) => a.addedAt.localeCompare(b.addedAt)))
  }
  const when = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-snug text-ink-2">{t('access.hint')}</p>
      <form
        className="space-y-2 rounded-lg bg-surface-2/60 p-2.5"
        onSubmit={async (e) => {
          e.preventDefault()
          const address = email.trim().toLowerCase()
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError(t('access.invalid'))
          setError('')
          try {
            await save(address, role, notes)
            setEmail('')
          } catch {
            setError(t('access.invalid'))
          }
        }}
      >
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('access.email')} aria-label={t('access.email')} className="field h-8 text-[13px]" />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<MemberRole>
            size="sm"
            value={role}
            onChange={setRole}
            options={[
              { value: 'view', label: t('access.view') },
              { value: 'edit', label: t('access.edit') },
            ]}
          />
          <label className={cx('flex items-center gap-1.5 text-[12px]', role === 'edit' ? 'text-ink-3' : 'text-ink-2')} title={role === 'edit' ? t('access.notesAlways') : undefined}>
            <input type="checkbox" checked={role === 'edit' || notes} disabled={role === 'edit'} onChange={(e) => setNotes(e.target.checked)} />
            {t('access.notes')}
          </label>
          <Button size="sm" type="submit" className="ml-auto" disabled={!email.trim()}>
            <UserPlus size={13} />
            {t('access.add')}
          </Button>
        </div>
        {error && <p className="text-[12px] text-rose">{error}</p>}
      </form>
      {members && !members.length && <p className="text-[13px] text-ink-3">{t('access.empty')}</p>}
      <ul className="divide-y divide-line">
        {(members ?? []).map((m) => (
          <li key={m.email} className="py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[14px]">{m.email}</span>
              <IconButton
                label={t('access.remove')}
                onClick={async () => {
                  if (!window.confirm(t('access.removeConfirm', { email: m.email }))) return
                  await api.removeMember(id, m.email)
                  setMembers((list) => (list ?? []).filter((x) => x.email !== m.email))
                }}
              >
                <UserMinus size={14} />
              </IconButton>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              <Segmented<MemberRole>
                size="sm"
                value={m.role}
                onChange={(r) => void save(m.email, r, m.showNotes)}
                options={[
                  { value: 'view', label: t('access.view') },
                  { value: 'edit', label: t('access.edit') },
                ]}
              />
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={m.showNotes} disabled={m.role === 'edit'} onChange={(e) => void save(m.email, m.role, e.target.checked)} />
                {t('access.notes')}
              </label>
              <span className="ml-auto">{m.lastSeenAt ? t('access.lastSeen', { when: when(m.lastSeenAt) }) : t('access.never')}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
