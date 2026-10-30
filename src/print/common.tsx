import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Category, Day, Item, Material, WorkshopState } from '@/domain/types'
import { type DaySchedule, formatDuration, formatTime } from '@/domain/time'
import { dateRange, type PrintOptions, type PrintRow, type PrintVariant } from '@/domain/print'
import { formatDate } from '@/i18n'
import Markdown from '@/components/Markdown'
import { cx } from '@/components/ui'
import { categoryName } from '@/store/useSettings'

export type ItemRow = Extract<PrintRow, { kind: 'item' }>

export const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }

/** The first page's head: which view, the workshop, when and where, its goal, the facilitator's notes, the logo. */
export function Head({ data, variant, options, logo }: { data: WorkshopState; variant: PrintVariant; options: PrintOptions; logo: string | null }) {
  const { t, i18n } = useTranslation()
  const w = data.workshop
  const updated = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(w.updatedAt))
  const internal = variant === 'overview' || variant === 'plan'
  return (
    <header className="mb-5 flex items-start justify-between gap-6 border-b-2 border-black pb-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-black/55">
          {t(`print.${variant}`)}
          {internal && ` · ${t('print.updated', { date: updated })}`}
        </div>
        <h1 className="mt-0.5 text-[22px] font-semibold leading-tight">{w.title || t('workshops.untitled')}</h1>
        <div className="mt-0.5 text-[12.5px] text-black/65">{[w.client, w.location, dateRange(data.days, formatDate)].filter(Boolean).join(' · ')}</div>
        {variant !== 'packing' && options.workshopGoal && w.goal && <p className="mt-2 max-w-[150mm] whitespace-pre-wrap text-[13px]">{w.goal}</p>}
        {internal && options.workshopNotes && w.notes && <Markdown text={w.notes} className="md-compact mt-2 max-w-[150mm] border-l-2 border-black/30 pl-3 text-[12px] text-black/80" />}
      </div>
      {logo && <img src={logo} alt="" className="max-h-12 max-w-[46mm] shrink-0 object-contain object-right" />}
    </header>
  )
}

/** A day's heading: number and date, start to end, and for the facilitator the totals. */
export function DayHeading({ day, index, count, schedule, rows, variant }: { day: Day; index: number; count: number; schedule: DaySchedule; rows: PrintRow[]; variant: PrintVariant }) {
  const { t } = useTranslation()
  const steps = rows.filter((r) => r.kind === 'item' && r.item.kind === 'block').length
  const facts = variant === 'agenda' ? [] : [t('print.work', { d: formatDuration(schedule.workMinutes) }), t('print.breaks', { d: formatDuration(schedule.breakMinutes) }), t('print.steps', { count: steps })]
  const over = variant !== 'agenda' && schedule.overTarget !== null && schedule.overTarget > 0 ? t('planner.over', { d: formatDuration(schedule.overTarget) }) : null
  return (
    <h2 className="keep-next mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-black/60 pb-1">
      <span className="text-[15px] font-semibold">
        {count > 1 && <span className="mr-2 text-black/50">{t('print.day', { n: index + 1 })}</span>}
        {formatDate(day.date, LONG_DATE)}
      </span>
      <span className="text-[12px] text-black/65 tnum">
        {formatTime(day.startMin)}–{formatTime(schedule.end)}
        {facts.length > 0 && ` · ${facts.join(' · ')}`}
        {over && <span className="ml-2 font-medium text-black">⚠ {over}</span>}
      </span>
    </h2>
  )
}

/** Slack before a fixed start, or the warning that the steps before run into it. */
export function Slack({ row, className }: { row: ItemRow; className?: string }) {
  const { t } = useTranslation()
  if (!row.gap && !row.overlap) return null
  return <div className={cx('text-[11px]', row.overlap ? 'font-medium text-black' : 'italic text-black/55', className)}>{row.gap ? t('planner.gap', { d: formatDuration(row.gap) }) : `⚠ ${t('planner.overlap', { d: formatDuration(row.overlap) })}`}</div>
}

/** "Does not fit before 12:30" under a step that runs past its stretch. */
export function Late({ row, className }: { row: ItemRow; className?: string }) {
  const { t } = useTranslation()
  if (!row.late) return null
  return <div className={cx('text-[10px] font-medium leading-tight', className)}>⚠ {t('planner.late', { time: formatTime(row.until ?? row.end) })}</div>
}

export const Tick = ({ large, className }: { large?: boolean; className?: string }) => <span aria-hidden className={cx('tick', large && 'tick-lg', className)} />

export const fileNames = (data: WorkshopState, item: Item): string[] => item.attachmentIds.map((a) => data.attachments.find((x) => x.id === a)?.name).filter((n): n is string => !!n)

export const materialLabel = (m: Material): string => (m.qty > 1 ? `${m.qty} × ${m.label}` : m.label)

export function categoryOf(item: Item, categories: Category[], t: TFunction): string | null {
  const c = categories.find((x) => x.id === item.categoryId)
  return c ? categoryName(c, t) : null
}
