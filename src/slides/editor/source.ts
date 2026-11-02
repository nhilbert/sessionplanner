import type { Deck, DeckSlide, Slide, SlideTemplate } from '@/domain/types'
import type { DeckSlideRef } from '@/domain/deck'
import { newId } from '@/domain/ops'
import { MAX_SLIDES, normalizeSlideHtml } from '@/domain/slides'

/**
 * What the slide editor is open on (docs/slides.md, section 7). Wherever slides are shown – a step, the deck of a
 * workshop, a library entry, the templates, a deck of the pool – the editor opens on a source of the same shape, so
 * paging, editing, inserting, removing, moving and undo behave the same everywhere.
 */

export interface EditorSlide {
  /** Unique within the source; stays when the slide moves. */
  key: string
  html: string
  /** The container the slide belongs to (a step, a library entry, the templates, a pool deck): inserting and moving stay inside it. */
  group: string
  /** What to call the container in the header and between thumbnails. */
  groupLabel: string
  editable: boolean
  /** A slide the app generates from the plan: shown, explained, not edited. `adopt` names the step it can become a slide of. */
  generated?: { kind: 'title' | 'agenda' | 'break'; adopt?: string }
  /** A slide of the pool: shown and taken from, never changed. */
  pool?: boolean
}

export interface SlideSource {
  /** What the editor is open on, for the header ("Schritt", "Folien des Workshops" …). */
  context: string
  /** The slides as rendered now. */
  slides: EditorSlide[]
  /** The newest list, read from the store at the moment of asking (a write a moment ago included). */
  current(): EditorSlide[]
  write?(key: string, html: string): void
  /** Inserts slides into a group at a position; the keys of those inserted (fewer when a limit is reached). */
  insert?(group: string, at: number, html: string[]): string[] | Promise<string[]>
  remove?(key: string): void | Promise<void>
  /** Moves a slide to a position within its group. */
  move?(key: string, to: number): void | Promise<void>
  /** The planner counts an editor session as one undo step. */
  session?: { begin(): void; end(): void }
  /** The deck: what can be done about a generated slide. */
  openDetails?(): void
  hide?(kind: 'agenda' | 'break'): void
}

/** The slides of one step or library entry: one list, read and written through the caller's store. */
export function listSource(o: { context: string; label: string; get(): Slide[]; set(slides: Slide[]): void; editable: boolean; session?: SlideSource['session'] }): SlideSource {
  const view = (list: Slide[]): EditorSlide[] => list.map((s) => ({ key: s.id, html: s.html, group: 'list', groupLabel: o.label, editable: o.editable }))
  return {
    context: o.context,
    slides: view(o.get()),
    current: () => view(o.get()),
    session: o.session,
    ...(o.editable
      ? {
          write: (key, html) => {
            const list = o.get()
            if (list.some((s) => s.id === key)) o.set(list.map((s) => (s.id === key ? { ...s, html } : s)))
          },
          insert: (_group, at, html) => {
            const list = o.get()
            const room = Math.max(0, MAX_SLIDES - list.length)
            const fresh = html.slice(0, room).map((h) => ({ id: newId(), html: normalizeSlideHtml(h) }))
            if (fresh.length) o.set([...list.slice(0, at), ...fresh, ...list.slice(at)])
            return fresh.map((s) => s.id)
          },
          remove: (key) => o.set(o.get().filter((s) => s.id !== key)),
          move: (key, to) => {
            const list = o.get()
            const from = list.findIndex((s) => s.id === key)
            if (from === -1 || to < 0 || to >= list.length || from === to) return
            const next = [...list]
            const [s] = next.splice(from, 1)
            next.splice(to, 0, s)
            o.set(next)
          },
        }
      : {}),
  }
}

/**
 * The deck of a workshop: the steps' slides in agenda order with the generated ones. A step's slide is edited in
 * its step (the key is "item:slide"); generated slides are shown read-only with what can be done instead.
 */
export function deckSource(o: {
  context: string
  /** The deck now (deckOf over the store's state). */
  deck(): DeckSlideRef[]
  title(itemId: string): string
  generatedLabel(kind: 'title' | 'agenda' | 'break'): string
  slidesOf(itemId: string): Slide[] | undefined
  setSlides(itemId: string, slides: Slide[]): void
  editable: boolean
  session?: SlideSource['session']
  openDetails(): void
  hide(kind: 'agenda' | 'break'): void
}): SlideSource {
  const view = (deck: DeckSlideRef[]): EditorSlide[] =>
    deck.map((r) =>
      r.generated
        ? { key: r.key, html: r.html, group: `generated:${r.key}`, groupLabel: o.generatedLabel(r.generated), editable: false, generated: { kind: r.generated, adopt: r.generated === 'break' ? r.itemId : undefined } }
        : { key: r.key, html: r.html, group: r.itemId!, groupLabel: o.title(r.itemId!), editable: o.editable },
    )
  const split = (key: string): [string, string] => {
    const at = key.indexOf(':')
    return [key.slice(0, at), key.slice(at + 1)]
  }
  const list = (itemId: string) => listSource({ context: '', label: '', get: () => o.slidesOf(itemId) ?? [], set: (s) => o.setSlides(itemId, s), editable: true })
  return {
    context: o.context,
    slides: view(o.deck()),
    current: () => view(o.deck()),
    session: o.session,
    openDetails: o.openDetails,
    hide: o.hide,
    ...(o.editable
      ? {
          write: (key, html) => {
            const [itemId, slideId] = split(key)
            if (o.slidesOf(itemId)) list(itemId).write!(slideId, html)
          },
          insert: (group, at, html) => (o.slidesOf(group) ? (list(group).insert!(group, at, html) as string[]).map((id) => `${group}:${id}`) : []),
          remove: (key) => {
            const [itemId, slideId] = split(key)
            if (o.slidesOf(itemId)) void list(itemId).remove!(slideId)
          },
          move: (key, to) => {
            const [itemId, slideId] = split(key)
            if (o.slidesOf(itemId)) void list(itemId).move!(slideId, to)
          },
        }
      : {}),
  }
}

/** All templates, in their order: edited, duplicated, inserted, removed and moved as one list. */
export function templatesSource(o: {
  context: string
  get(): SlideTemplate[]
  save(input: { name: string; html: string; position?: number }, id?: string): Promise<SlideTemplate>
  remove(id: string): Promise<void>
  nameFor(html: string): string
}): SlideSource {
  const view = (list: SlideTemplate[]): EditorSlide[] => list.map((t) => ({ key: t.id, html: t.html, group: 'templates', groupLabel: t.name, editable: true }))
  /** A position between the neighbours at `at` (positions are numbers with room between them). */
  const positionAt = (list: SlideTemplate[], at: number): number => {
    const before = list[at - 1]?.position
    const after = list[at]?.position
    if (before === undefined && after === undefined) return 1
    if (before === undefined) return after! - 1
    if (after === undefined) return before + 1
    return (before + after) / 2
  }
  return {
    context: o.context,
    slides: view(o.get()),
    current: () => view(o.get()),
    write: (key, html) => {
      const t = o.get().find((x) => x.id === key)
      if (t && t.html !== html) void o.save({ name: t.name, html, position: t.position }, key)
    },
    insert: async (_group, at, html) => {
      const keys: string[] = []
      for (const [n, h] of html.entries()) {
        const list = o.get()
        const saved = await o.save({ name: o.nameFor(h), html: h, position: positionAt(list, at + n) })
        keys.push(saved.id)
      }
      return keys
    },
    remove: (key) => o.remove(key),
    move: async (key, to) => {
      const list = o.get()
      const from = list.findIndex((x) => x.id === key)
      if (from === -1 || from === to) return
      const rest = list.filter((x) => x.id !== key)
      const t = list[from]
      await o.save({ name: t.name, html: t.html, position: positionAt(rest, to) }, key)
    },
  }
}

/** A deck of the pool: shown and paged, never changed (its slides are taken into steps as copies). */
export function poolSource(o: { context: string; deck: Deck; slides: DeckSlide[] }): SlideSource {
  const view = (): EditorSlide[] => o.slides.map((s) => ({ key: s.id, html: s.html, group: o.deck.id, groupLabel: o.deck.title, editable: false, pool: true }))
  return { context: o.context, slides: view(), current: view }
}
