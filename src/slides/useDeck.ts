import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { useSettings } from '@/store/useSettings'
import { poolOfKind } from '@/domain/pool'
import { useDeckPool, useThemeTitle } from '@/store/useThemes'
import { themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { useDeckOptions } from './deckOptions'

/** A workshop's deck as presented, printed and saved: the slides in agenda order with the generated ones, its theme, and the deck options of this device. */
export function useDeck(data: WorkshopState | null) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const [options, update] = useDeckOptions()
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')
  const pool = useDeckPool(theme)
  // what a break slide made on the spot takes: the kind the deck's break slides show
  const pictures = useMemo(() => poolOfKind(pool, pool.whole ? 'illustration' : 'picture'), [pool])
  const title = useThemeTitle(theme)
  const deck = useMemo(() => (data ? deckOf(data, deckLabels(t), options, pool, title) : []), [data, t, options, pool, title])
  return { deck, theme, options, update, pool, pictures, title }
}
