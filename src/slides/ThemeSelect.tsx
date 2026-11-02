import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { Select } from '@/components/ui'

/** The last list the server gave, shown at once while it is asked again (a theme folder may have been added). */
let known: string[] | null = null

/**
 * The slide themes the server has (data/themes), with the built-in default. Without `withDefault` (the settings)
 * the built-in theme is stored as '' and 'default' means the same; with it (a workshop) '' follows the settings.
 */
export function ThemeSelect({ value, onChange, withDefault, className }: { value: string; onChange: (theme: string) => void; withDefault?: boolean; className?: string }) {
  const { t } = useTranslation()
  const [themes, setThemes] = useState<string[]>(known ?? ['default'])
  useEffect(() => {
    let live = true
    api.listThemes().then(
      (list) => {
        known = list
        if (live) setThemes(list)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [])
  const shown = !withDefault && value === 'default' ? '' : value
  // A theme chosen before its folder went away still shows as chosen.
  const names = shown && shown !== 'default' && !themes.includes(shown) ? [...themes, shown] : themes
  return (
    <Select value={shown} onChange={(e) => onChange(e.target.value)} className={className ?? 'h-8 w-auto text-[13px]'} aria-label={t('slides.theme')}>
      {withDefault && <option value="">{t('slides.themeDefault')}</option>}
      {names.map((name) => (
        <option key={name} value={name === 'default' && !withDefault ? '' : name}>
          {name === 'default' ? t('slides.themeBuiltIn') : name}
        </option>
      ))}
    </Select>
  )
}
