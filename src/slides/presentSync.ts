import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { usePlanner } from '@/store/usePlanner'
import { createFollower, indexOf, type Spot } from './follower'
import { presentChannel } from './presentChannel'

const TAB = crypto.randomUUID()

/**
 * The presentation of the open workshop (usePlanner) in this window: the index shown and `go` to page. `start` is the
 * slide number from the link (1-based); `lead` makes this window lead from there instead of joining.
 */
export function usePresentSync(id: string, deck: DeckSlideRef[], start: number, lead: boolean) {
  const [spot, setSpot] = useState<Spot>({ key: null, n: start })
  const at = useMemo(() => indexOf(deck, spot), [deck, spot])
  const data = usePlanner((s) => s.data)
  const canLead = !!data && (!data.access || data.access.role === 'edit')
  const now = useRef({ deck, at, canLead })
  now.current = { deck, at, canLead }
  const channel = useRef<BroadcastChannel | null>(null)

  const follower = useMemo(
    () =>
      createFollower({
        tab: TAB,
        lead,
        canLead: () => now.current.canLead,
        deck: () => now.current.deck,
        at: () => now.current.at,
        show: setSpot,
        send: (position) => api.present(id, position),
        broadcast: (s) => channel.current?.postMessage(s),
      }),
    // One follower per workshop and window; `lead` counts only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  useEffect(() => {
    const c = presentChannel(id)
    channel.current = c
    c.onmessage = (e: MessageEvent<Spot>) => {
      if (typeof e.data?.n === 'number') follower.local({ key: typeof e.data.key === 'string' ? e.data.key : null, n: e.data.n })
    }
    // Every message, not only the last one a render would see: the order decides who leads.
    const news = usePlanner.getState().presenting
    if (news) follower.news(news)
    const unsubscribe = usePlanner.subscribe((s, before) => {
      if (s.presenting && s.presenting !== before.presenting) follower.news(s.presenting)
    })
    return () => {
      unsubscribe()
      c.close()
      channel.current = null
    }
  }, [id, follower])
  useEffect(() => {
    if (deck.length && canLead) follower.ready()
  }, [deck.length, canLead, follower])

  return { at, go: follower.go }
}
