import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import type { Slide, WorkshopState } from '@/domain/types'
import { deckOf } from '@/domain/deck'
import { newId } from '@/domain/ops'
import { slideAssets } from '@/domain/slides'
import { moveSlide, slideHomes, type SlideMove } from '@/domain/slideMove'
import { usePlanner } from '@/store/usePlanner'
import { useSettings } from '@/store/useSettings'
import { themeOf, useTheme } from './SlideView'
import { deckLabels } from './deckLabels'
import { deckOptionsNow, updateDeckOptions, useDeckOptions } from './deckOptions'
import { poolPicturesNow, usePool } from '@/store/useThemes'
import { SlideEditor } from './editor/SlideEditor'
import { deckSource, listSource, type SlideTransfer } from './editor/source'
import { MoveSlideDialog } from './SlideSort'
import { tr } from './editor/fields'
import { pageUrl } from '@/domain/addresses'

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

/** Moves a slide of the open workshop (domain/slideMove.ts) as one change of the planner, so one undo; null when it cannot be done. */
export function moveSlideInPlanner(fromItem: string, slideId: string, toItem: string, at?: number): SlideMove | null {
  const data = usePlanner.getState().data
  const move = data ? moveSlide(data, fromItem, slideId, toItem, at) : null
  if (move?.ops.length) usePlanner.getState().change(move.ops)
  return move
}

/** The slide a thumbnail's "Move to …" asks about, from a step's strip or the deck tab. */
export const useSlideMoving = create<{ slide: { itemId: string; slideId: string } | null; ask: (itemId: string, slideId: string) => void; close: () => void }>((set) => ({
  slide: null,
  ask: (itemId, slideId) => set({ slide: { itemId, slideId } }),
  close: () => set({ slide: null }),
}))

/** The dialog that asks where that slide goes, and the move; one for the page, like the editor. */
export function PlannerSlideMover({ onNotice }: { onNotice: (text: string) => void }) {
  const { t } = useTranslation()
  const slide = useSlideMoving((s) => s.slide)
  const close = useSlideMoving((s) => s.close)
  const data = usePlanner((s) => s.data)
  if (!slide || !data) return null
  return (
    <MoveSlideDialog
      open
      homes={slideHomes(data)}
      current={slide.itemId}
      onClose={close}
      onPick={(itemId) => {
        const to = data.items.find((i) => i.id === itemId)
        close()
        if (to && moveSlideInPlanner(slide.itemId, slide.slideId, itemId)) onNotice(t('slides.movedTo', { title: to.title || tr(t, `kinds.${to.kind}`) }))
      }}
    />
  )
}

/**
 * The editor of the open workshop, on a step or on the deck; every change goes through the planner (live, one undo step
 * per session). In the presenter view "Present from here" shows the slide at once (`onPresent`) instead of opening a window.
 */
export function PlannerSlideEditor({ owner, onDetails, onPresent, onNotice }: { owner: boolean; onDetails?: () => void; onPresent?: (n: number) => void; onNotice?: (text: string) => void }) {
  const { t } = useTranslation()
  const target = useSlideEditing((s) => s.target)
  const close = useSlideEditing((s) => s.close)
  const data = usePlanner((s) => s.data)
  const settings = useSettings((s) => s.settings)
  const theme = useTheme(data ? themeOf(data.workshop, settings) : 'default')
  usePool(theme) // the generated slides of the deck source take the pool's pictures
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
    return state ? deckOf(state, deckLabels(t), deckOptionsNow(), poolPicturesNow(theme)) : []
  }
  // Present from here: the position in the deck as the presentation shows it; a parked step is not in it.
  const presenting = {
    presentAt: (key: string) => {
      const deckKey = target.kind === 'step' ? `${target.itemId}:${key}` : key
      const at = deckNow().findIndex((r) => r.key === deckKey)
      return at === -1 ? null : at + 1
    },
    present: onPresent ?? ((n: number) => window.open(pageUrl(`/w/${data.workshop.id}/present?from=${n}`), '_blank', 'noopener')),
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
          hide: (kind) => updateDeckOptions(kind === 'agenda' ? { agenda: false } : kind === 'break' ? { breaks: false } : { groups: false }),
          pictureOf: (key) => now()?.workshop.pictures?.[key] ?? '',
          setPicture: (key, hash) => {
            const state = now()
            if (!state) return
            const pictures = { ...(state.workshop.pictures ?? {}) }
            if (hash) pictures[key] = hash
            else delete pictures[key]
            usePlanner.getState().change([{ op: 'set', entity: 'workshop', id: state.workshop.id, fields: { pictures } }])
          },
        })
  // Into another step: by the step's id and the slide's, so undo finds a slide that has left what the editor shows.
  const transfer: SlideTransfer = {
    homes: () => {
      const state = now()
      return state ? slideHomes(state) : []
    },
    where: (key) => {
      if (target.kind === 'step') return { home: target.itemId, slide: key }
      const ref = deckNow().find((r) => r.key === key)
      return ref?.itemId && !ref.generated ? { home: ref.itemId, slide: key.slice(ref.itemId.length + 1) } : null
    },
    move: (slide, from, to, at) => {
      const move = moveSlideInPlanner(from, slide, to, at)
      return move && { slide: move.slideId, fromAt: move.fromAt, toAt: move.toAt }
    },
    keyOf: (home, slide) => {
      if (target.kind === 'step') return home === target.itemId ? slide : null
      return deckNow().some((r) => r.key === `${home}:${slide}`) ? `${home}:${slide}` : null
    },
    label,
  }
  const source = { ...base, ...presenting, transfer }
  return <SlideEditor key={session.current.id} source={source} start={target.key} mode={target.mode} onClose={close} theme={theme} scope={{ workshopId: data.workshop.id }} owner={owner} canEdit known={known} onNotice={onNotice} />
}
