import { create } from 'zustand'
import { DECK_DEFAULTS, type DeckOptions } from '@/domain/deck'

/**
 * The deck options (agenda slides, break slides), remembered per device and shared by everything that shows the deck
 * at once – the deck tab, the slide editor on the deck, presenting, printing – so hiding the agenda slides in one
 * place hides them everywhere on the page.
 */
const KEY = 'sp.deck'

function initial(): DeckOptions {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DECK_DEFAULTS, ...(JSON.parse(raw) as Partial<DeckOptions>) } : DECK_DEFAULTS
  } catch {
    return DECK_DEFAULTS
  }
}

const useStore = create<{ options: DeckOptions; update: (patch: Partial<DeckOptions>) => void }>((set, get) => ({
  options: initial(),
  update: (patch) => {
    const options = { ...get().options, ...patch }
    set({ options })
    try {
      localStorage.setItem(KEY, JSON.stringify(options))
    } catch {
      // not remembered
    }
  },
}))

export function useDeckOptions(): [DeckOptions, (patch: Partial<DeckOptions>) => void] {
  const options = useStore((s) => s.options)
  const update = useStore((s) => s.update)
  return [options, update]
}

/** The options now, outside React (the editor's deck source reads them when it is asked). */
export const deckOptionsNow = (): DeckOptions => useStore.getState().options
export const updateDeckOptions = (patch: Partial<DeckOptions>) => useStore.getState().update(patch)
