import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui'
import { themeLabel, useThemes } from '@/store/useThemes'

/** The slide themes the server has (built in, folders in data/themes, themes kept as data), by name. */
export function ThemeSelect({ value, onChange, withDefault, className }: { value: string; onChange: (theme: string) => void; withDefault?: boolean; className?: string }) {
  const { t } = useTranslation()
  const { themes, load } = useThemes()
  useEffect(() => {
    void load()
  }, [load])
  // A theme that is gone (deleted, folder removed) still shows, so the choice is visible and can be changed.
  const known = themes.some((x) => x.id === value) || !value || value === 'default'
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? 'h-8 w-auto text-[13px]'} aria-label={t('slides.theme')}>
      {withDefault && <option value="">{t('slides.themeDefault')}</option>}
      {themes.map((info) => (
        <option key={info.id} value={info.id === 'default' && !withDefault ? '' : info.id}>
          {themeLabel(info, info.id, t)}
        </option>
      ))}
      {!known && <option value={value}>{value}</option>}
    </Select>
  )
}
