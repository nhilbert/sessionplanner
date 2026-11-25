import { describe, expect, it } from 'vitest'
import { isSampleText, isSampleWord, SAMPLE_SETS, sampleSets } from './sampleSets.ts'
import { layoutSpec, parseSlide } from './slideDoc.ts'
import { normalizeSlideHtml } from './slides.ts'
import { sampleTextsOf, STARTER_GROUPS, STARTERS, starterDoc, startersFor, starterSlide } from './starters.ts'
import { cardPictureKind, type DeckPool, EMPTY_DECK_POOL, figureKind } from './pool.ts'

const PHOTOS = ['3f2a9c1e5b7d4a6f', '4f2a9c1e5b7d4a6f', '5f2a9c1e5b7d4a6f']
const DRAWN = ['6f2a9c1e5b7d4a6f', '7f2a9c1e5b7d4a6f', '8f2a9c1e5b7d4a6f']
const POOL: DeckPool = { pictures: PHOTOS, illustrations: DRAWN, whole: false }

describe('starter slides', () => {
  it('builds every starter from every sample subject as a slide the fields can hold', () => {
    for (const lang of ['de', 'en'] as const)
      for (const set of SAMPLE_SETS[lang])
        for (const starter of STARTERS)
          for (const pictures of [EMPTY_DECK_POOL, POOL, { ...POOL, whole: true }]) {
            const html = normalizeSlideHtml(starterSlide(starter, set, pictures))
            const doc = parseSlide(html)
            const what = `${starter.id} · ${set.name}`
            expect(doc.raw, what).toBeUndefined()
            expect(doc.layout, what).toBe(starter.layout)
            // nothing over the layout's room
            const max = layoutSpec(doc.layout)?.max
            const count = (doc.points ?? doc.cards ?? doc.steps ?? doc.letters ?? doc.boxes ?? doc.table?.rows ?? []).length
            if (max !== undefined) expect(count, what).toBeLessThanOrEqual(max)
            // its words are known as sample text
            expect(sampleTextsOf(html).length, what).toBeGreaterThan(0)
          }
  })
  it('has the same subjects in both languages and a group for every starter', () => {
    expect(SAMPLE_SETS.de).toHaveLength(SAMPLE_SETS.en.length)
    expect(sampleSets('de-CH')).toBe(SAMPLE_SETS.de)
    expect(sampleSets('fr')).toBe(SAMPLE_SETS.en)
    for (const set of [...SAMPLE_SETS.de, ...SAMPLE_SETS.en]) {
      expect(set.points).toHaveLength(6)
      expect(set.steps).toHaveLength(5)
      expect(set.dates).toHaveLength(5)
      expect(set.cells).toHaveLength(4)
      expect(set.boxes).toHaveLength(6)
    }
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length)
    for (const s of STARTERS) expect(STARTER_GROUPS).toContain(s.group)
  })
  it('leaves out the starters that need more pictures than the pool has', () => {
    const has = (pool: DeckPool | undefined, id: string) => startersFor(pool).some((s) => s.id === id)
    expect(has(undefined, 'pictureCards')).toBe(false)
    expect(has(POOL, 'pictureCards')).toBe(true)
    expect(has(undefined, 'split')).toBe(true)
    // picture cards are cropped, so they need photos: illustrations do not stand in
    expect(has({ ...POOL, pictures: [] }, 'pictureCards')).toBe(false)
    expect(has({ ...POOL, pictures: PHOTOS.slice(0, 2) }, 'pictureCards')).toBe(false)
  })
  it('fills every place with a picture of the kind it shows, different ones on one slide', () => {
    const set = SAMPLE_SETS.en[0]
    const of = (id: string, pool = POOL, turn = 0) => starterDoc(STARTERS.find((s) => s.id === id)!, set, pool, turn)
    expect(PHOTOS).toContain(of('split').figure!.image)
    expect(PHOTOS).toContain(of('splitLeft').figure!.image)
    expect(DRAWN).toContain(of('splitWhole').figure!.image)
    expect(DRAWN).toContain(of('figure').figure!.image)
    const cards = of('pictureCards', POOL, 2).cards!.map((c) => c.image)
    expect(new Set(cards).size).toBe(3)
    for (const hash of cards) expect(PHOTOS).toContain(hash)
    // the turn moves on through the pool
    expect(of('split', POOL, 1).figure!.image).not.toBe(of('split').figure!.image)
    // a pool without the kind leaves the place empty
    expect(of('splitWhole', { ...POOL, illustrations: [] }).figure!.image).toBe('')
    expect(of('split', { ...POOL, pictures: [] }).figure!.image).toBe('')
    // a theme that shows every figure whole: illustrations in all of them
    for (const id of ['split', 'splitLeft', 'splitWhole', 'figure']) expect(DRAWN, id).toContain(of(id, { ...POOL, whole: true }).figure!.image)
    // and no starter is filled against the rule it is read by
    for (const starter of STARTERS) {
      const doc = starterDoc(starter, set, POOL)
      if (doc.figure?.image) expect(figureKind(doc) === 'illustration' ? DRAWN : PHOTOS, starter.id).toContain(doc.figure.image)
      for (const c of doc.cards ?? []) if (c.image) expect(cardPictureKind(doc) === 'illustration' ? DRAWN : PHOTOS, starter.id).toContain(c.image)
    }
  })
  it('tells sample phrases from an author’s words', () => {
    const set = SAMPLE_SETS.en[0]
    expect(isSampleText(set.question)).toBe(true)
    expect(isSampleText(` ${set.points[0].text} `)).toBe(true)
    // one word may be anybody's: selected when edited, never reported
    expect(isSampleText('Risks')).toBe(false)
    expect(isSampleWord('Risks')).toBe(true)
    // labels a real slide says too
    expect(isSampleWord('Duration')).toBe(false)
    expect(isSampleWord('Monday')).toBe(false)
    expect(isSampleText('Our real agenda for Thursday')).toBe(false)
  })
  it('reports what is left of the sample on a slide, and nothing once it is replaced', () => {
    const set = SAMPLE_SETS.de[1]
    const starter = STARTERS.find((s) => s.id === 'cards')!
    const html = normalizeSlideHtml(starterSlide(starter, set))
    expect(sampleTextsOf(html)).toContain(set.title)
    let mine = html.replace(set.title, 'Unsere drei Regeln')
    for (const p of set.points.slice(0, 3)) mine = mine.replace(p.title, 'Eigener Titel').replace(p.text, 'Eigener Text dazu')
    expect(sampleTextsOf(mine)).toEqual([])
    expect(sampleTextsOf('')).toEqual([])
  })
})

describe('variants of a sample subject', () => {
  it('draws the same variant for the same seed and other ones for other seeds', async () => {
    const { seeded, variant } = await import('./sampleSets.ts')
    const set = SAMPLE_SETS.de[0]
    const order = (seed: number) => variant(set, seeded(seed)).points.map((p) => p.title).join('|')
    expect(order(7)).toBe(order(7))
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(order)).size).toBeGreaterThan(3)
    const v = variant(set, seeded(3))
    expect([...v.points].sort((a, b) => a.title.localeCompare(b.title))).toEqual([...set.points].sort((a, b) => a.title.localeCompare(b.title)))
    expect(v.steps).toBe(set.steps)
  })
})
