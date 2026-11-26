import type { DeckSlideRef } from '@/domain/deck'
import type { PresentPosition } from '@/domain/ops'
import type { PresentNews } from '@/store/usePlanner'

/**
 * Where a window stands: the deck key of the slide, its number when the key is gone (the slide was deleted meanwhile),
 * and the stage of the slide's build that shows (docs/slide-builds.md; 0: the slide as it comes on).
 */
export interface Spot {
  key: string | null
  n: number
  stage: number
}

/** The stage of a slide shown whole, whatever its build: no slide has as many. */
export const WHOLE = Number.MAX_SAFE_INTEGER

/** How long a paging waits for its echo; without one the stream is down and other windows' paging counts again. */
const ECHO_MS = 5000

/**
 * One window of a presentation (docs/slides.md, Presenting): the presentation, a presenter view, a phone as remote.
 * Every window can page; the server keeps the slide and tells every window, so a window that joins later starts there.
 * The server's order decides: while this window's own paging is on its way, news from before it is ignored. Without the
 * server (the network is down), windows of this browser still follow each other over a broadcast channel, and the first
 * connection afterwards tells the server where they stand.
 */
export function createFollower(o: {
  tab: string
  /** Opened to show a particular slide ("Present from here"): leads instead of joining. */
  lead: boolean
  /** Only those who can edit lead others; a view guest's windows follow each other in this browser. */
  canLead: () => boolean
  deck: () => DeckSlideRef[]
  /** The index shown now. */
  at: () => number
  /** The stage of that slide's build shown now; a window without builds leaves it out. */
  stage?: () => number
  show: (spot: Spot) => void
  send: (position: PresentPosition) => Promise<unknown>
  broadcast: (spot: Spot) => void
  later?: (fn: () => void, ms: number) => void
}) {
  let no = 0
  let pending: string | null = null
  let started = false
  let claim = false
  let offline = false
  const later = o.later ?? ((fn, ms) => void setTimeout(fn, ms))

  /** Shows slide `i` at a stage of its build, here and in every window that follows; a slide comes on at its first. */
  function go(i: number, stage = 0) {
    const deck = o.deck()
    if (!deck.length) return
    const at = Math.min(Math.max(i, 0), deck.length - 1)
    const spot = { key: deck[at].key, n: at + 1, stage: Math.max(0, stage) }
    o.show(spot)
    if (!o.canLead()) return o.broadcast(spot)
    const tag = `${o.tab}.${++no}`
    pending = tag
    later(() => {
      if (pending === tag) pending = null
    }, ECHO_MS)
    // the stage always goes along, 0 too: a position without one comes from a window that knows no builds
    o.send({ key: spot.key, n: spot.n, tag, stage: Math.min(spot.stage, 500) }).then(
      () => (offline = false),
      () => {
        if (pending === tag) pending = null
        offline = true
        o.broadcast(spot)
      },
    )
  }

  /** Claims the position for this window once the deck is there. */
  function lead() {
    if (o.deck().length) go(o.at(), o.stage?.() ?? 0)
    else claim = true
  }

  return {
    go,
    news(news: PresentNews) {
      if (!started) {
        started = true
        if (o.lead || (news.hello && !news.position)) return lead()
      } else if (news.hello && offline) {
        // Paged here while the server was out of reach: this window knows best.
        offline = false
        return lead()
      }
      if (!news.position) return
      if (pending) {
        if (news.position.tag !== pending) return
        pending = null
      }
      // A window from before the builds (a tab left open over an update) pages slides and names no stage: its slides
      // show whole, as they do in that window; at their first stage they would stay at their header for good.
      o.show({ key: news.position.key, n: news.position.n, stage: news.position.stage ?? WHOLE })
    },
    local(spot: Spot) {
      pending = null
      o.show(spot)
    },
    ready() {
      if (!claim || !o.deck().length) return
      claim = false
      go(o.at(), o.stage?.() ?? 0)
    },
  }
}

/** The index a spot points at in the deck: by key, by number when the slide is gone. */
export function indexOf(deck: DeckSlideRef[], spot: Pick<Spot, 'key' | 'n'>): number {
  if (!deck.length) return 0
  const k = spot.key ? deck.findIndex((r) => r.key === spot.key) : -1
  return k !== -1 ? k : Math.min(Math.max(spot.n - 1, 0), deck.length - 1)
}
