import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { api } from '@/api'
import type { Item, WorkshopState } from '@/domain/types'
import { agendaOrder, type Entry, entriesIn, itemsIn, sortedDays } from '@/domain/order'
import { packingList } from '@/domain/packing'
import { durationOf, formatDuration, formatTime, scheduleDay } from '@/domain/time'
import { formatDate } from '@/i18n'
import { Button, cx } from '@/components/ui'
import { useSettings } from '@/store/useSettings'

type Variant = 'plan' | 'agenda' | 'packing'

/** Print views (docs/concept.md, section 6): facilitation plan, client agenda, packing list. */
export default function PrintPage() {
  const { id = '', variant = 'plan' } = useParams()
  const { t } = useTranslation()
  const [data, setData] = useState<WorkshopState | null>(null)
  const [failed, setFailed] = useState(false)
  const { settings, loaded, load } = useSettings()
  const logo = api.logoUrl(settings)
  const v: Variant = variant === 'agenda' || variant === 'packing' ? variant : 'plan'

  useEffect(() => {
    api.loadWorkshop(id).then(setData, () => setFailed(true))
    if (!loaded) void load()
  }, [id, loaded, load])
  useEffect(() => {
    if (data) document.title = `${data.workshop.title || t('workshops.untitled')} – ${t(`print.${v}`)}`
  }, [data, v, t])

  if (failed) return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>

  const w = data.workshop
  const days = sortedDays(data.days)
  const dates = days.length ? (days.length === 1 ? formatDate(days[0].date) : `${formatDate(days[0].date)} – ${formatDate(days[days.length - 1].date)}`) : ''

  return (
    <div className="mx-auto max-w-[1100px] bg-white px-6 py-8 text-[13px] text-black print:max-w-none print:p-0">
      <style>{`@page { size: A4 ${v === 'plan' ? 'landscape' : 'portrait'}; margin: 12mm; } body { background: #fff; color-scheme: light; }`}</style>
      <div className="no-print mb-6 flex justify-end">
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={15} />
          {t('print.print')}
        </Button>
      </div>
      <header className="mb-5 flex items-start justify-between gap-6 border-b border-black/20 pb-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.12em] text-black/50">{t(`print.${v}`)}</div>
          <h1 className="text-[22px] font-semibold leading-tight">{w.title || t('workshops.untitled')}</h1>
          <div className="text-black/70">{[w.client, w.location, dates].filter(Boolean).join(' · ')}</div>
          {v !== 'packing' && w.goal && <p className="mt-2 whitespace-pre-wrap">{w.goal}</p>}
        </div>
        {logo && <img src={logo} alt="" className="max-h-14 max-w-[200px] shrink-0 object-contain" />}
      </header>
      {v === 'packing' ? <PackingTable data={data} /> : days.map((d, i) => <DayTable key={d.id} data={data} dayIndex={i} variant={v} />)}
    </div>
  )
}

function DayTable({ data, dayIndex, variant }: { data: WorkshopState; dayIndex: number; variant: 'plan' | 'agenda' }) {
  const { t } = useTranslation()
  const day = sortedDays(data.days)[dayIndex]
  const schedule = scheduleDay(day.startMin, day.endMin, itemsIn(data, day.id))
  const columns = variant === 'plan' ? 8 : 2
  // Groups print as a heading row with their time range, followed by their items.
  type Row = { kind: 'group'; group: Extract<Entry, { type: 'group' }> } | { kind: 'item'; item: Item }
  const rows = entriesIn(data, day.id).flatMap((e): Row[] => (e.type === 'item' ? [{ kind: 'item', item: e.item }] : [{ kind: 'group', group: e }, ...e.items.map((item): Row => ({ kind: 'item', item }))]))
  const files = (item: Item) => item.attachmentIds.map((a) => data.attachments.find((x) => x.id === a)?.name).filter(Boolean)
  const th = 'border-b border-black/30 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-black/60'
  const td = 'border-b border-black/10 px-2 py-1.5 align-top'

  return (
    <section className="mb-8 break-inside-avoid-page">
      <h2 className="mb-2 text-[15px] font-semibold">
        {data.days.length > 1 && `${dayIndex + 1}. `}
        {formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        <span className="ml-2 font-normal text-black/60 tnum">
          {formatTime(day.startMin)}–{formatTime(schedule.end)}
        </span>
      </h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cx(th, 'w-[90px]')}>{t('print.time')}</th>
            {variant === 'plan' && <th className={cx(th, 'w-[60px]')}>{t('print.duration')}</th>}
            <th className={th}>{t('print.content')}</th>
            {variant === 'plan' && (
              <>
                <th className={th}>{t('print.goal')}</th>
                <th className={th}>{t('print.method')}</th>
                <th className={cx(th, 'w-[80px]')}>{t('print.lead')}</th>
                <th className={th}>{t('print.material')}</th>
                <th className={th}>{t('print.notes')}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'group') {
              const slots = row.group.items.map((i) => schedule.slots[i.id])
              return (
                <tr key={row.group.id} className="break-after-avoid">
                  <td className={cx(td, 'tnum whitespace-nowrap pt-3 text-black/60')}>{slots.length ? `${formatTime(slots[0].start)}–${formatTime(Math.max(...slots.map((x) => x.end)))}` : ''}</td>
                  <td className={cx(td, 'pt-3 text-[12px] font-semibold uppercase tracking-wide')} colSpan={columns - 1}>
                    {row.group.group.title}
                  </td>
                </tr>
              )
            }
            const item = row.item
            if (variant === 'agenda' && item.kind === 'note') return null
            const slot = schedule.slots[item.id]
            const minutes = durationOf(item)
            if (item.kind === 'note')
              return (
                <tr key={item.id} className="break-inside-avoid">
                  <td className={td} />
                  <td className={cx(td, 'italic text-black/70')} colSpan={7}>
                    {[item.title, item.description].filter(Boolean).join(' – ')}
                  </td>
                </tr>
              )
            return (
              <tr key={item.id} className={cx('break-inside-avoid', item.kind === 'break' && 'bg-black/[0.04]', item.kind === 'marker' && 'text-black/70')}>
                <td className={cx(td, 'tnum whitespace-nowrap')}>{minutes ? `${formatTime(slot.start)}–${formatTime(slot.end)}` : formatTime(slot.start)}</td>
                {variant === 'plan' && <td className={cx(td, 'tnum whitespace-nowrap')}>{minutes ? formatDuration(minutes) : ''}</td>}
                <td className={td}>
                  <div className={cx(item.kind !== 'marker' && 'font-medium')}>{item.title}</div>
                  {item.description && <div className="whitespace-pre-wrap text-black/70">{item.description}</div>}
                </td>
                {variant === 'plan' && (
                  <>
                    <td className={cx(td, 'whitespace-pre-wrap')}>{item.goal}</td>
                    <td className={cx(td, 'whitespace-pre-wrap')}>{item.method}</td>
                    <td className={td}>{item.lead}</td>
                    <td className={td}>
                      {item.materials.map((m) => (
                        <div key={m.id}>
                          {m.qty > 1 && `${m.qty} × `}
                          {m.label}
                        </div>
                      ))}
                      {files(item).map((name) => (
                        <div key={name} className="text-black/60">
                          📎 {name}
                        </div>
                      ))}
                    </td>
                    <td className={cx(td, 'whitespace-pre-wrap text-[12px]')}>{item.notes}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function PackingTable({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const lines = packingList(agendaOrder(data.days, data), data.workshop.packing, data.workshop.materials)
  const td = 'border-b border-black/10 px-2 py-1.5'
  return (
    <table className="w-full max-w-[640px] border-collapse">
      <tbody>
        {lines.map((l) => (
          <tr key={l.key} className={cx(l.state.venue && 'text-black/50')}>
            <td className={cx(td, 'w-8 text-[16px]')}>{l.state.checked ? '☑' : '☐'}</td>
            <td className={cx(td, 'tnum w-14 text-right')}>{l.qty}</td>
            <td className={td}>{l.label}</td>
            <td className={cx(td, 'text-right text-[12px]')}>{l.state.venue ? t('packing.venue') : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
