import { useTranslation } from 'react-i18next'
import { Copy, Download, Printer } from 'lucide-react'
import { PRINT_CHOICES, PRINT_VARIANTS, type PrintOptions, type PrintVariant } from '@/domain/print'
import { cx } from '@/components/ui'
import { VARIANT_LABEL } from './options'

// The colours of src/index.css in their light values, fixed: the print views are light whatever the app's appearance.
const base = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold'
const btn = `${base} border-[#dccdb6] bg-white text-[#12382f] hover:bg-[#f6ecdd]`
const primary = `${base} border-transparent bg-[#c94a0c] text-white hover:bg-[#b3420b]`

/** Above the sheet, never printed: the view, its switches, print and Markdown. Always light, like the sheet. */
export function Toolbar({
  variant,
  onVariant,
  options,
  update,
  reset,
  changed,
  onPrint,
  onCopy,
  onDownload,
  copied,
  logoSource,
  themeName,
}: {
  variant: PrintVariant
  onVariant: (v: PrintVariant) => void
  options: PrintOptions
  update: (patch: Partial<PrintOptions>) => void
  reset: () => void
  changed: boolean
  onPrint: () => void
  onCopy: () => void
  onDownload: () => void
  copied: boolean
  /** Where the logo in the head comes from, and the name of the workshop's theme, shown beside the switches. */
  logoSource: 'theme' | 'owner' | null
  themeName: string
}) {
  const { t } = useTranslation()
  const choices = PRINT_CHOICES[variant]
  return (
    <div className="no-print sticky top-0 z-10 border-b border-black/10 bg-[#fff8ee]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[297mm] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div role="tablist" className="inline-flex rounded-full border border-[#dccdb6] bg-white p-0.5 text-[13px]">
          {PRINT_VARIANTS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={v === variant} onClick={() => onVariant(v)} className={cx('rounded-full px-3 py-1 whitespace-nowrap', v === variant ? 'bg-[#12382f] font-semibold text-[#fff8ee]' : 'text-[#6b6358] hover:text-black')}>
              {t(VARIANT_LABEL[v])}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn} onClick={onCopy}>
            <Copy size={14} />
            {copied ? t('print.copied') : t('print.copyMarkdown')}
          </button>
          <button type="button" className={btn} onClick={onDownload}>
            <Download size={14} />
            {t('print.downloadMarkdown')}
          </button>
          <button type="button" className={primary} onClick={onPrint}>
            <Printer size={14} />
            {t('print.print')}
          </button>
        </div>
        {choices.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-black/80">
            {choices.map((k) => {
              // A legend explains the bars: without them there is nothing to explain.
              const off = k === 'legend' && !options.colorBars
              return (
                <label key={k} className={cx('inline-flex items-center gap-1.5 whitespace-nowrap', off ? 'text-black/40' : 'cursor-pointer')}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#c94a0c]" checked={options[k] && !off} disabled={off} onChange={(e) => update({ [k]: e.target.checked })} />
                  {t(`print.options.${k}`)}
                </label>
              )
            })}
            {changed && (
              <button type="button" className="text-[12px] text-black/55 underline underline-offset-2 hover:text-black" onClick={reset}>
                {t('print.reset')}
              </button>
            )}
          </div>
        )}
        <p className="w-full text-[11.5px] text-black/50">
          {t(`print.logoSource.${logoSource ?? 'none'}`, { theme: themeName })} {t('print.hint')}
        </p>
      </div>
    </div>
  )
}
