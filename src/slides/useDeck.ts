import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { useSettings } from '@/store/useSettings'
import { usePool } from '@/store/useThemes'
import { themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { useDeckOptions } from './deckOptions'

/** A workshop's deck as presented, printed and saved: the slides in agenda order with the generated ones, its theme, and the deck options of this device. */
export function useDeck(data: WorkshopState | null) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const [options, update] = useDeckOptions()
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')
  const pool = usePool(theme)
  const pictures = useMemo(() => pool.filter((e) => e.kind === 'picture').map((e) => e.hash), [pool])
  const deck = useMemo(() => (data ? deckOf(data, deckLabels(t), options, pictures) : []), [data, t, options, pictures])
  return { deck, theme, options, update, pictures }
}
