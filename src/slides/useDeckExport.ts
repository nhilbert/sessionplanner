import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { pageUrl } from '@/domain/addresses'
import { reportFailure } from '@/api'
import { useSettings } from '@/store/useSettings'
import { themeTitleNow, useDeckPool } from '@/store/useThemes'
import { usePlanner } from '@/store/usePlanner'
import { downloadBlob, fileSlug } from '@/print/options'
import { themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { useDeckOptions } from './deckOptions'
import { exportDeckHtml } from './export'
import { exportDeckPptx } from './pptx'
import { exportDeckPdf } from './pdf'

export type DeckFormat = 'pptx' | 'pdf' | 'html'

/**
 * Saving a workshop's deck as PowerPoint, PDF or one HTML file, from wherever the workshop's output is offered (the
 * header's output menu). The deck is put together when it is saved, from the workshop as it stands then, so holding
 * this hook costs nothing while the agenda is edited.
 */
export function useDeckExport(data: WorkshopState) {
  const { t, i18n } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const [options] = useDeckOptions()
  const theme = useTheme(themeOf(data.workshop, settings))
  const pool = useDeckPool(theme)
  const [progress, setProgress] = useState<{ kind: DeckFormat; done: number; of: number } | null>(null)

  const save = async (kind: DeckFormat) => {
    if (progress) return
    const state = usePlanner.getState().data ?? data
    const deck = deckOf(state, deckLabels(t), options, pool, themeTitleNow(theme))
    const title = state.workshop.title || t('workshops.untitled')
    const common = { title, theme, scope: { workshopId: state.workshop.id }, chrome: title, lang: i18n.language, part: (p: { n: number; of: number }) => t('slides.part', p) }
    setProgress({ kind, done: 0, of: deck.length })
    const onProgress = (done: number, of: number) => setProgress({ kind, done, of })
    try {
      if (kind === 'html') downloadBlob(`${fileSlug(title)}-folien.html`, await exportDeckHtml(deck, common))
      else if (kind === 'pdf') downloadBlob(`${fileSlug(title)}-folien.pdf`, await exportDeckPdf(deck, { ...common, onProgress }))
      else downloadBlob(`${fileSlug(title)}-folien.pptx`, await exportDeckPptx(deck, { ...common, onProgress }))
    } catch (err) {
      // a browser that will not hand out the drawn slides (a tainted canvas): the print view makes the PDF instead
      if (kind === 'pdf' && err instanceof DOMException && err.name === 'SecurityError') window.open(pageUrl(`/w/${state.workshop.id}/print/slides`), '_blank', 'noopener')
      else reportFailure(err)
    } finally {
      setProgress(null)
    }
  }
  return { save, progress }
}
