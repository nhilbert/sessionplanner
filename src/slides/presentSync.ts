import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api'
import { buildStages, stepFrom } from '@/domain/build'
import type { DeckSlideRef } from '@/domain/deck'
import { usePlanner } from '@/store/usePlanner'
import { createFollower, indexOf, type Spot, WHOLE } from './follower'
import { presentChannel } from './presentChannel'

const TAB = crypto.randomUUID()

/**
 * The presentation of the open workshop (usePlanner) in this window: the index shown and `go` to jump to a slide.
 * `start` is the slide number from the link (1-based); `lead` makes this window lead from there instead of joining.
 *
 * A slide that builds (docs/slide-builds.md) comes on in stages: `stage` is how far the slide shown has come and
 * `stages` how many it has. `step` is what a click or an arrow does – the next stage, then the next slide; back takes
 * the last stage away, then goes to the slide before, whole; with `whole` it pages slides. `all` shows the slide
 * whole at once. A slide that lost a point meanwhile stands at its last stage.
 */
export function usePresentSync(id: string, deck: DeckSlideRef[], start: number, lead: boolean) {
  const [spot, setSpot] = useState<Spot>({ key: null, n: start, stage: 0 })
  const at = useMemo(() => indexOf(deck, spot), [deck, spot])
  const counts = useMemo(() => deck.map((s) => buildStages(s.html)), [deck])
  const stages = counts[at] ?? 0
  const stage = Math.min(spot.stage, stages)
  const data = usePlanner((s) => s.data)
  const canLead = !!data && (!data.access || data.access.role === 'edit')
  const now = useRef({ deck, at, stage, counts, canLead })
  now.current = { deck, at, stage, counts, canLead }
  const channel = useRef<BroadcastChannel | null>(null)

  const follower = useMemo(
    () =>
      createFollower({
        tab: TAB,
        lead,
        canLead: () => now.current.canLead,
        deck: () => now.current.deck,
        at: () => now.current.at,
        stage: () => now.current.stage,
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
      if (typeof e.data?.n === 'number') follower.local({ key: typeof e.data.key === 'string' ? e.data.key : null, n: e.data.n, stage: typeof e.data.stage === 'number' ? e.data.stage : WHOLE })
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

  const step = useCallback(
    (dir: 1 | -1, whole = false) => {
      const { counts, at, stage } = now.current
      const to = stepFrom(counts, at, stage, dir, whole)
      if (to.at !== at || to.stage !== stage) follower.go(to.at, to.stage)
    },
    [follower],
  )
  const all = useCallback(() => {
    const { counts, at, stage } = now.current
    if (stage < (counts[at] ?? 0)) follower.go(at, counts[at])
  }, [follower])

  return { at, stage, stages, go: follower.go, step, all }
}
