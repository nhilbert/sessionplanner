import { useTranslation } from 'react-i18next'
import { formatDuration } from '@/domain/time'
import { type PrintOptions, type PrintRow, timeRange } from '@/domain/print'
import { cx } from '@/components/ui'

/**
 * The agenda for participants and clients: clock times, titles and short descriptions, groups as sections, breaks
 * and markers quiet. Nothing internal: no method, no notes, no slack, no warnings (docs/concept.md, section 6).
 */
export function AgendaList({ rows, options }: { rows: PrintRow[]; options: PrintOptions }) {
  const { t } = useTranslation()
  const n = options.duration ? 3 : 2
  const time = 'w-[27mm] py-2 align-top whitespace-nowrap tnum'
  return (
    <table className="w-full border-collapse text-[13px] leading-[1.4]">
      <colgroup>
        <col style={{ width: '27mm' }} />
        <col />
        {options.duration && <col style={{ width: '16mm' }} />}
      </colgroup>
      <tbody>
        {rows.map((r) => {
          if (r.kind === 'group')
            return (
              <tr key={r.id} className="keep-next">
                <td colSpan={n} className="border-b border-black/70 pt-4 pb-1">
                  <div className="flex items-baseline justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                    <span>{r.title || t('group.untitled')}</span>
                    {r.start !== null && r.end !== null && <span className="font-normal normal-case tracking-normal text-black/55 tnum">{timeRange(r.start, r.end)}</span>}
                  </div>
                </td>
              </tr>
            )
          const { item } = r
          if (item.kind === 'marker')
            return (
              <tr key={item.id} className="text-black/65">
                <td className={cx(time, 'py-1')}>{timeRange(r.start, r.end)}</td>
                <td className="py-1" colSpan={n - 1}>
                  {item.title || t('kinds.marker')}
                </td>
              </tr>
            )
          if (item.kind === 'break')
            return (
              <tr key={item.id} className="hatched">
                <td className={cx(time, 'py-1.5 pl-1.5')}>{timeRange(r.start, r.end)}</td>
                <td className="py-1.5 text-black/75">{item.title || t('kinds.break')}</td>
                {options.duration && <td className="py-1.5 pr-1.5 text-right text-black/55 tnum">{formatDuration(r.minutes)}</td>}
              </tr>
            )
          return (
            <tr key={item.id} className="border-b border-black/10">
              <td className={cx(time, 'pl-1.5 font-medium')}>{timeRange(r.start, r.end)}</td>
              <td className="py-2">
                <div className="font-semibold">{item.title || t('kinds.block')}</div>
                {options.description && item.description && <div className="mt-0.5 whitespace-pre-wrap text-black/70">{item.description}</div>}
                {options.goal && item.goal && (
                  <div className="mt-0.5 whitespace-pre-wrap text-black/70">
                    <span className="text-black/50">{t('print.goal')}: </span>
                    {item.goal}
                  </div>
                )}
                {options.lead && item.lead && <div className="mt-0.5 text-[12px] text-black/55">{item.lead}</div>}
              </td>
              {options.duration && <td className="py-2 pr-1.5 text-right align-top text-black/55 tnum">{formatDuration(r.minutes)}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
