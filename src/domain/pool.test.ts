import { describe, expect, it } from 'vitest'
import { cardPictureKind, deckPoolOf, DEFAULT_KIND_CONTEXT, familyShowsWhole, figureKind, kindContextOf, kindsFirst, matchesTags, missingKind, titlePictureKind } from './pool.ts'
import { parseSlide as parse } from './slideDoc.ts'
import type { PoolAsset, ThemeInfo } from './theme.ts'
import { TITLE_VARIANTS } from './titleVariants.ts'

const img = '<img src="asset:' + 'a'.repeat(64) + '" alt="">'
/** A slide read into its fields; one that is kept as source would say nothing about its places. */
const parseSlide = (html: string) => {
  const doc = parse(html)
  expect(doc.raw, html).toBeUndefined()
  return doc
}
const figure = (cls: string, body = `<div class="split${cls}"><div class="text"><p>Text</p></div><figure>${img}</figure></div>`) => parseSlide(`<section class="slide split"><header><h2>Title</h2></header>${body}</section>`)

describe('which pool a place pulls from', () => {
  it('reads a title by its variant: whole and small are illustrations, the cropped ones photos', () => {
    expect(TITLE_VARIANTS.filter((v) => titlePictureKind(v) === 'illustration')).toEqual(['whole', 'small'])
    expect(titlePictureKind(null)).toBe('picture')
    expect(titlePictureKind('column', true)).toBe('illustration')
    const title = (cls: string) => parseSlide(`<section class="slide title${cls}"><figure>${img}</figure><div class="text"><h1>Title</h1></div></section>`)
    expect(figureKind(title(' pic-whole'))).toBe('illustration')
    expect(figureKind(title(' pic-band'))).toBe('picture')
    // a title without a variant is shown as its theme says
    expect(figureKind(title(''))).toBe('picture')
    expect(figureKind(title(''), { whole: false, titleVariant: 'small' })).toBe('illustration')
    expect(figureKind(title(' pic-column'), { whole: false, titleVariant: 'small' })).toBe('picture')
  })

  it('reads a split and a figure slide by whether the picture is shown whole', () => {
    expect(figureKind(figure(''))).toBe('picture')
    expect(figureKind(figure(' figure-left'))).toBe('picture')
    expect(figureKind(figure(' contain'))).toBe('illustration')
    // a caption under a split's picture shows it whole too
    expect(figureKind(figure('', `<div class="split"><div class="text"><p>Text</p></div><figure>${img}<figcaption>Caption</figcaption></figure></div>`))).toBe('illustration')
    const main = (cls: string) => parseSlide(`<section class="slide figure${cls}"><header><h2>Title</h2></header><figure class="main">${img}<figcaption>Caption</figcaption></figure></section>`)
    expect(figureKind(main(''))).toBe('illustration')
    expect(figureKind(main(' full'))).toBe('picture')
  })

  it('takes an illustration beside the text of a list, a statement and a quote', () => {
    const aside = `<figure class="aside">${img}</figure>`
    expect(figureKind(parseSlide(`<section class="slide list"><header><h2>Title</h2></header><ul class="list"><li>One</li></ul>${aside}</section>`))).toBe('illustration')
    expect(figureKind(parseSlide(`<section class="slide statement"><div class="text"><p class="big">Why?</p></div>${aside}</section>`))).toBe('illustration')
    expect(figureKind(parseSlide(`<section class="slide quote"><blockquote><p>So.</p></blockquote><cite>Someone</cite>${aside}</section>`))).toBe('illustration')
  })

  it('takes photos for the bands and columns of section and break slides', () => {
    expect(figureKind(parseSlide(`<section class="slide section"><div class="text"><h1>Title</h1></div><figure>${img}</figure></section>`))).toBe('picture')
    expect(figureKind(parseSlide(`<section class="slide break"><div class="text"><h1>Break</h1></div><figure>${img}</figure></section>`))).toBe('picture')
  })

  it('takes illustrations for every figure under a theme that shows them whole', () => {
    const whole = { ...DEFAULT_KIND_CONTEXT, whole: true }
    expect(figureKind(figure(''), whole)).toBe('illustration')
    expect(figureKind(parseSlide(`<section class="slide break"><div class="text"><h1>Break</h1></div><figure>${img}</figure></section>`), whole)).toBe('illustration')
    expect(familyShowsWhole('playful')).toBe(true)
    expect(familyShowsWhole('calm')).toBe(false)
    expect(familyShowsWhole(undefined)).toBe(false)
  })

  it('reads a card\'s picture by the cards\' options: an icon, a cropped photo, an illustration shown whole', () => {
    const cards = (cls: string) => parseSlide(`<section class="slide cards"><header><h2>Title</h2></header><ul class="cards cols-3${cls}"><li><img class="icon" src="asset:${'a'.repeat(64)}" alt=""><h3>One</h3><p>Text</p></li></ul></section>`)
    expect(cardPictureKind(cards(''))).toBe('icon')
    expect(cardPictureKind(cards(' numbered'))).toBe('icon')
    expect(cardPictureKind(cards(' picture'))).toBe('picture')
    expect(cardPictureKind(cards(' plain'))).toBe('picture')
    expect(cardPictureKind(cards(' plain contain'))).toBe('illustration')
    expect(cardPictureKind(cards(' picture contain'))).toBe('illustration')
  })

  it('shows a picker the place\'s kind first, every kind once', () => {
    expect(kindsFirst('picture')).toEqual(['picture', 'illustration', 'icon'])
    expect(kindsFirst('illustration')).toEqual(['illustration', 'picture', 'icon'])
    expect(kindsFirst('icon')).toEqual(['icon', 'illustration', 'picture'])
  })

  it('reads a theme\'s pool and what its family and title variant say', () => {
    const entry = (hash: string, kind: PoolAsset['kind']): PoolAsset => ({ hash, kind, tags: [], position: 0, createdAt: '' })
    const pool = [entry('p1', 'picture'), entry('i1', 'illustration'), entry('c1', 'icon'), entry('i2', 'illustration')]
    const playful: ThemeInfo = { id: 'school', name: 'School', kind: 'data', family: 'playful' }
    expect(deckPoolOf(pool, playful)).toEqual({ pictures: ['p1'], illustrations: ['i1', 'i2'], whole: true })
    expect(deckPoolOf(pool, undefined)).toEqual({ pictures: ['p1'], illustrations: ['i1', 'i2'], whole: false })
    expect(kindContextOf(playful)).toEqual({ whole: true, titleVariant: 'column' })
    expect(kindContextOf({ id: 'calm', name: 'Calm', kind: 'data', title: { variant: 'whole', choices: ['whole'], picture: '' } })).toEqual({ whole: false, titleVariant: 'whole' })
    expect(kindContextOf(undefined)).toEqual(DEFAULT_KIND_CONTEXT)
  })

  it('names the kind a place waits for in vain: none of it in the pool while the other kind is there', () => {
    const photos = { pictures: ['p'], illustrations: [], whole: false }
    const drawn = { pictures: [], illustrations: ['i'], whole: false }
    expect(missingKind(photos, ['illustration'])).toBe('illustration')
    expect(missingKind(photos, ['picture'])).toBeNull()
    expect(missingKind(drawn, ['picture'])).toBe('picture')
    // several places (the variants of a title slide): the first that goes without
    expect(missingKind(photos, ['picture', 'illustration'])).toBe('illustration')
    expect(missingKind({ pictures: ['p'], illustrations: ['i'], whole: false }, ['picture', 'illustration'])).toBeNull()
    // a pool with neither is empty as it always could be: nothing stands in for nothing
    expect(missingKind({ pictures: [], illustrations: [], whole: false }, ['picture', 'illustration'])).toBeNull()
  })

  it('finds a pool entry by its tags: every word of the search begins a tag or a word of one', () => {
    const entry = { tags: ['team', 'team bilden', 'zusammenstellen', 'build a team'] }
    expect(matchesTags(entry, 'team')).toBe(true)
    expect(matchesTags(entry, 'Bild')).toBe(true)
    expect(matchesTags(entry, 'team zusammen')).toBe(true)
    expect(matchesTags(entry, 'build team')).toBe(true)
    expect(matchesTags(entry, '')).toBe(true)
    expect(matchesTags(entry, 'team zeit')).toBe(false)
    expect(matchesTags(entry, 'eam')).toBe(false)
    expect(matchesTags({ tags: [] }, 'team')).toBe(false)
  })
})
