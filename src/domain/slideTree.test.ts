import { describe, expect, it } from 'vitest'
import { inlineToText, parseTree, serializeNodes, textToInline } from './slideTree'

/** Markup → the editor's text → markup again. */
const text = (html: string) => inlineToText(parseTree(html))
const html = (t: string) => serializeNodes(textToInline(t))

describe('inline markup: formatting laid over the theme', () => {
  it('writes a span of formatting classes in brackets and reads it back', () => {
    const pairs: [string, string][] = [
      ['<span class="fs-l">Groß</span> und normal', '[Groß]{l} und normal'],
      ['Ein <span class="fs-xl c-accent-2">lautes</span> Wort', 'Ein [lautes]{xl accent-2} Wort'],
      ['<span class="fs-s muted">leise</span>', '[leise]{s muted}'],
      ['<span class="fw-normal">nicht fett</span>', '[nicht fett]{normal}'],
      ['<span class="fs-l accent">beides</span>', '[beides]{l accent}'],
      ['<span class="accent">Akzent</span>', '==Akzent=='],
      ['<span class="fs-l">groß mit <strong>fett</strong> darin</span>', '[groß mit **fett** darin]{l}'],
      ['<span class="fs-l">außen <span class="c-accent-3">innen</span></span>', '[außen [innen]{accent-3}]{l}'],
      ['<strong><em>beides</em></strong>', '***beides***'],
    ]
    for (const [markup, written] of pairs) {
      expect(text(markup), markup).toBe(written)
      expect(html(written), written).toBe(markup)
    }
  })
  it('writes bold and italic inside a word in brackets, where the stars do not count', () => {
    expect(text('Kolleg<em>innen</em>')).toBe('Kolleg[innen]{i}')
    expect(html('Kolleg[innen]{i}')).toBe('Kolleg<em>innen</em>')
    expect(text('<strong>Teil</strong>nehmer')).toBe('[Teil]{b}nehmer')
    expect(html('[Teil]{b}nehmer')).toBe('<strong>Teil</strong>nehmer')
    expect(text('ein <strong>ganzes</strong> Wort')).toBe('ein **ganzes** Wort')
    expect(html('[x]{b i l}')).toBe('<span class="fs-l"><strong><em>x</em></strong></span>')
  })
  it('leaves brackets that are no span as they are', () => {
    for (const t of ['siehe [1] und [2]', 'a [b] {c}', '[offen', 'zu] {l}', '[x]{unbekannt}', '[x]{}', '[]{l}', 'Liste [a, b]{constructor}']) {
      expect(html(t), t).toBe(t)
      // written back it may carry an escape ("[x\\]{…}"), and reads as the same text
      expect(html(text(html(t))), t).toBe(t)
    }
  })
  it('escapes a literal bracket that would be read as a span, and brackets inside an element', () => {
    expect(text('[x]{l}')).toBe('[x\\]{l}')
    expect(html('[x\\]{l}')).toBe('[x]{l}')
    expect(text('<span class="fs-l">a [b</span>')).toBe('[a \\[b]{l}')
    expect(html('[a \\[b]{l}')).toBe('<span class="fs-l">a [b</span>')
    expect(text('<strong>[1]</strong> Quelle')).toBe('**\\[1\\]** Quelle')
    expect(html('**\\[1\\]** Quelle')).toBe('<strong>[1]</strong> Quelle')
    expect(text('vor [a <span class="fs-l">b</span> c] nach')).toBe('vor [a [b]{l} c] nach')
    expect(html('vor [a [b]{l} c] nach')).toBe('vor [a <span class="fs-l">b</span> c] nach')
    expect(text('ein \\[ bleibt')).toBe('ein \\\\[ bleibt')
    expect(html('ein \\\\[ bleibt')).toBe('ein \\[ bleibt')
  })
  it('keeps what was there before: stars, accents, gender stars', () => {
    for (const t of ['**fett** und *kursiv* und ==Akzent==', 'Teilnehmer*innen und Kolleg*innen', '2 * 3 = 6, a==b', '`code` bleibt']) expect(text(html(t)), t).toBe(t)
    expect(text('<span class="tag">x</span>')).toBe('x')
  })
})
