import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, useLocalState } from '@/components/ui'
import { themeLabel, useThemes } from '@/store/useThemes'

/**
 * The slide themes the server has (built in, folders in data/themes, themes kept as data), by name. Without
 * `withDefault` (the settings) the built-in theme is stored as '' and 'default' means the same; with it (a workshop)
 * '' follows the settings. The list is asked for again whenever the choice is shown (a theme folder may have been
 * added); the last list shows meanwhile.
 */
export function ThemeSelect({ value, onChange, withDefault, defaultLabel, className }: { value: string; onChange: (theme: string) => void; withDefault?: boolean; /** What '' means here, when it isn't the settings. */ defaultLabel?: string; className?: string }) {
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
      {withDefault && <option value="">{defaultLabel ?? t('slides.themeDefault')}</option>}
      {themes.map((info) => (
        <option key={info.id} value={info.id === 'default' && !withDefault ? '' : info.id}>
          {themeLabel(info, info.id, t)}
        </option>
      ))}
      {gone && <option value={shown}>{shown}</option>}
    </Select>
  )
}

/**
 * The theme a page shows its slides in, for looking only (the slides and their decks keep theirs), remembered per
 * device; '' is the page's usual theme. A theme that went away falls back to it.
 */
export function useViewTheme(key: string): [string, (theme: string) => void] {
  const [value, set] = useLocalState(key, '')
  const { themes, loaded } = useThemes()
  const gone = !!value && loaded && !themes.some((x) => x.id === value)
  return [gone ? '' : value, set]
}

/** The choice of that theme, with its label, for a page header. */
export function ViewThemeSelect({ value, onChange, defaultLabel }: { value: string; onChange: (theme: string) => void; defaultLabel?: string }) {
  const { t } = useTranslation()
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="text-ink-3">{t('slides.viewIn')}</span>
      <ThemeSelect value={value} onChange={onChange} withDefault defaultLabel={defaultLabel} />
    </label>
  )
}
