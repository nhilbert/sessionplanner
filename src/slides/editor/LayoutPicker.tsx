import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { type AssetScope, SlideView } from '../SlideView'
import { blankSlide } from '../templates'
import { DIAGRAM_SHAPES, type DiagramShape } from '@/domain/diagram'
import { convertLayout, LAYOUTS, type LayoutGroup, serializeSlide, type SlideDoc } from '@/domain/slideDoc'
import { cx, Modal } from '@/components/ui'
import { tr } from './fields'
import './editor.css'

type Group = LayoutGroup | 'diagram'
const GROUPS: Group[] = ['text', 'structure', 'diagram', 'visual', 'opening']

/** What the chooser offers: a layout of the catalogue, and for the diagram layout each of its shapes as an entry of its own. */
interface Entry {
  key: string
  layout: string
  shape?: DiagramShape
  group: Group
  generated?: boolean
}
const ENTRIES: Entry[] = LAYOUTS.flatMap((l): Entry[] => (l.id === 'diagram' ? DIAGRAM_SHAPES.map((shape) => ({ key: `diagram.${shape}`, layout: l.id, shape, group: 'diagram' })) : [{ key: l.id, layout: l.id, group: l.group, generated: l.generated }]))

/** What a layout would leave out of the slide, in a few words (the editor's notice after the change says it in full). */
const missing = (lost: string[], t: TFunction): string =>
  lost
    .map((l) => (l.startsWith('items:') ? tr(t, 'editor.miss.items', { count: Number(l.slice(6)) }) : l.startsWith('images:') ? tr(t, 'editor.miss.images', { count: Number(l.slice(7)) }) : tr(t, `editor.miss.${l === 'figure' || l === 'svg' || l === 'other' || l === 'takeaway' ? l : 'source'}`)))
    .join(', ')

/**
 * The catalogue as a grid, with its name and what it is for under every layout; the shapes of a diagram stand as
 * entries of their own, in a group of their own. With a slide (`doc`), every entry shows that slide's content as
 * it would stand in it, and names what it could not hold; without one (a new slide), or for a slide kept as
 * source, a small blank slide. Always in the current theme.
 */
export function LayoutGrid({ current, doc, onPick, theme, scope, columns = 'grid-cols-2 md:grid-cols-3' }: { current?: string; doc?: SlideDoc; onPick: (layout: string, shape?: DiagramShape) => void; theme: string; scope: AssetScope; columns?: string }) {
  const { t } = useTranslation()
  const shown = useMemo(
    () =>
      Object.fromEntries(
        ENTRIES.map((e): [string, { html: string; lost: string[] }] => {
          if (!doc || doc.raw !== undefined) return [e.key, { html: blankSlide(e.layout, t, e.shape), lost: [] }]
          const to = convertLayout(doc, e.layout)
          return [e.key, { html: serializeSlide(e.shape ? { ...to.doc, shape: e.shape } : to.doc), lost: to.lost }]
        }),
      ),
    [doc, t],
  )
  const isCurrent = (e: Entry) => e.layout === current && (!e.shape || !doc || (doc.shape ?? 'pyramid') === e.shape)
  const name = (e: Entry) => (e.shape ? tr(t, `editor.shape.${e.shape}`) : tr(t, `slides.layouts.${e.layout}`))
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <section key={group}>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{tr(t, `slides.layoutGroups.${group}`)}</div>
          <ul className={cx('slot-hints grid gap-2.5', columns)}>
            {ENTRIES.filter((e) => e.group === group).map((e) => (
              <li key={e.key}>
                <button type="button" onClick={() => onPick(e.layout, e.shape)} className={cx('block w-full rounded-lg p-1 text-left ring-offset-2 ring-offset-surface transition-colors hover:bg-surface-2', isCurrent(e) && 'ring-2 ring-accent')} aria-pressed={isCurrent(e)} aria-label={name(e)}>
                  <SlideView html={shown[e.key].html} theme={theme} scope={scope} />
                  <div className="mt-1 px-0.5">
                    <div className="truncate text-[13px] font-medium">{name(e)}</div>
                    {shown[e.key].lost.length ? <div className="truncate text-[11px] text-amber" title={missing(shown[e.key].lost, t)}>{missing(shown[e.key].lost, t)}</div> : <div className="truncate text-[11px] text-ink-3">{e.generated ? t('slides.generatedHint').split(';')[0] : e.shape ? tr(t, `editor.shapeUse.${e.shape}`) : tr(t, `slides.layoutUse.${e.layout}`)}</div>}
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

export function LayoutPicker({ open, onClose, current, doc, onPick, theme, scope }: { open: boolean; onClose: () => void; current: string; doc?: SlideDoc; onPick: (layout: string, shape?: DiagramShape) => void; theme: string; scope: AssetScope }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <h2 className="mb-3 text-[16px] font-semibold">{t('editor.changeLayout')}</h2>
      <LayoutGrid
        current={current}
        doc={open ? doc : undefined}
        theme={theme}
        scope={scope}
        onPick={(l, shape) => {
          onPick(l, shape)
          onClose()
        }}
      />
    </Modal>
  )
}
