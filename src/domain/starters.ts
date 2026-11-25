import type { DiagramShape } from './diagram.ts'
import type { SampleSet } from './sampleSets.ts'
import { isSampleText, SAMPLE_SETS } from './sampleSets.ts'
import { cardPictureKind, type DeckPool, EMPTY_DECK_POOL, figureKind, poolOfKind } from './pool.ts'
import { type Card, type SlideDoc, type Step, serializeSlide } from './slideDoc.ts'
import { slideText } from './slides.ts'

/**
 * Starter slides (docs/slides.md, section 7): every layout of the catalogue the way it is meant to be used, in
 * the variants that are used most, filled with a sample subject (sampleSets.ts). A new slide starts from one of
 * them: the layout is chosen by what it looks like when it is full, and the sample words show how much fits.
 */

export type StarterGroup = 'say' | 'points' | 'process' | 'model' | 'picture'
export const STARTER_GROUPS: StarterGroup[] = ['say', 'points', 'process', 'model', 'picture']

export interface Starter {
  id: string
  group: StarterGroup
  layout: string
  /** Pictures of the theme's pool it cannot do without (it is left out when the pool has fewer of the kind its places take). */
  pictures?: number
  /** `pictures` are marks for the places, first, second, third: which picture stands there is decided by the place (`starterDoc`). */
  build: (s: SampleSet, pictures: string[]) => SlideDoc
}

const header = (title: string, lead = '', eyebrow = '') => ({ eyebrow, title, lead, tag: '', small: '' })
const text = (fields: Record<string, string>) => ({ eyebrow: '', title: '', subtitle: '', meta: '', lead: '', big: '', sub: '', until: '', body: '', ...fields })
const card = (c: Partial<Card>): Card => ({ image: '', alt: '', eyebrow: '', title: '', text: '', points: [], ...c })
const step = (title: string, body: string, eyebrow = ''): Step => ({ eyebrow, title, text: body })

const diagram = (id: string, shape: DiagramShape, n: number, from: 'points' | 'steps' | 'cells', group: StarterGroup = 'model'): Starter => ({
  id,
  group,
  layout: 'diagram',
  build: (s) => ({ layout: 'diagram', options: {}, shape, core: s.core, header: header(s.title), steps: s[from].slice(0, n).map((x) => step(x.title, x.text)) }),
})

export const STARTERS: Starter[] = [
  // ---- say: one thing, large
  { id: 'question', group: 'say', layout: 'statement', build: (s) => ({ layout: 'statement', options: {}, text: text({ eyebrow: s.kicker, big: s.question, sub: s.questionSub }) }) },
  { id: 'quote', group: 'say', layout: 'quote', build: (s) => ({ layout: 'quote', options: {}, quote: { text: s.quote, sub: '', cite: s.cite } }) },
  { id: 'number', group: 'say', layout: 'number', build: (s) => ({ layout: 'number', options: {}, header: header(s.title), cards: [card({ title: s.numbers[0].value, text: s.numbers[0].label })], source: s.source }) },
  { id: 'numbers', group: 'say', layout: 'number', build: (s) => ({ layout: 'number', options: {}, header: header(s.title), cards: s.numbers.map((n) => card({ title: n.value, text: n.label })) }) },
  { id: 'section', group: 'say', layout: 'section', build: (s) => ({ layout: 'section', options: {}, text: text({ eyebrow: s.kicker, title: s.section.title, lead: s.section.text }) }) },
  // ---- points: things side by side
  { id: 'rows', group: 'points', layout: 'list', build: (s) => ({ layout: 'list', options: { rows: true }, header: header(s.title, s.lead), points: s.points.slice(0, 4).map((x) => ({ text: `**${x.title}** ${x.text}`, children: [] })) }) },
  { id: 'list', group: 'points', layout: 'list', build: (s) => ({ layout: 'list', options: {}, header: header(s.title), points: s.points.slice(0, 5).map((x) => ({ text: x.title, children: [] })) }) },
  { id: 'cards', group: 'points', layout: 'cards', build: (s) => ({ layout: 'cards', options: { cols: 3, numbered: true }, header: header(s.title), cards: s.points.slice(0, 3).map((x) => card(x)) }) },
  { id: 'cards4', group: 'points', layout: 'cards', build: (s) => ({ layout: 'cards', options: { cols: 4 }, header: header(s.title, s.lead), cards: s.points.slice(0, 4).map((x) => card(x)) }) },
  { id: 'compare', group: 'points', layout: 'compare', build: (s) => ({ layout: 'compare', options: {}, header: header(s.title), cards: s.sides.map((x) => card({ title: x.title, points: x.points })) }) },
  { id: 'table', group: 'points', layout: 'table', build: (s) => ({ layout: 'table', options: {}, header: header(s.title), table: { head: s.table.head, rows: s.table.rows.map((r) => r.map((c, i) => ({ text: i === 0 ? `**${c}**` : c, tone: '' as const }))) } }) },
  { id: 'canvas', group: 'points', layout: 'canvas', build: (s) => ({ layout: 'canvas', options: { cols: 3 }, header: header(s.title), boxes: s.boxes.map((b, i) => ({ title: b.title, text: b.text, points: [], wide: false, tall: false, accent: i === 0 })) }) },
  // ---- process: one thing after another
  { id: 'steps', group: 'process', layout: 'steps', build: (s) => ({ layout: 'steps', options: {}, header: header(s.title), steps: s.steps.slice(0, 4).map((x) => step(x.title, x.text)) }) },
  { id: 'timeline', group: 'process', layout: 'timeline', build: (s) => ({ layout: 'timeline', options: {}, header: header(s.title), steps: s.steps.map((x, i) => step(x.title, x.text, s.dates[i] ?? '')) }) },
  diagram('cycle', 'cycle', 4, 'steps', 'process'),
  {
    id: 'exercise',
    group: 'process',
    layout: 'exercise',
    build: (s) => ({ layout: 'exercise', options: {}, header: { ...header(s.exercise.title, s.exercise.lead), tag: s.exercise.tag }, steps: s.exercise.steps.map((x) => step('', x)), facts: s.exercise.facts.map(([term, value]) => ({ term, value })) }),
  },
  // ---- model: how things hang together
  diagram('pyramid', 'pyramid', 4, 'points'),
  diagram('venn', 'venn', 3, 'points'),
  diagram('onion', 'onion', 3, 'points'),
  diagram('pillars', 'pillars', 4, 'points'),
  diagram('hub', 'hub', 5, 'points'),
  { id: 'matrix', group: 'model', layout: 'matrix', build: (s) => ({ layout: 'matrix', options: {}, header: header(s.title), matrix: { axisY: s.axes.y, axisX: s.axes.x, cells: s.cells.map((c, i) => ({ title: c.title, text: c.text, accent: i === 0 })) } }) },
  { id: 'acronym', group: 'model', layout: 'acronym', build: (s) => ({ layout: 'acronym', options: {}, header: header(s.title), letters: s.acronym.map((l) => ({ ...l })) }) },
  // ---- picture: with a picture of the theme's pool, where it has some: a photo where the place crops it, an illustration where it stands whole
  {
    id: 'split',
    group: 'picture',
    layout: 'split',
    build: (s, pics) => ({ layout: 'split', options: {}, header: header(s.title), blocks: [{ kind: 'lead', text: s.lead }, { kind: 'list', points: s.points.slice(0, 3).map((x) => x.title) }], figure: { image: pics[0] ?? '', alt: '', caption: '' } }),
  },
  {
    id: 'splitLeft',
    group: 'picture',
    layout: 'split',
    build: (s, pics) => ({ layout: 'split', options: { figureLeft: true }, header: header(s.section.title), blocks: [{ kind: 'p', text: s.quote }, { kind: 'small', text: s.cite }], figure: { image: pics[1] ?? pics[0] ?? '', alt: '', caption: '' } }),
  },
  {
    id: 'splitWhole',
    group: 'picture',
    layout: 'split',
    build: (s, pics) => ({ layout: 'split', options: { contain: true }, header: header(s.title), blocks: [{ kind: 'lead', text: s.lead }, { kind: 'list', points: s.points.slice(3, 6).map((x) => x.title) }], figure: { image: pics[0] ?? '', alt: '', caption: '' } }),
  },
  { id: 'figure', group: 'picture', layout: 'figure', build: (s, pics) => ({ layout: 'figure', options: {}, header: header(s.title), figure: { image: pics[0] ?? '', alt: '', caption: s.caption } }) },
  {
    id: 'pictureCards',
    group: 'picture',
    layout: 'cards',
    pictures: 3,
    build: (s, pics) => ({ layout: 'cards', options: { cols: 3, picture: true }, header: header(s.title), cards: s.points.slice(0, 3).map((x, i) => card({ ...x, image: pics[i] ?? '' })) }),
  },
]

/** The marks a starter sets where a picture stands: the first, the second, the third of the slide. */
const MARKS = ['#0', '#1', '#2']

/**
 * A starter as a slide document, filled with a sample subject and, where it shows pictures, the pool's: every place
 * takes one of the kind it shows (`pool.ts`), the places of a slide different ones, beginning at `turn`. A place whose
 * kind the pool does not hold stays empty.
 */
export function starterDoc(starter: Starter, set: SampleSet, pool: DeckPool = EMPTY_DECK_POOL, turn = 0): SlideDoc {
  const doc = starter.build(set, MARKS)
  const context = { whole: pool.whole, titleVariant: 'column' as const }
  const from = (mark: string, kind: ReturnType<typeof cardPictureKind>): string => {
    const n = MARKS.indexOf(mark)
    const list = kind === 'icon' ? [] : poolOfKind(pool, kind)
    return n < 0 || !list.length ? '' : list[(turn + n) % list.length]
  }
  if (doc.figure) doc.figure = { ...doc.figure, image: from(doc.figure.image, figureKind(doc, context)) }
  if (doc.cards) doc.cards = doc.cards.map((c) => ({ ...c, image: from(c.image, cardPictureKind(doc)) }))
  return doc
}

/** How many different pictures of the pool a starter would show. */
const picturesShown = (doc: SlideDoc): number => new Set([doc.figure?.image, ...(doc.cards ?? []).map((c) => c.image)].filter(Boolean)).size

/** The starters that can be shown with a theme's pool: all but those that need more pictures than it has of the kind their places take. */
export const startersFor = (pool: DeckPool = EMPTY_DECK_POOL): Starter[] => STARTERS.filter((s) => !s.pictures || picturesShown(starterDoc(s, SAMPLE_SETS.en[0], pool)) >= s.pictures)

/** The same as markup. */
export const starterSlide = (starter: Starter, set: SampleSet, pool: DeckPool = EMPTY_DECK_POOL, turn = 0): string => serializeSlide(starterDoc(starter, set, pool, turn))

/**
 * The sample phrases a slide still shows, each once: its elements' texts that are a phrase of the samples word
 * for word. A slide made from a starter says them until they are replaced; one that is presented should not.
 */
export function sampleTextsOf(html: string): string[] {
  if (!html) return []
  const found = new Set<string>()
  // every stretch of text between two tags is one element's own words (the samples carry no formatting inside)
  for (const part of html.replace(/<svg[\s\S]*?<\/svg>/g, '<i></i>').split(/<[^>]+>/)) {
    const words = slideText(part)
    if (words && isSampleText(words)) found.add(words)
  }
  return [...found]
}
