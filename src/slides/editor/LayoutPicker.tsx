import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { type AssetScope, SlideView } from '../SlideView'
import { blankSlide } from '../templates'
import { convertLayout, LAYOUTS, type LayoutGroup, serializeSlide, type SlideDoc } from '@/domain/slideDoc'
import { cx, Modal } from '@/components/ui'
import { tr } from './fields'

const GROUPS: LayoutGroup[] = ['text', 'structure', 'visual', 'opening']

/** What a layout would leave out of the slide, in a few words (the editor's notice after the change says it in full). */
const missing = (lost: string[], t: TFunction): string =>
  lost
    .map((l) => (l.startsWith('items:') ? tr(t, 'editor.miss.items', { count: Number(l.slice(6)) }) : l.startsWith('images:') ? tr(t, 'editor.miss.images', { count: Number(l.slice(7)) }) : tr(t, `editor.miss.${l === 'figure' || l === 'svg' || l === 'other' || l === 'takeaway' ? l : 'source'}`)))
    .join(', ')

/**
 * The catalogue as a grid, with its name and what it is for under every layout. With a slide (`doc`), every layout
 * shows that slide's content as it would stand in it, and names what it could not hold; without one (a new slide),
 * or for a slide kept as source, a small blank slide. Always in the current theme.
 */
export function LayoutGrid({ current, doc, onPick, theme, scope, columns = 'grid-cols-2 md:grid-cols-3' }: { current?: string; doc?: SlideDoc; onPick: (layout: string) => void; theme: string; scope: AssetScope; columns?: string }) {
  const { t } = useTranslation()
  const shown = useMemo(
    () =>
      Object.fromEntries(
        LAYOUTS.map((l): [string, { html: string; lost: string[] }] => {
          if (!doc || doc.raw !== undefined) return [l.id, { html: blankSlide(l.id, t), lost: [] }]
          const to = convertLayout(doc, l.id)
          return [l.id, { html: serializeSlide(to.doc), lost: to.lost }]
        }),
      ),
    [doc, t],
  )
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <section key={group}>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{tr(t, `slides.layoutGroups.${group}`)}</div>
          <ul className={cx('grid gap-2.5', columns)}>
            {LAYOUTS.filter((l) => l.group === group).map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => onPick(l.id)} className={cx('block w-full rounded-lg p-1 text-left ring-offset-2 ring-offset-surface transition-colors hover:bg-surface-2', l.id === current && 'ring-2 ring-accent')} aria-pressed={l.id === current} aria-label={tr(t, `slides.layouts.${l.id}`)}>
                  <SlideView html={shown[l.id].html} theme={theme} scope={scope} />
                  <div className="mt-1 px-0.5">
                    <div className="truncate text-[13px] font-medium">{tr(t, `slides.layouts.${l.id}`)}</div>
                    {shown[l.id].lost.length ? <div className="truncate text-[11px] text-amber" title={missing(shown[l.id].lost, t)}>{missing(shown[l.id].lost, t)}</div> : <div className="truncate text-[11px] text-ink-3">{l.generated ? t('slides.generatedHint').split(';')[0] : tr(t, `slides.layoutUse.${l.id}`)}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function LayoutPicker({ open, onClose, current, doc, onPick, theme, scope }: { open: boolean; onClose: () => void; current: string; doc?: SlideDoc; onPick: (layout: string) => void; theme: string; scope: AssetScope }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <h2 className="mb-3 text-[16px] font-semibold">{t('editor.changeLayout')}</h2>
      <LayoutGrid
        current={current}
        doc={open ? doc : undefined}
        theme={theme}
        scope={scope}
        onPick={(l) => {
          onPick(l)
          onClose()
        }}
      />
    </Modal>
  )
}
