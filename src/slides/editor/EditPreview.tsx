import { useLayoutEffect, useMemo, useRef } from 'react'
import { type AssetScope, hostHtml, useFrameScale, useTheme } from '../SlideView'
import { fieldSelectors, type SlideDoc } from '@/domain/slideDoc'
import { cx } from '@/components/ui'
import './editor.css'

/**
 * The slide as it will look, with the editor's marks (docs/slides.md, section 7): every element that shows a field
 * carries that field's path, so a click on the slide opens the field, and the focused field lights up its
 * element. The slide stays what the stylesheet makes of the markup: no editing happens inside it, the fields do
 * that – a plain input is the same on a phone, with a screen reader and in every browser, which contentEditable
 * is not. It also reports whether the content runs over the slide's edge.
 */
export function EditPreview({ doc, html, theme, scope, focus, onFocus, onOverflow, className, style }: { doc: SlideDoc; html: string; theme: string; scope: AssetScope; focus: string | null; onFocus: (path: string) => void; onOverflow?: (over: boolean) => void; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const scale = useFrameScale(ref)
  const rendered = useMemo(() => hostHtml(html, scope), [html, scope])
  useTheme(theme)
  const selectors = useMemo(() => fieldSelectors(doc), [doc])

  // Mark the elements after every render of the markup, then check the fit.
  useLayoutEffect(() => {
    const section = root.current?.querySelector<HTMLElement>('.slide')
    if (!section) return
    for (const { path, selector } of selectors) {
      try {
        for (const el of section.querySelectorAll<HTMLElement>(selector)) if (!el.dataset.f) el.dataset.f = path
      } catch {
        // a selector the browser does not know: that field has no mark
      }
    }
    // The section hides its overflow; its scroll size still tells whether the content runs past 1280 × 720.
    onOverflow?.(section.scrollHeight > 720 + 2 || section.scrollWidth > 1280 + 2)
  }, [rendered, selectors, onOverflow])

  useLayoutEffect(() => {
    const section = root.current?.querySelector<HTMLElement>('.slide')
    if (!section) return
    for (const el of section.querySelectorAll('.is-focus')) el.classList.remove('is-focus')
    if (!focus) return
    // The field's own element, else the entry it belongs to ("cards.1.text" → "cards.1").
    const parts = focus.split('.')
    while (parts.length) {
      const hit = section.querySelector(`[data-f="${parts.join('.')}"]`)
      if (hit) {
        hit.classList.add('is-focus')
        return
      }
      parts.pop()
    }
  }, [focus, rendered])

  return (
    <div
      ref={ref}
      className={cx('slide-frame slide-edit', className)}
      style={{ ...style, '--s': scale } as React.CSSProperties}
      onClick={(e) => {
        const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')
        if (hit?.dataset.f) onFocus(hit.dataset.f)
      }}
    >
      <div ref={root} className="slide-root" data-theme={theme} dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}
