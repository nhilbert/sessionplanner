import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import type { Category, WorkshopState } from '@/domain/types'
import { formatDuration } from '@/domain/time'
import { type PrintOptions, type PrintRow, timeRange } from '@/domain/print'
import Markdown from '@/components/Markdown'
import { cx } from '@/components/ui'
import { categoryOf, fileNames, type ItemRow, Late, materialLabel, Slack } from './common'

/**
 * The planning overview: one table per day with the columns the user switched on (Zeit · Dauer · Inhalt · Ziel ·
 * Methode · Wer · Material · Notizen). Rows never split across pages; the head repeats on every page.
 */
export function OverviewTable({ data, rows, options, categories }: { data: WorkshopState; rows: PrintRow[]; options: PrintOptions; categories: Category[] }) {
  const { t } = useTranslation()
  type Col = { key: string; head: string; width?: string; cell: (r: ItemRow) => React.ReactNode }
  const cols: Col[] = [
    {
      key: 'time',
      head: t('print.time'),
      width: '19mm',
      cell: (r) => (
        <>
          <div className="whitespace-nowrap tnum">{timeRange(r.start, r.end)}</div>
          <Late row={r} className="mt-0.5" />
        </>
      ),
    },
  ]
  if (options.duration) cols.push({ key: 'duration', head: t('print.duration'), width: '13mm', cell: (r) => <span className="whitespace-nowrap tnum">{r.minutes ? formatDuration(r.minutes) : ''}</span> })
  cols.push({
    key: 'content',
    head: t('print.content'),
    cell: (r) => {
      const category = options.category ? categoryOf(r.item, categories, t) : null
      return (
        <>
          <div className={cx(r.item.kind === 'block' && 'font-semibold')}>
            {r.number !== null && <span className="mr-1 font-normal text-black/45 tnum">{r.number}</span>}
            {r.item.title || t(`kinds.${r.item.kind}`)}
            {category && <span className="ml-1.5 font-normal text-black/50">· {category}</span>}
          </div>
          {options.description && r.item.description && <div className="whitespace-pre-wrap text-black/70">{r.item.description}</div>}
        </>
      )
    },
  })
  if (options.goal) cols.push({ key: 'goal', head: t('print.goal'), cell: (r) => <span className="whitespace-pre-wrap">{r.item.goal}</span> })
  if (options.method) cols.push({ key: 'method', head: t('print.method'), cell: (r) => <span className="whitespace-pre-wrap">{r.item.method}</span> })
  if (options.lead) cols.push({ key: 'lead', head: t('print.lead'), width: '16mm', cell: (r) => r.item.lead })
  if (options.material || options.files)
    cols.push({
      key: 'material',
      head: t('print.material'),
      cell: (r) => (
        <>
          {options.material && r.item.materials.map((m) => <div key={m.id}>{materialLabel(m)}</div>)}
          {options.files &&
            fileNames(data, r.item).map((name) => (
              <div key={name} className="text-black/60">
                <Paperclip size={10} className="mr-0.5 inline -mt-0.5" />
                {name}
              </div>
            ))}
        </>
      ),
    })
  if (options.notes) cols.push({ key: 'notes', head: t('print.notes'), cell: (r) => (r.item.notes ? <Markdown text={r.item.notes} className="md-compact" /> : null) })

  const n = cols.length
  // The content column holds title and description: wide, but it leaves the other text columns their share.
  const textCols = cols.filter((c) => !c.width && c.key !== 'content').length
  const content = cols.find((c) => c.key === 'content')!
  if (textCols) content.width = `${Math.max(26, 64 - 12 * textCols)}%`
  const th = 'border-b border-black px-1.5 py-1 text-left print-label'
  const td = 'border-b border-black/15 px-1.5 py-1 align-top'
  const span = (from: number) => n - from

  return (
    <table className={cx('w-full border-collapse leading-[1.35]', n > 6 && !options.landscape ? 'text-[11px]' : 'text-[11.5px]')}>
      <colgroup>
        {cols.map((c) => (
          <col key={c.key} style={c.width ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} className={th}>
              {c.head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          if (r.kind === 'group')
            return (
              <tr key={r.id} className="keep-next">
                <td className={cx(td, 'whitespace-nowrap pt-3 text-black/60 tnum')}>{r.start !== null && r.end !== null ? timeRange(r.start, r.end) : ''}</td>
                <td className={cx(td, 'pt-3 text-[11px] font-semibold uppercase tracking-wide')} colSpan={span(1)}>
                  {r.title || t('group.untitled')}
                </td>
              </tr>
            )
          const { item } = r
          const slack = (r.gap > 0 || r.overlap > 0) && (
            <tr>
              <td colSpan={n} className="px-1.5 py-0.5">
                <Slack row={r} />
              </td>
            </tr>
          )
          if (item.kind === 'note')
            return (
              <Fragment key={item.id}>
                {slack}
                <tr>
                  <td className={td} />
                  <td className={cx(td, 'italic text-black/70')} colSpan={span(1)}>
                    {[item.title, item.description].filter(Boolean).join(' – ')}
                  </td>
                </tr>
              </Fragment>
            )
          if (item.kind === 'marker')
            return (
              <Fragment key={item.id}>
                {slack}
                <tr className="text-black/70">
                  <td className={cx(td, 'tnum')}>{timeRange(r.start, r.end)}</td>
                  <td className={td} colSpan={span(1)}>
                    {item.title}
                  </td>
                </tr>
              </Fragment>
            )
          if (item.kind === 'break')
            return (
              <Fragment key={item.id}>
                {slack}
                <tr className="hatched">
                  <td className={cx(td, 'tnum')}>{timeRange(r.start, r.end)}</td>
                  {options.duration && <td className={cx(td, 'tnum')}>{formatDuration(r.minutes)}</td>}
                  <td className={cx(td, 'text-black/75')} colSpan={span(options.duration ? 2 : 1)}>
                    {item.title || t('kinds.break')}
                  </td>
                </tr>
              </Fragment>
            )
          return (
            <Fragment key={item.id}>
              {slack}
              <tr>
                {cols.map((c) => (
                  <td key={c.key} className={td}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
