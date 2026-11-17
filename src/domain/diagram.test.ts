import { describe, expect, it } from 'vitest'
import { DIAGRAM_MAX, DIAGRAM_SHAPES, diagramSvg, drawDiagrams } from './diagram.ts'
import { blankDoc, convertLayout, fieldSelectors, parseSlide, serializeSlide, type SlideDoc } from './slideDoc.ts'
import { normalizeSlideHtml, sanitizeSlide, slideText } from './slides.ts'

const entries = (n: number) => Array.from({ length: n }, (_, i) => `<li><h3>Point ${i + 1}</h3><p>Text ${i + 1}</p></li>`).join('')
const slide = (shape: string, n: number, extra = '') => `<section class="slide diagram"><header><h2>A model</h2></header><div class="diagram ${shape}"><ol>${entries(n)}</ol>${extra}</div></section>`

describe('diagrams', () => {
  it('draws every shape for one to six entries in markup the sanitiser leaves alone', () => {
    for (const shape of DIAGRAM_SHAPES)
      for (let n = 1; n <= DIAGRAM_MAX; n++) {
        const svg = diagramSvg(shape, n)
        expect(sanitizeSlide(svg), `${shape} ${n}`).toBe(svg)
        expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      }
  })
  it('draws as many parts as there are entries', () => {
    expect(diagramSvg('pyramid', 4).match(/<polygon/g)).toHaveLength(4)
    expect(diagramSvg('cycle', 5).match(/<path/g)).toHaveLength(5)
    expect(diagramSvg('venn', 3).match(/<circle/g)).toHaveLength(3)
    expect(diagramSvg('hub', 4).match(/<circle/g)).toHaveLength(5)
    expect(diagramSvg('pillars', 2).match(/<rect/g)).toHaveLength(3)
    // more entries than a drawing shows: the drawing stays at the most
    expect(diagramSvg('pyramid', 9)).toBe(diagramSvg('pyramid', DIAGRAM_MAX))
  })
  it('puts the drawing and the count into a slide written without them', () => {
    const drawn = normalizeSlideHtml(slide('cycle', 4))
    expect(drawn).toContain('<div class="diagram cycle n-4"><svg ')
    expect(drawn).toContain(diagramSvg('cycle', 4))
    // drawn once: storing it again changes nothing
    expect(normalizeSlideHtml(drawn)).toBe(drawn)
    expect(slideText(drawn)).toBe('A model Point 1 Text 1 Point 2 Text 2 Point 3 Text 3 Point 4 Text 4')
  })
  it('replaces a drawing that does not match the entries, whatever was written there', () => {
    const stale = slide('pyramid', 3).replace('<ol>', `${diagramSvg('pyramid', 5)}<ol>`).replace('diagram pyramid', 'diagram pyramid n-5')
    expect(normalizeSlideHtml(stale)).toBe(normalizeSlideHtml(slide('pyramid', 3)))
    const own = slide('venn', 2).replace('<ol>', '<svg viewBox="0 0 10 10"><circle class="f-accent" r="5"></circle></svg><ol>')
    expect(normalizeSlideHtml(own)).toBe(normalizeSlideHtml(slide('venn', 2)))
  })
  it('falls back to a pyramid for a shape it does not know and leaves other markup alone', () => {
    expect(normalizeSlideHtml(slide('spiral', 2))).toContain('class="diagram pyramid n-2 spiral"')
    const list = '<section class="slide list"><header><h2>A diagram of sorts</h2></header><ul class="list"><li>One</li></ul></section>'
    expect(drawDiagrams(list)).toBe(list)
  })
  it('reads a diagram as fields, with or without the drawing, and writes it back the same', () => {
    for (const html of [slide('hub', 3, '<p class="core">Team</p>'), normalizeSlideHtml(slide('hub', 3, '<p class="core">Team</p>'))]) {
      const doc = parseSlide(html)
      expect(doc.raw).toBeUndefined()
      expect(doc.shape).toBe('hub')
      expect(doc.core).toBe('Team')
      expect(doc.steps?.map((s) => s.title)).toEqual(['Point 1', 'Point 2', 'Point 3'])
      expect(normalizeSlideHtml(serializeSlide(doc))).toBe(normalizeSlideHtml(html))
    }
  })
  it('redraws when an entry is added or the shape changes', () => {
    const doc = parseSlide(slide('pyramid', 3))
    const more: SlideDoc = { ...doc, steps: [...(doc.steps ?? []), { eyebrow: '', title: 'Point 4', text: '' }] }
    expect(serializeSlide(more)).toContain(`n-4">${diagramSvg('pyramid', 4)}`)
    expect(serializeSlide({ ...doc, shape: 'onion' })).toContain(`diagram onion n-3">${diagramSvg('onion', 3)}`)
    // a pyramid has no middle: the word is kept in the document, not written
    expect(serializeSlide({ ...doc, core: 'Team' })).not.toContain('core')
  })
  it('takes the points of another layout and gives them back', () => {
    const list = parseSlide('<section class="slide list"><header><h2>Three things</h2></header><ul class="list rows"><li><strong>One</strong> first</li><li><strong>Two</strong> second</li><li><strong>Three</strong> third</li></ul></section>')
    const to = convertLayout(list, 'diagram')
    expect(to.lost).toEqual([])
    expect(to.doc.steps?.map((s) => s.title)).toHaveLength(3)
    expect(parseSlide(normalizeSlideHtml(serializeSlide(to.doc))).raw).toBeUndefined()
    const seven = { ...to.doc, steps: Array.from({ length: 7 }, (_, i) => ({ eyebrow: '', title: `P${i}`, text: '' })) }
    expect(convertLayout(convertLayout(seven, 'list').doc, 'diagram').lost).toEqual(['items:2'])
  })
  it('has a blank and names where its fields show', () => {
    const words = { title: 'Title', text: 'Text', point: 'Point', lead: 'Lead', step: 'Step', quote: 'Quote', cite: 'Source', eyebrow: 'Kicker', letter: 'A', term: 'Term', value: 'Value', when: '10:45', axis: 'Axis', caption: 'Caption' }
    const doc = parseSlide(normalizeSlideHtml(serializeSlide(blankDoc('diagram', words))))
    expect(doc.raw).toBeUndefined()
    expect(doc.steps).toHaveLength(3)
    expect(fieldSelectors(doc).find((f) => f.path === 'steps.1.title')?.selector).toBe(':scope > .diagram > ol > li:nth-child(2) > h3')
  })
})
