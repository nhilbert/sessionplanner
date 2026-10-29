import { useTranslation } from 'react-i18next'
import { Eye, Flag, Package, Paperclip, Printer, StickyNote } from 'lucide-react'
import { api } from '@/api'
import type { Item, WorkshopState } from '@/domain/types'
import { entriesIn, itemsIn, sortedDays } from '@/domain/order'
import { durationOf, formatDuration, formatTime, scheduleDay, type DaySchedule } from '@/domain/time'
import { formatDate } from '@/i18n'
import { itemColor, useSettings } from '@/store/useSettings'
import { Button, Chip, cx } from '@/components/ui'
import Markdown from '@/components/Markdown'

/** The read-only agenda for guests with view access: times, groups, descriptions, material, files (and notes if shared). */
export default function AgendaView({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const categories = useSettings((s) => s.settings.categories)
  const days = sortedDays(data.days)
  const w = data.workshop
  const dates = days.length ? (days.length === 1 ? formatDate(days[0].date) : `${formatDate(days[0].date)} – ${formatDate(days[days.length - 1].date)}`) : ''
  const print = (variant: 'agenda' | 'plan') => window.open(`/w/${w.id}/print/${variant}`, '_blank', 'noopener')

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-medium leading-tight tracking-[-0.02em]">{w.title || t('workshops.untitled')}</h1>
            <div className="mt-1 text-[13px] text-ink-2">{[w.client, w.location, dates].filter(Boolean).join(' · ')}</div>
            {w.goal && <p className="mt-2 whitespace-pre-line text-[14px] text-ink-2">{w.goal}</p>}
            {w.notes && <Markdown text={w.notes} className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2" />}
          </div>
          <div className="flex items-center gap-2">
            <Chip>
              <Eye size={12} />
              {t('guest.viewOnly')}
            </Chip>
            <Button size="sm" variant="ghost" onClick={() => print(data.access?.showNotes ? 'plan' : 'agenda')}>
              <Printer size={14} />
              {t('guest.print')}
            </Button>
          </div>
        </header>
        {days.map((d) => {
          const schedule = scheduleDay(d.startMin, d.endMin, itemsIn(data, d.id))
          return (
            <section key={d.id} className="mb-8">
              <h2 className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
                <span className="text-[16px] font-medium">{formatDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span className="text-[13px] text-ink-3 tnum">
                  {formatTime(d.startMin)}–{formatTime(schedule.end)}
                </span>
              </h2>
              <ol className="space-y-1">
                {entriesIn(data, d.id).map((e) =>
                  e.type === 'item' ? (
                    <Row key={e.id} item={e.item} schedule={schedule} data={data} color={itemColor(e.item, categories)} />
                  ) : (
                    <li key={e.id} className="pt-2">
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                        {e.group.title || t('group.untitled')}
                        {e.items.length > 0 && (
                          <span className="font-normal text-ink-3 tnum">
                            {formatTime(schedule.slots[e.items[0].id].start)}–{formatTime(Math.max(...e.items.map((i) => schedule.slots[i.id].end)))}
                          </span>
                        )}
                      </div>
                      <ol className="ml-1 space-y-1 border-l-2 border-line pl-3">
                        {e.items.map((i) => (
                          <Row key={i.id} item={i} schedule={schedule} data={data} color={itemColor(i, categories)} />
                        ))}
                      </ol>
                    </li>
                  ),
                )}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Row({ item, schedule, data, color }: { item: Item; schedule: DaySchedule; data: WorkshopState; color: string | null }) {
  const { t } = useTranslation()
  const slot = schedule.slots[item.id]
  const minutes = durationOf(item)
  const files = item.attachmentIds.map((id) => data.attachments.find((a) => a.id === id)).filter((a) => !!a)
  if (item.kind === 'note')
    return (
      <li className="flex gap-2 rounded-md bg-amber-soft/60 px-3 py-1.5 text-[13px] italic">
        <StickyNote size={13} className="mt-0.5 shrink-0 text-amber" />
        {[item.title, item.description].filter(Boolean).join(' – ')}
      </li>
    )
  if (item.kind === 'marker')
    return (
      <li className="flex items-center gap-3 px-3 py-1 text-[13px] text-ink-2">
        <span className="w-24 shrink-0 tnum">{formatTime(slot.start)}</span>
        <Flag size={12} className="shrink-0" />
        {item.title}
      </li>
    )
  return (
    <li className={cx('flex overflow-hidden rounded-lg border text-[14px]', item.kind === 'break' ? 'item-break' : 'cat-tint')} style={{ '--cat': color ? `var(--c-${color})` : undefined } as React.CSSProperties}>
      {color && <span className="cat-bar w-[3px] shrink-0" />}
      <div className="flex min-w-0 flex-1 gap-3 px-3 py-2">
        <span className="w-24 shrink-0 text-[13px] text-ink-2 tnum">
          {formatTime(slot.start)}–{formatTime(slot.end)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cx('font-medium', item.kind === 'break' && 'text-ink-2')}>{item.title || t(`kinds.${item.kind}`)}</span>
            <span className="shrink-0 text-[12px] text-ink-3 tnum">{formatDuration(minutes)}</span>
          </div>
          {item.description && <p className="mt-0.5 whitespace-pre-line text-[13px] text-ink-2">{item.description}</p>}
          {item.notes && <Markdown text={item.notes} className="mt-1 rounded bg-surface-2 px-2 py-1 text-[12px] text-ink-2" />}
          {(item.materials.length > 0 || files.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
              {item.materials.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1">
                  <Package size={11} />
                  {m.qty > 1 && `${m.qty} × `}
                  {m.label}
                </span>
              ))}
              {files.map((a) => (
                <a key={a.id} href={api.downloadUrl(a.id)} download className="inline-flex items-center gap-1 hover:text-ink hover:underline">
                  <Paperclip size={11} />
                  {a.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
