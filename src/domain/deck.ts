import type { WorkshopState } from './types.ts'
import { entriesIn, itemsIn, sortedDays } from './order.ts'
import { durationOf, formatTime, scheduleDay } from './time.ts'
import { esc } from './slides.ts'

/**
 * The deck of a workshop (docs/slides.md): the slides of its placed items in agenda order, with the slides the
 * app generates from the plan: a title slide (one per day when there are several), an agenda per day with the
 * computed times, and a break slide with its end time for every break without slides of its own.
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
}

export const DECK_DEFAULTS: DeckOptions = { agenda: true, breaks: true }

/** Lines an agenda slide holds before a second one follows. */
export const AGENDA_LINES = 11

export interface DeckSlideRef {
  key: string
  html: string
  /** The item it belongs to; none for a generated slide. */
  itemId?: string
  generated?: 'title' | 'agenda' | 'break'
  /** What to call it in a list: the item's title, or the kind of generated slide. */
  caption: string
}

export function deckOf(state: WorkshopState, labels: DeckLabels, options: DeckOptions = DECK_DEFAULTS): DeckSlideRef[] {
  const out: DeckSlideRef[] = []
  const days = sortedDays(state.days)
  const title = state.workshop.title || labels.untitled
  const meta = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')
  days.forEach((day, n) => {
    const items = itemsIn(state, day.id)
    const schedule = scheduleDay(day.startMin, day.endMin, items)
    const eyebrow = days.length > 1 ? `${labels.day(n + 1)} · ${labels.date(day.date)}` : labels.date(day.date)
    out.push({
      key: `title:${day.id}`,
      generated: 'title',
      caption: days.length > 1 ? `${labels.day(n + 1)}` : title,
      html: `<section class="slide title"><div class="text"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${state.workshop.client ? `<p class="subtitle">${esc(state.workshop.client)}</p>` : ''}${state.workshop.location ? `<p class="meta">${esc(meta([state.workshop.location]))}</p>` : ''}</div></section>`,
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
        out.push({
          key: `agenda:${day.id}:${p}`,
          generated: 'agenda',
          caption: pages > 1 ? `${labels.agenda} ${p + 1}/${pages}` : labels.agenda,
          html: `<section class="slide agenda"><header><h2>${esc(labels.agenda)}${pages > 1 ? ` <small>${p + 1}/${pages}</small>` : ''}</h2></header><ol class="agenda${part.length > 8 ? ' many' : ''}">${part.map((r) => `<li><span class="when">${formatTime(r.when)}</span><span${r.cls}>${esc(r.text)}</span></li>`).join('')}</ol></section>`,
        })
      }
    }
    for (const item of items) {
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
          html: `<section class="slide break"><div class="text"><h1>${esc(item.title || labels.breakTitle)}</h1><p class="until">${esc(labels.minutes(durationOf(item)))}${slot ? ` · <strong>${esc(labels.until(formatTime(slot.end)))}</strong>` : ''}</p></div></section>`,
        })
      }
    }
  })
  return out
}

/** The code points above the Latin ranges that the deck's text uses (which Noto slices a standalone file needs). */
export function cjkCodePoints(html: string): Set<number> {
  const set = new Set<number>()
  for (const ch of html.replace(/<[^>]+>/g, ' ')) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0x2e80) set.add(cp)
  }
  return set
}
