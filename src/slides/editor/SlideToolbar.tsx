import { type ComponentProps, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AArrowDown, AArrowUp, Bold, CornerLeftUp, Italic, Palette, RemoveFormatting, Replace, Trash2 } from 'lucide-react'
import { type Color, COLORS, type RangeState, SIZE_STEPS } from '@/domain/inlineRuns'
import { cx, Segmented } from '@/components/ui'
import { tr } from './fields'
import type { TargetKind } from './inplace'

/** Where the selected element stands in the window. */
export interface Anchor {
  left: number
  top: number
  right: number
  bottom: number
}

interface Props {
  anchor: Anchor
  kind: TargetKind
  /** The theme of the slide: the colours on offer are its palette. */
  theme: string
  /** A text: what the selected words (or the whole element) carry. */
  state: RangeState | null
  onBold: () => void
  onItalic: () => void
  onSize: (dir: 1 | -1) => void
  onColor: (color: Color | null) => void
  onClear: () => void
  /** A picture: choose another one. */
  onReplace?: () => void
  /** A picture that has a cut-out: which of the two shows. */
  cutout?: { on: boolean; set: (on: boolean) => void }
  /** A text or picture inside an entry: select the entry (to remove the whole card). */
  onEntry?: () => void
  onRemove: () => void
}

/** The colour a place of the palette shows in the theme (slides.css). */
const SWATCH: Record<Color, string> = { accent: 'var(--accent-deep, var(--accent))', 'accent-2': 'var(--accent-2)', 'accent-3': 'var(--accent-3)', 'accent-4': 'var(--accent-4)', title: 'var(--title)', text: 'var(--fg)', muted: 'var(--fg-3)' }

function Tool({ label, active, className, ...props }: ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx('inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30', active && 'bg-accent-soft text-ink', className)}
      {...props}
    />
  )
}

/**
 * The bar above the element selected on the slide (docs/slides.md, section 7, "On the slide"): for a text, bold,
 * italic, the size in steps, a colour of the theme's palette and "remove formatting"; for a picture, another one
 * and its cut-out; for everything, remove. It stands outside the slide, in the window's own size, and never takes
 * the focus from the text, so the selection it acts on stays.
 */
export function SlideToolbar({ anchor, kind, theme, state, onBold, onItalic, onSize, onColor, onClear, onReplace, cutout, onEntry, onRemove }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [colors, setColors] = useState(false)

  // Above the element, or below it where there is no room; kept inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const top = anchor.top - h - 10 >= 8 ? anchor.top - h - 10 : Math.min(anchor.bottom + 10, window.innerHeight - h - 8)
    el.style.top = `${Math.round(top)}px`
    el.style.left = `${Math.round(Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8)))}px`
  })

  const size = state?.size === 'mixed' ? '' : (state?.size ?? '')
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('editor.onSlide.toolbar')}
      className="fixed z-[60] flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]"
      // The text keeps its selection and the focus: the bar's buttons act on it.
      onMouseDown={(e) => e.preventDefault()}
    >
      {kind === 'text' && state && (
        <>
          <Tool label={t('editor.onSlide.bold')} active={state.bold} onClick={onBold}>
            <Bold size={14} />
          </Tool>
          <Tool label={t('editor.onSlide.italic')} active={state.italic} onClick={onItalic}>
            <Italic size={14} />
          </Tool>
          <Tool label={t('editor.onSlide.smaller')} onClick={() => onSize(-1)} disabled={size === SIZE_STEPS[0]}>
            <AArrowDown size={15} />
          </Tool>
          <Tool label={t('editor.onSlide.larger')} onClick={() => onSize(1)} disabled={size === SIZE_STEPS[SIZE_STEPS.length - 1]}>
            <AArrowUp size={15} />
          </Tool>
          <div className="relative">
            <Tool label={t('editor.onSlide.color')} active={colors} aria-expanded={colors} onClick={() => setColors((c) => !c)}>
              <Palette size={14} />
            </Tool>
            {colors && (
              <div data-theme={theme} className="absolute left-0 top-full z-10 mt-1.5 flex items-center gap-1 rounded-lg border border-line p-1.5 shadow-[var(--shadow)]" style={{ background: 'var(--bg)' }}>
                <button
                  type="button"
                  aria-label={t('editor.onSlide.colorDefault')}
                  title={t('editor.onSlide.colorDefault')}
                  aria-pressed={state.color === ''}
                  onClick={() => (onColor(null), setColors(false))}
                  className={cx('h-6 w-6 rounded-full border-2 bg-[linear-gradient(135deg,transparent_45%,currentColor_45%,currentColor_55%,transparent_55%)]', state.color === '' ? 'border-[var(--fg)]' : 'border-[var(--line)]')}
                  style={{ color: 'var(--fg-3)' }}
                />
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={tr(t, `editor.onSlide.colors.${c}`)}
                    title={tr(t, `editor.onSlide.colors.${c}`)}
                    aria-pressed={state.color === c}
                    onClick={() => (onColor(c), setColors(false))}
                    className={cx('h-6 w-6 rounded-full border-2', state.color === c ? 'border-[var(--fg)]' : 'border-transparent')}
                    style={{ background: SWATCH[c] }}
                  />
                ))}
              </div>
            )}
          </div>
          <Tool label={t('editor.onSlide.clear')} onClick={onClear} disabled={!state.formatted}>
            <RemoveFormatting size={14} />
          </Tool>
          <span className="mx-0.5 h-4 w-px bg-line" />
        </>
      )}
      {kind === 'image' && onReplace && (
        <>
          <Tool label={t('editor.onSlide.replace')} onClick={onReplace} className="px-2">
            <Replace size={14} />
            {t('editor.onSlide.replace')}
          </Tool>
          {cutout && (
            <Segmented size="sm" value={cutout.on ? 'cutout' : 'original'} onChange={(v) => cutout.set(v === 'cutout')} options={[{ value: 'cutout', label: t('editor.cutout') }, { value: 'original', label: t('editor.original') }]} />
          )}
          <span className="mx-0.5 h-4 w-px bg-line" />
        </>
      )}
      {onEntry && (
        <Tool label={t('editor.onSlide.selectEntry')} onClick={onEntry}>
          <CornerLeftUp size={14} />
        </Tool>
      )}
      <Tool label={t('editor.onSlide.remove')} onClick={onRemove} className="hover:text-rose">
        <Trash2 size={14} />
      </Tool>
    </div>
  )
}
