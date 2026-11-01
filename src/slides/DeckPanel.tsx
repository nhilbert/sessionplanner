import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, MonitorSpeaker, Play, Printer } from 'lucide-react'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { useSettings } from '@/store/useSettings'
import { Button, Checkbox, cx } from '@/components/ui'
import { fileSlug } from '@/print/options'
import { SlideView, themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { downloadBlob, exportDeckHtml } from './export'
import { useDeckOptions } from './deckOptions'

/** The whole deck in agenda order, with the generated slides; present, save as a file, print. */
export function DeckPanel({ data, onSelect }: { data: WorkshopState; onSelect: (itemId: string) => void }) {
  const { t, i18n } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const theme = useTheme(themeOf(data.workshop, settings))
  const [options, update] = useDeckOptions()
  const [busy, setBusy] = useState(false)
  const deck = useMemo(() => deckOf(data, deckLabels(t), options), [data, t, options])
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
  const save = async () => {
    setBusy(true)
    try {
      downloadBlob(`${fileSlug(title)}-folien.html`, await exportDeckHtml(deck, { title, theme, scope, chrome: title, lang: i18n.language }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => window.open(`/w/${data.workshop.id}/present`, '_blank', 'noopener')} disabled={!deck.length}>
          <Play size={13} />
          {t('slides.present')}
        </Button>
        <Button size="sm" onClick={() => window.open(`/w/${data.workshop.id}/presenter`, '_blank', 'noopener')} disabled={!deck.length}>
          <MonitorSpeaker size={13} />
          {t('slides.presenter')}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={!deck.length || busy}>
          <Download size={13} />
          {t('slides.downloadHtml')}
        </Button>
        <Button size="sm" onClick={() => window.open(`/w/${data.workshop.id}/print/slides`, '_blank', 'noopener')} disabled={!deck.length}>
          <Printer size={13} />
          {t('slides.printSlides')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Checkbox checked={options.agenda} onChange={(agenda) => update({ agenda })} label={t('slides.withAgenda')} />
        <Checkbox checked={options.breaks} onChange={(breaks) => update({ breaks })} label={t('slides.withBreaks')} />
      </div>
      {!deck.some((s) => !s.generated) && <p className="text-[13px] text-ink-3">{t('slides.deckEmpty')}</p>}
      <ol className="grid grid-cols-2 gap-2">
        {deck.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <SlideView html={s.html} theme={theme} scope={scope} chrome={{ label: title, n: i + 1 }} onClick={s.itemId ? () => onSelect(s.itemId!) : undefined} label={t('slides.slide', { n: i + 1 })} />
            <div className={cx('mt-0.5 flex gap-1 truncate text-[11px]', s.generated ? 'text-ink-3' : 'text-ink-2')}>
              <span className="tnum">{i + 1}</span>
              <span className="truncate">{s.generated ? t(`slides.generated.${s.generated}`, { n: '' }).trim() : s.caption}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
