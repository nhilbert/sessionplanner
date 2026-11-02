import { type ComponentProps, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { esc, normalizeSlideHtml, renderSlideHtml } from '@/domain/slides'
import { type AssetScope, api, assetUrl } from '@/api'
import { cx } from '@/components/ui'
import { useThemes } from '@/store/useThemes'
import './slides.css'
import './themes/default.css'
import './host.css'
// The fonts a data theme may choose (docs/slides.md, section 4). The browser fetches a face only when a slide uses it.
import '@fontsource-variable/manrope'
import '@fontsource-variable/source-serif-4'

export type { AssetScope }

/** The theme a workshop's slides use: its own, else the settings' default, else the built-in one. */
export const themeOf = (workshop: { theme: string }, settings: { theme: string }): string => workshop.theme || settings.theme || 'default'

/** A theme id the editor previews with a stylesheet of its own (never loaded from the server). */
export const PREVIEW_THEME = 'preview-theme'

const links = new Map<string, HTMLLinkElement>()

/**
 * Adds the theme's stylesheet (/api/themes/<id>/theme.css) to the page once, addressed by the theme's last change,
 * so a theme edited elsewhere is loaded again once the list of themes says so; the default theme is built in,
 * preview themes are set by `applyThemeCss`.
 */
export function useTheme(name: string | undefined): string {
  const theme = name && name !== 'default' ? name : 'default'
  const version = useThemes((s) => s.themes.find((x) => x.id === theme)?.updatedAt)
  const load = useThemes((s) => s.load)
  useLayoutEffect(() => {
    if (theme === 'default' || theme === PREVIEW_THEME) return
    void load()
    const href = api.themeCssUrl(theme, version)
    const known = links.get(theme)
    if (known) {
      if (version && !known.href.endsWith(href)) known.href = href
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
    links.set(theme, link)
  }, [theme, version, load])
  return theme
}

/** A theme was changed: windows that show it load the stylesheet again. */
export function reloadTheme(id: string) {
  const link = links.get(id)
  if (link) link.href = api.themeCssUrl(id, String(Date.now()))
}

const styles = new Map<string, HTMLStyleElement>()

/** Sets (or removes, with null) the stylesheet of a theme the browser builds itself: the theme editor's draft. */
export function applyThemeCss(id: string, css: string | null) {
  let style = styles.get(id)
  if (css === null) {
    style?.remove()
    styles.delete(id)
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.dataset.theme = id
    document.head.appendChild(style)
    styles.set(id, style)
  }
  if (style.textContent !== css) style.textContent = css
}

/**
 * The markup the host renders: sanitised again and cut to its one root (slides stored before the cut may carry
 * more), pictures resolved, the footer line of themes that show one.
 */
export function hostHtml(html: string, scope: AssetScope, chrome?: { label: string; n: number }): string {
  let out = renderSlideHtml(normalizeSlideHtml(html), (hash) => assetUrl(scope, hash))
  if (chrome) {
    const footer = `<footer class="chrome"><span>${esc(chrome.label)}</span><span>${chrome.n}</span></footer>`
    const at = out.lastIndexOf('</section>')
    out = at === -1 ? out + footer : out.slice(0, at) + footer + out.slice(at)
  }
  return out
}

/**
 * hostHtml, worked out again only when what it depends on changes: callers pass scope and chrome as fresh objects
 * on every render, and sanitising a whole deck on each keystroke elsewhere on the page is wasted work.
 */
export function useHostHtml(html: string, scope: AssetScope, chrome?: { label: string; n: number }): string {
  const scopeKey = scope === 'library' ? 'library' : scope.workshopId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => hostHtml(html, scope, chrome), [html, scopeKey, chrome?.label, chrome?.n])
}

/** The scale that fits a 1280-wide slide into an element, kept current while it resizes. */
export function useFrameScale(ref: React.RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(0.25)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / 1280)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return scale
}

/**
 * One slide in a 16:9 frame that scales the slide to its width: a thumbnail in a strip, a card in a grid, a
 * large preview. The frame measures itself; nothing in the slide knows about its size.
 */
export function SlideView({ html, theme, scope, chrome, className, onClick, label, ...rest }: { html: string; theme: string; scope: AssetScope; chrome?: { label: string; n: number }; className?: string; onClick?: () => void; label?: string } & Omit<ComponentProps<'div'>, 'onClick'>) {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useFrameScale(ref)
  const rendered = useHostHtml(html, scope, chrome)
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
  const rendered = useHostHtml(html, scope, chrome)
  useTheme(theme)
  return (
    <div className="slide-stage" style={{ transform: `scale(${scale})` }}>
      <div className="slide-root" data-theme={theme} dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}
