import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import type { Slide, WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { newId } from '@/domain/ops'
import { slideAssets } from '@/domain/slides'
import { usePlanner } from '@/store/usePlanner'
import { useSettings } from '@/store/useSettings'
import { themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { deckOptionsNow, updateDeckOptions, useDeckOptions } from './deckOptions'
import { SlideEditor } from './editor/SlideEditor'
import { deckSource, listSource } from './editor/source'
import { tr } from './editor/fields'

/**
 * Where the planner opens the slide editor: on a step (from its details or the slide count on its card) or on the
 * whole deck (from the deck tab). One editor for the page, opened from anywhere through this store.
 */
export type SlideTarget = ({ kind: 'step'; itemId: string; key: string } | { kind: 'deck'; key: string }) & {
  /** Opens to look at (the default) or straight into editing (a slide just added, "Folien bearbeiten"). */
  mode?: 'view' | 'edit'
}

export const useSlideEditing = create<{ target: SlideTarget | null; open: (target: SlideTarget) => void; close: () => void }>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

/** The editor of the open workshop, on a step or on the deck; every change goes through the planner (live, one undo step per session). */
export function PlannerSlideEditor({ owner, onDetails }: { owner: boolean; onDetails: () => void }) {
  const { t } = useTranslation()
  const target = useSlideEditing((s) => s.target)
  const close = useSlideEditing((s) => s.close)
  const data = usePlanner((s) => s.data)
  const settings = useSettings((s) => s.settings)
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')
  useDeckOptions() // follows the deck options, so hiding agenda or break slides shows at once
  // One planner undo step per opening of the editor.
  const session = useRef<{ id: string; target: SlideTarget | null }>({ id: newId(), target: null })
  if (session.current.target !== target) session.current = { id: newId(), target }
  const sessionHooks = useMemo(() => {
    const id = session.current.id
    return { begin: () => usePlanner.getState().beginGroup(id), end: () => usePlanner.getState().endGroup(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.current.id])
  const known = useMemo(() => [...new Set((data?.items ?? []).flatMap((i) => i.slides.flatMap((s) => slideAssets(s.html))))], [data?.items])

  if (!target || !data) return null
  const now = (): WorkshopState | null => usePlanner.getState().data
  const itemOf = (id: string) => now()?.items.find((i) => i.id === id)
  const setSlides = (id: string, slides: Slide[]) => usePlanner.getState().change([{ op: 'set', entity: 'item', id, fields: { slides } }])
  const label = (id: string) => {
    const item = itemOf(id)
    return item?.title || (item ? tr(t, `kinds.${item.kind}`) : '')
  }
  const deckNow = () => {
    const state = now()
    return state ? deckOf(state, deckLabels(t), deckOptionsNow()) : []
  }
  // Present from here: the position in the deck as the presentation shows it; a parked step is not in it.
  const presenting = {
    presentAt: (key: string) => {
      const deckKey = target.kind === 'step' ? `${target.itemId}:${key}` : key
      const at = deckNow().findIndex((r) => r.key === deckKey)
      return at === -1 ? null : at + 1
    },
    present: (n: number) => window.open(`/w/${data.workshop.id}/present?n=${n}`, '_blank', 'noopener'),
  }
  const base =
    target.kind === 'step'
      ? listSource({ context: t('editor.ctx.step'), label: label(target.itemId), get: () => itemOf(target.itemId)?.slides ?? [], set: (s) => setSlides(target.itemId, s), editable: true, session: sessionHooks })
      : deckSource({
          context: t('editor.ctx.deck'),
          deck: deckNow,
          title: label,
          generatedLabel: (kind) => tr(t, `slides.generated.${kind}`, { n: '' }).trim(),
          slidesOf: (id) => itemOf(id)?.slides,
          setSlides,
          editable: true,
          session: sessionHooks,
          openDetails: onDetails,
          hide: (kind) => updateDeckOptions(kind === 'agenda' ? { agenda: false } : { breaks: false }),
        })
  const source = { ...base, ...presenting }
  return <SlideEditor key={session.current.id} source={source} start={target.key} mode={target.mode} onClose={close} theme={theme} scope={{ workshopId: data.workshop.id }} owner={owner} canEdit known={known} />
}
