import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category, WorkshopState } from '@/domain/types'
import { sortedDays } from '@/domain/order'
import { dateRange, dayRows, type PrintVariant, workshopMarkdown } from '@/domain/print'
import { formatDate } from '@/i18n'
import { cx } from '@/components/ui'
import { DayHeading, Head, LONG_DATE } from './common'
import { OverviewTable } from './Overview'
import { Cards, Glance } from './Cards'
import { AgendaList } from './Agenda'
import { PackingSheet } from './Packing'
import { Toolbar } from './Toolbar'
import { downloadText, fileSlug, printLabels, usePrintOptions } from './options'
import './print.css'

/** A CSS string: quotes and backslashes escaped, no line breaks. */
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`

/**
 * The page box: A4, room for a running footer with the workshop and the page number. Chromium prints the margin
 * boxes; browsers that do not know them (Firefox, Safari) print their own header line instead when it is switched on.
 */
function pageCss(landscape: boolean, footer: string, page: string, of: string): string {
  const font = 'font: 8.5pt/1 "Inter Variable", system-ui, sans-serif; color: #555;'
  return `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm 16mm 12mm;
  @bottom-left { content: ${cssString(footer)}; ${font} }
  @bottom-right { content: ${cssString(`${page} `)} counter(page) ${cssString(` ${of} `)} counter(pages); ${font} } }`
}

/** One print view of a workshop with its switches; keyed by variant by the page, so the switches reload when it changes. */
export default function PrintView({ data, variant, logo, categories, onVariant }: { data: WorkshopState; variant: PrintVariant; logo: string | null; categories: Category[]; onVariant: (v: PrintVariant) => void }) {
  const { t } = useTranslation()
  const { options, update, reset, changed } = usePrintOptions(variant)
  const [copied, setCopied] = useState(false)
  const days = sortedDays(data.days)
  const title = data.workshop.title || t('workshops.untitled')
  const landscape = variant === 'overview' && options.landscape

  const markdown = () => workshopMarkdown(data, variant, options, printLabels(t, variant, categories), (date, long) => formatDate(date, long ? LONG_DATE : undefined))
  const fileName = `${fileSlug(title)}-${variant}.md`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      downloadText(fileName, markdown())
    }
  }

  return (
    <div className="print-root">
      <style>{pageCss(landscape, [title, dateRange(days, formatDate)].filter(Boolean).join(' · '), t('print.pageLabel'), t('print.pageOf'))}</style>
      <Toolbar variant={variant} onVariant={onVariant} options={options} update={update} reset={reset} changed={changed} onPrint={() => window.print()} onCopy={() => void copy()} onDownload={() => downloadText(fileName, markdown())} copied={copied} />
      <main className={cx('sheet mx-auto my-6 px-[12mm] py-[14mm] text-[12.5px] leading-[1.4] print:m-0 print:w-auto print:max-w-none print:p-0', landscape ? 'max-w-[297mm]' : 'max-w-[210mm]')}>
        <Head data={data} variant={variant} options={options} logo={logo} />
        {variant === 'packing' ? (
          <PackingSheet data={data} />
        ) : (
          days.map((day, i) => {
            const { schedule, rows } = dayRows(data, day, variant, options)
            return (
              <section key={day.id} className={cx(i > 0 && (options.pageBreakDays ? 'page-break mt-10 print:mt-0' : 'mt-10'))}>
                <DayHeading day={day} index={i} count={days.length} schedule={schedule} rows={rows} variant={variant} />
                {variant === 'overview' && <OverviewTable data={data} rows={rows} options={options} categories={categories} />}
                {variant === 'plan' && (
                  <>
                    {options.dayOverview && <Glance rows={rows} options={options} />}
                    <Cards data={data} rows={rows} options={options} categories={categories} />
                  </>
                )}
                {variant === 'agenda' && <AgendaList rows={rows} options={options} />}
              </section>
            )
          })
        )}
        {variant === 'plan' && options.appendPacking && (
          <section className="page-break mt-10 print:mt-0">
            <h2 className="keep-next mb-2 border-b border-black/60 pb-1 text-[15px] font-semibold">{t('print.packing')}</h2>
            <PackingSheet data={data} />
          </section>
        )}
      </main>
    </div>
  )
}
