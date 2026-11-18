import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isLandscape, normalizeSheetHtml } from '@/domain/sheets'
import { esc, renderSlideHtml } from '@/domain/slides'
import { workshopBrand } from '@/domain/theme'
import type { Paper, Worksheet } from '@/domain/types'
import { type AssetScope, api, assetUrl } from '@/api'
import { cx } from '@/components/ui'
import { useSettings } from '@/store/useSettings'
import { useThemes } from '@/store/useThemes'
import { useTheme } from '@/slides/SlideView'
import './sheets.css'

/**
 * Worksheet pages in the app (docs/worksheets.md, stage 2): sanitised again, pictures resolved, the host's footer
 * added – the date of the sheet's last change, the page number on sheets of several pages, the logo of the
 * workshop's theme – and scaled to the frame they stand in. Sizes are millimetres of the paper; at 96 dpi.
 */

const MM = 96 / 25.4
const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420], A5: [148, 210] }

/** The page's size in px at 96 dpi, turned for landscape pages. */
export function pageSize(paper: Paper, landscape: boolean): { w: number; h: number } {
  const [a, b] = PAPER_MM[paper] ?? PAPER_MM.A4
  return landscape ? { w: b * MM, h: a * MM } : { w: a * MM, h: b * MM }
}

export interface SheetChrome {
  /** "Stand 18.11.2026" */
  date: string
  n: number
  total: number
  logo: string | null
}

export function hostSheetHtml(html: string, scope: AssetScope, chrome?: SheetChrome): string {
  let out = renderSlideHtml(normalizeSheetHtml(html), (hash) => assetUrl(scope, hash, 'light'))
  if (chrome) {
    const foot = `<div class="sheet-foot"><span class="date">${esc(chrome.date)}</span>${chrome.total > 1 ? `<span class="page">${chrome.n}/${chrome.total}</span>` : ''}${chrome.logo ? `<img src="${esc(chrome.logo)}" alt="">` : '<span></span>'}</div>`
    const at = out.lastIndexOf('</section>')
    out = at === -1 ? out + foot : out.slice(0, at) + foot + out.slice(at)
  }
  return out
}

/** The theme and logo sheets are printed with: the workshop's (or, in the library, the settings' default) and its printout logo. */
export function useSheetBrand(workshopTheme: string): { theme: string; logo: string | null } {
  const settings = useSettings((s) => s.settings)
  const themes = useThemes((s) => s.themes)
  const brand = workshopBrand(workshopTheme, settings.theme, themes, api.logoUrl(settings))
  return { theme: brand.theme, logo: brand.logo }
}

/** "Stand 18.11.2026": when a sheet was last changed. */
export function useSheetDate(): (iso: string) => string {
  const { t, i18n } = useTranslation()
  return (iso: string) => {
    const d = new Date(iso)
    const date = Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    return t('sheets.asOf', { date })
  }
}

/** The chrome of each page of a sheet. */
export function useSheetChrome(sheet: Worksheet, logo: string | null): (n: number) => SheetChrome {
  const date = useSheetDate()(sheet.updatedAt)
  return (n: number) => ({ date, n, total: sheet.pages.length, logo })
}

/**
 * One page in a frame that scales it to the frame's width: a thumbnail, a page in the viewer. The frame keeps the
 * page's proportions; nothing in the page knows about its size.
 */
export function SheetPage({ html, paper, theme, scope, chrome, className, onClick, label }: { html: string; paper: Paper; theme: string; scope: AssetScope; chrome?: SheetChrome; className?: string; onClick?: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useTheme(theme)
  const scopeKey = scope === 'library' ? 'library' : scope.workshopId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rendered = useMemo(() => hostSheetHtml(html, scope, chrome), [html, scopeKey, chrome?.date, chrome?.n, chrome?.total, chrome?.logo])
  const size = pageSize(paper, isLandscape(normalizeSheetHtml(html)))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = width / size.w
  const button = !!onClick
  return (
    <div
      ref={ref}
      className={cx('relative w-full overflow-hidden bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.08)]', button && 'cursor-zoom-in', className)}
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
      onClick={onClick}
      onKeyDown={button ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick?.()) : undefined}
      role={button ? 'button' : undefined}
      tabIndex={button ? 0 : undefined}
      aria-label={label}
    >
      <div className={cx('absolute left-0 top-0 origin-top-left', `paper-${paper.toLowerCase()}`)} data-theme={theme} style={{ transform: `scale(${scale || 0.0001})` }} dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}
