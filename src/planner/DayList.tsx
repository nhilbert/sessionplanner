import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import type { Category, Day, Group, Item } from '@/domain/types'
import { type DaySchedule, formatTime } from '@/domain/time'
import { formatDate } from '@/i18n'
import { colorVar, itemColor } from '@/store/useSettings'
import { cx } from '@/components/ui'
import { inner, type Lists, PARKING } from './board'

/**
 * The agenda as a slim list, beside an entry whose details are shown large: every day's entries with their start, so
 * the place of the open entry stays in view and another one is a click away. Only for choosing; moving and inserting
 * belong to the agenda itself.
 */
export function DayList({
  title,
  days,
  lists,
  items,
  groups,
  schedules,
  categories,
  currentId,
  onSelect,
}: {
  /** The workshop's title. */
  title: string
  days: Day[]
  lists: Lists
  items: Record<string, Item>
  groups: Record<string, Group>
  schedules: Record<string, DaySchedule>
  categories: Category[]
  currentId: string
  onSelect: (itemId: string) => void
}) {
  const { t } = useTranslation()
  const current = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  const row = (id: string, dayId: string | null, indent: boolean) => {
    const item = items[id]
    if (!item) return null
    const start = dayId ? schedules[dayId]?.slots[id]?.start : undefined
    const quiet = item.kind === 'break' || item.kind === 'note'
    const on = id === currentId
    return (
      <li key={id}>
        <button
          type="button"
          ref={on ? current : undefined}
          aria-current={on ? 'true' : undefined}
          onClick={() => onSelect(id)}
          className={cx('flex w-full items-center gap-2 rounded-[10px] pr-2 text-left text-[13px] transition-colors', quiet ? 'h-8' : 'h-9', indent ? 'pl-4' : 'pl-1.5', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
        >
          <span aria-hidden className="my-1.5 w-1 shrink-0 self-stretch rounded-full" style={{ background: quiet ? 'transparent' : (colorVar(itemColor(item, categories)) ?? 'var(--line-2)') }} />
          {dayId && <span className="w-10 shrink-0 font-bold text-brand-ink tnum">{start === undefined ? '' : formatTime(start)}</span>}
          <span className={cx('min-w-0 flex-1 truncate', quiet ? 'text-ink-2' : on ? 'font-bold' : 'font-medium')}>{item.title || t(`kinds.${item.kind}`)}</span>
        </button>
      </li>
    )
  }
  const entries = (key: string, dayId: string | null) =>
    (lists[key] ?? []).map((id) =>
      groups[id] ? (
        <li key={id}>
          <div className="flex h-8 items-center gap-2 pl-1.5 pr-2 text-[12px] font-semibold text-ink-2">
            <FolderOpen size={12} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{groups[id].title || t('group.untitled')}</span>
          </div>
          <ul>{(lists[inner(id)] ?? []).map((member) => row(member, dayId, true))}</ul>
        </li>
      ) : (
        row(id, dayId, false)
      ),
    )

  return (
    <nav aria-label={t('item.dayList')} className="no-print hidden w-[268px] shrink-0 flex-col xl:flex">
      <div className="app-title truncate px-5 pb-1 pt-6 text-[17px]" title={title}>
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {days.map((d, i) => (
          <section key={d.id}>
            <h2 className="px-2 pb-1.5 pt-3 text-[13px] text-ink-2">
              {days.length > 1 && `${i + 1} · `}
              {formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'long' })}
            </h2>
            <ul>{entries(d.id, d.id)}</ul>
          </section>
        ))}
        {(lists[PARKING] ?? []).length > 0 && (
          <section>
            <h2 className="px-2 pb-1.5 pt-5 text-[13px] text-ink-2">{t('planner.parking')}</h2>
            <ul>{entries(PARKING, null)}</ul>
          </section>
        )}
      </div>
    </nav>
  )
}
