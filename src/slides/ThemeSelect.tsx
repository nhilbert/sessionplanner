import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { Select } from '@/components/ui'

let known: string[] | null = null

/** The slide themes the server has (data/themes), with the built-in default. */
export function ThemeSelect({ value, onChange, withDefault, className }: { value: string; onChange: (theme: string) => void; withDefault?: boolean; className?: string }) {
  const { t } = useTranslation()
  const [themes, setThemes] = useState<string[]>(known ?? ['default'])
  useEffect(() => {
    if (known) return
    api.listThemes().then((list) => {
      known = list
      setThemes(list)
    }, () => undefined)
  }, [])
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? 'h-8 w-auto text-[13px]'} aria-label={t('slides.theme')}>
      {withDefault && <option value="">{t('slides.themeDefault')}</option>}
      {themes.map((name) => (
        <option key={name} value={name === 'default' && !withDefault ? '' : name}>
          {name === 'default' ? t('slides.themeBuiltIn') : name}
        </option>
      ))}
    </Select>
  )
}
