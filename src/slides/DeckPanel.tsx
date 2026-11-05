import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Download, FileText, MonitorSpeaker, Play, Presentation, Printer, Shuffle } from 'lucide-react'
import type { WorkshopState } from '@/domain/types'
import type { Op } from '@/domain/ops'
import { reportFailure } from '@/api'
import { Button, cx } from '@/components/ui'
import { Option } from './Option'
import { downloadBlob, fileSlug } from '@/print/options'
import { SlideView } from './SlideView'
import { exportDeckHtml } from './export'
import { exportDeckPptx } from './pptx'
import { exportDeckPdf } from './pdf'
import { useDeck } from './useDeck'
import { ThemeSelect } from './ThemeSelect'
import { useSlideEditing } from './PlannerSlides'
import { pageUrl } from '@/domain/addresses'

/**
 * The whole deck in agenda order, with the generated slides; present, save as a file, print; the workshop's theme.
 * A slide opens the editor on the deck (generated slides read-only, with what can be done instead).
 */
export function DeckPanel({ data, change, owner }: { data: WorkshopState; change: (ops: Op[]) => void; owner: boolean }) {
  const { t, i18n } = useTranslation()
  const { deck, theme, options, update, pictures } = useDeck(data)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ kind: 'pptx' | 'pdf'; done: number; of: number } | null>(null)
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
  const common = { title, theme, scope, chrome: title, lang: i18n.language, part: (p: { n: number; of: number }) => t('slides.part', p) }
  const save = async (kind: 'html' | 'pptx' | 'pdf') => {
    setBusy(true)
    const onProgress = (done: number, of: number) => kind !== 'html' && setProgress({ kind, done, of })
    try {
      if (kind === 'html') downloadBlob(`${fileSlug(title)}-folien.html`, await exportDeckHtml(deck, common))
      else if (kind === 'pdf') downloadBlob(`${fileSlug(title)}-folien.pdf`, await exportDeckPdf(deck, { ...common, onProgress }))
      else downloadBlob(`${fileSlug(title)}-folien.pptx`, await exportDeckPptx(deck, { ...common, onProgress }))
    } catch (err) {
      // a browser that will not hand out the drawn slides (a tainted canvas): the print view makes the PDF instead
      if (kind === 'pdf' && err instanceof DOMException && err.name === 'SecurityError') window.open(pageUrl(`/w/${data.workshop.id}/print/slides`), '_blank', 'noopener')
      else reportFailure(err)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/present`), '_blank', 'noopener')} disabled={!deck.length}>
          <Play size={13} />
          {t('slides.present')}
        </Button>
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/presenter`), '_blank', 'noopener')} disabled={!deck.length}>
          <MonitorSpeaker size={13} />
          {t('slides.presenter')}
        </Button>
        <Button size="sm" onClick={() => window.open(pageUrl(`/w/${data.workshop.id}/print/slides`), '_blank', 'noopener')} disabled={!deck.length}>
          <Printer size={13} />
          {t('slides.printSlides')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save('pptx')} disabled={!deck.length || busy}>
          <Presentation size={13} />
          {progress?.kind === 'pptx' ? t('slides.exporting', progress) : t('slides.downloadPptx')}
        </Button>
        <Button size="sm" onClick={() => void save('pdf')} disabled={!deck.length || busy}>
          <FileText size={13} />
          {progress?.kind === 'pdf' ? t('slides.exporting', progress) : t('slides.downloadPdf')}
        </Button>
        <Button size="sm" onClick={() => void save('html')} disabled={!deck.length || busy}>
          <Download size={13} />
          {t('slides.downloadHtml')}
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">{t('slides.exportHint')}</p>
      {owner && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-2">{t('slides.deckTheme')}</span>
          <ThemeSelect value={data.workshop.theme} onChange={(theme) => change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { theme } }])} withDefault />
          <ManageThemes />
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Option checked={options.agenda} onChange={(agenda) => update({ agenda })}>{t('slides.withAgenda')}</Option>
        <Option checked={options.breaks} onChange={(breaks) => update({ breaks })}>{t('slides.withBreaks')}</Option>
        {pictures.length > 0 && (
          <>
            <Option checked={options.pictures} onChange={(pictures) => update({ pictures })}>{t('slides.withPictures')}</Option>
            {options.pictures && pictures.length > 1 && (
              <button type="button" onClick={() => update({ shift: (options.shift ?? 0) + 1 })} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                <Shuffle size={13} />
                {t('slides.otherPictures')}
              </button>
            )}
          </>
        )}
      </div>
      {!deck.some((s) => !s.generated) && <p className="text-[13px] text-ink-3">{t('slides.deckEmpty')}</p>}
      <ol className="grid grid-cols-2 gap-2">
        {deck.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <SlideView html={s.html} theme={theme} scope={scope} chrome={{ label: title, n: i + 1, part: s.part && t('slides.part', s.part) }} onClick={() => useSlideEditing.getState().open({ kind: 'deck', key: s.key })} label={t('slides.slide', { n: i + 1 })} />
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

/** The link that sits next to every theme choice. */
export function ManageThemes() {
  const { t } = useTranslation()
  return (
    <Link to="/slides/themes" className="text-[12px] text-ink-3 hover:text-ink hover:underline">
      {t('themes.manage')}
    </Link>
  )
}
