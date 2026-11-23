import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssetScope } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { cx } from '@/components/ui'
import { SlideView } from './SlideView'

/**
 * All slides of the deck at a glance, as PowerPoint's "See all slides" in its presenter view (docs/slides.md): the
 * presenter view shows it in place of the current and next slide. The slide shown is marked with a fill and lies in
 * view, with the focus on it; a click (or Enter) on another moves the presentation there.
 */
export function SlideOverview({ deck, at, theme, scope, title, onPick }: { deck: DeckSlideRef[]; at: number; theme: string; scope: AssetScope; title: string; onPick: (n: number) => void }) {
  const { t } = useTranslation()
  const current = useRef<HTMLLIElement>(null)
  useLayoutEffect(() => {
    const li = current.current
    if (!li) return
    li.scrollIntoView?.({ block: 'center' })
    li.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true })
    // Only when the overview opens: paging from elsewhere meanwhile moves the mark, not the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!deck.length) return <p className="p-4 text-ink-3">{t('slides.deckEmpty')}</p>
  return (
    <ol aria-label={t('slides.overview')} className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {deck.map((s, i) => {
        const on = i === at
        return (
          <li key={s.key} ref={on ? current : undefined} aria-current={on ? 'true' : undefined} className={cx('min-w-0 rounded-[10px] p-1.5', on && 'bg-accent-soft')}>
            <SlideView html={s.html} theme={theme} scope={scope} chrome={{ label: title, n: i + 1, part: s.part && t('slides.part', s.part) }} onClick={() => onPick(i)} label={t('slides.slide', { n: i + 1 })} className="w-full" />
            <div className={cx('mt-1 flex gap-1 truncate text-[12px]', on ? 'font-medium text-accent-strong' : s.generated ? 'text-ink-3' : 'text-ink-2')}>
              <span className="tnum">{i + 1}</span>
              <span className="truncate">{s.generated ? t(`slides.generated.${s.generated}`, { n: '' }).trim() : s.caption}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
