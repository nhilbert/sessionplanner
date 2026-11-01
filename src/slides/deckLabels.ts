import type { TFunction } from 'i18next'
import type { DeckLabels } from '@/domain/deck'
import { formatDate } from '@/i18n'
import { LONG_DATE } from '@/print/common'

/** The generated slides' words in the UI's language. */
export const deckLabels = (t: TFunction): DeckLabels => ({
  untitled: t('workshops.untitled'),
  day: (n) => t('slides.generated.day', { n }),
  agenda: t('slides.generated.agenda'),
  breakTitle: t('slides.generated.break'),
  until: (time) => t('slides.until', { time }),
  minutes: (n) => t('slides.minutes', { count: n }),
  date: (date) => formatDate(date, LONG_DATE),
})
