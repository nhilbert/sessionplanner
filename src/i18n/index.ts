import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Locale } from '@/domain/types'
import en from './en.json'
import de from './de.json'

export const resources = { en: { translation: en }, de: { translation: de } } as const

const KEY = 'sp.locale'

/** The language chosen on this device, else the browser's. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'de' || saved === 'en') return saved
  } catch {
    /* storage blocked */
  }
  return (navigator.language ?? 'en').toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function setupI18n(locale: Locale) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  document.documentElement.lang = locale
}

export function changeLocale(locale: Locale) {
  void i18n.changeLanguage(locale)
  document.documentElement.lang = locale
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    /* not remembered */
  }
}

/** Long date in the current language, e.g. "Tue, 10 Nov 2026" / "Di., 10. Nov. 2026". */
export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(i18n.language, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** A span of days in the current language, written once where both ends share it ("24.–25.11.2026"); one day where it is one. */
export function formatDateRange(first: string, last: string | null, opts: Intl.DateTimeFormatOptions): string {
  const at = (date: string) => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  const format = new Intl.DateTimeFormat(i18n.language, { ...opts, timeZone: 'UTC' })
  return !last || last === first ? format.format(at(first)) : format.formatRange(at(first), at(last))
}

export default i18n
