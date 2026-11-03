import { describe, expect, it } from 'vitest'
import { SLIDE_LAYOUTS } from './slideFormat.ts'
import { normalizeSlideHtml, slideText } from './slides.ts'
import { blankDoc, convertLayout, fieldSelectors, LAYOUT_IDS, LAYOUTS, parseSlide, sameContent, serializeSlide } from './slideDoc.ts'
import { deckOf } from './deck.ts'
import type { WorkshopState } from './types.ts'
import { inlineToText, parseTree, serializeNodes, textToInline } from './slideTree.ts'

const WORDS = { title: 'Überschrift', text: 'Text', point: 'Punkt', lead: 'Einleitung', step: 'Schritt', quote: 'Zitat', cite: 'Quelle', eyebrow: 'Kicker', letter: 'A', term: 'Begriff', value: 'Wert', when: 'bis 10:45', axis: 'Achse', caption: 'Bildunterschrift' }

describe('slide tree', () => {
  it('keeps gender stars, a==b and arithmetic as they are, and escapes markers only where they would count', () => {
    const cases: [string, string][] = [
      ['Liebe Teilnehmer*innen und Kolleg*innen', 'Liebe Teilnehmer*innen und Kolleg*innen'],
      ['Mitarbeiter*in', 'Mitarbeiter*in'],
      ['a==b==c', 'a==b==c'],
      ['2 * 3 * 4', '2 * 3 * 4'],
      ['x == y', 'x == y'],
      ['*Hinweis* als Text', '\\*Hinweis\\* als Text'],
      ['Preis* gilt nur *heute', 'Preis\\* gilt nur \\*heute'],
      ['<strong>Teilnehmer*innen</strong> sind da', '**Teilnehmer*innen** sind da'],
      ['<em>fett <strong>und</strong> kursiv</em>', '*fett **und** kursiv*'],
    ]
    for (const [html, text] of cases) {
      expect(inlineToText(parseTree(html)), html).toBe(text)
      expect(serializeNodes(textToInline(text)), html).toBe(html)
    }
  })
  it('reads whitespace in markup as HTML does: no line break from a line break in the source', () => {
    expect(inlineToText(parseTree('Zeile\n   und weiter'))).toBe('Zeile und weiter')
    expect(inlineToText(parseTree('a<strong> X </strong>b'))).toBe('a **X** b')
  })
  it('turns typed gender stars into text, not italics', () => {
    expect(serializeNodes(textToInline('Teilnehmer*innen und Kolleg*innen'))).toBe('Teilnehmer*innen und Kolleg*innen')
    expect(serializeNodes(textToInline('*kursiv* und **fett**'))).toBe('<em>kursiv</em> und <strong>fett</strong>')
  })
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
      { term: 'Format', value: 'Dreiergruppen' },
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
  it('never changes a slide it opens: what the fields cannot hold stays source', () => {
    const asset = '0123456789abcdef'
    const slides: [string, 'fields' | 'body' | 'whole'][] = [
      ['<section class="slide list"><header><h2>Liebe Teilnehmer*innen</h2></header><ul class="list"><li>Mitarbeiter*innen</li></ul></section>', 'fields'],
      ['<section class="slide agenda"><header><h2>Agenda <small>1/2</small></h2></header><ol class="agenda"><li><span class="when">09:00</span><span>A</span></li></ol></section>', 'fields'],
      [`<section class="slide model"><header><h2>M</h2></header><figure class="model"><img src="asset:${asset}" alt="x"><figcaption>c</figcaption></figure></section>`, 'fields'],
      ['<section class="slide canvas"><header><h2>C</h2></header><div class="canvas cols-3"><div class="box"><h3>B</h3><ul class="list"><li>q</li></ul></div></div></section>', 'fields'],
      [`<section class="slide cards"><ul class="cards cols-3"><li><img class="icon" src="asset:${asset}" alt="Ein Bild"><h3>T</h3></li></ul></section>`, 'fields'],
      ['<section class="slide table"><table><tbody><tr><th>Zeile</th><td>v</td></tr></tbody></table></section>', 'fields'],
      ['<section class="slide cards">\n  <header>\n    <h2>Drei Arten</h2>\n  </header>\n  <ul class="cards numbered">\n    <li><h3>A</h3><p>Text über\n      zwei Zeilen</p></li>\n  </ul>\n</section>', 'fields'],
      ['<section class="slide closing"><div class="logo"></div><h1>Danke</h1><p class="sub">bis bald</p></section>', 'body'],
      ['<section class="slide list"><header><h2>Titel <small>1/2</small></h2><p>Hinweis</p></header><ul class="list"><li>a</li></ul></section>', 'whole'],
      ['<section class="slide list"><header><h2>Kolleg<em>innen</em></h2></header><ul class="list"><li>a</li></ul></section>', 'whole'],
      ['<section class="slide list"><header><h2>CO<sub>2</sub></h2></header><ul class="list"><li>a</li></ul></section>', 'whole'],
    ]
    for (const [html, mode] of slides) {
      const doc = parseSlide(html)
      expect(doc.raw === undefined ? 'fields' : doc.whole ? 'whole' : 'body', html).toBe(mode)
      expect(sameContent(html, serializeSlide(doc)), html).toBe(true)
    }
    // an edit through the fields changes only that field
    const doc = parseSlide(slides[0][0])
    doc.points![0].text = 'Alle Teilnehmer*innen, auch Gäst*innen'
    expect(normalizeSlideHtml(serializeSlide(doc))).toBe('<section class="slide list"><header><h2>Liebe Teilnehmer*innen</h2></header><ul class="list"><li>Alle Teilnehmer*innen, auch Gäst*innen</li></ul></section>')
  })
  it('reads the slides the app generates as fields', () => {
    const state = {
      workshop: { id: 'w', title: 'Teamtag', client: 'Beispiel GmbH', location: 'Bonn', theme: '' },
      days: [{ id: 'd', workshopId: 'w', position: 1, date: '2026-11-10', startMin: 540, endMin: 1020 }],
      groups: [],
      items: Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, workshopId: 'w', dayId: 'd', position: i + 1, groupId: null, kind: i === 3 ? 'break' : 'block', title: `Punkt ${i}`, description: '', duration: 30, fixedStart: null, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], slides: [], categoryId: null, color: null })),
      attachments: [],
    } as unknown as WorkshopState
    const labels = { untitled: 'x', day: (n: number) => `Tag ${n}`, agenda: 'Agenda', breakTitle: 'Pause', until: (t: string) => `bis ${t}`, minutes: (n: number) => `${n} Minuten`, date: (d: string) => d }
    for (const s of deckOf(state, labels)) {
      const doc = parseSlide(s.html)
      expect(doc.raw, s.key).toBeUndefined()
      expect(sameContent(s.html, serializeSlide(doc)), s.key).toBe(true)
    }
  })
  it('carries card pictures to cards and names them as lost elsewhere', () => {
    const doc = parseSlide('<section class="slide cards"><header><h2>T</h2></header><ul class="cards cols-2"><li><img class="icon" src="asset:0123456789abcdef" alt="Bild"><h3>A</h3></li><li><h3>B</h3></li></ul></section>')
    expect(convertLayout(doc, 'steps').lost).toEqual(['images:1'])
    const quote = parseSlide('<section class="slide quote"><blockquote><p>Q</p></blockquote><cite>Wer</cite></section>')
    expect(convertLayout({ ...quote, source: 'Buch' }, 'statement').lost).toContain('other')
  })
  it('reads and writes the takeaway next to the source', () => {
    const html = '<section class="slide list"><header><h2>Regeln</h2></header><ul class="list"><li>Ausreden lassen</li></ul><footer><span class="takeaway">Zuhören ist die halbe Regel</span><span class="source">Eigene Praxis</span></footer></section>'
    const doc = parseSlide(html)
    expect(doc.takeaway).toBe('Zuhören ist die halbe Regel')
    expect(doc.source).toBe('Eigene Praxis')
    expect(serializeSlide(doc)).toBe(html)
    const only = parseSlide('<section class="slide list"><ul class="list"><li>A</li></ul><footer><span class="takeaway">Merke</span></footer></section>')
    expect(only.takeaway).toBe('Merke')
    expect(only.source).toBe('')
  })
  it('names an element for every field', () => {
    const doc = parseSlide(SLIDE_LAYOUTS.find((l) => l.layout === 'matrix')!.example)
    const paths = fieldSelectors(doc).map((f) => f.path)
    expect(paths).toContain('header.title')
    expect(paths).toContain('matrix.cells.3')
    expect(paths).toContain('matrix.axisX')
  })
})
