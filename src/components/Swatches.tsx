import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { PALETTE, type PaletteKey } from '@/domain/types'
import { cx } from './ui'

/** The muted palette as small dots; `allowNone` adds "no own colour" in front. */
export default function Swatches({ value, onChange, allowNone }: { value: PaletteKey | null; onChange: (v: PaletteKey | null) => void; allowNone?: boolean }) {
  const { t } = useTranslation()
  const dot = (key: PaletteKey | null) => (
    <button
      key={key ?? 'none'}
      type="button"
      title={key ? t(`colors.${key}`) : t('colors.none')}
      aria-label={key ? t(`colors.${key}`) : t('colors.none')}
      aria-pressed={value === key}
      onClick={() => onChange(key)}
      style={{ background: key ? `var(--c-${key})` : undefined }}
      className={cx(
        'inline-flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 pointer-coarse:h-7 pointer-coarse:w-7',
        !key && 'border border-dashed border-line-2',
        value === key && 'ring-2 ring-ink/30 ring-offset-1 ring-offset-surface',
      )}
    >
      {value === key && key && <Check size={11} strokeWidth={3} className="text-white" />}
    </button>
  )
  return <div className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2.5">{[...(allowNone ? [null] : []), ...PALETTE].map(dot)}</div>
}
