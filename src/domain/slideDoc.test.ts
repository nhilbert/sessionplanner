import { describe, expect, it } from 'vitest'
import { SLIDE_LAYOUTS } from './slideFormat.ts'
import { normalizeSlideHtml, slideText } from './slides.ts'
import { blankDoc, convertLayout, fieldSelectors, LAYOUT_IDS, LAYOUTS, parseSlide, serializeSlide } from './slideDoc.ts'
import { inlineToText, parseTree, serializeNodes, textToInline } from './slideTree.ts'

const WORDS = { title: 'Überschrift', text: 'Text', point: 'Punkt', lead: 'Einleitung', step: 'Schritt', quote: 'Zitat', cite: 'Quelle', eyebrow: 'Kicker', letter: 'A', term: 'Begriff', value: 'Wert', when: 'bis 10:45', axis: 'Achse', caption: 'Bildunterschrift' }

describe('slide tree', () => {
  it('round-trips sanitised markup', () => {
    const html = '<section class="slide list"><header><h2>A &amp; B</h2></header><ul class="list"><li>Eins<br>Zwei</li><li><strong>Fett</strong> und <em>kursiv</em></li></ul></section>'
    expect(serializeNodes(parseTree(html))).toBe(html)
  })
  it('turns inline markup into the editor text and back', () => {
    const nodes = parseTree('Ein <strong>fetter</strong> und <em>kursiver</em> <span class="accent">Akzent</span> mit <code>Code</code><br>Zeile 2')
    const text = inlineToText(nodes)
    expect(text).toBe('Ein **fetter** und *kursiver* ==Akzent== mit `Code`\nZeile 2')
    expect(serializeNodes(textToInline(text))).toBe('Ein <strong>fetter</strong> und <em>kursiver</em> <span class="accent">Akzent</span> mit <code>Code</code><br>Zeile 2')
  })
})

describe('slide document', () => {
  it('reads every catalogue example into its structure and writes it back without losing a word', () => {
    for (const ex of SLIDE_LAYOUTS) {
      const doc = parseSlide(ex.example)
      expect(doc.layout, ex.layout).toBe(ex.layout)
      expect(doc.raw, `${ex.layout} should be structured`).toBeUndefined()
      const html = serializeSlide(doc)
      expect(normalizeSlideHtml(html), ex.layout).toBe(html)
      expect(slideText(html), ex.layout).toBe(slideText(ex.example))
      // reading what was written gives the same document
      expect(parseSlide(html), ex.layout).toEqual(doc)
    }
  })
  it('keeps the words of the examples exactly where the markup is the catalogue\'s', () => {
    const cards = SLIDE_LAYOUTS.find((l) => l.layout === 'cards')!.example
    expect(serializeSlide(parseSlide(cards))).toBe(cards)
    const exercise = SLIDE_LAYOUTS.find((l) => l.layout === 'exercise')!.example
    expect(serializeSlide(parseSlide(exercise))).toBe(exercise)
    const model = SLIDE_LAYOUTS.find((l) => l.layout === 'model')!.example
    expect(serializeSlide(parseSlide(model))).toBe(model)
  })
  it('reads the parts', () => {
    const doc = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'cards')!.example)
    expect(doc.header?.title).toBe('Drei Arten von Feedback')
    expect(doc.options).toEqual({ cols: 3, numbered: true })
    expect(doc.cards?.map((c) => c.title)).toEqual(['Wertschätzung', 'Coaching', 'Bewertung'])
    expect(doc.source).toBe('Nach einem gängigen Feedbackmodell')
    const ex = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'exercise')!.example)
    expect(ex.header?.tag).toBe('Übung')
    expect(ex.steps?.length).toBe(3)
    expect(ex.facts).toEqual([
      { term: 'Dauer', value: '30 Minuten' },
      { term: 'Sozialform', value: 'Dreiergruppen' },
      { term: 'Material', value: 'Beobachtungsbogen' },
    ])
    const brk = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'break')!.example)
    expect(brk.text?.until).toBe('15 Minuten · **bis 10:45**')
  })
  it('keeps a body it does not understand as source, with header and footer as fields', () => {
    const html = '<section class="slide agenda"><header><h2>Tag 1</h2></header><ol class="blocks"><li><div class="head"><h3>Vormittag</h3><span class="when">09:00–12:30</span></div><p>Ankommen</p></li></ol><footer><span class="source">Stand gestern</span></footer></section>'
    const doc = parseSlide(html)
    expect(doc.raw).toContain('<ol class="blocks">')
    expect(doc.header?.title).toBe('Tag 1')
    expect(doc.source).toBe('Stand gestern')
    expect(doc.rows).toBeUndefined()
    const back = serializeSlide({ ...doc, header: { ...doc.header!, title: 'Tag 2' } })
    expect(back).toBe(html.replace('Tag 1', 'Tag 2'))
  })
  it('writes a title with a picture and a split with an svg', () => {
    const title = serializeSlide({ layout: 'title', options: {}, figure: { image: 'a'.repeat(16), alt: 'Bild', caption: '' }, text: { eyebrow: 'E', title: 'T', subtitle: 'S', meta: 'M', lead: '', big: '', sub: '', until: '', body: '' } })
    expect(title).toBe(`<section class="slide title"><figure><img src="asset:${'a'.repeat(16)}" alt="Bild"></figure><div class="text"><div class="eyebrow">E</div><h1>T</h1><p class="subtitle">S</p><p class="meta">M</p></div></section>`)
    const split = parseSlide('<section class="slide split"><header><h2>X</h2></header><div class="split figure-left"><div class="text"><h3>Kopf</h3><p>Absatz</p></div><figure><svg viewBox="0 0 10 10"><circle class="f-accent" cx="5" cy="5" r="4"></circle></svg><figcaption>Kreis</figcaption></figure></div></section>')
    expect(split.options).toEqual({ figureLeft: true })
    expect(split.svg).toContain('<circle')
    expect(split.blocks).toEqual([
      { kind: 'h3', text: 'Kopf' },
      { kind: 'p', text: 'Absatz' },
    ])
    expect(serializeSlide(split)).toContain('<figure><svg viewBox="0 0 10 10"><circle class="f-accent" cx="5" cy="5" r="4"></circle></svg><figcaption>Kreis</figcaption></figure>')
  })
  it('has a blank for every layout that survives the sanitiser', () => {
    for (const id of LAYOUT_IDS) {
      const html = serializeSlide(blankDoc(id, WORDS))
      expect(normalizeSlideHtml(html), id).toBe(html)
      expect(html.startsWith(`<section class="slide ${id}`), id).toBe(true)
      const doc = parseSlide(html)
      expect(doc.layout, id).toBe(id)
      expect(doc.raw, id).toBeUndefined()
    }
    expect(LAYOUTS.length).toBe(SLIDE_LAYOUTS.length)
  })
  it('carries content into another layout and says what does not fit', () => {
    const list = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'list')!.example)
    const cards = convertLayout(list, 'cards')
    expect(cards.lost).toEqual([])
    expect(cards.doc.header?.title).toBe('Regeln für heute')
    expect(cards.doc.cards?.map((c) => c.title)).toEqual(['Ausreden lassen', 'Ich-Botschaften', 'Handys bleiben in der Tasche'])
    expect(cards.doc.cards?.[1].text).toBe('„Ich habe bemerkt …“ statt „Du immer …“')
    const statement = convertLayout(list, 'statement')
    expect(statement.doc.text?.big).toBe('Regeln für heute')
    expect(statement.lost).toEqual(['items:3'])
    const matrix = convertLayout(parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'acronym')!.example), 'matrix')
    expect(matrix.lost).toEqual(['items:1'])
    expect(matrix.doc.matrix?.cells.map((c) => c.title)).toEqual(['Spezifisch', 'Messbar', 'Attraktiv', 'Realistisch'])
    const back = convertLayout(cards.doc, 'list')
    expect(back.doc.points?.map((p) => p.text)).toEqual(['**Ausreden lassen**', '**Ich-Botschaften** „Ich habe bemerkt …“ statt „Du immer …“', '**Handys bleiben in der Tasche**'])
  })
  it('names an element for every field', () => {
    const doc = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'matrix')!.example)
    const paths = fieldSelectors(doc).map((f) => f.path)
    expect(paths).toContain('header.title')
    expect(paths).toContain('matrix.cells.3')
    expect(paths).toContain('matrix.axisX')
  })
})
