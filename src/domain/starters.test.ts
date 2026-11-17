import { describe, expect, it } from 'vitest'
import { isSampleText, isSampleWord, SAMPLE_SETS, sampleSets } from './sampleSets.ts'
import { layoutSpec, parseSlide } from './slideDoc.ts'
import { normalizeSlideHtml } from './slides.ts'
import { sampleTextsOf, STARTER_GROUPS, STARTERS, startersFor, starterSlide } from './starters.ts'

const PICTURES = ['3f2a9c1e5b7d4a6f', '4f2a9c1e5b7d4a6f', '5f2a9c1e5b7d4a6f']

describe('starter slides', () => {
  it('builds every starter from every sample subject as a slide the fields can hold', () => {
    for (const lang of ['de', 'en'] as const)
      for (const set of SAMPLE_SETS[lang])
        for (const starter of STARTERS)
          for (const pictures of [[], PICTURES]) {
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
    expect(startersFor(0).some((s) => s.id === 'pictureCards')).toBe(false)
    expect(startersFor(3).some((s) => s.id === 'pictureCards')).toBe(true)
    expect(startersFor(0).some((s) => s.id === 'split')).toBe(true)
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
