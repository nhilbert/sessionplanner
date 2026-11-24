import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssetScope } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { cx } from '@/components/ui'
import { SlideView } from './SlideView'

/**
 * All slides of the deck at a glance, as PowerPoint's "See all slides" in its presenter view (docs/slides.md): the
 * presenter view shows it in place of the current and next slide. The slide shown is marked with a fill and lies in
 * the middle of the view, with the focus on it; the arrow keys move the focus through the grid (Home and End to the
 * first and last), a click or Enter on a slide moves the presentation there. The overview scrolls only its own box,
 * never the page around it, so nothing stays scrolled once it closes.
 */
export function SlideOverview({ deck, at, theme, scope, title, onPick, htmlOf = (s) => s.html }: { deck: DeckSlideRef[]; at: number; theme: string; scope: AssetScope; title: string; onPick: (n: number) => void; /** The slide as shown, e.g. a break with its live line. */ htmlOf?: (s: DeckSlideRef) => string }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLOListElement>(null)
  const cell = (i: number) => grid.current?.children[i] as HTMLElement | undefined
  // Moves the box so the slide lies in it: in the middle when the overview opens, at the nearest edge while stepping.
  const reveal = (li: HTMLElement, middle: boolean) => {
    const b = box.current
    if (!b) return
    const r = li.getBoundingClientRect()
    const v = b.getBoundingClientRect()
    if (middle) b.scrollTop += r.top - v.top - (v.height - r.height) / 2
    else if (r.top < v.top) b.scrollTop += r.top - v.top - 8
    else if (r.bottom > v.bottom) b.scrollTop += r.bottom - v.bottom + 8
  }
  const focus = (i: number, middle = false) => {
    const li = cell(i)
    if (!li) return
    reveal(li, middle)
    li.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    focus(at, true)
    // Only when the overview opens: paging from elsewhere meanwhile moves the mark, not the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const key = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const ol = grid.current
    if (!ol) return
    const columns = getComputedStyle(ol).gridTemplateColumns.split(' ').length
    const li = (document.activeElement as HTMLElement | null)?.closest('li')
    const from = li && li.parentElement === ol ? [...ol.children].indexOf(li) : at
    const step: Record<string, number> = { ArrowLeft: from - 1, ArrowRight: from + 1, ArrowUp: from - columns, ArrowDown: from + columns, Home: 0, End: deck.length - 1 }
    if (!(e.key in step)) return
    e.preventDefault()
    const to = step[e.key]
    // Up from the first row and down from the last stay where they are, as in a file manager's grid.
    if (to >= 0 && to < deck.length) focus(to)
  }
  if (!deck.length) return <p className="p-4 text-ink-3">{t('slides.deckEmpty')}</p>
  return (
    <div ref={box} className="min-h-0 flex-1 overflow-y-auto">
      <ol ref={grid} aria-label={t('slides.overview')} onKeyDown={key} className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {deck.map((s, i) => {
          const on = i === at
          return (
            <li key={s.key} aria-current={on ? 'true' : undefined} className={cx('min-w-0 rounded-[10px] p-1.5', on && 'bg-accent-soft')}>
              <SlideView html={htmlOf(s)} theme={theme} scope={scope} chrome={{ label: title, n: i + 1, part: s.part && t('slides.part', s.part) }} onClick={() => onPick(i)} label={t('slides.slide', { n: i + 1 })} className="w-full" />
              <div className={cx('mt-1 flex gap-1 truncate text-[12px]', on ? 'font-medium text-accent-strong' : s.generated ? 'text-ink-3' : 'text-ink-2')}>
                <span className="tnum">{i + 1}</span>
                <span className="truncate">{s.generated ? t(`slides.generated.${s.generated}`, { n: '' }).trim() : s.caption}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
