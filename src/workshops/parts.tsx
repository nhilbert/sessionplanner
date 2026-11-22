import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Check, CircleCheck, Copy } from 'lucide-react'
import { api, reportFailure } from '@/api'
import type { WorkshopSummary } from '@/domain/types'
import { formatDuration } from '@/domain/time'
import { clientKey, untilOf } from '@/domain/workshopsView'
import { formatDate, formatDateRange } from '@/i18n'
import { Button, Chip, cx, Field, IconButton, Input, Modal } from '@/components/ui'
import type { Selection } from '@/components/collection'
import Menu, { type MenuItem } from '@/components/Menu'
import { ClientSuggestions } from '@/planner/panels'

/** What the list of workshops is built from (pages/WorkshopsPage.tsx): a workshop as a line, its date and length as text, and the dialog for a new one. */

export const workshopPath = (id: string): string => `/w/${id}`

export const titleOf = (w: WorkshopSummary, t: TFunction): string => w.title || t('workshops.untitled')

/** "6 h 30 min" for one day, "2 days · 11 h 35 min" for several; nothing placed yet says so. */
export function lengthOf(w: WorkshopSummary, t: TFunction): string {
  if (!w.minutes) return t('workshops.notPlanned')
  return w.days > 1 ? `${t('workshops.days', { count: w.days })} · ${formatDuration(w.minutes)}` : formatDuration(w.minutes)
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }

/** A workshop's days inside a year's list, where the year is said above: "Di., 24.11.", "24.–25.11.". */
export function shortSpan(w: WorkshopSummary, t: TFunction): string {
  if (!w.firstDate) return t('workshops.open')
  return w.lastDate && w.lastDate !== w.firstDate ? formatDateRange(w.firstDate, w.lastDate, DAY_MONTH) : formatDate(w.firstDate, { weekday: 'short', ...DAY_MONTH })
}

/** A workshop's days with their year, for a list across years: "24.–25. Nov. 2026". */
export function fullSpan(w: WorkshopSummary, t: TFunction): string {
  return w.firstDate ? formatDateRange(w.firstDate, w.lastDate, { day: 'numeric', month: 'short', year: 'numeric' }) : t('workshops.noDate')
}

/** "in 5 Tagen", "morgen", "läuft": how far away a coming workshop is; empty for the others. */
export function untilText(w: WorkshopSummary, today: string, t: TFunction): string {
  const until = untilOf(w, today)
  if (!until) return ''
  if (!('count' in until)) return t(until.unit === 'running' ? 'workshops.untilRunning' : until.unit === 'today' ? 'workshops.untilToday' : 'workshops.untilTomorrow')
  return t(until.unit === 'days' ? 'workshops.untilDays' : until.unit === 'weeks' ? 'workshops.untilWeeks' : 'workshops.untilMonths', { count: until.count })
}

/** The look of a tick, for a line that is a checkbox as a whole while workshops are being selected. */
export function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-2 bg-surface')}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}

/** What every line of the list needs from the page. */
export interface RowContext {
  today: string
  /** The ticks, while workshops are being selected. */
  selection: Selection | null
  /** Opens a client's history; null where clients are no way to go (while selecting, on a phone, where the lines are a client's already). */
  onClient: ((key: string) => void) | null
  /** A workshop's own actions (duplicate, archive, delete); none for who may not change the list. */
  actions: (w: WorkshopSummary) => MenuItem[]
  onDuplicate: (w: WorkshopSummary) => void
  /**
   * The offline copy (docs/offline.md): the workshops it holds on this device (marked as such), and whether the list
   * itself came from it, the server being out of reach. Then the others are dimmed, say they need a connection, and
   * opening one says why it does not open.
   */
  offline?: { kept: Set<string>; away: boolean; onUnavailable: (w: WorkshopSummary) => void }
}

/** Whether a workshop is on this device, and whether it cannot be opened now. */
export function offlineState(w: WorkshopSummary, ctx: RowContext): { onDevice: boolean; unavailable: boolean } {
  const onDevice = !!ctx.offline?.kept.has(w.id)
  return { onDevice, unavailable: !!ctx.offline?.away && !onDevice }
}

/** The mark of a workshop the offline copy holds on this device, after its title; or, without the server, of one it does not. */
export function OfflineMark({ onDevice, unavailable }: { onDevice: boolean; unavailable: boolean }) {
  const { t } = useTranslation()
  if (onDevice)
    return (
      <span title={t('offline.onDevice')} className="inline-flex shrink-0 items-center text-ink-3">
        <CircleCheck size={13} aria-hidden />
        <span className="sr-only">{t('offline.onDevice')}</span>
      </span>
    )
  return unavailable ? <Chip className="shrink-0">{t('offline.onlyOnline')}</Chip> : null
}

/** A client's name as the way to everything done for them; plain text where that way is closed. */
export function ClientName({ name, onClient }: { name: string; onClient: RowContext['onClient'] }) {
  const { t } = useTranslation()
  if (!onClient) return <>{name}</>
  return (
    <button type="button" title={t('workshops.clientOpen', { client: name })} onClick={() => onClient(clientKey(name))} className="relative z-[1] rounded-sm hover:text-brand-ink hover:underline">
      {name}
    </button>
  )
}

/** Client and place as one line of text, each only where it is known. */
export function ClientAndPlace({ w, onClient, client = true }: { w: WorkshopSummary; onClient: RowContext['onClient']; /** Off where the lines are one client's. */ client?: boolean }) {
  const name = client ? w.client.trim() : ''
  return (
    <>
      {name && <ClientName name={name} onClient={onClient} />}
      {name && w.location && ' · '}
      {w.location}
    </>
  )
}

/** The actions at the end of a line: the menu, and before it the copy where copying is what one came for (a client's history). */
export function RowActions({ w, ctx, quick, className }: { w: WorkshopSummary; ctx: RowContext; quick?: boolean; className?: string }) {
  const { t } = useTranslation()
  const items = ctx.actions(w)
  if (!items.length) return null
  return (
    <span className={cx('relative z-[1] flex shrink-0 items-center', className)}>
      {quick && (
        <IconButton label={t('workshop.duplicate')} onClick={() => ctx.onDuplicate(w)} className="text-brand-ink">
          <Copy size={14} />
        </IconButton>
      )}
      <Menu float items={items} label={t('workshops.rowMenu', { title: titleOf(w, t) })} title={titleOf(w, t)} />
    </span>
  )
}

/**
 * A workshop as a line: its days, title, client and place, length, and how far away it is where it is coming. The
 * whole line opens it (the title is the link, stretched over the line); the client's name and the actions lie above
 * that. While selecting, the line is a tick. On a narrow screen the days move under the title, and the length shows
 * only where the list is wide enough for it.
 */
export function WorkshopRow({ w, ctx, dates, column = dates, client = true, until, quick }: { w: WorkshopSummary; ctx: RowContext; dates: 'short' | 'full'; /** The room the days get, where lines of both kinds stand in one list. */ column?: 'short' | 'full'; client?: boolean; until?: boolean; quick?: boolean }) {
  const { t } = useTranslation()
  const { selection } = ctx
  const picked = !!selection?.has(w.id)
  const title = titleOf(w, t)
  const date = dates === 'short' ? shortSpan(w, t) : fullSpan(w, t)
  const away = until ? untilText(w, ctx.today, t) : ''
  const { onDevice, unavailable } = offlineState(w, ctx)
  const body = (link: ReactNode) => (
    <>
      <span className={cx('hidden shrink-0 text-[14px] md:block', column === 'short' ? 'w-[5.75rem]' : 'w-[8.75rem]', w.firstDate ? 'font-bold text-brand-ink tnum' : 'text-ink-2')}>{date}</span>
      <span className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
        <span className="flex min-w-0 items-center gap-2 md:flex-1">
          {link}
          <OfflineMark onDevice={onDevice} unavailable={unavailable} />
          {w.archived && <Chip>{t('workshops.archived')}</Chip>}
        </span>
        <span className={cx('block truncate text-[13px] text-ink-2 md:shrink-0 md:text-[14px]', client ? 'md:w-[48%]' : 'md:w-[44%]')}>
          <span className={cx('md:hidden', w.firstDate && 'font-bold text-brand-ink tnum')}>{date}</span>
          {(w.location || (client && w.client.trim())) && <span className="md:hidden"> · </span>}
          <ClientAndPlace w={w} onClient={selection ? null : ctx.onClient} client={client} />
        </span>
      </span>
      <span className="hidden w-[8.25rem] shrink-0 text-right text-[13px] text-ink-2 tnum @[44rem]:block" title={t('workshops.length')}>
        {lengthOf(w, t)}
      </span>
      {until && <span className="hidden w-[5.75rem] shrink-0 text-right text-[13px] text-ink-2 md:block">{away}</span>}
    </>
  )
  if (selection)
    return (
      <li className={cx('border-b border-line last:border-b-0', picked && 'bg-accent-soft')}>
        <div
          role="checkbox"
          aria-checked={picked}
          aria-label={t('list.select', { title })}
          tabIndex={0}
          onClick={(e) => selection.toggle(w.id, e.shiftKey)}
          onKeyDown={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return
            e.preventDefault()
            selection.toggle(w.id, e.shiftKey)
          }}
          className={cx('flex min-h-12 cursor-pointer select-none items-center gap-3 px-3 py-2 md:px-4 pointer-coarse:min-h-[60px]', !picked && 'hover:bg-surface-2/60')}
        >
          <Tick on={picked} />
          {body(<span className="truncate font-semibold">{title}</span>)}
        </div>
      </li>
    )
  return (
    <li className={cx('group relative flex items-center border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/60', unavailable && 'text-ink-3 [&_*]:!text-ink-3')}>
      <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-3 pr-2 md:pl-4 pointer-coarse:min-h-[60px]">
        {body(
          unavailable ? (
            <button type="button" onClick={() => ctx.offline?.onUnavailable(w)} className="truncate text-left font-semibold after:absolute after:inset-0">
              {title}
            </button>
          ) : (
            <Link to={workshopPath(w.id)} className="truncate font-semibold after:absolute after:inset-0">
              {title}
            </Link>
          ),
        )}
      </div>
      <RowActions w={w} ctx={ctx} quick={quick} className="pr-1.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100 pointer-fine:has-[[aria-expanded=true]]:opacity-100" />
    </li>
  )
}

/** A list of workshops as one card of lines. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx('card @container overflow-hidden', className)}>{children}</ul>
}

/** The head of a part of the list: what it holds, and beside it how much or in which order. */
export function PartHead({ id, children, hint }: { id?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <h2 id={id} className="mb-2 px-1 text-[13px] font-semibold text-brand-ink">
      {children}
      {hint && <span className="font-normal text-ink-2"> · {hint}</span>}
    </h2>
  )
}

/** A new workshop: title, client (the known ones are suggested, so a client is typed the same way every time) and first day. */
export function NewWorkshop({ open, client, known, onClose, onCreated }: { open: boolean; /** Filled in beforehand, when it is made for a client. */ client?: string; known: string[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [forClient, setForClient] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  // Each opening starts empty, with the client it was opened for.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setForClient(client ?? '')
    setDate(new Date().toLocaleDateString('sv'))
  }, [open]) // only on opening: typing in the fields must not reset them

  const submit = async () => {
    setBusy(true)
    try {
      const ws = await api.createWorkshop({ title: title.trim(), client: forClient.trim(), date: date || undefined })
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
          <Input value={forClient} onChange={(e) => setForClient(e.target.value)} list={known.length ? 'sp-new-workshop-clients' : undefined} />
          <ClientSuggestions id="sp-new-workshop-clients" names={known} />
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
