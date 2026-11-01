import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, BookmarkPlus, Copy, Minus, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react'
import type { Attachment, Item, ItemKind, Material, WorkshopState } from '@/domain/types'
import { newId, type ItemFields, type Op } from '@/domain/ops'
import { entriesIn, membersOf, placeAt, positionAtEnd } from '@/domain/order'
import { contentOf } from '@/domain/copy'
import { categoryName, useSettings } from '@/store/useSettings'
import { useLibrary } from '@/store/useLibrary'
import Swatches from '@/components/Swatches'
import { SNAP } from '@/domain/time'
import { api } from '@/api'
import { Button, Checkbox, Field, IconButton, SectionLabel, Segmented } from '@/components/ui'
import { DEFAULT_DURATION, DurationField, TextField, TimeField, formatSize } from './fields'
import NotesField from './NotesField'
import { uploadFiles } from './upload'
import { SlideStrip } from '@/slides/SlideStrip'
import { themeOf } from '@/slides/SlideView'
import { slideAssets } from '@/domain/slides'

const KINDS: ItemKind[] = ['block', 'break', 'marker', 'note']

export default function ItemPanel({
  item,
  data,
  change,
  onAttachment,
  onClose,
  onSelect,
  onSaved,
  onNotice,
  computedStart,
  owner,
}: {
  /** Guests cannot save to the library. */
  owner: boolean
  item: Item
  /** The item's start as computed now; a fixed start switched on takes this time. */
  computedStart: number | null
  data: WorkshopState
  change: (ops: Op[]) => void
  onAttachment: (a: Attachment) => void
  onClose: () => void
  onSelect: (id: string) => void
  /** Saved to the library: a short confirmation. */
  onSaved: (title: string) => void
  /** A short confirmation (a template saved). */
  onNotice?: (text: string) => void
}) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const settings = useSettings((s) => s.settings)
  const saveToLibrary = useLibrary((s) => s.save)
  const set = (fields: Partial<ItemFields>) => change([{ op: 'set', entity: 'item', id: item.id, fields }])
  const timed = item.kind === 'block' || item.kind === 'break'

  const setKind = (kind: ItemKind) => {
    const fields: Partial<ItemFields> = { kind }
    // A marker or note turned into a block gets a sensible length again.
    if ((kind === 'block' || kind === 'break') && item.duration < SNAP) fields.duration = DEFAULT_DURATION[kind]
    set(fields)
  }

  const duplicate = () => {
    const grouped = item.groupId !== null && data.groups.some((g) => g.id === item.groupId)
    const siblings = grouped ? membersOf(data.items, item.groupId!) : entriesIn(data, item.dayId)
    const index = siblings.findIndex((s) => s.id === item.id) + 1
    const copy: Item = { ...item, id: newId(), fixedStart: null, materials: item.materials.map((m) => ({ ...m, id: newId() })) }
    const placed = placeAt(siblings, copy.id, index)
    const isGroup = (id: string) => data.groups.some((g) => g.id === id)
    const ops: Op[] = placed
      .filter((p) => p.id !== copy.id)
      .map((p): Op => (isGroup(p.id) ? { op: 'set', entity: 'group', id: p.id, fields: { position: p.position } } : { op: 'set', entity: 'item', id: p.id, fields: { position: p.position } }))
    ops.push({ op: 'create', entity: 'item', record: { ...copy, position: placed.find((p) => p.id === copy.id)!.position } })
    change(ops)
    onSelect(copy.id)
  }

  const toParking = () => set({ dayId: null, groupId: null, position: positionAtEnd(entriesIn(data, null)) })

  const save = async () => {
    await saveToLibrary({ kind: 'item', title: item.title || t(`kinds.${item.kind}`), data: contentOf(item) })
    onSaved(item.title)
  }

  return (
    <div className="space-y-4">
      <Segmented<ItemKind> size="sm" value={item.kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />

      <TextField
        value={item.title}
        onCommit={(title) => set({ title })}
        placeholder={t('item.title')}
        aria-label={t('item.title')}
        autoFocus={!item.title}
        className="h-10 text-[16px] font-medium"
      />
      <Field label={t('item.description')}>
        <TextField multiline value={item.description} onCommit={(description) => set({ description })} className="min-h-[64px]" />
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        {timed && (
          <Field label={t('item.duration')}>
            <div className="flex items-center gap-1">
              <IconButton label="−5" onClick={() => set({ duration: Math.max(SNAP, item.duration - SNAP) })}>
                <Minus size={14} />
              </IconButton>
              <DurationField value={item.duration} onChange={(duration) => set({ duration })} className="w-[104px]" aria-label={t('item.duration')} />
              <IconButton label="+5" onClick={() => set({ duration: Math.min(1440, item.duration + SNAP) })}>
                <Plus size={14} />
              </IconButton>
            </div>
          </Field>
        )}
        <Field label={t('item.fixedStart')} hint={item.fixedStart !== null ? t('item.fixedHint') : undefined}>
          <div className="flex h-8 items-center gap-2">
            <Checkbox checked={item.fixedStart !== null} label={t('item.fixedStart')} onChange={(on) => set({ fixedStart: on ? (computedStart ?? 540) : null })} />
            {item.fixedStart !== null && <TimeField value={item.fixedStart} onChange={(v) => v !== null && set({ fixedStart: v })} className="w-[72px]" aria-label={t('item.fixedStart')} />}
          </div>
        </Field>
      </div>

      {item.kind !== 'note' && (
        <div className="space-y-2">
          <Field label={t('item.category')}>
            <select className="field h-8 text-[13px]" value={item.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || null })}>
              <option value="">{t('item.noCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('item.color')} hint={t('item.colorHint')}>
            <Swatches value={item.color} allowNone onChange={(color) => set({ color })} />
          </Field>
        </div>
      )}

      {item.kind === 'block' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('item.goal')} className="sm:col-span-2">
            <TextField value={item.goal} onCommit={(goal) => set({ goal })} />
          </Field>
          <Field label={t('item.method')}>
            <TextField value={item.method} onCommit={(method) => set({ method })} />
          </Field>
          <Field label={t('item.lead')}>
            <TextField value={item.lead} onCommit={(lead) => set({ lead })} />
          </Field>
        </div>
      )}

      {item.kind !== 'note' && (
        <NotesField value={item.notes} onCommit={(notes) => set({ notes })} label={t('item.notes')} hint={t('item.notesHint')} />
      )}

      {item.kind !== 'note' && <Materials materials={item.materials} onChange={(materials) => set({ materials })} />}
      {item.kind !== 'note' && <Files item={item} data={data} onLink={(attachmentIds) => set({ attachmentIds })} onAttachment={onAttachment} />}
      {(item.kind === 'block' || item.kind === 'break') && (
        <SlideStrip slides={item.slides} onChange={(slides) => set({ slides })} scope={{ workshopId: data.workshop.id }} theme={themeOf(data.workshop, settings)} canEdit owner={owner} assets={data.items.flatMap((i) => i.slides.flatMap((s) => slideAssets(s.html)))} onNotice={onNotice} />
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" onClick={duplicate}>
          <Copy size={13} />
          {t('item.duplicate')}
        </Button>
        {owner && item.kind !== 'note' && (
          <Button size="sm" onClick={() => void save()}>
            <BookmarkPlus size={13} />
            {t('item.saveToLibrary')}
          </Button>
        )}
        {item.dayId !== null && (
          <Button size="sm" onClick={toParking}>
            <Archive size={13} />
            {t('item.toParking')}
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            change([{ op: 'delete', entity: 'item', id: item.id }])
            onClose()
          }}
        >
          <Trash2 size={13} />
          {t('item.delete')}
        </Button>
      </div>
    </div>
  )
}

function Materials({ materials, onChange }: { materials: Material[]; onChange: (m: Material[]) => void }) {
  const { t } = useTranslation()
  const update = (id: string, fields: Partial<Material>) => onChange(materials.map((m) => (m.id === id ? { ...m, ...fields } : m)))
  return (
    <div>
      <SectionLabel>{t('item.materials')}</SectionLabel>
      <div className="space-y-1.5">
        {materials.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5">
            <TextField value={m.label} onCommit={(label) => update(m.id, { label })} placeholder={t('item.materialLabel')} className="h-8 min-w-0 flex-1 text-[13px]" />
            <input
              type="number"
              min={0}
              value={m.qty}
              aria-label={t('item.qty')}
              onChange={(e) => {
                const qty = Math.round(Number(e.target.value))
                if (qty >= 0) update(m.id, { qty })
              }}
              className="field tnum h-8 w-14 px-1.5 text-center text-[13px]"
            />
            <TextField
              value={m.link ?? ''}
              onCommit={(link) => {
                const v = link.trim()
                // Only web and mail links are stored (server/validate.ts); anything else gets https:// in front.
                update(m.id, { link: v && !/^(https?:\/\/|mailto:)/i.test(v) ? `https://${v}` : v })
              }}
              placeholder={t('item.link')}
              className="h-8 w-28 text-[13px]"
            />
            <IconButton label={t('item.removeMaterial')} onClick={() => onChange(materials.filter((x) => x.id !== m.id))}>
              <X size={14} />
            </IconButton>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => onChange([...materials, { id: newId(), label: '', qty: 1 }])}>
        <Plus size={13} />
        {t('item.addMaterial')}
      </Button>
    </div>
  )
}

function Files({ item, data, onLink, onAttachment }: { item: Item; data: WorkshopState; onLink: (ids: string[]) => void; onAttachment: (a: Attachment) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const linked = item.attachmentIds.map((id) => data.attachments.find((a) => a.id === id)).filter((a): a is Attachment => !!a)
  const others = data.attachments.filter((a) => !item.attachmentIds.includes(a.id))

  return (
    <div>
      <SectionLabel>{t('item.files')}</SectionLabel>
      <ul className="space-y-1">
        {linked.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[13px]">
            <Paperclip size={13} className="shrink-0 text-ink-3" />
            <a href={api.downloadUrl(a.id)} className="min-w-0 flex-1 truncate hover:underline" download>
              {a.name}
            </a>
            <span className="shrink-0 text-[11px] text-ink-3">{formatSize(a.size)}</span>
            <IconButton label={t('item.unlink')} onClick={() => onLink(item.attachmentIds.filter((x) => x !== a.id))}>
              <X size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {others.length > 0 && (
          <select className="field h-8 w-auto max-w-[220px] text-[13px]" value="" onChange={(e) => e.target.value && onLink([...item.attachmentIds, e.target.value])}>
            <option value="">{t('item.linkFile')}</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => input.current?.click()}>
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
            const added = await uploadFiles(data.workshop.id, files, t)
            setBusy(false)
            added.forEach(onAttachment)
            if (added.length) onLink([...item.attachmentIds, ...added.map((a) => a.id)])
          }}
        />
      </div>
    </div>
  )
}
