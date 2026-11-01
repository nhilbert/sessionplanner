import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { useSettings } from '@/store/useSettings'
import { Button, Checkbox } from '@/components/ui'
import { SlideStage, themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { useDeckOptions } from './deckOptions'

/** The deck on 16:9 pages, one slide each: the browser's print makes the PDF. */
export default function SlidesPrint({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const theme = useTheme(themeOf(data.workshop, settings))
  const [options, update] = useDeckOptions()
  const deck = useMemo(() => deckOf(data, deckLabels(t), options), [data, t, options])
  const title = data.workshop.title || t('workshops.untitled')
  useEffect(() => {
    document.title = `${title} – ${t('slides.title')}`
  }, [title, t])
  return (
    <div className="min-h-dvh bg-[#2a2a2a] print:bg-white">
      <style>{'@page { size: 338.667mm 190.5mm; margin: 0; } @media print { .slide-page { page-break-after: always; break-after: page; } }'}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-black/20 bg-[#f3f1ec] px-4 py-2 text-[13px] text-[#111]">
        <span className="font-medium">{t('slides.printSlides')}</span>
        <Checkbox checked={options.agenda} onChange={(agenda) => update({ agenda })} label={t('slides.withAgenda')} />
        <Checkbox checked={options.breaks} onChange={(breaks) => update({ breaks })} label={t('slides.withBreaks')} />
        <span className="text-ink-3">{t('slides.count', { count: deck.length })}</span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => window.print()}>
          <Printer size={13} />
          {t('print.print')}
        </Button>
      </div>
      <div className="mx-auto flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:py-0">
        {deck.map((s, i) => (
          <div key={s.key} className="slide-page h-[720px] w-[1280px] overflow-hidden bg-black print:h-[190.5mm] print:w-[338.667mm]">
            <SlideStage html={s.html} theme={theme} scope={{ workshopId: data.workshop.id }} chrome={{ label: title, n: i + 1 }} scale={1} />
          </div>
        ))}
      </div>
    </div>
  )
}
