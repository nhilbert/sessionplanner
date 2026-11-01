import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import type { WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { useSettings } from '@/store/useSettings'
import { SlideStage, themeOf, useTheme } from '@/slides/SlideView'
import { deckLabels } from '@/slides/deckLabels'
import { useDeckOptions } from '@/slides/deckOptions'

/** Presenting from the app (docs/slides.md): the deck full screen, arrow keys, space and clicks to page, Escape to leave. */
export default function PresentPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState<WorkshopState | null>(null)
  const [failed, setFailed] = useState(false)
  const { settings, loaded, load } = useSettings()
  const [options] = useDeckOptions()
  const [scale, setScale] = useState(1)
  const [hint, setHint] = useState(true)
  const hintTimer = useRef<number | null>(null)
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')

  useEffect(() => {
    api.loadWorkshop(id).then(setData, () => setFailed(true))
  }, [id])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  const deck = useMemo(() => (data ? deckOf(data, deckLabels(t), options) : []), [data, t, options])
  const n = Math.min(Math.max(parseInt(params.get('n') ?? '1', 10) || 1, 1), Math.max(deck.length, 1)) - 1
  const go = (i: number) => {
    setParams({ n: String(Math.min(Math.max(i, 0), deck.length - 1) + 1) }, { replace: true })
    setHint(true)
    if (hintTimer.current) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(false), 1500)
  }

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 720))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  useEffect(() => {
    if (data) document.title = `${data.workshop.title || t('workshops.untitled')} – ${t('slides.title')}`
  }, [data, t])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') go(n + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') go(n - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(deck.length - 1)
      else if (e.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void navigate(`/w/${id}`)
      } else if (e.key === 'f') void document.documentElement.requestFullscreen?.()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (failed) return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>
  const slide = deck[n]
  const title = data.workshop.title || t('workshops.untitled')
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black" onClick={(e) => go(e.clientX < window.innerWidth / 3 ? n - 1 : n + 1)}>
      {slide && (
        <div className="absolute left-1/2 top-1/2" style={{ width: 1280 * scale, height: 720 * scale, transform: 'translate(-50%, -50%)' }}>
          <SlideStage html={slide.html} theme={theme} scope={{ workshopId: data.workshop.id }} chrome={{ label: title, n: n + 1 }} scale={scale} />
        </div>
      )}
      <div className={`pointer-events-none absolute bottom-3 right-4 text-[12px] text-white/60 transition-opacity tnum ${hint ? 'opacity-100' : 'opacity-0'}`}>
        {n + 1} / {deck.length} · Esc {t('slides.exit')}
      </div>
    </div>
  )
}
