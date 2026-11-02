import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, X } from 'lucide-react'
import { itemsIn, sortedDays } from '@/domain/order'
import { clockIn, formatTime, scheduleDay } from '@/domain/time'
import { usePlanner } from '@/store/usePlanner'
import { useSettings } from '@/store/useSettings'
import { Button, cx, IconButton, isTyping } from '@/components/ui'
import { overlayOpen } from '@/components/overlay'
import Markdown from '@/components/Markdown'
import { SlideView } from '@/slides/SlideView'
import { useDeck } from '@/slides/useDeck'
import { usePresentSync } from '@/slides/presentSync'
import { useWakeLock } from '@/slides/useWakeLock'
import { PlannerSlideEditor, useSlideEditing } from '@/slides/PlannerSlides'

/**
 * The presenter view (docs/slides.md): the facilitator's screen while the workshop runs, on the laptop or on a phone
 * as remote. The current slide large, the next one small, the step's planned time against the clock, its notes. Every
 * window of the presentation pages together, here and on other devices; a slide edited from here (or anywhere) shows
 * at once, while the audience stays on the slide shown.
 */
export default function PresenterPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data, status, live, open, close } = usePlanner()
  const { loaded, load } = useSettings()
  const [now, setNow] = useState(() => new Date())
  const { deck, theme } = useDeck(data)
  const [start] = useState(() => parseInt(params.get('n') ?? '1', 10) || 1)
  const { at: n, go } = usePresentSync(id, deck, start, false)
  const touchX = useRef<number | null>(null)
  useWakeLock()

  useEffect(() => {
    open(id)
    return () => {
      useSlideEditing.getState().close()
      close()
    }
  }, [id, open, close])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (deck.length) setParams({ n: String(n + 1) }, { replace: true })
  }, [n, deck.length, setParams])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // The slide editor pages its own slides; the audience stays where it is.
      if (isTyping(e.target) || overlayOpen() || e.defaultPrevented) return
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

  if (status === 'missing') return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (status === 'login' || status === 'error') return <p className="p-8 text-rose">{status === 'login' ? t('common.login') : t('common.error')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>
  const title = data.workshop.title || t('workshops.untitled')
  const scope = { workshopId: data.workshop.id }
  const slide = deck[n]
  const next = deck[n + 1]
  const owner = !data.access
  const canEdit = owner || data.access?.role === 'edit'
  // Opens the editor on the whole deck at that slide; generated slides show their note there, as everywhere.
  const edit = (key: string) => useSlideEditing.getState().open({ kind: 'deck', key, mode: 'edit' })
  // The clock in the workshop's time zone, like its agenda.
  const { date: todayDate, minutes: minutesNow } = clockIn(now, data.workshop.timezone)
  const today = sortedDays(data.days).find((d) => d.date === todayDate)
  const sameDay = timing?.day && today?.id === timing.day.id
  const left = timing?.end !== null && timing?.end !== undefined && sameDay ? timing.end - minutesNow : null
  const notStarted = timing?.start !== null && timing?.start !== undefined && sameDay && minutesNow < timing.start

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2 text-[13px]">
        <span className="truncate font-medium">{title}</span>
        <span className="text-ink-3">·</span>
        <span className="tnum text-ink-2">{formatTime(minutesNow)}</span>
        <span title={live ? t('slides.liveSync') : t('planner.offline')} className={cx('h-2 w-2 shrink-0 rounded-full', live ? 'bg-accent' : 'bg-amber')} />
        {!live && <span className="text-[12px] text-amber">{t('planner.offline')}</span>}
        <span className="ml-auto hidden text-ink-3 md:inline">{t('slides.presenterHint')}</span>
        <Button size="sm" onClick={() => window.open(`/w/${id}/present`, '_blank', 'noopener')} className="max-md:ml-auto max-md:hidden">
          <ExternalLink size={13} />
          {t('slides.projector')}
        </Button>
        <IconButton label={t('slides.exit')} onClick={() => void navigate(`/w/${id}`)} className="max-md:ml-auto">
          <X size={16} />
        </IconButton>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-[2fr_1fr] md:overflow-visible">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {slide ? (
            <div
              onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                // On a phone the slide pages with a swipe, as in the presentation.
                if (touchX.current === null) return
                const dx = e.changedTouches[0].clientX - touchX.current
                touchX.current = null
                if (Math.abs(dx) > 40) go(dx < 0 ? n + 1 : n - 1)
              }}
            >
              <SlideView html={slide.html} theme={theme} scope={scope} chrome={{ label: title, n: n + 1 }} className="w-full shadow-[var(--shadow)]" />
            </div>
          ) : (
            <p className="text-ink-3">{t('slides.deckEmpty')}</p>
          )}
          <div className="flex items-center gap-2">
            <IconButton label={t('slides.prev')} onClick={() => go(n - 1)} disabled={n === 0} className="max-md:hidden">
              <ChevronLeft size={18} />
            </IconButton>
            <span className="tnum text-[13px] text-ink-2">
              {n + 1} / {deck.length}
            </span>
            <IconButton label={t('slides.next')} onClick={() => go(n + 1)} disabled={n >= deck.length - 1} className="max-md:hidden">
              <ChevronRight size={18} />
            </IconButton>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{slide?.caption}</span>
            {slide && canEdit && (
              <Button size="sm" onClick={() => edit(slide.key)}>
                <Pencil size={13} />
                {t('slides.edit')}
              </Button>
            )}
          </div>
        </div>
        <aside className="flex min-h-0 min-w-0 flex-col gap-4 md:overflow-y-auto">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t('slides.nextSlide')}</span>
              {next && canEdit && (
                <button type="button" onClick={() => edit(next.key)} className="tap ml-auto inline-flex items-center gap-1 rounded px-1 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <Pencil size={12} />
                  {t('slides.edit')}
                </button>
              )}
            </div>
            {next ? <SlideView html={next.html} theme={theme} scope={scope} chrome={{ label: title, n: n + 2 }} className="w-full max-md:mx-auto max-md:w-1/2" /> : <p className="text-[13px] text-ink-3">{t('slides.lastSlide')}</p>}
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
      {/* On a phone the remote's buttons: large, at the thumb. */}
      <div className="grid grid-cols-2 gap-3 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <Button onClick={() => go(n - 1)} disabled={n === 0} className="h-14! text-base!">
          <ChevronLeft size={22} />
          {t('slides.prev')}
        </Button>
        <Button variant="primary" onClick={() => go(n + 1)} disabled={n >= deck.length - 1} className="h-14! text-base!">
          {t('slides.next')}
          <ChevronRight size={22} />
        </Button>
      </div>
      {canEdit && <PlannerSlideEditor owner={owner} onPresent={(at) => go(at - 1)} />}
    </div>
  )
}
