import { useTranslation } from 'react-i18next'
import { Copy, Download, Printer } from 'lucide-react'
import { PRINT_CHOICES, type PrintOptions, type PrintVariant } from '@/domain/print'
import { cx } from '@/components/ui'

const VARIANTS: PrintVariant[] = ['overview', 'plan', 'agenda', 'packing']
const VARIANT_LABEL = { overview: 'planner.printOverview', plan: 'planner.printPlan', agenda: 'planner.printAgenda', packing: 'planner.printPacking' } as const

const base = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium'
const btn = `${base} border-black/15 bg-white text-black hover:bg-[#f1f0ec]`
const primary = `${base} border-transparent bg-[#4f6f5f] text-white hover:bg-[#44604f]`

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
}) {
  const { t } = useTranslation()
  const choices = PRINT_CHOICES[variant]
  return (
    <div className="no-print sticky top-0 z-10 border-b border-black/10 bg-[#f7f6f2]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[297mm] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div role="tablist" className="inline-flex rounded-lg border border-black/15 bg-white p-0.5 text-[13px]">
          {VARIANTS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={v === variant} onClick={() => onVariant(v)} className={cx('rounded-md px-2.5 py-1 whitespace-nowrap', v === variant ? 'bg-[#e9e6df] font-medium text-black' : 'text-black/60 hover:text-black')}>
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
            {choices.map((k) => (
              <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[#4f6f5f]" checked={options[k]} onChange={(e) => update({ [k]: e.target.checked })} />
                {t(`print.options.${k}`)}
              </label>
            ))}
            {changed && (
              <button type="button" className="text-[12px] text-black/55 underline underline-offset-2 hover:text-black" onClick={reset}>
                {t('print.reset')}
              </button>
            )}
          </div>
        )}
        <p className="w-full text-[11.5px] text-black/50">{t('print.hint')}</p>
      </div>
    </div>
  )
}
