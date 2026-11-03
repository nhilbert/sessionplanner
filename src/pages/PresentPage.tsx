import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { usePlanner } from '@/store/usePlanner'
import { useSettings } from '@/store/useSettings'
import { SlideStage } from '@/slides/SlideView'
import { useDeck } from '@/slides/useDeck'
import { usePresentSync } from '@/slides/presentSync'
import { useWakeLock } from '@/slides/useWakeLock'

/**
 * Presenting from the app (docs/slides.md): the deck full screen, arrow keys, space and clicks to page, Escape to leave.
 * It shows the workshop live, so a slide changed meanwhile shows at once, and pages with every window of the presentation.
 */
export default function PresentPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data, status, open, close } = usePlanner()
  const { loaded, load } = useSettings()
  const [scale, setScale] = useState(1)
  const [hint, setHint] = useState(true)
  const hintTimer = useRef<number | null>(null)
  const touchX = useRef<number | null>(null)
  const { deck, theme } = useDeck(data)
  // ?from=N presents from that slide ("Present from here"); ?n=N is where this window was, for a reload.
  const [from] = useState(() => params.get('from'))
  const { at: n, go: page } = usePresentSync(id, deck, parseInt(from ?? params.get('n') ?? '1', 10) || 1, from !== null)
  useWakeLock()

  useEffect(() => {
    open(id)
    return () => close()
  }, [id, open, close])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    if (deck.length) setParams({ n: String(n + 1) }, { replace: true })
  }, [n, deck.length, setParams])
  const go = (i: number) => {
    page(i)
    setHint(true)
    if (hintTimer.current) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(false), 1500)
  }

  useEffect(() => () => {
    if (hintTimer.current) window.clearTimeout(hintTimer.current)
  }, [])
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

  if (status === 'missing') return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (status === 'login' || status === 'error') return <p className="p-8 text-rose">{status === 'login' ? t('common.login') : t('common.error')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>
  const slide = deck[n]
  const title = data.workshop.title || t('workshops.untitled')
  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-black"
      onClick={(e) => go(e.clientX < window.innerWidth / 3 ? n - 1 : n + 1)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        // A swipe pages; a tap falls through to the click.
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 40) {
          e.preventDefault()
          go(dx < 0 ? n + 1 : n - 1)
        }
      }}
    >
      {slide && (
        <div className="absolute left-1/2 top-1/2" style={{ width: 1280 * scale, height: 720 * scale, transform: 'translate(-50%, -50%)' }}>
          <SlideStage html={slide.html} theme={theme} scope={{ workshopId: data.workshop.id }} chrome={{ label: title, n: n + 1, part: slide.part && t('slides.part', slide.part) }} scale={scale} />
        </div>
      )}
      <div className={`pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-4 text-[12px] text-white/60 transition-opacity tnum ${hint ? 'opacity-100' : 'opacity-0'}`}>
        {n + 1} / {deck.length}
        <span className="max-md:hidden"> · Esc {t('slides.exit')}</span>
      </div>
    </div>
  )
}
