import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import type { Category, WorkshopState } from '@/domain/types'
import { formatDuration, formatTime } from '@/domain/time'
import { type PrintOptions, type PrintRow, timeRange } from '@/domain/print'
import Markdown from '@/components/Markdown'
import { cx } from '@/components/ui'
import { categoryOf, fileNames, type ItemRow, Late, materialLabel, Slack, Tick } from './common'

/**
 * The moderation plan, built to be worked through during the workshop: a compact list of the day first (where
 * are we?), then one card per step with the clock time large in the margin, a box to tick, goal, method, material
 * as a checklist and the facilitation notes in full. A card never splits across pages.
 */

const TIME_COL = 'w-[21mm] shrink-0'

/** The day at a glance: times, numbered steps, length, lead. */
export function Glance({ rows, options }: { rows: PrintRow[]; options: PrintOptions }) {
  const { t } = useTranslation()
  const shown = rows.filter((r) => r.kind === 'group' || r.item.kind !== 'note')
  return (
    <section className="avoid-break mb-5">
      <div className="print-label mb-1">{t('print.dayOverview')}</div>
      <table className="w-full border-collapse text-[11px] leading-[1.3]">
        <tbody>
          {shown.map((r) =>
            r.kind === 'group' ? (
              <tr key={r.id}>
                <td colSpan={4} className="pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {r.title || t('group.untitled')}
                </td>
              </tr>
            ) : (
              <tr key={r.item.id} className={cx('border-b border-black/10', r.item.kind === 'marker' && 'text-black/60')}>
                <td className="w-[21mm] py-[2px] pr-2 whitespace-nowrap tnum">{timeRange(r.start, r.end)}</td>
                <td className={cx('py-[2px]', r.item.kind === 'break' && 'text-black/65')}>
                  {r.number !== null && <span className="mr-1 text-black/45 tnum">{r.number}</span>}
                  {r.item.title || t(`kinds.${r.item.kind}`)}
                </td>
                <td className="w-[17mm] py-[2px] text-right whitespace-nowrap text-black/60 tnum">{r.minutes ? formatDuration(r.minutes) : ''}</td>
                {options.lead && <td className="w-[26mm] py-[2px] pl-3 text-black/60">{r.item.kind === 'block' ? r.item.lead : ''}</td>}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  )
}

export function Cards({ data, rows, options, categories }: { data: WorkshopState; rows: PrintRow[]; options: PrintOptions; categories: Category[] }) {
  const { t } = useTranslation()
  const slackClass = cx('py-0.5', options.checkboxes ? 'pl-[calc(14px+0.75rem)]' : '')
  return (
    <div>
      {rows.map((r) => {
        if (r.kind === 'group')
          return (
            <h3 key={r.id} className="keep-next mt-5 mb-1 flex items-baseline justify-between gap-3 border-b-2 border-black pb-0.5 text-[11.5px] font-semibold uppercase tracking-wide first:mt-0">
              {r.title || t('group.untitled')}
              {r.start !== null && r.end !== null && <span className="font-normal normal-case tracking-normal text-black/60 tnum">{timeRange(r.start, r.end)}</span>}
            </h3>
          )
        const { item } = r
        return (
          <Fragment key={item.id}>
            <Slack row={r} className={slackClass} />
            {item.kind === 'note' ? (
              <aside className="avoid-break shaded my-1.5 border-l-[3px] border-black/50 py-1.5 pl-2.5 pr-3 text-[12px] italic leading-snug">
                {item.title && <span className="font-medium not-italic">{item.title}</span>}
                {item.title && item.description && ' – '}
                {item.description}
              </aside>
            ) : item.kind === 'marker' ? (
              <div className="avoid-break flex items-center gap-3 py-1 text-[12px] text-black/70">
                {options.checkboxes && <span className="w-[14px] shrink-0" />}
                <span className={cx(TIME_COL, 'font-medium text-black tnum')}>{formatTime(r.start)}</span>
                <span>{item.title || t('kinds.marker')}</span>
                <span className="h-px flex-1 bg-black/25" />
              </div>
            ) : item.kind === 'break' ? (
              <div className="hatched avoid-break my-1 flex items-center gap-3 rounded-sm px-1.5 py-1.5 text-[12px]">
                {options.checkboxes && <Tick />}
                <span className={cx(TIME_COL, 'font-semibold tnum')}>{timeRange(r.start, r.end)}</span>
                <span className="flex-1 text-black/80">{item.title || t('kinds.break')}</span>
                <span className="text-black/60 tnum">{formatDuration(r.minutes)}</span>
              </div>
            ) : (
              <Card data={data} row={r} options={options} categories={categories} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function Card({ data, row, options, categories }: { data: WorkshopState; row: ItemRow; options: PrintOptions; categories: Category[] }) {
  const { t } = useTranslation()
  const { item } = row
  const category = options.category ? categoryOf(item, categories, t) : null
  const meta = [options.lead ? item.lead : '', category].filter(Boolean)
  const files = options.files ? fileNames(data, item) : []
  const material = options.material && item.materials.length > 0
  const hasFields = (options.goal && item.goal) || (options.method && item.method) || material || files.length > 0
  const dt = 'print-label pt-[2px]'
  return (
    <article className="avoid-break flex gap-3 border-t border-black/30 py-2.5">
      {options.checkboxes && <Tick large className="mt-[3px]" />}
      <div className={TIME_COL}>
        <div className="text-[17px] font-semibold leading-none tnum">{formatTime(row.start)}</div>
        <div className="mt-1 text-[11px] leading-tight text-black/55 tnum">– {formatTime(row.end)}</div>
        <div className="text-[11px] leading-tight text-black/55 tnum">{formatDuration(row.minutes)}</div>
        <Late row={row} className="mt-1" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[14.5px] font-semibold leading-snug">
            {row.number !== null && <span className="mr-1.5 font-normal text-black/45 tnum">{row.number}</span>}
            {item.title || t('kinds.block')}
          </h3>
          {meta.length > 0 && <div className="shrink-0 whitespace-nowrap text-[11px] text-black/60">{meta.join(' · ')}</div>}
        </div>
        {options.description && item.description && <p className="mt-0.5 whitespace-pre-wrap text-[12px] italic leading-snug text-black/65">{item.description}</p>}
        {hasFields && (
          <dl className="mt-1.5 grid grid-cols-[16mm_1fr] gap-x-2 gap-y-[3px] text-[12px] leading-snug">
            {options.goal && item.goal && (
              <>
                <dt className={dt}>{t('print.goal')}</dt>
                <dd className="whitespace-pre-wrap">{item.goal}</dd>
              </>
            )}
            {options.method && item.method && (
              <>
                <dt className={dt}>{t('print.method')}</dt>
                <dd className="whitespace-pre-wrap">{item.method}</dd>
              </>
            )}
            {material && (
              <>
                <dt className={dt}>{t('print.material')}</dt>
                <dd>
                  <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {item.materials.map((m) => (
                      <li key={m.id} className="flex items-center gap-1.5">
                        {options.checkboxes && <Tick />}
                        {materialLabel(m)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {files.length > 0 && (
              <>
                <dt className={dt}>{t('print.files')}</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-0.5 text-black/75">
                  {files.map((name) => (
                    <span key={name}>
                      <Paperclip size={10} className="mr-0.5 inline -mt-0.5" />
                      {name}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        )}
        {options.notes && item.notes && (
          <div className="mt-2 rounded-sm border border-black/20 px-2.5 py-1.5 text-[12px] leading-snug">
            <Markdown text={item.notes} className="md-compact" />
          </div>
        )}
      </div>
    </article>
  )
}
