import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { api } from '@/api'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { itemsIn, sortedDays } from '@/domain/order'
import { formatTime, scheduleDay } from '@/domain/time'
import { useSettings } from '@/store/useSettings'
import { Button, cx, IconButton } from '@/components/ui'
import Markdown from '@/components/Markdown'
import { SlideView, themeOf, useTheme } from '@/slides/SlideView'
import { deckLabels } from '@/slides/deckLabels'
import { useDeckOptions } from '@/slides/deckOptions'
import { presentChannel } from '@/slides/presentChannel'

/**
 * The simple presenter mode (docs/slides.md): the facilitator's screen while the workshop runs. The current slide
 * large, the next one small, the step's planned time against the clock, its notes; the arrow keys page, and an
 * open presentation window follows along.
 */
export default function PresenterPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState<WorkshopState | null>(null)
  const [failed, setFailed] = useState(false)
  const { settings, loaded, load } = useSettings()
  const [options] = useDeckOptions()
  const [now, setNow] = useState(() => new Date())
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')

  useEffect(() => {
    api.loadWorkshop(id).then(setData, () => setFailed(true))
  }, [id])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])
  const deck = useMemo(() => (data ? deckOf(data, deckLabels(t), options) : []), [data, t, options])
  const n = Math.min(Math.max(parseInt(params.get('n') ?? '1', 10) || 1, 1), Math.max(deck.length, 1)) - 1
  const go = (i: number) => {
    const next = Math.min(Math.max(i, 0), deck.length - 1)
    setParams({ n: String(next + 1) }, { replace: true })
    presentChannel(id).postMessage({ n: next + 1 })
  }
  useEffect(() => {
    if (deck.length) presentChannel(id).postMessage({ n: n + 1 })
  }, [id, n, deck.length])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(n + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(n - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(deck.length - 1)
      else if (e.key === 'Escape') void navigate(`/w/${id}`)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => {
    if (data) document.title = `${data.workshop.title || t('workshops.untitled')} – ${t('slides.presenter')}`
  }, [data, t])

  // The planned times of the step the current slide belongs to.
  const timing = useMemo(() => {
    if (!data) return null
    const slide = deck[n]
    if (!slide?.itemId) return null
    const item = data.items.find((i) => i.id === slide.itemId)
    const day = item?.dayId ? data.days.find((d) => d.id === item.dayId) : undefined
    if (!item || !day) return null
    const slot = scheduleDay(day.startMin, day.endMin, itemsIn(data, day.id)).slots[item.id]
    return slot ? { item, day, start: slot.start, end: slot.end } : { item, day, start: null, end: null }
  }, [data, deck, n])

  if (failed) return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
  const slide = deck[n]
  const next = deck[n + 1]
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const today = sortedDays(data.days).find((d) => d.date === now.toISOString().slice(0, 10))
  const sameDay = timing?.day && today?.id === timing.day.id
  const left = timing?.end !== null && timing?.end !== undefined && sameDay ? timing.end - minutesNow : null
  const notStarted = timing?.start !== null && timing?.start !== undefined && sameDay && minutesNow < timing.start

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2 text-[13px]">
        <span className="truncate font-medium">{title}</span>
        <span className="text-ink-3">·</span>
        <span className="tnum text-ink-2">{formatTime(minutesNow)}</span>
        <span className="ml-auto hidden text-ink-3 md:inline">{t('slides.presenterHint')}</span>
        <Button size="sm" onClick={() => window.open(`/w/${id}/present?n=${n + 1}`, '_blank', 'noopener')} className="max-md:hidden">
          <ExternalLink size={13} />
          {t('slides.projector')}
        </Button>
        <IconButton label={t('slides.exit')} onClick={() => void navigate(`/w/${id}`)}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[2fr_1fr] md:overflow-visible">
        <div className="flex min-h-0 flex-col gap-3">
          {slide ? <SlideView html={slide.html} theme={theme} scope={scope} chrome={{ label: title, n: n + 1 }} className="w-full shadow-[var(--shadow)]" /> : <p className="text-ink-3">{t('slides.deckEmpty')}</p>}
          <div className="flex items-center gap-2">
            <IconButton label={t('slides.prev')} onClick={() => go(n - 1)} disabled={n === 0}>
              <ChevronLeft size={18} />
            </IconButton>
            <span className="tnum text-[13px] text-ink-2">
              {n + 1} / {deck.length}
            </span>
            <IconButton label={t('slides.next')} onClick={() => go(n + 1)} disabled={n >= deck.length - 1}>
              <ChevronRight size={18} />
            </IconButton>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{slide?.caption}</span>
          </div>
        </div>
        <aside className="flex min-h-0 flex-col gap-4 md:overflow-y-auto">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('slides.nextSlide')}</div>
            {next ? <SlideView html={next.html} theme={theme} scope={scope} chrome={{ label: title, n: n + 2 }} className="w-full" /> : <p className="text-[13px] text-ink-3">{t('slides.lastSlide')}</p>}
            {next && <div className="mt-1 truncate text-[12px] text-ink-3">{next.caption}</div>}
          </div>
          {timing ? (
            <div className="card p-4">
              <div className="text-[15px] font-semibold">{timing.item.title || t(`kinds.${timing.item.kind}`)}</div>
              {timing.start !== null && timing.end !== null && (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[13px] text-ink-2">
                  <span className="tnum">
                    {t('slides.planned')} {formatTime(timing.start)}–{formatTime(timing.end)}
                  </span>
                  {left !== null && (
                    <span className={cx('tnum font-medium', left < 0 ? 'text-rose' : left <= 5 ? 'text-amber' : 'text-ink')}>
                      {notStarted ? t('slides.notYet', { time: formatTime(timing.start) }) : left >= 0 ? t('slides.remaining', { count: left }) : t('slides.over', { count: -left })}
                    </span>
                  )}
                </div>
              )}
              {(timing.item.method || timing.item.lead) && <div className="mt-1 text-[13px] text-ink-2">{[timing.item.method, timing.item.lead].filter(Boolean).join(' · ')}</div>}
              <div className="mt-3 border-t border-line pt-3 text-[14px] leading-relaxed">{timing.item.notes.trim() ? <Markdown text={timing.item.notes} /> : <span className="text-ink-3">{t('slides.noNotes')}</span>}</div>
            </div>
          ) : (
            slide && <p className="text-[13px] text-ink-3">{t('slides.generatedSlide')}</p>
          )}
        </aside>
      </div>
    </div>
  )
}
