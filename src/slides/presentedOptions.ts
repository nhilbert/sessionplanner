import { create } from 'zustand'
import type { DeckOptions } from '@/domain/deck'

/**
 * The deck options a running presentation is shown with (docs/slides.md, Presenting). Which generated slides a deck
 * holds is a choice per device (deckOptions.ts), but the windows of one presentation must hold the same deck: with the
 * agenda slides on at the laptop and off on the phone, the same number is another slide. So the window that starts a
 * presentation gives it its options, the server keeps them beside the slide shown, and every window that follows or
 * joins builds the presented deck from them. The device's own choice stays for the Slides tab, printing and exports.
 */
const useStore = create<{ shared: Record<string, DeckOptions> }>(() => ({ shared: {} }))

const same = (a: DeckOptions | undefined, b: DeckOptions): boolean => !!a && a.agenda === b.agenda && a.breaks === b.breaks && a.groups === b.groups && a.pictures === b.pictures && a.shift === b.shift

/** The options the presentation of a workshop runs with, once a window has named them. */
export const usePresentedOptions = (workshopId: string | undefined): DeckOptions | undefined => useStore((s) => (workshopId ? s.shared[workshopId] : undefined))
export const presentedOptionsNow = (workshopId: string): DeckOptions | undefined => useStore.getState().shared[workshopId]
export function setPresentedOptions(workshopId: string, options: DeckOptions | undefined): void {
  const { shared } = useStore.getState()
  if (!options) {
    if (workshopId in shared) useStore.setState({ shared: Object.fromEntries(Object.entries(shared).filter(([id]) => id !== workshopId)) })
  } else if (!same(shared[workshopId], options)) useStore.setState({ shared: { ...shared, [workshopId]: options } })
}
