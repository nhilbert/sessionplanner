import type { WorkshopState } from './types.ts'
import { entriesIn, itemsIn, sortedDays } from './order.ts'
import { durationOf, formatTime, scheduleDay } from './time.ts'
import { esc, slideLayout } from './slides.ts'
import { type DeckPool, EMPTY_DECK_POOL, type PictureKind, poolOfKind, titlePictureKind } from './pool.ts'
import { isTitleVariant, resolveTitleVariant, titleVariantClass, type ThemeTitle } from './titleVariants.ts'

/**
 * The deck of a workshop (docs/slides.md): the slides of its placed items in agenda order, with the slides the
 * app generates from the plan: a title slide (one per day when there are several), an agenda per day with the
 * computed times, a break slide with its end time for every break without slides of its own and, when asked for,
 * a divider slide with the group's title before the first step of every group.
 */

export interface DeckLabels {
  untitled: string
  /** "Tag 2" */
  day: (n: number) => string
  agenda: string
  breakTitle: string
  /** "bis 10:45" */
  until: (time: string) => string
  /** "15 Minuten" */
  minutes: (n: number) => string
  /** A day's date, long. */
  date: (date: string) => string
}

export interface DeckOptions {
  agenda: boolean
  breaks: boolean
  /** A divider slide with the group's title at the start of every group that has a title and steps. */
  groups: boolean
  /** Whether the generated slides take pictures from the theme's pool. */
  pictures: boolean
  /** Turns the pool's rotation on (the viewer asked for other pictures); 0 = the workshop's own order. */
  shift: number
}

export const DECK_DEFAULTS: DeckOptions = { agenda: true, breaks: true, groups: false, pictures: true, shift: 0 }

/** A small stable number from a string, so a workshop starts the pool's rotation at a place of its own. */
export function seedOf(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h
}

/** Lines an agenda slide holds before a second one follows. */
export const AGENDA_LINES = 11

export type GeneratedKind = 'title' | 'agenda' | 'break' | 'group'

export interface DeckSlideRef {
  key: string
  html: string
  /** The item it belongs to; none for a generated slide. */
  itemId?: string
  generated?: GeneratedKind
  /** What to call it in a list: the item's title, or the kind of generated slide. */
  caption: string
  /** The part of the deck the slide is in ("Teil 2 von 5"): counted by the section slides, set once the deck has two or more, from the first section on. */
  part?: { n: number; of: number }
}

/**
 * @param pool the photos and illustrations of the workshop's theme (asset hashes): the title, agenda and break slides
 * take them in turn, each from the kind its place shows (`pool.ts`: a photo where the picture is cropped, an
 * illustration where it stands whole), starting at a place the workshop id decides, so the same deck shows the same
 * pictures every time.
 * @param title what the workshop's theme says about title slides: the variant of those that chose none, the variants
 * on offer, and a picture of the pool that stands on them instead of the pool's next. Unknown (the list of themes has
 * not come): a title slide carries only the variant chosen for it, and the theme's stylesheet decides the others.
 */
export function deckOf(state: WorkshopState, labels: DeckLabels, options: DeckOptions = DECK_DEFAULTS, pool: DeckPool = EMPTY_DECK_POOL, title?: ThemeTitle): DeckSlideRef[] {
  const out: DeckSlideRef[] = withParts(build(state, labels, options, pool, title))
  return out
}

/**
 * The section tracker: every slide from the first section slide on learns which part of how many it is in. The
 * groups' divider slides are section slides and count like written ones.
 */
function withParts(deck: DeckSlideRef[]): DeckSlideRef[] {
  const opens = (s: DeckSlideRef) => (!s.generated || s.generated === 'group') && slideLayout(s.html) === 'section'
  const of = deck.filter(opens).length
  if (of < 2) return deck
  let n = 0
  for (const s of deck) {
    if (opens(s)) n++
    if (n) s.part = { n, of }
  }
  return deck
}

function build(state: WorkshopState, labels: DeckLabels, options: DeckOptions, pool: DeckPool, theme: ThemeTitle | undefined): DeckSlideRef[] {
  const out: DeckSlideRef[] = []
  let taken = 0
  /**
   * The picture of a generated slide: chosen by hand for its key, else the next in turn of the kind its place shows.
   * The turn is one count over both kinds, and a place whose kind the pool does not hold takes its turn without a
   * picture (a photo never stands in for an illustration, nor the other way round): so the slides after it keep their
   * pictures, whatever a title's variant is changed to. A slide with a picture `fixed` by the theme shows that one,
   * where it is of the place's kind, and takes its turn too.
   */
  const picture = (key: string, kind: PictureKind, fixed = ''): string => {
    const chosen = state.workshop.pictures?.[key]
    if (chosen) return `<figure><img src="asset:${chosen}" alt=""></figure>`
    if (!options.pictures) return ''
    // a theme may keep its agenda, break and divider slides to pictures chosen by hand; they still take their turn, so
    // the title slides after them show what they would anyway
    if (pool.turn === false && !key.startsWith('title:')) {
      taken++
      return ''
    }
    const turn = seedOf(state.workshop.id) + (options.shift ?? 0) + taken++
    const list = poolOfKind(pool, pool.whole ? 'illustration' : kind)
    if (!list.length) return ''
    return `<figure><img src="asset:${fixed && list.includes(fixed) ? fixed : list[turn % list.length]}" alt=""></figure>`
  }
  const days = sortedDays(state.days)
  const title = state.workshop.title || labels.untitled
  const meta = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')
  days.forEach((day, n) => {
    const items = itemsIn(state, day.id)
    const schedule = scheduleDay(day.startMin, day.endMin, items)
    const eyebrow = days.length > 1 ? `${labels.day(n + 1)} · ${labels.date(day.date)}` : labels.date(day.date)
    // The variant of this day's title slide stands on it as a class: the one chosen for it where the theme offers that,
    // else the theme's, so a theme's own rules can tell the variants apart. A title without a picture has none in its
    // markup, as themes ask whether there is one.
    const chosen = state.workshop.variants?.[`title:${day.id}`]
    const variant = theme ? resolveTitleVariant(chosen, theme) : isTitleVariant(chosen) ? chosen : null
    const figure = picture(`title:${day.id}`, titlePictureKind(variant), theme?.picture)
    out.push({
      key: `title:${day.id}`,
      generated: 'title',
      caption: days.length > 1 ? `${labels.day(n + 1)}` : title,
      html: `<section class="slide title${variant ? ` ${titleVariantClass(variant)}` : ''}"><div class="text"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${state.workshop.client ? `<p class="subtitle">${esc(state.workshop.client)}</p>` : ''}${state.workshop.location ? `<p class="meta">${esc(meta([state.workshop.location]))}</p>` : ''}</div>${variant === 'none' ? '' : figure}</section>`,
    })
    if (options.agenda) {
      const rows = entriesIn(state, day.id)
        .map((e) => {
          if (e.type === 'group') {
            const first = e.items.find((i) => schedule.slots[i.id])
            return first ? { when: schedule.slots[first.id].start, text: e.group.title, cls: '' } : null
          }
          if (e.item.kind === 'note') return null
          const slot = schedule.slots[e.item.id]
          return slot ? { when: slot.start, text: e.item.title || (e.item.kind === 'break' ? labels.breakTitle : ''), cls: e.item.kind === 'break' ? ' class="break"' : '' } : null
        })
        .filter((r): r is { when: number; text: string; cls: string } => !!r)
      // A slide holds eleven lines; a longer day gets a second agenda slide rather than a smaller type.
      const pages = Math.ceil(rows.length / AGENDA_LINES)
      for (let p = 0; p < pages; p++) {
        const part = rows.slice(p * AGENDA_LINES, (p + 1) * AGENDA_LINES)
        const list = `<ol class="agenda${part.length > 8 ? ' many' : ''}">${part.map((r) => `<li><span class="when">${formatTime(r.when)}</span><span${r.cls}>${esc(r.text)}</span></li>`).join('')}</ol>`
        const pic = picture(`agenda:${day.id}:${p}`, 'picture')
        out.push({
          key: `agenda:${day.id}:${p}`,
          generated: 'agenda',
          caption: pages > 1 ? `${labels.agenda} ${p + 1}/${pages}` : labels.agenda,
          html: `<section class="slide agenda"><header><h2>${esc(labels.agenda)}${pages > 1 ? ` <small>${p + 1}/${pages}</small>` : ''}</h2></header>${pic ? `<div class="cols">${list}${pic}</div>` : list}</section>`,
        })
      }
    }
    const dividers = new Map(options.groups ? entriesIn(state, day.id).flatMap((e) => (e.type === 'group' && e.group.title.trim() && e.items.length ? [[e.items[0].id, e.group] as const] : [])) : [])
    for (const item of items) {
      const group = dividers.get(item.id)
      if (group) {
        out.push({
          key: `group:${group.id}`,
          generated: 'group',
          caption: group.title,
          html: `<section class="slide section"><div class="text"><h1>${esc(group.title)}</h1></div>${picture(`group:${group.id}`, 'picture')}</section>`,
        })
      }
      if (item.kind === 'marker' || item.kind === 'note') continue
      if (item.slides.length) {
        for (const s of item.slides) out.push({ key: `${item.id}:${s.id}`, html: s.html, itemId: item.id, caption: item.title })
      } else if (item.kind === 'break' && options.breaks) {
        const slot = schedule.slots[item.id]
        out.push({
          key: `break:${item.id}`,
          generated: 'break',
          itemId: item.id,
          caption: item.title || labels.breakTitle,
          html: `<section class="slide break"><div class="text"><h1>${esc(item.title || labels.breakTitle)}</h1><p class="until">${esc(labels.minutes(durationOf(item)))}${slot ? ` · <strong>${esc(labels.until(formatTime(slot.end)))}</strong>` : ''}</p></div>${picture(`break:${item.id}`, 'picture')}</section>`,
        })
      }
    }
  })
  return out
}

/** The code points above the Latin ranges that the deck's text uses (which Noto slices a standalone file needs). */
export function cjkCodePoints(html: string): Set<number> {
  return new Set([...codePoints(html)].filter((cp) => cp >= 0x2e80))
}

/** Every character of a deck's text (tags left out), for picking the font files it needs. */
export function codePoints(html: string): Set<number> {
  const set = new Set<number>()
  for (const ch of html.replace(/<[^>]+>/g, ' ')) set.add(ch.codePointAt(0)!)
  return set
}
