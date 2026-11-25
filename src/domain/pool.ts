import type { SlideDoc } from './slideDoc.ts'
import { type PoolAsset, type PoolKind, type ThemeInfo, titleOfTheme } from './theme.ts'
import type { TitleVariant } from './titleVariants.ts'

/**
 * Which pool a place for a picture pulls from (docs/slides.md, section 4). A theme's pool holds three kinds, and they
 * do different work: a photo can be cut to any shape and carry a surface (a column, a band, the whole slide); an
 * illustration is drawn to be seen whole and stands on the ground beside the words; an icon is a small mark on a card.
 * So the place decides: where the picture is cropped it takes a photo, where it is shown whole an illustration. One
 * kind never stands in for the other: a place whose pool is empty stays without a picture. By hand every picture can
 * still go anywhere; the picker only shows the place's kind first.
 */

/** The two kinds a figure takes; the pool's `picture` is the photo (the name it had before there were illustrations). */
export type PictureKind = Exclude<PoolKind, 'icon'>

/** What decides the kind besides the slide itself: whether the theme shows every figure whole, and the variant of the title slides that name none. */
export interface KindContext {
  whole: boolean
  titleVariant: TitleVariant
}

export const DEFAULT_KIND_CONTEXT: KindContext = { whole: false, titleVariant: 'column' }

/** A family that shows every figure whole (the playful one sets them on a disc, docs/slide-design-playful.md): its figures are illustrations everywhere. */
export const familyShowsWhole = (family: string | undefined): boolean => family === 'playful'

export const kindContextOf = (info: ThemeInfo | undefined): KindContext => ({ whole: familyShowsWhole(info?.family), titleVariant: titleOfTheme(info)?.variant ?? 'column' })

/** The kind a title slide's picture is: whole in the right half or small above the title it is an illustration, as a column, a band or the background a photo. */
export const titlePictureKind = (variant: TitleVariant | null | undefined, whole = false): PictureKind => (whole || variant === 'whole' || variant === 'small' ? 'illustration' : 'picture')

/**
 * The kind of the figure of a slide: a title's by its variant; a split's and a figure slide's by whether the picture is
 * shown whole (`contain`, a caption under a split's picture, a figure that does not fill the slide); beside the text of
 * a list, a statement or a quote stands an illustration; the bands and columns of section, agenda and break slides are
 * photos.
 */
export function figureKind(doc: Pick<SlideDoc, 'layout' | 'options' | 'figure'>, context: KindContext = DEFAULT_KIND_CONTEXT): PictureKind {
  if (context.whole) return 'illustration'
  switch (doc.layout) {
    case 'title':
      return titlePictureKind(typeof doc.options.variant === 'string' ? (doc.options.variant as TitleVariant) : context.titleVariant)
    case 'split':
      return doc.options.contain || doc.figure?.caption.trim() ? 'illustration' : 'picture'
    case 'figure':
      return doc.options.full ? 'picture' : 'illustration'
    // the illustration beside the text (figure.aside)
    case 'list':
    case 'statement':
    case 'quote':
      return 'illustration'
    default:
      return 'picture'
  }
}

/** The kind of a card's picture: a photo where it is cropped (picture cards, the band of plain cards), an illustration where it is shown whole, else the card's icon. */
export function cardPictureKind(doc: Pick<SlideDoc, 'options'>): PoolKind {
  if (doc.options.picture || doc.options.plain) return doc.options.contain ? 'illustration' : 'picture'
  return 'icon'
}

/**
 * Whether a pool entry answers a search: every word of the query begins one of its tags, or a word of one. The picker,
 * the pool's lists and the connector's theme_pool find pictures the same way.
 */
export function matchesTags(entry: Pick<PoolAsset, 'tags'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => entry.tags.some((tag) => tag.startsWith(w) || tag.split(/\s+/).some((part) => part.startsWith(w))))
}

/** The kinds in the order a picker shows them for a place: the place's own first, then what is nearest to it. */
export const kindsFirst = (prefer: PoolKind): PoolKind[] => (prefer === 'icon' ? ['icon', 'illustration', 'picture'] : prefer === 'illustration' ? ['illustration', 'picture', 'icon'] : ['picture', 'illustration', 'icon'])

/** A theme's pool as the generated slides and the starters take it: its photos, its illustrations, and whether every figure is shown whole. */
export interface DeckPool {
  pictures: string[]
  illustrations: string[]
  whole: boolean
  /** False: the agenda, break and divider slides take no picture in turn, only one chosen for them by hand (ThemeTokens.poolTurn). */
  turn?: boolean
}

export const EMPTY_DECK_POOL: DeckPool = { pictures: [], illustrations: [], whole: false }

const hashesOf = (pool: PoolAsset[], kind: PoolKind): string[] => pool.filter((e) => e.kind === kind).map((e) => e.hash)

export const deckPoolOf = (pool: PoolAsset[], info: ThemeInfo | undefined): DeckPool => ({ pictures: hashesOf(pool, 'picture'), illustrations: hashesOf(pool, 'illustration'), whole: familyShowsWhole(info?.family), ...(info?.poolTurn === false ? { turn: false } : {}) })

/**
 * The kind a place waits for in vain: the first of `wanted` the pool holds none of while it holds the other kind. That
 * is where the rule shows as an empty place (a photo does not stand in for an illustration), so the app says why. A
 * pool with neither is simply empty, as it always could be, and is no case for a hint.
 */
export function missingKind(pool: DeckPool, wanted: PictureKind[]): PictureKind | null {
  for (const kind of wanted) {
    const other: PictureKind = kind === 'illustration' ? 'picture' : 'illustration'
    if (!poolOfKind(pool, kind).length && poolOfKind(pool, other).length) return kind
  }
  return null
}

/** The pool's pictures of one kind. */
export const poolOfKind = (pool: DeckPool, kind: PictureKind): string[] => (kind === 'illustration' ? pool.illustrations : pool.pictures)
