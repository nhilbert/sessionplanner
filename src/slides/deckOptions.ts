import { useMemo } from 'react'
import { DECK_DEFAULTS, type DeckOptions } from '@/domain/deck'
import { useLocalState } from '@/components/ui'

/** The deck options (agenda slides, break slides), remembered per device. */
export function useDeckOptions(): [DeckOptions, (patch: Partial<DeckOptions>) => void] {
  const [raw, setRaw] = useLocalState('sp.deck', JSON.stringify(DECK_DEFAULTS))
  const options = useMemo((): DeckOptions => {
    try {
      return { ...DECK_DEFAULTS, ...(JSON.parse(raw) as Partial<DeckOptions>) }
    } catch {
      return DECK_DEFAULTS
    }
  }, [raw])
  return [options, (patch) => setRaw(JSON.stringify({ ...options, ...patch }))]
}
