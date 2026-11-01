import { type ComponentProps, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderSlideHtml, sanitizeSlide } from '@/domain/slides'
import { type AssetScope, assetUrl } from '@/api'
import { cx } from '@/components/ui'
import './slides.css'
import './themes/default.css'
import './host.css'

export type { AssetScope }

/** The theme a workshop's slides use: its own, else the settings' default, else the built-in one. */
export const themeOf = (workshop: { theme: string }, settings: { theme: string }): string => workshop.theme || settings.theme || 'default'

const loadedThemes = new Set<string>()

/** Adds the theme's stylesheet (data/themes/<name>/theme.css) to the page once; the default theme is built in. */
export function useTheme(name: string | undefined): string {
  const theme = name && name !== 'default' ? name : 'default'
  useLayoutEffect(() => {
    if (theme === 'default' || loadedThemes.has(theme)) return
    loadedThemes.add(theme)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `/api/themes/${encodeURIComponent(theme)}/theme.css`
    document.head.appendChild(link)
  }, [theme])
  return theme
}

/** The markup the host renders: sanitised again, pictures resolved, the footer line of themes that show one. */
export function hostHtml(html: string, scope: AssetScope, chrome?: { label: string; n: number }): string {
  let out = renderSlideHtml(sanitizeSlide(html), (hash) => assetUrl(scope, hash))
  if (chrome) {
    const footer = `<footer class="chrome"><span>${esc(chrome.label)}</span><span>${chrome.n}</span></footer>`
    const at = out.lastIndexOf('</section>')
    out = at === -1 ? out + footer : out.slice(0, at) + footer + out.slice(at)
  }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * One slide in a 16:9 frame that scales the slide to its width: a thumbnail in a strip, a card in a grid, a
 * large preview. The frame measures itself; nothing in the slide knows about its size.
 */
export function SlideView({ html, theme, scope, chrome, className, onClick, label, ...rest }: { html: string; theme: string; scope: AssetScope; chrome?: { label: string; n: number }; className?: string; onClick?: () => void; label?: string } & Omit<ComponentProps<'div'>, 'onClick'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / 1280)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const rendered = useMemo(() => hostHtml(html, scope, chrome), [html, scope, chrome])
  useTheme(theme)
  const button = !!onClick
  return (
    <div
      ref={ref}
      className={cx('slide-frame', button && 'is-button', className)}
      style={{ '--s': scale } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={button ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick?.()) : undefined}
      role={button ? 'button' : undefined}
      tabIndex={button ? 0 : undefined}
      aria-label={label}
      {...rest}
    >
      <div className="slide-root" data-theme={theme} dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}

/** A slide at its design size for a stage that scales it (presenting, printing). */
export function SlideStage({ html, theme, scope, chrome, scale }: { html: string; theme: string; scope: AssetScope; chrome?: { label: string; n: number }; scale: number }) {
  const rendered = useMemo(() => hostHtml(html, scope, chrome), [html, scope, chrome])
  useTheme(theme)
  return (
    <div className="slide-stage" style={{ transform: `scale(${scale})` }}>
      <div className="slide-root" data-theme={theme} dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}
