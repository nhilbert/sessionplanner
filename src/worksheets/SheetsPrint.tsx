import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { agendaOrder } from '@/domain/order'
import type { Worksheet, WorkshopState } from '@/domain/types'
import { Button } from '@/components/ui'
import { useTheme } from '@/slides/SlideView'
import { hostSheetHtml, useSheetBrand, useSheetChrome } from './SheetView'

/**
 * The worksheets of a workshop at paper size, for the browser's print (docs/worksheets.md, section 6): the sheets of
 * placed steps in agenda order, or one sheet (?sheet=<id>). Each page goes onto a named page of its paper and
 * orientation, so a workshop's A4 and A3 sheets and its landscape pages print side by side in one go. The browser's
 * print is a vector PDF with the fonts embedded, as the accepted test print of stage 1 was.
 */

const PAGES = (['A4', 'A3', 'A5'] as const).map((p) => {
  const [w, h] = { A4: [210, 297], A3: [297, 420], A5: [148, 210] }[p]
  const k = p.toLowerCase()
  return `@page ${k}p { size: ${w}mm ${h}mm; margin: 0; } @page ${k}l { size: ${h}mm ${w}mm; margin: 0; } .paper-${k} .sheet { page: ${k}p; } .paper-${k} .sheet.landscape { page: ${k}l; }`
}).join(' ')

export default function SheetsPrint({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const only = params.get('sheet')
  const brand = useSheetBrand(data.workshop.theme)
  useTheme(brand.theme)
  const sheets = useMemo(() => {
    const placed = agendaOrder(data.days, data).filter((i) => i.kind !== 'note').flatMap((i) => i.worksheets ?? [])
    if (!only) return placed
    // one sheet: also from a parked step, as the step's own print button opens it
    return data.items.flatMap((i) => i.worksheets ?? []).filter((w) => w.id === only)
  }, [data, only])
  const title = only ? (sheets[0]?.title ?? t('sheets.title')) : `${data.workshop.title || t('workshops.untitled')} – ${t('sheets.title')}`
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    <div className="min-h-dvh bg-[#2a2a2a] print:bg-white">
      <style>{`${PAGES} @media print { .sheet { break-after: page; } .sheet-print { gap: 0 !important; padding: 0 !important; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-black/20 bg-[#f3f1ec] px-4 py-2 text-[13px] text-[#111]">
        <span className="font-medium">{title}</span>
        <span className="text-ink-3">{t('sheets.count', { count: sheets.length })}</span>
        <Button size="sm" variant="primary" className="ml-auto" disabled={!sheets.length} onClick={() => window.print()}>
          <Printer size={13} />
          {t('print.print')}
        </Button>
      </div>
      {!sheets.length && <p className="p-8 text-white/80">{t('sheets.printEmpty')}</p>}
      <div className="sheet-print flex flex-col items-center gap-6 py-6 print:block">
        {sheets.map((sheet) => (
          <PrintedSheet key={sheet.id} sheet={sheet} theme={brand.theme} logo={brand.logo} workshopId={data.workshop.id} />
        ))}
      </div>
    </div>
  )
}

function PrintedSheet({ sheet, theme, logo, workshopId }: { sheet: Worksheet; theme: string; logo: string | null; workshopId: string }) {
  const chrome = useSheetChrome(sheet, logo)
  const html = sheet.pages.map((p, i) => hostSheetHtml(p.html, { workshopId }, chrome(i + 1))).join('')
  return <div className={`paper-${sheet.paper.toLowerCase()} flex flex-col gap-6 print:block`} data-theme={theme} dangerouslySetInnerHTML={{ __html: html }} />
}
