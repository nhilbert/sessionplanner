import { describe, expect, it } from 'vitest'
import { clearAt, elementAt, removeAt, setImage, setInline } from './slideEdit'
import { parseSlide } from './slideDoc'
import { parseTree } from './slideTree'

const CARDS = '<section class="slide cards"><header><h2>Titel</h2></header><ul class="cards cols-2"><li><img class="icon" src="asset:0123456789abcdef" alt="Bild"><h3>Eins</h3><p>Text eins</p></li><li><h3>Zwei</h3><p>Text zwei</p></li></ul></section>'

describe('changes to one element of a slide', () => {
  it('finds an element by its path and checks the tags on the way', () => {
    expect(elementAt(CARDS, [1, 0, 1])?.tag).toBe('h3')
    expect(elementAt(CARDS, [1, 0, 1], ['ul', 'li', 'h3'])?.tag).toBe('h3')
    expect(elementAt(CARDS, [1, 0, 1], ['ul', 'li', 'p'])).toBeNull()
    expect(elementAt(CARDS, [1, 5])).toBeNull()
  })
  it('replaces the inline content of an element, and the fields read it', () => {
    const next = setInline(CARDS, [1, 1, 0], parseTree('Zwei <span class="fs-l">groß</span>'))!
    const doc = parseSlide(next)
    expect(doc.raw).toBeUndefined()
    expect(doc.cards?.[1].title).toBe('Zwei [groß]{l}')
    expect(doc.cards?.[0].title).toBe('Eins')
  })
  it('puts another picture into an img and removes it', () => {
    expect(parseSlide(setImage(CARDS, [1, 0, 0], 'fedcba9876543210')!).cards?.[0].image).toBe('fedcba9876543210')
    expect(setImage(CARDS, [1, 0, 1], 'fedcba9876543210')).toBe(CARDS)
    const gone = parseSlide(removeAt(CARDS, [1, 0, 0])!)
    expect(gone.raw).toBeUndefined()
    expect(gone.cards?.[0].image).toBe('')
  })
  it('removes an entry or a line, and the slide keeps its fields', () => {
    const one = parseSlide(removeAt(CARDS, [1, 0])!)
    expect(one.raw).toBeUndefined()
    expect(one.cards?.map((c) => c.title)).toEqual(['Zwei'])
    const noText = parseSlide(removeAt(CARDS, [1, 1, 1])!)
    expect(noText.cards?.[1]).toMatchObject({ title: 'Zwei', text: '' })
    expect(parseSlide(removeAt(CARDS, [0, 0])!).header?.title ?? '').toBe('')
  })
  it('clears what stands in a fixed place', () => {
    const matrix = '<section class="slide matrix"><header><h2>M</h2></header><div class="matrix"><div class="axis-y"><span>a</span><span>b</span></div><div class="cells"><div class="cell"><h3>1</h3></div><div class="cell"><h3>2</h3></div><div class="cell"><h3>3</h3></div><div class="cell"><h3>4</h3></div></div><div class="axis-x"><span>c</span><span>d</span></div></div></section>'
    const doc = parseSlide(clearAt(matrix, [1, 1, 1])!)
    expect(doc.raw).toBeUndefined()
    expect(doc.matrix?.cells.map((c) => c.title)).toEqual(['1', '', '3', '4'])
  })
  it('answers null for a path that leads nowhere', () => {
    expect(removeAt(CARDS, [])).toBeNull()
    expect(removeAt(CARDS, [7, 0])).toBeNull()
    expect(setInline('kein Abschnitt', [0], [])).toBeNull()
  })
})
