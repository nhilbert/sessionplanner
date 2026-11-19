import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { agendaOrder } from '@/domain/order'
import { jobTitle, printLines, printWords, sheetJobs } from '@/domain/printing'
import type { Worksheet, WorkshopState } from '@/domain/types'
import { Button } from '@/components/ui'
import { useTheme } from '@/slides/SlideView'
import { hostSheetHtml, paperFrame, type PaperLook, sheetOverflow, usePaper, useSheetBrand, useSheetChrome, useSheetMeasure, useStepFacts } from './SheetView'
import { Option } from '@/slides/Option'

/**
 * The worksheets of a workshop at paper size, for the browser's print (docs/worksheets.md, section 6): the sheets of
 * placed steps in agenda order, one sheet (?sheet=<id>), or one print job of the print package (?job=<key>, with the
 * reserve and the participants the package used): its sheets in agenda order, each starting on a new leaf when the job
 * is two-sided, and the job as the page's title, which the browser offers as the PDF's name. Each page goes onto a named page of its paper and
 * orientation, so a workshop's A4 and A3 sheets and its landscape pages print side by side in one go. The browser's
 * print is a vector PDF with the fonts embedded, as the accepted test print of stage 1 was.
 */

const PAGES = (['A4', 'A3', 'A5'] as const).map((p) => {
  const [w, h] = { A4: [210, 297], A3: [297, 420], A5: [148, 210] }[p]
  const k = p.toLowerCase()
  return `@page ${k}p { size: ${w}mm ${h}mm; margin: 0; } @page ${k}l { size: ${h}mm ${w}mm; margin: 0; } .paper-${k} .sheet { page: ${k}p; } .paper-${k} .sheet.landscape { page: ${k}l; }`
}).join(' ')

export default function SheetsPrint({ data }: { data: WorkshopState }) {
  const { t, i18n } = useTranslation()
  const [params] = useSearchParams()
  const only = params.get('sheet')
  const jobKeyWanted = params.get('job')
  const brand = useSheetBrand(data.workshop.theme)
  useTheme(brand.theme)
  const look = usePaper(brand.theme)
  const facts = useStepFacts()
  const [bw, setBw] = useState(() => {
    try {
      return localStorage.getItem('sp.sheets.bw') === '1'
    } catch {
      return false
    }
  })
  const setBlackWhite = (on: boolean) => {
    setBw(on)
    try {
      if (on) localStorage.setItem('sp.sheets.bw', '1')
      else localStorage.removeItem('sp.sheets.bw')
    } catch {
      /* storage blocked */
    }
  }
  const job = useMemo(() => {
    if (!jobKeyWanted) return null
    const number = (k: string) => (params.get(k) && Number.isInteger(Number(params.get(k))) ? Number(params.get(k)) : undefined)
    const found = sheetJobs(printLines(data, { participants: number('participants'), reserve: number('reserve') })).find((j) => j.key === jobKeyWanted)
    if (!found) return { title: `${data.workshop.title || t('workshops.untitled')} – ${t('sheets.title')}`, sheets: [], duplex: false }
    const all = data.items.flatMap((i) => i.worksheets ?? [])
    return { title: jobTitle(found.job, data.workshop.title, printWords(i18n.language)), sheets: found.lines.map((l) => all.find((w) => w.id === l.id)!).filter(Boolean), duplex: found.job.duplex }
  }, [data, jobKeyWanted, params, i18n.language, t])
  const sheets = useMemo(() => {
    if (job) return job.sheets
    const placed = agendaOrder(data.days, data).filter((i) => i.kind !== 'note').flatMap((i) => i.worksheets ?? [])
    if (!only) return placed
    // one sheet: also from a parked step, as the step's own print button opens it
    return data.items.flatMap((i) => i.worksheets ?? []).filter((w) => w.id === only)
  }, [data, only, job])
  const title = job ? job.title : only ? (sheets[0]?.title ?? t('sheets.title')) : `${data.workshop.title || t('workshops.untitled')} – ${t('sheets.title')}`
  useEffect(() => {
    document.title = title
  }, [title])
  // pages whose content runs past the bottom margin are cut there in print: said above, and marked on screen
  const pagesRef = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(0)
  useSheetMeasure(pagesRef, `${sheets.map((w) => `${w.id}:${w.updatedAt}`).join('|')}|${brand.theme}|${look.logo}`, (sections) => {
    let n = 0
    for (const section of sections) {
      const runs = Object.keys(sheetOverflow(section)).length > 0
      section.toggleAttribute('data-over', runs)
      if (runs) n++
    }
    setOver(n)
  })
  return (
    <div className="min-h-dvh bg-[#2a2a2a] print:bg-white">
      <style>{`${PAGES} @media print { .sheet { break-after: page; } .sheet-print { gap: 0 !important; padding: 0 !important; } } @media screen { .blank-leaf { opacity: 0.35; } .sheet[data-over] { box-shadow: inset 0 -1.2mm 0 #a9513f; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-black/20 bg-[#fff8ee] px-4 py-2 text-[13px] text-[#111]">
        <span className="font-medium">{title}</span>
        <span className="text-ink-3">{t('sheets.count', { count: sheets.length })}</span>
        <Option checked={bw} onChange={setBlackWhite}>{t('sheets.blackWhite')}</Option>
        {over > 0 && <span className="font-medium text-[#7c2d54]">{t('sheets.printOverflow', { count: over })}</span>}
        <Button size="sm" variant="primary" className="ml-auto" disabled={!sheets.length} onClick={() => window.print()}>
          <Printer size={13} />
          {t('print.print')}
        </Button>
      </div>
      {!sheets.length && <p className="p-8 text-white/80">{t(job ? 'sheets.printNoJob' : 'sheets.printEmpty')}</p>}
      <div ref={pagesRef} className="sheet-print flex flex-col items-center gap-6 py-6 print:block">
        {sheets.map((sheet, i) => (
          <PrintedSheet key={sheet.id} sheet={sheet} theme={brand.theme} logo={brand.logo} facts={facts(data.items.find((it) => (it.worksheets ?? []).some((w) => w.id === sheet.id)))} workshopId={data.workshop.id} newLeaf={!!job?.duplex && i < sheets.length - 1} look={look} bw={bw} />
        ))}
      </div>
    </div>
  )
}

/** One sheet's pages; in a two-sided job an empty page after an odd number, so the next sheet starts on a new leaf (none after the last). */
function PrintedSheet({ sheet, theme, logo, facts, workshopId, newLeaf, look, bw }: { facts?: string; sheet: Worksheet; theme: string; logo: string | null; workshopId: string; newLeaf: boolean; look: PaperLook; bw: boolean }) {
  const chrome = useSheetChrome(sheet, logo, facts)
  const blank = newLeaf && sheet.pages.length % 2 === 1 ? '<section class="sheet blank-leaf"></section>' : ''
  const html = sheet.pages.map((p, i) => hostSheetHtml(p.html, { workshopId }, chrome(i + 1), look)).join('') + blank
  const frame = paperFrame(sheet.paper, look, bw)
  return <div className={`${frame.className} flex flex-col gap-6 print:block`} style={frame.style} data-theme={theme} dangerouslySetInnerHTML={{ __html: html }} />
}
