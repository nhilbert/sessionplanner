import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui'
import { themeLabel, useThemes } from '@/store/useThemes'

/**
 * The slide themes the server has (built in, folders in data/themes, themes kept as data), by name. Without
 * `withDefault` (the settings) the built-in theme is stored as '' and 'default' means the same; with it (a workshop)
 * '' follows the settings. The list is asked for again whenever the choice is shown (a theme folder may have been
 * added); the last list shows meanwhile.
 */
export function ThemeSelect({ value, onChange, withDefault, className }: { value: string; onChange: (theme: string) => void; withDefault?: boolean; className?: string }) {
  const { t } = useTranslation()
  const { themes, load } = useThemes()
  useEffect(() => {
    void load(true)
  }, [load])
  const shown = !withDefault && value === 'default' ? '' : value
  // A theme chosen before it went away (deleted, folder removed) still shows as chosen, so it can be changed.
  const gone = !!shown && shown !== 'default' && !themes.some((x) => x.id === shown)
  return (
    <Select value={shown} onChange={(e) => onChange(e.target.value)} className={className ?? 'h-8 w-auto text-[13px]'} aria-label={t('slides.theme')}>
      {withDefault && <option value="">{t('slides.themeDefault')}</option>}
      {themes.map((info) => (
        <option key={info.id} value={info.id === 'default' && !withDefault ? '' : info.id}>
          {themeLabel(info, info.id, t)}
        </option>
      ))}
      {gone && <option value={shown}>{shown}</option>}
    </Select>
  )
}
